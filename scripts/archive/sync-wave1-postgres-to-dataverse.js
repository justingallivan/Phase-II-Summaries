#!/usr/bin/env node
/**
 * Sync Wave 1 tables from Postgres to Dataverse.
 *
 * Postgres source → Dataverse target:
 *   user_preferences   → wmkf_AppUserPreference   (User-owned; set ownerid)
 *   user_app_access    → wmkf_AppUserAppAccess    (Org-owned; wmkf_User lookup)
 *   system_settings    → wmkf_AppSystemSetting    (Org-owned; wmkf_UpdatedBy lookup)
 *
 * Identity bridge:
 *   Postgres user_profile_id → Dataverse systemuserid, matched by
 *   user_profiles.azure_email eq systemuser.internalemailaddress.
 *
 *   Hardcoded policy overrides:
 *   - id=1 "Test User": SKIP (no email, no real usage)
 *   - id=6 "Tom Rieker": FK rewrite to Beth Pruitt (id=5) — he left the
 *     foundation; Beth took over reviewing. Empirically he has zero rows
 *     in preferences or app_access, so the remap is a no-op, but we still
 *     apply it so any late-arriving data is routed correctly.
 *
 * Idempotent — skips rows that already exist in Dataverse (pre-query by
 * natural key). Safe to rerun.
 *
 * Usage:
 *   node scripts/sync-wave1-postgres-to-dataverse.js                     # sandbox, dry-run
 *   node scripts/sync-wave1-postgres-to-dataverse.js --execute           # sandbox, live
 *   node scripts/sync-wave1-postgres-to-dataverse.js --target=prod --execute
 *   node scripts/sync-wave1-postgres-to-dataverse.js --only=preferences,app-access,settings
 */

const { loadEnvLocal, getAccessToken, createClient } = require('../lib/dataverse/client');
const { sql } = require('@vercel/postgres');

loadEnvLocal();

function resourceUrl(target) {
  if (target === 'prod') {
    const u = process.env.DYNAMICS_URL;
    if (!u) throw new Error('DYNAMICS_URL not set');
    return u;
  }
  if (target === 'sandbox') {
    const u = process.env.DYNAMICS_SANDBOX_URL;
    if (!u) throw new Error('DYNAMICS_SANDBOX_URL not set');
    return u;
  }
  throw new Error(`Unknown target: ${target}`);
}

const USER_ID_OVERRIDES = {
  1: { action: 'skip', reason: 'Test User — no email, no production usage' },
  6: { action: 'remap', toId: 5, reason: 'Tom Rieker left; Beth Pruitt took over' },
};

const ALL_TABLES = ['preferences', 'app-access', 'settings'];

function parseArgs(argv) {
  const out = { target: 'sandbox', execute: false, only: ALL_TABLES };
  for (const a of argv.slice(2)) {
    if (a === '--execute') out.execute = true;
    else if (a.startsWith('--target=')) out.target = a.slice('--target='.length);
    else if (a.startsWith('--only=')) out.only = a.slice('--only='.length).split(',').map((s) => s.trim());
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/sync-wave1-postgres-to-dataverse.js [--target=sandbox|prod] [--only=preferences,app-access,settings] [--execute]');
      process.exit(0);
    } else { console.error(`Unknown flag: ${a}`); process.exit(1); }
  }
  for (const t of out.only) {
    if (!ALL_TABLES.includes(t)) { console.error(`Unknown table: ${t}. Valid: ${ALL_TABLES.join(', ')}`); process.exit(1); }
  }
  return out;
}

async function buildIdentityMap(client) {
  const profiles = await sql`SELECT id, name, azure_email FROM user_profiles ORDER BY id`;
  const map = new Map();
  const unmapped = [];

  for (const p of profiles.rows) {
    const override = USER_ID_OVERRIDES[p.id];
    if (override?.action === 'skip') {
      map.set(p.id, { skip: true, reason: override.reason });
      continue;
    }

    const targetId = override?.action === 'remap' ? override.toId : p.id;
    const resolveProfile = override?.action === 'remap'
      ? profiles.rows.find((x) => x.id === targetId)
      : p;

    if (!resolveProfile?.azure_email) {
      unmapped.push({ id: p.id, reason: 'no azure_email' });
      continue;
    }
    const r = await client.get(
      `/systemusers?$filter=internalemailaddress eq '${resolveProfile.azure_email.replace(/'/g, "''")}'&$select=systemuserid,fullname`,
    );
    const u = r.body?.value?.[0];
    if (!u) {
      unmapped.push({ id: p.id, reason: `no systemuser for ${resolveProfile.azure_email}` });
      continue;
    }
    map.set(p.id, {
      systemuserid: u.systemuserid,
      fullname: u.fullname,
      remappedFromId: override?.action === 'remap' ? p.id : null,
      remappedToId: override?.action === 'remap' ? targetId : null,
    });
  }
  return { map, unmapped };
}

function printIdentityMap(map, unmapped) {
  console.log('━━━ Identity map ━━━');
  for (const [pgId, entry] of [...map.entries()].sort((a, b) => a[0] - b[0])) {
    if (entry.skip) {
      console.log(`  pg=${String(pgId).padStart(3)}  SKIP   (${entry.reason})`);
    } else if (entry.remappedFromId) {
      console.log(`  pg=${String(pgId).padStart(3)}  → ${entry.systemuserid}  ${entry.fullname} (remapped from id=${entry.remappedFromId})`);
    } else {
      console.log(`  pg=${String(pgId).padStart(3)}  → ${entry.systemuserid}  ${entry.fullname}`);
    }
  }
  if (unmapped.length) {
    console.log('  ⚠ unmapped:');
    for (const u of unmapped) console.log(`    pg=${u.id}  ${u.reason}`);
  }
}

function resolvePgUser(map, pgId) {
  if (pgId == null) return null;
  const entry = map.get(pgId);
  if (!entry || entry.skip) return null;
  return entry;
}

// ─────────────────────────────────────────────────────────────────────────
// Table sync functions — each returns { inserted, skippedExisting, skippedUnmapped }

async function syncPreferences(client, map, execute) {
  const rows = (await sql`
    SELECT id, user_profile_id, preference_key, preference_value, is_encrypted
    FROM user_preferences
    ORDER BY id
  `).rows;
  let inserted = 0;
  let skippedExisting = 0;
  let skippedUnmapped = 0;

  for (const r of rows) {
    const user = resolvePgUser(map, r.user_profile_id);
    if (!user) {
      const entry = map.get(r.user_profile_id);
      console.log(`  · skip pg-pref id=${r.id}  key=${r.preference_key}  owner=pg-${r.user_profile_id} (${entry?.reason || 'unmapped'})`);
      skippedUnmapped += 1;
      continue;
    }

    const filter = `wmkf_preferencekey eq '${r.preference_key.replace(/'/g, "''")}' and _ownerid_value eq ${user.systemuserid}`;
    const existing = await client.get(
      `/wmkf_appuserpreferences?$filter=${encodeURIComponent(filter)}&$select=wmkf_appuserpreferenceid&$top=1`,
    );
    if (existing.body?.value?.length) {
      skippedExisting += 1;
      continue;
    }

    const body = {
      wmkf_preferencekey: r.preference_key,
      wmkf_preferencevalue: r.preference_value,
      wmkf_isencrypted: !!r.is_encrypted,
      'ownerid@odata.bind': `/systemusers(${user.systemuserid})`,
    };

    if (!execute) {
      console.log(`  [dry-run] + pref  key=${r.preference_key.padEnd(40)} owner=${user.fullname}`);
    } else {
      const resp = await client.post('/wmkf_appuserpreferences', body);
      if (!resp.ok) throw new Error(`insert pref failed (pg id=${r.id}): ${resp.status} ${resp.text}`);
      inserted += 1;
    }
  }
  return { inserted, skippedExisting, skippedUnmapped, total: rows.length };
}

async function syncAppAccess(client, map, execute) {
  const rows = (await sql`
    SELECT id, user_profile_id, app_key, granted_by
    FROM user_app_access
    ORDER BY id
  `).rows;
  let inserted = 0;
  let skippedExisting = 0;
  let skippedUnmapped = 0;

  for (const r of rows) {
    const user = resolvePgUser(map, r.user_profile_id);
    const grantedBy = resolvePgUser(map, r.granted_by); // nullable
    if (!user) {
      skippedUnmapped += 1;
      continue;
    }

    const filter = `wmkf_appkey eq '${r.app_key.replace(/'/g, "''")}' and _wmkf_user_value eq ${user.systemuserid}`;
    const existing = await client.get(
      `/wmkf_appuserappaccesses?$filter=${encodeURIComponent(filter)}&$select=wmkf_appuserappaccessid&$top=1`,
    );
    if (existing.body?.value?.length) {
      skippedExisting += 1;
      continue;
    }

    const body = {
      wmkf_appkey: r.app_key,
      'wmkf_User@odata.bind': `/systemusers(${user.systemuserid})`,
    };
    if (grantedBy) body['wmkf_GrantedBy@odata.bind'] = `/systemusers(${grantedBy.systemuserid})`;

    if (!execute) {
      console.log(`  [dry-run] + access  app=${r.app_key.padEnd(32)} user=${user.fullname}${grantedBy ? `  by=${grantedBy.fullname}` : ''}`);
    } else {
      const resp = await client.post('/wmkf_appuserappaccesses', body);
      if (!resp.ok) throw new Error(`insert app-access failed (pg id=${r.id}): ${resp.status} ${resp.text}`);
      inserted += 1;
    }
  }
  return { inserted, skippedExisting, skippedUnmapped, total: rows.length };
}

async function syncSettings(client, map, execute) {
  const rows = (await sql`
    SELECT id, setting_key, setting_value, updated_by
    FROM system_settings
    ORDER BY setting_key
  `).rows;
  let inserted = 0;
  let skippedExisting = 0;

  for (const r of rows) {
    const updatedBy = resolvePgUser(map, r.updated_by); // nullable, often null

    const filter = `wmkf_settingkey eq '${r.setting_key.replace(/'/g, "''")}'`;
    const existing = await client.get(
      `/wmkf_appsystemsettings?$filter=${encodeURIComponent(filter)}&$select=wmkf_appsystemsettingid&$top=1`,
    );
    if (existing.body?.value?.length) {
      skippedExisting += 1;
      continue;
    }

    const body = {
      wmkf_settingkey: r.setting_key,
      wmkf_settingvalue: r.setting_value,
    };
    if (updatedBy) body['wmkf_UpdatedBy@odata.bind'] = `/systemusers(${updatedBy.systemuserid})`;

    if (!execute) {
      console.log(`  [dry-run] + setting  ${r.setting_key}`);
    } else {
      const resp = await client.post('/wmkf_appsystemsettings', body);
      if (!resp.ok) throw new Error(`insert setting failed (pg id=${r.id}): ${resp.status} ${resp.text}`);
      inserted += 1;
    }
  }
  return { inserted, skippedExisting, total: rows.length };
}

function summarize(label, r) {
  const parts = [
    `total=${r.total}`,
    `inserted=${r.inserted}`,
    `skipped-existing=${r.skippedExisting}`,
  ];
  if ('skippedUnmapped' in r) parts.push(`skipped-unmapped=${r.skippedUnmapped}`);
  console.log(`\n→ ${label.padEnd(12)} ${parts.join('  ')}`);
}

(async () => {
  const args = parseArgs(process.argv);
  const resource = resourceUrl(args.target);
  const mode = args.execute ? 'EXECUTE' : 'DRY-RUN';
  console.log(`Target: ${args.target} (${resource})`);
  console.log(`Mode:   ${mode}`);
  console.log(`Tables: ${args.only.join(', ')}\n`);
  if (args.target === 'prod' && args.execute) {
    console.log('⚠ PROD --execute — writes will hit production Dataverse.\n');
  }

  const token = await getAccessToken(resource);
  const client = createClient({ resourceUrl: resource, token });

  const { map, unmapped } = await buildIdentityMap(client);
  printIdentityMap(map, unmapped);

  if (args.only.includes('preferences')) {
    console.log('\n━━━ user_preferences → wmkf_AppUserPreference ━━━');
    const r = await syncPreferences(client, map, args.execute);
    summarize('preferences', r);
  }
  if (args.only.includes('app-access')) {
    console.log('\n━━━ user_app_access → wmkf_AppUserAppAccess ━━━');
    const r = await syncAppAccess(client, map, args.execute);
    summarize('app-access', r);
  }
  if (args.only.includes('settings')) {
    console.log('\n━━━ system_settings → wmkf_AppSystemSetting ━━━');
    const r = await syncSettings(client, map, args.execute);
    summarize('settings', r);
  }

  console.log('\n═══ Done ═══');
  if (!args.execute) console.log('Dry run. Re-run with --execute to apply.');
})().catch((e) => {
  console.error(`\nFATAL: ${e.message}`);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
