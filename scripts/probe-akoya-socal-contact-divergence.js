#!/usr/bin/env node
/**
 * Track B floor-scoping probe (READ-ONLY) — concrete SoCal 2025 examples
 * where Request Primary Contact ≠ Org Primary Contact (S162 follow-up to
 * probe-akoya-socal-contacts.js, for user web-lookup of who these people are).
 *
 * "2025 applications" = wmkf_meetingdate in calendar 2025 (meeting date is the
 * established canonical board-cycle handle — see the temporal-axis decision;
 * SoCal meeting-date population is ~near-complete). Names come from
 * FormattedValue annotations (no extra contact lookups): Request PC = FV of
 * request.akoya_primarycontactid; Org PC = FV of (applicant) account
 * .primarycontactid; Org Leader = FV of request.wmkf_ceo; Org = FV of
 * request.akoya_applicantid. Kept: both present AND different contact GUID.
 *
 * Only the OAuth token call is a POST; every Dataverse call is a GET.
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

const FV = '@OData.Community.Display.V1.FormattedValue';

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
  const r = await fetch(`${process.env.DYNAMICS_URL}/api/data/v9.2${urlPath}`, {
    headers: {
      Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-Version': '4.0',
      Prefer: 'odata.include-annotations="*"',
    },
  });
  const t = await r.text();
  let body; try { body = JSON.parse(t); } catch { body = t; }
  return { status: r.status, ok: r.ok, body };
}

(async () => {
  const token = await getToken();
  console.log(`Token acquired. Run ${new Date().toISOString()} (read-only).`);

  // SoCal wmkf_grantprogram GUID
  const gp = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(
    `<fetch aggregate="true"><entity name="akoya_request">` +
    `<attribute name="wmkf_grantprogram" alias="g" groupby="true"/>` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/></entity></fetch>`)}`);
  let socal = null;
  for (const x of (gp.ok && gp.body.value) || [])
    if (/southern calif/i.test(x[`g${FV}`] || '')) socal = x.g;
  if (!socal) { console.log('[could not resolve SoCal GUID]'); process.exit(1); }
  console.log(`SoCal wmkf_grantprogram = ${socal}\n`);

  // page ALL SoCal requests with meeting date in calendar 2025
  const reqs = [];
  let next = `/akoya_requests?$select=akoya_requestnum,wmkf_meetingdate,` +
    `_akoya_primarycontactid_value,_akoya_applicantid_value,_wmkf_ceo_value` +
    `&$filter=_wmkf_grantprogram_value eq ${socal}` +
    ` and wmkf_meetingdate ge 2025-01-01 and wmkf_meetingdate lt 2026-01-01`;
  while (next) {
    const r = await get(token, next.startsWith('http')
      ? next.replace(`${process.env.DYNAMICS_URL}/api/data/v9.2`, '') : next);
    if (!r.ok) { console.log(`[page ${r.status}] ${JSON.stringify(r.body).slice(0, 200)}`); break; }
    for (const x of r.body.value || []) reqs.push(x);
    next = r.body['@odata.nextLink'] || null;
  }
  console.log(`SoCal 2025 (meeting date in 2025) requests: ${reqs.length}`);

  // applicant accounts → primary contact (+ name) via annotations
  const acctIds = [...new Set(reqs.map(r => r._akoya_applicantid_value).filter(Boolean))];
  const acct = new Map();
  for (let i = 0; i < acctIds.length; i += 20) {
    const filt = acctIds.slice(i, i + 20).map(id => `accountid eq ${id}`).join(' or ');
    const r = await get(token, `/accounts?$select=accountid,name,_primarycontactid_value&$filter=${encodeURIComponent(filt)}`);
    if (r.ok) for (const x of r.body.value || [])
      acct.set(x.accountid, {
        name: x.name,
        pc: x._primarycontactid_value || null,
        pcName: x[`_primarycontactid_value${FV}`] || null,
      });
  }

  // keep: both present AND different contact GUID
  const diverge = [];
  let bothN = 0;
  for (const r of reqs) {
    const reqPC = r._akoya_primarycontactid_value || null;
    const a = r._akoya_applicantid_value ? acct.get(r._akoya_applicantid_value) : null;
    const orgPC = a?.pc || null;
    if (reqPC && orgPC) {
      bothN++;
      if (reqPC !== orgPC) diverge.push({
        n: r.akoya_requestnum,
        md: String(r.wmkf_meetingdate).slice(0, 10),
        org: a?.name || r[`_akoya_applicantid_value${FV}`] || '∅',
        reqPCName: r[`_akoya_primarycontactid_value${FV}`] || '∅',
        orgPCName: a?.pcName || '∅',
        ceo: r[`_wmkf_ceo_value${FV}`] || '∅',
        reqPC, orgPC,
      });
    }
  }
  console.log(`  of those, both-contacts present: ${bothN}; DIVERGENT (req ≠ org): ${diverge.length}\n`);

  const show = diverge.slice(0, 15);
  console.log(`══ ${show.length} example divergent SoCal-2025 applications (web-lookup ready) ══`);
  for (const d of show) {
    console.log(`\n  #${d.n}  (meeting ${d.md})  ${d.org}`);
    console.log(`     Request Primary Contact : ${d.reqPCName}`);
    console.log(`     Org Primary Contact     : ${d.orgPCName}`);
    console.log(`     Organization Leader/CEO : ${d.ceo}`);
    console.log(`     [req PC ${d.reqPC} · org PC ${d.orgPC}]`);
  }
  if (diverge.length > show.length)
    console.log(`\n  …(+${diverge.length - show.length} more divergent; full list in this run's filter if needed)`);

  console.log('\nDone (read-only SoCal-2025 contact-divergence examples).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
