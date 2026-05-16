#!/usr/bin/env node
/**
 * Puzzle 4 (READ-ONLY) — behaviorally classify the decided-state ambiguous
 * middle (`Active` / `Withdrawn` / `Proposal Not Invited`) so the
 * akoya_requeststatus class-map needs less Connor judgement. Hazard-discovery
 * (Living-taxonomy policy); counts = dated evidence.
 *
 * Per status × cohort: n · decisiondate% · akoya_grant% · paid>0% ·
 * akoya_request%. Behavioral signature ⇒ class:
 *   funded-in-progress (grant+paid high)        ⇒ decided-terminal-active
 *   no award/no payment/no decision             ⇒ in-flight or terminal-non-decision
 *
 * Only POST is the OAuth token; every Dataverse call is a GET.
 */

const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (!m) continue;
    let [, k, v] = m; v = v.trim().replace(/^"(.*)"$/, '$1');
    if (!process.env[k]) process.env[k] = v;
  }
}
const MIG = `<condition attribute="createdon" operator="on-or-after" value="2023-12-03T00:00:00Z"/>` +
            `<condition attribute="createdon" operator="on-or-before" value="2023-12-03T23:59:59Z"/>`;
const NAT = `<condition attribute="createdon" operator="gt" value="2023-12-03T23:59:59Z"/>`;

async function getToken() {
  const r = await fetch(`https://login.microsoftonline.com/${process.env.DYNAMICS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.DYNAMICS_CLIENT_ID,
      client_secret: process.env.DYNAMICS_CLIENT_SECRET, scope: `${process.env.DYNAMICS_URL}/.default` }),
  });
  if (!r.ok) throw new Error(`Token: ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}
async function get(token, urlPath) {
  const r = await fetch(`${process.env.DYNAMICS_URL}/api/data/v9.2${urlPath}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-Version': '4.0' } });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; } return { ok: r.ok, status: r.status, b };
}
async function aggCount(token, filter) {
  const fx = `<fetch aggregate="true"><entity name="akoya_request"><attribute name="akoya_requestid" alias="c" aggregate="count"/><filter type="and">${filter}</filter></entity></fetch>`;
  const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
  return r.ok ? Number(r.b.value && r.b.value[0] && r.b.value[0].c) : null;
}

(async () => {
  const token = await getToken();
  console.log('Token acquired.\n');
  const statuses = ['Active', 'Withdrawn', 'Proposal Not Invited'];
  for (const [coh, label] of [[NAT, 'NATIVE'], [MIG, 'MIGRATED']]) {
    console.log(`══ ${label} ══`);
    for (const s of statuses) {
      const base = `${coh}<condition attribute="akoya_requeststatus" operator="eq" value="${s}"/>`;
      const n = await aggCount(token, base);
      if (!n) { console.log(`  ${s.padEnd(22)} n=0`); continue; }
      const dd = await aggCount(token, `${base}<condition attribute="akoya_decisiondate" operator="not-null"/>`);
      const gr = await aggCount(token, `${base}<condition attribute="akoya_grant" operator="not-null"/>`);
      const pd = await aggCount(token, `${base}<condition attribute="akoya_paid" operator="gt" value="0"/>`);
      const rq = await aggCount(token, `${base}<condition attribute="akoya_request" operator="not-null"/>`);
      const P = (h) => `${(h / n * 100).toFixed(0).padStart(3)}%`;
      console.log(`  ${s.padEnd(22)} n=${String(n).padStart(4)}  decisiondate ${P(dd)}  grant ${P(gr)}  paid>0 ${P(pd)}  request ${P(rq)}`);
    }
    console.log();
  }
  console.log('Read: grant+paid high ⇒ funded-in-progress (decided-terminal-active);');
  console.log('all-low ⇒ in-flight / terminal-non-decision (NOT funded).');
  console.log('\nDone (read-only ambiguous-status probe).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
