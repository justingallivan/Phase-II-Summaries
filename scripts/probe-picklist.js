#!/usr/bin/env node

/**
 * Probe a Dataverse Picklist field's option-set values.
 *
 * Usage:
 *   node scripts/probe-picklist.js <entity>.<field>
 *
 * Examples:
 *   node scripts/probe-picklist.js akoya_request.wmkf_ai_compliancecheck
 *   node scripts/probe-picklist.js wmkf_ai_run.wmkf_ai_status
 *   node scripts/probe-picklist.js wmkf_ai_prompt.wmkf_ai_promptstatus
 *
 * Output: numeric values + labels, plus a ready-to-paste JSON valueMap for
 * use in `wmkf_ai_promptoutputschema.outputs[].valueMap` (per the
 * Picklist target type extension; see docs/EXECUTOR_EXTENSIONS_PLAN.md §3).
 *
 * Reads Dynamics credentials from .env or .env.local (DYNAMICS_URL,
 * DYNAMICS_TENANT_ID, DYNAMICS_CLIENT_ID, DYNAMICS_CLIENT_SECRET).
 *
 * Read-only — performs a metadata GET against EntityDefinitions; no writes.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

for (const envFile of ['.env', '.env.local']) {
  try {
    const c = readFileSync(resolve(process.cwd(), envFile), 'utf8');
    for (const line of c.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {}
}

const arg = process.argv[2];
if (!arg || !arg.includes('.')) {
  console.error('Usage: node scripts/probe-picklist.js <entity>.<field>');
  console.error('Example: node scripts/probe-picklist.js akoya_request.wmkf_ai_compliancecheck');
  process.exit(2);
}
const [entity, field] = arg.split('.');

const { DYNAMICS_URL, DYNAMICS_TENANT_ID, DYNAMICS_CLIENT_ID, DYNAMICS_CLIENT_SECRET } = process.env;
if (!DYNAMICS_URL || !DYNAMICS_TENANT_ID || !DYNAMICS_CLIENT_ID || !DYNAMICS_CLIENT_SECRET) {
  console.error('Missing Dynamics credentials in env');
  process.exit(1);
}

const tokenResp = await fetch(
  `https://login.microsoftonline.com/${DYNAMICS_TENANT_ID}/oauth2/v2.0/token`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: DYNAMICS_CLIENT_ID,
      client_secret: DYNAMICS_CLIENT_SECRET,
      scope: `${DYNAMICS_URL}/.default`,
    }).toString(),
  },
);
const token = (await tokenResp.json()).access_token;
if (!token) {
  console.error('Failed to acquire token');
  process.exit(1);
}

const url =
  `${DYNAMICS_URL}/api/data/v9.2/EntityDefinitions(LogicalName='${entity}')` +
  `/Attributes(LogicalName='${field}')` +
  `/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$expand=OptionSet`;
const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });

if (!r.ok) {
  console.error(`Probe failed (${r.status}): ${await r.text()}`);
  console.error(`\nIs ${entity}.${field} actually a Picklist? Try without the cast for raw attribute info:`);
  console.error(`  curl -H "Authorization: Bearer <token>" "${DYNAMICS_URL}/api/data/v9.2/EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='${field}')?\\$select=AttributeType"`);
  process.exit(1);
}

const data = await r.json();
const options = data.OptionSet?.Options || [];
if (options.length === 0) {
  console.error('No options found — field may not be a Picklist.');
  process.exit(1);
}

console.log(`\n=== ${entity}.${field} (${options.length} options) ===`);
for (const o of options) {
  const label = o.Label?.UserLocalizedLabel?.Label || '?';
  console.log(`  ${String(o.Value).padEnd(12)} ${label}`);
}

console.log(`\n--- Ready-to-paste valueMap (label → numeric) ---`);
const valueMap = {};
for (const o of options) {
  const label = o.Label?.UserLocalizedLabel?.Label || '?';
  // Lowercase + simplify for prompt-friendly keys (e.g., "Pass" → "pass",
  // "Needs Review" → "needs_review"). The prompt body should ask Claude to
  // return one of these exact strings.
  const key = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  valueMap[key] = o.Value;
}
console.log(JSON.stringify({ valueMap }, null, 2));

console.log(`\n--- Original-case keys (if you want exact label matching) ---`);
const exactMap = {};
for (const o of options) {
  const label = o.Label?.UserLocalizedLabel?.Label || '?';
  exactMap[label] = o.Value;
}
console.log(JSON.stringify({ valueMap: exactMap }, null, 2));
