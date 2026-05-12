#!/usr/bin/env node
/**
 * W3 preflight (Codex S147): duplicate-domain audit for grant cycle shortcodes.
 *
 * Enumerates the union of:
 *   - Postgres `grant_cycles.short_code` (active + inactive)
 *   - Dataverse `wmkf_appreviewersuggestion.wmkf_grantcyclecode` distinct values
 *
 * Reports collisions that would block adding the `wmkf_shortcode` alt-key to
 * `wmkf_appgrantcycle`, and surfaces any code referenced by suggestions but
 * absent from `grant_cycles` (orphan codes — would have no row to resolve to
 * after migration).
 *
 * Read-only. Run BEFORE the schema patch.
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let [, k, v] = m;
    v = v.trim().replace(/^"(.*)"$/, '$1');
    if (!process.env[k]) process.env[k] = v;
  }
}

async function getToken() {
  const tenant = process.env.DYNAMICS_TENANT_ID;
  const clientId = process.env.DYNAMICS_CLIENT_ID;
  const secret = process.env.DYNAMICS_CLIENT_SECRET;
  const resource = process.env.DYNAMICS_URL;
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: secret,
      scope: `${resource}/.default`,
    }),
  });
  if (!res.ok) throw new Error(`Token: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function odataGet(token, urlPath) {
  const url = `${process.env.DYNAMICS_URL}/api/data/v9.2${urlPath}`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Prefer: 'odata.maxpagesize=5000',
    },
  });
  if (!r.ok) throw new Error(`OData ${urlPath}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function loadPostgresCycles() {
  const { sql } = await import('@vercel/postgres');
  const { rows } = await sql`
    SELECT id, short_code, name, is_active, created_at, updated_at
    FROM grant_cycles
    ORDER BY short_code, id
  `;
  return rows;
}

async function loadDataverseSuggestionCodes(token) {
  // Page through all suggestions selecting only the cycle-code field.
  // Build a frequency map of distinct codes.
  const counts = new Map();
  let nextPath = `/wmkf_appreviewersuggestions?$select=wmkf_grantcyclecode`;
  let pages = 0;
  while (nextPath) {
    const body = await odataGet(token, nextPath);
    pages++;
    for (const row of body.value || []) {
      const code = row.wmkf_grantcyclecode || '(null)';
      counts.set(code, (counts.get(code) || 0) + 1);
    }
    const next = body['@odata.nextLink'];
    if (!next) break;
    // nextLink is absolute; reduce to relative path for our odataGet helper.
    nextPath = next.replace(`${process.env.DYNAMICS_URL}/api/data/v9.2`, '');
  }
  return { counts, pages };
}

async function loadDataverseGrantCycleRows(token) {
  // Live wmkf_appgrantcycles rows — plan claims 0 but verify.
  const body = await odataGet(
    token,
    '/wmkf_appgrantcycles?$select=wmkf_appgrantcycleid,wmkf_displayname,wmkf_fiscalyearcode,wmkf_isactive',
  );
  return body.value || [];
}

function analyze(pgRows, suggestionCounts, dvCycleRows) {
  // Postgres internal duplicates (same short_code on multiple rows)
  const pgByCode = new Map();
  for (const r of pgRows) {
    const code = r.short_code;
    if (!pgByCode.has(code)) pgByCode.set(code, []);
    pgByCode.get(code).push(r);
  }
  const pgDuplicates = [...pgByCode.entries()].filter(([, rows]) => rows.length > 1);

  // Codes referenced by Dataverse suggestions
  const dvCodes = new Set(suggestionCounts.keys());
  dvCodes.delete('(null)');

  // Orphan codes: referenced by suggestions but no row in Postgres grant_cycles
  const pgCodes = new Set(pgRows.map(r => r.short_code));
  const orphans = [...dvCodes].filter(c => !pgCodes.has(c));

  // Postgres-only codes (no suggestions reference them — fine, but report)
  const unreferenced = [...pgCodes].filter(c => !dvCodes.has(c));

  return { pgByCode, pgDuplicates, dvCodes, orphans, unreferenced, dvCycleRows };
}

function report({ pgRows, suggestionCounts, suggestionPages, analysis }) {
  const ts = new Date().toISOString();
  console.log(`# Grant cycle shortcode domain audit\nGenerated: ${ts}\n`);

  console.log(`## Postgres \`grant_cycles\` rows (${pgRows.length})\n`);
  console.log('| id | short_code | name | is_active | created_at |');
  console.log('|---|---|---|---|---|');
  for (const r of pgRows) {
    console.log(
      `| ${r.id} | \`${r.short_code}\` | ${r.name} | ${r.is_active} | ${r.created_at?.toISOString?.() || r.created_at} |`,
    );
  }
  console.log('');

  console.log(`## Dataverse \`wmkf_appgrantcycles\` rows (${analysis.dvCycleRows.length})\n`);
  if (analysis.dvCycleRows.length === 0) {
    console.log('_(none — plan claim verified)_\n');
  } else {
    console.log('| id | displayname | fiscalyearcode | isactive |');
    console.log('|---|---|---|---|');
    for (const r of analysis.dvCycleRows) {
      console.log(
        `| ${r.wmkf_appgrantcycleid} | ${r.wmkf_displayname} | ${r.wmkf_fiscalyearcode || '—'} | ${r.wmkf_isactive} |`,
      );
    }
    console.log('');
  }

  console.log(`## Distinct \`wmkf_grantcyclecode\` values in suggestions (${analysis.dvCodes.size + (suggestionCounts.has('(null)') ? 1 : 0)} including null, scanned ${suggestionPages} page(s))\n`);
  console.log('| code | suggestion count |');
  console.log('|---|---|');
  const sorted = [...suggestionCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [code, count] of sorted) {
    console.log(`| \`${code}\` | ${count} |`);
  }
  console.log('');

  console.log(`## Findings\n`);

  // Postgres internal duplicates
  if (analysis.pgDuplicates.length === 0) {
    console.log('- **Postgres internal duplicates:** NONE — no `short_code` appears on multiple `grant_cycles` rows.');
  } else {
    console.log('- **Postgres internal duplicates (BLOCKS alt-key add until collapsed):**');
    for (const [code, rows] of analysis.pgDuplicates) {
      console.log(`  - \`${code}\` appears on ${rows.length} rows: ${rows.map(r => `id=${r.id} active=${r.is_active}`).join(', ')}`);
    }
  }

  // Orphans
  if (analysis.orphans.length === 0) {
    console.log('- **Orphan suggestion codes (referenced but no `grant_cycles` row):** NONE.');
  } else {
    console.log(`- **Orphan suggestion codes (referenced but no \`grant_cycles\` row, ${analysis.orphans.length} found):**`);
    for (const code of analysis.orphans) {
      console.log(`  - \`${code}\` (${suggestionCounts.get(code)} suggestions)`);
    }
  }

  // Unreferenced
  if (analysis.unreferenced.length > 0) {
    console.log(`- **Postgres codes with zero suggestions (informational, ${analysis.unreferenced.length}):** ${analysis.unreferenced.map(c => `\`${c}\``).join(', ')}`);
  }

  // Null cycle code on suggestions
  if (suggestionCounts.has('(null)')) {
    console.log(`- **Suggestions with null \`wmkf_grantcyclecode\`:** ${suggestionCounts.get('(null)')} rows. These are the "unassigned candidate" set the plan covers; not a blocker.`);
  }

  console.log('');
  console.log('## Collapse-strategy recommendation\n');
  if (analysis.pgDuplicates.length === 0 && analysis.orphans.length === 0) {
    console.log('**No collapse needed.** Proceed to schema patch (add 3 fields + `wmkf_shortcode` alt-key to `wmkf_app_grant_cycle.json`).');
  } else {
    if (analysis.pgDuplicates.length > 0) {
      console.log('**Postgres duplicates must be collapsed before adding `wmkf_shortcode` alt-key.** Suggested approach per duplicate set:');
      console.log('1. If exactly one row is `is_active=true` and others are `is_active=false`: keep the active row, archive duplicates by renaming their `short_code` to `<code>-archived-<id>` before alt-key add.');
      console.log('2. If multiple `is_active=true` rows share a code: this is a data error — decide which is canonical based on `created_at` / suggestion-reference count, deactivate the others, then rename.');
      console.log('3. Re-run this audit after collapse; alt-key add only proceeds when this section reports NONE.');
    }
    if (analysis.orphans.length > 0) {
      console.log('**Orphan suggestion codes need triage:** each represents a cycle that suggestions reference but `grant_cycles` lacks. Options:');
      console.log('1. Create a stub `grant_cycles` row (with `is_active=false`) so the alt-key resolution works post-migration.');
      console.log('2. NULL out `wmkf_grantcyclecode` on the orphan suggestions (loses cycle attribution).');
      console.log('3. Decide per orphan code based on suggestion count and recency.');
    }
  }
}

(async () => {
  console.error('Loading Postgres grant_cycles...');
  const pgRows = await loadPostgresCycles();
  console.error(`  ${pgRows.length} rows`);

  console.error('Acquiring Dataverse token...');
  const token = await getToken();

  console.error('Loading distinct wmkf_grantcyclecode from suggestions...');
  const { counts: suggestionCounts, pages: suggestionPages } = await loadDataverseSuggestionCodes(token);
  console.error(`  ${suggestionCounts.size} distinct codes across ${suggestionPages} page(s)`);

  console.error('Loading current wmkf_appgrantcycles rows...');
  const dvCycleRows = await loadDataverseGrantCycleRows(token);
  console.error(`  ${dvCycleRows.length} rows`);

  const analysis = analyze(pgRows, suggestionCounts, dvCycleRows);
  console.error('');
  report({ pgRows, suggestionCounts, suggestionPages, analysis });

  // Exit code: non-zero if duplicates or orphans found (gates downstream work).
  if (analysis.pgDuplicates.length > 0 || analysis.orphans.length > 0) {
    process.exitCode = 1;
  }
})().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(2);
});
