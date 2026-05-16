#!/usr/bin/env node
/**
 * Puzzle 2b (READ-ONLY) — is native decline-reason capture *sporadic*
 * because quick-triage declines go undocumented? Hazard-discovery,
 * structural hypothesis (Living-taxonomy policy).
 *
 * User hypothesis (S157): free-form decline notes are used sporadically —
 * things that get a quick hearing / are triaged out are declined with NO
 * reason recorded even though the field exists.
 *
 * Structural fingerprint if true: decline-reason capture is STAGE-dependent —
 * triage/early outcomes (Concept Denied, *Ineligible, Proposal Not Invited,
 * Phase I Declined) low; substantive late-stage (Phase II Declined, full
 * proposal reviewed) high. Migrated contrast tells whether Blackbaud
 * enforced structured capture regardless of stage (≈uniform high) vs the
 * same stage-dependence.
 *
 * Per declined-status × era: n · akoya_denialreason% · wmkf_denialnotes% ·
 * EITHER%. Counts = dated evidence only. Only POST is the OAuth token.
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
// rough lifecycle order: concept → eligibility → phase I → phase II → other
const STAGE_ORDER = ['Concept Ineligible', 'Concept Denied', 'Phase I Ineligible',
  'Phase I Declined', 'Proposal Not Invited', 'Phase II Declined', 'Denied', 'Rescinded'];

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

async function declinedValues(token) {
  const fx = `<fetch aggregate="true"><entity name="akoya_request">` +
    `<attribute name="akoya_requeststatus" alias="v" groupby="true"/>` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/></entity></fetch>`;
  const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
  return (r.ok ? r.body.value : []).map(x => x.v).filter(v => v && DECLINED_RX.test(v));
}

(async () => {
  const token = await getToken();
  console.log('Token acquired.\n');

  const vals = await declinedValues(token);
  const ordered = [...vals].sort((a, b) => {
    const ia = STAGE_ORDER.indexOf(a), ib = STAGE_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  for (const [coh, label] of [[NAT, 'NATIVE'], [MIG, 'MIGRATED']]) {
    console.log(`══ ${label} — decline-reason capture by stage (triage-early → substantive-late) ══`);
    console.log('   stage                       n   denialreason  denialnotes   EITHER');
    for (const v of ordered) {
      const sc = `${coh}<condition attribute="akoya_requeststatus" operator="eq" value="${v}"/>`;
      const n = await aggCount(token, sc);
      if (!n) continue;
      const dr = await aggCount(token, `${sc}<condition attribute="akoya_denialreason" operator="not-null"/>`);
      const dn = await aggCount(token, `${sc}<condition attribute="wmkf_denialnotes" operator="not-null"/>`);
      const ei = await aggCount(token, `${sc}<filter type="or">` +
        `<condition attribute="akoya_denialreason" operator="not-null"/>` +
        `<condition attribute="wmkf_denialnotes" operator="not-null"/></filter>`);
      const p = (h) => `${(h / n * 100).toFixed(0).padStart(3)}%`;
      console.log(`   ${v.padEnd(24)} ${String(n).padStart(5)}   ${p(dr)} (${String(dr).padStart(4)})  ${p(dn)} (${String(dn).padStart(4)})  ${p(ei)}`);
    }
    console.log();
  }

  console.log('Read: native EITHER% rising from triage-early → substantive-late ⇒ user hypothesis');
  console.log('confirmed (quick-triage declines under-documented). Migrated ≈uniform-high on');
  console.log('denialreason ⇒ Blackbaud enforced structured capture regardless of stage.');
  console.log('\nDone (read-only decline-by-stage probe).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
