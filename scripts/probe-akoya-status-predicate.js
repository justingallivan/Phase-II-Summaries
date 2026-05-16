#!/usr/bin/env node
/**
 * Track B / Artifact 3 follow-up (READ-ONLY): find a NON-CIRCULAR decided-state
 * predicate to replace the tautological "akoya_decisiondate IS NOT NULL" proxy.
 *
 * The disclosure-layer `NOT YET DECIDED` sentinel currently rides on
 * decisiondate-presence, which is circular for decisiondate itself and only a
 * proxy for the others. A real status field with a "Pending"/"in review"
 * value would be an independent predicate — IF it partitions cleanly against
 * decisiondate (pending ⇒ no decision date; non-pending ⇒ decision date).
 *
 * Steps:
 *  1. Distributions of the status candidates (`akoya_requeststatus` String,
 *     `statuscode` Status optionset w/ labels, `statecode` State) in BOTH
 *     cohorts (migrated createdon=2023-12-03 vs native after).
 *  2. For every value whose label/text looks pending/in-flight, cross-tab it
 *     against `akoya_decisiondate` presence in the NATIVE cohort to measure
 *     how clean a decided predicate it is.
 *
 * Only POST is the OAuth token; every Dataverse call is a GET.
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
const PENDING_RX = /pending|in[ -]?review|under[ -]?review|submitted|in[ -]?progress|^open$|awaiting|draft|received/i;

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

// value -> label for a Status/Picklist attribute
async function optionMap(token, field) {
  for (const kind of ['StatusAttributeMetadata', 'PicklistAttributeMetadata', 'StateAttributeMetadata']) {
    const r = await get(token,
      `/EntityDefinitions(LogicalName='akoya_request')/Attributes(LogicalName='${field}')/` +
      `Microsoft.Dynamics.CRM.${kind}?$select=LogicalName&$expand=OptionSet($select=Options)`);
    if (r.ok && r.body.OptionSet && r.body.OptionSet.Options) {
      const m = {};
      for (const o of r.body.OptionSet.Options) {
        m[o.Value] = (o.Label && o.Label.UserLocalizedLabel && o.Label.UserLocalizedLabel.Label) || String(o.Value);
      }
      return m;
    }
  }
  return null; // string field — no optionset
}

async function distro(token, field, cohortFilter) {
  const fx = `<fetch aggregate="true"><entity name="akoya_request">` +
    `<attribute name="${field}" alias="v" groupby="true"/>` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
    `<filter type="and">${cohortFilter}</filter></entity></fetch>`;
  const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
  if (!r.ok) return null;
  return (r.body.value || []).map(x => ({ v: x.v, c: Number(x.c) || 0 }))
    .sort((a, b) => b.c - a.c);
}

(async () => {
  const token = await getToken();
  console.log('Token acquired.\n');

  const candidates = ['akoya_requeststatus', 'statuscode', 'statecode'];
  for (const f of candidates) {
    const omap = await optionMap(token, f);
    console.log(`══ ${f} ${omap ? '(optionset)' : '(string)'} ══`);
    for (const [coh, label] of [[MIG, 'migrated'], [NAT, 'native']]) {
      const d = await distro(token, f, coh);
      console.log(`  — ${label} —`);
      if (!d) { console.log('    [query failed]'); continue; }
      for (const row of d.slice(0, 18)) {
        const lab = omap && omap[row.v] !== undefined ? `${row.v}=${omap[row.v]}`
          : (row.v == null ? '(null)' : row.v);
        const flag = PENDING_RX.test(String(omap ? omap[row.v] : row.v)) ? '  ⟵ pending-like' : '';
        console.log(`    ${String(row.c).padStart(6)}  ${lab}${flag}`);
      }
    }
    console.log();
  }

  // Cross-tab the pending-like values (native cohort) vs decisiondate presence.
  console.log('══ pending-like value × decisiondate (NATIVE cohort) — is it a clean decided predicate? ══');
  const natTot = await aggCount(token, NAT);
  const natDecided = await aggCount(token, `${NAT}<condition attribute="akoya_decisiondate" operator="not-null"/>`);
  console.log(`  native total=${natTot}; with decisiondate=${natDecided}; without=${natTot - natDecided}\n`);

  for (const f of candidates) {
    const omap = await optionMap(token, f);
    const d = await distro(token, f, NAT);
    if (!d) continue;
    for (const row of d) {
      const text = String(omap ? omap[row.v] : row.v);
      if (row.v == null || !PENDING_RX.test(text)) continue;
      const valCond = `<condition attribute="${f}" operator="eq" value="${row.v}"/>`;
      const inVal = await aggCount(token, NAT + valCond);
      const inValNoDec = await aggCount(token,
        `${NAT}${valCond}<condition attribute="akoya_decisiondate" operator="null"/>`);
      const inValDec = inVal - inValNoDec;
      // contamination: rows NOT in this value but ALSO with no decisiondate
      const notValNoDec = (natTot - natDecided) - inValNoDec;
      console.log(`  ${f} = "${text}" (${row.v}), native n=${inVal}:`);
      console.log(`    no decisiondate : ${inValNoDec}/${inVal} (${(inValNoDec / (inVal || 1) * 100).toFixed(0)}%)  ← want ~100% (pending ⇒ undecided)`);
      console.log(`    has decisiondate: ${inValDec}/${inVal} (${(inValDec / (inVal || 1) * 100).toFixed(0)}%)  ← want ~0% (leakage)`);
      console.log(`    undecided rows NOT covered by this value: ${notValNoDec} (of ${natTot - natDecided} undecided) ← want ~0 for a complete predicate`);
    }
  }
  console.log('\nDone (read-only status-predicate probe).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
