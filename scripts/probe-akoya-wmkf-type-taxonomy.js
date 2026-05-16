#!/usr/bin/env node
/**
 * Track B artifact-2 (type axis) (READ-ONLY) — hazard-discovery, NOT
 * enumeration (per the "Living taxonomy" design invariant). Structural
 * hypotheses tested against `wmkf_type` (Lookup → `wmkf_type`):
 *   H1 era-scoped? (values with 0 migrated ⇒ post-cutover-only)
 *   H2 duplicate names? (→ key-by-GUID hazard, like akoya_program)
 *   H3 operational / non-grant buckets mixed in?
 *   H4 nullable? how many null (vs the form's required-ness)?
 *   H5 distinct axis from `wmkf_grantprogram`, or redundant? (both showed
 *      "Discretionary") — tested via a wmkf_type × wmkf_grantprogram
 *      joint group-by.
 *
 * Value/count output is DATED EVIDENCE only — never hardcode; Track B reads
 * this live. Only POST is the OAuth token; every Dataverse call is a GET.
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

async function aggBy(token, attr, cohort) {
  const fx = `<fetch aggregate="true"><entity name="akoya_request">` +
    `<attribute name="${attr}" alias="g" groupby="true"/>` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
    (cohort ? `<filter type="and">${cohort}</filter>` : '') +
    `</entity></fetch>`;
  const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
  const m = new Map();
  if (r.ok) for (const x of r.body.value || []) {
    const guid = x.g == null ? '(null)' : x.g;
    m.set(guid, { name: x['g@OData.Community.Display.V1.FormattedValue'] || guid, c: Number(x.c) || 0 });
  } else console.log(`  [agg ${attr} ${r.status}]`);
  return m;
}

(async () => {
  const token = await getToken();
  console.log('Token acquired.\n');

  const ed = await get(token,
    `/EntityDefinitions(LogicalName='wmkf_type')?$select=EntitySetName,PrimaryNameAttribute,PrimaryIdAttribute`);
  if (!ed.ok) { console.error(`wmkf_type metadata ${ed.status}`); process.exit(1); }
  const { EntitySetName: set, PrimaryNameAttribute: nameAttr, PrimaryIdAttribute: idAttr } = ed.body;
  console.log(`wmkf_type: set=${set} name=${nameAttr} id=${idAttr}\n`);

  const rows = [];
  let next = `/${set}?$select=${idAttr},${nameAttr},createdon,statecode&$orderby=createdon asc&$top=200`;
  while (next) {
    const r = await get(token, next.startsWith('http') ? next.replace(`${process.env.DYNAMICS_URL}/api/data/v9.2`, '') : next);
    if (!r.ok) { console.log(`[list ${r.status}]`); break; }
    for (const x of r.body.value || []) rows.push({
      id: x[idAttr], name: x[nameAttr], created: x.createdon,
      state: x['statecode@OData.Community.Display.V1.FormattedValue'] || x.statecode,
    });
    next = r.body['@odata.nextLink'] || null;
  }

  const ov = await aggBy(token, 'wmkf_type', null);
  const mg = await aggBy(token, 'wmkf_type', MIG);
  const nt = await aggBy(token, 'wmkf_type', NAT);
  const C = (mp, id) => (mp.get(id) ? mp.get(id).c : 0);

  console.log(`══ wmkf_type taxonomy (${rows.length}) — #req · created · state · name (mig/nat) [dated evidence, not spec] ══`);
  const byName = {};
  for (const p of rows) byName[p.name] = (byName[p.name] || 0) + 1;
  for (const p of rows.sort((a, b) => String(a.created).localeCompare(String(b.created)))) {
    const dup = byName[p.name] > 1 ? '  ⚠DUP-NAME(H2)' : '';
    const era = C(mg, p.id) === 0 && C(nt, p.id) > 0 ? '  ⟵post-cutover-only(H1)'
      : C(nt, p.id) === 0 && C(mg, p.id) > 0 ? '  ⟵legacy-retired(H1)' : '';
    console.log(`  ${String(C(ov, p.id)).padStart(6)}  ${String(p.created).slice(0, 10)}  ${String(p.state).padEnd(8)}  ${p.name}   (mig ${C(mg, p.id)} / nat ${C(nt, p.id)})${dup}${era}`);
  }
  const listed = new Set(rows.map(r => r.id));
  console.log('\nH4 — unmatched / null wmkf_type on requests:');
  for (const [g, { name, c }] of [...ov.entries()].sort((a, b) => b[1].c - a[1].c)) {
    if (!listed.has(g)) console.log(`  ${String(c).padStart(6)}  ${name} (${g})`);
  }

  // H5 — distinct axis vs wmkf_grantprogram? joint group-by.
  console.log('\n══ H5: wmkf_type × wmkf_grantprogram joint distribution (top 20 cells) ══');
  const fx = `<fetch aggregate="true"><entity name="akoya_request">` +
    `<attribute name="wmkf_type" alias="t" groupby="true"/>` +
    `<attribute name="wmkf_grantprogram" alias="p" groupby="true"/>` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/></entity></fetch>`;
  const jr = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
  if (jr.ok) {
    const cells = (jr.body.value || []).map(x => ({
      t: x['t@OData.Community.Display.V1.FormattedValue'] || (x.t == null ? '(null)' : x.t),
      p: x['p@OData.Community.Display.V1.FormattedValue'] || (x.p == null ? '(null)' : x.p),
      c: Number(x.c) || 0,
    })).sort((a, b) => b.c - a.c);
    for (const cell of cells.slice(0, 20)) console.log(`  ${String(cell.c).padStart(6)}  type=${String(cell.t).padEnd(22)} program=${cell.p}`);
    const sameName = cells.filter(c => c.t === c.p).reduce((s, c) => s + c.c, 0);
    const tot = cells.reduce((s, c) => s + c.c, 0);
    console.log(`  → type==program (same label) on ${sameName}/${tot} (${(sameName / tot * 100).toFixed(0)}%) — high ⇒ redundant axes; low ⇒ distinct`);
  }

  console.log('\nDone (read-only wmkf_type hazard-discovery probe).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
