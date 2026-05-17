#!/usr/bin/env node
/**
 * Track B residual (i) — AkoyaGO export-surface ENUMERATION (READ-ONLY).
 *
 * "I don't know what I don't know" antidote: do not rely on staff memory of
 * which views/reports they trust. AkoyaGO *is* the Dataverse environment, so
 * its trusted views, personal views, reports, and Excel templates are all
 * first-class records. Enumerate the entire export surface from live state;
 * the human residual then collapses from RECALL ("describe the views") to
 * RECOGNITION ("mark which of these N concrete definitions are trusted").
 *
 * Enumerates, for the export-relevant entities (akoya_request + related):
 *   - savedquery     : system / public / advanced-find / lookup views
 *   - userquery      : personal saved views (owner = whose export it is)
 *   - report         : SSRS/Power-BI reports (the CSO ~5,000-row pull lives here?)
 *   - documenttemplate: Excel / Word export templates (hardcoded column sets)
 *
 * For each: name, owner, type, the column SET (decoded from layoutxml, falling
 * back to fetchxml <attribute>), and the filter conditions (fetchxml).
 *
 * Privilege fragility is expected (cf. S156 /audits block): every entity query
 * FAILS LOUD per-entity and a coverage summary is printed — nothing is silently
 * skipped. Output is dated evidence (living-taxonomy "counts = dated evidence").
 *
 * Usage: node scripts/probe-akoya-saved-views.js
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

// Export-relevant entities. akoya_request is primary; the rest are joined in
// real exports (applicant org, program taxonomy, contact). NOTE: `akoya_grant`
// / `akoya_originalgrantamount` are Money *fields ON akoya_request*, not their
// own entity — any real awarded-grant entity will surface empirically via the
// JOINS extracted from trusted views, so we don't guess its name here.
const ENTITIES = ['akoya_request', 'akoya_program', 'account', 'contact'];

// savedquery.querytype is a bitmask; label the common ones for the recognition pass.
const QUERYTYPE = {
  0: 'Public view',
  1: 'Advanced Find / user',
  2: 'Associated view',
  4: 'Quick Find',
  8: 'Reserved(8)',
  16: 'Reserved(16)',
  64: 'Lookup view',
  128: 'SM AppointmentBook',
  512: 'Outlook Filters',
  1024: 'Address Book Filters',
  2048: 'Saved query (Outlook templates)',
  4096: 'InteractiveWorkflow',
  8192: 'Offline Filters',
  16384: 'Offline template',
};
const qtLabel = (n) => QUERYTYPE[n] || `bitmask ${n}`;
const DOCTYPE = { 1: 'Excel', 2: 'Word' };

// Honest failure taxonomy — do NOT blanket-label every non-200 as a privilege
// gap (S157 active-doubt rule). A 400 "not in MetadataCache" is a wrong entity
// name; a 400 "Could not find a property" is a bad $select; only 403 / principal
// / unauthorized is an actual service-principal privilege gap.
function classifyFailure(status, err) {
  const e = String(err || '');
  if (status === 403 || /unauthoriz|principal|privilege|access is denied|do not have|SecLib/i.test(e))
    return 'PRIVILEGE GAP (service principal lacks read — needs grant or Connor enumeration)';
  if (/not found in .*MetadataCache|was not found|with namemapping/i.test(e))
    return 'BAD ENTITY NAME (probe bug — not a privilege gap; entity does not exist by that logical name)';
  if (/Could not find a property named/i.test(e))
    return 'BAD $SELECT (probe bug — not a privilege gap; column does not exist on this entity)';
  return `OTHER (${status} — inspect; not auto-classified as privilege)`;
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

// GET one page (caller follows @odata.nextLink).
async function getRaw(token, urlOrPath) {
  const url = urlOrPath.startsWith('http')
    ? urlOrPath
    : `${process.env.DYNAMICS_URL}/api/data/v9.2${urlOrPath}`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-Version': '4.0',
      Prefer: 'odata.include-annotations="*"',
    },
  });
  const t = await r.text();
  let body; try { body = JSON.parse(t); } catch { body = t; }
  return { status: r.status, ok: r.ok, body };
}

// Paged collection fetch with a hard page cap (never trust unbounded paging —
// surface `capped` instead, consistent with the Track B $count invariant).
const MAX_PAGES = 50;
async function getAll(token, urlPath) {
  let next = urlPath, pages = 0;
  const rows = [];
  while (next) {
    const res = await getRaw(token, next);
    if (!res.ok) {
      return { ok: false, status: res.status, rows,
        err: typeof res.body === 'string' ? res.body.slice(0, 240)
          : (res.body && res.body.error && res.body.error.message) || JSON.stringify(res.body).slice(0, 240) };
    }
    for (const v of res.body.value || []) rows.push(v);
    next = res.body['@odata.nextLink'];
    if (++pages >= MAX_PAGES) return { ok: true, status: 200, rows, capped: true };
  }
  return { ok: true, status: 200, rows };
}

// --- lightweight, dependency-free XML extraction (matches the probe convention) ---

// Column SET: prefer layoutxml <cell name="...">; fall back to fetchxml <attribute name="...">.
function extractColumns(layoutxml, fetchxml) {
  const cols = [];
  if (layoutxml) {
    const re = /<cell\b[^>]*\bname=["']([^"']+)["']/gi;
    let m; while ((m = re.exec(layoutxml))) cols.push(m[1]);
  }
  if (cols.length) return { cols, src: 'layoutxml' };
  if (fetchxml) {
    const re = /<attribute\b[^>]*\bname=["']([^"']+)["']/gi;
    let m; while ((m = re.exec(fetchxml))) cols.push(m[1]);
  }
  return { cols, src: cols.length ? 'fetchxml' : 'none' };
}

// Filter conditions: every <condition>, with the link-entity it lives under (if any).
function extractFilters(fetchxml) {
  if (!fetchxml) return { conditions: [], links: [], allAttr: false };
  const conditions = [];
  const reC = /<condition\b([^>]*?)\/?>/gi;
  let m;
  while ((m = reC.exec(fetchxml))) {
    const attrs = m[1];
    const g = (n) => { const x = attrs.match(new RegExp(`\\b${n}=["']([^"']*)["']`, 'i')); return x ? x[1] : ''; };
    conditions.push({
      entity: g('entityname'), attribute: g('attribute'),
      operator: g('operator'), value: g('value'),
    });
  }
  const links = [];
  const reL = /<link-entity\b([^>]*?)>/gi;
  while ((m = reL.exec(fetchxml))) {
    const a = m[1];
    const g = (n) => { const x = a.match(new RegExp(`\\b${n}=["']([^"']*)["']`, 'i')); return x ? x[1] : ''; };
    links.push({ name: g('name'), from: g('from'), to: g('to'), alias: g('alias') });
  }
  return { conditions, links, allAttr: /<all-attributes\s*\/?>/i.test(fetchxml) };
}

function printQuery(idx, q, labelMap) {
  const cols = extractColumns(q.layoutxml, q.fetchxml);
  const f = extractFilters(q.fetchxml);
  const ann = (c) => labelMap && labelMap[c] ? `${c} ("${labelMap[c]}")` : c;
  console.log(`  [${idx}] ${q.name || '(unnamed)'}`);
  console.log(`      kind=${q.kind}  type=${q.typeLabel}  default=${q.isdefault === true}  owner=${q.owner || '—'}  id=${q.id}`);
  if (cols.cols.length) {
    console.log(`      COLUMNS (${cols.cols.length}, from ${cols.src}): ${cols.cols.map(ann).join(' | ')}`);
  } else {
    console.log(`      COLUMNS: ${f.allAttr ? '<all-attributes/> (every field)' : '(none decodable)'}`);
  }
  if (f.links.length) {
    console.log(`      JOINS: ${f.links.map((l) => `${l.name}${l.alias ? ` (${l.alias})` : ''} on ${l.from}=${l.to}`).join(' ; ')}`);
  }
  if (f.conditions.length) {
    console.log(`      FILTERS (${f.conditions.length}):`);
    for (const c of f.conditions) {
      const where = c.entity ? `${c.entity}.` : '';
      console.log(`        - ${where}${c.attribute} ${c.operator}${c.value !== '' ? ` "${c.value}"` : ''}`);
    }
  } else {
    console.log(`      FILTERS: (none — unfiltered / all rows)`);
  }
  console.log();
}

(async () => {
  const token = await getToken();
  console.log(`AkoyaGO export-surface enumeration — ${new Date().toISOString()}`);
  console.log(`Probe: scripts/probe-akoya-saved-views.js (READ-ONLY)\n`);

  const coverage = [];
  const FV = '@OData.Community.Display.V1.FormattedValue';

  // akoya_request attribute labels — annotate columns for the recognition pass.
  let labelMap = {};
  const md = await getRaw(token,
    `/EntityDefinitions(LogicalName='akoya_request')/Attributes?$select=LogicalName,DisplayName`);
  if (md.ok) {
    for (const a of md.body.value || []) {
      const lbl = a.DisplayName && a.DisplayName.UserLocalizedLabel && a.DisplayName.UserLocalizedLabel.Label;
      if (lbl) labelMap[a.LogicalName] = lbl;
    }
    console.log(`akoya_request attribute label map: ${Object.keys(labelMap).length} fields\n`);
  } else {
    console.log(`⚠️  akoya_request attribute metadata unreadable (${md.status}) — columns shown as logical names only.\n`);
  }

  // ── savedquery (system/public views) ──────────────────────────────────────
  for (const ent of ENTITIES) {
    const r = await getAll(token,
      `/savedqueries?$filter=returnedtypecode eq '${ent}'` +
      `&$select=name,savedqueryid,querytype,fetchxml,layoutxml,isdefault,isquickfindquery,description`);
    if (!r.ok) {
      const why = classifyFailure(r.status, r.err);
      coverage.push(`savedquery[${ent}]: ⚠️ ${r.status} — ${why} :: ${r.err}`);
      console.log(`══ savedquery — ${ent} ══  ⚠️ ${why} (${r.status}): ${r.err}\n`);
      continue;
    }
    coverage.push(`savedquery[${ent}]: ✅ ${r.rows.length}${r.capped ? ' (CAPPED at page limit)' : ''}`);
    // Histogram by querytype so the recognition pass sees signal vs noise at a glance.
    const hist = {};
    for (const q of r.rows) { const k = qtLabel(q.querytype); hist[k] = (hist[k] || 0) + 1; }
    const histStr = Object.entries(hist).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}=${n}`).join(', ');
    console.log(`══ savedquery — ${ent} (${r.rows.length}${r.capped ? ', CAPPED' : ''}) ══`);
    console.log(`   querytype histogram: ${histStr}`);
    console.log(`   ▸ Public view (querytype 0) = the trusted-export candidates; lookup/quickfind/associated = noise.\n`);
    const mapped = r.rows.map((q) => ({
      name: q.name, id: q.savedqueryid, kind: 'savedquery', querytype: q.querytype,
      typeLabel: qtLabel(q.querytype) + (q.isquickfindquery ? ' [quickfind]' : ''),
      isdefault: q.isdefault, owner: 'org (system)', fetchxml: q.fetchxml, layoutxml: q.layoutxml,
    }));
    const isCandidate = (q) => q.querytype === 0; // Public views only
    const candidates = mapped.filter(isCandidate).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const noise = mapped.filter((q) => !isCandidate(q)).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    console.log(`  ── PUBLIC VIEWS — trusted-export candidates (${candidates.length}) ──\n`);
    candidates.forEach((q, i) => printQuery(i + 1, q, ent === 'akoya_request' ? labelMap : null));
    console.log(`  ── NON-PUBLIC (lookup/quickfind/associated/advanced-find) — names only, ${noise.length} (noise unless a recognition surprise) ──`);
    for (const q of noise) console.log(`    · [${q.typeLabel}] ${q.name || '(unnamed)'}  id=${q.id}`);
    console.log();
  }

  // ── userquery (personal saved views — owner tells us whose export it is) ───
  for (const ent of ENTITIES) {
    const r = await getAll(token,
      `/userqueries?$filter=returnedtypecode eq '${ent}'` +
      `&$select=name,userqueryid,querytype,fetchxml,layoutxml,description,_ownerid_value`);
    if (!r.ok) {
      const why = classifyFailure(r.status, r.err);
      coverage.push(`userquery[${ent}]: ⚠️ ${r.status} — ${why} :: ${r.err}`);
      console.log(`══ userquery — ${ent} ══  ⚠️ ${why} (${r.status}): ${r.err}\n`);
      continue;
    }
    coverage.push(`userquery[${ent}]: ✅ ${r.rows.length}${r.capped ? ' (CAPPED)' : ''}`);
    console.log(`══ userquery (personal) — ${ent} (${r.rows.length}${r.capped ? ', CAPPED' : ''}) ══\n`);
    r.rows
      .map((q) => ({
        name: q.name, id: q.userqueryid, kind: 'userquery',
        typeLabel: qtLabel(q.querytype), isdefault: false,
        owner: q[`_ownerid_value${FV}`] || q._ownerid_value || '?',
        fetchxml: q.fetchxml, layoutxml: q.layoutxml,
      }))
      .sort((a, b) => (a.owner || '').localeCompare(b.owner || ''))
      .forEach((q, i) => printQuery(i + 1, q, ent === 'akoya_request' ? labelMap : null));
  }

  // ── report (all — names/descriptions; the CSO bulk pull likely lives here) ─
  {
    // Minimal near-certain select — this org's `report` lacks reportcategory/
    // querytype; name+description+filename is all the recognition pass needs.
    const r = await getAll(token,
      `/reports?$select=name,description,reportid,filename,ispersonal,_ownerid_value&$orderby=name`);
    if (!r.ok) {
      const why = classifyFailure(r.status, r.err);
      coverage.push(`report: ⚠️ ${r.status} — ${why} :: ${r.err}`);
      console.log(`══ report (ALL) ══  ⚠️ ${why} (${r.status}): ${r.err}\n`);
    } else {
      coverage.push(`report: ✅ ${r.rows.length}${r.capped ? ' (CAPPED)' : ''}`);
      console.log(`══ report — ALL (${r.rows.length}${r.capped ? ', CAPPED' : ''}) ══`);
      console.log(`   (RDL dataset/parameter surface lives in report.bodytext — fetched per-report in Step B for the`);
      console.log(`    recognition-confirmed request-export reports only, not bulk-dumped here)\n`);
      for (const rep of r.rows) {
        const own = rep[`_ownerid_value${FV}`] || '';
        console.log(`  • ${rep.name}${rep.filename ? `  [${rep.filename}]` : ''}` +
          `  ${rep.ispersonal ? 'PERSONAL ' : ''}${own ? `owner=${own}` : ''}`.trimEnd());
        if (rep.description) console.log(`      ${String(rep.description).replace(/\s+/g, ' ').slice(0, 200)}`);
      }
      console.log();
    }
  }

  // ── documenttemplate (Excel/Word export templates — hardcoded column sets) ─
  {
    const r = await getAll(token,
      `/documenttemplates?$select=name,documenttemplateid,documenttype,associatedentitytypecode,status&$orderby=name`);
    if (!r.ok) {
      const why = classifyFailure(r.status, r.err);
      coverage.push(`documenttemplate: ⚠️ ${r.status} — ${why} :: ${r.err}`);
      console.log(`══ documenttemplate ══  ⚠️ ${why} (${r.status}): ${r.err}\n`);
    } else {
      coverage.push(`documenttemplate: ✅ ${r.rows.length}${r.capped ? ' (CAPPED)' : ''}`);
      const rel = r.rows.filter((d) => ENTITIES.includes(d.associatedentitytypecode));
      console.log(`══ documenttemplate — ${rel.length} on export-relevant entities (of ${r.rows.length} total) ══\n`);
      for (const d of rel) {
        console.log(`  • ${d.name}  [${DOCTYPE[d.documenttype] || `type ${d.documenttype}`}]  entity=${d.associatedentitytypecode}  id=${d.documenttemplateid}`);
      }
      if (rel.length !== r.rows.length) {
        console.log(`\n  (others, non-export entities, name only:)`);
        for (const d of r.rows.filter((x) => !ENTITIES.includes(x.associatedentitytypecode))) {
          console.log(`    - ${d.name} [${DOCTYPE[d.documenttype] || d.documenttype}] (${d.associatedentitytypecode})`);
        }
      }
      console.log();
    }
  }

  console.log('══ COVERAGE SUMMARY (fail-loud — nothing silently skipped) ══');
  for (const c of coverage) console.log(`  ${c}`);
  const failed = coverage.filter((c) => c.includes('⚠️'));
  const privilege = failed.filter((c) => c.includes('PRIVILEGE GAP'));
  const probeBug = failed.filter((c) => c.includes('probe bug'));
  console.log(`\n  ${coverage.length - failed.length}/${coverage.length} surfaces readable; ${failed.length} failed.`);
  console.log(`    of failures: ${privilege.length} genuine privilege gap, ${probeBug.length} probe bug, ${failed.length - privilege.length - probeBug.length} other.`);
  if (privilege.length) {
    console.log('  Genuine privilege gaps need a service-principal read grant or Connor enumeration.');
  }
  if (probeBug.length) {
    console.log('  Probe-bug failures are NOT a data/access limitation — they are a wrong entity name or $select and');
    console.log('  must be fixed in the probe, not reported as "blocked" (S157 active-doubt rule).');
  }
  console.log('\nDone (read-only enumeration probe — Step A of residual (i)).');
})().catch((e) => { console.error('PROBE ERROR:', e.message); process.exit(1); });
