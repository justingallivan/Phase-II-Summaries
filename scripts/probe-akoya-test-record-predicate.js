#!/usr/bin/env node
/**
 * Track B residual (iii) — TEST-RECORD EXCLUSION PREDICATE candidate (READ-ONLY).
 *
 * The enumeration probe (scripts/probe-akoya-saved-views.js, 2026-05-16) found a
 * live system view "Test Requests" whose fetchxml filter is:
 *     statecode = Active  AND  applicant account.name = "W. M. Keck Foundation"
 * i.e. AkoyaGO staff mark test rows by making the Foundation its own applicant.
 * The Power Tools design currently says "no general test-row detector is
 * established" — this probe TESTS that candidate predicate before we revise it:
 *
 *   1. resolve account(s) named "W. M. Keck Foundation" → accountid(s)
 *   2. count akoya_request rows with that applicant (NO statecode filter — test
 *      rows can be inactive too; the view's Active clause is incidental)
 *   3. confirm the user-known test row 1000799 is caught
 *   4. status/type/amount breakdown → judge OVER-exclusion risk (does it sweep
 *      in any real grants?)
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

const TEST_ORG_NAME = 'W. M. Keck Foundation';
const KNOWN_TEST_REQ = '1000799';

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

async function getAll(token, urlPath) {
  let next = `${process.env.DYNAMICS_URL}/api/data/v9.2${urlPath}`;
  const rows = [];
  while (next) {
    const r = await fetch(next, {
      headers: {
        Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-Version': '4.0',
        Prefer: 'odata.include-annotations="*"',
      },
    });
    const t = await r.text();
    let body; try { body = JSON.parse(t); } catch { body = t; }
    if (!r.ok) throw new Error(`GET ${urlPath}: ${r.status} ${typeof body === 'string' ? body.slice(0, 240) : JSON.stringify(body).slice(0, 240)}`);
    for (const v of body.value || []) rows.push(v);
    next = body['@odata.nextLink'];
  }
  return rows;
}

(async () => {
  const token = await getToken();
  console.log(`Test-record predicate verification — ${new Date().toISOString()}`);
  console.log(`Candidate: applicant account.name == "${TEST_ORG_NAME}"  (from system view "Test Requests")\n`);

  // 1. resolve the org name → accountid(s) (could legitimately be >1 account record)
  const accts = await getAll(token,
    `/accounts?$filter=name eq '${TEST_ORG_NAME.replace(/'/g, "''")}'&$select=accountid,name,statecode`);
  console.log(`══ Step 1 — accounts named "${TEST_ORG_NAME}" ══`);
  for (const a of accts) console.log(`  ${a.accountid}  state=${a[`statecode@OData.Community.Display.V1.FormattedValue`] || a.statecode}`);
  if (!accts.length) { console.log('  (none — predicate would match nothing; STOP)\n'); process.exit(0); }
  const ids = accts.map((a) => a.accountid);
  console.log();

  // 2. all akoya_request with that applicant — NO statecode filter
  const orFilter = ids.map((id) => `_akoya_applicantid_value eq ${id}`).join(' or ');
  const reqs = await getAll(token,
    `/akoya_requests?$filter=${encodeURIComponent(`(${orFilter})`)}` +
    `&$select=akoya_requestnum,akoya_requeststatus,wmkf_request_type,akoya_requesttype,statecode,akoya_grant,akoya_request,akoya_title,createdon`);
  console.log(`══ Step 2 — akoya_request rows with applicant = "${TEST_ORG_NAME}" (no statecode filter): ${reqs.length} ══\n`);

  // 3. is the known test row caught?
  const known = reqs.find((r) => String(r.akoya_requestnum) === KNOWN_TEST_REQ);
  console.log(`══ Step 3 — known test row #${KNOWN_TEST_REQ} ══`);
  console.log(known
    ? `  ✅ CAUGHT by the predicate (status=${known.akoya_requeststatus}, grant=${known.akoya_grant})`
    : `  ❌ NOT caught — predicate misses the one user-confirmed test row (weak/insufficient predicate)`);
  console.log();

  // 4. over-exclusion risk: status / type / amount shape of the swept set
  const FV = '@OData.Community.Display.V1.FormattedValue';
  const tally = (key, fmt) => {
    const m = {};
    for (const r of reqs) { const k = (fmt ? r[`${key}${FV}`] : r[key]) ?? '(null)'; m[k] = (m[k] || 0) + 1; }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };
  console.log(`══ Step 4 — over-exclusion risk: shape of the ${reqs.length} swept rows ══`);
  console.log('  by akoya_requeststatus:');
  for (const [k, n] of tally('akoya_requeststatus', false)) console.log(`    ${n.toString().padStart(4)}  ${k}`);
  console.log('  by wmkf_request_type:');
  for (const [k, n] of tally('wmkf_request_type', true)) console.log(`    ${n.toString().padStart(4)}  ${k}`);
  const withGrant = reqs.filter((r) => Number(r.akoya_grant) > 0);
  console.log(`  rows with akoya_grant > 0: ${withGrant.length} (would these be real grants wrongly excluded?)`);
  for (const r of withGrant.slice(0, 15)) {
    console.log(`    #${r.akoya_requestnum}  status=${r.akoya_requeststatus}  grant=${r.akoya_grant}  title=${(r.akoya_title || '').slice(0, 50)}`);
  }
  console.log(`\n  createdon span: ${reqs.map((r) => r.createdon).sort()[0]} … ${reqs.map((r) => r.createdon).sort().slice(-1)[0]}`);

  console.log('\nINTERPRETATION GUIDE:');
  console.log('  - If #1000799 caught AND swept set is small/sentinel-shaped AND ~no real grants →');
  console.log('    strong exclusion predicate; revise design "no detector established".');
  console.log('  - If swept set contains real-looking funded grants → predicate OVER-excludes;');
  console.log('    it is the Foundation legitimately giving to itself, NOT a clean test flag → Connor needed.');
  console.log('\nDone (read-only test-record predicate probe — residual (iii)).');
})().catch((e) => { console.error('PROBE ERROR:', e.message); process.exit(1); });
