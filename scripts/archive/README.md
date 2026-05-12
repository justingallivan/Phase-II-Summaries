# Archived scripts

These scripts targeted the Wave 1 Postgres tables (`system_settings`,
`user_app_access`, `user_preferences`), which were migrated to Dataverse
and dropped from Postgres on **2026-05-12** (see
`lib/db/migrations/007_drop_wave1_tables.sql`).

They are kept here as historical reference and as templates for any
Dataverse-targeted rewrites. **Do not run any of these against the live
database — they will either fail with "relation does not exist" or do
nothing useful.**

| Script | Original purpose | If you need this today |
|---|---|---|
| `backfill-app-access.js` | One-time grant of all apps to existing users (post V16 deploy) | One-shot done; no equivalent needed. Default-grant flow lives in `pages/api/auth/[...nextauth].js`. |
| `verify-wave1-read-path.js` | Pre-cutover verification that Dataverse reads matched Postgres reads | Wave 1 cutover complete; no equivalent needed. |
| `sync-wave1-postgres-to-dataverse.js` | Pre-cutover data sync (PG → DV) | Wave 1 cutover complete; no equivalent needed. |
| `manage-preferences.js` | Admin CLI for listing / deleting user preferences | Needs a Dataverse rewrite. Until then, use `/admin` UI or query `wmkf_appuserpreferences` directly. |
| `rotate-encryption-key.js` | Rotate `USER_PREFS_ENCRYPTION_KEY`, re-encrypting all rows | Needs a Dataverse rewrite (encryption still happens app-side; storage layer changed). Track in `CREDENTIALS_RUNBOOK.md` under "Pending tooling." |
