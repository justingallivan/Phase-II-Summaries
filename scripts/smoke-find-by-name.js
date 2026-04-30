#!/usr/bin/env node
/**
 * Search potential reviewers and suggestions by name fragment.
 * Usage: node scripts/smoke-find-by-name.js <nameFragment>
 */
require('./../lib/dataverse/client').loadEnvLocal();
(async () => {
  const frag = process.argv[2];
  if (!frag) { console.error('name fragment required'); process.exit(1); }
  const { DynamicsService } = await import('../lib/services/dynamics-service.js');
  DynamicsService.bypassRestrictions('smoke');

  const escaped = frag.replace(/'/g, "''");

  const { records: prs } = await DynamicsService.queryRecords('wmkf_potentialreviewerses', {
    select: 'wmkf_potentialreviewersid,wmkf_name,wmkf_emailaddress,wmkf_organizationname,createdon,modifiedon',
    filter: `contains(wmkf_name,'${escaped}')`,
    top: 10,
  });
  console.log(`\n=== ${prs.length} potentialreviewer rows matching "${frag}" ===`);
  for (const p of prs) {
    console.log(`  ${p.wmkf_name} | ${p.wmkf_emailaddress} | ${p.wmkf_organizationname}`);
    console.log(`    id: ${p.wmkf_potentialreviewersid}  created: ${p.createdon}`);

    const { records: sgs } = await DynamicsService.queryRecords('wmkf_appreviewersuggestions', {
      select: 'wmkf_appreviewersuggestionid,wmkf_suggestionlabel,wmkf_selected,createdon,_wmkf_request_value',
      filter: `_wmkf_potentialreviewer_value eq ${p.wmkf_potentialreviewersid}`,
      top: 10,
    });
    console.log(`    suggestions: ${sgs.length}`);
    for (const s of sgs) {
      console.log(`      - ${s.wmkf_suggestionlabel} | request ${s._wmkf_request_value} | created ${s.createdon}`);
    }

    const { records: rs } = await DynamicsService.queryRecords('wmkf_appresearchers', {
      select: 'wmkf_appresearcherid,wmkf_hindex,wmkf_totalcitations,wmkf_primaryaffiliation',
      filter: `_wmkf_potentialreviewer_value eq ${p.wmkf_potentialreviewersid}`,
      top: 1,
    });
    console.log(`    researcher: ${rs.length ? `h-index ${rs[0].wmkf_hindex ?? '-'} / cites ${rs[0].wmkf_totalcitations ?? '-'}` : '(none)'}`);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
