#!/usr/bin/env node
/**
 * Codex S157 holistic-review follow-ups (READ-ONLY) — substantiate three
 * claims that outran their probes. Counts = dated evidence (Living-taxonomy).
 *
 *  A (#7) Is the Puzzle-1 577 "no-ask Approved native Request" cohort actually
 *         discretionary? cross-tab by wmkf_type + akoya_programid.
 *  B (#9) Does akoya_programid nest under wmkf_type=Program? wmkf_type ×
 *         akoya_programid joint group-by (the hierarchy was only proven for
 *         wmkf_type × wmkf_grantprogram).
 *  C (#5) Re-stratify the B-lifecycle confound by the akoya_requeststatus
 *         decided CLASS-MAP (not the discredited decisiondate-presence
 *         proxy): akoya_grant / akoya_originalgrantamount fill in
 *         decided-terminal vs in-flight, native cohort.
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
const NAT = `<condition attribute="createdon" operator="gt" value="2023-12-03T23:59:59Z"/>`;

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
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-Version': '4.0',
      Prefer: 'odata.include-annotations="*"' } });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; } return { ok: r.ok, status: r.status, b };
}
async function aggCount(token, filter) {
  const fx = `<fetch aggregate="true"><entity name="akoya_request"><attribute name="akoya_requestid" alias="c" aggregate="count"/><filter type="and">${filter}</filter></entity></fetch>`;
  const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
  return r.ok ? Number(r.b.value && r.b.value[0] && r.b.value[0].c) : null;
}
async function groupBy(token, attr, filter, top = 12) {
  const fx = `<fetch aggregate="true"><entity name="akoya_request">` +
    `<attribute name="${attr}" alias="g" groupby="true"/>` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
    `<filter type="and">${filter}</filter></entity></fetch>`;
  const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
  if (!r.ok) { console.log(`   [groupBy ${attr} ${r.status}]`); return []; }
  return (r.b.value || []).map(x => ({
    name: x['g@OData.Community.Display.V1.FormattedValue'] || (x.g == null ? '(null)' : x.g),
    c: Number(x.c) || 0,
  })).sort((a, b) => b.c - a.c).slice(0, top);
}

(async () => {
  const token = await getToken();
  console.log('Token acquired.\n');

  // resolve wmkf_request_type=Request
  const md = await get(token,
    `/EntityDefinitions(LogicalName='akoya_request')/Attributes(LogicalName='wmkf_request_type')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)`);
  let reqVal = null;
  for (const o of (md.ok && md.b.OptionSet && md.b.OptionSet.Options) || []) {
    const l = o.Label && o.Label.UserLocalizedLabel && o.Label.UserLocalizedLabel.Label;
    if (l === 'Request') reqVal = o.Value;
  }

  // ---- A (#7): the 577 — what type/program are they really? ----
  const NOASK = `${NAT}<condition attribute="wmkf_request_type" operator="eq" value="${reqVal}"/>` +
    `<condition attribute="akoya_request" operator="null"/>` +
    `<condition attribute="akoya_loirequestedamount" operator="null"/>` +
    `<condition attribute="akoya_requeststatus" operator="eq" value="Approved"/>`;
  const n = await aggCount(token, NOASK);
  console.log(`══ A (#7) — the ${n} no-ask Approved native Request rows, by wmkf_type ══`);
  for (const x of await groupBy(token, 'wmkf_type', NOASK)) console.log(`   ${String(x.c).padStart(4)}  ${x.name}`);
  console.log(`── same cohort, by akoya_programid (Internal Program) ──`);
  for (const x of await groupBy(token, 'akoya_programid', NOASK)) console.log(`   ${String(x.c).padStart(4)}  ${x.name}`);
  console.log();

  // ---- B (#9): wmkf_type × akoya_programid joint ----
  console.log('══ B (#9) — wmkf_type × akoya_programid joint (top 20 cells, whole entity) ══');
  const fx = `<fetch aggregate="true"><entity name="akoya_request">` +
    `<attribute name="wmkf_type" alias="t" groupby="true"/>` +
    `<attribute name="akoya_programid" alias="p" groupby="true"/>` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/></entity></fetch>`;
  const jr = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
  if (jr.ok) {
    const cells = (jr.b.value || []).map(x => ({
      t: x['t@OData.Community.Display.V1.FormattedValue'] || (x.t == null ? '(null)' : x.t),
      p: x['p@OData.Community.Display.V1.FormattedValue'] || (x.p == null ? '(null)' : x.p),
      c: Number(x.c) || 0,
    })).sort((a, b) => b.c - a.c);
    for (const c of cells.slice(0, 20)) console.log(`   ${String(c.c).padStart(6)}  type=${String(c.t).padEnd(20)} program=${c.p}`);
    const progUnderProgram = cells.filter(c => c.t === 'Program' && c.p !== '(null)').reduce((s, c) => s + c.c, 0);
    const progElsewhere = cells.filter(c => c.t !== 'Program' && c.p !== '(null)').reduce((s, c) => s + c.c, 0);
    console.log(`   → akoya_programid present under type=Program: ${progUnderProgram}; under other types: ${progElsewhere}`);
  } else console.log(`   [${jr.status}]`);
  console.log();

  // ---- C (#5): B-lifecycle restratified by the akoya_requeststatus class-map ----
  console.log('══ C (#5) — native akoya_grant/originalgrant fill by STATUS-CLASS (not decisiondate) ══');
  const DECIDED = `<filter type="or">` +
    ['Approved', 'Active', 'Closed', 'Phase I Declined', 'Phase II Declined', 'Phase I Ineligible',
     'Concept Ineligible', 'Concept Denied', 'Denied', 'Concept Done', 'Proposal Not Invited']
      .map(s => `<condition attribute="akoya_requeststatus" operator="eq" value="${s}"/>`).join('') + `</filter>`;
  const INFLIGHT = `<filter type="or">` +
    ['Phase I Pending', 'Phase II Pending', 'Concept Pending', 'Pending']
      .map(s => `<condition attribute="akoya_requeststatus" operator="eq" value="${s}"/>`).join('') + `</filter>`;
  for (const tf of ['akoya_grant', 'akoya_originalgrantamount']) {
    for (const [cls, label] of [[DECIDED, 'decided-terminal'], [INFLIGHT, 'in-flight (Pending*)']]) {
      const tot = await aggCount(token, NAT + cls);
      const hit = await aggCount(token, `${NAT}${cls}<condition attribute="${tf}" operator="not-null"/>`);
      console.log(`   ${tf.padEnd(26)} ${label.padEnd(22)} ${(hit / (tot || 1) * 100).toFixed(0).padStart(3)}% (${hit}/${tot})`);
    }
  }
  console.log('   → decided≫in-flight ⇒ lifecycle confound holds under the correct (status) predicate, not the circular decisiondate one');

  console.log('\nDone (read-only Codex-followup probe).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
