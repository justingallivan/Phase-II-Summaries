#!/usr/bin/env node
/**
 * wmkf_projectleader fill BY PROGRAM (READ-ONLY) — is the PI field
 * research-process-only, or does SoCal (and others) use it too?
 * Process-is-program-scoped means this must be answered per program,
 * not assumed from the whole-entity 16/32% rate.
 *
 *  1. per-program: total vs wmkf_projectleader-filled (native + overall),
 *     SoCal-area programs flagged (Civic & Community / Precollegiate
 *     Education / Health Care — the empirically-SoCal decline-field set)
 *  2. content sample: SoCal-area native rows — is projectleader a
 *     PI-like name that varies with the title, or empty/clerical?
 *
 * Counts = dated evidence. Only POST is the OAuth token; every call a GET.
 */
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let [, k, v] = m; v = v.trim().replace(/^"(.*)"$/, '$1');
    if (!process.env[k]) process.env[k] = v;
  }
}
const FV = '@OData.Community.Display.V1.FormattedValue';
const NAT = `<condition attribute="createdon" operator="gt" value="2023-12-03T23:59:59Z"/>`;
const SOCAL = new Set(['Civic & Community', 'Precollegiate Education', 'Health Care']);

async function getToken() {
  const r = await fetch(`https://login.microsoftonline.com/${process.env.DYNAMICS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.DYNAMICS_CLIENT_ID,
      client_secret: process.env.DYNAMICS_CLIENT_SECRET, scope: `${process.env.DYNAMICS_URL}/.default` }) });
  if (!r.ok) throw new Error(`Token: ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}
async function get(token, p) {
  const r = await fetch(`${process.env.DYNAMICS_URL}/api/data/v9.2${p}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-Version': '4.0',
      Prefer: 'odata.include-annotations="*"' } });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, ok: r.ok, body: b };
}
// group akoya_request by program -> Map(guid -> {name,c}); optional extra filter
async function byProgram(token, extra) {
  const fx = `<fetch aggregate="true"><entity name="akoya_request">` +
    `<attribute name="akoya_programid" alias="p" groupby="true"/>` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
    `<filter type="and">${NAT}${extra || ''}</filter></entity></fetch>`;
  const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
  const m = new Map();
  if (r.ok) for (const x of r.body.value || []) {
    const g = x.p == null ? '(null)' : x.p;
    m.set(g, { name: x[`p${FV}`] || (x.p == null ? '(no program)' : g), c: Number(x.c) || 0 });
  } else console.log(`  [byProgram ${r.status} ${JSON.stringify(r.body).slice(0,140)}]`);
  return m;
}

(async () => {
  const token = await getToken();
  console.log('Token acquired.\nProbe date: 2026-05-17 (dated evidence)\n');

  const tot = await byProgram(token, '');
  const pl = await byProgram(token, `<condition attribute="wmkf_projectleader" operator="not-null"/>`);
  console.log('══ wmkf_projectleader fill by program (NATIVE) — sorted by program size ══');
  console.log('  n(native)  pl-filled   pl%   program');
  const rows = [...tot.entries()].sort((a, b) => b[1].c - a[1].c);
  for (const [g, { name, c }] of rows) {
    if (c < 10) continue;
    const f = (pl.get(g) || { c: 0 }).c;
    const flag = SOCAL.has(name) ? '  ◀ SoCal-area' : '';
    console.log(`  ${String(c).padStart(6)}   ${String(f).padStart(6)}   ${String((f / c * 100).toFixed(0)).padStart(3)}%   ${name}${flag}`);
  }
  const small = rows.filter(([, v]) => v.c < 10);
  if (small.length) console.log(`  (${small.length} program(s) with n<10 native — suppressed)`);

  // content sample for SoCal-area programs
  for (const prog of [...SOCAL]) {
    // encodeURIComponent the $filter — program names contain '&' (e.g.
    // "Civic & Community") which otherwise splits the URL query string (the
    // S159 400 bug Codex flagged); other params are literal-safe.
    const filter = `createdon gt 2023-12-03T23:59:59Z and akoya_programid/akoya_program eq '${prog.replace(/'/g, "''")}' and _wmkf_projectleader_value ne null`;
    const fx = `/akoya_requests?$top=10&$select=akoya_requestnum,akoya_title,_wmkf_projectleader_value,_akoya_primarycontactid_value,akoya_decisiondate` +
      `&$filter=${encodeURIComponent(filter)}&$orderby=akoya_decisiondate desc`;
    const s = await get(token, fx);
    console.log(`\n══ ${prog} (SoCal-area) — native rows WITH projectleader ══`);
    if (!s.ok) { console.log(`  [${s.status} ${JSON.stringify(s.body).slice(0,150)}]`); continue; }
    const v = s.body.value || [];
    if (!v.length) { console.log('  (none with projectleader set)'); continue; }
    for (const x of v) {
      const t = String(x.akoya_title || '').replace(/\s+/g, ' ').slice(0, 50);
      console.log(`  #${x.akoya_requestnum} pl=${x[`_wmkf_projectleader_value${FV}`] || '—'} · contact=${x[`_akoya_primarycontactid_value${FV}`] || '—'}`);
      console.log(`     "${t}"`);
    }
  }
  console.log('\nRead: SoCal-area pl% comparable to research ⇒ NOT research-only;');
  console.log('~0% ⇒ research-process-only confirmed (caption stays).');
  console.log('\nDone (read-only projectleader-by-program probe).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
