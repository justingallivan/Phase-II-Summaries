# Session 109 Prompt

## Session 108 Summary

**The Wave 1 Postgres → Dataverse migration is LIVE in prod.** Full pipeline from nothing to production cutover plus complete application-level wiring behind feature flags. 20 commits over a long day.

### What Was Completed

1. **Wave 1 security role infrastructure**
   - `lib/dataverse/schema/roles/wave1-staff.json` — declarative role + privilege matrix
   - `lib/dataverse/role-apply.js` — ensureRole / resolvePrivilegeIds / applyPrivileges / addRoleToSolution / assignRoleToUser helpers, all idempotent
   - `scripts/apply-security-role.js` — CLI mirroring `apply-dataverse-schema.js` conventions (dry-run default, `--target`, `--role`, `--assign`, `--execute`)
   - Discovered and embedded two Dataverse API quirks in comments: Depth enum requires string form ("Global"), plain equality works for string filters since Dataverse is case-insensitive (tolower is unsupported)

2. **Symmetric two-user isolation test** (sandbox)
   - Justin + Kevin, both non-admin → each blocked from the other's preference rows
   - 11/11 assertions pass on Preferences (User-level isolation) + AppSystemSetting (Org-level sharing)
   - Auto-detects and skips sys-admin users with clear notes

3. **Postgres → Dataverse Wave 1 data sync**
   - `scripts/sync-wave1-postgres-to-dataverse.js` — identity bridge (user_profiles.azure_email → systemuser.internalemailaddress), hardcoded Test-User skip + Tom→Beth remap, per-table idempotent upserts
   - 149 rows migrated in sandbox initially; then ALL 149 again in prod

4. **Read-path byte-level verification**
   - `scripts/verify-wave1-read-path.js` — raw ciphertext comparison (not just decrypted plaintext, which would pass vacuously when the local encryption key is missing) + is_encrypted flag + per-user app access set + shared settings
   - 66/66 assertions in sandbox, then 66/66 in prod

5. **Three Dataverse-backed service adapters**
   - `lib/services/dataverse-identity-map.js` — profile ↔ systemuser bridge with 5-min TTL
   - `lib/services/dataverse-prefs-service.js` (16/16 e2e tests) — full parity with DatabaseService preference methods including encryption/masking
   - `lib/services/dataverse-app-access-service.js` — 4 methods covering auth hot path + admin CRUD + default grants
   - `lib/services/dataverse-settings-service.js` — get/list/set/delete + listSettingsWithMeta variant for admin/secrets

6. **Feature-flag dispatch wiring** — three independent flags, default postgres
   - Prefs: wrapped inside `DatabaseService` (6 methods) via `WAVE1_BACKEND_PREFS`
   - App-access: new `lib/services/app-access-service.js` wrapper, 3 call sites replaced (auth hot path, admin API, NextAuth callback) via `WAVE1_BACKEND_APP_ACCESS`
   - Settings: new `lib/services/settings-service.js` wrapper, 5 call sites replaced (baseConfig preload, maintenance, admin/models, admin/secrets, cron/secret-check) via `WAVE1_BACKEND_SETTINGS`
   - `scripts/test-wave1-flag-dispatch.js` — 35/35 parity assertions across all three tables via both backends through the real service APIs

7. **Turbopack client-bundle safety**
   - Issue: Turbopack statically traces both `require()` and `await import()` even inside function bodies, pulling the Dataverse client into the client bundle via baseConfig → settings-service → dataverse-settings-service → dataverse/client.js (fs/path)
   - Fix: variable-path requires defeat the tracer; fs/path in client.js and the dataverse service loaders in all three wrappers now use this pattern
   - Architectural fix: extracted `loadModelOverrides` + `clearModelOverridesCache` out of `shared/config/baseConfig.js` into a new server-only `lib/services/model-override-loader.js`; updated 15 API route import statements and `shared/config/index.js` re-exports

8. **Prod cutover — end to end (2026-04-24)**
   - Three privilege rounds with Connor: first System Customizer (to get past prvCreateSystemForm etc.), then prvAssignRole on the permanent WMKF AI Tools role. Schema script hit a transient SQL deadlock (error 1205) mid-run; plain retry resolved it.
   - All 3 tables + relationships + alt-keys + systemuser extensions live in prod
   - Role created in prod, 18 privileges applied, added to solution
   - Assigned to all 7 staff + the app user (8 assignments)
   - 149 rows migrated prod Postgres → prod Dataverse
   - 66/66 verification assertions pass against prod

9. **Connor handoff documentation (six docs)**
   - `docs/WAVE1_PROD_RUNBOOK.md` — complete cutover runbook, kept for reference + Wave 2 template
   - `docs/WAVE1_PROD_PRIVILEGE_REQUEST.md` — initial "Option A surgical vs Option B System Customizer" decision
   - `docs/WAVE1_PROD_PRIVILEGE_REQUEST_2.md` — follow-up on prvAssignRole for user assignment
   - `docs/WAVE1_REVERT_TEMP_ELEVATIONS.md` — future procedure for removing temp roles (when flag rollout is stable)
   - `docs/WAVE1_VERCEL_FLAG_ROLLOUT.md` — sequenced plan: SETTINGS → PREFS → APP_ACCESS, 24h between flips
   - `docs/CONNOR_PROMPT_TABLE_FOLLOWUP.md` / `docs/CONNOR_PROMPT_SCHEMA_QUESTIONS.md` — surfaced the `wmkf_ai_prompt` privilege + two schema design questions. Privileges confirmed granted; schema decisions pending (column add for system/user split, routing convention)

### Key State Facts

- **Prod Dataverse is a byte-for-byte copy of prod Postgres** for the 3 Wave 1 tables. Verified.
- **App behavior is unchanged.** All three feature flags default to `postgres`. Nothing is reading Dataverse yet at runtime.
- **App user prod roles (as of session end):** WMKF AI Elevated TEMP + System Customizer (temporary, to be removed per `docs/WAVE1_REVERT_TEMP_ELEVATIONS.md`), WMKF AI Tools (permanent, now includes prvAssignRole), WMKF Custom Entities, akoyaGO Read Only access, WMKF Research Review App Suite - Staff (new, permanent).
- **`wmkf_ai_prompt` read/write privileges** confirmed on the app user. Table is empty. Two schema questions sent to Connor, awaiting reply before porting PromptResolver.

### Commits (20 this session)

- `e3f865f` Wave 1 security role: declarative config + idempotent apply script
- `a76697e` Wave 1 role isolation test — verifies User-level Read on AppUserPreference
- `0094449` Wave 1 isolation test: symmetric Justin + Kevin; sys admin auto-skip
- `518756b` Wave 1 data sync: Postgres → Dataverse sandbox
- `b98c249` Wave 1 read-path verification: ciphertext + plaintext byte-equal Postgres ↔ Dataverse
- `817d8f7` Dataverse prefs service — full parallel implementation, not yet wired in
- `8c4ee6c` Wave 1 prod runbook + sync script --target=prod support
- `9965d08` Dataverse adapters for app-access + settings
- `5b68604` Wire prefs dispatch into DatabaseService via WAVE1_BACKEND_PREFS flag
- `8838c8f` Wire app-access dispatch via WAVE1_BACKEND_APP_ACCESS flag
- `636b8da` Wire settings dispatch via WAVE1_BACKEND_SETTINGS — all 3 Wave 1 tables flag-wired
- `11028c5` Make Wave 1 dispatch client-bundle-safe (Turbopack)
- `f2c404e` Correct Wave 1 runbook privilege list: add prvCreateSolution, recommend System Customizer
- `bb312cd` Connor handoff: Option A (surgical) vs Option B (System Customizer) for prod cutover
- `7963af6` Connor handoff #2: unblock user-role-assignment step
- `5398b41` verify-wave1-read-path.js: add --target=prod support + run prod cutover
- `f1b59be` Wave 1 follow-up docs: revert elevations + Vercel flag rollout
- `ef8acad` Connor handoff: wmkf_ai_prompt privilege + two schema decisions
- `91e760e` Connor targeted follow-up: just the two prompt-table schema questions
- `48009d2` Refine Q1 ask on Connor schema doc — drop "I can add it" offer

## Pending Connor Responses

1. **`wmkf_ai_prompt` schema decisions** (`docs/CONNOR_PROMPT_SCHEMA_QUESTIONS.md`):
   - System vs user prompt split (add a second Memo column — lean yes)
   - Routing via name convention vs structured column (lean convention)

   Privileges were confirmed granted — this is purely two design decisions.

2. **From prior sessions** — `wmkf_ai_prompt` broader questions, Q3/Q5/Q6/Q7 from `docs/CONNOR_QUESTIONS_2026-04-15.md`.

## Potential Next Steps

### 1. Flip Vercel feature flags (most important non-blocking work)
Per `docs/WAVE1_VERCEL_FLAG_ROLLOUT.md` — SETTINGS first (lowest blast radius), then PREFS, then APP_ACCESS. 24h watch between each. Rollback is unset-the-flag. Zero code change; this is pure config + monitoring.

### 2. Port PromptResolver to `wmkf_ai_prompt`
Once Connor answers the two schema questions. `lib/services/prompt-resolver.js` currently uses a scratch `wmkf_ai_run` row as a hack. Replace with a real query against `wmkf_ai_prompt` with `wmkf_ai_iscurrent eq true` filter. Toggle on `/phase-i-dynamics` already exists (`summarize-v2`).

### 3. Automated first-login onboarding
Per `memory/project_wave1_onboarding.md` — extend `grantDefaultApps` in NextAuth callback to also call a new `ensureStaffRoleAssigned(profileId)` helper. Builds on the role-apply.js assignRoleToUser function. Do this AFTER flags flip, not before. ~30 lines of code.

### 4. Interim grant report auto-evaluation (unblocked by Dynamics write access)
PowerAutomate-triggered job that runs our extract + goals assessment on interim reports and writes back to `wmkf_ai_*` fields. Production-ization of `pages/api/grant-reporting/extract.js` but triggered by a Dynamics status change. High visibility.

### 5. Wave 2 schema — Reviewer Finder core
Much bigger migration. Needs:
- Choice/Picklist + OptionSet support added to `lib/dataverse/schema-apply.js` (a few hours)
- Junction tables (researcher ↔ publication ↔ keyword — new pattern for us)
- Wave 2 JSON specs under `lib/dataverse/schema/wave2/`
- Data sync script following the Wave 1 pattern

Tables involved: `researchers`, `publications`, `grant_cycles`, `reviewer_suggestions`, `researcher_keywords`.

### 6. Remove temp role elevations from prod app user
Per `docs/WAVE1_REVERT_TEMP_ELEVATIONS.md`. Do this after flag rollout is stable. Connor handles via maker portal. Verification script + recovery path documented.

### 7. Summarize-v3 (native PDF input + caching) + Files API integration
Still queued from Session 106. Quick wins if in the mood for something contained.

### 8. System-level workflow diagram
Discussed at session end — no single big-picture mermaid diagram exists yet (there are four diagrams in docs but they all cover subsystems). If we build Wave 2 or the backend automation platform, a system overview would be useful.

## Key Files Reference

| File | Purpose |
|------|---------|
| `lib/dataverse/role-apply.js` | Idempotent helpers: ensureRole, resolvePrivilegeIds, applyPrivileges, addRoleToSolution, assignRoleToUser |
| `lib/dataverse/schema/roles/wave1-staff.json` | Declarative role spec + privilege matrix |
| `scripts/apply-security-role.js` | CLI for the role apply; --target/--role/--assign/--execute |
| `scripts/sync-wave1-postgres-to-dataverse.js` | Data sync with identity bridge; Test-User skip + Tom→Beth remap encoded in USER_ID_OVERRIDES |
| `scripts/verify-wave1-read-path.js` | Postgres ↔ Dataverse parity at the ciphertext + plaintext + app-access + settings levels |
| `scripts/test-wave1-flag-dispatch.js` | 35/35 integration test across all three wrappers and both backends |
| `lib/services/dataverse-identity-map.js` | profile_id ↔ systemuserid bridge with TTL cache; Tom→Beth remap encoded here |
| `lib/services/dataverse-prefs-service.js` | 1:1 parity with DatabaseService preferences; encryption roundtrip |
| `lib/services/dataverse-app-access-service.js` | listAppKeysForUser, listAllGrantsForAdmin, grantApps, revokeApps |
| `lib/services/dataverse-settings-service.js` | getSetting, listSettings, listSettingsWithMeta, setSetting, deleteSetting |
| `lib/services/app-access-service.js` | Postgres wrapper + Dataverse dispatcher for app access |
| `lib/services/settings-service.js` | Postgres wrapper + Dataverse dispatcher for settings |
| `lib/services/model-override-loader.js` | Server-only loader — kept out of client bundles |
| `docs/WAVE1_VERCEL_FLAG_ROLLOUT.md` | TODO: sequenced flag-flip plan |
| `docs/WAVE1_REVERT_TEMP_ELEVATIONS.md` | TODO: Connor procedure for removing temp roles after rollout |
| `docs/WAVE1_PROD_RUNBOOK.md` | Full prod cutover runbook (now historical reference) |

## Testing

```bash
# Sandbox parity — same as prod, no blast radius
node scripts/apply-dataverse-schema.js                 # dry-run sandbox
node scripts/apply-security-role.js                     # dry-run sandbox
node scripts/sync-wave1-postgres-to-dataverse.js        # dry-run sandbox

# Integration + parity tests (safe to rerun)
node scripts/test-wave1-flag-dispatch.js                # 35/35 — all 3 tables via both backends
node scripts/test-dataverse-prefs-service.js            # 16/16 — prefs service e2e
node scripts/test-dataverse-app-access-and-settings.js  # 20/20 — app-access + settings services
node scripts/test-role-isolation-wave1.js               # 11/11 — symmetric Justin + Kevin

# Prod read-path sanity check (safe, read-only)
node scripts/verify-wave1-read-path.js --target=prod    # 66/66 if still in sync
```

## Session hand-off notes

- Prod Dataverse is a shadow copy. App continues reading/writing Postgres until flags flip in Vercel.
- `WMKF AI Elevated TEMP` + `System Customizer` are still assigned to the prod app user. Plan is to leave them until flag rollout is stable, then remove per `docs/WAVE1_REVERT_TEMP_ELEVATIONS.md`.
- Session ended mid-conversation about the `wmkf_ai_prompt` port. We're awaiting Connor's answers on two yes/no schema questions; after that, the PromptResolver port is ~2 hours of work.
- Next session shouldn't touch prod without re-checking `git log` to see if anything landed in between (e.g., flag flips happening async).
- Today's date: 2026-04-24. Wave 1 was completed in prod today. Session was long (~20 commits) but the architectural arc — sandbox → verification → adapters → wiring → build safety → prod cutover → runbooks — was completed cleanly with every step test-verified.
