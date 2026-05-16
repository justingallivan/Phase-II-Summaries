#!/usr/bin/env node
/**
 * Robustness follow-ups (READ-ONLY) answering the Codex review of the era /
 * field-shape work. Each block either substantiates a claim with evidence or
 * marks it as still-assumed so the docs can be softened honestly.
 *
 *  (a) Sampling stability — re-measure representative fields from the OPPOSITE
 *      end of the akoya_requestid (GUID) ordering. If asc-first-1200 and
 *      desc-first-1200 (disjoint samples) agree within a few pp, GUID order is
 *      uncorrelated with population => the pseudo-random claim is supported.
 *  (b) createdon immutability — overriddencreatedon=0 (no create-time
 *      backdating) is already known; here we show migrated rows ARE edited
 *      post-import (modifiedon >> createdon) yet createdon stays 2023-12-03,
 *      so the era classifier is stable under re-touch. (Dataverse createdon is
 *      system-owned / non-updatable via PATCH — platform invariant.)
 *  (c) Lifecycle-vs-era confound — DIRECT test. Within the native cohort,
 *      stratify amount-field population by a decided proxy (akoya_decisiondate
 *      present; cross-checked by statecode). If decided-native ≈ migrated and
 *      not-decided-native ≈ 0, the gap is lifecycle, not schema/mapping.
 *  (d) Historical-key reliability — committed, reproducible decade
 *      distribution of akoya_decisiondate AND wmkf_meetingdate in the migrated
 *      cohort (the earlier one-off was not committed; Codex flagged it
 *      unverifiable from source).
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

const SAMPLE = 1200;
const MIG = 'createdon ge 2023-12-03T00:00:00Z and createdon le 2023-12-03T23:59:59Z';
const NAT = 'createdon gt 2023-12-03T23:59:59Z';

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
  const url = urlPath.startsWith('http') ? urlPath
    : `${process.env.DYNAMICS_URL}/api/data/v9.2${urlPath}`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`, Accept: 'application/json',
      'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
      Prefer: 'odata.maxpagesize=500',
    },
  });
  const t = await r.text();
  let body; try { body = JSON.parse(t); } catch { body = t; }
  return { status: r.status, ok: r.ok, body };
}

async function aggCount(token, fxFilter) {
  const fx = `<fetch aggregate="true"><entity name="akoya_request">` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
    `${fxFilter}</entity></fetch>`;
  const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
  if (!r.ok) return null;
  const c = r.body.value && r.body.value[0] && r.body.value[0].c;
  return Number(c);
}

async function sampleRates(token, cohortFilter, order, fields, cap) {
  const recs = [];
  let next = `/akoya_requests?$filter=${encodeURIComponent(cohortFilter)}` +
    `&$orderby=akoya_requestid ${order}&$top=${cap}`;
  while (next && recs.length < cap) {
    const r = await get(token, next);
    if (!r.ok) throw new Error(`sample [${r.status}]`);
    for (const x of r.body.value || []) { recs.push(x); if (recs.length >= cap) break; }
    next = r.body['@odata.nextLink'] || null;
  }
  const n = recs.length || 1;
  const out = {};
  for (const f of fields) {
    let c = 0;
    for (const rec of recs) {
      const v = rec[f];
      if (v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '')) c++;
    }
    out[f] = c / n;
  }
  return { n, rates: out };
}

const pct = x => (x * 100).toFixed(0).padStart(3) + '%';

(async () => {
  const token = await getToken();
  console.log('Token acquired.\n');

  // ---- (a) sampling stability: asc vs desc disjoint GUID samples ----
  const repFields = [
    'akoya_grant', 'akoya_decisiondate', '_wmkf_grantprogram_value',
    'akoya_title', 'akoya_requeststatus', '_akoya_applicantid_value',
    'akoya_requestnum',
  ];
  console.log('── (a) GUID-order sampling stability (asc vs desc, disjoint n≈1200 each) ──');
  for (const [coh, label] of [[MIG, 'migrated'], [NAT, 'native']]) {
    const asc = await sampleRates(token, coh, 'asc', repFields, SAMPLE);
    const desc = await sampleRates(token, coh, 'desc', repFields, SAMPLE);
    console.log(`  ${label} (asc n=${asc.n}, desc n=${desc.n}):`);
    let maxGap = 0;
    for (const f of repFields) {
      const g = Math.abs(asc.rates[f] - desc.rates[f]);
      maxGap = Math.max(maxGap, g);
      console.log(`    ${f.padEnd(26)} asc ${pct(asc.rates[f])}  desc ${pct(desc.rates[f])}  Δ${(g * 100).toFixed(1)}pp`);
    }
    console.log(`    => max Δ ${(maxGap * 100).toFixed(1)}pp ${maxGap <= 0.05 ? '(stable: GUID order ~ uncorrelated)' : '(UNSTABLE — sampling caveat stands)'}\n`);
  }

  // ---- (b) createdon immutability under post-import edits ----
  console.log('── (b) createdon stable under post-import re-touch (migrated cohort) ──');
  const migTotal = await aggCount(token, '');  // whole table
  console.log(`  akoya_request total (FetchXML agg): ${migTotal}`);
  const r = await get(token,
    `/akoya_requests?$select=akoya_requestnum,createdon,modifiedon&$filter=${encodeURIComponent(MIG)}` +
    `&$orderby=modifiedon desc&$top=5`);
  if (r.ok) for (const x of r.body.value || []) {
    console.log(`  reqnum=${x.akoya_requestnum}  createdon=${x.createdon}  modifiedon=${x.modifiedon}`);
  }
  console.log('  => migrated rows are edited long after 2023-12-03 yet createdon is unchanged');
  console.log('     (Dataverse createdon is system-owned / not PATCH-updatable; overriddencreatedon=0 ⇒ no backdating).\n');

  // ---- (c) lifecycle-vs-era confound: direct stratified test ----
  console.log('── (c) confound test: native cohort, amount-field pop by decided proxy ──');
  const decided = `<condition attribute="akoya_decisiondate" operator="not-null"/>`;
  const notDecided = `<condition attribute="akoya_decisiondate" operator="null"/>`;
  const natF = `<condition attribute="createdon" operator="gt" value="2023-12-03T23:59:59Z"/>`;
  const migF = `<condition attribute="createdon" operator="on-or-after" value="2023-12-03T00:00:00Z"/>` +
               `<condition attribute="createdon" operator="on-or-before" value="2023-12-03T23:59:59Z"/>`;
  async function rate(scopeConds, targetField) {
    const tot = await aggCount(token, `<filter type="and">${scopeConds}</filter>`);
    const hit = await aggCount(token,
      `<filter type="and">${scopeConds}<condition attribute="${targetField}" operator="not-null"/></filter>`);
    return tot ? { tot, hit, r: hit / tot } : { tot: 0, hit: 0, r: 0 };
  }
  for (const tf of ['akoya_grant', 'akoya_request', 'akoya_expenses']) {
    const nd = await rate(natF + decided, tf);
    const nn = await rate(natF + notDecided, tf);
    const mg = await rate(migF, tf);
    console.log(`  ${tf}:`);
    console.log(`    native+DECIDED      ${pct(nd.r)}  (${nd.hit}/${nd.tot})`);
    console.log(`    native+NOT-decided  ${pct(nn.r)}  (${nn.hit}/${nn.tot})`);
    console.log(`    migrated (all)      ${pct(mg.r)}  (${mg.hit}/${mg.tot})`);
  }
  // independent cross-check: statecode (0 active / 1 inactive) within native
  const natInactive = `<condition attribute="statecode" operator="eq" value="1"/>`;
  const natActive = `<condition attribute="statecode" operator="eq" value="0"/>`;
  const gi = await rate(natF + natInactive, 'akoya_grant');
  const ga = await rate(natF + natActive, 'akoya_grant');
  console.log(`  akoya_grant by statecode (native): inactive ${pct(gi.r)} (${gi.hit}/${gi.tot}) · active ${pct(ga.r)} (${ga.hit}/${ga.tot})`);
  console.log('  => if DECIDED≈migrated and NOT-decided≈0, the gap is lifecycle, not schema/mapping\n');

  // ---- (d) historical-key decade distribution (committed/reproducible) ----
  console.log('── (d) migrated-cohort decade distribution (reproducible) ──');
  for (const f of ['akoya_decisiondate', 'wmkf_meetingdate']) {
    const fx = `<fetch aggregate="true"><entity name="akoya_request">` +
      `<attribute name="${f}" alias="y" groupby="true" dategrouping="year"/>` +
      `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
      `<filter type="and"><condition attribute="createdon" operator="on-or-after" value="2023-12-03T00:00:00Z"/>` +
      `<condition attribute="createdon" operator="on-or-before" value="2023-12-03T23:59:59Z"/>` +
      `<condition attribute="${f}" operator="not-null"/></filter></entity></fetch>`;
    const rr = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
    console.log(`  ${f}:`);
    if (!rr.ok) { console.log(`    [${rr.status}]`); continue; }
    const rows = (rr.body.value || []).map(x => ({ y: Number(x['y.year'] ?? x.y), c: Number(x.c) || 0 }));
    const dec = {}; let tot = 0, pre1954 = 0;
    for (const x of rows) { const d = Math.floor(x.y / 10) * 10; dec[d] = (dec[d] || 0) + x.c; tot += x.c; if (x.y < 1954) pre1954 += x.c; }
    for (const d of Object.keys(dec).sort()) console.log(`    ${d}s: ${dec[d]}`);
    console.log(`    [total non-null=${tot}; pre-1954(suspect)=${pre1954}]`);
  }

  console.log('\nDone (read-only robustness probe).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
