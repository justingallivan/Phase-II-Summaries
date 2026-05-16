#!/usr/bin/env node
/**
 * Puzzle 2 (READ-ONLY) — how are declines recorded, and did it change
 * Blackbaud→AkoyaGO? Hazard-discovery (structural hypotheses, not
 * enumeration), per the Living-taxonomy policy.
 *
 *   H1 backfill: is `akoya_denialreason` import-inflated in migrated (like
 *      akoya_request)? → measure it on rows that CAN'T be declined
 *      (Approved; interaction logs). High ⇒ backfill, not real.
 *   H2 right denominator: among genuinely DECLINED requests
 *      (akoya_requeststatus ∈ declined-class), what fraction carry decline
 *      metadata, and does it differ by era?
 *   H3 field-set stability: is the decline-metadata field SET era-stable, or
 *      did it relocate (reason vs. notes vs. a date)? → discover all
 *      decline-named attributes and measure each per era within declined.
 *   H4 hazard lens: type / null / era-scope of the decline fields.
 *
 * Counts = dated evidence only (Living-taxonomy policy). Only POST is the
 * OAuth token; every Dataverse call is a GET.
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

const MIG = `<condition attribute="createdon" operator="on-or-after" value="2023-12-03T00:00:00Z"/>` +
            `<condition attribute="createdon" operator="on-or-before" value="2023-12-03T23:59:59Z"/>`;
const NAT = `<condition attribute="createdon" operator="gt" value="2023-12-03T23:59:59Z"/>`;
const DECLINED_RX = /declin|ineligible|denied|not invited|rescind/i;

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

async function statusValues(token) {
  const fx = `<fetch aggregate="true"><entity name="akoya_request">` +
    `<attribute name="akoya_requeststatus" alias="v" groupby="true"/>` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/></entity></fetch>`;
  const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
  return (r.ok ? r.body.value : []).map(x => x.v).filter(Boolean);
}

(async () => {
  const token = await getToken();
  console.log('Token acquired.\n');

  // H3 — discover the decline-metadata field set
  const md = await get(token,
    `/EntityDefinitions(LogicalName='akoya_request')/Attributes?$select=LogicalName,AttributeType,DisplayName`);
  const declineFields = [];
  for (const a of (md.ok && md.body.value) || []) {
    const lbl = (a.DisplayName && a.DisplayName.UserLocalizedLabel && a.DisplayName.UserLocalizedLabel.Label) || '';
    if (/deni|declin/i.test(a.LogicalName) || /denial|declin/i.test(lbl)) {
      declineFields.push({ logical: a.LogicalName, type: a.AttributeType, label: lbl });
    }
  }
  console.log('══ H3 — decline-metadata field set (akoya_request) ══');
  for (const f of declineFields) console.log(`  ${f.logical}  [${f.type}]  "${f.label}"`);
  console.log();

  // declined-status set
  const declined = (await statusValues(token)).filter(v => DECLINED_RX.test(v));
  const declinedFilter = `<filter type="or">` +
    declined.map(v => `<condition attribute="akoya_requeststatus" operator="eq" value="${v}"/>`).join('') +
    `</filter>`;
  console.log(`declined-status values (${declined.length}): ${declined.join(' · ')}\n`);

  const fields = [...new Set([...declineFields.map(f => f.logical), 'akoya_decisiondate', 'wmkf_denialnotes'])];

  // H2 — within DECLINED, per-era fill of each decline field
  for (const [coh, label] of [[MIG, 'MIGRATED'], [NAT, 'NATIVE']]) {
    const dn = await aggCount(token, `${coh}${declinedFilter}`);
    console.log(`══ H2 — ${label}: declined n=${dn} — decline-field fill ══`);
    for (const f of fields) {
      const h = await aggCount(token, `${coh}${declinedFilter}<condition attribute="${f}" operator="not-null"/>`);
      if (h == null) { console.log(`  ${f.padEnd(26)} [n/a]`); continue; }
      console.log(`  ${f.padEnd(26)} ${(h / (dn || 1) * 100).toFixed(0).padStart(3)}% (${h}/${dn})`);
    }
    console.log();
  }

  // H1 — backfill test: decline fields on rows that CAN'T be declined
  console.log('══ H1 — backfill test: decline-field fill on NON-declinable rows ══');
  const approved = `<condition attribute="akoya_requeststatus" operator="eq" value="Approved"/>`;
  for (const [coh, label] of [[MIG, 'MIGRATED'], [NAT, 'NATIVE']]) {
    const apTot = await aggCount(token, `${coh}${approved}`);
    for (const f of fields) {
      const h = await aggCount(token, `${coh}${approved}<condition attribute="${f}" operator="not-null"/>`);
      if (h == null) continue;
      const pc = (h / (apTot || 1) * 100).toFixed(0);
      const flag = pc >= 80 ? '  ⚠ backfill-suspect (high on Approved)' : '';
      console.log(`  ${label} Approved (n=${apTot})  ${f.padEnd(24)} ${String(pc).padStart(3)}% (${h})${flag}`);
    }
  }

  console.log('\nDone (read-only decline-recording probe).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
