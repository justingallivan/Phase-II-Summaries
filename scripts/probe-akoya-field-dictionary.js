#!/usr/bin/env node
/**
 * Track B artifact-1 seed (READ-ONLY): map AkoyaGO business labels →
 * physical Dataverse fields for a sample request, with logical name, type,
 * lookup target entity, and the row's value. Reconciles what staff SEE in
 * the model-driven app to what Track B must QUERY.
 *
 * Usage: node scripts/probe-akoya-field-dictionary.js [requestnum]
 *   default requestnum = 1002804 (a verified discretionary request, S157).
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

const REQNUM = process.argv[2] || '1002804';

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

(async () => {
  const token = await getToken();
  console.log(`Token acquired. Request #${REQNUM}\n`);

  // attribute metadata: logical -> { label, type }
  const meta = {};
  const md = await get(token,
    `/EntityDefinitions(LogicalName='akoya_request')/Attributes?$select=LogicalName,AttributeType,DisplayName`);
  for (const a of (md.ok && md.body.value) || []) {
    const lbl = a.DisplayName && a.DisplayName.UserLocalizedLabel && a.DisplayName.UserLocalizedLabel.Label;
    meta[a.LogicalName] = { label: lbl || '', type: a.AttributeType || '' };
  }

  const rec = await get(token,
    `/akoya_requests?$filter=akoya_requestnum eq '${REQNUM}'&$top=1`);
  const row = rec.ok && rec.body.value && rec.body.value[0];
  if (!row) { console.error('record not found'); process.exit(1); }

  const FV = '@OData.Community.Display.V1.FormattedValue';
  const LLN = '@Microsoft.Dynamics.CRM.lookuplogicalname';

  const lookups = [], picklists = [], scalars = [];
  for (const [k, v] of Object.entries(row)) {
    if (k.includes('@') || k === '@odata.etag') continue;
    if (v === null || v === undefined || v === '') continue;
    if (k.startsWith('_') && k.endsWith('_value')) {
      const base = k.slice(1, -6);
      lookups.push({
        label: (meta[base] && meta[base].label) || base, logical: base,
        type: (meta[base] && meta[base].type) || 'Lookup',
        target: row[`${k}${LLN}`] || '?', value: row[`${k}${FV}`] || v,
      });
    } else if (row[`${k}${FV}`] !== undefined && meta[k] && /Picklist|State|Status/.test(meta[k].type)) {
      picklists.push({ label: meta[k].label || k, logical: k, type: meta[k].type, value: `${v} = ${row[`${k}${FV}`]}` });
    } else if (meta[k]) {
      scalars.push({ label: meta[k].label || k, logical: k, type: meta[k].type, value: v });
    }
  }

  const pr = (title, rows, withTarget) => {
    console.log(`══ ${title} (${rows.length}) ══`);
    for (const r of rows.sort((a, b) => a.label.localeCompare(b.label))) {
      console.log(`  "${r.label}"  →  ${r.logical}  [${r.type}${withTarget ? ` → ${r.target}` : ''}]  =  ${r.value}`);
    }
    console.log();
  };
  pr('LOOKUPS (business label → logical [type → target entity] = value)', lookups, true);
  pr('OPTION SETS', picklists, false);
  pr('POPULATED SCALARS', scalars, false);

  console.log('Done (read-only field-dictionary probe).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
