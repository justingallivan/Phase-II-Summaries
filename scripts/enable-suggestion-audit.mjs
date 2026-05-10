/**
 * Enable Dataverse entity audit on wmkf_appreviewersuggestion.
 *
 * Stage 2a slice 1 prereq. The audit model (per docs/REVIEWER_STAGE_2A_BUILD_PLAN.md §2)
 * relies on Dataverse's native field-level before/after audit instead of building
 * a parallel wmkf_reviewer_audit entity. That requires IsAuditEnabled=true on the
 * entity. Probe (S143 pre-build) confirmed it's currently false.
 *
 * Idempotent: PATCH succeeds whether the value is already true or not.
 *
 * Usage:
 *   node scripts/enable-suggestion-audit.mjs           # prod (default)
 *   node scripts/enable-suggestion-audit.mjs --check   # report-only, no write
 */

import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
}

const checkOnly = process.argv.includes('--check');
const { DynamicsService } = await import('../lib/services/dynamics-service.js');

const baseUrl = process.env.DYNAMICS_URL;
const token = await DynamicsService.getAccessToken();
const url = `${baseUrl}/api/data/v9.2/EntityDefinitions(LogicalName='wmkf_appreviewersuggestion')`;

// Pre-state
const probe = await fetch(`${url}?$select=LogicalName,IsAuditEnabled`, {
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
});
const before = await probe.json();
console.log(`Before: IsAuditEnabled = ${before.IsAuditEnabled?.Value}`);

if (checkOnly) {
  process.exit(0);
}

if (before.IsAuditEnabled?.Value === true) {
  console.log('Already enabled. No-op.');
  process.exit(0);
}

// Fetch full entity metadata first; PUT needs the full body, not a partial.
const fullResp = await fetch(url, {
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
});
const full = await fullResp.json();
full.IsAuditEnabled = { Value: true, CanBeChanged: true, ManagedPropertyLogicalName: 'canmodifyauditsettings' };

const patchResp = await fetch(url, {
  method: 'PUT',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'MSCRM.MergeLabels': 'true',
  },
  body: JSON.stringify(full),
});

if (!patchResp.ok) {
  const text = await patchResp.text();
  console.error(`PATCH failed (${patchResp.status}): ${text}`);
  process.exit(1);
}

// Verify
const verify = await fetch(`${url}?$select=LogicalName,IsAuditEnabled`, {
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
});
const after = await verify.json();
console.log(`After:  IsAuditEnabled = ${after.IsAuditEnabled?.Value}`);
console.log(after.IsAuditEnabled?.Value === true ? '✓ enabled' : '✗ verify failed');
