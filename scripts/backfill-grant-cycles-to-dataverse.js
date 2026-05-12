#!/usr/bin/env node
/**
 * W3 step 4 — idempotent backfill of Postgres `grant_cycles` into
 * `wmkf_appgrantcycle`. Keyed on `wmkf_shortcode` alt-key.
 *
 * Policy (locked S147):
 *   - Dry-run by default; pass `--commit` to write.
 *   - Per-row decision: create | update | skip | overwrite-required.
 *   - For UPDATE: patch only Dataverse fields that are null/empty by
 *     default. Non-null differing fields require `--overwrite` (or report
 *     as "overwrite-required" in dry-run).
 *   - Skips the archived-duplicate rows (short_code matches `<code>x<id>`
 *     from the W3 step 2a collapse) — those are pure collision-resolution
 *     artifacts with no meaningful content. Pass `--include-archived` to
 *     backfill them anyway.
 *   - Normalizes `wmkf_shortcode` to trimmed-uppercase before write
 *     (Codex S147 step-3 Q3 contract: do not rely on Dataverse to
 *     normalize alt-key values).
 *   - Re-runnable: a clean run after a partial-failure run produces the
 *     same final state (two-run idempotency property required by plan
 *     §"Acceptance tests").
 *
 * Deliberate omissions (Codex S147 step-4 review):
 *   - `wmkf_fiscalyearcode` and `wmkf_meetingdate` are NOT populated from
 *     Postgres — those derive from `akoya_request.akoya_fiscalyear` and
 *     `akoya_request.wmkf_meetingdate` respectively, joined per cycle.
 *     Step 5 (endpoint rewrite) owns the fiscal-year-code population pass.
 *     Until then the `wmkf_fiscalyearcode` alt-key is effectively unused
 *     (all rows have it null; Dataverse permits multi-null on a nullable
 *     alt-key).
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

const COMMIT = process.argv.includes('--commit');
const OVERWRITE = process.argv.includes('--overwrite');
const INCLUDE_ARCHIVED = process.argv.includes('--include-archived');

const ARCHIVED_PATTERN = /^[A-Z]\d{2}x\d+$/i; // e.g. D26x11

async function getToken() {
  const r = await fetch(`https://login.microsoftonline.com/${process.env.DYNAMICS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.DYNAMICS_CLIENT_ID,
      client_secret: process.env.DYNAMICS_CLIENT_SECRET,
      scope: `${process.env.DYNAMICS_URL}/.default`,
    }),
  });
  if (!r.ok) throw new Error(`Token: ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}

const ODATA_HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'OData-MaxVersion': '4.0',
  'OData-Version': '4.0',
});

async function odataGet(token, urlPath) {
  const r = await fetch(`${process.env.DYNAMICS_URL}/api/data/v9.2${urlPath}`, {
    headers: ODATA_HEADERS(token),
  });
  return { status: r.status, body: r.ok ? await r.json() : await r.text() };
}

async function odataPost(token, urlPath, body) {
  const r = await fetch(`${process.env.DYNAMICS_URL}/api/data/v9.2${urlPath}`, {
    method: 'POST',
    headers: { ...ODATA_HEADERS(token), Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: r.ok ? await r.json() : await r.text() };
}

async function odataPatch(token, urlPath, body) {
  const r = await fetch(`${process.env.DYNAMICS_URL}/api/data/v9.2${urlPath}`, {
    method: 'PATCH',
    headers: ODATA_HEADERS(token),
    body: JSON.stringify(body),
  });
  return { status: r.status, body: r.ok ? null : await r.text() };
}

function normalizeShortCode(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().toUpperCase();
  return s || null;
}

// OData v4 escapes apostrophes in string literals by doubling them, NOT by
// percent-encoding. `encodeURIComponent` alone is insufficient for values
// that may contain `'`. All current cycle codes are alphanumeric, but the
// future-safe form is double-then-encode (Codex S147 step-4 Q3).
function escapeODataString(s) {
  return encodeURIComponent(String(s).replace(/'/g, "''"));
}

function isEmpty(v) {
  return v === null || v === undefined || v === '';
}

function mapToDataverse(pgRow) {
  const shortcode = normalizeShortCode(pgRow.short_code);
  return {
    wmkf_shortcode: shortcode,
    wmkf_displayname: pgRow.name || null,
    wmkf_programname: pgRow.program_name || null,
    wmkf_summarypages: pgRow.summary_pages || null,
    wmkf_reviewreturndeadline: pgRow.review_deadline
      ? new Date(pgRow.review_deadline).toISOString().slice(0, 10)
      : null,
    wmkf_reviewtemplateurl: pgRow.review_template_blob_url || null,
    wmkf_reviewtemplatefilename: pgRow.review_template_filename || null,
    wmkf_additionalattachments:
      pgRow.additional_attachments != null ? JSON.stringify(pgRow.additional_attachments) : null,
    wmkf_customfields: pgRow.custom_fields != null ? JSON.stringify(pgRow.custom_fields) : null,
    // Preserve null when Postgres null (column is BOOLEAN DEFAULT true, not
    // NOT NULL). Don't actively write `false` for null source values.
    wmkf_isactive: pgRow.is_active === null || pgRow.is_active === undefined ? null : pgRow.is_active === true,
  };
}

async function findByShortCode(token, shortcode) {
  // Use the alt-key syntax: /wmkf_appgrantcycles(wmkf_shortcode='J26')
  const r = await odataGet(
    token,
    `/wmkf_appgrantcycles(wmkf_shortcode='${escapeODataString(shortcode)}')`,
  );
  if (r.status === 200) return r.body;
  if (r.status === 404) return null;
  throw new Error(`alt-key lookup ${shortcode}: ${r.status} ${r.body}`);
}

function diffFields(targetDv, existingDv) {
  // For each non-null target field, classify against existing:
  //   - existing empty → patchable
  //   - existing non-null and equal → already-correct
  //   - existing non-null and different → overwrite-required
  const patchable = {};
  const alreadyCorrect = [];
  const overwriteRequired = [];

  for (const [k, v] of Object.entries(targetDv)) {
    if (v === null || v === undefined) continue; // never overwrite with null
    const existingVal = existingDv[k];
    if (isEmpty(existingVal)) {
      patchable[k] = v;
    } else if (existingVal === v) {
      alreadyCorrect.push(k);
    } else {
      overwriteRequired.push({ field: k, existing: existingVal, target: v });
    }
  }
  return { patchable, alreadyCorrect, overwriteRequired };
}

(async () => {
  console.log(`# Grant cycle Postgres → Dataverse backfill`);
  console.log(`Mode: ${COMMIT ? 'COMMIT' : 'DRY-RUN'}${OVERWRITE ? ' (with --overwrite)' : ''}${INCLUDE_ARCHIVED ? ' (with --include-archived)' : ''}`);
  console.log(`Generated: ${new Date().toISOString()}\n`);

  const { sql } = await import('@vercel/postgres');
  const { rows } = await sql`SELECT * FROM grant_cycles ORDER BY short_code, id`;
  console.log(`Loaded ${rows.length} grant_cycles rows from Postgres.\n`);

  const token = await getToken();

  let nCreate = 0, nUpdate = 0, nSkipArchived = 0, nAlready = 0, nOverwriteRequired = 0, nErrors = 0, nSkipNoShortcode = 0;

  for (const pg of rows) {
    const tag = `id=${pg.id} short_code=${pg.short_code}`;

    if (!INCLUDE_ARCHIVED && ARCHIVED_PATTERN.test(pg.short_code)) {
      console.log(`SKIP-ARCHIVED  ${tag}  (collapse artifact; pass --include-archived to override)`);
      nSkipArchived++;
      continue;
    }

    const target = mapToDataverse(pg);
    if (!target.wmkf_shortcode) {
      console.log(`SKIP-NO-SHORTCODE  ${tag}  (refuses to write null alt-key)`);
      nSkipNoShortcode++;
      continue;
    }

    let existing;
    try {
      existing = await findByShortCode(token, target.wmkf_shortcode);
    } catch (e) {
      console.log(`ERROR-LOOKUP  ${tag}  ${e.message}`);
      nErrors++;
      continue;
    }

    if (!existing) {
      // CREATE path
      if (!COMMIT) {
        console.log(`WOULD-CREATE  ${tag}  fields=${Object.keys(target).filter(k => !isEmpty(target[k])).length}`);
        nCreate++;
        continue;
      }
      const createBody = Object.fromEntries(Object.entries(target).filter(([, v]) => v !== null && v !== undefined));
      const r = await odataPost(token, '/wmkf_appgrantcycles', createBody);
      if (r.status >= 200 && r.status < 300) {
        console.log(`CREATE  ${tag}  ✓ ${r.body?.wmkf_appgrantcycleid}`);
        nCreate++;
      } else {
        console.log(`ERROR-CREATE  ${tag}  ${r.status} ${r.body}`);
        nErrors++;
      }
      continue;
    }

    // UPDATE path
    const diff = diffFields(target, existing);
    const dvId = existing.wmkf_appgrantcycleid;

    if (Object.keys(diff.patchable).length === 0 && diff.overwriteRequired.length === 0) {
      console.log(`ALREADY-CORRECT  ${tag}  dvId=${dvId.slice(0, 8)}…`);
      nAlready++;
      continue;
    }

    if (diff.overwriteRequired.length > 0 && !OVERWRITE) {
      console.log(`OVERWRITE-REQUIRED  ${tag}  fields=${diff.overwriteRequired.map(o => o.field).join(',')}`);
      for (const o of diff.overwriteRequired) {
        console.log(`    ${o.field}: existing=${JSON.stringify(o.existing).slice(0, 80)} target=${JSON.stringify(o.target).slice(0, 80)}`);
      }
      nOverwriteRequired++;
      // Still attempt the patchable subset below
    }

    const patchBody = { ...diff.patchable };
    if (OVERWRITE) {
      for (const o of diff.overwriteRequired) patchBody[o.field] = o.target;
    }

    if (Object.keys(patchBody).length === 0) {
      // Nothing to do — overwrite-required without flag
      continue;
    }

    if (!COMMIT) {
      console.log(`WOULD-UPDATE  ${tag}  fields=${Object.keys(patchBody).join(',')}`);
      nUpdate++;
      continue;
    }

    const r = await odataPatch(token, `/wmkf_appgrantcycles(${dvId})`, patchBody);
    if (r.status >= 200 && r.status < 300) {
      console.log(`UPDATE  ${tag}  ✓ fields=${Object.keys(patchBody).join(',')}`);
      nUpdate++;
    } else {
      console.log(`ERROR-UPDATE  ${tag}  ${r.status} ${r.body}`);
      nErrors++;
    }
  }

  console.log('\n## Summary');
  console.log(`- create:              ${nCreate}`);
  console.log(`- update:              ${nUpdate}`);
  console.log(`- already-correct:     ${nAlready}`);
  console.log(`- overwrite-required:  ${nOverwriteRequired}`);
  console.log(`- skip-archived:       ${nSkipArchived}`);
  console.log(`- skip-no-shortcode:   ${nSkipNoShortcode}`);
  console.log(`- errors:              ${nErrors}`);

  if (nErrors > 0) process.exitCode = 1;
  if (!COMMIT) console.log('\nDRY-RUN — re-run with --commit to apply.');
})().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(2);
});
