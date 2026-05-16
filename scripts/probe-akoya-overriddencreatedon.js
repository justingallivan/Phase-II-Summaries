#!/usr/bin/env node
/**
 * Gated-step-1 RESIDUAL probe (READ-ONLY): close the `overriddencreatedon`
 * true-origin-marker question that probe-akoya-request-discriminators.js left
 * inconclusive.
 *
 * Why a follow-up: that probe counted migrated rows with
 *   /akoya_requests/$count?$filter=overriddencreatedon ne null
 * which is the SAME OData `$count` primitive the same probe proved caps
 * silently at 5,000 (true total ~25,561). So the migrated-row count was
 * measured with the broken instrument => "inconclusive". This script uses
 * FetchXML aggregate counts only (the honest-total path the design now
 * mandates as a Track B correctness invariant) to deterministically pin the
 * Akoya-native vs. migrated era boundary.
 *
 * FetchXML aggregate has a 50k *scanned-record* processing cap; akoya_request
 * is ~25,561 total (well under 50k), so a full-table count aggregate is safe
 * (the prior probe already ran whole-table group-by aggregates successfully).
 *
 * Only POST is the OAuth token; every Dataverse call is a GET.
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
      grant_type: 'client_credentials', client_id: clientId,
      client_secret: secret, scope: `${resource}/.default`,
    }),
  });
  if (!res.ok) throw new Error(`Token: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function get(token, urlPath) {
  const url = `${process.env.DYNAMICS_URL}/api/data/v9.2${urlPath}`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`, Accept: 'application/json',
      'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
      Prefer: 'odata.include-annotations="*"',
    },
  });
  const t = await r.text();
  let body; try { body = JSON.parse(t); } catch { body = t; }
  return { status: r.status, ok: r.ok, body };
}

function short(v, n = 240) {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// FetchXML aggregate COUNT with an optional <filter> block.
async function aggCount(token, filterXml = '', label = '') {
  const fx =
    `<fetch aggregate="true"><entity name="akoya_request">` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
    `${filterXml}</entity></fetch>`;
  const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
  if (!r.ok) {
    console.log(`   ${label}: [${r.status}] ${short(r.body)}`);
    return null;
  }
  const c = r.body.value && r.body.value[0] && r.body.value[0].c;
  console.log(`   ${label}: ${c}`);
  return typeof c === 'number' ? c : Number(c);
}

(async () => {
  const token = await getToken();
  console.log('Token acquired.\n');

  // 1. Cross-check true total via FetchXML aggregate (NOT $count).
  console.log('── true totals (FetchXML aggregate — not $count) ──');
  const total = await aggCount(token, '', 'akoya_request total rows');
  const withMarker = await aggCount(
    token,
    `<filter><condition attribute="overriddencreatedon" operator="not-null"/></filter>`,
    'rows WITH overriddencreatedon (migrated/imported marker)',
  );
  const withoutMarker = await aggCount(
    token,
    `<filter><condition attribute="overriddencreatedon" operator="null"/></filter>`,
    'rows WITHOUT overriddencreatedon (Akoya-native marker)',
  );
  if (total != null && withMarker != null && withoutMarker != null) {
    const pct = ((withMarker / total) * 100).toFixed(1);
    console.log(`\n   => migrated marker covers ${withMarker}/${total} (${pct}%); ` +
      `null+notnull = ${withMarker + withoutMarker} (should equal total ${total})`);
  }
  console.log();

  // 2. True historical era of the migrated cohort: overriddencreatedon by year.
  //    (Non-null only — this is the *original* date the migration preserved,
  //     uncollapsed, unlike createdon which the bulk import flattened to ~2023.)
  async function yearDistro(attr, label) {
    const fx =
      `<fetch aggregate="true"><entity name="akoya_request">` +
      `<attribute name="${attr}" alias="y" groupby="true" dategrouping="year"/>` +
      `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
      `</entity></fetch>`;
    const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
    console.log(`── ${label} (${attr}) by year ──`);
    if (!r.ok) { console.log(`   [${r.status}] ${short(r.body)}\n`); return; }
    const rows = (r.body.value || []).map(x => ({ y: x.y, c: x.c }))
      .sort((a, b) => String(a.y).localeCompare(String(b.y)));
    let nonNull = 0;
    for (const row of rows) {
      console.log(`   ${row.y == null ? '(null)' : row.y}: ${row.c}`);
      if (row.y != null) nonNull += Number(row.c) || 0;
    }
    console.log(`   [non-null subtotal: ${nonNull}]\n`);
  }
  await yearDistro('overriddencreatedon', 'true original era (migration-preserved)');
  await yearDistro('createdon', 'system create (bulk-import-collapsed proxy)');

  // 3. Boundary cross-tab: among rows created in the 2023 bulk-import spike,
  //    how many carry the migrated marker? Confirms createdon=2023 == migrated.
  console.log('── boundary cross-tab: createdon-2023 spike vs. migrated marker ──');
  await aggCount(
    token,
    `<filter type="and">` +
    `<condition attribute="createdon" operator="on-or-after" value="2023-01-01"/>` +
    `<condition attribute="createdon" operator="on-or-before" value="2023-12-31"/>` +
    `<condition attribute="overriddencreatedon" operator="not-null"/>` +
    `</filter>`,
    'createdon in 2023 AND has overriddencreatedon (migrated)',
  );
  await aggCount(
    token,
    `<filter type="and">` +
    `<condition attribute="createdon" operator="on-or-after" value="2023-01-01"/>` +
    `<condition attribute="createdon" operator="on-or-before" value="2023-12-31"/>` +
    `<condition attribute="overriddencreatedon" operator="null"/>` +
    `</filter>`,
    'createdon in 2023 AND no overriddencreatedon (native-in-2023)',
  );
  await aggCount(
    token,
    `<filter type="and">` +
    `<condition attribute="createdon" operator="on-or-after" value="2024-01-01"/>` +
    `<condition attribute="overriddencreatedon" operator="not-null"/>` +
    `</filter>`,
    'createdon >= 2024 AND has overriddencreatedon (migrated-after-cutover — should be ~0)',
  );

  console.log('\nDone (read-only overriddencreatedon residual probe).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
