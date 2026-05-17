#!/usr/bin/env node
/**
 * Reviewer Manager → Dataverse design input (READ-ONLY): exhaustive
 * field-population census across ALL `akoya_program = "Research Reviewer"`
 * rows (the paid-reviewer honorarium cohort). Answers "what else lives in
 * these entries?" — especially the bill.com / payee / vendor-verification
 * payment cluster WMKF needs to PRESERVE for this cohort and COLLECT for
 * accepted reviewers going forward.
 *
 * For every attribute: how many of the N rows have it populated. Then a
 * called-out payment/bill.com subset, and a test-vs-real split (GOapply
 * submitter email @wmkeck.org ⇒ staff/test).
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
const isEmpty = (v) => v === null || v === undefined || v === '' ||
  (typeof v === 'number' && (Number.isNaN(v)));

(async () => {
  const token = await getToken();
  console.log(`Research Reviewer field census — ${new Date().toISOString()} (read-only)\n`);

  const progs = await get(token,
    `/akoya_programs?$select=akoya_programid&$filter=${encodeURIComponent("akoya_program eq 'Research Reviewer'")}`);
  if (!progs.value.length) { console.log('no program — STOP'); process.exit(0); }
  const pid = progs.value[0].akoya_programid;

  // FULL records (no $select) for every reviewer row
  const rows = (await get(token,
    `/akoya_requests?$filter=${encodeURIComponent(`_akoya_programid_value eq ${pid}`)}&$orderby=createdon asc`)).value;
  const N = rows.length;
  console.log(`Cohort: ${N} rows (akoya_program=Research Reviewer)\n`);

  // test-vs-real split via GOapply submitter email domain
  const submitterEmail = (r) => r[`_akoya_goapplysubmitter_value${FV}`] || '';
  const isStaffTest = (r) => /@wmkeck\.org$/i.test(submitterEmail(r)) || /noda|hibler/i.test(submitterEmail(r));
  const test = rows.filter(isStaffTest), real = rows.filter((r) => !isStaffTest(r));
  console.log(`Split: ${test.length} staff/test (submitter @wmkeck.org or known staff) · ${real.length} real external reviewers\n`);

  // population census over a cohort
  const census = (set) => {
    const cnt = {};
    for (const r of set) for (const [k, v] of Object.entries(r)) {
      if (k.includes('@')) continue;
      if (k.endsWith('_value') && k.startsWith('_')) { if (!isEmpty(v)) cnt[k] = (cnt[k] || 0) + 1; continue; }
      if (!isEmpty(v)) cnt[k] = (cnt[k] || 0) + 1;
    }
    return cnt;
  };
  const cAll = census(rows), cReal = census(real);

  // payment / bill.com / vendor-verification / payee cluster
  const PAY = /billcom|payee|vendor|payment|goverify|remit|ach|creditcard|bank|routing|tax|w9|paid|invoice|disburs/i;
  const payFields = Object.keys(cAll).filter((k) => PAY.test(k)).sort();
  console.log(`══ PAYMENT / BILL.COM / PAYEE CLUSTER (populated count — all ${N} / real ${real.length}) ══`);
  for (const k of payFields) {
    console.log(`  ${k.padEnd(42)}  all ${String(cAll[k] || 0).padStart(3)}/${N}   real ${String(cReal[k] || 0).padStart(3)}/${real.length}`);
  }

  // GOapply / identity linkage cluster
  const ID = /goapply|primarycontact|applicant|contact|submitter|source/i;
  console.log(`\n══ GOAPPLY / IDENTITY-LINKAGE CLUSTER ══`);
  for (const k of Object.keys(cAll).filter((k) => ID.test(k)).sort()) {
    console.log(`  ${k.padEnd(42)}  all ${String(cAll[k]).padStart(3)}/${N}   real ${String(cReal[k] || 0).padStart(3)}/${real.length}`);
  }

  // full catalog — every populated attribute, by coverage
  console.log(`\n══ FULL POPULATED-FIELD CATALOG (count/${N}, desc) ══`);
  for (const [k, n] of Object.entries(cAll).sort((a, b) => b[1] - a[1])) {
    const pct = Math.round((100 * n) / N);
    console.log(`  ${String(n).padStart(3)}/${N} (${String(pct).padStart(3)}%)  ${k}`);
  }

  // sample the bill.com values on the staff/test rows (where they were populated)
  console.log(`\n══ Sample bill.com values (staff/test rows where present — shows the shape to preserve) ══`);
  for (const r of test.slice(0, 3)) {
    const bc = Object.entries(r).filter(([k, v]) => /billcom|payee|paymentnetwork/i.test(k) && !isEmpty(v) && !k.includes('@'));
    console.log(`  #${r.akoya_requestnum} (${submitterEmail(r) || '—'}): ${bc.map(([k, v]) => `${k}=${v}`).join(' · ') || '(none populated)'}`);
  }

  console.log('\nDone (read-only Research Reviewer field census).');
})().catch((e) => { console.error('PROBE ERROR:', e.message); process.exit(1); });
