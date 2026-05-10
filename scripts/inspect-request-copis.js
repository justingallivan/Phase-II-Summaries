#!/usr/bin/env node
/**
 * Dump PI + co-PI for an akoya_request from BOTH the slot fields AND
 * the wmkf_apprequestperson junction.
 *
 * Usage: node scripts/inspect-request-copis.js <requestId>
 */

require('./../lib/dataverse/client').loadEnvLocal();

(async () => {
  const id = process.argv[2];
  if (!id) {
    console.error('Usage: node scripts/inspect-request-copis.js <requestId>');
    process.exit(2);
  }
  const { DynamicsService } = await import('../lib/services/dynamics-service.js');
  const { bypassDynamicsRestrictions } = await import('../lib/services/dynamics-context.js');

  return bypassDynamicsRestrictions('inspect', async () => {
    // Slot fields (legacy):
    const req = await DynamicsService.getRecord('akoya_requests', id, {
      select: 'akoya_requestnum,akoya_title,_wmkf_projectleader_value,_wmkf_copi1_value,_wmkf_copi2_value,_wmkf_copi3_value,_wmkf_copi4_value,_wmkf_copi5_value',
    });
    console.log('\nRequest', req.akoya_requestnum, '—', req.akoya_title);
    console.log('\n=== Slot fields ===');
    console.log('  PI:', req['_wmkf_projectleader_value@OData.Community.Display.V1.FormattedValue'] || '(none)');
    for (let i = 1; i <= 5; i++) {
      const f = req[`_wmkf_copi${i}_value@OData.Community.Display.V1.FormattedValue`];
      if (f) console.log(`  Co-PI${i}:`, f);
    }

    // Junction:
    console.log('\n=== wmkf_apprequestperson junction ===');
    const { records } = await DynamicsService.queryRecords('wmkf_apprequestpersons', {
      select: 'wmkf_apprequestpersonid,wmkf_role,wmkf_authorposition,_wmkf_contact_value',
      filter: `_wmkf_request_value eq ${id}`,
      orderby: 'wmkf_role,wmkf_authorposition',
    });
    if (!records.length) {
      console.log('  (no rows)');
    } else {
      for (const r of records) {
        const roleName = r.wmkf_role === 100000000 ? 'PI' : r.wmkf_role === 100000001 ? 'Co-PI' : `role=${r.wmkf_role}`;
        const contact = r['_wmkf_contact_value@OData.Community.Display.V1.FormattedValue'] || r._wmkf_contact_value;
        console.log(`  ${roleName.padEnd(6)} pos=${r.wmkf_authorposition ?? '-'} → ${contact}`);
      }
    }
  });
})().catch((e) => { console.error(e.message); process.exit(1); });
