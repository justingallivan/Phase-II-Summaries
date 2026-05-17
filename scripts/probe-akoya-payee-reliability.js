#!/usr/bin/env node
/**
 * (a) Payee-disambiguation RELIABILITY (READ-ONLY) — the fields exist
 * (probe-akoya-org-disambiguation); do they WORK as a disambiguator?
 *
 *  1. wmkf_paymentgoingtodifferentorganization picklist value distribution
 *  2. wmkf_usingpayee fill + true-rate per era
 *  3. predictiveness: among native payee-not-null rows (bounded sample),
 *     does wmkf_usingpayee / the picklist actually predict payee≠applicant?
 *  4. account structural-model fill: parentaccountid · akoya_defaultpayee
 *     · akoya_aka — overall and among applicant/payee accounts
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
const MIG = `<condition attribute="createdon" operator="on-or-before" value="2023-12-03T23:59:59Z"/>`;
const NAT = `<condition attribute="createdon" operator="gt" value="2023-12-03T23:59:59Z"/>`;

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
const Creq = (f) => `<fetch aggregate="true"><entity name="akoya_request"><attribute name="akoya_requestid" alias="c" aggregate="count"/>${f ? `<filter type="and">${f}</filter>` : ''}</entity></fetch>`;
const Areq = (token, fx) => get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`).then(r => r.ok ? Number(r.body.value?.[0]?.c) || 0 : null);

(async () => {
  const token = await getToken();
  console.log('Token acquired.\nProbe date: 2026-05-17 (dated evidence)\n');

  // 1. picklist distribution
  console.log('══ 1. wmkf_paymentgoingtodifferentorganization — value distribution ══');
  const pfx = `<fetch aggregate="true" top="20"><entity name="akoya_request">` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
    `<attribute name="wmkf_paymentgoingtodifferentorganization" alias="v" groupby="true"/>` +
    `<order alias="c" descending="true"/></entity></fetch>`;
  const p = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(pfx)}`);
  if (p.ok) for (const x of p.body.value || [])
    console.log(`  ${String(x.c).padStart(6)}  ${x.v == null ? '(null)' : `${x[`v${FV}`] || x.v}`}`);
  else console.log(`  [${p.status} ${JSON.stringify(p.body).slice(0,160)}]`);

  // 2. wmkf_usingpayee fill + true-rate per era
  console.log('\n══ 2. wmkf_usingpayee (Boolean) per era ══');
  for (const [coh, lab] of [['', 'overall'], [MIG, 'migrated'], [NAT, 'native']]) {
    const base = coh ? coh : '';
    const tot = await Areq(token, Creq(base));
    const tru = await Areq(token, Creq(`${base}<condition attribute="wmkf_usingpayee" operator="eq" value="1"/>`));
    console.log(`  ${lab.padEnd(8)} usingpayee=true ${tru}/${tot}  (${(tru/(tot||1)*100).toFixed(1)}%)`);
  }

  // 3. predictiveness — bounded native sample
  console.log('\n══ 3. predictiveness (native, payee not-null, top-2000 sample) ══');
  const s = await get(token, `/akoya_requests?$top=2000&$select=_akoya_applicantid_value,_akoya_payee_value,wmkf_usingpayee,wmkf_paymentgoingtodifferentorganization&$filter=_akoya_payee_value ne null and createdon gt 2023-12-03T23:59:59Z`);
  if (s.ok) {
    const rows = s.body.value || [];
    let div = 0, same = 0;
    const cell = { divUP: 0, sameUP: 0, divPick: 0, samePick: 0 };
    for (const r of rows) {
      const d = r._akoya_applicantid_value && r._akoya_payee_value && r._akoya_applicantid_value !== r._akoya_payee_value;
      const up = r.wmkf_usingpayee === true;
      const pick = r.wmkf_paymentgoingtodifferentorganization != null;
      if (d) { div++; if (up) cell.divUP++; if (pick) cell.divPick++; }
      else { same++; if (up) cell.sameUP++; if (pick) cell.samePick++; }
    }
    console.log(`  sample n=${rows.length}  ·  payee≠applicant ${div}  ·  payee==applicant ${same}`);
    console.log(`  usingpayee=true  : ${cell.divUP}/${div} of DIVERGENT (${div?(cell.divUP/div*100).toFixed(0):0}%)  vs ${cell.sameUP}/${same} of SAME (${same?(cell.sameUP/same*100).toFixed(0):0}%)`);
    console.log(`  picklist set     : ${cell.divPick}/${div} of DIVERGENT (${div?(cell.divPick/div*100).toFixed(0):0}%)  vs ${cell.samePick}/${same} of SAME (${same?(cell.samePick/same*100).toFixed(0):0}%)`);
    console.log('  (high divergent% + low same% ⇒ flag is a reliable predictor)');
  } else console.log(`  [${s.status} ${JSON.stringify(s.body).slice(0,160)}]`);

  // 4. account structural-model fill
  console.log('\n══ 4. account structural-model fill ══');
  const Cacc = (f) => `<fetch aggregate="true"><entity name="account"><attribute name="accountid" alias="c" aggregate="count"/>${f ? `<filter>${f}</filter>` : ''}</entity></fetch>`;
  const Aacc = (fx) => get(token, `/accounts?fetchXml=${encodeURIComponent(fx)}`).then(r => r.ok ? Number(r.body.value?.[0]?.c) || 0 : null);
  const accTot = await Aacc(Cacc(''));
  for (const f of ['parentaccountid', 'akoya_defaultpayee', 'akoya_aka', 'wmkf_legalname']) {
    const h = await Aacc(Cacc(`<condition attribute="${f}" operator="not-null"/>`));
    console.log(`  ${f.padEnd(22)} ${h}/${accTot} accounts  (${(h/(accTot||1)*100).toFixed(0)}%)`);
  }
  // among accounts that are an applicant on >=1 request (the ones Track B rolls up)
  const apFx = `<fetch aggregate="true" distinct="true"><entity name="account"><attribute name="accountid" alias="c" aggregate="countcolumn"/>` +
    `<filter><condition attribute="parentaccountid" operator="not-null"/></filter>` +
    `<link-entity name="akoya_request" from="akoya_applicantid" to="accountid" link-type="inner" alias="r"/></entity></fetch>`;
  const apHas = await Aacc(apFx);
  const apAll = await Aacc(`<fetch aggregate="true" distinct="true"><entity name="account"><attribute name="accountid" alias="c" aggregate="countcolumn"/><link-entity name="akoya_request" from="akoya_applicantid" to="accountid" link-type="inner" alias="r"/></entity></fetch>`);
  console.log(`  parentaccountid among APPLICANT accounts: ${apHas}/${apAll}  (${apAll?(apHas/apAll*100).toFixed(0):0}%)`);

  console.log('\nDone (read-only payee-reliability probe).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
