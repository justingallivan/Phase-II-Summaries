#!/usr/bin/env node
/**
 * Change-of-state analysis (gated step 5, scoped to the AKOYA-NATIVE era).
 * READ-ONLY. Answers the user hypothesis — "which fields do staff actually
 * edit?" — while neutralizing the caveats Codex raised:
 *
 *   - Era bias:  cohort restricted to createdon >= 2024-01-01 (the 2023
 *                bulk-migration import is excluded; exact cutover pending
 *                Connor, so 2024+ is the conservative unambiguous native set).
 *   - Sampling:  unbiased random sample drawn across the whole cohort, not
 *                the first N.
 *   - Dedupe:    annotation twins (@...) dropped; `<x>_base` dropped ONLY
 *                when `<x>` is a metadata-confirmed Money attribute.
 *   - Automation vs human: every change is attributed to its changing user;
 *                output splits human vs system/integration so the signal is
 *                auditable, not asserted.
 *   - Throttle:  sequential with pacing + Retry-After honoring (the service
 *                has no backoff; this script supplies its own).
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
    headers: {
      Authorization: `Bearer ${token}`, Accept: 'application/json',
      'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
      Prefer: 'odata.include-annotations="*"',
    },
  });
  if (r.status === 429 && _retry < 4) {
    const wait = (parseInt(r.headers.get('Retry-After') || '0', 10) || 5) * 1000;
    await sleep(wait);
    return get(token, urlPath, _retry + 1);
  }
  const txt = await r.text();
  let body; try { body = JSON.parse(txt); } catch { body = txt; }
  return { status: r.status, ok: r.ok, body };
}

// crude system/automation heuristic on the changing user's display name
const SYS_RE = /(akoya|integration|service|system|powerapps|power automate|flow|# |sdk|admin app|application user|onboarding|sync)/i;
const isSystemUser = name => !name || SYS_RE.test(name);

(async () => {
  const token = await getToken();
  console.log('Token acquired.\n');

  // Money attrs for metadata-confirmed _base dedupe
  const money = new Set();
  {
    const a = await get(token,
      `/EntityDefinitions(LogicalName='akoya_request')/Attributes?$select=LogicalName,AttributeType`);
    if (a.ok) for (const x of a.body.value || []) if (x.AttributeType === 'Money') money.add(x.LogicalName);
    console.log(`Money attrs (for _base dedupe): ${money.size}`);
  }

  // cohort size (true count via FetchXML aggregate, $count is unreliable)
  {
    const fx = `<fetch aggregate="true"><entity name="akoya_request">` +
      `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
      `<filter><condition attribute="createdon" operator="ge" value="2024-01-01"/></filter>` +
      `</entity></fetch>`;
    const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
    console.log(`Akoya-native cohort (createdon >= 2024-01-01): ${r.ok ? (r.body.value || [{}])[0].c : '[' + r.status + ']'}\n`);
  }

  // pull all cohort ids (paged), then random-sample
  let ids = [];
  let url = `/akoya_requests?$select=akoya_requestid&$filter=createdon ge ${COHORT_FROM}`;
  let hdrPref = true;
  while (url) {
    const r = hdrPref
      ? await (async () => {
          const u = `${process.env.DYNAMICS_URL}/api/data/v9.2${url}`;
          const resp = await fetch(u, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', Prefer: 'odata.maxpagesize=1000' } });
          const t = await resp.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
          return { status: resp.status, ok: resp.ok, body: b };
        })()
      : await get(token, url);
    if (!r.ok) { console.log(`id pull failed [${r.status}]`); break; }
    for (const x of r.body.value || []) ids.push(x.akoya_requestid);
    url = r.body['@odata.nextLink'] || null;
    hdrPref = false;
  }
  console.log(`Cohort ids pulled: ${ids.length}`);
  // Fisher-Yates partial shuffle for an unbiased sample
  for (let i = ids.length - 1; i > 0 && i > ids.length - 1 - SAMPLE; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const sample = ids.slice(-Math.min(SAMPLE, ids.length));
  console.log(`Sampling ${sample.length} records (pace ${PACE_MS}ms, 429-aware).\n`);

  const attr = {}; // logicalName -> { total, recs:Set, byUser:{name:count}, human, sys }
  const editCountHist = {}; // changeEvents-per-record -> #records
  let okRecs = 0, errRecs = 0;

  function bump(name, userName, recId) {
    if (!attr[name]) attr[name] = { total: 0, recs: new Set(), byUser: {}, human: 0, sys: 0 };
    const a = attr[name];
    a.total++; a.recs.add(recId);
    a.byUser[userName || '(unknown)'] = (a.byUser[userName || '(unknown)'] || 0) + 1;
    if (isSystemUser(userName)) a.sys++; else a.human++;
  }

  for (let i = 0; i < sample.length; i++) {
    const id = sample[i];
    const tgt = encodeURIComponent(JSON.stringify({ '@odata.id': `akoya_requests(${id})` }));
    const r = await get(token, `/RetrieveRecordChangeHistory(Target=@t)?@t=${tgt}`);
    if (!r.ok) { errRecs++; await sleep(PACE_MS); continue; }
    okRecs++;
    const details = (r.body.AuditDetailCollection && r.body.AuditDetailCollection.AuditDetails) || [];
    let changeEvents = 0;
    for (const d of details) {
      const rec = d.AuditRecord || {};
      const userName = rec['_userid_value@OData.Community.Display.V1.FormattedValue'] || rec.useridname || '(unknown)';
      const nv = d.NewValue || {};
      const changed = [];
      for (const k of Object.keys(nv)) {
        if (k.includes('@')) continue;                          // annotation twins
        if (k === '@odata.type') continue;
        if (k.endsWith('_base') && money.has(k.slice(0, -5))) continue; // confirmed currency shadow
        let logical = k;
        if (logical.startsWith('_') && logical.endsWith('_value')) logical = logical.slice(1, -6); // lookup
        changed.push(logical);
      }
      if (changed.length) changeEvents++;
      for (const c of changed) bump(c, userName, id);
    }
    editCountHist[changeEvents] = (editCountHist[changeEvents] || 0) + 1;
    if ((i + 1) % 50 === 0) console.log(`  …${i + 1}/${sample.length} (ok ${okRecs}, err ${errRecs})`);
    await sleep(PACE_MS);
  }

  console.log(`\nRetrieveRecordChangeHistory: ${okRecs} ok / ${errRecs} err of ${sample.length}\n`);

  // per-record change-event distribution (the "0 vs 1 vs >=2 versions" question)
  console.log('── change events per sampled record ──');
  for (const k of Object.keys(editCountHist).map(Number).sort((a, b) => a - b)) {
    console.log(`   ${k} change-event(s): ${editCountHist[k]} record(s)`);
  }

  const rows = Object.entries(attr).map(([k, v]) => ({
    k, total: v.total, recs: v.recs.size, human: v.human, sys: v.sys,
    topUsers: Object.entries(v.byUser).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([n, c]) => `${n}:${c}`).join(' | '),
  }));

  console.log('\n── TOP 30 attrs by HUMAN-attributed changes (the real "what staff edit" signal) ──');
  for (const r of rows.filter(r => r.human > 0).sort((a, b) => b.human - a.human).slice(0, 30)) {
    console.log(`   human ${String(r.human).padStart(5)}  sys ${String(r.sys).padStart(5)}  recs ${String(r.recs).padStart(4)}  ${r.k}`);
  }

  console.log('\n── TOP 15 by TOTAL (human+system) — for contrast (automation-dominated) ──');
  for (const r of rows.sort((a, b) => b.total - a.total).slice(0, 15)) {
    console.log(`   total ${String(r.total).padStart(5)}  human ${String(r.human).padStart(5)}  sys ${String(r.sys).padStart(5)}  ${r.k}  [${r.topUsers}]`);
  }

  console.log('\nMethod: cohort createdon>=2024-01-01 (Akoya-native, 2023 migration bulk excluded);' +
    ` random sample ${sample.length}; annotation twins + metadata-confirmed _base dropped;` +
    ' human/system split by changing-user name heuristic (audit, not asserted).');
  console.log('Done (read-only change-of-state analysis).');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
