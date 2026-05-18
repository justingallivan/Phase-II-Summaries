#!/usr/bin/env node
/**
 * Track B floor-scoping probe (READ-ONLY). Two questions gating the
 * temporal-axis + Tier-2/Donor scope decisions (S162):
 *
 *  PART 1 — Is `wmkf_meetingdate` universal, or do discretionary / operational
 *  buckets structurally lack it? Whole-entity rate is ≥97% (Artifact 3) but
 *  that is a process-pooled aggregate; the project's first invariant is
 *  "process is program-scoped". So: null-vs-not-null `wmkf_meetingdate`
 *  cross-tabbed by `wmkf_type` (Discretionary lives here) AND by
 *  `wmkf_request_type` (operational interaction logs live here), each split by
 *  era. Plus: of the no-meeting-date `wmkf_type=Discretionary` rows, what
 *  `akoya_requeststatus` are they (are *awarded* discretionary missing it)?
 *
 *  PART 2 — `wmkf_donorname` field SHAPE: String (Tier 1, near-free axis) or
 *  Lookup → wmkf_donors (Tier 2, link-entity work)? Definitive via attribute
 *  metadata; samples best-effort.
 *
 * Only the OAuth token call is a POST; every Dataverse call is a GET.
 * FetchXML aggregate counts only (NEVER OData /$count — caps silently at
 * 5,000). Total entity ~25,561 ≪ 50k aggregate-reliable range.
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

// Era cohorts — the project's verified createdon classifier (atlas:123).
const MIG = `<condition attribute="createdon" operator="on-or-after" value="2023-12-03T00:00:00Z"/>` +
            `<condition attribute="createdon" operator="on-or-before" value="2023-12-03T23:59:59Z"/>`;
const NAT = `<condition attribute="createdon" operator="gt" value="2023-12-03T23:59:59Z"/>`;
const NULL_MD = `<condition attribute="wmkf_meetingdate" operator="null"/>`;

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

// Aggregate count grouped by `attr`, with optional extra filter conditions.
// Returns Map<groupKey,{name,c}> keyed by raw value (lookup GUID / optionset
// int / null sentinel) — never name-keyed (duplicate-label hazard).
async function aggBy(token, attr, conds) {
  const fx = `<fetch aggregate="true"><entity name="akoya_request">` +
    `<attribute name="${attr}" alias="g" groupby="true"/>` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
    (conds ? `<filter type="and">${conds}</filter>` : '') +
    `</entity></fetch>`;
  const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
  const m = new Map();
  if (!r.ok) { console.log(`  [agg ${attr} ${r.status}] ${JSON.stringify(r.body).slice(0, 200)}`); return m; }
  for (const x of r.body.value || []) {
    const key = x.g == null ? '(null)' : String(x.g);
    const name = x['g@OData.Community.Display.V1.FormattedValue'] || (x.g == null ? '(null)' : String(x.g));
    m.set(key, { name, c: Number(x.c) || 0 });
  }
  return m;
}

// Single aggregate count (no groupby) for a condition set.
async function aggCount(token, conds) {
  const fx = `<fetch aggregate="true"><entity name="akoya_request">` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
    (conds ? `<filter type="and">${conds}</filter>` : '') +
    `</entity></fetch>`;
  const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
  if (!r.ok) { console.log(`  [count ${r.status}]`); return null; }
  return Number((r.body.value || [{}])[0].c) || 0;
}

function pct(n, d) { return d ? `${((n / d) * 100).toFixed(1)}%` : 'n/a'; }

function reportCrosstab(title, total, nullByKey, totalByKey) {
  console.log(`\n══ ${title} ══`);
  console.log(`  ${'group'.padEnd(28)} ${'total'.padStart(7)} ${'no-MD'.padStart(7)} ${'no-MD rate'.padStart(11)}`);
  const keys = [...new Set([...totalByKey.keys(), ...nullByKey.keys()])]
    .sort((a, b) => (totalByKey.get(b)?.c || 0) - (totalByKey.get(a)?.c || 0));
  for (const k of keys) {
    const tot = totalByKey.get(k)?.c || 0;
    const nul = nullByKey.get(k)?.c || 0;
    const nm = totalByKey.get(k)?.name || nullByKey.get(k)?.name || k;
    const flag = tot >= 200 && (nul / tot) >= 0.5 ? '  🔴 STRUCTURAL-HOLE' :
                 tot >= 200 && (nul / tot) >= 0.15 ? '  ⚠ partial' : '';
    console.log(`  ${String(nm).slice(0, 28).padEnd(28)} ${String(tot).padStart(7)} ${String(nul).padStart(7)} ${pct(nul, tot).padStart(11)}${flag}`);
  }
}

(async () => {
  const token = await getToken();
  console.log(`Token acquired. Probe run ${new Date().toISOString()} (read-only).\n`);

  // ── Sanity: grand totals (FetchXML aggregate, the true count) ──
  const grand = await aggCount(token, null);
  const grandNull = await aggCount(token, NULL_MD);
  console.log(`Entity total (FetchXML aggregate): ${grand}`);
  console.log(`  wmkf_meetingdate IS NULL        : ${grandNull}  (${pct(grandNull, grand)} of all rows)`);
  console.log(`  wmkf_meetingdate populated      : ${grand - grandNull}  (${pct(grand - grandNull, grand)})`);
  console.log(`  → whole-entity ≥97% claim ${grand && (grand - grandNull) / grand >= 0.97 ? 'HOLDS' : 'does NOT hold'} at probe time.`);

  // ── PART 1a — wmkf_type × meetingdate-null, overall + era ──
  const tTot = await aggBy(token, 'wmkf_type', null);
  const tNull = await aggBy(token, 'wmkf_type', NULL_MD);
  reportCrosstab('PART 1a — no-meeting-date by wmkf_type (Discretionary lives here) — OVERALL',
    grand, tNull, tTot);

  const tTotMig = await aggBy(token, 'wmkf_type', MIG);
  const tNullMig = await aggBy(token, 'wmkf_type', `${MIG}${NULL_MD}`);
  reportCrosstab('PART 1a — by wmkf_type — MIGRATED only', null, tNullMig, tTotMig);

  const tTotNat = await aggBy(token, 'wmkf_type', NAT);
  const tNullNat = await aggBy(token, 'wmkf_type', `${NAT}${NULL_MD}`);
  reportCrosstab('PART 1a — by wmkf_type — NATIVE only', null, tNullNat, tTotNat);

  // ── PART 1b — wmkf_request_type × meetingdate-null (operational logs) ──
  const rtTot = await aggBy(token, 'wmkf_request_type', null);
  const rtNull = await aggBy(token, 'wmkf_request_type', NULL_MD);
  reportCrosstab('PART 1b — no-meeting-date by wmkf_request_type (Office/Site/Phone interaction logs live here) — OVERALL',
    grand, rtNull, rtTot);

  // ── PART 1c — the no-meeting-date Discretionary rows: what STATUS? ──
  // Discretionary is a wmkf_type LOOKUP value; resolve its GUID from tTot, then
  // group the no-MD ∧ that-type cohort by akoya_requeststatus (a String).
  let discKey = null;
  for (const [k, v] of tTot) if (/discretion/i.test(v.name)) discKey = k;
  if (discKey && discKey !== '(null)') {
    const DISC = `<condition attribute="wmkf_type" operator="eq" value="${discKey}"/>`;
    const discTot = await aggCount(token, DISC);
    const discNull = await aggCount(token, `${DISC}${NULL_MD}`);
    console.log(`\n══ PART 1c — wmkf_type=Discretionary (${discKey}) ══`);
    console.log(`  total Discretionary: ${discTot} · no meeting date: ${discNull} (${pct(discNull, discTot)})`);
    const byStatus = await aggBy(token, 'akoya_requeststatus', `${DISC}${NULL_MD}`);
    console.log(`  no-meeting-date Discretionary by akoya_requeststatus:`);
    for (const [, v] of [...byStatus.entries()].sort((a, b) => b[1].c - a[1].c))
      console.log(`    ${String(v.name).slice(0, 30).padEnd(30)} ${String(v.c).padStart(6)}`);
  } else {
    console.log('\n══ PART 1c — could not resolve a Discretionary wmkf_type key (inspect 1a output) ══');
  }

  // ── PART 2 — wmkf_donorname field SHAPE (definitive via metadata) ──
  console.log(`\n══ PART 2 — wmkf_donorname attribute metadata ══`);
  const meta = await get(token,
    `/EntityDefinitions(LogicalName='akoya_request')/Attributes(LogicalName='wmkf_donorname')` +
    `?$select=LogicalName,SchemaName,AttributeType,AttributeTypeName`);
  if (!meta.ok) {
    console.log(`  [metadata ${meta.status}] ${JSON.stringify(meta.body).slice(0, 300)}`);
  } else {
    const at = meta.body.AttributeType;
    const atn = meta.body.AttributeTypeName && meta.body.AttributeTypeName.Value;
    console.log(`  LogicalName : ${meta.body.LogicalName}`);
    console.log(`  SchemaName  : ${meta.body.SchemaName}`);
    console.log(`  AttributeType: ${at}  (${atn})`);
    if (at === 'Lookup' || at === 'Customer' || at === 'Owner') {
      console.log(`  → TIER 2 (lookup — needs a link-entity, like institution→account)`);
      const tg = await get(token,
        `/EntityDefinitions(LogicalName='akoya_request')/Attributes(LogicalName='wmkf_donorname')` +
        `/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=Targets`);
      if (tg.ok) console.log(`  Lookup Targets: ${JSON.stringify(tg.body.Targets || tg.body.value)}`);
    } else if (at === 'String' || at === 'Memo') {
      console.log(`  → TIER 1 (plain string — near-free axis, eq/contains/in)`);
    } else {
      console.log(`  → tier depends on type ${at} — inspect above`);
    }
  }
  // Best-effort live samples (branch-safe: try the plain field, fall back to
  // the _value lookup form on 400).
  let s = await get(token, `/akoya_requests?$select=wmkf_donorname&$filter=wmkf_donorname ne null&$top=5`);
  if (!s.ok) s = await get(token, `/akoya_requests?$select=_wmkf_donorname_value&$filter=_wmkf_donorname_value ne null&$top=5`);
  if (s.ok && (s.body.value || []).length) {
    console.log(`  sample values:`);
    for (const row of s.body.value) {
      const v = row.wmkf_donorname ?? row._wmkf_donorname_value;
      const fv = row['_wmkf_donorname_value@OData.Community.Display.V1.FormattedValue'];
      console.log(`    ${JSON.stringify(v)}${fv ? `  (formatted: ${fv})` : ''}`);
    }
  } else {
    console.log(`  (no non-null sample returned; status ${s.status})`);
  }

  console.log('\nDone (read-only meeting-date-by-type + donor-shape probe).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
