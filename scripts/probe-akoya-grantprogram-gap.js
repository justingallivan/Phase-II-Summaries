#!/usr/bin/env node
/**
 * Puzzle 3 (READ-ONLY) — is the migrated `wmkf_grantprogram` ~20%-null gap
 * mapping-loss, never-captured, or not-a-real-gap? Hazard-discovery,
 * structural hypotheses (Living-taxonomy policy). Counts = dated evidence.
 *
 * Within the MIGRATED cohort, decompose wmkf_grantprogram-null rows:
 *   H-a NOT-A-GAP (field choice): do they have the authoritative
 *       `akoya_programid` ("Internal Program") populated anyway? program
 *       known, just in the other axis ⇒ not lost.
 *   H-b NO-PROGRAM-EXPECTED: are they non-grant types (wmkf_type Site/Office
 *       Visit; wmkf_request_type Concept/interaction)? a program wouldn't
 *       apply ⇒ not a gap.
 *   H-c GENUINE NULL (both program fields null) → decade of akoya_decisiondate
 *       tells never-captured (old-concentrated) vs mapping-loss (uniform).
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
const NULLGP = `<condition attribute="wmkf_grantprogram" operator="null"/>`;

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

  const migTot = await aggCount(token, MIG);
  const nullGp = await aggCount(token, MIG + NULLGP);
  console.log(`migrated total = ${migTot}; wmkf_grantprogram NULL = ${nullGp} (${(nullGp / migTot * 100).toFixed(0)}%)\n`);

  // H-a: of null-grantprogram migrated rows, how many have akoya_programid?
  const haveProgId = await aggCount(token, MIG + NULLGP + `<condition attribute="akoya_programid" operator="not-null"/>`);
  console.log(`H-a NOT-A-GAP: of ${nullGp} null-grantprogram, akoya_programid PRESENT = ${haveProgId} (${(haveProgId / nullGp * 100).toFixed(0)}%) ⇒ program known via the authoritative axis, not lost`);

  // H-b: of the remainder (null grantprogram AND null programid), non-grant types?
  const bothNull = nullGp - haveProgId;
  const concept = await aggCount(token, MIG + NULLGP + `<condition attribute="akoya_programid" operator="null"/><condition attribute="akoya_requesttype" operator="ne" value="Grant"/>`);
  // wmkf_type non-Program (operational) within both-null
  console.log(`\nboth program fields NULL = ${bothNull}`);
  console.log(`  of those, akoya_requesttype != 'Grant' (scholarship/interfund/etc.) = ${concept}`);

  // H-c: decade of akoya_decisiondate among genuine-null (both program fields null)
  const GENUINE = MIG + NULLGP + `<condition attribute="akoya_programid" operator="null"/>`;
  const fx = `<fetch aggregate="true"><entity name="akoya_request">` +
    `<attribute name="akoya_decisiondate" alias="y" groupby="true" dategrouping="year"/>` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
    `<filter type="and">${GENUINE}</filter></entity></fetch>`;
  const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
  console.log(`\nH-c GENUINE-NULL (both fields null, n=${bothNull}) — akoya_decisiondate by decade:`);
  if (r.ok) {
    const dec = {}; let tot = 0, noDate = 0;
    for (const x of r.b.value || []) {
      const y = Number(x['y.year'] ?? x.y); const c = Number(x.c) || 0; tot += c;
      if (!y) { noDate += c; continue; }
      const d = Math.floor(y / 10) * 10; dec[d] = (dec[d] || 0) + c;
    }
    for (const d of Object.keys(dec).sort()) console.log(`   ${d}s: ${dec[d]}`);
    console.log(`   (no decisiondate): ${noDate}   [total ${tot}]`);
    console.log('   old-concentrated ⇒ never-captured-in-Blackbaud; uniform ⇒ mapping-loss');
  } else console.log(`   [${r.status}]`);

  console.log('\nDone (read-only grantprogram-gap probe).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
