#!/usr/bin/env node
/**
 * Wave 1 drop preflight
 *
 * Live catalog + behavioral probe to run immediately before applying
 * lib/db/migrations/007_drop_wave1_tables.sql. Surfaces every check the
 * SQL guards can't catch (per Codex review of the migration).
 *
 * Reports:
 *   - Tables exist + current row counts
 *   - Foreign keys referencing the three tables
 *   - Views referencing the three tables
 *   - RLS policies on the three tables
 *   - Triggers / rules on the three tables
 *   - Non-default grants on the three tables
 *   - PG vs DV count parity on each entity set
 *   - Recent writes (created_at / updated_at since flag-flip)
 *   - Git-log evidence of risky-script invocation since flag-flip
 *
 * Exits 0 if every check passes (safe to run the migration).
 * Exits 1 with a structured summary otherwise.
 *
 * Usage:
 *   node scripts/wave1-drop-preflight.js
 */

const { execSync } = require('child_process');
const { loadEnvLocal } = require('../lib/dataverse/client');

loadEnvLocal();

const { Pool } = require('pg');
const dvSettings = require('../lib/services/dataverse-settings-service');

const FLAG_FLIP_DATE = '2026-05-03';
// Reconciliation baseline: 2026-05-11 PG→DV sync resolved all known dev writes
// (10 model_override:* rows from S145 on 2026-05-10). Anchor guards here, not
// to a rolling window — any post-baseline write is a real signal.
const RECON_BASELINE = '2026-05-12 00:00:00+00';
const TABLES = ['system_settings', 'user_app_access', 'user_preferences'];
const RISKY_SCRIPTS = [
  'rotate-encryption-key.js',
  'backfill-app-access.js --allow-postgres-only',
  'manage-preferences.js --allow-postgres-only',
];

const issues = [];
const notes = [];

function fail(label, detail) {
  issues.push({ label, detail });
  console.log(`✗ ${label}\n    ${detail}`);
}

function ok(label, detail = '') {
  console.log(`✓ ${label}${detail ? ` — ${detail}` : ''}`);
}

function note(label, detail) {
  notes.push({ label, detail });
  console.log(`⚠ ${label}\n    ${detail}`);
}

async function main() {
  if (!process.env.POSTGRES_URL) {
    console.error('POSTGRES_URL not set. Source .env.local first.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.POSTGRES_URL });

  console.log('Wave 1 drop preflight\n=====================\n');
  console.log(`Flag-flip date: ${FLAG_FLIP_DATE}`);
  console.log(`Target tables:  ${TABLES.join(', ')}`);
  console.log(`Run at:         ${new Date().toISOString()}\n`);

  // ---- 1. Table existence + row counts ----
  console.log('--- Tables ---');
  const existence = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name = ANY($1)`,
    [TABLES],
  );
  const present = new Set(existence.rows.map((r) => r.table_name));
  for (const t of TABLES) {
    if (!present.has(t)) {
      note(`${t}: already dropped`, 'IF EXISTS makes this safe but unexpected — verify intent.');
      continue;
    }
    const { rows } = await pool.query(`SELECT count(*)::int AS c FROM ${t}`);
    ok(`${t} exists`, `${rows[0].c} rows`);
  }

  // ---- 2. FKs referencing the three tables ----
  console.log('\n--- Foreign keys ---');
  const fkQ = await pool.query(
    `SELECT conrelid::regclass::text AS table_with_fk, conname,
            pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE contype='f'
       AND pg_get_constraintdef(oid) ~* '\\m(system_settings|user_app_access|user_preferences)\\M'`,
  );
  if (fkQ.rows.length === 0) {
    ok('No FKs reference the three tables');
  } else {
    for (const r of fkQ.rows) {
      fail(`FK on ${r.table_with_fk}.${r.conname}`, r.def);
    }
  }

  // ---- 3. Views referencing the three tables ----
  console.log('\n--- Views ---');
  const viewQ = await pool.query(
    `SELECT n.nspname AS schema, c.relname AS view_name, pg_get_viewdef(c.oid, true) AS def
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('v','m')
       AND n.nspname NOT IN ('information_schema','pg_catalog')
       AND pg_get_viewdef(c.oid, true) ~* '\\m(system_settings|user_app_access|user_preferences)\\M'`,
  );
  if (viewQ.rows.length === 0) {
    ok('No views reference the three tables');
  } else {
    for (const r of viewQ.rows) {
      fail(
        `View ${r.schema}.${r.view_name} references a Wave 1 table`,
        r.def.split('\n')[0].slice(0, 120),
      );
    }
  }

  // ---- 4. RLS policies / triggers / rules ----
  console.log('\n--- Policies / triggers / rules ---');
  const polQ = await pool.query(
    `SELECT schemaname, tablename, policyname FROM pg_policies WHERE tablename = ANY($1)`,
    [TABLES],
  );
  if (polQ.rows.length === 0) ok('No RLS policies');
  else for (const r of polQ.rows) fail(`Policy ${r.schemaname}.${r.tablename}.${r.policyname}`, '');

  const trigQ = await pool.query(
    `SELECT event_object_table AS t, trigger_name FROM information_schema.triggers
     WHERE event_object_table = ANY($1)`,
    [TABLES],
  );
  if (trigQ.rows.length === 0) ok('No triggers');
  else for (const r of trigQ.rows) note(`Trigger ${r.t}.${r.trigger_name}`, 'auto-drops with table');

  const ruleQ = await pool.query(
    `SELECT tablename, rulename FROM pg_rules WHERE tablename = ANY($1)`,
    [TABLES],
  );
  if (ruleQ.rows.length === 0) ok('No rules');
  else for (const r of ruleQ.rows) note(`Rule ${r.tablename}.${r.rulename}`, 'auto-drops with table');

  // ---- 5. Non-default grants ----
  console.log('\n--- Grants ---');
  const grantQ = await pool.query(
    `SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
     WHERE table_name = ANY($1) AND grantee NOT IN ('PUBLIC', current_user, 'neon_superuser')`,
    [TABLES],
  );
  if (grantQ.rows.length === 0) {
    ok('No non-default grants');
  } else {
    for (const r of grantQ.rows) {
      note(`Grant ${r.table_name}: ${r.privilege_type} to ${r.grantee}`, 'auto-drops with table');
    }
  }

  // ---- 6. Recent writes (the same checks the SQL guards do) ----
  console.log('\n--- Recent writes ---');
  const ssRecent = await pool.query(
    `SELECT count(*)::int AS c, max(updated_at)::text AS last
     FROM system_settings WHERE updated_at >= $1`,
    [RECON_BASELINE],
  );
  if (ssRecent.rows[0].c > 0) {
    fail(
      `system_settings has ${ssRecent.rows[0].c} writes since baseline`,
      `last write: ${ssRecent.rows[0].last}`,
    );
  } else ok(`system_settings: 0 writes since ${RECON_BASELINE}`);

  const upRecent = await pool.query(
    `SELECT count(*)::int AS c, max(updated_at)::text AS last
     FROM user_preferences WHERE updated_at >= $1`,
    [RECON_BASELINE],
  );
  if (upRecent.rows[0].c > 0) {
    fail(
      `user_preferences has ${upRecent.rows[0].c} writes since baseline`,
      `last write: ${upRecent.rows[0].last}`,
    );
  } else ok(`user_preferences: 0 writes since ${RECON_BASELINE}`);

  const uaaRecent = await pool.query(
    `SELECT count(*)::int AS c, max(created_at)::text AS last
     FROM user_app_access WHERE created_at >= $1`,
    [RECON_BASELINE],
  );
  if (uaaRecent.rows[0].c > 0) {
    fail(
      `user_app_access has ${uaaRecent.rows[0].c} creates since baseline`,
      `last create: ${uaaRecent.rows[0].last}`,
    );
  } else ok(`user_app_access: 0 creates since ${RECON_BASELINE}`);

  // ---- 7. PG vs DV count parity ----
  console.log('\n--- PG vs DV parity ---');
  try {
    const pgSs = await pool.query('SELECT count(*)::int AS c FROM system_settings');
    const dvSs = Object.keys(await dvSettings.listSettings()).length;
    if (pgSs.rows[0].c === dvSs) {
      ok(`system_settings: PG=${pgSs.rows[0].c}, DV=${dvSs}`);
    } else {
      note(
        `system_settings count mismatch: PG=${pgSs.rows[0].c}, DV=${dvSs}`,
        'Could indicate keys in one store not the other — not necessarily a blocker, but worth eyeballing the diff.',
      );
    }
  } catch (e) {
    note('Could not probe Dataverse settings parity', e.message);
  }

  // ---- 8. Risky-script invocation history (git log) ----
  console.log('\n--- Risky-script git-log evidence ---');
  for (const script of RISKY_SCRIPTS) {
    try {
      const out = execSync(
        `git log --since="${FLAG_FLIP_DATE}" --all --oneline --grep="${script.split(' ')[0]}"`,
        { encoding: 'utf8' },
      );
      if (out.trim()) {
        note(
          `git log mentions ${script} since ${FLAG_FLIP_DATE}`,
          'Inspect manually — could be incidental.\n' + out.trim(),
        );
      } else {
        ok(`No git-log mention of ${script} since ${FLAG_FLIP_DATE}`);
      }
    } catch {
      note(`Could not git-log probe ${script}`, 'Skipping (not a hard blocker).');
    }
  }
  console.log(
    '\nNote: git log only catches scripts referenced in commit messages. ' +
      'It does NOT prove the scripts were never run against prod. If you ' +
      'suspect any of these ran, check Vercel function logs or your shell ' +
      'history before proceeding.',
  );

  // ---- Summary ----
  console.log('\n=== Summary ===');
  console.log(`Blocking issues: ${issues.length}`);
  console.log(`Notes / warnings: ${notes.length}`);

  await pool.end();

  if (issues.length > 0) {
    console.log('\nBLOCKED — resolve issues above before running migration 007.');
    process.exit(1);
  }
  console.log('\nOK to run migration 007. Record this preflight output in your run log.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Preflight crashed:', e.message);
  console.error(e.stack);
  process.exit(2);
});
