#!/usr/bin/env node
/**
 * Puzzle 1 test (READ-ONLY): does the B-structural gap (akoya_request /
 * akoya_expenses ~100% migrated, ~47% native) dissolve once you split by
 * wmkf_request_type?
 *
 * User hypothesis (S157): "Concept" requests live as akoya_request rows but
 * are feedback-only (submit docs, ask for feedback) — no budget. So native's
 * low fill rate is a request-TYPE-mix artifact, not a data discontinuity.
 *
 * Predictions if true:
 *   - native  Request  → high akoya_request%   (real money asks)
 *   - native  Concept  → ~0%                   (feedback-only)
 *   - interaction logs (Office/Site Visit, Phone Call) → ~0% (not asks)
 * Bonus (tests the "migration backfill" hypothesis #1 simultaneously):
 *   - migrated Concept → ~100%  ⇒ import backfilled no-budget rows
 *                                  (migrated-100% is an artifact; native honest)
 *   - migrated Concept → ~0%    ⇒ migrated honest; any residual gap among
 *                                  true Requests is the real puzzle
 *
 * Per-(cohort × type) exact FetchXML aggregate counts. No $count.
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

const MIG = `<condition attribute="createdon" operator="on-or-after" value="2023-12-03T00:00:00Z"/>` +
            `<condition attribute="createdon" operator="on-or-before" value="2023-12-03T23:59:59Z"/>`;
const NAT = `<condition attribute="createdon" operator="gt" value="2023-12-03T23:59:59Z"/>`;

async function getToken() {
  const r = await fetch(`https://login.microsoftonline.com/${process.env.DYNAMICS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials', client_id: process.env.DYNAMICS_CLIENT_ID,
      client_secret: process.env.DYNAMICS_CLIENT_SECRET, scope: `${process.env.DYNAMICS_URL}/.default`,
    }),
  });
  if (!r.ok) throw new Error(`Token: ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}

async function get(token, urlPath) {
  const r = await fetch(`${process.env.DYNAMICS_URL}/api/data/v9.2${urlPath}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-Version': '4.0' },
  });
  const t = await r.text();
  let body; try { body = JSON.parse(t); } catch { body = t; }
  return { status: r.status, ok: r.ok, body };
}

async function aggCount(token, fxFilter) {
  const fx = `<fetch aggregate="true"><entity name="akoya_request">` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
    `<filter type="and">${fxFilter}</filter></entity></fetch>`;
  const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
  if (!r.ok) return null;
  return Number(r.body.value && r.body.value[0] && r.body.value[0].c);
}

async function picklistMap(token, field) {
  const r = await get(token,
    `/EntityDefinitions(LogicalName='akoya_request')/Attributes(LogicalName='${field}')/` +
    `Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)`);
  const m = {};
  if (r.ok && r.body.OptionSet && r.body.OptionSet.Options) {
    for (const o of r.body.OptionSet.Options) {
      m[o.Value] = (o.Label && o.Label.UserLocalizedLabel && o.Label.UserLocalizedLabel.Label) || String(o.Value);
    }
  }
  return m;
}

const pct = (h, t) => (t ? (h / t * 100) : 0).toFixed(0).padStart(3) + '%';

(async () => {
  const token = await getToken();
  console.log('Token acquired.\n');

  const omap = await picklistMap(token, 'wmkf_request_type');
  const typeVals = Object.keys(omap).map(Number);

  for (const [coh, label] of [[MIG, 'MIGRATED'], [NAT, 'NATIVE']]) {
    const cohTot = await aggCount(token, coh);
    console.log(`══ ${label} cohort (n=${cohTot}) — akoya_request / akoya_expenses fill by wmkf_request_type ══`);
    console.log('   type                          n     akoya_request    akoya_expenses');
    // each option value + the null bucket
    const buckets = [...typeVals.map(v => [v, omap[v]]), [null, '(null)']];
    for (const [v, name] of buckets) {
      const typeCond = v == null
        ? `<condition attribute="wmkf_request_type" operator="null"/>`
        : `<condition attribute="wmkf_request_type" operator="eq" value="${v}"/>`;
      const n = await aggCount(token, coh + typeCond);
      if (!n) continue;
      const req = await aggCount(token, `${coh}${typeCond}<condition attribute="akoya_request" operator="not-null"/>`);
      const exp = await aggCount(token, `${coh}${typeCond}<condition attribute="akoya_expenses" operator="not-null"/>`);
      console.log(`   ${String(name).padEnd(26)} ${String(n).padStart(6)}   ` +
        `${pct(req, n)} (${String(req).padStart(5)})   ${pct(exp, n)} (${String(exp).padStart(5)})`);
    }
    console.log();
  }

  console.log('Read: if NATIVE Request ≈ high and NATIVE Concept/interaction ≈ 0,');
  console.log('the gap is a request-type-mix artifact. Compare MIGRATED Concept:');
  console.log('  ~100% ⇒ import backfilled no-budget rows (migrated-100% is artifact);');
  console.log('  ~0%   ⇒ migrated honest; residual gap among true Requests is the real puzzle.');
  console.log('\nDone (read-only request-type fill probe).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
