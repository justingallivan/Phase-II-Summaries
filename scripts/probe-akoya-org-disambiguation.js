#!/usr/bin/env node
/**
 * Org-disambiguation fields (READ-ONLY) — applicant ≠ payee happens often,
 * esp. at multicampus institutions (user, S159). What FIELDS exist to
 * disambiguate applicant vs payee vs campus/parent institution?
 *
 *  A. akoya_request: every Lookup → account/contact + any attr whose
 *     name/label smells org/campus/payee/site/parent/system/fiscal.
 *  B. account: hierarchy/alias fields (parentaccountid, akoya_aka, +
 *     keyword-scanned customs) — the classic Dataverse multicampus model.
 *  C. deep-dive #1003083 (UGA applicant vs "UGA Research Foundation"
 *     payee) — show those fields actually populated on both accounts.
 *  D. quantify native applicant≠payee divergence (both target account).
 *
 * Counts = dated evidence. Only POST is the OAuth token; every call a GET.
 */
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let [, k, v] = m; v = v.trim().replace(/^"(.*)"$/, '$1');
    if (!process.env[k]) process.env[k] = v;
  }
}
const FV = '@OData.Community.Display.V1.FormattedValue';
const KW = /campus|institution|organi[sz]|payee|applicant|\bsite\b|parent|system|grantee|recipient|fiscal|sponsor|\baka\b|alias|legal|\bdba\b|affiliat|umbrella|division/i;

async function getToken() {
  const r = await fetch(`https://login.microsoftonline.com/${process.env.DYNAMICS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.DYNAMICS_CLIENT_ID,
      client_secret: process.env.DYNAMICS_CLIENT_SECRET, scope: `${process.env.DYNAMICS_URL}/.default` }) });
  if (!r.ok) throw new Error(`Token: ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}
async function get(token, p) {
  const r = await fetch(`${process.env.DYNAMICS_URL}/api/data/v9.2${p}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-Version': '4.0',
      Prefer: 'odata.include-annotations="*"' } });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, ok: r.ok, body: b };
}
const lbl = (a) => (a.DisplayName && a.DisplayName.UserLocalizedLabel && a.DisplayName.UserLocalizedLabel.Label) || '';

async function lookups(token, entity) {
  const r = await get(token,
    `/EntityDefinitions(LogicalName='${entity}')/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=LogicalName,Targets,DisplayName`);
  return r.ok ? (r.body.value || []) : (console.log(`  [lookup-meta ${entity} ${r.status}]`), []);
}
async function allAttrs(token, entity) {
  const r = await get(token,
    `/EntityDefinitions(LogicalName='${entity}')/Attributes?$select=LogicalName,AttributeType,DisplayName`);
  return r.ok ? (r.body.value || []) : [];
}

(async () => {
  const token = await getToken();
  console.log('Token acquired.\nProbe date: 2026-05-17 (dated evidence)\n');

  // ── A. akoya_request org-ish fields ──
  console.log('══ A. akoya_request — Lookups → account/contact + org/campus keyword attrs ══');
  const reqLk = await lookups(token, 'akoya_request');
  const acctLks = [];
  for (const a of reqLk) {
    const tg = a.Targets || [];
    if (tg.includes('account') || tg.includes('contact')) {
      console.log(`  ${a.LogicalName.padEnd(28)} → [${tg.join(',')}]   "${lbl(a)}"`);
      if (tg.includes('account')) acctLks.push(a.LogicalName);
    }
  }
  const reqAll = await allAttrs(token, 'akoya_request');
  const reqKw = reqAll.filter(a => (KW.test(a.LogicalName) || KW.test(lbl(a))));
  console.log(`\n  keyword-scan (name/label ~ org/campus/payee/site/parent/system/fiscal), ${reqKw.length}:`);
  for (const a of reqKw) console.log(`    ${a.LogicalName.padEnd(30)} [${a.AttributeType}]  "${lbl(a)}"`);

  // ── B. account hierarchy / alias fields ──
  console.log('\n══ B. account — hierarchy/alias disambiguation fields ══');
  const acctLk = await lookups(token, 'account');
  for (const a of acctLk) {
    if (KW.test(a.LogicalName) || KW.test(lbl(a)) || a.LogicalName === 'parentaccountid')
      console.log(`  ${a.LogicalName.padEnd(28)} → [${(a.Targets || []).join(',')}]   "${lbl(a)}"`);
  }
  const acctAll = await allAttrs(token, 'account');
  const acctKw = acctAll.filter(a => KW.test(a.LogicalName) || KW.test(lbl(a)));
  console.log(`\n  keyword-scan account attrs, ${acctKw.length}:`);
  for (const a of acctKw) console.log(`    ${a.LogicalName.padEnd(30)} [${a.AttributeType}]  "${lbl(a)}"`);

  // ── C. deep-dive #1003083 (UGA applicant vs UGA Research Foundation payee) ──
  console.log('\n══ C. #1003083 deep-dive — applicant vs payee accounts, disambiguation fields ══');
  const acctSel = ['accountid', 'name', 'akoya_aka', '_parentaccountid_value',
    'address1_city', 'address1_stateorprovince'].join(',');
  const rq = await get(token,
    `/akoya_requests?$filter=akoya_requestnum eq '1003083'` +
    `&$select=akoya_requestnum,akoya_title,_akoya_applicantid_value,_akoya_payee_value,_akoya_primarycontactid_value`);
  const row = rq.ok && rq.body.value && rq.body.value[0];
  if (!row) { console.log(`  [#1003083 not found ${rq.status}]`); }
  else {
    const applId = row._akoya_applicantid_value, payeeId = row._akoya_payee_value;
    console.log(`  #1003083 "${row.akoya_title}"`);
    console.log(`    applicant: ${row[`_akoya_applicantid_value${FV}`]}  (${applId})`);
    console.log(`    payee:     ${row[`_akoya_payee_value${FV}`]}  (${payeeId})  tgt=${row[`_akoya_payee_value@Microsoft.Dynamics.CRM.lookuplogicalname`]}`);
    for (const [id, who] of [[applId, 'APPLICANT'], [payeeId, 'PAYEE']]) {
      if (!id) { console.log(`  ${who}: (null)`); continue; }
      const a = await get(token, `/accounts(${id})?$select=${acctSel}`);
      if (!a.ok) { console.log(`  ${who} acct [${a.status}]`); continue; }
      const x = a.body;
      console.log(`  ${who} account "${x.name}"`);
      console.log(`     akoya_aka: ${x.akoya_aka || '—'}`);
      console.log(`     parentaccount: ${x[`_parentaccountid_value${FV}`] || '—'}  (${x._parentaccountid_value || '—'})`);
      console.log(`     location: ${x.address1_city || '—'}, ${x.address1_stateorprovince || '—'}`);
    }
  }

  // ── D. native applicant≠payee divergence rate (both account-typed) ──
  console.log('\n══ D. native applicant≠payee divergence ══');
  const A = (fx) => get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`).then(r => r.ok ? Number(r.body.value?.[0]?.c) || 0 : null);
  const NAT = `<condition attribute="createdon" operator="gt" value="2023-12-03T23:59:59Z"/>`;
  const C = (f) => `<fetch aggregate="true"><entity name="akoya_request"><attribute name="akoya_requestid" alias="c" aggregate="count"/><filter type="and">${f}</filter></entity></fetch>`;
  const natPayee = await A(C(`${NAT}<condition attribute="akoya_payee" operator="not-null"/>`));
  // payee != applicant: FetchXML can't compare two columns directly; sample instead.
  const samp = await get(token, `/akoya_requests?$top=400&$select=_akoya_applicantid_value,_akoya_payee_value&$filter=_akoya_payee_value ne null and createdon gt 2023-12-03T23:59:59Z`);
  let diff = 0, n = 0;
  if (samp.ok) for (const r of samp.body.value || []) { n++; if (r._akoya_applicantid_value && r._akoya_payee_value && r._akoya_applicantid_value !== r._akoya_payee_value) diff++; }
  console.log(`  native rows with payee: ${natPayee}`);
  console.log(`  sample n=${n}: payee≠applicant in ${diff} (${n ? (diff / n * 100).toFixed(0) : 0}%)  [top-400 sample, indicative]`);

  console.log('\nDone (read-only org-disambiguation probe).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
