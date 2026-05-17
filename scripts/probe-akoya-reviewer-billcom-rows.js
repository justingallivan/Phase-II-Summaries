#!/usr/bin/env node
/**
 * Reviewer Manager design check (READ-ONLY): the ~8/87 Research Reviewer
 * rows that have bill.com remittance detail populated. User hypothesis:
 * these are test cases (bill.com is the system-of-record for remittance/
 * tax, so the local wmkf_billcom* slots were a mistaken local-collection
 * idea and only got filled while testing). Pull them with identity +
 * payment context so the user can confirm test-vs-real.
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
    if (!r.ok) throw new Error(`GET ${urlPath}: ${r.status} ${typeof body === 'string' ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200)}`);
    if (body.value) { for (const v of body.value) rows.push(v); next = body['@odata.nextLink']; }
    else return body;
  }
  return { value: rows };
}

const FV = '@OData.Community.Display.V1.FormattedValue';
const has = (v) => !(v === null || v === undefined || v === '');

(async () => {
  const token = await getToken();
  console.log(`Research Reviewer rows WITH bill.com detail — ${new Date().toISOString()} (read-only)\n`);

  const progs = await get(token,
    `/akoya_programs?$select=akoya_programid&$filter=${encodeURIComponent("akoya_program eq 'Research Reviewer'")}`);
  const pid = progs.value[0].akoya_programid;

  const rows = (await get(token,
    `/akoya_requests?$filter=${encodeURIComponent(`_akoya_programid_value eq ${pid}`)}` +
    `&$select=akoya_requestnum,createdon,akoya_requeststatus,akoya_paid,_akoya_primarycontactid_value,_akoya_goapplysubmitter_value,` +
    `wmkf_billcomstreet1,wmkf_billcomstreet2,wmkf_billcomcity,wmkf_billcomstate,wmkf_billcomzipcode,wmkf_billcomcountry,` +
    `wmkf_organizationnameonbillcomaccount,wmkf_emailaddressonbillcomaccount,wmkf_paymentnetworkidpni,wmkf_usingpayee,wmkf_vendorverified` +
    `&$orderby=createdon asc`)).value;

  const BC = ['wmkf_billcomstreet1', 'wmkf_billcomstreet2', 'wmkf_billcomcity', 'wmkf_billcomstate',
    'wmkf_billcomzipcode', 'wmkf_billcomcountry', 'wmkf_organizationnameonbillcomaccount',
    'wmkf_emailaddressonbillcomaccount', 'wmkf_paymentnetworkidpni'];
  const populated = rows.filter((r) => BC.some((f) => has(r[f])));

  console.log(`Cohort 87; rows with ANY bill.com field populated: ${populated.length}\n`);
  for (const r of populated) {
    const submitter = r[`_akoya_goapplysubmitter_value${FV}`] || '—';
    const contact = r[`_akoya_primarycontactid_value${FV}`] || '—';
    const staffish = /@wmkeck\.org$/i.test(submitter) || /outlook\.com$/i.test(submitter) || /noda|hibler|test/i.test(`${submitter} ${contact}`);
    console.log(`#${r.akoya_requestnum}  created=${r.createdon}  status=${r.akoya_requeststatus}  paid=${r.akoya_paid}  ${staffish ? '⟵ looks STAFF/TEST' : ''}`);
    console.log(`   contact=${contact}   goapplySubmitter=${submitter}`);
    console.log(`   billcom: name="${r.wmkf_organizationnameonbillcomaccount || '—'}"  email="${r.wmkf_emailaddressonbillcomaccount || '—'}"  ` +
      `${r.wmkf_billcomstreet1 || ''} ${r.wmkf_billcomstreet2 || ''} ${r.wmkf_billcomcity || ''} ${r.wmkf_billcomstate || ''} ${r.wmkf_billcomzipcode || ''} ${r.wmkf_billcomcountry || ''}`.trim());
    console.log(`   paymentnetworkidpni=${r.wmkf_paymentnetworkidpni ?? '—'}  usingpayee=${r[`wmkf_usingpayee${FV}`] ?? r.wmkf_usingpayee}  vendorverified=${r[`wmkf_vendorverified${FV}`] ?? r.wmkf_vendorverified}`);
    console.log();
  }

  // also show the date span of the populated set vs the whole cohort
  const allDates = rows.map((r) => r.createdon).sort();
  const popDates = populated.map((r) => r.createdon).sort();
  console.log(`cohort createdon span : ${allDates[0]} … ${allDates[allDates.length - 1]}`);
  console.log(`populated-set span    : ${popDates[0]} … ${popDates[popDates.length - 1]}`);
  console.log(`  (if the populated set clusters at the cohort's earliest dates ⇒ supports "these are the setup/test rows")`);
  console.log('\nDone (read-only — bill.com-populated reviewer rows for spot-check).');
})().catch((e) => { console.error('PROBE ERROR:', e.message); process.exit(1); });
