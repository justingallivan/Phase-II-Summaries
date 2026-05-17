#!/usr/bin/env node
/**
 * Dump the people/PI-role fields + context for one akoya_request by
 * request number (READ-ONLY) — recognition spot-check for the
 * wmkf_projectleader = PI attestation.
 *
 * Usage: node scripts/probe-akoya-request-people.js <requestnum>
 * Only POST is the OAuth token; the Dataverse call is a GET.
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
const RN = process.argv[2] || '1002794';

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

(async () => {
  const token = await getToken();
  console.log(`Token acquired.\nProbe date: 2026-05-17 (dated evidence)  ·  request #${RN}\n`);

  const lookups = ['akoya_applicantid', 'akoya_payee', 'akoya_primarycontactid',
    'wmkf_projectleader', 'wmkf_researchleader', 'wmkf_liaison',
    'wmkf_copi1', 'wmkf_copi2', 'wmkf_copi3', 'wmkf_ceo', 'wmkf_authorizedofficial',
    'wmkf_grantwriter', 'wmkf_paymentcontact', 'akoya_programid', 'wmkf_type'];
  const scalars = ['akoya_requestnum', 'akoya_title', 'akoya_requeststatus',
    'akoya_decisiondate', 'akoya_grant', 'createdon'];
  const sel = [...scalars, ...lookups.map(l => `_${l}_value`)].join(',');

  const r = await get(token, `/akoya_requests?$filter=akoya_requestnum eq '${RN}'&$select=${sel}`);
  if (!r.ok) { console.log(`[${r.status} ${JSON.stringify(r.body).slice(0, 240)}]`); process.exit(1); }
  const x = (r.body.value || [])[0];
  if (!x) { console.log(`request #${RN} not found`); process.exit(0); }

  const era = (x.createdon || '') <= '2023-12-03T23:59:59Z' ? 'MIGRATED' : 'native';
  console.log(`#${x.akoya_requestnum}  "${x.akoya_title || '(no title)'}"`);
  console.log(`  status=${x.akoya_requeststatus || '—'} · type=${x[`_wmkf_type_value${FV}`] || '—'}` +
    ` · program=${x[`_akoya_programid_value${FV}`] || '(no program)'} · ${era}`);
  console.log(`  decisiondate=${(x.akoya_decisiondate || '').slice(0, 10) || '—'} · grant=${x.akoya_grant ?? '—'}\n`);
  console.log('  ── people / role fields ──');
  for (const l of lookups) {
    if (l === 'akoya_programid' || l === 'wmkf_type') continue;
    const v = x[`_${l}_value${FV}`];
    const tgt = x[`_${l}_value@Microsoft.Dynamics.CRM.lookuplogicalname`];
    console.log(`  ${l.padEnd(24)} ${v ? `${v}  [${tgt}]` : '—'}`);
  }
  console.log('\nDone (read-only request-people spot-check).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
