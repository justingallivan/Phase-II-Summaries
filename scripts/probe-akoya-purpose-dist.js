#!/usr/bin/env node
/**
 * akoya_purpose value distribution (READ-ONLY) — follow-up: the
 * newest-migrated slice was uniform boilerplate; is the migrated 21%
 * mostly boilerplate or does it carry real per-grant purpose text?
 * Top distinct values by count + a varied sample (oldest-first +
 * requestnum-ordered). Counts = dated evidence. Token = only POST.
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
async function getToken() {
  const r = await fetch(`https://login.microsoftonline.com/${process.env.DYNAMICS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.DYNAMICS_CLIENT_ID,
      client_secret: process.env.DYNAMICS_CLIENT_SECRET, scope: `${process.env.DYNAMICS_URL}/.default` }),
  });
  if (!r.ok) throw new Error(`Token: ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}
async function get(token, urlPath) {
  const r = await fetch(`${process.env.DYNAMICS_URL}/api/data/v9.2${urlPath}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-Version': '4.0',
      Prefer: 'odata.include-annotations="*"' } });
  const t = await r.text(); let body; try { body = JSON.parse(t); } catch { body = t; }
  return { status: r.status, ok: r.ok, body };
}
(async () => {
  const token = await getToken();
  console.log('Token acquired.\nProbe date: 2026-05-17 (dated evidence)\n');

  // metadata (corrected: single-valued nav via $filter on the attribute collection)
  const md = await get(token,
    `/EntityDefinitions(LogicalName='akoya_request')/Attributes?$select=AttributeType,MaxLength,DisplayName&$filter=LogicalName eq 'akoya_purpose'`);
  if (md.ok && md.body.value && md.body.value[0]) {
    const a = md.body.value[0];
    console.log(`══ akoya_purpose metadata ══\n  type=${a.AttributeType}  maxLength=${a.MaxLength ?? 'n/a'}  label="${a.DisplayName?.UserLocalizedLabel?.Label || ''}"\n`);
  } else console.log(`[metadata ${md.status}]\n`);

  // top distinct values by count (groupby; memo/string both group)
  const fx = `<fetch aggregate="true" top="25"><entity name="akoya_request">` +
    `<attribute name="akoya_purpose" alias="p" groupby="true"/>` +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
    `<order alias="c" descending="true"/></entity></fetch>`;
  const g = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
  console.log('══ top akoya_purpose values by row count ══');
  if (g.ok) {
    for (const x of g.body.value || []) {
      let p = x.p == null ? '(null)' : String(x.p).replace(/\s+/g, ' ').trim();
      if (p.length > 160) p = p.slice(0, 160) + '…';
      console.log(`  ${String(x.c).padStart(6)}  "${p}"`);
    }
  } else console.log(`  [groupby ${g.status} ${JSON.stringify(g.body).slice(0,160)}]`);
  console.log();

  // varied sample: oldest-by-decisiondate migrated, distinct-ish via requestnum spread
  const fx2 = `<fetch top="15"><entity name="akoya_request">` +
    `<attribute name="akoya_requestnum"/><attribute name="akoya_purpose"/>` +
    `<attribute name="akoya_requeststatus"/><attribute name="akoya_decisiondate"/>` +
    `<filter type="and"><condition attribute="akoya_purpose" operator="not-null"/>` +
    `<condition attribute="createdon" operator="on-or-after" value="2023-12-03T00:00:00Z"/>` +
    `<condition attribute="createdon" operator="on-or-before" value="2023-12-03T23:59:59Z"/></filter>` +
    `<order attribute="akoya_decisiondate" descending="false"/></entity></fetch>`;
  const s = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx2)}`);
  console.log('══ oldest-decisiondate migrated rows with akoya_purpose (variety check) ══');
  if (s.ok) for (const x of s.body.value || []) {
    let p = String(x.akoya_purpose || '').replace(/\s+/g, ' ').trim(); const len = p.length;
    if (p.length > 240) p = p.slice(0, 240) + '…';
    console.log(`  #${x.akoya_requestnum} [${(x.akoya_decisiondate||'').slice(0,10)||'—'}] ${x.akoya_requeststatus||'—'} (len=${len})\n    "${p}"`);
  }
  console.log('\nDone (read-only akoya_purpose distribution).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
