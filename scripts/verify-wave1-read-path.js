#!/usr/bin/env node
/**
 * Verify Wave 1 Dataverse data matches Postgres when read through the real
 * application read path.
 *
 * For every mapped user:
 *   1. Read user_preferences from Postgres and decrypt via lib/utils/encryption
 *   2. Read wmkf_AppUserPreference from Dataverse sandbox and decrypt the same way
 *   3. Assert key sets match, plaintext values match, is_encrypted flags match
 *   4. Same comparison for user_app_access → wmkf_AppUserAppAccess
 *
 * Also sanity-checks system_settings → wmkf_AppSystemSetting once globally.
 *
 * If every assertion passes, the migration is functionally invisible to the
 * application — swapping the read path over is safe.
 *
 * Usage:
 *   node scripts/verify-wave1-read-path.js
 *   node scripts/verify-wave1-read-path.js --user=jgallivan@wmkeck.org
 */

const { loadEnvLocal, getAccessToken, createClient } = require('../lib/dataverse/client');
const { sql } = require('@vercel/postgres');
const { decrypt } = require('../lib/utils/encryption');

loadEnvLocal();

const SANDBOX = process.env.DYNAMICS_SANDBOX_URL;
if (!SANDBOX) throw new Error('DYNAMICS_SANDBOX_URL not set');

const USER_ID_OVERRIDES = {
  1: { action: 'skip' },
  6: { action: 'remap', toId: 5 },
};

function parseArgs(argv) {
  const out = { filterEmail: null };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--user=')) out.filterEmail = a.slice('--user='.length);
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/verify-wave1-read-path.js [--user=<email>]');
      process.exit(0);
    } else { console.error(`Unknown flag: ${a}`); process.exit(1); }
  }
  return out;
}

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  const tag = pass ? '✓' : '✗';
  if (!pass || process.env.VERBOSE) {
    console.log(`    ${tag} ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function readPostgresPreferences(profileId) {
  const rows = (await sql`
    SELECT preference_key, preference_value, is_encrypted
    FROM user_preferences WHERE user_profile_id = ${profileId}
  `).rows;
  const out = {};
  for (const r of rows) {
    out[r.preference_key] = {
      value: r.is_encrypted ? decrypt(r.preference_value) : r.preference_value,
      raw: r.preference_value,
      encrypted: !!r.is_encrypted,
    };
  }
  return out;
}

async function readDataversePreferences(client, systemuserid) {
  const filter = `_ownerid_value eq ${systemuserid}`;
  const r = await client.get(
    `/wmkf_appuserpreferences?$filter=${encodeURIComponent(filter)}&$select=wmkf_preferencekey,wmkf_preferencevalue,wmkf_isencrypted`,
  );
  if (!r.ok) throw new Error(`Dataverse pref read failed: ${r.status} ${r.text}`);
  const out = {};
  for (const row of r.body?.value || []) {
    out[row.wmkf_preferencekey] = {
      value: row.wmkf_isencrypted ? decrypt(row.wmkf_preferencevalue) : row.wmkf_preferencevalue,
      raw: row.wmkf_preferencevalue,
      encrypted: !!row.wmkf_isencrypted,
    };
  }
  return out;
}

async function readPostgresAppAccess(profileId) {
  const rows = (await sql`
    SELECT app_key FROM user_app_access WHERE user_profile_id = ${profileId}
  `).rows;
  return new Set(rows.map((r) => r.app_key));
}

async function readDataverseAppAccess(client, systemuserid) {
  const filter = `_wmkf_user_value eq ${systemuserid}`;
  const r = await client.get(
    `/wmkf_appuserappaccesses?$filter=${encodeURIComponent(filter)}&$select=wmkf_appkey`,
  );
  if (!r.ok) throw new Error(`Dataverse app-access read failed: ${r.status} ${r.text}`);
  return new Set((r.body?.value || []).map((row) => row.wmkf_appkey));
}

async function readPostgresSettings() {
  const rows = (await sql`SELECT setting_key, setting_value FROM system_settings`).rows;
  const out = {};
  for (const r of rows) out[r.setting_key] = r.setting_value;
  return out;
}

async function readDataverseSettings(client) {
  const r = await client.get(
    '/wmkf_appsystemsettings?$select=wmkf_settingkey,wmkf_settingvalue&$top=5000',
  );
  if (!r.ok) throw new Error(`Dataverse settings read failed: ${r.status} ${r.text}`);
  const out = {};
  for (const row of r.body?.value || []) out[row.wmkf_settingkey] = row.wmkf_settingvalue;
  return out;
}

async function buildIdentityMap(client, filterEmail) {
  const profiles = (await sql`
    SELECT id, name, azure_email FROM user_profiles WHERE azure_email IS NOT NULL ORDER BY id
  `).rows;
  const filtered = filterEmail ? profiles.filter((p) => p.azure_email === filterEmail) : profiles;
  const resolved = [];

  for (const p of filtered) {
    const override = USER_ID_OVERRIDES[p.id];
    if (override?.action === 'skip') continue;
    const srcEmail = override?.action === 'remap'
      ? profiles.find((x) => x.id === override.toId)?.azure_email
      : p.azure_email;
    const r = await client.get(
      `/systemusers?$filter=internalemailaddress eq '${srcEmail}'&$select=systemuserid,fullname`,
    );
    const u = r.body?.value?.[0];
    if (!u) continue;
    resolved.push({ pgId: p.id, email: p.azure_email, systemuserid: u.systemuserid, fullname: u.fullname });
  }
  return resolved;
}

async function verifyUser(user, client) {
  console.log(`\n── ${user.fullname} <${user.email}>  [pg=${user.pgId}] ──`);

  // Preferences
  const pgPrefs = await readPostgresPreferences(user.pgId);
  const dvPrefs = await readDataversePreferences(client, user.systemuserid);
  const pgKeys = new Set(Object.keys(pgPrefs));
  const dvKeys = new Set(Object.keys(dvPrefs));

  const prefKeysMatch = pgKeys.size === dvKeys.size && [...pgKeys].every((k) => dvKeys.has(k));
  record(
    `preference key sets match (${pgKeys.size} keys)`,
    prefKeysMatch,
    prefKeysMatch ? null : `pg-only=[${[...pgKeys].filter(k => !dvKeys.has(k))}] dv-only=[${[...dvKeys].filter(k => !pgKeys.has(k))}]`,
  );

  for (const key of pgKeys) {
    if (!dvKeys.has(key)) continue;
    const pg = pgPrefs[key];
    const dv = dvPrefs[key];
    // Ciphertext match is the load-bearing assertion for encrypted rows —
    // a null-vs-null decrypted value would pass vacuously if decryption
    // fails (e.g., no USER_PREFS_ENCRYPTION_KEY locally).
    const flagMatch = pg.encrypted === dv.encrypted;
    const rawMatch = pg.raw === dv.raw;
    const plaintextMatch = pg.value === dv.value;
    record(
      `pref ${key} — raw bytes match`,
      rawMatch,
      rawMatch ? null : 'stored value differs between backends',
    );
    record(
      `pref ${key} — is_encrypted flag matches`,
      flagMatch,
      flagMatch ? null : `pg=${pg.encrypted} dv=${dv.encrypted}`,
    );
    if (pg.encrypted && pg.value != null && dv.value != null) {
      record(
        `pref ${key} — decrypted plaintext matches`,
        plaintextMatch,
        plaintextMatch ? null : 'decrypted values differ',
      );
    }
  }

  // App access
  const pgApps = await readPostgresAppAccess(user.pgId);
  const dvApps = await readDataverseAppAccess(client, user.systemuserid);
  const appsMatch = pgApps.size === dvApps.size && [...pgApps].every((k) => dvApps.has(k));
  record(
    `app-access sets match (${pgApps.size} apps)`,
    appsMatch,
    appsMatch ? null : `pg-only=[${[...pgApps].filter(k => !dvApps.has(k))}] dv-only=[${[...dvApps].filter(k => !pgApps.has(k))}]`,
  );

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`  → ${passed} passed / ${failed} failed so far`);
}

(async () => {
  const args = parseArgs(process.argv);
  const token = await getAccessToken(SANDBOX);
  const client = createClient({ resourceUrl: SANDBOX, token });

  console.log('Wave 1 read-path verification');
  console.log(`Source:  Postgres (live)`);
  console.log(`Target:  Dataverse sandbox (${SANDBOX})`);
  if (args.filterEmail) console.log(`Filter:  ${args.filterEmail}`);

  const users = await buildIdentityMap(client, args.filterEmail);
  console.log(`\nVerifying ${users.length} user(s)…`);

  for (const user of users) {
    await verifyUser(user, client);
  }

  // Global settings check (unscoped)
  console.log('\n── system_settings (shared) ──');
  const pgS = await readPostgresSettings();
  const dvS = await readDataverseSettings(client);
  const pgKeys = new Set(Object.keys(pgS));
  const dvKeys = new Set(Object.keys(dvS));
  const keysMatch = pgKeys.size === dvKeys.size && [...pgKeys].every((k) => dvKeys.has(k));
  record(
    `settings key sets match (${pgKeys.size} keys)`,
    keysMatch,
    keysMatch ? null : `pg-only=[${[...pgKeys].filter(k => !dvKeys.has(k)).slice(0,5)}] dv-only=[${[...dvKeys].filter(k => !pgKeys.has(k)).slice(0,5)}]`,
  );
  let valueMismatches = 0;
  for (const key of pgKeys) {
    if (!dvKeys.has(key)) continue;
    if (pgS[key] !== dvS[key]) valueMismatches += 1;
  }
  record(
    `settings values match (${pgKeys.size} keys)`,
    valueMismatches === 0,
    valueMismatches ? `${valueMismatches} value(s) differ` : null,
  );

  console.log('\n═══ Summary ═══');
  const pass = results.filter((r) => r.pass).length;
  const fail = results.filter((r) => !r.pass).length;
  console.log(`${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log('\nFailures:');
    for (const r of results.filter((x) => !x.pass)) {
      console.log(`  ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
    }
  }
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error(`\nFATAL: ${e.message}`);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
