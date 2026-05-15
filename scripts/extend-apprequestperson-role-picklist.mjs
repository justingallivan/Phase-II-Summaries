/**
 * Extend wmkf_apprequestperson.wmkf_role picklist 2 -> 5 values.
 *
 * Intake-portal schema slice 0. Adds:
 *   100000002 = Senior Personnel
 *   100000003 = Key Personnel
 *   100000004 = Other
 * Preserves existing 100000000 = PI, 100000001 = Co-PI.
 *
 * WHY a standalone script (not a wave spec): scripts/apply-dataverse-schema.js
 * is creation-only by design — ensureAttribute() short-circuits on an existing
 * attribute, so adding options to an existing picklist via a wave spec is a
 * silent no-op. This mirrors the established precedent
 * scripts/extend-responsetype-picklist.mjs (InsertOptionValue action).
 *
 * Idempotent: each option is checked before insert; existing options are skipped.
 *
 * PRE-DEPLOY GATE: run scripts/probe-apprequestperson-role-data.js first and
 * confirm CLEAR (no live rows occupy 100000002-100000004). Verified CLEAR
 * 2026-05-15 (S155); the result is point-in-time — re-run at deploy.
 *
 * Existing readers (contact-history, generate-emails, external review context,
 * acceptance-w4) already filter wmkf_role IN (100000000,100000001) per the
 * 2026-05-14 source-scope patch, so the expansion is non-breaking by construction.
 */

import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
}

const { DynamicsService } = await import('../lib/services/dynamics-service.js');

const baseUrl = process.env.DYNAMICS_URL;
const token = await DynamicsService.getAccessToken();

const ENTITY = 'wmkf_apprequestperson';
const ATTRIBUTE = 'wmkf_role';
const SOLUTION = 'wmkfResearchReviewAppSuite';
const NEW_OPTIONS = [
  { value: 100000002, label: 'Senior Personnel' },
  { value: 100000003, label: 'Key Personnel' },
  { value: 100000004, label: 'Other' },
];

const checkUrl =
  `${baseUrl}/api/data/v9.2/EntityDefinitions(LogicalName='${ENTITY}')` +
  `/Attributes(LogicalName='${ATTRIBUTE}')` +
  `/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$expand=OptionSet`;

async function currentOptions() {
  const r = await fetch(checkUrl, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!r.ok) {
    console.error(`Failed to read option set (${r.status}): ${await r.text()}`);
    process.exit(1);
  }
  return (await r.json()).OptionSet?.Options || [];
}

const before = await currentOptions();
console.log('Current options:');
for (const o of before) console.log(`  ${o.Value}: ${o.Label?.UserLocalizedLabel?.Label}`);

let inserted = 0;
for (const opt of NEW_OPTIONS) {
  if (before.find((o) => o.Value === opt.value)) {
    console.log(`\nOption ${opt.value} (${opt.label}) already exists. Skip.`);
    continue;
  }
  const resp = await fetch(`${baseUrl}/api/data/v9.2/InsertOptionValue`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'MSCRM.SolutionUniqueName': SOLUTION,
    },
    body: JSON.stringify({
      EntityLogicalName: ENTITY,
      AttributeLogicalName: ATTRIBUTE,
      Value: opt.value,
      Label: {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{
          '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
          Label: opt.label,
          LanguageCode: 1033,
        }],
      },
    }),
  });
  if (!resp.ok) {
    console.error(`\nInsertOptionValue ${opt.value} failed (${resp.status}): ${await resp.text()}`);
    process.exit(1);
  }
  console.log(`\n✓ Inserted ${opt.value} = ${opt.label}`);
  inserted++;
}

const after = await currentOptions();
console.log('\nAfter:');
for (const o of after) console.log(`  ${o.Value}: ${o.Label?.UserLocalizedLabel?.Label}`);

const allPresent = NEW_OPTIONS.every((opt) => after.find((o) => o.Value === opt.value));
console.log(allPresent
  ? `\n✓ All 3 new options present (${inserted} inserted this run; rest pre-existing).`
  : '\n✗ verify failed — not all expected options present');
process.exit(allPresent ? 0 : 1);
