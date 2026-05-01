#!/usr/bin/env node
/**
 * Confirm: can we read+modify the wmkf_appreviewersuggestion entity schema
 * in PROD ourselves (without Connor)?
 *
 * Non-destructive: reads metadata only. The actual add-column step would
 * use scripts/apply-dataverse-schema.js with a wave2-existing extension.
 */

const { loadEnvLocal, getAccessToken } = require('../lib/dataverse/client');
loadEnvLocal();

const PROD_URL = process.env.DYNAMICS_URL;
const ENTITY = 'wmkf_appreviewersuggestion';

(async () => {
  const token = await getAccessToken(PROD_URL);
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
  };

  console.log(`Target: ${PROD_URL}\n`);

  // 1. Entity exists + we can read its definition (proves prvReadEntity for it)
  const entResp = await fetch(
    `${PROD_URL}/api/data/v9.2/EntityDefinitions(LogicalName='${ENTITY}')?$select=LogicalName,SchemaName,DisplayName,IsCustomEntity,OwnershipType`,
    { headers }
  );
  if (!entResp.ok) {
    console.error(`✗ EntityDefinitions GET ${entResp.status}: ${(await entResp.text()).slice(0, 400)}`);
    process.exit(1);
  }
  const ent = await entResp.json();
  console.log(`✓ Entity readable: ${ent.LogicalName} (${ent.SchemaName})`);
  console.log(`  Custom: ${ent.IsCustomEntity}, Ownership: ${ent.OwnershipType}\n`);

  // 2. Can we list attributes? (proves prvReadAttribute)
  const attrResp = await fetch(
    `${PROD_URL}/api/data/v9.2/EntityDefinitions(LogicalName='${ENTITY}')/Attributes?$select=LogicalName,AttributeType&$filter=IsCustomAttribute eq true`,
    { headers }
  );
  if (!attrResp.ok) {
    console.error(`✗ Attributes GET ${attrResp.status}: ${(await attrResp.text()).slice(0, 400)}`);
    process.exit(1);
  }
  const attrs = await attrResp.json();
  console.log(`✓ Custom attributes (${attrs.value.length}):`);
  for (const a of attrs.value.slice(0, 30)) {
    console.log(`  - ${a.LogicalName} (${a.AttributeType})`);
  }
  if (attrs.value.length > 30) console.log(`  ... and ${attrs.value.length - 30} more`);

  // 3. Confirm our solution exists and we can write to it (no actual write —
  //    just check the solution endpoint responds with our solution).
  const solResp = await fetch(
    `${PROD_URL}/api/data/v9.2/solutions?$select=uniquename,friendlyname,ismanaged&$filter=uniquename eq 'ResearchReviewAppSuite'`,
    { headers }
  );
  if (solResp.ok) {
    const sol = await solResp.json();
    if (sol.value.length) {
      console.log(`\n✓ Solution: ${sol.value[0].uniquename} (managed=${sol.value[0].ismanaged})`);
    } else {
      console.log('\n✗ Solution ResearchReviewAppSuite not found in prod');
    }
  }

  console.log('\n[INFO] To extend this entity, add the new attributes to a');
  console.log('       lib/dataverse/schema/wave2-existing/wmkf_appreviewersuggestion-extensions.json');
  console.log('       file (mirroring wmkf_potentialreviewers-extensions.json), then run:');
  console.log('       node scripts/apply-dataverse-schema.js --target=prod --wave=2 --execute');
})().catch(e => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
