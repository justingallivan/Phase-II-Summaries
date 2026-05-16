#!/usr/bin/env node
/**
 * Puzzle 1 residual (READ-ONLY): why are only ~68% of native `Request`-type
 * rows populated on `akoya_request`? Lead hypothesis: phase-specific field
 * usage — Phase I / LOI requests carry the ask in `akoya_loirequestedamount`;
 * `akoya_request` is the Phase II / full-proposal field. (The
 * `wmkf_proposalbudgetline` child is moot — that is undeployed slice-0 schema,
 * portal not live — so it cannot hold the ask for existing native rows.)
 *
 * Test: within native cohort, wmkf_request_type = Request:
 *   - akoya_request fill, akoya_loirequestedamount fill, and the UNION
 *     (does an ask exist in *either* field?)
 *   - of the rows missing akoya_request: do they have loirequestedamount?
 *     and what is their akoya_requeststatus (Pending/early ⇒ not yet entered)?
 * If (akoya_request OR loirequestedamount) ≈ near-total, the "68%" is not a
 * gap — it is two phase-specific fields, and the puzzle closes.
 *
 * Exact FetchXML aggregate counts. No $count. Only POST is the OAuth token.
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
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-Version': '4.0' },
  });
  const t = await r.text();
  let body; try { body = JSON.parse(t); } catch { body = t; }
  return { status: r.status, ok: r.ok, body };
}

async function aggCount(token, fxFilter) {
  const fx = `<fetch aggregate="true"><entity name="akoya_request">` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
    `<filter type="and">${fxFilter}</filter></entity></fetch>`;
  const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
  if (!r.ok) return null;
  return Number(r.body.value && r.body.value[0] && r.body.value[0].c);
}

async function statusDistro(token, scope) {
  const fx = `<fetch aggregate="true"><entity name="akoya_request">` +
    `<attribute name="akoya_requeststatus" alias="v" groupby="true"/>` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
    `<filter type="and">${scope}</filter></entity></fetch>`;
  const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
  if (!r.ok) return [];
  return (r.body.value || []).map(x => ({ v: x.v, c: Number(x.c) || 0 })).sort((a, b) => b.c - a.c);
}

(async () => {
  const token = await getToken();
  console.log('Token acquired.\n');

  // resolve wmkf_request_type = "Request"
  const meta = await get(token,
    `/EntityDefinitions(LogicalName='akoya_request')/Attributes(LogicalName='wmkf_request_type')/` +
    `Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)`);
  let reqVal = null;
  for (const o of (meta.ok && meta.body.OptionSet && meta.body.OptionSet.Options) || []) {
    const lbl = o.Label && o.Label.UserLocalizedLabel && o.Label.UserLocalizedLabel.Label;
    if (lbl === 'Request') reqVal = o.Value;
  }
  if (reqVal == null) throw new Error('could not resolve wmkf_request_type=Request');
  const REQ = `<condition attribute="wmkf_request_type" operator="eq" value="${reqVal}"/>`;
  const base = NAT + REQ;

  const tot = await aggCount(token, base);
  const hasReq = await aggCount(token, `${base}<condition attribute="akoya_request" operator="not-null"/>`);
  const hasLoi = await aggCount(token, `${base}<condition attribute="akoya_loirequestedamount" operator="not-null"/>`);
  const hasEither = await aggCount(token,
    `${base}<filter type="or">` +
    `<condition attribute="akoya_request" operator="not-null"/>` +
    `<condition attribute="akoya_loirequestedamount" operator="not-null"/></filter>`);
  const hasNeither = tot - hasEither;
  const noReqHasLoi = await aggCount(token,
    `${base}<condition attribute="akoya_request" operator="null"/>` +
    `<condition attribute="akoya_loirequestedamount" operator="not-null"/>`);

  const P = (h) => `${(h / tot * 100).toFixed(0)}% (${h}/${tot})`;
  console.log(`native × wmkf_request_type=Request: n=${tot}`);
  console.log(`  akoya_request not-null            : ${P(hasReq)}`);
  console.log(`  akoya_loirequestedamount not-null : ${P(hasLoi)}`);
  console.log(`  EITHER (an ask exists somewhere)  : ${P(hasEither)}   ← if ≈100%, "68%" is field-split, not a gap`);
  console.log(`  NEITHER (no ask in either field)  : ${P(hasNeither)}`);
  console.log(`  of the akoya_request-null rows, how many carry loirequestedamount: ${noReqHasLoi}`);
  console.log();

  console.log('akoya_requeststatus of the NEITHER set (no ask in either field):');
  const neitherScope = `${base}<condition attribute="akoya_request" operator="null"/>` +
    `<condition attribute="akoya_loirequestedamount" operator="null"/>`;
  for (const row of await statusDistro(token, neitherScope)) {
    console.log(`  ${String(row.c).padStart(4)}  ${row.v == null ? '(null)' : row.v}`);
  }

  // Clincher: do the no-ask rows nonetheless carry an AWARD / payment?
  // If yes ⇒ these are awarded-without-a-stated-request (invited/discretionary
  // giving) — requested-amount is N/A by design, not a data defect.
  const neitherN = hasNeither;
  const neitherGrant = await aggCount(token, `${neitherScope}<condition attribute="akoya_grant" operator="not-null"/>`);
  const neitherPaid = await aggCount(token,
    `${neitherScope}<condition attribute="akoya_paid" operator="not-null"/>` +
    `<condition attribute="akoya_paid" operator="gt" value="0"/>`);
  console.log(`\n  of the ${neitherN} no-ask rows: akoya_grant present ${neitherGrant} (${(neitherGrant / neitherN * 100).toFixed(0)}%) · akoya_paid>0 ${neitherPaid} (${(neitherPaid / neitherN * 100).toFixed(0)}%)`);
  console.log('  ⇒ if grant/paid ≈ high, these are AWARDED-without-a-stated-request (invited/discretionary): requested-amount is N/A by design, not missing data.');
  console.log('\n(read: if NEITHER is small and concentrated in Pending/early statuses,');
  console.log(' the residual is in-flight not-yet-entered, and Puzzle 1 fully closes.)');
  console.log('\nDone (read-only native-Request amount probe).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
