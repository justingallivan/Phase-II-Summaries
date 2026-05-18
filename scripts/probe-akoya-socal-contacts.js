#!/usr/bin/env node
/**
 * Track B floor-scoping probe (READ-ONLY) — SoCal contact structure (S162,
 * user-anchored on request #1001159):
 *
 *   #1001159 (user-observed in AkoyaGO UI): "Org Primary Contact" = Kellye
 *   Ross; "Request Primary Contact" = Kellye Ross (same); "Organization
 *   Leader" = Leah Hanes (the CEO). "Org Leader == President/CEO in research."
 *
 * PART A — Rosetta: introspect #1001159 to pin the UI-label → logical-field
 *   mapping definitively (request-level vs applicant-account-level contact;
 *   CEO). Anchor on the known labeled record before trusting any field.
 *
 * PART B — For SoCal (wmkf_grantprogram = Southern California), is there
 *   ALWAYS both an Org Primary Contact (applicant account.primarycontactid)
 *   AND a Request Primary Contact (akoya_request.akoya_primarycontactid), and
 *   are they ALWAYS the same person? Native SoCal is ~681 rows → a true
 *   CENSUS (not a sample). FetchXML can't compare two attributes, so this is
 *   a paged join computed in JS — honest census of native (current process);
 *   migrated SoCal noted as a follow-up, not silently pooled.
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

const NAT = `<condition attribute="createdon" operator="gt" value="2023-12-03T23:59:59Z"/>`;
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

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : 'n/a');

(async () => {
  const token = await getToken();
  console.log(`Token acquired. Run ${new Date().toISOString()} (read-only).`);

  const RSEL = '_akoya_primarycontactid_value,_wmkf_ceo_value,_wmkf_projectleader_value,' +
    '_akoya_applicantid_value,akoya_requestnum,createdon';

  // ── PART A — Rosetta on #1001159 ──
  console.log(`\n══ PART A — #1001159 label→field Rosetta ══`);
  let a = await get(token, `/akoya_requests?$select=${RSEL}&$filter=akoya_requestnum eq '1001159'&$top=1`);
  if (a.ok && !(a.body.value || []).length)
    a = await get(token, `/akoya_requests?$select=${RSEL}&$filter=akoya_requestnum eq 1001159&$top=1`);
  const rec = a.ok && (a.body.value || [])[0];
  if (!rec) {
    console.log(`  [request 1001159 not found: ${a.status} ${JSON.stringify(a.body).slice(0, 200)}]`);
  } else {
    const reqPC = rec._akoya_primarycontactid_value;
    const era = String(rec.createdon).slice(0, 10) === '2023-12-03' ? 'migrated' : 'native';
    console.log(`  request #${rec.akoya_requestnum}  (era: ${era}, createdon ${String(rec.createdon).slice(0,10)})`);
    console.log(`  Request Primary Contact  akoya_primarycontactid = ${reqPC} (${rec[`_akoya_primarycontactid_value${FV}`] || '∅'})`);
    console.log(`  Organization Leader      wmkf_ceo               = ${rec._wmkf_ceo_value} (${rec[`_wmkf_ceo_value${FV}`] || '∅'})`);
    console.log(`  (research PI)            wmkf_projectleader     = ${rec._wmkf_projectleader_value} (${rec[`_wmkf_projectleader_value${FV}`] || '∅'})`);
    const acctId = rec._akoya_applicantid_value;
    console.log(`  Applicant account        akoya_applicantid      = ${acctId} (${rec[`_akoya_applicantid_value${FV}`] || '∅'})`);
    if (acctId) {
      const ac = await get(token, `/accounts(${acctId})?$select=name,_primarycontactid_value`);
      if (ac.ok) {
        const orgPC = ac.body._primarycontactid_value;
        console.log(`  Org Primary Contact      account.primarycontactid = ${orgPC} (${ac.body[`_primarycontactid_value${FV}`] || '∅'})`);
        console.log(`  → Request PC == Org PC ? ${reqPC && orgPC && reqPC === orgPC ? 'YES (same contact GUID)' : 'NO / one missing'}`);
      } else console.log(`  [account ${ac.status}]`);
    }
  }

  // ── resolve SoCal wmkf_grantprogram GUID via aggregate groupby ──
  const gp = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(
    `<fetch aggregate="true"><entity name="akoya_request">` +
    `<attribute name="wmkf_grantprogram" alias="g" groupby="true"/>` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/></entity></fetch>`)}`);
  let socalGuid = null;
  for (const x of (gp.ok && gp.body.value) || [])
    if (/southern calif/i.test(x[`g${FV}`] || '')) socalGuid = x.g;
  console.log(`\n══ PART B — native SoCal census (wmkf_grantprogram=Southern California ${socalGuid}) ══`);
  if (!socalGuid) { console.log('  [could not resolve SoCal grantprogram GUID]'); process.exit(0); }

  // ── page ALL native SoCal requests (census) ──
  const reqs = [];
  let next = `/akoya_requests?$select=akoya_requestnum,_akoya_primarycontactid_value,_akoya_applicantid_value,createdon` +
    `&$filter=_wmkf_grantprogram_value eq ${socalGuid} and createdon gt 2023-12-03T23:59:59Z&$top=500`;
  while (next) {
    const r = await get(token, next.startsWith('http')
      ? next.replace(`${process.env.DYNAMICS_URL}/api/data/v9.2`, '') : next);
    if (!r.ok) { console.log(`  [page ${r.status}] ${JSON.stringify(r.body).slice(0,200)}`); break; }
    for (const x of r.body.value || []) reqs.push(x);
    next = r.body['@odata.nextLink'] || null;
  }
  console.log(`  native SoCal requests (census): ${reqs.length}`);

  // ── batch-fetch applicant accounts' primary contact ──
  const acctIds = [...new Set(reqs.map(r => r._akoya_applicantid_value).filter(Boolean))];
  const acctPC = new Map(); // accountId -> { pc, name }
  for (let i = 0; i < acctIds.length; i += 20) {
    const chunk = acctIds.slice(i, i + 20);
    const filt = chunk.map(id => `accountid eq ${id}`).join(' or ');
    const r = await get(token, `/accounts?$select=accountid,name,_primarycontactid_value&$filter=${encodeURIComponent(filt)}`);
    if (r.ok) for (const x of r.body.value || [])
      acctPC.set(x.accountid, { pc: x._primarycontactid_value || null, name: x.name });
  }

  // ── compute co-presence + same-person agreement ──
  let hasReqPC = 0, hasAppl = 0, hasOrgPC = 0, hasBoth = 0, same = 0;
  const diverge = [], noOrg = [];
  for (const r of reqs) {
    const reqPC = r._akoya_primarycontactid_value || null;
    const acct = r._akoya_applicantid_value;
    const orgPC = acct ? (acctPC.get(acct)?.pc || null) : null;
    if (reqPC) hasReqPC++;
    if (acct) hasAppl++;
    if (orgPC) hasOrgPC++;
    if (reqPC && orgPC) {
      hasBoth++;
      if (reqPC === orgPC) same++;
      else if (diverge.length < 5) diverge.push({ n: r.akoya_requestnum, reqPC, orgPC, org: acctPC.get(acct)?.name });
    } else if (reqPC && acct && !orgPC && noOrg.length < 5) {
      noOrg.push({ n: r.akoya_requestnum, org: acctPC.get(acct)?.name });
    }
  }
  const N = reqs.length;
  console.log(`\n  Request Primary Contact present : ${hasReqPC}/${N}  (${pct(hasReqPC, N)})`);
  console.log(`  Applicant account present       : ${hasAppl}/${N}  (${pct(hasAppl, N)})`);
  console.log(`  Org Primary Contact present     : ${hasOrgPC}/${N}  (${pct(hasOrgPC, N)})  [account.primarycontactid]`);
  console.log(`  BOTH present                    : ${hasBoth}/${N}  (${pct(hasBoth, N)})`);
  console.log(`  of BOTH, SAME contact GUID      : ${same}/${hasBoth}  (${pct(same, hasBoth)})`);
  console.log(`  of BOTH, DIFFERENT person       : ${hasBoth - same}/${hasBoth}  (${pct(hasBoth - same, hasBoth)})`);
  if (diverge.length) {
    console.log(`\n  sample DIVERGENT (reqPC ≠ orgPC):`);
    for (const d of diverge) console.log(`    #${d.n}  ${d.org}  req=${d.reqPC}  org=${d.orgPC}`);
  }
  if (noOrg.length) {
    console.log(`\n  sample reqPC present but org has NO primary contact:`);
    for (const d of noOrg) console.log(`    #${d.n}  ${d.org}`);
  }

  console.log('\nDone (read-only SoCal contact-structure probe; native = census, migrated = follow-up).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
