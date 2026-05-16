#!/usr/bin/env node
/**
 * Track B artifact-2 (program axis) (READ-ONLY): the authoritative
 * `akoya_program` reference taxonomy (target of the `akoya_programid`
 * "Internal Program" lookup) with creation timeline + per-program request
 * volume and era split. Replaces eyeballing the model-driven lookup picker.
 *
 *   - full akoya_program list: name · createdon · state · id
 *   - akoya_request volume per akoya_programid (overall + migrated/native)
 *   - the akoya_program evolution timeline (taxonomy is living, not static)
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

async function aggByProgram(token, cohort, label) {
  const fx = `<fetch aggregate="true"><entity name="akoya_request">` +
    `<attribute name="akoya_programid" alias="p" groupby="true"/>` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
    (cohort ? `<filter type="and">${cohort}</filter>` : '') +
    `</entity></fetch>`;
  const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
  // Key by the program GUID (x.p), NOT the formatted name — the taxonomy has
  // a duplicate name ("Law and Legal Administration"), so name-keying merges
  // two distinct programs. Map: guid -> { name, c }.
  const m = new Map();
  if (r.ok) for (const x of r.body.value || []) {
    const guid = x.p == null ? '(null)' : x.p;
    const name = x['p@OData.Community.Display.V1.FormattedValue'] || guid;
    m.set(guid, { name, c: Number(x.c) || 0 });
  } else console.log(`  [${label} agg ${r.status}]`);
  return m;
}

(async () => {
  const token = await getToken();
  console.log('Token acquired.\n');

  // entity-set + primary-name for akoya_program
  const ed = await get(token,
    `/EntityDefinitions(LogicalName='akoya_program')?$select=EntitySetName,PrimaryNameAttribute`);
  if (!ed.ok) { console.error(`akoya_program metadata ${ed.status}`); process.exit(1); }
  const set = ed.body.EntitySetName, nameAttr = ed.body.PrimaryNameAttribute;
  console.log(`akoya_program: set=${set} nameAttr=${nameAttr}\n`);

  // full taxonomy
  const rows = [];
  const idAttr = 'akoya_programid'; // primary key of akoya_program
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

  const overall = await aggByProgram(token, null, 'overall');
  const mig = await aggByProgram(token, MIG, 'migrated');
  const nat = await aggByProgram(token, NAT, 'native');
  const cnt = (mp, id) => (mp.get(id) ? mp.get(id).c : 0);

  console.log(`══ akoya_program taxonomy (${rows.length} programs) — #req · created · state · name (mig/nat) ══`);
  for (const p of rows.sort((a, b) => String(a.created).localeCompare(String(b.created)))) {
    const dup = rows.filter(q => q.name === p.name).length > 1 ? '  ⚠DUP-NAME' : '';
    console.log(`  ${String(cnt(overall, p.id)).padStart(6)}  ${String(p.created).slice(0, 10)}  ${String(p.state).padEnd(8)}  ${p.name}` +
      `   (mig ${cnt(mig, p.id)} / nat ${cnt(nat, p.id)})${dup}`);
  }

  // request akoya_programid GUIDs not matched to a listed program (or null)
  console.log('\n══ request akoya_programid not matched to a listed program (or null) ══');
  const listed = new Set(rows.map(r => r.id));
  for (const [guid, { name, c }] of [...overall.entries()].sort((a, b) => b[1].c - a[1].c)) {
    if (!listed.has(guid)) console.log(`  ${String(c).padStart(6)}  ${name} (${guid})`);
  }

  console.log('\n── creation-wave summary (taxonomy is living, not static) ──');
  const wave = {};
  for (const p of rows) { const d = String(p.created).slice(0, 10); wave[d] = (wave[d] || 0) + 1; }
  for (const d of Object.keys(wave).sort()) console.log(`  ${d}: ${wave[d]} program(s) created`);

  console.log('\nDone (read-only akoya_program taxonomy probe).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
