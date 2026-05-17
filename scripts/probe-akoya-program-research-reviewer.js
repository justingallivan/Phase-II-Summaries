#!/usr/bin/env node
/**
 * Connor-walkthrough verification (READ-ONLY): characterize
 * `akoya_program = "Research Reviewer"` — the program record's own
 * created/active dates + the createdon span and a sample of the
 * akoya_request rows that point at it. User hypothesis: it is a
 * post-2023-12-03 (AkoyaGO-native-era) construct, not a grant program.
 *
 * akoya_programid is a Lookup → akoya_program entity; resolve the program
 * record by name via metadata, then enumerate referencing requests.
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
  let next = `${process.env.DYNAMICS_URL}/api/data/v9.2${urlPath}`;
  const rows = [];
  while (next) {
    const r = await fetch(next, {
      headers: {
        Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-Version': '4.0',
        Prefer: 'odata.include-annotations="*"',
      },
    });
    const t = await r.text();
    let body; try { body = JSON.parse(t); } catch { body = t; }
    if (!r.ok) throw new Error(`GET ${urlPath}: ${r.status} ${typeof body === 'string' ? body.slice(0, 240) : JSON.stringify(body).slice(0, 240)}`);
    if (body.value) { for (const v of body.value) rows.push(v); next = body['@odata.nextLink']; }
    else return body;
  }
  return { value: rows };
}

(async () => {
  const token = await getToken();
  console.log(`Verify akoya_program="Research Reviewer" — ${new Date().toISOString()} (read-only)\n`);
  const FV = '@OData.Community.Display.V1.FormattedValue';

  // 1. resolve the akoya_program entity + the "Research Reviewer" record
  const md = await get(token,
    `/EntityDefinitions(LogicalName='akoya_program')?$select=EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute`);
  const setName = md.EntitySetName, idAttr = md.PrimaryIdAttribute, nameAttr = md.PrimaryNameAttribute;
  console.log(`akoya_program entity: set=${setName}  id=${idAttr}  name=${nameAttr}`);

  const progs = await get(token,
    `/${setName}?$select=${idAttr},${nameAttr},createdon,modifiedon,statecode&$filter=${encodeURIComponent(`${nameAttr} eq 'Research Reviewer'`)}`);
  if (!progs.value.length) { console.log('No akoya_program record named "Research Reviewer" — STOP.'); process.exit(0); }
  console.log(`\n══ The program record itself ══`);
  for (const p of progs.value) {
    console.log(`  id=${p[idAttr]}`);
    console.log(`  name="${p[nameAttr]}"  state=${p[`statecode${FV}`] ?? p.statecode}`);
    console.log(`  program record createdon = ${p.createdon}   modifiedon = ${p.modifiedon}`);
  }
  const ids = progs.value.map((p) => p[idAttr]);

  // 2. akoya_request rows pointing at it
  const orf = ids.map((id) => `_akoya_programid_value eq ${id}`).join(' or ');
  const reqs = (await get(token,
    `/akoya_requests?$filter=${encodeURIComponent(`(${orf})`)}` +
    `&$select=akoya_requestnum,akoya_requeststatus,akoya_grant,akoya_paid,createdon,_akoya_applicantid_value,_wmkf_type_value,wmkf_request_type,akoya_title&$orderby=createdon asc`)).value;

  const dates = reqs.map((r) => r.createdon).filter(Boolean).sort();
  const pre2024 = reqs.filter((r) => r.createdon < '2024-01-01');
  const withGrant = reqs.filter((r) => Number(r.akoya_grant) > 0);
  const tally = (k, fmt) => { const m = {}; for (const r of reqs) { const v = (fmt ? r[`${k}${FV}`] : r[k]) ?? '(null)'; m[v] = (m[v] || 0) + 1; } return Object.entries(m).sort((a, b) => b[1] - a[1]); };

  console.log(`\n══ akoya_request rows with akoya_program="Research Reviewer": ${reqs.length} ══`);
  console.log(`  createdon span : ${dates[0]}  …  ${dates[dates.length - 1]}`);
  console.log(`  pre-2024 rows  : ${pre2024.length}   2024+ rows: ${reqs.length - pre2024.length}`);
  console.log(`  → user hypothesis "all post-2024": ${pre2024.length === 0 ? 'CONFIRMED (0 pre-2024)' : `REFUTED — ${pre2024.length} pre-2024 (earliest ${dates[0]})`}`);
  console.log(`  with grant>0   : ${withGrant.length}  (a real *grant program* would mostly carry awards; ~0 ⇒ not a grant bucket)`);
  console.log(`  by wmkf_type   :`); for (const [k, n] of tally('_wmkf_type_value', true)) console.log(`    ${String(n).padStart(3)}  ${k}`);
  console.log(`  by status      :`); for (const [k, n] of tally('akoya_requeststatus', false)) console.log(`    ${String(n).padStart(3)}  ${k}`);

  const sample = reqs.slice(0, 8).concat(reqs.slice(-8));
  console.log(`\n══ Spot-check sample (first 8 + last 8 by createdon) ══`);
  for (const r of sample) {
    console.log(`#${r.akoya_requestnum}  created=${r.createdon}  ${String(r.akoya_requeststatus || '—').padEnd(15)}  grant=${r.akoya_grant ?? 'null'}  type=${r[`_wmkf_type_value${FV}`] || '—'}  ${(r[`_akoya_applicantid_value${FV}`] || '—')} :: ${(r.akoya_title || '').slice(0, 40)}`);
  }
  console.log('\nDone (read-only verification — akoya_program=Research Reviewer).');
})().catch((e) => { console.error('PROBE ERROR:', e.message); process.exit(1); });
