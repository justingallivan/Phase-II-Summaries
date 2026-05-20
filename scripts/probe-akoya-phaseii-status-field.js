#!/usr/bin/env node
/**
 * READ-ONLY ground-truth probe for S169 / P1-Update verdict-check.
 *
 * Connor (2026-05-20 core-gate run) reports that the Phase-II lifecycle status
 * on `akoya_request` lives on `wmkf_phaseiistatus` (picklist, Phase II Pending
 * Committee Review = 100000002), NOT on `akoya_requeststatus` (which he says
 * is a String field, unrelated). CLAUDE.md + memory + the core-gate handout
 * all reference `akoya_requeststatus`. This probe verifies which is correct.
 *
 * Checks:
 *  1. Metadata for `akoya_requeststatus` on akoya_request (existence + type).
 *  2. Metadata for `wmkf_phaseiistatus` on akoya_request (existence + type +
 *     picklist option set if applicable, expecting 100000002 label).
 *  3. Sample-row cross-check: a handful of recent rows showing both fields
 *     side by side, so we can see which one carries the lifecycle state.
 *
 * Read-only: only POST is the OAuth token; every Dataverse call is a GET.
 */

const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (!m) continue;
    let [, k, v] = m; v = v.trim().replace(/^"(.*)"$/, '$1');
    if (!process.env[k]) process.env[k] = v;
  }
}

async function getToken() {
  const r = await fetch(`https://login.microsoftonline.com/${process.env.DYNAMICS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.DYNAMICS_CLIENT_ID,
      client_secret: process.env.DYNAMICS_CLIENT_SECRET,
      scope: `${process.env.DYNAMICS_URL}/.default`,
    }),
  });
  if (!r.ok) throw new Error(`Token: ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}

async function get(token, urlPath) {
  const r = await fetch(`${process.env.DYNAMICS_URL}/api/data/v9.2${urlPath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'OData-Version': '4.0',
      'OData-MaxVersion': '4.0',
      Prefer: 'odata.include-annotations="*"',
    },
  });
  const text = await r.text();
  if (!r.ok) return { ok: false, status: r.status, body: text };
  try { return { ok: true, status: r.status, body: JSON.parse(text) }; }
  catch { return { ok: true, status: r.status, body: text }; }
}

async function attrMetadata(token, entityLogicalName, attrLogicalName) {
  // Generic attribute first (gives AttributeType)
  const base = await get(
    token,
    `/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes(LogicalName='${attrLogicalName}')`,
  );
  if (!base.ok) return { exists: false, error: `${base.status}: ${typeof base.body === 'string' ? base.body.slice(0, 200) : JSON.stringify(base.body).slice(0, 200)}` };
  const attrType = base.body.AttributeType;
  const result = {
    exists: true,
    logicalName: base.body.LogicalName,
    schemaName: base.body.SchemaName,
    displayName: base.body.DisplayName?.UserLocalizedLabel?.Label || null,
    attributeType: attrType,
    isCustomAttribute: base.body.IsCustomAttribute,
    maxLength: base.body.MaxLength ?? null,
  };
  // Picklist option set
  if (attrType === 'Picklist' || attrType === 'State' || attrType === 'Status') {
    const cast = attrType === 'Picklist' ? 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata'
                : attrType === 'State'   ? 'Microsoft.Dynamics.CRM.StateAttributeMetadata'
                                         : 'Microsoft.Dynamics.CRM.StatusAttributeMetadata';
    const ps = await get(
      token,
      `/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes(LogicalName='${attrLogicalName}')/${cast}?$expand=OptionSet`,
    );
    if (ps.ok && ps.body.OptionSet?.Options) {
      result.options = ps.body.OptionSet.Options.map((o) => ({
        value: o.Value,
        label: o.Label?.UserLocalizedLabel?.Label || null,
      }));
    }
  }
  return result;
}

async function sampleRows(token) {
  // Fetch a few recent rows showing both fields side by side.
  const selectFields = [
    'akoya_requestid',
    'akoya_name',
    'akoya_requeststatus',
    'wmkf_phaseiistatus',
    'createdon',
    'modifiedon',
  ].join(',');
  const r = await get(
    token,
    `/akoya_requests?$select=${selectFields}&$orderby=modifiedon desc&$top=10`,
  );
  return r;
}

async function distinctValues(token, field) {
  // Cheap distribution check — pull top 200 most recent, count distinct.
  const r = await get(
    token,
    `/akoya_requests?$select=${field}&$orderby=modifiedon desc&$top=200`,
  );
  if (!r.ok) return { ok: false, error: r.body };
  const counts = {};
  for (const row of r.body.value || []) {
    const v = row[field];
    const fmt = row[`${field}@OData.Community.Display.V1.FormattedValue`];
    const key = `${v === null || v === undefined ? '<null>' : v}${fmt ? ` (${fmt})` : ''}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  return { ok: true, counts };
}

(async () => {
  if (!process.env.DYNAMICS_URL || !process.env.DYNAMICS_TENANT_ID) {
    console.error('Missing DYNAMICS_URL / DYNAMICS_TENANT_ID / DYNAMICS_CLIENT_ID / DYNAMICS_CLIENT_SECRET in .env.local');
    process.exit(2);
  }
  const token = await getToken();
  console.log(`# probe-akoya-phaseii-status-field — ${new Date().toISOString()}\n`);
  console.log(`Org: ${process.env.DYNAMICS_URL}\n`);

  console.log('## 1. akoya_request.akoya_requeststatus metadata\n');
  const a = await attrMetadata(token, 'akoya_request', 'akoya_requeststatus');
  console.log(JSON.stringify(a, null, 2));
  console.log();

  console.log('## 2. akoya_request.wmkf_phaseiistatus metadata\n');
  const b = await attrMetadata(token, 'akoya_request', 'wmkf_phaseiistatus');
  console.log(JSON.stringify(b, null, 2));
  console.log();

  console.log('## 3. Sample rows (top 10 by modifiedon desc) — both fields\n');
  const s = await sampleRows(token);
  if (!s.ok) {
    console.log(`ERROR: ${s.status}`);
    console.log(typeof s.body === 'string' ? s.body : JSON.stringify(s.body));
  } else {
    for (const row of s.body.value || []) {
      console.log(`- ${row.akoya_name || '(no name)'}`);
      console.log(`    akoya_requestid:     ${row.akoya_requestid}`);
      console.log(`    akoya_requeststatus: ${JSON.stringify(row.akoya_requeststatus)}  (fmt: ${row['akoya_requeststatus@OData.Community.Display.V1.FormattedValue'] ?? '-'})`);
      console.log(`    wmkf_phaseiistatus:  ${JSON.stringify(row.wmkf_phaseiistatus)}  (fmt: ${row['wmkf_phaseiistatus@OData.Community.Display.V1.FormattedValue'] ?? '-'})`);
      console.log(`    modifiedon:          ${row.modifiedon}`);
    }
  }
  console.log();

  console.log('## 4. Distribution: akoya_requeststatus across most-recent 200 rows\n');
  const da = await distinctValues(token, 'akoya_requeststatus');
  console.log(JSON.stringify(da, null, 2));
  console.log();

  console.log('## 5. Distribution: wmkf_phaseiistatus across most-recent 200 rows\n');
  const db = await distinctValues(token, 'wmkf_phaseiistatus');
  console.log(JSON.stringify(db, null, 2));
})().catch((e) => {
  console.error('Probe failed:', e);
  process.exit(1);
});
