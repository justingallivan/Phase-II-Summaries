#!/usr/bin/env node
/**
 * Two-user isolation test for Wave 1 security role.
 *
 * Exercises the User-level Read restriction on wmkf_AppUserPreference by
 * impersonating two real Dataverse systemusers (Justin + Connor) via the
 * MSCRMCallerID header. The app user (sysadmin in sandbox) has
 * prvActOnBehalfOfAnotherUser and can impersonate either party.
 *
 * Test is intentionally ASYMMETRIC. Connor has System Administrator in
 * sandbox, so his side would bypass the User-level restriction; we only
 * assert on Justin's side (the meaningful direction).
 *
 * Setup assumption: both users are already assigned
 * 'WMKF Research Review App Suite - Staff' role. If not, run
 *   node scripts/apply-security-role.js --execute --assign=<emails>
 *
 * Usage:
 *   node scripts/test-role-isolation-wave1.js            # sandbox
 *   node scripts/test-role-isolation-wave1.js --keep     # don't clean up test rows
 */

const { loadEnvLocal, getAccessToken, createClient } = require('../lib/dataverse/client');

loadEnvLocal();

const SANDBOX = process.env.DYNAMICS_SANDBOX_URL;
if (!SANDBOX) throw new Error('DYNAMICS_SANDBOX_URL not set');

const JUSTIN_EMAIL = 'jgallivan@wmkeck.org';
const CONNOR_EMAIL = 'cnoda@wmkeck.org';

const keep = process.argv.includes('--keep');

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  const tag = pass ? '✓ PASS' : '✗ FAIL';
  console.log(`  ${tag}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function run() {
  const token = await getAccessToken(SANDBOX);

  // Anonymous-of-caller client (app user, sys admin in sandbox)
  const admin = createClient({ resourceUrl: SANDBOX, token });

  console.log('━━━ Resolving users ━━━');
  const justin = await resolveUser(admin, JUSTIN_EMAIL);
  const connor = await resolveUser(admin, CONNOR_EMAIL);
  console.log(`  Justin:  ${justin.systemuserid} (${justin.fullname})`);
  console.log(`  Connor:  ${connor.systemuserid} (${connor.fullname})  [has sys admin — asymmetric test]`);

  // Impersonating clients — MSCRMCallerID switches the effective user on each request
  const asJustin = createClient({
    resourceUrl: SANDBOX,
    token,
  });
  // Monkey-patch to always include the header. Simpler than plumbing extraHeaders everywhere.
  wrapWithCaller(asJustin, justin.systemuserid);

  const asConnor = createClient({ resourceUrl: SANDBOX, token });
  wrapWithCaller(asConnor, connor.systemuserid);

  console.log('\n━━━ Creating test rows ━━━');
  const justinRow = await createPreference(asJustin, 'test.isolation.justin', 'justin-value');
  console.log(`  · Justin's row:  ${justinRow.id}`);
  const connorRow = await createPreference(asConnor, 'test.isolation.connor', 'connor-value');
  console.log(`  · Connor's row:  ${connorRow.id}`);

  console.log('\n━━━ Assertions (Justin\'s perspective) ━━━');

  // 1. Justin lists the table — should see only his row
  const listAsJustin = await asJustin.get(
    "/wmkf_appuserpreferences?$select=wmkf_appuserpreferenceid,wmkf_preferencekey&$filter=contains(wmkf_preferencekey,'test.isolation')",
  );
  const visibleToJustin = (listAsJustin.body?.value || []).map((r) => r.wmkf_appuserpreferenceid);
  record(
    'Justin sees exactly 1 row (his own)',
    visibleToJustin.length === 1 && visibleToJustin[0] === justinRow.id,
    `saw ${visibleToJustin.length} row(s): [${visibleToJustin.join(', ')}]`,
  );

  // 2. Justin tries to GET Connor's row by GUID
  const getConnorAsJustin = await asJustin.get(`/wmkf_appuserpreferences(${connorRow.id})`);
  record(
    'Justin GET Connor\'s row → denied',
    getConnorAsJustin.status === 403 || getConnorAsJustin.status === 404,
    `status=${getConnorAsJustin.status}`,
  );

  // 3. Justin tries to PATCH Connor's row
  const patchConnorAsJustin = await asJustin.patch(
    `/wmkf_appuserpreferences(${connorRow.id})`,
    { wmkf_preferencevalue: 'hacked-by-justin' },
  );
  // 412 (Precondition Failed) can come back instead of 403 when Dataverse
  // can't resolve the row for write-check; same effect — the write was blocked.
  record(
    'Justin PATCH Connor\'s row → denied',
    [403, 404, 412].includes(patchConnorAsJustin.status),
    `status=${patchConnorAsJustin.status}`,
  );

  // 4. Justin tries to DELETE Connor's row
  const delConnorAsJustin = await asJustin.delete_(`/wmkf_appuserpreferences(${connorRow.id})`);
  record(
    'Justin DELETE Connor\'s row → denied',
    delConnorAsJustin.status === 403 || delConnorAsJustin.status === 404,
    `status=${delConnorAsJustin.status}`,
  );

  // 5. Justin CAN read his own row
  const getOwnAsJustin = await asJustin.get(`/wmkf_appuserpreferences(${justinRow.id})?$select=wmkf_preferencekey`);
  record(
    'Justin GET his own row → allowed',
    getOwnAsJustin.ok && getOwnAsJustin.body?.wmkf_preferencekey === 'test.isolation.justin',
    `status=${getOwnAsJustin.status}`,
  );

  // 6. Shared table: Justin CAN see rows regardless of owner (Organization-level Read)
  //    Create a setting as Connor, verify Justin sees it.
  console.log('\n━━━ Assertions (shared table wmkf_AppSystemSetting — Org-level) ━━━');
  const settingBody = {
    wmkf_settingkey: `test.shared.${Date.now()}`,
    wmkf_settingvalue: 'shared-value',
  };
  const createSetting = await asConnor.post('/wmkf_appsystemsettings', settingBody, {
    Prefer: 'return=representation',
  });
  if (!createSetting.ok) {
    console.log(`  ⚠ could not create setting as Connor: ${createSetting.status} ${createSetting.text}`);
  } else {
    const settingId = createSetting.body?.wmkf_appsystemsettingid;
    const getAsJustin = await asJustin.get(`/wmkf_appsystemsettings(${settingId})?$select=wmkf_settingkey`);
    record(
      'Justin sees Connor\'s AppSystemSetting row (Org-level shared)',
      getAsJustin.ok,
      `status=${getAsJustin.status}`,
    );
    if (!keep) await admin.delete_(`/wmkf_appsystemsettings(${settingId})`);
  }

  // Cleanup (as app user / sys admin — impersonation not needed)
  if (!keep) {
    console.log('\n━━━ Cleanup ━━━');
    const d1 = await admin.delete_(`/wmkf_appuserpreferences(${justinRow.id})`);
    console.log(`  ${d1.ok ? '✓' : '✗'} deleted Justin's row (${d1.status})`);
    const d2 = await admin.delete_(`/wmkf_appuserpreferences(${connorRow.id})`);
    console.log(`  ${d2.ok ? '✓' : '✗'} deleted Connor's row (${d2.status})`);
  } else {
    console.log('\n(--keep set; leaving test rows in place)');
  }

  console.log('\n═══ Summary ═══');
  const pass = results.filter((r) => r.pass).length;
  const fail = results.filter((r) => !r.pass).length;
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

async function resolveUser(client, email) {
  const r = await client.get(
    `/systemusers?$filter=internalemailaddress eq '${email}'&$select=systemuserid,fullname`,
  );
  if (!r.ok) throw new Error(`systemuser lookup failed for ${email}: ${r.status}`);
  const u = r.body?.value?.[0];
  if (!u) throw new Error(`No systemuser for ${email}`);
  return u;
}

async function createPreference(client, key, value) {
  const r = await client.post(
    '/wmkf_appuserpreferences',
    { wmkf_preferencekey: key, wmkf_preferencevalue: value },
    { Prefer: 'return=representation' },
  );
  if (!r.ok) throw new Error(`create preference failed: ${r.status} ${r.text}`);
  return { id: r.body.wmkf_appuserpreferenceid };
}

// Wrap a client so every call includes MSCRMCallerID header.
function wrapWithCaller(client, userId) {
  const origRaw = client.raw;
  client.raw = async (method, p, body, extraHeaders = {}) =>
    origRaw(method, p, body, { MSCRMCallerID: userId, ...extraHeaders });
  client.get = (p, h) => client.raw('GET', p, undefined, h);
  client.post = (p, b, h) => client.raw('POST', p, b, h);
  client.patch = (p, b, h) => client.raw('PATCH', p, b, h);
  client.delete_ = (p, h) => client.raw('DELETE', p, undefined, h);
}

run().catch((e) => {
  console.error(`\nFATAL: ${e.message}`);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
