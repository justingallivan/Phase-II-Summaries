#!/usr/bin/env node
/**
 * (b) PI-field thread (READ-ONLY) — is the actual scientist/PI modeled in
 * a dedicated field distinct from akoya_primarycontactid (the foundation
 * liaison, S159)? If a PI field is well-populated AND carries the
 * scientist, it is a NEW default column and reopens the Unknown-1
 * contract + changes the Primary-Contact caption.
 *
 *  1. fill per era: wmkf_researchleader / wmkf_projectleader / wmkf_copi1
 *  2. which programs populate it (process-is-program-scoped)
 *  3. DECISIVE: USC + Caltech native rows — does researchleader/
 *     projectleader VARY per grant (the scientist, tracks the title)
 *     while primarycontact stays the recurring liaison?
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
const C = (f) => `<fetch aggregate="true"><entity name="akoya_request"><attribute name="akoya_requestid" alias="c" aggregate="count"/>${f ? `<filter type="and">${f}</filter>` : ''}</entity></fetch>`;
const A = (token, fx) => get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`).then(r => r.ok ? Number(r.body.value?.[0]?.c) || 0 : null);

(async () => {
  const token = await getToken();
  console.log('Token acquired.\nProbe date: 2026-05-17 (dated evidence)\n');
  const PI = ['wmkf_researchleader', 'wmkf_projectleader', 'wmkf_copi1', 'akoya_primarycontactid'];

  console.log('══ 1. fill per era ══');
  const tot = await A(token, C(''));
  const mig = await A(token, C(MIG)), nat = await A(token, C(NAT));
  console.log(`  (total ${tot} · migrated ${mig} · native ${nat})`);
  for (const f of PI) {
    const o = await A(token, C(`<condition attribute="${f}" operator="not-null"/>`));
    const m = await A(token, C(`${MIG}<condition attribute="${f}" operator="not-null"/>`));
    const n = await A(token, C(`${NAT}<condition attribute="${f}" operator="not-null"/>`));
    console.log(`  ${f.padEnd(24)} overall ${String(o).padStart(6)} (${(o/tot*100).toFixed(0)}%)  mig ${(m/mig*100).toFixed(0)}%  nat ${(n/nat*100).toFixed(0)}%`);
  }

  console.log('\n══ 2. wmkf_researchleader fill by program (process-is-program-scoped) ══');
  const gfx = `<fetch aggregate="true" top="14"><entity name="akoya_request">` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
    `<attribute name="akoya_programid" alias="p" groupby="true"/>` +
    `<filter><condition attribute="wmkf_researchleader" operator="not-null"/></filter>` +
    `<order alias="c" descending="true"/></entity></fetch>`;
  const g = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(gfx)}`);
  if (g.ok) for (const x of g.body.value || [])
    console.log(`  ${String(x.c).padStart(5)}  ${x[`p${FV}`] || '(no program)'}`);
  else console.log(`  [${g.status}]`);

  // 3. decisive content test — USC + Caltech native, side by side
  for (const org of ['University of Southern California', 'California Institute of Technology']) {
    const fx = `/akoya_requests?$top=14&$select=akoya_requestnum,akoya_title,_wmkf_researchleader_value,_wmkf_projectleader_value,_akoya_primarycontactid_value,akoya_decisiondate` +
      `&$filter=createdon gt 2023-12-03T23:59:59Z and akoya_applicantid/name eq '${org.replace(/'/g, "''")}'&$orderby=akoya_decisiondate desc`;
    const s = await get(token, fx);
    console.log(`\n══ 3. ${org} — native, PI fields vs primary contact ══`);
    if (!s.ok) { console.log(`  [${s.status} ${JSON.stringify(s.body).slice(0,160)}]`); continue; }
    for (const x of s.body.value || []) {
      const rl = x[`_wmkf_researchleader_value${FV}`] || '—';
      const pl = x[`_wmkf_projectleader_value${FV}`] || '—';
      const pc = x[`_akoya_primarycontactid_value${FV}`] || '—';
      const t = String(x.akoya_title || '').replace(/\s+/g, ' ').slice(0, 46);
      console.log(`  #${x.akoya_requestnum} "${t}"`);
      console.log(`     researchLeader=${rl}  · projectLeader=${pl}  · primaryContact=${pc}`);
    }
  }
  console.log('\nRead: researchLeader/projectLeader VARYING with the title while');
  console.log('primaryContact stays the recurring liaison ⇒ PI IS modeled separately');
  console.log('⇒ candidate NEW default column (reopens Unknown-1).');
  console.log('\nDone (read-only PI-field probe).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
