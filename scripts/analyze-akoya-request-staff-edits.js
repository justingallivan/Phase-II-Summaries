#!/usr/bin/env node
/**
 * "Which fields do the actual WMKF STAFF edit?" — refines the change-of-state
 * analysis by classifying every changing user against `systemuser` metadata
 * instead of a name heuristic. READ-ONLY.
 *
 *   - Cohort: createdon >= 2024-01-01 (Akoya-native; 2023 migration excluded).
 *   - Each distinct changing user is resolved: applicationid (=> app/
 *     integration user, definitive), accessmode, isdisabled, fullname.
 *   - Non-staff = application user OR matches an explicit vendor exclusion
 *     list (Bromelkamp = AkoyaGO vendor; "# " app-user convention; akoyaGO
 *     integration). Everyone else = STAFF. The full roster is printed so the
 *     classification is auditable, not asserted.
 *   - Dedupe: annotation twins + metadata-confirmed `_base` currency shadows.
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

const SAMPLE = parseInt(process.env.SAMPLE || '400', 10);
const COHORT_FROM = '2024-01-01T00:00:00Z';
const PACE_MS = 120;
// explicit non-staff vendor/automation name patterns (beyond app-user metadata)
const VENDOR_RE = /(bromelkamp|akoyago|akoya go|^#\s|integration|sdk|data ?migration)/i;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getToken() {
  const t = process.env.DYNAMICS_TENANT_ID, c = process.env.DYNAMICS_CLIENT_ID,
    s = process.env.DYNAMICS_CLIENT_SECRET, r = process.env.DYNAMICS_URL;
  const res = await fetch(`https://login.microsoftonline.com/${t}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: c, client_secret: s, scope: `${r}/.default` }),
  });
  if (!res.ok) throw new Error(`Token: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function get(token, urlPath, _retry = 0) {
  const url = urlPath.startsWith('http') ? urlPath : `${process.env.DYNAMICS_URL}/api/data/v9.2${urlPath}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-Version': '4.0', Prefer: 'odata.include-annotations="*"' },
  });
  if (r.status === 429 && _retry < 4) {
    await sleep(((parseInt(r.headers.get('Retry-After') || '0', 10) || 5)) * 1000);
    return get(token, urlPath, _retry + 1);
  }
  const txt = await r.text();
  let body; try { body = JSON.parse(txt); } catch { body = txt; }
  return { status: r.status, ok: r.ok, body };
}

(async () => {
  const token = await getToken();
  console.log('Token acquired.\n');

  const money = new Set();
  {
    const a = await get(token, `/EntityDefinitions(LogicalName='akoya_request')/Attributes?$select=LogicalName,AttributeType`);
    if (a.ok) for (const x of a.body.value || []) if (x.AttributeType === 'Money') money.add(x.LogicalName);
  }

  // cohort ids (paged) then random sample
  let ids = [];
  let url = `/akoya_requests?$select=akoya_requestid&$filter=createdon ge ${COHORT_FROM}`;
  while (url) {
    const u = url.startsWith('http') ? url : `${process.env.DYNAMICS_URL}/api/data/v9.2${url}`;
    const resp = await fetch(u, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', Prefer: 'odata.maxpagesize=1000' } });
    const t = await resp.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
    if (!resp.ok) { console.log(`id pull [${resp.status}]`); break; }
    for (const x of b.value || []) ids.push(x.akoya_requestid);
    url = b['@odata.nextLink'] || null;
  }
  for (let i = ids.length - 1; i > 0 && i > ids.length - 1 - SAMPLE; i--) {
    const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const sample = ids.slice(-Math.min(SAMPLE, ids.length));
  console.log(`Akoya-native cohort ${ids.length}; sampling ${sample.length}.\n`);

  const attr = {};          // logical -> { staff, nonstaff, recs:Set }
  const userAgg = {};       // guid -> { name, count }
  let ok = 0, err = 0;

  for (let i = 0; i < sample.length; i++) {
    const tgt = encodeURIComponent(JSON.stringify({ '@odata.id': `akoya_requests(${sample[i]})` }));
    const r = await get(token, `/RetrieveRecordChangeHistory(Target=@t)?@t=${tgt}`);
    if (!r.ok) { err++; await sleep(PACE_MS); continue; }
    ok++;
    const details = (r.body.AuditDetailCollection && r.body.AuditDetailCollection.AuditDetails) || [];
    for (const d of details) {
      const rec = d.AuditRecord || {};
      const uid = rec._userid_value || '(none)';
      const uname = rec['_userid_value@OData.Community.Display.V1.FormattedValue'] || '(unknown)';
      if (!userAgg[uid]) userAgg[uid] = { name: uname, count: 0 };
      const nv = d.NewValue || {};
      const changed = [];
      for (const k of Object.keys(nv)) {
        if (k.includes('@')) continue;
        if (k.endsWith('_base') && money.has(k.slice(0, -5))) continue;
        let lg = k;
        if (lg.startsWith('_') && lg.endsWith('_value')) lg = lg.slice(1, -6);
        changed.push(lg);
      }
      userAgg[uid].count += changed.length;
      for (const c of changed) {
        if (!attr[c]) attr[c] = { staff: 0, nonstaff: 0, recs: new Set(), staffUsers: {} };
        attr[c]._pending = attr[c]._pending || [];
        attr[c]._pending.push({ uid, rid: sample[i] });
      }
    }
    if ((i + 1) % 50 === 0) console.log(`  …${i + 1}/${sample.length} (ok ${ok}, err ${err})`);
    await sleep(PACE_MS);
  }
  console.log(`\nHistory: ${ok} ok / ${err} err.\n`);

  // resolve distinct changing users against systemuser metadata
  const cls = {}; // uid -> { name, app, accessmode, disabled, staff }
  for (const uid of Object.keys(userAgg)) {
    let app = null, accessmode = null, disabled = null, fullname = userAgg[uid].name;
    if (uid && uid !== '(none)') {
      const s = await get(token, `/systemusers(${uid})?$select=fullname,applicationid,accessmode,isdisabled`);
      if (s.ok) {
        app = s.body.applicationid || null;
        accessmode = s.body['accessmode@OData.Community.Display.V1.FormattedValue'] || s.body.accessmode;
        disabled = s.body.isdisabled;
        fullname = s.body.fullname || fullname;
      }
    }
    const isStaff = !app && !VENDOR_RE.test(fullname || '');
    cls[uid] = { name: fullname, app: !!app, accessmode, disabled, staff: isStaff };
  }

  // apply classification
  for (const c of Object.keys(attr)) {
    const a = attr[c];
    for (const p of a._pending) {
      const k = cls[p.uid] || { staff: false, name: '(unknown)' };
      if (k.staff) { a.staff++; a.recs.add(p.rid); a.staffUsers[k.name] = (a.staffUsers[k.name] || 0) + 1; }
      else a.nonstaff++;
    }
    delete a._pending;
  }

  // roster
  console.log('── changing-user roster (auditable classification) ──');
  const roster = Object.entries(userAgg).map(([uid, u]) => ({
    name: cls[uid] ? cls[uid].name : u.name, count: u.count,
    app: cls[uid] && cls[uid].app, staff: cls[uid] && cls[uid].staff,
  })).sort((a, b) => b.count - a.count);
  let staffN = 0, nonN = 0;
  for (const u of roster) {
    (u.staff ? staffN++ : nonN++);
    console.log(`   ${u.staff ? 'STAFF ' : 'NON   '} ${String(u.count).padStart(5)}  ${u.name}${u.app ? '  [application user]' : ''}`);
  }
  console.log(`   → ${staffN} staff actors / ${nonN} non-staff actors\n`);

  console.log('── TOP 35 fields by STAFF edits (createdon>=2024 native cohort) ──');
  const rows = Object.entries(attr).map(([k, v]) => ({
    k, staff: v.staff, nonstaff: v.nonstaff, recs: v.recs.size,
    top: Object.entries(v.staffUsers).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => `${n}:${c}`).join(' | '),
  })).filter(r => r.staff > 0).sort((a, b) => b.staff - a.staff).slice(0, 35);
  for (const r of rows) {
    console.log(`   staff ${String(r.staff).padStart(5)}  nonstaff ${String(r.nonstaff).padStart(5)}  recs ${String(r.recs).padStart(4)}  ${r.k}`);
    console.log(`        by: ${r.top}`);
  }

  console.log('\nMethod: systemuser-metadata classification (applicationid = app user, definitive) + vendor name exclusion (Bromelkamp/akoyaGO/# /integration); cohort createdon>=2024; sample ' + sample.length + '; metadata-confirmed dedupe.');
  console.log('Done (read-only).');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
