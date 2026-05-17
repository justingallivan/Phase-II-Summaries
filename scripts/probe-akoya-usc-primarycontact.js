#!/usr/bin/env node
/**
 * akoya_primarycontactid spot-check for University of Southern California
 * (READ-ONLY) — recognition sanity check before confirming the "default"
 * verdict: what does Primary Contact actually contain for one known org,
 * across eras, and how often is it null in practice?
 *
 * Match applicant account by name/aka (USC name-variant rollup is a known
 * Track B concern — show account.name + akoya_aka so variants are visible).
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
const MIG = `<condition attribute="createdon" operator="on-or-before" value="2023-12-03T23:59:59Z"/>`;

(async () => {
  const token = await getToken();
  console.log('Token acquired.\nProbe date: 2026-05-17 (dated evidence)\n');

  // distinct applicant accounts matching USC, with aka — show the name variants
  const accFx = `<fetch top="20"><entity name="account">` +
    `<attribute name="accountid"/><attribute name="name"/><attribute name="akoya_aka"/>` +
    `<filter type="or">` +
    `<condition attribute="name" operator="like" value="%University of Southern California%"/>` +
    `<condition attribute="akoya_aka" operator="like" value="%USC%"/>` +
    `</filter><order attribute="name"/></entity></fetch>`;
  const acc = await get(token, `/accounts?fetchXml=${encodeURIComponent(accFx)}`);
  console.log('══ applicant accounts matching USC ══');
  if (acc.ok) for (const a of acc.body.value || [])
    console.log(`  "${a.name}"${a.akoya_aka ? `  (aka: ${a.akoya_aka})` : ''}  id=${a.accountid}`);
  else console.log(`  [${acc.status} ${JSON.stringify(acc.body).slice(0,160)}]`);
  console.log();

  // fill rate of primary contact among USC requests, overall + per era
  const cnt = async (extra) => {
    const fx = `<fetch aggregate="true"><entity name="akoya_request">` +
      `<attribute name="akoya_requestid" alias="c" aggregate="count"/>${extra}` +
      `<link-entity name="account" from="accountid" to="akoya_applicantid" link-type="inner" alias="a">` +
      `<filter><condition attribute="name" operator="like" value="%University of Southern California%"/></filter>` +
      `</link-entity></entity></fetch>`;
    const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
    return r.ok ? Number(r.body.value?.[0]?.c) || 0 : null;
  };
  const tot = await cnt('');
  const withPc = await cnt(`<filter><condition attribute="akoya_primarycontactid" operator="not-null"/></filter>`);
  const mig = await cnt(`<filter type="and">${MIG}</filter>`);
  const migPc = await cnt(`<filter type="and">${MIG}<condition attribute="akoya_primarycontactid" operator="not-null"/></filter>`);
  console.log('══ akoya_primarycontactid fill among USC requests ══');
  console.log(`  total USC requests:        ${tot}`);
  console.log(`  with primary contact:      ${withPc}/${tot}  (${tot ? (withPc / tot * 100).toFixed(0) : 0}%)`);
  console.log(`  migrated:                  ${migPc}/${mig} have it  ·  native: ${withPc - migPc}/${tot - mig} have it\n`);

  // sample rows — newest first
  const fx = `<fetch top="25"><entity name="akoya_request">` +
    `<attribute name="akoya_requestnum"/><attribute name="akoya_primarycontactid"/>` +
    `<attribute name="akoya_title"/><attribute name="akoya_requeststatus"/>` +
    `<attribute name="akoya_programid"/><attribute name="akoya_decisiondate"/><attribute name="createdon"/>` +
    `<order attribute="akoya_decisiondate" descending="true"/>` +
    `<link-entity name="account" from="accountid" to="akoya_applicantid" link-type="inner" alias="a">` +
    `<attribute name="name" alias="appl"/>` +
    `<filter><condition attribute="name" operator="like" value="%University of Southern California%"/></filter>` +
    `</link-entity></entity></fetch>`;
  const s = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
  console.log('══ USC requests — newest by decision date (Primary Contact in context) ══');
  if (s.ok) for (const x of s.body.value || []) {
    const pc = x[`_akoya_primarycontactid_value${FV}`] || x.akoya_primarycontactid || '(null)';
    const prog = x[`akoya_programid${FV}`] || '(no program)';
    const era = (x.createdon || '') <= '2023-12-03T23:59:59Z' ? 'MIG' : 'nat';
    const dd = (x.akoya_decisiondate || '').slice(0, 10) || '—';
    const title = String(x.akoya_title || '').replace(/\s+/g, ' ').slice(0, 50);
    console.log(`  #${x.akoya_requestnum} [${era} ${dd}] ${(x.akoya_requeststatus || '—').padEnd(18)} ${prog}`);
    console.log(`     contact: ${pc}   · "${title}"`);
  } else console.log(`  [${s.status} ${JSON.stringify(s.body).slice(0,200)}]`);

  console.log('\nDone (read-only USC primary-contact spot-check).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
