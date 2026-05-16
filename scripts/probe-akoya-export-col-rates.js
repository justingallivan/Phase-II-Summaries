#!/usr/bin/env node
/**
 * AUTHORITATIVE export-column availability (READ-ONLY) — supersedes the
 * SAMPLED migrated rates in probe-akoya-era-field-shape.js.
 *
 * Why this exists: the robustness probe showed akoya_requestid (GUID) order
 * correlates with population in the MIGRATED cohort (akoya_grant asc 95% vs
 * desc 61%; grantprogram asc 58% vs desc 99%) — so the n=1,200 asc sample was
 * biased. This script computes EXACT full-cohort population rates via FetchXML
 * aggregate counts (no sampling, no $count), so the Artifact 3 table can cite
 * real numbers.
 *
 * rate(field, cohort) = count(cohort AND field not-null) / count(cohort).
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

async function aggCount(token, fxFilter) {
  const fx = `<fetch aggregate="true"><entity name="akoya_request">` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
    `<filter type="and">${fxFilter}</filter></entity></fetch>`;
  const r = await fetch(
    `${process.env.DYNAMICS_URL}/api/data/v9.2/akoya_requests?fetchXml=${encodeURIComponent(fx)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-Version': '4.0' } });
  if (!r.ok) return null;
  const b = await r.json();
  return Number(b.value && b.value[0] && b.value[0].c);
}

// Physical field per export concept (resolved earlier; akoya_requestnum is the
// human Request #). Lookups use the bare logical name in FetchXML not-null.
// Bucket labels match the corrected Artifact 3 classification (design doc):
// A=measured≥97% both · Bl=B-lifecycle · Bs=B-structural · C=both-eras ·
// D=sparse-both · E=provenance. statecode is platform-mandatory (never null)
// but is measured here so the doc's 100/100 row is probe-backed, not asserted.
const COLS = [
  ['Request #',            'akoya_requestnum',            'A'],
  ['Request type (Akoya)', 'akoya_requesttype',           'A'],
  ['Request type (WMKF)',  'wmkf_request_type',           'A'],
  ['Lifecycle status',     'akoya_requeststatus',         'A'],
  ['State',                'statecode',                   'A'],
  ['Applicant org',        'akoya_applicantid',           'A'],
  ['Internal program',     'akoya_programid',             'A'],
  ['Meeting date',         'wmkf_meetingdate',            'A'],
  ['Fiscal year',          'akoya_fiscalyear',            'A'],
  ['Amount paid',          'akoya_paid',                  'A'],
  ['Decision date',        'akoya_decisiondate',          'Bl'],
  ['Grant (awarded) amt',  'akoya_grant',                 'Bl'],
  ['Original grant amt',   'akoya_originalgrantamount',   'Bl'],
  ['Requested amount',     'akoya_request',               'Bs'],
  ['Total project budget', 'akoya_expenses',              'Bs'],
  ['Grant program',        'wmkf_grantprogram',           'C'],
  ['Primary contact',      'akoya_primarycontactid',      'C'],
  ['Title',                'akoya_title',                 'C'],
  ['Project leader / PI',  'wmkf_projectleader',          'D'],
  ['Begin date',           'akoya_begindate',             'D'],
  ['End date',             'akoya_enddate',               'D'],
  ['Request received',     'akoya_datereceived',          'D'],
  ['BB lineage: status',   'wmkf_bbstatus',               'E'],
  ['BB lineage: staff id', 'wmkf_bbstaffid',              'E'],
];

const pct = (h, t) => (t ? (h / t * 100) : 0).toFixed(0).padStart(3) + '%';

(async () => {
  const token = await getToken();
  console.log('Token acquired.\n');
  const migTot = await aggCount(token, MIG);
  const natTot = await aggCount(token, NAT);
  console.log(`migrated total = ${migTot}   native total = ${natTot}`);
  console.log('(EXACT full-cohort FetchXML aggregate rates — no sampling, no $count)\n');
  console.log('  bkt  concept                 field                         mig%        nat%');
  for (const [concept, field, bkt] of COLS) {
    const mh = await aggCount(token, `${MIG}<condition attribute="${field}" operator="not-null"/>`);
    const nh = await aggCount(token, `${NAT}<condition attribute="${field}" operator="not-null"/>`);
    if (mh == null || nh == null) {
      console.log(`  ${bkt.padEnd(3)}  ${concept.padEnd(22)} ${field.padEnd(28)} [query failed — skip]`);
      continue;
    }
    console.log(`  ${bkt.padEnd(3)}  ${concept.padEnd(22)} ${field.padEnd(28)} ` +
      `${pct(mh, migTot)} (${String(mh).padStart(5)}/${migTot})  ${pct(nh, natTot)} (${String(nh).padStart(4)}/${natTot})`);
  }
  console.log('\nDone (read-only EXACT export-column rate probe).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
