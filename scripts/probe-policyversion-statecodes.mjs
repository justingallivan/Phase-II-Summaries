#!/usr/bin/env node

/**
 * Probe `wmkf_policyversion` statecode + statuscode option-set values so the
 * policy-publish route can hardcode the correct integers for Active and
 * Retired without trusting numeric defaults that may differ per environment.
 *
 * Read-only: hits EntityDefinitions metadata, no writes.
 *
 * Output is a JSON block ready to paste into POLICY_VERSION_STATUS in
 * pages/api/admin/policies.js.
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

async function probe(attrCast, field) {
  const url =
    `${DYNAMICS_URL}/api/data/v9.2/EntityDefinitions(LogicalName='wmkf_policyversion')` +
    `/Attributes(LogicalName='${field}')` +
    `/${attrCast}?$expand=OptionSet`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!r.ok) {
    console.error(`Probe failed for ${field} (${r.status}): ${await r.text()}`);
    return null;
  }
  return (await r.json()).OptionSet?.Options || [];
}

const stateOptions = await probe('Microsoft.Dynamics.CRM.StateAttributeMetadata', 'statecode');
const statusOptions = await probe('Microsoft.Dynamics.CRM.StatusAttributeMetadata', 'statuscode');

if (!stateOptions || !statusOptions) {
  console.error('Probe failed — see errors above');
  process.exit(1);
}

function dump(label, options) {
  console.log(`\n=== ${label} (${options.length} options) ===`);
  for (const o of options) {
    const lbl = o.Label?.UserLocalizedLabel?.Label || '?';
    const stateValue = typeof o.State === 'number' ? `  (State=${o.State})` : '';
    console.log(`  ${String(o.Value).padEnd(12)} ${lbl}${stateValue}`);
  }
}

dump('statecode', stateOptions);
dump('statuscode', statusOptions);

// Best-effort label match for the constant block
function findByLabel(options, target) {
  return options.find(o => (o.Label?.UserLocalizedLabel?.Label || '').toLowerCase() === target.toLowerCase());
}

const active = findByLabel(stateOptions, 'Active');
const inactive = findByLabel(stateOptions, 'Inactive');
const statusActive = findByLabel(statusOptions, 'Active');
const statusInactive = findByLabel(statusOptions, 'Inactive');

console.log(`\n--- Suggested POLICY_VERSION_STATUS block (verify before pasting) ---`);
console.log(`const POLICY_VERSION_STATUS = Object.freeze({`);
console.log(`  ACTIVE:   { statecode: ${active?.Value ?? '?'}, statuscode: ${statusActive?.Value ?? '?'} },`);
console.log(`  RETIRED:  { statecode: ${inactive?.Value ?? '?'}, statuscode: ${statusInactive?.Value ?? '?'} },`);
console.log(`});`);
console.log(`// Verified ${new Date().toISOString().slice(0, 10)} via scripts/probe-policyversion-statecodes.mjs`);
