#!/usr/bin/env node
/**
 * Track B residual (i) Step B — TRUSTED RDL REPORT DEFINITIONS (READ-ONLY).
 *
 * The enumeration probe (scripts/probe-akoya-saved-views.js, 2026-05-16) surfaced
 * the report surface. This pulls report.bodytext (the RDL XML) for the
 * recognition-shortlisted trusted reports and digests each into its EXECUTABLE
 * definition — the actual export contract, not prose:
 *   - dataset query CommandText (the real filter + source: Filtered* view / fetch)
 *   - dataset Field list (the column SET the report binds)
 *   - ReportParameters (the operator-facing filter surface)
 *
 * Shortlist = WMKF-bespoke owner-attributed RDLs (Keck-* / SoCal-* / PGL, incl.
 * the one owned by Connor) + the grant/request analytical reports. report.bodytext
 * is plain RDL XML (ntext), not base64 (that is bodybinary).
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

// Recognition shortlist — exact report names from akoyago-saved-views-2026-05-16.txt.
const SHORTLIST = [
  // WMKF-bespoke (owner = Bromelkamp Admin / Connor Noda)
  'Keck – Application History Report',
  'Keck - History Report',
  'Keck- Phase 1 Application Received',
  'Keck- Phase I Recommendations by Staff',
  'Keck- Phase II Recommendations By Staff',
  'SoCal Application Log',
  'SoCal Application Log II',
  'SoCal Application Submitted Reviewers',
  'PGL',
  // grant / request analytical (vendor-stock but request-export relevant)
  'Grant Denial and Application List by Applicant Name',
  'Grant Denial and Application List by Decision Date',
  'Grant Denial and Application List by Grant Amount',
  'Grant Docket',
  'Grants by Program',
  'Grants by Program with Pie Chart',
  'Grants Budget FY Summary',
  'Pending Requests by Program',
  'Pending LOIs by Program',
  'Pending Funding Opportunities',
  'Request Outcomes by Measure',
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

const stripCdata = (s) => String(s).replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();

function digestRdl(rdl) {
  const out = { datasets: [], params: [] };
  const dsRe = /<DataSet\s+Name="([^"]+)">([\s\S]*?)<\/DataSet>/gi;
  let m;
  while ((m = dsRe.exec(rdl))) {
    const [, name, inner] = m;
    const ct = inner.match(/<CommandText>([\s\S]*?)<\/CommandText>/i);
    const fields = [];
    const fRe = /<Field\s+Name="([^"]+)"[^>]*>([\s\S]*?)<\/Field>|<Field\s+Name="([^"]+)"\s*\/>/gi;
    let fm;
    while ((fm = fRe.exec(inner))) {
      const fname = fm[1] || fm[3];
      const dfBlock = fm[2] || '';
      const df = dfBlock.match(/<DataField>([^<]*)<\/DataField>/i);
      fields.push(df && df[1] && df[1] !== fname ? `${fname} (=${df[1]})` : fname);
    }
    out.datasets.push({ name, commandText: ct ? stripCdata(ct[1]) : '(none)', fields });
  }
  const pRe = /<ReportParameter\s+Name="([^"]+)">([\s\S]*?)<\/ReportParameter>/gi;
  while ((m = pRe.exec(rdl))) {
    const pr = m[2].match(/<Prompt>([^<]*)<\/Prompt>/i);
    const dt = m[2].match(/<DataType>([^<]*)<\/DataType>/i);
    out.params.push(`${m[1]}${pr ? ` "${pr[1]}"` : ''}${dt ? ` [${dt[1]}]` : ''}`);
  }
  return out;
}

(async () => {
  const token = await getToken();
  console.log(`Trusted RDL report definitions — ${new Date().toISOString()}`);
  console.log(`Probe: scripts/probe-akoya-report-defs.js (READ-ONLY)  |  shortlist=${SHORTLIST.length}\n`);

  const filter = SHORTLIST.map((n) => `name eq '${n.replace(/'/g, "''")}'`).join(' or ');
  const res = await get(token,
    `/reports?$filter=${encodeURIComponent(`(${filter})`)}&$select=name,bodytext,filename,description,ispersonal,_ownerid_value`);
  if (!res.ok) {
    console.error(`reports query failed: ${res.status} ${typeof res.body === 'string' ? res.body.slice(0, 300) : JSON.stringify(res.body).slice(0, 300)}`);
    process.exit(1);
  }
  const rows = res.body.value || [];
  const found = new Set(rows.map((r) => r.name));
  const missing = SHORTLIST.filter((n) => !found.has(n));

  for (const rep of rows.sort((a, b) => a.name.localeCompare(b.name))) {
    const owner = rep['_ownerid_value@OData.Community.Display.V1.FormattedValue'] || rep._ownerid_value || '?';
    console.log(`\n════════════════════════════════════════════════════════════════════`);
    console.log(`▌ ${rep.name}   [${rep.filename || '—'}]`);
    console.log(`▌ owner=${owner}${rep.ispersonal ? '  PERSONAL' : ''}`);
    if (rep.description) console.log(`▌ ${String(rep.description).replace(/\s+/g, ' ').slice(0, 220)}`);
    console.log(`════════════════════════════════════════════════════════════════════`);
    if (!rep.bodytext) { console.log('  (no bodytext — likely a sub-report wrapper or binary-only)'); continue; }
    const d = digestRdl(rep.bodytext);
    if (!d.datasets.length) console.log('  (no <DataSet> parsed — RDL shape unexpected; raw length=' + rep.bodytext.length + ')');
    for (const ds of d.datasets) {
      console.log(`\n  ── DataSet "${ds.name}" ──`);
      console.log(`  COMMAND (source + filter — the executable definition):`);
      const ctOneLine = ds.commandText.replace(/\s+/g, ' ').trim();
      console.log(`    ${ctOneLine.slice(0, 1600)}${ctOneLine.length > 1600 ? ' …[truncated]' : ''}`);
      console.log(`  FIELDS (${ds.fields.length}): ${ds.fields.join(' | ')}`);
    }
    if (d.params.length) console.log(`\n  PARAMETERS (${d.params.length}): ${d.params.join(' ; ')}`);
  }

  console.log(`\n\n══ COVERAGE ══`);
  console.log(`  ${rows.length}/${SHORTLIST.length} shortlist reports resolved.`);
  if (missing.length) {
    console.log(`  ⚠️ NOT FOUND (name mismatch or absent — verify against the enumeration evidence):`);
    for (const n of missing) console.log(`    - ${n}`);
  }
  console.log('\nDone (read-only RDL report-definition probe — Step B, reports).');
})().catch((e) => { console.error('PROBE ERROR:', e.message); process.exit(1); });
