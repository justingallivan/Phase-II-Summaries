#!/usr/bin/env node
/**
 * Track B floor-scoping probe (READ-ONLY) — the per-program PERSON-ROLE
 * vocabulary question (S162, user-flagged):
 *
 *   "PI" is research's word; `wmkf_projectleader` is ~0% outside research.
 *   The dangerous failure is not the empty field (measurable/disclosable) but
 *   that OTHER programs may carry a lead-person-equivalent in a DIFFERENT
 *   field — or none. What does SoCal (and discretionary/UE) call its
 *   PI-equivalent? Unknown/unprobed. Guessing "PI = wmkf_projectleader"
 *   silently misses every non-research lead → plausible-wrong export.
 *
 * Deliverable: a population matrix of every grantee-side person lookup on
 * `akoya_request` × `wmkf_grantprogram` (the PROCESS-FAMILY axis — "SoCal"
 * is a clean single value here; the mandated attribution axis is
 * `akoya_programid`, but THIS question is about process vocabulary, so the
 * process-family lookup is the correct segmentation — both reported for the
 * Research/SoCal extremes so the mandate is not silently violated).
 * `wmkf_programdirector` (WMKF-internal staff PD, NOT a grantee lead) is a
 * CONTROL — it should be broadly populated everywhere; if it is, the probe
 * mechanics are sound and a forked grantee-lead field is a real signal.
 * Overall + native passes (native = AkoyaGO-current process — what SoCal
 * calls it NOW; whole-cohort alone is the process-pooled-fiction trap).
 *
 * Also: `wmkf_apprequestperson` junction metadata (the Issue-3 lead-only-vs-
 * any-PI-role fork) — its request FK + role/person fields, definitively.
 *
 * Only the OAuth token call is a POST; every Dataverse call is a GET.
 * FetchXML aggregate counts only (NEVER /$count — silent 5,000 cap).
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

// Grantee-side lead-person candidates + the WMKF-internal control.
const PERSON_FIELDS = [
  ['wmkf_projectleader',   'Project Leader (research PI — user-attested)'],
  ['wmkf_researchleader',  'Research Leader (instit. research officer — NOT PI per S159)'],
  ['wmkf_ceo',             'CEO (org head — possible non-research lead?)'],
  ['akoya_primarycontactid', 'Primary Contact (foundation liaison — broadly populated)'],
  ['wmkf_copi1',           'Co-PI slot 1 (legacy roster slot)'],
  ['wmkf_programdirector', 'CONTROL: WMKF Program Director (internal staff — should be universal)'],
];

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

// count grouped by wmkf_grantprogram, with optional extra conditions.
async function aggByProgram(token, conds) {
  const fx = `<fetch aggregate="true"><entity name="akoya_request">` +
    `<attribute name="wmkf_grantprogram" alias="g" groupby="true"/>` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
    (conds ? `<filter type="and">${conds}</filter>` : '') +
    `</entity></fetch>`;
  const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
  const m = new Map();
  if (!r.ok) { console.log(`  [agg ${r.status}] ${JSON.stringify(r.body).slice(0, 200)}`); return m; }
  for (const x of r.body.value || []) {
    const key = x.g == null ? '(null)' : String(x.g);
    const name = x['g@OData.Community.Display.V1.FormattedValue'] || (x.g == null ? '(null)' : key);
    m.set(name, Number(x.c) || 0); // name-key safe: wmkf_grantprogram has no dup-name hazard
  }
  return m;
}

function pct(n, d) { return d ? `${((n / d) * 100).toFixed(0)}%` : '  -'; }

async function matrix(token, label, cohortCond) {
  const total = await aggByProgram(token, cohortCond);
  const cols = [];
  for (const [field] of PERSON_FIELDS) {
    const nn = `<condition attribute="${field}" operator="not-null"/>`;
    cols.push(await aggByProgram(token, cohortCond ? `${cohortCond}${nn}` : nn));
  }
  const progs = [...total.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
  console.log(`\n══ ${label} — % of program's requests with each person field populated ══`);
  console.log(`  (program rows ≥ 100 only; rate = field-not-null / program total)\n`);
  const head = 'program'.padEnd(26) + 'N'.padStart(7) +
    PERSON_FIELDS.map(([f]) => f.replace('wmkf_', '').replace('akoya_', '').slice(0, 11).padStart(12)).join('');
  console.log('  ' + head);
  console.log('  ' + '-'.repeat(head.length));
  for (const p of progs) {
    const tot = total.get(p) || 0;
    if (tot < 100) continue;
    const cells = cols.map((cm) => pct(cm.get(p) || 0, tot).padStart(12)).join('');
    console.log(`  ${String(p).slice(0, 25).padEnd(26)}${String(tot).padStart(7)}${cells}`);
  }
}

(async () => {
  const token = await getToken();
  console.log(`Token acquired. Run ${new Date().toISOString()} (read-only).`);
  console.log('Legend: ' + PERSON_FIELDS.map(([f, d]) => `\n  ${f} = ${d}`).join(''));

  await matrix(token, 'OVERALL (all eras — process-pooled; read with care)', null);
  await matrix(token, 'NATIVE only (AkoyaGO-current process — what each program calls it NOW)', NAT);

  // ── Issue-3 fork: wmkf_apprequestperson junction schema (definitive) ──
  console.log(`\n══ wmkf_apprequestperson junction — schema for the lead-only-vs-any-PI-role fork ══`);
  const jm = await get(token,
    `/EntityDefinitions(LogicalName='wmkf_apprequestperson')/Attributes` +
    `?$select=LogicalName,AttributeType&$filter=AttributeType eq Microsoft.Dynamics.CRM.AttributeTypeCode'Lookup' or AttributeType eq Microsoft.Dynamics.CRM.AttributeTypeCode'Picklist' or AttributeType eq Microsoft.Dynamics.CRM.AttributeTypeCode'String'`);
  if (!jm.ok) {
    console.log(`  [junction meta ${jm.status}] ${JSON.stringify(jm.body).slice(0, 300)}`);
  } else {
    for (const a of (jm.body.value || []).sort((x, y) => x.LogicalName.localeCompare(y.LogicalName))) {
      console.log(`  ${a.LogicalName.padEnd(40)} ${a.AttributeType}`);
    }
    // total junction rows (true count)
    const jc = await get(token, `/wmkf_apprequestpersons?fetchXml=${encodeURIComponent(
      `<fetch aggregate="true"><entity name="wmkf_apprequestperson"><attribute name="wmkf_apprequestpersonid" alias="c" aggregate="count"/></entity></fetch>`)}`);
    if (jc.ok) console.log(`\n  junction total rows: ${(jc.body.value || [{}])[0].c}`);
  }

  console.log('\nDone (read-only per-program person-role probe).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
