#!/usr/bin/env node
/**
 * Two-user isolation test for Wave 1 security role.
 *
 * Exercises the User-level Read restriction on wmkf_AppUserPreference by
 * impersonating two real Dataverse systemusers via the MSCRMCallerID header.
 * The app user (sysadmin in sandbox) has prvActOnBehalfOfAnotherUser and can
 * impersonate either party.
 *
 * Defaults to Justin + Kevin — both non-admin, so the test is fully symmetric
 * (each user blocked from the other's rows). Override via CLI flags to
 * re-test with different pairs.
 *
 * Setup assumption: both users are assigned
 * 'WMKF Research Review App Suite - Staff' role. If not, run
 *   node scripts/apply-security-role.js --execute --assign=<emails>
 *
 * Usage:
 *   node scripts/test-role-isolation-wave1.js
 *   node scripts/test-role-isolation-wave1.js --keep
 *   node scripts/test-role-isolation-wave1.js --user-a=foo@wmkeck.org --user-b=bar@wmkeck.org
 */

const { loadEnvLocal, getAccessToken, createClient } = require('../lib/dataverse/client');

loadEnvLocal();

const SANDBOX = process.env.DYNAMICS_SANDBOX_URL;
if (!SANDBOX) throw new Error('DYNAMICS_SANDBOX_URL not set');

function parseArgs(argv) {
  const out = {
    userA: 'jgallivan@wmkeck.org',
    userB: 'kmoses@wmkeck.org',
    keep: false,
  };
  for (const a of argv.slice(2)) {
    if (a === '--keep') out.keep = true;
    else if (a.startsWith('--user-a=')) out.userA = a.slice('--user-a='.length);
    else if (a.startsWith('--user-b=')) out.userB = a.slice('--user-b='.length);
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/test-role-isolation-wave1.js [--user-a=<email>] [--user-b=<email>] [--keep]');
      process.exit(0);
    } else { console.error(`Unknown flag: ${a}`); process.exit(1); }
  }
  return out;
}

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  const tag = pass ? '✓ PASS' : '✗ FAIL';
  console.log(`  ${tag}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function run() {
  const args = parseArgs(process.argv);
  const token = await getAccessToken(SANDBOX);
  const admin = createClient({ resourceUrl: SANDBOX, token });

  console.log('━━━ Resolving users ━━━');
  const userA = await resolveUser(admin, args.userA);
  const userB = await resolveUser(admin, args.userB);
  const hasSysAdminA = await hasRole(admin, userA.systemuserid, 'System Administrator');
  const hasSysAdminB = await hasRole(admin, userB.systemuserid, 'System Administrator');
  console.log(`  A: ${userA.fullname} <${args.userA}> [${userA.systemuserid}]${hasSysAdminA ? ' ⚠ SYS ADMIN' : ''}`);
  console.log(`  B: ${userB.fullname} <${args.userB}> [${userB.systemuserid}]${hasSysAdminB ? ' ⚠ SYS ADMIN' : ''}`);
  if (hasSysAdminA || hasSysAdminB) {
    console.log('  (sys admin bypasses User-level Read — that side of the test will be skipped)');
  }

  const asA = impersonator(token, userA.systemuserid);
  const asB = impersonator(token, userB.systemuserid);

  console.log('\n━━━ Creating test rows ━━━');
  const rowA = await createPreference(asA, 'test.isolation.a', 'value-a');
  console.log(`  · A's row: ${rowA.id}`);
  const rowB = await createPreference(asB, 'test.isolation.b', 'value-b');
  console.log(`  · B's row: ${rowB.id}`);

  // ── A's perspective — skip if A is sysadmin ──
  if (!hasSysAdminA) {
    console.log(`\n━━━ Assertions: ${userA.fullname}'s perspective ━━━`);
    await assertIsolation(asA, 'A', rowA.id, rowB.id, userA.fullname, userB.fullname);
  } else {
    console.log(`\n(Skipping ${userA.fullname}'s assertions — has sys admin)`);
  }

  // ── B's perspective — skip if B is sysadmin ──
  if (!hasSysAdminB) {
    console.log(`\n━━━ Assertions: ${userB.fullname}'s perspective ━━━`);
    await assertIsolation(asB, 'B', rowB.id, rowA.id, userB.fullname, userA.fullname);
  } else {
    console.log(`\n(Skipping ${userB.fullname}'s assertions — has sys admin)`);
  }

  // ── Shared table (Org-level Read) ──
  console.log('\n━━━ Shared table wmkf_AppSystemSetting (Org-level) ━━━');
  const settingBody = {
    wmkf_settingkey: `test.shared.${Date.now()}`,
    wmkf_settingvalue: 'shared-value',
  };
  const createSetting = await asB.post('/wmkf_appsystemsettings', settingBody, {
    Prefer: 'return=representation',
  });
  if (!createSetting.ok) {
    console.log(`  ⚠ could not create setting as B: ${createSetting.status} ${createSetting.text?.slice(0, 200)}`);
  } else {
    const settingId = createSetting.body?.wmkf_appsystemsettingid;
    const getAsA = await asA.get(`/wmkf_appsystemsettings(${settingId})?$select=wmkf_settingkey`);
    record(
      `${userA.fullname} sees ${userB.fullname}'s AppSystemSetting row`,
      getAsA.ok,
      `status=${getAsA.status}`,
    );
    if (!args.keep) await admin.delete_(`/wmkf_appsystemsettings(${settingId})`);
  }

  // Cleanup
  if (!args.keep) {
    console.log('\n━━━ Cleanup ━━━');
    const d1 = await admin.delete_(`/wmkf_appuserpreferences(${rowA.id})`);
    console.log(`  ${d1.ok ? '✓' : '✗'} deleted A's row (${d1.status})`);
    const d2 = await admin.delete_(`/wmkf_appuserpreferences(${rowB.id})`);
    console.log(`  ${d2.ok ? '✓' : '✗'} deleted B's row (${d2.status})`);
  } else {
    console.log('\n(--keep set; leaving test rows in place)');
  }

  console.log('\n═══ Summary ═══');
  const pass = results.filter((r) => r.pass).length;
  const fail = results.filter((r) => !r.pass).length;
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

async function assertIsolation(viewerClient, viewerLabel, ownRowId, otherRowId, viewerName, otherName) {
  // Viewer lists the table — should see only own row (among the two test rows)
  const list = await viewerClient.get(
    "/wmkf_appuserpreferences?$select=wmkf_appuserpreferenceid,wmkf_preferencekey&$filter=contains(wmkf_preferencekey,'test.isolation')",
  );
  const visible = (list.body?.value || []).map((r) => r.wmkf_appuserpreferenceid);
  record(
    `${viewerName} sees exactly 1 isolation row (own)`,
    visible.length === 1 && visible[0] === ownRowId,
    `saw ${visible.length}: [${visible.join(', ')}]`,
  );

  const get = await viewerClient.get(`/wmkf_appuserpreferences(${otherRowId})`);
  record(
    `${viewerName} GET ${otherName}'s row → denied`,
    [403, 404].includes(get.status),
    `status=${get.status}`,
  );

  const patch = await viewerClient.patch(
    `/wmkf_appuserpreferences(${otherRowId})`,
    { wmkf_preferencevalue: `hacked-by-${viewerLabel}` },
  );
  record(
    `${viewerName} PATCH ${otherName}'s row → denied`,
    [403, 404, 412].includes(patch.status),
    `status=${patch.status}`,
  );

  const del = await viewerClient.delete_(`/wmkf_appuserpreferences(${otherRowId})`);
  record(
    `${viewerName} DELETE ${otherName}'s row → denied`,
    [403, 404].includes(del.status),
    `status=${del.status}`,
  );

  const getOwn = await viewerClient.get(`/wmkf_appuserpreferences(${ownRowId})?$select=wmkf_preferencekey`);
  record(
    `${viewerName} GET own row → allowed`,
    getOwn.ok,
    `status=${getOwn.status}`,
  );
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

async function hasRole(client, userId, roleName) {
  const r = await client.get(
    `/systemusers(${userId})/systemuserroles_association?$select=name`,
  );
  return (r.body?.value || []).some((role) => role.name === roleName);
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

function impersonator(token, userId) {
  const c = createClient({ resourceUrl: SANDBOX, token });
  const origRaw = c.raw;
  c.raw = async (method, p, body, extraHeaders = {}) =>
    origRaw(method, p, body, { MSCRMCallerID: userId, ...extraHeaders });
  c.get = (p, h) => c.raw('GET', p, undefined, h);
  c.post = (p, b, h) => c.raw('POST', p, b, h);
  c.patch = (p, b, h) => c.raw('PATCH', p, b, h);
  c.delete_ = (p, h) => c.raw('DELETE', p, undefined, h);
  return c;
}

run().catch((e) => {
  console.error(`\nFATAL: ${e.message}`);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
