#!/usr/bin/env node
/**
 * Track B semantic-layer artifact #3 evidence (READ-ONLY): does the *shape* of
 * the data differ between the migrated (Blackbaud/"Sky") cohort and the
 * AkoyaGO-native cohort?
 *
 * Cohorts (createdon is collapsed by the 2023-12-03 import, so it is the ONLY
 * usable era key — see probe-akoya-createdon-2023.js):
 *   - migrated : createdon on 2023-12-03            (Blackbaud-origin, ~22,573)
 *   - native   : createdon strictly after that day  (AkoyaGO-born, ~2,988)
 *
 * Two questions:
 *   (1) Per-attribute population rate per cohort -> migrated-only fields
 *       (Blackbaud data AkoyaGO stopped capturing), native-only fields
 *       (AkoyaGO concepts with no Blackbaud source), and the 1:1-mapped
 *       middle (populated similarly in both).
 *   (2) Is there a real *business date* field (not createdon) that preserved
 *       true pre-2023 dates through the migration? If so, that field — not
 *       createdon — is what enables a future "2022 vs 2023 request" cut.
 *
 * Sampling: ordered by akoya_requestid (GUID) ~= random wrt source order, so
 * population rates aren't biased by import insertion order. Sample caps keep
 * it well under any throttle (S156 did 800 single gets clean).
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

const SAMPLE = Number(process.env.ERA_SAMPLE || 1200); // per cohort cap
const NEAR_ZERO = 0.02;   // <=2% populated ~= "absent" for that cohort
const NEAR_FULL = 0.5;    // >=50% populated ~= "substantively present"
const BIG_DELTA = 0.30;   // |migrated - native| populated-rate gap of interest

async function getToken() {
  const tenant = process.env.DYNAMICS_TENANT_ID;
  const clientId = process.env.DYNAMICS_CLIENT_ID;
  const secret = process.env.DYNAMICS_CLIENT_SECRET;
  const resource = process.env.DYNAMICS_URL;
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials', client_id: clientId,
      client_secret: secret, scope: `${resource}/.default`,
    }),
  });
  if (!res.ok) throw new Error(`Token: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function get(token, urlPath, extraHeaders = {}) {
  const url = urlPath.startsWith('http')
    ? urlPath
    : `${process.env.DYNAMICS_URL}/api/data/v9.2${urlPath}`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`, Accept: 'application/json',
      'OData-MaxVersion': '4.0', 'OData-Version': '4.0', ...extraHeaders,
    },
  });
  const t = await r.text();
  let body; try { body = JSON.parse(t); } catch { body = t; }
  return { status: r.status, ok: r.ok, body };
}

// Page a filtered collection (no $select => all attributes) up to `cap`.
async function sampleCohort(token, filter, cap) {
  const recs = [];
  let next = `/akoya_requests?$filter=${encodeURIComponent(filter)}` +
    `&$orderby=akoya_requestid asc&$top=${Math.min(cap, 5000)}`;
  while (next && recs.length < cap) {
    const r = await get(token, next, { Prefer: 'odata.maxpagesize=500' });
    if (!r.ok) throw new Error(`sample [${r.status}] ${JSON.stringify(r.body).slice(0, 200)}`);
    for (const rec of r.body.value || []) {
      recs.push(rec);
      if (recs.length >= cap) break;
    }
    next = r.body['@odata.nextLink'] || null;
  }
  return recs;
}

// A field is "populated" for a record if the key is present, not null, and
// not an empty/whitespace string. Annotation twins and odata noise excluded.
function isNoiseKey(k) {
  return k.includes('@') || k === '_etag';
}
function populated(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  return true;
}

function rateMap(records) {
  const counts = Object.create(null);
  for (const rec of records) {
    for (const [k, v] of Object.entries(rec)) {
      if (isNoiseKey(k)) continue;
      if (!(k in counts)) counts[k] = 0;
      if (populated(v)) counts[k] += 1;
    }
  }
  const n = records.length || 1;
  const m = Object.create(null);
  for (const [k, c] of Object.entries(counts)) m[k] = c / n;
  return m;
}

(async () => {
  const token = await getToken();
  console.log('Token acquired.\n');

  // Attribute metadata: logical -> { label, type }. Best-effort labels.
  const meta = Object.create(null);
  {
    // DisplayName is an inline Label complex type — $select it directly, do
    // NOT $expand it (expanding 400s and yields an empty value array).
    const r = await get(
      token,
      `/EntityDefinitions(LogicalName='akoya_request')/Attributes` +
      `?$select=LogicalName,AttributeType,DisplayName`,
    );
    if (r.ok && Array.isArray(r.body.value)) {
      for (const a of r.body.value) {
        const lbl = a.DisplayName && a.DisplayName.UserLocalizedLabel &&
          a.DisplayName.UserLocalizedLabel.Label;
        meta[a.LogicalName] = { label: lbl || '', type: a.AttributeType || '' };
      }
    }
    if (!Object.keys(meta).length) {
      console.log(`⚠ metadata fetch failed [${r.status}] ${JSON.stringify(r.body).slice(0, 240)}`);
    }
    console.log(`attribute metadata: ${Object.keys(meta).length} attributes\n`);
  }
  const lblOf = k => {
    const base = k.startsWith('_') && k.endsWith('_value') ? k.slice(1, -6) : k;
    const mm = meta[base];
    return mm ? `${mm.label || base} [${mm.type || '?'}]` : '[unknown attr]';
  };

  // Cohorts.
  const MIG = 'createdon ge 2023-12-03T00:00:00Z and createdon le 2023-12-03T23:59:59Z';
  const NAT = 'createdon gt 2023-12-03T23:59:59Z';
  console.log(`sampling migrated (Blackbaud-origin) cohort, cap ${SAMPLE}…`);
  const mig = await sampleCohort(token, MIG, SAMPLE);
  console.log(`  got ${mig.length}`);
  console.log(`sampling native (AkoyaGO-born) cohort, cap ${SAMPLE}…`);
  const nat = await sampleCohort(token, NAT, SAMPLE);
  console.log(`  got ${nat.length}\n`);

  const mR = rateMap(mig);
  const nR = rateMap(nat);
  const allKeys = Array.from(new Set([...Object.keys(mR), ...Object.keys(nR)])).sort();

  const migOnly = [];   // present in migrated, ~absent in native
  const natOnly = [];   // present in native, ~absent in migrated
  const bigDelta = [];  // both present-ish but large gap
  for (const k of allKeys) {
    const m = mR[k] || 0, n = nR[k] || 0;
    if (m >= NEAR_FULL && n <= NEAR_ZERO) migOnly.push([k, m, n]);
    else if (n >= NEAR_FULL && m <= NEAR_ZERO) natOnly.push([k, m, n]);
    else if (Math.abs(m - n) >= BIG_DELTA) bigDelta.push([k, m, n]);
  }
  const pct = x => (x * 100).toFixed(0).padStart(3) + '%';
  const dump = (title, rows) => {
    console.log(`── ${title} (${rows.length}) ──`);
    rows.sort((a, b) => Math.abs(b[1] - b[2]) - Math.abs(a[1] - a[2]));
    for (const [k, m, n] of rows) {
      console.log(`   mig ${pct(m)}  nat ${pct(n)}  ${k}  —  ${lblOf(k)}`);
    }
    console.log();
  };
  dump('MIGRATED-ONLY fields (Blackbaud data AkoyaGO no longer captures)', migOnly);
  dump('NATIVE-ONLY fields (AkoyaGO concepts with no Blackbaud source)', natOnly);
  dump(`LARGE-DELTA fields (>=${BIG_DELTA * 100}% population gap; partial remap?)`, bigDelta);

  // Sanity: how many fields are 1:1-ish (both substantively populated, small gap)
  let shared = 0;
  for (const k of allKeys) {
    const m = mR[k] || 0, n = nR[k] || 0;
    if (m >= NEAR_FULL && n >= NEAR_FULL && Math.abs(m - n) < BIG_DELTA) shared += 1;
  }
  console.log(`── ~1:1-mapped fields (both >=${NEAR_FULL * 100}% populated, gap <${BIG_DELTA * 100}%): ${shared} ──\n`);

  // (2) Business-date hunt: DateTime attrs whose migrated values reach BEFORE
  //     2023 => a real historical date the migration preserved.
  console.log('── business-date hunt: DateTime fields with pre-2023 values in migrated cohort ──');
  const dateFields = Object.entries(meta)
    .filter(([, v]) => v.type === 'DateTime')
    .map(([k]) => k)
    .filter(k => !['createdon', 'modifiedon', 'overriddencreatedon'].includes(k));
  const found = [];
  for (const f of dateFields) {
    // earliest non-null value of f within the migrated cohort
    const r = await get(
      token,
      `/akoya_requests?$select=${f}&$filter=${encodeURIComponent(
        MIG + ` and ${f} ne null`)}&$orderby=${f} asc&$top=1`,
    );
    if (!r.ok) continue;
    const v = r.body.value && r.body.value[0] && r.body.value[0][f];
    if (!v) continue;
    const yr = Number(String(v).slice(0, 4));
    if (yr && yr < 2023) found.push([f, v, yr]);
  }
  found.sort((a, b) => a[2] - b[2]);
  if (!found.length) {
    console.log('   (none — no DateTime field preserved a pre-2023 value; migrated rows carry no recoverable true date)\n');
  } else {
    for (const [f, v, yr] of found) {
      console.log(`   ${f}  earliest=${v}  (year ${yr})  —  ${lblOf(f)}`);
    }
    console.log('   => candidate true business-date field(s); enables a real "2022 vs 2023" cut\n');
  }

  console.log('Done (read-only era field-shape probe).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
