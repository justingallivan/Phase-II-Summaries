#!/usr/bin/env node
/**
 * Usage: node scripts/smoke-suggestions-by-request.js <requestGuid>
 */
require('./../lib/dataverse/client').loadEnvLocal();
(async () => {
  const reqId = process.argv[2];
  if (!reqId) { console.error('requestGuid required'); process.exit(1); }
  const { DynamicsService } = await import('../lib/services/dynamics-service.js');
  const { bypassDynamicsRestrictions } = await import('../lib/services/dynamics-context.js');
  return bypassDynamicsRestrictions('smoke', async () => {

  const { records } = await DynamicsService.queryRecords('wmkf_appreviewersuggestions', {
    select: 'wmkf_appreviewersuggestionid,wmkf_suggestionlabel,wmkf_relevancescore,wmkf_selected,createdon,modifiedon,_wmkf_potentialreviewer_value',
    filter: `_wmkf_request_value eq ${reqId}`,
    orderby: 'createdon desc',
    top: 50,
  });

  console.log(`\n=== ${records.length} suggestions on request ${reqId} ===\n`);
  for (const s of records) {
    const drift = new Date(s.modifiedon) - new Date(s.createdon);
    const tag = drift > 1000 ? `(updated +${Math.round(drift/1000)}s)` : '(new)';
    console.log(`  ${s.wmkf_suggestionlabel || '(no label)'} ${tag}`);
    console.log(`    created : ${s.createdon}`);
    console.log(`    modified: ${s.modifiedon}`);
    console.log(`    score:    ${s.wmkf_relevancescore} | selected: ${s.wmkf_selected}`);
  }
  });
})().catch((e) => { console.error(e.message); process.exit(1); });
