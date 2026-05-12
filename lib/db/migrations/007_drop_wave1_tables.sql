-- Migration 007: Drop Wave 1 Postgres tables (system_settings, user_app_access, user_preferences)
--
-- Closes out the Wave 1 Postgres → Dataverse migration. Data has been migrated
-- to wmkf_appsystemsettings, wmkf_appuserappaccesses, and wmkf_appuserpreferences
-- in Dataverse. Production dispatch has routed reads and writes to Dataverse
-- since 2026-05-03 (flag flip date); behavioral verification on 2026-05-11
-- confirmed zero production writes against any of these tables in the
-- intervening 8 days. Tier-keyed model_override rows synced from PG → DV on
-- 2026-05-11 to reconcile divergence introduced by S145 dev writes.
--
-- WARNING — guard limitations:
-- The DO-block guards below count rows by created_at / updated_at. They DO
-- NOT detect:
--   1. Deletes against any of the three tables. settings-service.deleteSetting,
--      DatabaseService.deleteUserPreference, and app-access-service.revokeApps
--      can delete rows without leaving any timestamp evidence.
--   2. Direct updates that bypass updated_at. scripts/rotate-encryption-key.js
--      rewrites user_preferences.preference_value without touching updated_at.
--   3. Writes via the operator-bypass doors in scripts/backfill-app-access.js
--      (--allow-postgres-only) and scripts/manage-preferences.js (same flag).
--   4. The V22 user_app_access update inside scripts/setup-database.js, which
--      does not change created_at — do NOT run setup-database.js against prod
--      after this migration runs.
-- Before executing, run scripts/wave1-drop-preflight.js. It does the live
-- catalog probes and log/grep checks that the SQL guards cannot.
--
-- RECOVERY WARNING:
-- This DROP is recoverable only inside Neon's configured PITR window (7 days
-- as of 2026-05-11). Before execution, the operator must record: project_id,
-- branch_id / branch name, database name, current connection string, and
-- exact UTC timestamp of the run.
--
-- To recover, restore the prod branch to a timestamp immediately before this
-- migration. Prefer Neon's branch-restore / finalize flow that preserves the
-- production compute endpoint. Creating a separate restore branch results in
-- a NEW connection string and the Vercel POSTGRES_URL / POSTGRES_URL_NON_POOLING
-- / POSTGRES_URL_NO_SSL env vars must be updated and the project redeployed
-- BEFORE flipping WAVE1_BACKEND_SETTINGS / APP_ACCESS / PREFS back to postgres.
-- Expect a brief compute restart / connection interruption during a finalized
-- restore. After restore, verify all three tables exist and row counts match
-- the pre-drop snapshot before flipping flags.
--
-- No code paths read or write these tables after the flag-flip — every
-- caller routes through settings-service / app-access-service /
-- database-service, all of which dispatch on WAVE1_BACKEND_*. The three
-- *-service.js modules retain the Postgres branches as dead code until a
-- follow-up cleanup pass removes them.

BEGIN;

-- Sanity: refuse to run if anything has been written to these tables since
-- the reconciliation baseline (2026-05-12 UTC). The 10 known dev writes from
-- 2026-05-10 23:23 (S145 admin model picker on localhost, reconciled via
-- PG→DV sync on 2026-05-11) are pre-baseline and intentionally not flagged.
-- Both dev (.env.local) and prod (Vercel) now have WAVE1_BACKEND_* set to
-- 'dataverse', so any post-baseline write would indicate either an env-flag
-- regression or a code path we missed in the dispatcher audit.
DO $$
DECLARE
  ss_post BIGINT;
  up_post BIGINT;
BEGIN
  SELECT count(*) INTO ss_post
  FROM system_settings
  WHERE updated_at >= '2026-05-12 00:00:00+00';

  SELECT count(*) INTO up_post
  FROM user_preferences
  WHERE updated_at >= '2026-05-12 00:00:00+00';

  IF ss_post > 0 OR up_post > 0 THEN
    RAISE EXCEPTION
      'Wave 1 drop aborted: post-baseline writes detected (system_settings=%, user_preferences=%). '
      'Reconciliation baseline is 2026-05-12 UTC. Any write after that indicates the flag-flip '
      'is not in effect somewhere. Verify WAVE1_BACKEND_SETTINGS / WAVE1_BACKEND_PREFS in '
      'every environment (prod, preview, .env.local) before applying.',
      ss_post, up_post;
  END IF;
END$$;

-- user_app_access has no updated_at; the only mutation paths are INSERT (grant)
-- and DELETE (revoke). Anchor on created_at to the reconciliation baseline.
DO $$
DECLARE
  uaa_post BIGINT;
BEGIN
  SELECT count(*) INTO uaa_post
  FROM user_app_access
  WHERE created_at >= '2026-05-12 00:00:00+00';

  IF uaa_post > 0 THEN
    RAISE EXCEPTION
      'Wave 1 drop aborted: user_app_access has % rows created since baseline 2026-05-12. '
      'Verify WAVE1_BACKEND_APP_ACCESS is set to ''dataverse'' in every environment.',
      uaa_post;
  END IF;
END$$;

DROP TABLE IF EXISTS system_settings;
DROP TABLE IF EXISTS user_app_access;
DROP TABLE IF EXISTS user_preferences;

COMMIT;
