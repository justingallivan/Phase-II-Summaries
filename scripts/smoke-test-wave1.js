#!/usr/bin/env node
/**
 * Wave 1 data smoke test — exercise the real shape of each new table.
 *
 * Writes a handful of rows to sandbox, asserts observable behavior,
 * and cleans up. Safe to rerun.
 *
 * Checks:
 *   1. Entity sets resolve (Dataverse pluralization matches our expectations).
 *   2. INSERT into wmkf_AppSystemSetting succeeds.
 *   3. Duplicate wmkf_settingkey is rejected (alt-key works).
 *   4. INSERT into wmkf_AppUserAppAccess with systemuser lookup succeeds.
 *   5. Composite alt-key on (wmkf_user, wmkf_appkey) rejects duplicates.
 *   6. INSERT into wmkf_AppUserPreference auto-populates ownerid.
 */

const { loadEnvLocal, getAccessToken, createClient } = require('../lib/dataverse/client');

loadEnvLocal();

function fail(msg) { console.error(`✗ ${msg}`); process.exitCode = 1; }
function pass(msg) { console.log(`✓ ${msg}`); }

(async () => {
  const url = process.env.DYNAMICS_SANDBOX_URL;
  if (!url) throw new Error('DYNAMICS_SANDBOX_URL not set');
  const token = await getAccessToken(url);
  const c = createClient({ resourceUrl: url, token });

  console.log(`Target: ${url}\n`);

  // ── 1. Resolve entity-set names ─────────────────────────────────────────
  console.log('━━━ 1. Entity-set names ━━━');
  const sets = {};
  for (const logical of ['wmkf_appsystemsetting', 'wmkf_appuserappaccess', 'wmkf_appuserpreference']) {
    const r = await c.get(`/EntityDefinitions(LogicalName='${logical}')?$select=LogicalName,EntitySetName`);
    if (!r.ok) { fail(`entity ${logical} not found: ${r.status}`); return; }
    sets[logical] = r.body.EntitySetName;
    pass(`${logical} → ${r.body.EntitySetName}`);
  }

  // ── 2. Pick a systemuser to play the role of "user" in grants ───────────
  console.log('\n━━━ 2. Get a systemuser for lookups ━━━');
  const users = await c.get(`/systemusers?$filter=isdisabled eq false and accessmode eq 0&$select=systemuserid,fullname,internalemailaddress&$top=1`);
  if (!users.ok || !users.body.value?.length) { fail('no active systemusers found'); return; }
  const testUser = users.body.value[0];
  pass(`systemuser: ${testUser.fullname || testUser.internalemailaddress} (${testUser.systemuserid})`);

  // Track every row we create for cleanup.
  const createdRows = [];

  try {
    // ── 3. Insert into wmkf_AppSystemSetting ──────────────────────────────
    console.log('\n━━━ 3. wmkf_AppSystemSetting ━━━');
    const settingKey = `smoketest.${Date.now()}`;
    const r3 = await c.post(`/${sets.wmkf_appsystemsetting}`, {
      wmkf_settingkey: settingKey,
      wmkf_settingvalue: 'hello world',
      'wmkf_UpdatedBy@odata.bind': `/systemusers(${testUser.systemuserid})`,
    });
    if (!r3.ok) { fail(`insert setting failed: ${r3.status} ${r3.text.slice(0, 300)}`); return; }
    // 204 No Content with OData-EntityId header normally; fetch back by alt-key
    const fetchBack = await c.get(`/${sets.wmkf_appsystemsetting}(wmkf_settingkey='${settingKey}')?$select=wmkf_appsystemsettingid,wmkf_settingvalue,_wmkf_updatedby_value`);
    if (!fetchBack.ok) { fail(`couldn't fetch setting back by alt-key: ${fetchBack.status}`); return; }
    const settingId = fetchBack.body.wmkf_appsystemsettingid;
    createdRows.push({ set: sets.wmkf_appsystemsetting, id: settingId, label: `setting ${settingKey}` });
    pass(`insert + alt-key fetch OK (value="${fetchBack.body.wmkf_settingvalue}", updated_by=${fetchBack.body._wmkf_updatedby_value})`);

    // Duplicate should be rejected
    const r3dup = await c.post(`/${sets.wmkf_appsystemsetting}`, {
      wmkf_settingkey: settingKey,
      wmkf_settingvalue: 'duplicate',
    });
    if (r3dup.ok) { fail('duplicate settingkey was NOT rejected'); }
    else pass(`duplicate settingkey rejected (${r3dup.status})`);

    // ── 4. Insert into wmkf_AppUserAppAccess ─────────────────────────────
    console.log('\n━━━ 4. wmkf_AppUserAppAccess ━━━');
    const appKey = `smoke-app-${Date.now()}`;
    const r4 = await c.post(`/${sets.wmkf_appuserappaccess}`, {
      wmkf_appkey: appKey,
      'wmkf_User@odata.bind': `/systemusers(${testUser.systemuserid})`,
      'wmkf_GrantedBy@odata.bind': `/systemusers(${testUser.systemuserid})`,
    });
    if (!r4.ok) { fail(`insert user_app_access failed: ${r4.status} ${r4.text.slice(0, 400)}`); return; }
    const access = await c.get(`/${sets.wmkf_appuserappaccess}?$filter=wmkf_appkey eq '${appKey}'&$select=wmkf_appuserappaccessid,_wmkf_user_value,_wmkf_grantedby_value`);
    const accessRow = access.body.value[0];
    createdRows.push({ set: sets.wmkf_appuserappaccess, id: accessRow.wmkf_appuserappaccessid, label: `access ${appKey}` });
    pass(`insert OK (user=${accessRow._wmkf_user_value}, granted_by=${accessRow._wmkf_grantedby_value})`);

    const r4dup = await c.post(`/${sets.wmkf_appuserappaccess}`, {
      wmkf_appkey: appKey,
      'wmkf_User@odata.bind': `/systemusers(${testUser.systemuserid})`,
    });
    if (r4dup.ok) { fail('duplicate (user, app_key) was NOT rejected'); }
    else pass(`duplicate (user, app_key) rejected (${r4dup.status})`);

    // ── 5. Insert into wmkf_AppUserPreference ────────────────────────────
    console.log('\n━━━ 5. wmkf_AppUserPreference ━━━');
    const prefKey = `smoke.pref.${Date.now()}`;
    const r5 = await c.post(`/${sets.wmkf_appuserpreference}`, {
      wmkf_preferencekey: prefKey,
      wmkf_preferencevalue: 'encrypted-blob-stand-in',
      wmkf_isencrypted: true,
    });
    if (!r5.ok) { fail(`insert preference failed: ${r5.status} ${r5.text.slice(0, 400)}`); return; }
    const pref = await c.get(`/${sets.wmkf_appuserpreference}?$filter=wmkf_preferencekey eq '${prefKey}'&$select=wmkf_appuserpreferenceid,wmkf_isencrypted,_ownerid_value`);
    const prefRow = pref.body.value[0];
    createdRows.push({ set: sets.wmkf_appuserpreference, id: prefRow.wmkf_appuserpreferenceid, label: `pref ${prefKey}` });
    if (!prefRow._ownerid_value) { fail('ownerid was NOT auto-populated on User-owned table'); }
    else pass(`insert OK, ownerid auto-populated (${prefRow._ownerid_value}), is_encrypted=${prefRow.wmkf_isencrypted}`);
  } finally {
    // ── 6. Cleanup ────────────────────────────────────────────────────────
    console.log('\n━━━ 6. Cleanup ━━━');
    for (const row of createdRows) {
      const r = await c.delete_(`/${row.set}(${row.id})`);
      if (r.ok) pass(`deleted ${row.label}`);
      else fail(`failed to delete ${row.label}: ${r.status}`);
    }
  }

  console.log(`\n═══ ${process.exitCode ? 'FAILED' : 'All smoke checks passed'} ═══`);
})().catch((e) => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
