#!/usr/bin/env node
/**
 * Reset a wmkf_appreviewersuggestion row to clean pre-materials Stage 2a
 * state. Clears engagement fields touched by accept/decline so the row
 * lands at view='stage2a' on the next /context load.
 *
 * Token hash + expiry are LEFT IN PLACE — the JWT you minted still works.
 *
 * Usage: node scripts/reset-stage2a-state.js <suggestionId>
 */

require('./../lib/dataverse/client').loadEnvLocal();

(async () => {
  const id = process.argv[2];
  if (!id) {
    console.error('Usage: node scripts/reset-stage2a-state.js <suggestionId>');
    process.exit(2);
  }
  const { DynamicsService } = await import('../lib/services/dynamics-service.js');
  const { bypassDynamicsRestrictions } = await import('../lib/services/dynamics-context.js');

  return bypassDynamicsRestrictions('reset', async () => {
    await DynamicsService.updateRecord('wmkf_appreviewersuggestions', id, {
      wmkf_accepted: false,
      wmkf_declined: false,
      wmkf_responsetype: null,
      wmkf_responsereceivedat: null,
      wmkf_declinereason: null,
      wmkf_declinereasonpicklist: null,
      wmkf_declinereferral: null,
      wmkf_coiackedat: null,
      wmkf_aiuseackedat: null,
      'wmkf_CoiPolicyVersion@odata.bind': null,
      'wmkf_AiUsePolicyVersion@odata.bind': null,
      wmkf_proposalfirstaccessed: null,
    });
    console.log('Reset', id, 'to clean Stage 2a state.');
  });
})().catch((e) => { console.error(e.message); process.exit(1); });
