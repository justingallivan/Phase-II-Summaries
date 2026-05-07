# Atlas: Postgres infrastructure tables (compact)

**Last verified:** 2026-05-07 via `scripts/audit-postgres-state.js`

Compact summary for the Postgres tables outside the reviewer-finder domain. Promote any of these to its own page on next significant touch.

## Identity / authn / app access

### `user_profiles` (9 rows)
**Source of truth:** Postgres.
**Schema:** identity bridge (`azure_id`, `azure_email`, `dynamics_systemuser_id`, `is_active`, role).
**Read sites:** 16 (NextAuth callbacks, `requireAuth*` helpers, admin dashboard, identity reconciliation, many app endpoints).
**Write sites:** 3 (NextAuth signin upsert, admin grant/revoke, identity reconciliation script).
**Cross-system:** `dynamics_systemuser_id` joins to Dataverse `systemusers.systemuserid`. See `lib/services/dataverse-identity-map.js`.
**Migration:** Wave 1 dispatch flag `WAVE1_BACKEND_*` exists but identity stays Postgres for now.

### `user_app_access` (Postgres 80 rows / Dataverse 84 rows, 2026-05-07)
**Source of truth (refreshed 2026-05-07):** **Dataverse `wmkf_appuserappaccesses`** (84 rows, live; flag flipped 2026-05-03). Postgres copy held read-only as a fallback until 2026-05-17 retirement window. The 4-row delta is post-flip activity in Dataverse; Postgres is frozen.
**Live Dataverse adapter:** `lib/services/dataverse-app-access-service.js` — uses `client.post('/wmkf_appuserappaccesses', ...)` (note the entity-set name has no underscore between `app` and `userappaccesses`, even though the schema-as-code file is `wmkf_app_user_app_access.json`).
**Schema:** `(user_profile_id, app_key)` unique grant rows.
**Read/write:** 3/3 files. `lib/services/app-access-service.js` is the legacy reader; the dataverse-* sibling is the new path.
**Migration:** Wave 1 retirement earliest 2026-05-17 (14-day stability clock from 2026-05-03).

### `user_preferences` (Postgres 25 rows / Dataverse 20 rows, 2026-05-07)
**Source of truth (refreshed 2026-05-07):** **Dataverse `wmkf_appuserpreferences`** (20 rows, live; flag flipped 2026-05-03). Postgres has more rows because preferences allow DELETE — some have been deleted on the Dataverse side post-flip while Postgres holds the older snapshot.
**Live Dataverse adapter:** `lib/services/dataverse-prefs-service.js`.
**Encryption:** values AES-256-GCM when `is_encrypted = true`.
**Read/write:** 5/2 files. **3 DELETE callers** (per write-grep) — verify before drop.
**Migration:** Same as `user_app_access`.

### `system_settings` (Postgres 45 rows / Dataverse 45 rows, 2026-05-07)
**Source of truth (refreshed 2026-05-07):** **Dataverse `wmkf_appsystemsettings`** (45 rows, live; flag flipped 2026-05-03). Counts match exactly — settings are append-mostly so no drift.
**Live Dataverse adapter:** `lib/services/dataverse-settings-service.js`.
**Schema:** generic key-value (model overrides, feature flags, etc.).
**Read/write:** 3/1 raw SQL files — but reads are **fanned out via `lib/services/settings-service.js`** to ≥5 distinct call sites (admin-models page, secrets management, maintenance flows, model overrides loader, cron secret-check). Treat the service as the canonical reader; the SQL grep undercounts because callers go through it.
**Migration:** Wave 1.

## Dynamics Explorer state

### `dynamics_query_log` (1,359 rows)
**Source of truth:** Postgres-only.
Per-query log (NL → tool plan → result). Used by feedback flow.

### `dynamics_feedback` (1 row)
**Source of truth:** Postgres-only.
Thumbs up/down + auto-detected failures.

### `dynamics_user_roles` (6 rows), `dynamics_restrictions` (0 rows)
**Source of truth:** Postgres-only.
RBAC scaffolding for the explorer write tools. Restrictions table is empty; a 27-script `setRestrictions`/`bypassRestrictions` migration is "deliberately deferred" per S136.

## Expertise Finder

### `expertise_roster` (38 rows), `expertise_matches` (344 rows)
**Source of truth:** Postgres.
Internal staff/consultant/board roster + per-proposal match history. See `modules/expertise_matching/CLAUDE.md`.

## Integrity Screener

### `integrity_screenings` (41 rows), `screening_dismissals` (0 rows)
**Source of truth:** Postgres.
Per-applicant screening history. `retractions` (68,248 rows) is the Retraction Watch dataset (org-wide).

### `retractions` (68,248 rows)
**Source of truth:** Postgres (manually refreshed via script — no live cron).
**Read paths (verified 2026-05-07):** `lib/services/integrity-service.js` (≈line 223) — searches `retractions.authors_normalized` for overlap with screened applicants, falls back to text match.
**Write paths:** `scripts/import-retraction-watch.js` — DELETE all + INSERT bulk from Retraction Watch CSV. **No `/api/cron/refresh-retractions` route exists** (Atlas v1 mis-cited this).

## Virtual Review Panel

### `panel_reviews` (35 rows), `panel_review_items` (278 rows)
**Source of truth:** Postgres. V24 migration.
Multi-LLM review history. `panel_review_items` holds per-LLM responses.

## Intake Portal (pre-pilot)

### `intake_drafts` (0 rows), `intake_audit` (0 rows)
**Source of truth:** Postgres. V005 migration (May 2026).
Drafts cleared on submit; audit append-only sha256-hashed. Pilot launch mid-June 2026.

## Monitoring / observability

### `health_check_history` (2,927 rows), `system_alerts` (110 rows), `maintenance_runs` (73 rows)
**Source of truth:** Postgres-only.
Cron-driven health checks (7 services), alert log, cron audit trail. `maintenance-service.js` writes; admin dashboard reads.

### `api_usage_log` (2,044 rows)
**Source of truth:** Postgres-only.
Per-Claude-call ledger (model, tokens, cost, latency). Written by `lib/services/llm-client.js` via `lib/utils/usage-logger.js` (`logUsage`, raw SQL INSERT at ≈line 64). Not routed through `DatabaseService`.
