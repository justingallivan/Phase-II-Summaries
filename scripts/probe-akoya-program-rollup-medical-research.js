#!/usr/bin/env node
/**
 * Track B roll-up decision support (READ-ONLY): of all akoya_request rows
 * tagged `akoya_programid = "Medical Research"`, how many are
 * `wmkf_type = Program` vs Discretionary / Special Grants / other giving
 * modes — with row counts, funded-row counts, and grant$ sums per type.
 * Quantifies the Option-A-vs-B "grants by program" inflation risk.
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
    if (!r.ok) throw new Error(`GET ${urlPath}: ${r.status} ${typeof body === 'string' ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200)}`);
    if (body.value) { for (const v of body.value) rows.push(v); next = body['@odata.nextLink']; }
    else return body;
  }
  return { value: rows };
}

const FV = '@OData.Community.Display.V1.FormattedValue';
const money = (n) => '$' + Math.round(Number(n || 0)).toLocaleString();

(async () => {
  const token = await getToken();
  console.log(`Program roll-up — "Medical Research" by wmkf_type — ${new Date().toISOString()} (read-only)\n`);

  const progs = await get(token,
    `/akoya_programs?$select=akoya_programid,akoya_program,statecode&$filter=${encodeURIComponent("akoya_program eq 'Medical Research'")}`);
  if (!progs.value.length) { console.log('no akoya_program "Medical Research" — STOP'); process.exit(0); }
  for (const p of progs.value) console.log(`  program record ${p.akoya_programid}  state=${p[`statecode${FV}`] ?? p.statecode}`);
  const ids = progs.value.map((p) => p.akoya_programid);
  const orf = ids.map((id) => `_akoya_programid_value eq ${id}`).join(' or ');

  const rows = (await get(token,
    `/akoya_requests?$filter=${encodeURIComponent(`(${orf})`)}` +
    `&$select=akoya_requestnum,_wmkf_type_value,akoya_grant,akoya_paid,akoya_requeststatus,statecode,createdon`)).value;
  console.log(`\nTotal rows tagged akoya_programid="Medical Research": ${rows.length}\n`);

  const byType = {};
  for (const r of rows) {
    const ty = r[`_wmkf_type_value${FV}`] || '(no wmkf_type)';
    const b = byType[ty] || (byType[ty] = { n: 0, funded: 0, grant: 0, paid: 0, native: 0 });
    b.n++;
    if (Number(r.akoya_grant) > 0) { b.funded++; b.grant += Number(r.akoya_grant); }
    if (Number(r.akoya_paid) > 0) b.paid += Number(r.akoya_paid);
    if (r.createdon >= '2024-01-01') b.native++;
  }

  const order = Object.entries(byType).sort((a, b) => b[1].n - a[1].n);
  console.log('wmkf_type'.padEnd(20) + 'rows'.padStart(7) + 'funded'.padStart(8) + 'grant$'.padStart(16) + 'paid$'.padStart(16) + 'native'.padStart(8));
  console.log('-'.repeat(75));
  let progN = 0, progG = 0, otherN = 0, otherG = 0;
  for (const [ty, b] of order) {
    console.log(ty.padEnd(20) + String(b.n).padStart(7) + String(b.funded).padStart(8) + money(b.grant).padStart(16) + money(b.paid).padStart(16) + String(b.native).padStart(8));
    if (/^Program$/i.test(ty)) { progN += b.n; progG += b.grant; } else { otherN += b.n; otherG += b.grant; }
  }
  console.log('-'.repeat(75));
  console.log(`wmkf_type=Program        : ${progN} rows, ${money(progG)} awarded`);
  console.log(`NON-Program (directed/discretionary/other) tagged Medical Research : ${otherN} rows, ${money(otherG)} awarded`);
  const pct = progG + otherG > 0 ? Math.round((100 * otherG) / (progG + otherG)) : 0;
  console.log(`\n⇒ Option A (pool all by akoya_programid) vs Option B (Program-only) differ by`);
  console.log(`  ${otherN} rows / ${money(otherG)} — i.e. ${pct}% of a naive "Medical Research grants" $ total`);
  console.log(`  would be non-Program giving modes folded in. (THIS is the inflation magnitude.)`);
  console.log('\nDone (read-only — Medical Research program roll-up by wmkf_type).');
})().catch((e) => { console.error('PROBE ERROR:', e.message); process.exit(1); });
