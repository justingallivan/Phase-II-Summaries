/**
 * Extend wmkf_appreviewersuggestion.wmkf_responsetype picklist with
 * `withdrawn_sufficient = 100000003`.
 *
 * Stage 2a slice 1 prereq. Distinct from `declined` (reviewer initiative)
 * and `no_response` (timeout) so analytics aren't muddied by capacity-cancellations.
 *
 * Idempotent: if the option already exists, it's a no-op.
 *
 * Per probe (S143): current options are
 *   100000000=Accepted, 100000001=Declined, 100000002=No Response.
 * Next free integer = 100000003.
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

const NEW_VALUE = 100000003;
const NEW_LABEL = 'Withdrawn-Sufficient';

// Check current state
const checkUrl = `${baseUrl}/api/data/v9.2/EntityDefinitions(LogicalName='wmkf_appreviewersuggestion')/Attributes(LogicalName='wmkf_responsetype')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$expand=OptionSet`;
const checkResp = await fetch(checkUrl, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
const check = await checkResp.json();
const opts = check.OptionSet?.Options || [];
console.log('Current options:');
for (const o of opts) {
  console.log(`  ${o.Value}: ${o.Label?.UserLocalizedLabel?.Label}`);
}

if (opts.find(o => o.Value === NEW_VALUE)) {
  console.log(`\nOption ${NEW_VALUE} already exists. No-op.`);
  process.exit(0);
}

// Use InsertOptionValue action — the proper Dataverse Web API for adding options to local picklists
const insertUrl = `${baseUrl}/api/data/v9.2/InsertOptionValue`;
const insertResp = await fetch(insertUrl, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'MSCRM.SolutionUniqueName': 'wmkfResearchReviewAppSuite',
  },
  body: JSON.stringify({
    EntityLogicalName: 'wmkf_appreviewersuggestion',
    AttributeLogicalName: 'wmkf_responsetype',
    Value: NEW_VALUE,
    Label: {
      '@odata.type': 'Microsoft.Dynamics.CRM.Label',
      LocalizedLabels: [{
        '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
        Label: NEW_LABEL,
        LanguageCode: 1033,
      }],
    },
  }),
});

if (!insertResp.ok) {
  const text = await insertResp.text();
  console.error(`InsertOptionValue failed (${insertResp.status}): ${text}`);
  process.exit(1);
}

// Verify
const verifyResp = await fetch(checkUrl, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
const verify = await verifyResp.json();
console.log('\nAfter:');
for (const o of verify.OptionSet?.Options || []) {
  console.log(`  ${o.Value}: ${o.Label?.UserLocalizedLabel?.Label}`);
}
const found = (verify.OptionSet?.Options || []).find(o => o.Value === NEW_VALUE);
console.log(found ? `\n✓ ${NEW_VALUE} added` : '\n✗ verify failed');
