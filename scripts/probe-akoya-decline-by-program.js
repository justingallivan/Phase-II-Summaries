#!/usr/bin/env node
/**
 * Puzzle 2/2b — PER-PROGRAM decline segmentation (READ-ONLY).
 * The open Track B gating item: every prior Puzzle 2 / 2b number is a
 * WHOLE-ENTITY pooled aggregate, but the finding is research-process-specific
 * (process-is-program-scoped invariant). This probe segments the decline-
 * reason capture by `akoya_programid` (the canonical program axis) × era and
 * tests whether the pooled rates mask large per-program divergence.
 *
 * Hazard-discovery (structural hypotheses, NOT enumeration; Living-taxonomy):
 *
 *   H1 program heterogeneity: within DECLINED, does the EITHER-reason fill
 *      rate vary materially across the top decline-volume programs, or is it
 *      a single ~constant? Flat ⇒ pooled is fine; variable ⇒ the pooled
 *      Puzzle 2/2b number is a fiction and per-program is mandatory.
 *   H2 SoCal field relocation: SoCal-program declines should be LOW on
 *      `akoya_denialreason`+`wmkf_denialnotes` but materially higher on the
 *      SoCal-only field (`wmkf_socalreasonsfordecline2`), and non-SoCal
 *      declines ~0% on it. This proves the existing two-field probe
 *      structurally under-counts SoCal (separate process, separate field).
 *   H3 era × program interaction: is the structured→free-text relocation
 *      (migrated denialreason / native denialnotes) itself program-dependent,
 *      i.e. which program drives the pooled native 8%/47%?
 *
 * Method: grouped FetchXML aggregates (never OData /$count — 5k cap). Per
 * era, ONE grouped count per decline field over the declined cohort, keyed
 * by `akoya_programid` GUID (duplicate program names exist — key by GUID,
 * label by FormattedValue). Pooled re-derivation included so per-program
 * rows provably reconcile to the known Puzzle 2 pooled figures.
 *
 * Counts = dated evidence only. Only POST is the OAuth token; every
 * Dataverse call is a GET.
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
    headers: {
      Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-Version': '4.0',
      Prefer: 'odata.include-annotations="*"',
    },
  });
  const t = await r.text();
  let body; try { body = JSON.parse(t); } catch { body = t; }
  return { status: r.status, ok: r.ok, body };
}

// Whole-entity aggregate count (no groupby) — pooled reconciliation.
async function aggCount(token, fxFilter) {
  const fx = `<fetch aggregate="true"><entity name="akoya_request">` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
    `<filter type="and">${fxFilter}</filter></entity></fetch>`;
  const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
  if (!r.ok) return null;
  return Number(r.body.value && r.body.value[0] && r.body.value[0].c) || 0;
}

// Per-program grouped aggregate count. Returns Map(guid -> { name, c }).
// Keyed by program GUID (the taxonomy has a duplicate name — name-keying
// would silently merge two distinct programs).
async function aggByProgram(token, fxFilter, label) {
  const fx = `<fetch aggregate="true"><entity name="akoya_request">` +
    `<attribute name="akoya_programid" alias="p" groupby="true"/>` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
    `<filter type="and">${fxFilter}</filter></entity></fetch>`;
  const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
  const m = new Map();
  if (r.ok) for (const x of r.body.value || []) {
    const guid = x.p == null ? '(null)' : x.p;
    const name = x['p@OData.Community.Display.V1.FormattedValue'] || (x.p == null ? '(no program)' : guid);
    m.set(guid, { name, c: Number(x.c) || 0 });
  } else console.log(`  [${label} groupby ${r.status} ${typeof r.body === 'string' ? r.body.slice(0, 160) : JSON.stringify(r.body).slice(0, 160)}]`);
  return m;
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
  console.log('Token acquired.');
  console.log(`Probe date: 2026-05-17  (dated evidence — Living-taxonomy policy)\n`);

  // ── decline-metadata field set (reuse Puzzle 2 H3 discovery) ──
  const md = await get(token,
    `/EntityDefinitions(LogicalName='akoya_request')/Attributes?$select=LogicalName,AttributeType,DisplayName`);
  const declineFields = [];
  for (const a of (md.ok && md.body.value) || []) {
    const lbl = (a.DisplayName && a.DisplayName.UserLocalizedLabel && a.DisplayName.UserLocalizedLabel.Label) || '';
    if (/deni|declin/i.test(a.LogicalName) || /denial|declin/i.test(lbl)) {
      declineFields.push({ logical: a.LogicalName, type: a.AttributeType, label: lbl });
    }
  }
  console.log('══ decline-metadata field set (akoya_request) ══');
  for (const f of declineFields) console.log(`  ${f.logical}  [${f.type}]  "${f.label}"`);
  const SOCAL = 'wmkf_socalreasonsfordecline2';
  console.log(`\n  H2 anchor — SoCal-only field "${SOCAL}" present: ` +
    `${declineFields.some(f => f.logical === SOCAL) ? 'YES' : 'NO (H2 cannot be tested)'}\n`);

  // Fields measured per program: the two pooled-probe fields + the SoCal
  // multiselect + the historical-key date. The `*name` companions Dataverse
  // reports as Virtual are NOT SQL-queryable (not-null ⇒ Sql 207 "invalid
  // column") — exclude every Virtual attribute EXCEPT the SoCal multiselect,
  // whose not-null filter empirically resolves. Including a broken virtual in
  // the ANY OR poisons the whole grouped query (0% everywhere = artifact).
  const queryable = declineFields
    .filter(f => f.type !== 'Virtual' || f.logical === SOCAL)
    .map(f => f.logical);
  const FIELDS = [...new Set([
    'akoya_denialreason', 'wmkf_denialnotes', SOCAL,
    ...queryable, 'akoya_decisiondate',
  ])];
  console.log(`  measured fields (Virtual *name companions excluded): ${FIELDS.join(' · ')}\n`);

  // ── declined-status set ──
  const declined = (await statusValues(token)).filter(v => DECLINED_RX.test(v));
  const declinedOr = `<filter type="or">` +
    declined.map(v => `<condition attribute="akoya_requeststatus" operator="eq" value="${v}"/>`).join('') +
    `</filter>`;
  console.log(`declined-status values (${declined.length}): ${declined.join(' · ')}\n`);

  const anyOr = `<filter type="or">` +
    FIELDS.map(f => `<condition attribute="${f}" operator="not-null"/>`).join('') + `</filter>`;

  for (const [coh, eLabel] of [[MIG, 'MIGRATED'], [NAT, 'NATIVE']]) {
    const base = `${coh}${declinedOr}`;

    // pooled re-derivation (must reconcile to known Puzzle 2 figures)
    const pooledN = await aggCount(token, base);
    const pooled = {};
    for (const f of FIELDS) pooled[f] = await aggCount(token, `${base}<condition attribute="${f}" operator="not-null"/>`);
    const pooledAny = await aggCount(token, `${base}${anyOr}`);

    // per-program grouped aggregates: one call per field, keyed by program
    const progN = await aggByProgram(token, base, `${eLabel} declined-by-program`);
    const progField = {};
    for (const f of FIELDS) {
      progField[f] = await aggByProgram(token, `${base}<condition attribute="${f}" operator="not-null"/>`, `${eLabel} ${f}`);
    }
    const progAny = await aggByProgram(token, `${base}${anyOr}`, `${eLabel} ANY`);

    console.log(`══════════════ ${eLabel} — declined per program (n=${pooledN}) ══════════════`);
    const pc = (h, n) => n ? `${(h / n * 100).toFixed(0).padStart(3)}%` : '  —';
    const sorted = [...progN.entries()].sort((a, b) => b[1].c - a[1].c);
    let covered = 0;
    console.log('  program                                 n   reason  notes  socal   ANY   decisiondate');
    for (const [guid, { name, c }] of sorted) {
      covered += c;
      if (c < 15) continue; // small programs rolled into the remainder line below
      const dr = (progField['akoya_denialreason'].get(guid) || { c: 0 }).c;
      const dn = (progField['wmkf_denialnotes'].get(guid) || { c: 0 }).c;
      const sc = (progField[SOCAL] && progField[SOCAL].get(guid) || { c: 0 }).c;
      const an = (progAny.get(guid) || { c: 0 }).c;
      const dd = (progField['akoya_decisiondate'].get(guid) || { c: 0 }).c;
      console.log(`  ${name.slice(0, 38).padEnd(38)} ${String(c).padStart(5)}  ${pc(dr, c)}  ${pc(dn, c)}  ${pc(sc, c)}  ${pc(an, c)}  ${pc(dd, c)}`);
    }
    const small = sorted.filter(([, v]) => v.c < 15);
    const smallN = small.reduce((s, [, v]) => s + v.c, 0);
    if (smallN) console.log(`  (${small.length} program(s) with n<15, pooled)        ${String(smallN).padStart(5)}   — suppressed (low-n noise)`);

    // reconciliation: per-program counts must sum to the pooled denominator
    console.log(`  ── reconciliation: Σ per-program n = ${covered}  vs pooled n = ${pooledN}  ` +
      `${covered === pooledN ? '✓ exact' : '⚠ MISMATCH'}`);
    console.log(`  ── pooled (whole-entity, re-derived): ` +
      `reason ${pc(pooled['akoya_denialreason'], pooledN)} · notes ${pc(pooled['wmkf_denialnotes'], pooledN)} · ` +
      `socal ${pc(pooled[SOCAL], pooledN)} · ANY ${pc(pooledAny, pooledN)} · ` +
      `decisiondate ${pc(pooled['akoya_decisiondate'], pooledN)}`);
    console.log();
  }

  console.log('Read: (H1) wide spread of ANY% across top programs ⇒ pooled Puzzle 2/2b');
  console.log('  number is a fiction; per-program segmentation is mandatory for any');
  console.log('  Track B decline output. (H2) SoCal program high on socal%, ~0 on');
  console.log('  reason/notes, non-SoCal ~0 on socal% ⇒ existing two-field probe');
  console.log('  structurally under-counts SoCal declines. (H3) compare which program');
  console.log('  drives the pooled native reason/notes split.');
  console.log('\nDone (read-only per-program decline-segmentation probe).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
