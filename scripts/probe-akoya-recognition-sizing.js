#!/usr/bin/env node
/**
 * Track B residual (i) — RECOGNITION-PASS SIZING (READ-ONLY).
 *
 * The recognition pass was asserted "small/tractable" off ONE column
 * (akoya_purpose). That is an overclaim. This probe MEASURES the unknown
 * surface so the v1 posture decision is evidence-based, not vibes:
 *
 *  Unknown 1 — candidate column SET (only 20/116 RDLs were decoded):
 *    decode ALL akoya_request-bound RDLs → full column union → diff vs the
 *    Artifact-1 candidate table. Over-inclusion = union∖candidate (with
 *    RDL-frequency, so noise vs signal is visible); UNDER-inclusion =
 *    high-frequency union columns NOT in the candidate (the real risk the
 *    partial-20 sample could not see).
 *  Unknown 2 — the 139 akoya_request public views (uncharacterized):
 *    enumerate them → distinct column-set fingerprints, filter presence,
 *    name-family breakdown → "139 unknown" becomes "D distinct shapes".
 *  Unknown 3 — filter de-nesting (unsized): per request-RDL classify
 *    prefilter-only (no de-nest) vs embedded-flat vs embedded-NESTED
 *    (AND/OR mix — the genuinely hard ones).
 *
 * Output is a SIZE, not a verdict — "what analysts expect" still needs a
 * human; this says how big that human ask is. Counts = dated evidence.
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

// Artifact-1 candidate column SET (logical names, from the design-doc table).
// account.* join columns folded to their logical leaf.
const CANDIDATE = new Set([
  'akoya_requestnum', 'wmkf_meetingdate', 'akoya_requeststatus', 'wmkf_request_type',
  'akoya_requesttype', 'akoya_applicantid', 'name', 'akoya_aka', 'wmkf_type',
  'akoya_programid', 'akoya_title', 'wmkf_projectleader', 'wmkf_donorname',
  'wmkf_wmkfprojectdescription', 'akoya_grant', 'akoya_request', 'akoya_recommendedamount',
  'wmkf_invitedamount', 'akoya_expenses', 'akoya_decisiondate', 'akoya_denialreason',
  'wmkf_denialnotes', 'wmkf_phaseistatus', 'akoya_fiscalyear',
]);
// Provenance/currency plumbing — expected, not "analyst columns"; bucket separately.
const isPlumbing = (c) => /_base$/.test(c) || /currencyprecision|currencysymbol|^LE_/i.test(c)
  || c === 'akoya_requestid' || c === 'transactioncurrencyid';
// Sub-entity join columns (request→payment / request→review RDLs) are NOT
// core request-export columns — alias-prefixed; bucket out of the union.
const SUBENTITY_PREFIX = /^(RequestPayment|Payment|Review|Reviewer|Contact|Org|Program|Account)_/i;
const isSubEntity = (c) => SUBENTITY_PREFIX.test(c);
// SSRS dataset splits a lookup/money field X into X, XValue, XEntityName (and
// X_baseValue). Collapse to the real logical field so the union counts
// DISTINCT columns, not the binding convention (the S159 inflation fix).
function normalizeCol(c) {
  let s = String(c).trim();
  s = s.replace(/EntityName$/, '').replace(/Value$/, '');
  s = s.replace(/_base$/, '');
  return s;
}

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

async function getRaw(token, urlOrPath) {
  const url = urlOrPath.startsWith('http') ? urlOrPath
    : `${process.env.DYNAMICS_URL}/api/data/v9.2${urlOrPath}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-Version': '4.0',
      Prefer: 'odata.include-annotations="*"' },
  });
  const t = await r.text();
  let body; try { body = JSON.parse(t); } catch { body = t; }
  return { status: r.status, ok: r.ok, body };
}

async function getAll(token, urlPath, maxPages = 60) {
  let next = urlPath, pages = 0; const rows = [];
  while (next) {
    const res = await getRaw(token, next);
    if (!res.ok) return { ok: false, status: res.status, rows,
      err: typeof res.body === 'string' ? res.body.slice(0, 240)
        : (res.body && res.body.error && res.body.error.message) || JSON.stringify(res.body).slice(0, 240) };
    for (const v of res.body.value || []) rows.push(v);
    next = res.body['@odata.nextLink'];
    if (++pages >= maxPages) return { ok: true, rows, capped: true };
  }
  return { ok: true, rows };
}

const stripCdata = (s) => String(s).replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');

// Pull the column contract the RDL binds: prefer dataset <Field><DataField>,
// fall back to fetch <attribute name>. Returns { cols:Set, hasReqEntity, cmd }.
function digest(rdl) {
  const cols = new Set();
  const dsRe = /<DataSet\s+Name="[^"]+">([\s\S]*?)<\/DataSet>/gi;
  let cmd = '';
  let m;
  while ((m = dsRe.exec(rdl))) {
    const inner = m[1];
    const ct = inner.match(/<CommandText>([\s\S]*?)<\/CommandText>/i);
    if (ct) cmd += ' ' + stripCdata(ct[1]);
    const fRe = /<Field\s+Name="([^"]+)"[^>]*>([\s\S]*?)<\/Field>|<Field\s+Name="([^"]+)"\s*\/>/gi;
    let fm;
    while ((fm = fRe.exec(inner))) {
      const df = (fm[2] || '').match(/<DataField>([^<]*)<\/DataField>/i);
      const nm = (df && df[1]) || fm[1] || fm[3];
      if (nm) cols.add(String(nm).trim());
    }
  }
  // fall back / supplement with fetch <attribute>
  const aRe = /<attribute\b[^>]*\bname=["']([^"']+)["']/gi;
  while ((m = aRe.exec(cmd))) cols.add(m[1]);
  const hasReqEntity = /<entity\s+name=["']akoya_request["']|Filteredakoya_request|\bakoya_request\b/i.test(cmd);
  return { cols, hasReqEntity, cmd };
}

// Filter-complexity classifier for a fetch-type command.
function filterClass(cmd) {
  if (!/<fetch/i.test(cmd)) {
    // T-SQL against Filtered* view: WHERE beyond the CRM prefilter token?
    const hasWhere = /\bWHERE\b/i.test(cmd);
    const onlyPrefilter = /CRM_?Filtered/i.test(cmd) && !/\bWHERE\b[\s\S]*\b(AND|OR)\b/i.test(cmd);
    return hasWhere && !onlyPrefilter ? 'sql-where' : 'sql-prefilter-only';
  }
  const prefilter = /enableprefiltering=["']1["']/i.test(cmd);
  const condCount = (cmd.match(/<condition\b/gi) || []).length;
  if (condCount === 0) return prefilter ? 'prefilter-only (no de-nest)' : 'no-filter';
  const filterTags = cmd.match(/<filter\b[^>]*>/gi) || [];
  const hasOr = /<filter\b[^>]*type=["']or["']/i.test(cmd);
  const nested = filterTags.length > 1 || (hasOr && condCount > 1);
  return nested ? 'embedded-NESTED (AND/OR — hard de-nest)' : 'embedded-flat (single AND)';
}

(async () => {
  const token = await getToken();
  const stamp = new Date().toISOString();
  console.log(`Recognition-pass sizing — ${stamp}`);
  console.log(`Probe: scripts/probe-akoya-recognition-sizing.js (READ-ONLY)\n`);

  // akoya_request label map for annotating under-inclusion columns.
  let lbl = {};
  const md = await getRaw(token,
    `/EntityDefinitions(LogicalName='akoya_request')/Attributes?$select=LogicalName,DisplayName`);
  if (md.ok) for (const a of md.body.value || []) {
    const L = a.DisplayName && a.DisplayName.UserLocalizedLabel && a.DisplayName.UserLocalizedLabel.Label;
    if (L) lbl[a.LogicalName] = L;
  }

  // ───────────────── Unknown 1 + 3 : ALL RDLs ─────────────────
  const repList = await getAll(token, `/reports?$select=name,reportid,filename,_ownerid_value&$orderby=name`);
  if (!repList.ok) { console.error(`reports list failed ${repList.status}: ${repList.err}`); process.exit(1); }
  console.log(`══ Unknown 1+3 — RDL decode (ALL ${repList.rows.length} reports, was 20/116) ══\n`);

  const FV = '@OData.Community.Display.V1.FormattedValue';
  const colFreq = new Map();   // column -> # request-RDLs binding it
  const fclassHist = {};
  let reqRdlCount = 0, noBody = 0, fetchErr = 0;
  const reqRdls = [];
  for (const rep of repList.rows) {
    const one = await getRaw(token, `/reports(${rep.reportid})?$select=name,bodytext`);
    if (!one.ok) { fetchErr++; continue; }
    const bt = one.body && one.body.bodytext;
    if (!bt) { noBody++; continue; }
    const d = digest(bt);
    if (!d.hasReqEntity) continue;            // not an akoya_request report
    reqRdlCount++;
    reqRdls.push({ name: rep.name, owner: rep[`_ownerid_value${FV}`] || '', cols: d.cols });
    // collapse the SSRS binding convention + drop sub-entity-join columns, then
    // dedupe per RDL so colFreq = # of request-RDLs binding the DISTINCT field.
    const norm = new Set();
    for (const c of d.cols) {
      if (isSubEntity(c)) continue;
      const n = normalizeCol(c);
      if (n) norm.add(n);
    }
    for (const c of norm) colFreq.set(c, (colFreq.get(c) || 0) + 1);
    const fc = filterClass(d.cmd);
    fclassHist[fc] = (fclassHist[fc] || 0) + 1;
  }
  console.log(`request-bound RDLs: ${reqRdlCount} (of ${repList.rows.length} total reports)` +
    `  · no-bodytext: ${noBody} · fetch-errors: ${fetchErr}\n`);

  // column union vs candidate
  const union = [...colFreq.entries()].sort((a, b) => b[1] - a[1]);
  const analystUnion = union.filter(([c]) => !isPlumbing(c));
  const inCand = analystUnion.filter(([c]) => CANDIDATE.has(c));
  const unionOnly = analystUnion.filter(([c]) => !CANDIDATE.has(c));   // potential UNDER-inclusion
  const candOnly = [...CANDIDATE].filter((c) => !colFreq.has(c));      // candidate cols no RDL binds
  const HI = Math.max(2, Math.ceil(reqRdlCount * 0.15));               // "appears in ≥15% of req-RDLs"
  const mustReview = unionOnly.filter(([, n]) => n >= HI);
  const likelyNoise = unionOnly.filter(([, n]) => n < HI);

  console.log(`column union (analyst cols, excl. _base/currency/id plumbing): ${analystUnion.length}`);
  console.log(`  ✓ in candidate set:        ${inCand.length}`);
  console.log(`  ⚠ UNDER-inclusion review:  ${unionOnly.length} union-only` +
    `  →  ${mustReview.length} high-freq (≥${HI} RDLs) MUST-review · ${likelyNoise.length} low-freq likely-noise`);
  console.log(`  ⚠ candidate cols no RDL binds (over-inclusion / niche): ${candOnly.length}  [${candOnly.join(', ') || '—'}]\n`);

  console.log(`  ── high-frequency UNDER-inclusion candidates (the real Unknown-1 work) ──`);
  for (const [c, n] of mustReview)
    console.log(`    ${String(n).padStart(3)}/${reqRdlCount}  ${c}${lbl[c] ? `  ("${lbl[c]}")` : ''}`);
  if (!mustReview.length) console.log('    (none — partial-20 union already covered the high-frequency columns)');
  console.log(`\n  ── low-freq union-only (skim/likely-prune, akoya_purpose-class): ${likelyNoise.length} ──`);
  console.log(`    ${likelyNoise.slice(0, 40).map(([c, n]) => `${c}:${n}`).join(' · ')}${likelyNoise.length > 40 ? ' …' : ''}\n`);

  console.log(`  ── Unknown 3 — filter-complexity class over ${reqRdlCount} request-RDLs ──`);
  for (const [k, n] of Object.entries(fclassHist).sort((a, b) => b[1] - a[1]))
    console.log(`    ${String(n).padStart(3)}  ${k}`);
  const hard = (fclassHist['embedded-NESTED (AND/OR — hard de-nest)'] || 0);
  console.log(`  → de-nesting work = ${hard} RDL(s) need boolean reconstruction; the rest are prefilter/flat.\n`);

  // ───────────────── Unknown 2 : the 139 public views ─────────────────
  const sv = await getAll(token,
    `/savedqueries?$filter=returnedtypecode eq 'akoya_request'` +
    `&$select=name,savedqueryid,querytype,fetchxml,layoutxml`);
  console.log(`══ Unknown 2 — akoya_request public views ══`);
  if (!sv.ok) { console.log(`  ⚠️ ${sv.status}: ${sv.err}\n`); }
  else {
    const pub = sv.rows.filter((q) => q.querytype === 0);
    const fp = new Map();        // column-set fingerprint -> count
    const fam = {};              // name-family -> count
    let withFilter = 0;
    for (const q of pub) {
      const cm = (q.layoutxml || '').match(/<cell\b[^>]*\bname=["']([^"']+)["']/gi) || [];
      const cols = cm.map((s) => (s.match(/name=["']([^"']+)["']/i) || [])[1]).filter(Boolean).sort();
      const key = cols.join(',') || '(none)';
      fp.set(key, (fp.get(key) || 0) + 1);
      if (/<condition\b/i.test(q.fetchxml || '')) withFilter++;
      const f = (q.name || '').split(/[-–:(]/)[0].trim().split(/\s+/).slice(0, 2).join(' ') || '(blank)';
      fam[f] = (fam[f] || 0) + 1;
    }
    console.log(`  ${pub.length} public views · ${fp.size} DISTINCT column-set shapes · ${withFilter} carry a hardcoded filter\n`);
    console.log(`  ── name families (recognition groups, top 18) ──`);
    for (const [f, n] of Object.entries(fam).sort((a, b) => b[1] - a[1]).slice(0, 18))
      console.log(`    ${String(n).padStart(3)}  ${f}`);
    console.log(`\n  → "139 unknown views" → ${fp.size} distinct shapes to recognize, grouped into the families above.\n`);
  }

  console.log('Read: this SIZES the human ask (columns / views / filters to look at).');
  console.log('It does NOT decide "what analysts expect" — that residual still needs a human.');
  console.log('\nDone (read-only recognition-pass sizing probe).');
})().catch((e) => { console.error('PROBE ERROR:', e.message); process.exit(1); });
