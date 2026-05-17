#!/usr/bin/env node
/**
 * akoya_purpose content sample (READ-ONLY) — design question: does
 * `akoya_purpose` belong in the Track B default export-column SET? It
 * appears in every vendor "Grant Denial" RDL but is absent from the
 * Artifact-1 candidate table. Pull metadata + fill rate per era + a
 * content sample (truncated) with context to see what it actually holds.
 *
 * Counts = dated evidence only. Only POST is the OAuth token; every
 * Dataverse call is a GET.
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

async function aggCount(token, fxFilter) {
  const fx = `<fetch aggregate="true"><entity name="akoya_request">` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
    (fxFilter ? `<filter type="and">${fxFilter}</filter>` : '') +
    `</entity></fetch>`;
  const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
  if (!r.ok) return null;
  return Number(r.body.value && r.body.value[0] && r.body.value[0].c) || 0;
}

(async () => {
  const token = await getToken();
  console.log('Token acquired.');
  console.log('Probe date: 2026-05-17  (dated evidence — Living-taxonomy policy)\n');

  // metadata
  const md = await get(token,
    `/EntityDefinitions(LogicalName='akoya_request')/Attributes(LogicalName='akoya_purpose')` +
    `?$select=LogicalName,AttributeType,MaxLength,DisplayName,Description`);
  if (md.ok) {
    const lbl = md.body.DisplayName?.UserLocalizedLabel?.Label || '';
    const desc = md.body.Description?.UserLocalizedLabel?.Label || '';
    console.log('══ akoya_purpose — attribute metadata ══');
    console.log(`  type=${md.body.AttributeType}  maxLength=${md.body.MaxLength ?? 'n/a'}`);
    console.log(`  label="${lbl}"`);
    console.log(`  description="${desc}"\n`);
  } else console.log(`[metadata ${md.status}]\n`);

  // fill rate overall + per era
  const tot = await aggCount(token, null);
  const filled = await aggCount(token, `<condition attribute="akoya_purpose" operator="not-null"/>`);
  console.log('══ akoya_purpose — fill rate ══');
  console.log(`  overall   ${filled}/${tot}  (${(filled / tot * 100).toFixed(0)}%)`);
  for (const [coh, lab] of [[MIG, 'migrated'], [NAT, 'native']]) {
    const ct = await aggCount(token, coh);
    const cf = await aggCount(token, `${coh}<condition attribute="akoya_purpose" operator="not-null"/>`);
    console.log(`  ${lab.padEnd(8)}  ${cf}/${ct}  (${(cf / (ct || 1) * 100).toFixed(0)}%)`);
  }
  console.log();

  // content sample — newest native + a migrated slice, with context
  const pull = async (coh, label, n) => {
    const fx = `<fetch top="${n}"><entity name="akoya_request">` +
      `<attribute name="akoya_requestnum"/><attribute name="akoya_purpose"/>` +
      `<attribute name="akoya_requeststatus"/><attribute name="akoya_programid"/>` +
      `<attribute name="wmkf_type"/><attribute name="akoya_decisiondate"/>` +
      `<filter type="and">${coh}<condition attribute="akoya_purpose" operator="not-null"/></filter>` +
      `<order attribute="akoya_decisiondate" descending="true"/></entity></fetch>`;
    const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
    console.log(`══ ${label} — ${n} most-recent rows with akoya_purpose ══`);
    if (!r.ok) { console.log(`  [${r.status} ${JSON.stringify(r.body).slice(0, 200)}]\n`); return; }
    for (const x of r.body.value || []) {
      const prog = x['akoya_programid@OData.Community.Display.V1.FormattedValue'] || '(no program)';
      const dd = (x.akoya_decisiondate || '').slice(0, 10) || '—';
      const status = x.akoya_requeststatus || '—';
      let p = String(x.akoya_purpose || '').replace(/\s+/g, ' ').trim();
      const len = p.length;
      if (p.length > 280) p = p.slice(0, 280) + '…';
      console.log(`  #${x.akoya_requestnum}  [${dd}] ${status} · ${prog}  (len=${len})`);
      console.log(`    "${p}"`);
    }
    console.log();
  };
  await pull(NAT, 'NATIVE', 12);
  await pull(MIG, 'MIGRATED', 12);

  console.log('Read: judge whether akoya_purpose is a stable, analyst-meaningful');
  console.log('default export column or a sparse/free-text/duplicative one.');
  console.log('\nDone (read-only akoya_purpose content sample).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
