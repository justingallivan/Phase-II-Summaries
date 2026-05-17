#!/usr/bin/env node
/**
 * Track B residual (i) — adjudicate the 4 high-frequency UNDER-inclusion
 * columns the recognition-sizing probe surfaced (READ-ONLY). Same
 * content-check discipline as akoya_purpose: a column earns a DEFAULT slot
 * only if it carries distinct, analyst-meaningful, era-robust content.
 *
 *   akoya_payee            (lookup) — paid-to party; default ONLY if it
 *                          materially diverges from the applicant org.
 *   akoya_primarycontactid (lookup→contact) — the PI/contact person.
 *   account.address1_city / address1_stateorprovince — applicant-org
 *                          location (joined from account); default ONLY if
 *                          well-populated with a meaningful spread.
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
const MIG = `<condition attribute="createdon" operator="on-or-after" value="2023-12-03T00:00:00Z"/>` +
            `<condition attribute="createdon" operator="on-or-before" value="2023-12-03T23:59:59Z"/>`;
const NAT = `<condition attribute="createdon" operator="gt" value="2023-12-03T23:59:59Z"/>`;
const FV = '@OData.Community.Display.V1.FormattedValue';
const LLN = '@Microsoft.Dynamics.CRM.lookuplogicalname';

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
async function agg(token, fx) {
  const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
  if (!r.ok) return null;
  return Number(r.body.value && r.body.value[0] && r.body.value[0].c) || 0;
}
const C = (f) => `<fetch aggregate="true"><entity name="akoya_request">` +
  `<attribute name="akoya_requestid" alias="c" aggregate="count"/>${f}</entity></fetch>`;

(async () => {
  const token = await getToken();
  console.log('Token acquired.\nProbe date: 2026-05-17 (dated evidence)\n');

  // ── metadata for the two request-level lookups ──
  for (const ln of ['akoya_payee', 'akoya_primarycontactid', 'akoya_purpose']) {
    const md = await get(token,
      `/EntityDefinitions(LogicalName='akoya_request')/Attributes?$select=AttributeType,DisplayName&$filter=LogicalName eq '${ln}'`);
    const a = md.ok && md.body.value && md.body.value[0];
    console.log(`  ${ln}: ${a ? `type=${a.AttributeType} label="${a.DisplayName?.UserLocalizedLabel?.Label || ''}"` : `[meta ${md.status}]`}`);
  }
  console.log();

  // ── fill rate per era — the two request lookups ──
  const tot = await agg(token, C(''));
  for (const ln of ['akoya_payee', 'akoya_primarycontactid']) {
    console.log(`══ ${ln} — fill rate ══`);
    const f = await agg(token, C(`<filter><condition attribute="${ln}" operator="not-null"/></filter>`));
    console.log(`  overall  ${f}/${tot}  (${(f / tot * 100).toFixed(0)}%)`);
    for (const [coh, lab] of [[MIG, 'migrated'], [NAT, 'native']]) {
      const ct = await agg(token, C(`<filter type="and">${coh}</filter>`));
      const cf = await agg(token, C(`<filter type="and">${coh}<condition attribute="${ln}" operator="not-null"/></filter>`));
      console.log(`  ${lab.padEnd(8)} ${cf}/${ct}  (${(cf / (ct || 1) * 100).toFixed(0)}%)`);
    }
    console.log();
  }

  // ── payee vs applicant divergence (the analytic-value test) + samples ──
  const sx = `/akoya_requests?$top=14&$select=akoya_requestnum,_akoya_payee_value,_akoya_applicantid_value,_akoya_primarycontactid_value` +
    `&$filter=_akoya_payee_value ne null and createdon gt 2023-12-03T23:59:59Z&$orderby=createdon desc`;
  const s = await get(token, sx);
  console.log('══ payee vs applicant vs primary-contact — newest-native sample (divergence check) ══');
  if (s.ok) for (const x of s.body.value || []) {
    const payee = x[`_akoya_payee_value${FV}`] || '—';
    const ptgt = x[`_akoya_payee_value${LLN}`] || '?';
    const appl = x[`_akoya_applicantid_value${FV}`] || '—';
    const pc = x[`_akoya_primarycontactid_value${FV}`] || '—';
    const same = payee !== '—' && payee === appl ? '  [payee==applicant]' : (payee !== '—' ? '  [DIVERGES]' : '');
    console.log(`  #${x.akoya_requestnum}  payee(${ptgt})="${payee}"  applicant="${appl}"  contact="${pc}"${same}`);
  } else console.log(`  [${s.status} ${JSON.stringify(s.body).slice(0,160)}]`);
  console.log();

  // ── applicant-org address fill (joined from account) + state spread ──
  const link = (cond = '') =>
    `<link-entity name="account" from="accountid" to="akoya_applicantid" link-type="inner" alias="a">${cond}</link-entity>`;
  console.log('══ applicant-org address (account joined on akoya_applicantid) ══');
  const withAppl = await agg(token, C(`${link()}`));
  for (const fld of ['address1_city', 'address1_stateorprovince']) {
    const has = await agg(token, C(link(`<filter><condition attribute="${fld}" operator="not-null"/></filter>`)));
    console.log(`  ${fld.padEnd(26)} ${has}/${withAppl} of requests-with-applicant (${(has / (withAppl || 1) * 100).toFixed(0)}%)`);
  }
  // top applicant states (analytic-value: is it a meaningful spread?)
  const stFx = `<fetch aggregate="true" top="14"><entity name="akoya_request">` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
    `<link-entity name="account" from="accountid" to="akoya_applicantid" link-type="inner" alias="a">` +
    `<attribute name="address1_stateorprovince" alias="st" groupby="true"/></link-entity>` +
    `<order alias="c" descending="true"/></entity></fetch>`;
  const st = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(stFx)}`);
  console.log('\n  top applicant-org states by request count:');
  if (st.ok) for (const x of (st.body.value || [])) {
    const v = x.st == null ? '(null)' : x.st;
    console.log(`    ${String(x.c).padStart(6)}  ${v}`);
  } else console.log(`    [${st.status} ${JSON.stringify(st.body).slice(0,160)}]`);

  console.log('\nRead: DEFAULT only if distinct + analyst-meaningful + era-robust;');
  console.log('else opt-in (flagged sparse/era-scoped) or prune.');
  console.log('\nDone (read-only under-inclusion-4 adjudication probe).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
