#!/usr/bin/env node
/**
 * Dump current Stage 2a-relevant state for a suggestion row.
 * Usage: node scripts/inspect-stage2a-state.js <suggestionId>
 */

require('./../lib/dataverse/client').loadEnvLocal();

(async () => {
  const id = process.argv[2];
  if (!id) {
    console.error('Usage: node scripts/inspect-stage2a-state.js <suggestionId>');
    process.exit(2);
  }
  const { DynamicsService } = await import('../lib/services/dynamics-service.js');
  const { bypassDynamicsRestrictions } = await import('../lib/services/dynamics-context.js');

  return bypassDynamicsRestrictions('inspect', async () => {
    const fields = [
      'wmkf_appreviewersuggestionid',
      'wmkf_reviewstatus', 'wmkf_responsetype', 'wmkf_accepted', 'wmkf_declined',
      'wmkf_responsereceivedat',
      'wmkf_proposalfirstaccessed',
      'wmkf_declinereason', 'wmkf_declinereasonpicklist', 'wmkf_declinereferral',
      'wmkf_coiackedat', 'wmkf_aiuseackedat',
      '_wmkf_coipolicyversion_value', '_wmkf_aiusepolicyversion_value',
      'wmkf_reviewerfirstname', 'wmkf_reviewerlastname', 'wmkf_reviewernickname',
      'wmkf_reviewertitle', 'wmkf_revieweraffiliation', 'wmkf_revieweremail',
      'wmkf_reviewerorcid', 'wmkf_honorariumoptout',
      'wmkf_externaltokenissued', 'wmkf_externaltokenexpires', 'wmkf_externaltokenrevoked',
      'modifiedon',
    ];
    const rec = await DynamicsService.getRecord('wmkf_appreviewersuggestions', id, {
      select: fields.join(','),
    });

    console.log('\n=== Stage 2a state for', id, '===\n');
    for (const f of fields) {
      const v = rec[f];
      if (v === null || v === undefined || v === '') continue;
      console.log(`  ${f.padEnd(36)} = ${v}`);
    }
  });
})().catch((e) => { console.error(e.message); process.exit(1); });
