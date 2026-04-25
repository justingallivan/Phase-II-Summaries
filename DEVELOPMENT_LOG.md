# Development Log

This file is a **milestone log**, not a per-session log. An entry exists when a session shipped something a future Justin would search for: a production cutover, a new architecture, a strategic pivot, a deprecated capability removed, an incident. Most sessions are prep, exploration, refactors, or doc work — those live in commit messages and `SESSION_PROMPT.md`, not here.

For current project documentation see [CLAUDE.md](./CLAUDE.md). For the most recent session hand-off see [SESSION_PROMPT.md](./SESSION_PROMPT.md).

**Format reminder for future sessions:** Add an entry only at a real milestone. Tight: ~8 lines, with **Milestone**, **Sessions**, **Ship state**, **Why it matters**, **Pointers**. Skipping is the right answer most weeks.

The pre-Session 84 chronological per-session log (everything after the September 2025 divider further down) is preserved in its original form — older format, kept for archaeology, not maintained going forward.

---

## April 2026 — Phase 0 Executor architecture shipped on Vercel side (Session 110)

**Milestone:** Prompt rows live in Dynamics + Executor service in Vercel + reference call site refactored. Same prompt row will serve PowerAutomate and Vercel callers when Phase 1 (Connor's PA work) lands.
**Sessions:** 110 (2026-04-25)
**Ship state:**
- `wmkf_ai_prompt` table populated; `phase-i.summary` row live in sandbox (`d4201d8e-3840-f111-88b5-000d3a3065b8`)
- `lib/services/execute-prompt.js` implements the 10-step contract — including step 4 output guards (`skip-if-populated` / `always-overwrite` + `forceOverwrite` input)
- `pages/api/phase-i-dynamics/summarize-v2.js` refactored from 292 → 145 lines — only Vercel-specific concerns remain (auth, file load, 409 shaping)
- Verified end-to-end via UI (`/phase-i-dynamics`) and a smoke-test script with three runs (write / block / cache-hit)
**Why it matters:** Cycle path (May 1 2026) now runs through the new infrastructure. PA-side (Phase 1) and context blocks (Phase 2) are queued as future work; Vercel-side is done.
**Strategic shift captured:** user-facing intake apps (`/phase-i-dynamics`) are winding down post-cycle; backend automation owns the future of compliance/keywords/fit prompts. See `memory/project_phase_i_summary_app_winddown.md`.
**Pointers:** `docs/EXECUTOR_CONTRACT.md`, commits `f465799`..`f47b849`

---

## April 2026 — Executor Contract + Phase 0 schema reconciliation (Session 109)

**Milestone:** Day-long architectural reconciliation with Connor in the room. Output: one shared spec both PowerAutomate and Vercel executors will build against, with phased delivery plan.
**Sessions:** 109 (2026-04-24)
**Ship state:**
- `docs/EXECUTOR_CONTRACT.md` created — the operational spec. Defines 9 (later 10) steps, declarative variable + output metadata, caching contract, logging contract.
- Path B chosen over duplicated wrappers (Path A) and HTTP gateway (Path C). Vocabulary split: prompt row = the **function**, PA/Vercel flows = the **process**, Executor = the shared invocation contract.
- Connor's late additions confirmed live: `wmkf_ai_systemprompt` Memo (system/user split for caching) + Lookup `wmkf_ai_prompt` on `wmkf_ai_run` (fixes provenance gap).
- Phased plan set: Phase 0 (May 1 cycle) = shared core + Vercel Executor; Phase 1 (post-cycle) = PowerAutomate `ExecutePrompt` child flow; Phase 2 = context blocks + cross-prompt cache alignment.
**Why it matters:** Six overlapping design docs from Sessions 90–108 were collapsed into one operational spec. Both implementations build against it. No more drift between Vercel and PA.
**Pointers:** `docs/EXECUTOR_CONTRACT.md`, `docs/PROMPT_STORAGE_DESIGN.md` (now reconciled), commit `adef1c8`

---

## April 2026 — Wave 1 Dataverse Migration Live in Production (Session 108)

Ran the full Wave 1 arc from sandbox security-role work through production cutover in a single long session. 20 commits. End state: prod Dataverse holds byte-for-byte copies of Postgres `user_preferences`, `user_app_access`, `system_settings`; all three tables are wired into the application behind per-table feature flags defaulting to postgres; rollout to production traffic is a config flip away. Documentation and memory are updated so future sessions know the remaining follow-ups.

- **Security role infrastructure** (`e3f865f`): `lib/dataverse/schema/roles/wave1-staff.json` + `lib/dataverse/role-apply.js` + `scripts/apply-security-role.js`. Idempotent apply via `AddPrivilegesRole`, solution binding via `AddSolutionComponent` (ComponentType 20), `systemuserroles_association/$ref` assignment. Dataverse API quirks discovered and documented in the code: `Depth` field requires the string enum form ("Global"), and OData `tolower()` isn't supported in metadata filters — plain `eq` on string fields is case-insensitive in Dataverse.
- **Symmetric two-user isolation test** (`a76697e`, refactored `0094449`): `scripts/test-role-isolation-wave1.js`. Impersonates two real sandbox users via `MSCRMCallerID` and asserts each is blocked from the other's preference rows while retaining Org-level access to the shared settings table. 11/11 assertions pass with Justin + Kevin (both non-admin). Auto-skips sys-admin users and notes why their side would bypass.
- **Postgres → Dataverse data sync** (`518756b`, prod-support added `8c4ee6c`): `scripts/sync-wave1-postgres-to-dataverse.js`. Identity bridge via `user_profiles.azure_email` → `systemuser.internalemailaddress`. Hardcoded `USER_ID_OVERRIDES` handles `id=1 Test User → skip` and `id=6 Tom Rieker → id=5 Beth Pruitt` remap (Tom left the foundation; Beth took over reviewing). 149 rows migrated in sandbox: 20 prefs + 84 app-access + 45 settings. Encrypted preference values carry over as ciphertext unchanged.
- **Read-path byte-level verification** (`b98c249`, prod-support `5398b41`): `scripts/verify-wave1-read-path.js`. Compares at three levels — raw stored bytes (load-bearing, since null-vs-null decrypted values would pass vacuously when the local encryption key is absent), is_encrypted flag, decrypted plaintext. 66/66 assertions across all 7 real users + shared settings.
- **Three Dataverse-backed service adapters** (`817d8f7`, `9965d08`):
  - `lib/services/dataverse-identity-map.js` — profile ↔ systemuser bridge with 5-min TTL.
  - `lib/services/dataverse-prefs-service.js` — 1:1 parity with DatabaseService preference methods including encryption/masking. 16/16 e2e assertions pass.
  - `lib/services/dataverse-app-access-service.js` — listAppKeysForUser / listAllGrantsForAdmin / grantApps / revokeApps. Admin view crosses the Postgres-Dataverse boundary since user_profiles stays in Postgres until Wave 3+.
  - `lib/services/dataverse-settings-service.js` — get/list/set/delete plus listSettingsWithMeta variant for admin/secrets that needs updated_at alongside value.
- **Feature-flag dispatch wiring** (`5b68604`, `8838c8f`, `636b8da`): three independent flags — `WAVE1_BACKEND_PREFS`, `WAVE1_BACKEND_APP_ACCESS`, `WAVE1_BACKEND_SETTINGS`, all defaulting to postgres. Prefs dispatched inside DatabaseService (6 methods). App-access wrapped by new `lib/services/app-access-service.js` with 3 call sites replaced (auth hot path, admin API, NextAuth callback). Settings wrapped by new `lib/services/settings-service.js` with 5 call sites replaced (baseConfig preload, maintenance, admin/models, admin/secrets, cron/secret-check). 35/35 parity assertions via `scripts/test-wave1-flag-dispatch.js` exercise all three wrappers through their real APIs on both backends.
- **Turbopack client-bundle safety** (`11028c5`): Turbopack traces both `require()` and `await import()` statically even when nested in function bodies, which tried to pull the Dataverse client's `fs`/`path` requires into the client bundle via baseConfig → settings-service → dataverse-settings-service → dataverse/client.js. Fix: variable-path requires defeat the tracer (applied in `lib/dataverse/client.js` for fs/path, and in all three wrappers for the Dataverse service loads). Architectural fix: extracted `loadModelOverrides` + `clearModelOverridesCache` out of `shared/config/baseConfig.js` into a new server-only `lib/services/model-override-loader.js`. Updated 15 API route import statements + `shared/config/index.js` re-exports accordingly. Production build goes clean.
- **Prod cutover** (`5398b41`): three privilege rounds with Connor — first `System Customizer` (to get past `prvCreateSystemForm` auto-invoked during table creation), then `prvAssignRole` on the permanent `WMKF AI Tools` role. Schema script hit a transient SQL deadlock (error 1205) on alt-key creation mid-run; idempotent retry resolved it cleanly. Schema + role + data + verification all pass in prod. App behavior unchanged — all three flags still default to postgres.
- **Connor handoff documentation** (six docs across multiple commits): `docs/WAVE1_PROD_RUNBOOK.md` (comprehensive cutover runbook, now historical reference), `docs/WAVE1_PROD_PRIVILEGE_REQUEST.md` (Option A surgical vs Option B System Customizer decision), `docs/WAVE1_PROD_PRIVILEGE_REQUEST_2.md` (`prvAssignRole` follow-up), `docs/WAVE1_REVERT_TEMP_ELEVATIONS.md` (future procedure for removing temp roles when flag rollout is stable), `docs/WAVE1_VERCEL_FLAG_ROLLOUT.md` (sequenced plan: SETTINGS → PREFS → APP_ACCESS, 24h between flips), `docs/CONNOR_PROMPT_TABLE_FOLLOWUP.md` + `docs/CONNOR_PROMPT_SCHEMA_QUESTIONS.md` (re-surfaced `wmkf_ai_prompt` privilege + two schema design questions; privileges confirmed granted, schema decisions pending). Memory index updated so future sessions pick up the two pending follow-ups automatically.
- **End state:** prod Dataverse = byte-for-byte copy of prod Postgres for the 3 Wave 1 tables. App still reads Postgres (flags default postgres). Pending Connor: two `wmkf_ai_prompt` schema decisions (yes/no each). Pending us: flip Vercel flags one at a time per runbook (not yet done — left for a calm session). Pending Connor later: remove temp role elevations after flag rollout is stable.

---

## April 2026 — Wave 1 Dataverse Schema Live in Sandbox (Session 107)

Shipped Wave 1 of the Postgres → Dataverse migration end to end: reusable schema-apply infrastructure, 13 artifacts created in a named solution in the sandbox, idempotent reruns, data-level smoke test passing. Drafted the security-role handoff doc for Connor. Discovered his new `wmkf_ai_prompt` table in prod, flagged access blocker + two design questions for morning.

- **Schema-apply infrastructure** (`f05f3d0`): `lib/dataverse/client.js` (OAuth + fetch helper with solution-header binding, dry-run support), `lib/dataverse/schema-apply.js` (idempotent `ensure*` functions for publisher/solution/entity/attribute/relationship/alt-key with metadata-cache-lag retry), `scripts/apply-dataverse-schema.js` (CLI, sandbox by default, explicit `--execute` + `--target=prod`). Declarative schemas as JSON under `lib/dataverse/schema/wave1/`. Solution `wmkfResearchReviewAppSuite` under publisher `WMKF_Publisher`.
- **Wave 1 artifacts** (`f05f3d0`): `systemuser.wmkf_app_AvatarColor` + `.wmkf_app_NeedsLinking`; `wmkf_AppSystemSetting` (Org-owned, + `wmkf_SettingValue` Memo, + `wmkf_UpdatedBy` N:1 systemuser, + single-column alt-key); `wmkf_AppUserAppAccess` (Org-owned, + required `wmkf_User` N:1 + `wmkf_GrantedBy` N:1 + composite alt-key on (user, app_key)); `wmkf_AppUserPreference` (User-owned, + `wmkf_PreferenceValue` Memo + `wmkf_IsEncrypted` Boolean). 13 artifacts total. Rerun produces all `· exists`.
- **Bugs fixed during first-time execute** (all committed): three publishers share prefix `wmkf` — added `publisherUniqueName` in solution.json for disambiguation. Client header-ordering bug — `MSCRM.SolutionUniqueName` auto-add clobbered extraHeaders suppression; fixed spread order so empty-string override actually suppresses. Dataverse 404s the direct `Attributes(LogicalName='x')` path for non-String subtypes (Memo/Boolean) without a type-cast; switched to filter-based existence check. `ownerid` rejected as polymorphic `PrincipalAttribute` in composite alt-keys — dropped the `(preferencekey, ownerid)` key; per-user uniqueness enforced app-side instead.
- **Data smoke test** (`10c1982`): `scripts/smoke-test-wave1.js` — INSERT into each table, alt-key duplicate attempts, custom-lookup binding, ownerid auto-populate check, full cleanup. All 6 checks pass. **Finding**: custom-lookup `@odata.bind` uses the lookup's **SchemaName (PascalCase)**, not logical name — Dataverse navigation property casing follows `ReferencingEntityNavigationPropertyName`. Applies to every custom lookup we create going forward.
- **Security-role handoff doc** (`a828d22`): `docs/SECURITY_ROLE_WAVE1.md` — explains the one table needing User-level Read (`wmkf_AppUserPreference` holds encrypted secrets), privilege matrix for all three Wave 1 tables, maker-portal walkthrough + Web API alternative, two-user isolation test plan, callouts on BU / role-inheritance / role-name differences I might be wrong about.
- **Connor's `wmkf_ai_prompt` table discovered** (`e67262a`): Connor finished the prompt-storage table while we were on Wave 1. Name: `wmkf_ai_prompt` (not `wmkf_prompt_template` as originally spec'd). Schema is richer than design — includes lifecycle (`wmkf_ai_promptstatus`, `wmkf_ai_iscurrent`, `wmkf_promptversion`, `wmkf_ai_rollbackfrom`, `wmkf_ai_publisheddatetime`, `wmkf_ai_preflightpasseddatetime`, `wmkf_ai_lasttestdatetime`), content (`wmkf_ai_promptbody`, `wmkf_ai_promptvariables`, `wmkf_ai_promptoutputschema`), Claude config (`wmkf_ai_model`, `wmkf_ai_maxtokens`, `wmkf_ai_temperature`), meta (`wmkf_ai_promptname`, `wmkf_ai_notes`). **App user lacks prvRead** on the table — 403 on any query. **Two design questions** flagged in `docs/CONNOR_PROMPT_TABLE_NOTES.md`: single `wmkf_ai_promptbody` collapses the system/user-prompt split we recommended for caching (options: add a second Memo column, use a delimiter, or keep merged); no visible app-key column (confirm that `wmkf_ai_promptname` is the routing key or add a structured one).

**Files:** `lib/dataverse/client.js` (new); `lib/dataverse/schema-apply.js` (new); `lib/dataverse/schema/solution.json` (new); `lib/dataverse/schema/wave1/*.json` (4 new); `scripts/apply-dataverse-schema.js` (new); `scripts/smoke-test-wave1.js` (new); `docs/SECURITY_ROLE_WAVE1.md` (new); `docs/CONNOR_PROMPT_TABLE_NOTES.md` (new); `.env.local` (added `DYNAMICS_SANDBOX_URL`).

---

## April 2026 — Sonnet 4.6 Cache Floor + Connor Sync + Dataverse Migration Plan (Session 106)

Two major threads. First: diagnosed why v2 system-prompt caching never fires. Second, with Connor in the room: resolved the Open Questions in the PDF-input brief, designed the PA-vs-web-apps division of labor, and built a full Postgres → Dataverse migration plan across 27 tables.

- **Sonnet 4.6 cache floor finding** (`48dec12`): Anthropic silently doubled the cache minimum to 2048 tokens in the Sonnet 4.6 generation, undocumented. Confirmed by bisection: 2,019 tokens → no cache; 2,058 → writes. `cache_control` marker is accepted in the request regardless; the write is just dropped. Beta header `prompt-caching-2024-07-31` doesn't help. Audited all app system prompts via `count_tokens` — three apps in the 1024–2047 dead zone: `phase-i-dynamics-v2` (1,419), `qa` with typical 10K-char proposal (1,868), `phase-i-summaries v1` (1,426). Dynamics-explorer (9,345 / 12,073 with tools) is fine. The QA finding is notable — Session 103's "cache paid for itself" data must have been pre-Sonnet-4.6 or on Phase II-sized proposals. Didn't pad v2 — summarize-v3 (native PDF + caching) is the right path; PDF document blocks are always above the floor. `scripts/audit-system-prompt-sizes.js` left in place for future re-checks.
- **Connor sync on `docs/PDF_INPUT_FOR_BACKEND.md`** (`48dec12`): Q1 (Adobe PDF / Encodian) — licensed but **not required**; Anthropic handles PDF rendering. Q2 (PA HTTP body size) — tested to 75 MB, no tenant cap. Q3 (Files API beta header) — end-to-end verified via `scripts/test-files-api.js`; three HTTP calls (upload → reference → delete) all return 200 with `anthropic-beta: files-api-2025-04-14`. PA replication is a PA-config concern only from here. Q4 (multi-pass timing) — Connor's Phase 1 automation is single-request-sequential, caching gives little; future batch-analysis regime (one prompt × many historical files) is where caching + Batch API matter. Q5 (2048 floor) — informational only. New doc section "Future batch-analysis regime" captures the different economics.
- **`docs/RETROSPECTIVE_ANALYSIS_PLAN.md`** (`48dec12`): Division of labor — PA owns recurring single-request workflows; web apps own ad hoc retrospective analyses across historical cycles. Four capability gaps identified (historical-request picker, BYO-prompt batch app, Batch API integration, structured-results export) with recommended sequencing.
- **Dataverse sandbox access unlocked** (`93cbb74`): Justin got System Customizer in prod + Administrator in WM Keck Sandbox. App Registration ("WMK: Research Review App Suite") added as application user in the sandbox. `scripts/discover-dynamics-envs.js` lists envs via Global Discovery Service — both environments now visible. `scripts/probe-sandbox-schema-perms.js` confirms full schema CRUD (create/delete test entity with retry-with-backoff for Dataverse metadata-cache lag).
- **Fiscal-year format verified against production data** (`93cbb74`): `scripts/probe-fiscal-year-format.js` sampled 100 recent requests — `akoya_fiscalyear` uses **long format** (`"June 2026"`, `"December 2026"`), NOT the short codes (`J25`/`D26`) that staff sometimes use as shorthand. 100% of sampled requests have populated `wmkf_meetingdate`; every fiscal-year code maps to exactly one meeting month. Clean data.
- **`docs/POSTGRES_TO_DATAVERSE_MIGRATION.md`** (`93cbb74`): Rewritten across multiple rounds of decisions. Key calls: `wmkf_app_<table>` naming namespace; three-entity person model (`systemuser` for Keck staff, `contact` for external people, `wmkf_app_researcher` narrowed to bibliometric pool, no crossover); ORCID-on-contact is real (24% populated per schema annotation) — enables real match-on-promote + retroactive reconciliation; publications authorship becomes its own junction (`wmkf_app_publication_author`) — original 1:N was a modeling bug; expertise roster is single table with dual person-lookup (staff→systemuser, consultant/board→contact); grant cycles become net-new `wmkf_app_grant_cycle` keyed by fiscal-year string (there is no `akoya_grantcycle` entity in Dynamics today — my earlier assumption was wrong); ownership and visibility are orthogonal (all tables get org-level Read via security role; `wmkf_app_user_preference` is the single User-level-Read exception because it holds secrets); Plan B solution strategy (named unmanaged solution from day 1, scripted creation via Dataverse Web API, managed export for prod; no `pac` dependency). 27 tables categorized: 16 migrate to new `wmkf_app_*` tables, 2 merge into existing entities, 2 eliminate, 7 stay in Postgres. Wave 1 and Wave 2 fully specified; Wave 4 previewed.

**Files:** `docs/POSTGRES_TO_DATAVERSE_MIGRATION.md` (new); `docs/RETROSPECTIVE_ANALYSIS_PLAN.md` (new); `docs/PROMPT_CACHING_PLAN.md`; `docs/PDF_INPUT_FOR_BACKEND.md`; `CLAUDE.md`; `scripts/audit-system-prompt-sizes.js` (new); `scripts/test-files-api.js` (new); `scripts/discover-dynamics-envs.js` (new); `scripts/probe-sandbox-schema-perms.js` (new); `scripts/probe-fiscal-year-format.js` (new).

---

## April 2026 — Spend Monitoring, Cache Bug Fix, PDF Input Research (Session 105)

Shipped M7 (observability-only credit monitoring), fixed a month-long silent cache-token-capture bug in dynamics-explorer, added a generic `updateIfEmpty` helper, and ran the v1-vs-v2 Phase I prompt comparison that turned into a deeper investigation of native PDF input as the path forward for backend processing.

- **M7 spend monitoring** (`04ce74a`): "Today's Spend" tile on `/admin` (total + top 3 apps + top 3 users), hourly `/api/cron/spend-check`, low-balance email via `DynamicsService.createAndSendEmail` (gated on anchor env vars), `scripts/update-balance-anchor.sh` for top-up syncing. `stats.js` now relabels `user_profile_id IS NULL` as `Backend`. Six new env vars deployed across Production/Preview/Development.
- **Dynamics-explorer cache fix** (`5d53a32`): `parseClaudeStream` was reading `input_tokens` from `message_start.message.usage` but skipping `cache_creation_input_tokens` and `cache_read_input_tokens` on the same object. 90 calls over 30 days, 0 cache hits recorded despite `cache_control` being sent. Two-line fix; verified live with an 11-call session showing cache_create=11784 then cache_read ~12K across 10 follow-ups. Non-streaming path was already correct.
- **`DynamicsService.updateIfEmpty()` helper** (`58b77b7`): Composes read + empty-check + ETag-guarded PATCH for AI-writeback fields; returns discriminated `{ ok, reason }` result. `summarize.js` intentionally not migrated — its pre-flight-before-Claude pattern saves token spend on conflict.
- **Phase I v1 vs v2 + PDF input research** (`3653f42`): Built test-discovery + comparison harness against 8 May 2025 Phase I proposals (Stanford, Hopkins, Harvard, Mayo, St. Jude, etc.). v1 vs v2 outputs roughly comparable in length and cost. THE bigger find: native PDF document-block input costs ~3× per call ($0.13 vs $0.05 on SUNY 1001507) but absolute delta is $13/year at our volume. PDF caching with `cache_control` on the document block confirmed: **90% cost reduction and 3× latency reduction** on warm calls. For the 3-stage pipeline plan (fit screen → brief → panel), 1 cold + 2 warm calls drops per-proposal cost from $0.39 → $0.20 and total latency from ~120s → ~60s. **`docs/PDF_INPUT_FOR_BACKEND.md`** written as a Connor-facing brief with the measurements, recommended PA flow, Anthropic API constraints (32 MB request, 600 pages), and Files API guidance for multi-pass workflows.
- **Side observation worth filing**: our existing v2 endpoint puts `cache_control` only on the system block and got 0 cache hits across 8 sequential calls. Our PDF cache test shows the cache fires reliably when `cache_control` is on the document block too. v2 caching deserves a follow-up diagnosis.
- **Process correction**: I initially conflated "Concepts" stage submissions (Dec 2025) with Phase I proposals (Apr 2026), feeding 5 concept PDFs through the Phase I prompt before the user caught it. New memory `feedback_concepts_vs_phase_i.md` captures the distinction.
- **Doc clarifications for Connor** (in `04ce74a`): Expanded `wmkf_prompt_template` schema in `docs/CONNOR_QUESTIONS_2026-04-15.md` with per-field backend-use explanations and a runtime-flow block. Split `wmkf_body` into `wmkf_system_prompt` + `wmkf_user_prompt` to match Claude API + enable caching.

**Files:** `docs/PDF_INPUT_FOR_BACKEND.md` (new); `docs/CONNOR_QUESTIONS_2026-04-15.md`; `pages/admin.js`; `pages/api/admin/stats.js`; `pages/api/cron/spend-check.js` (new); `pages/api/dynamics-explorer/chat.js`; `lib/services/dynamics-service.js`; `vercel.json`; `CLAUDE.md`; `scripts/update-balance-anchor.sh` (new); 7 new investigation scripts under `scripts/` (find-2025-phase-i, find-research-test-cases, find-phase-i-test-cases, list-all-pdfs-for-candidates, compare-phase-i-v1-v2, test-suny-pdf-native, test-suny-pdf-cache, inspect-suny-pdf).

---

## April 2026 — Security Delta Audit + Hardening Pass (Session 104)

First comprehensive security review since the v3.5 baseline (2026-03-11). Three parallel Explore agents audited the new surface area (~25 commits, 4 new apps, Dynamics writeback, PromptResolver). Consolidated findings into `docs/SECURITY_AUDIT_2026-04-18.md`; fixed everything that did not need product or policy input.

- **PromptResolver `.js` fallback** (`06db9a0`): On Dynamics fetch failure the resolver now loads a bundled module (60s cache TTL) instead of throwing. `PROMPT_RESOLVER_STRICT=true` restores loud-failure behavior for prompt-dev. Extracted the Phase I v2 prompt to `shared/config/prompts/phase-i-dynamics.js` as a single source of truth shared with `seed-phase-i-prompt.js`.
- **First-pass fixes** (`c1554c1`): H1 download proxy now requires `requestId` and validates the folder's `{num}_{GUID32}` suffix matches it — prevents arbitrary non-request SharePoint downloads. H2 stopped leaking raw Dynamics error bodies in response fields (four endpoints). M1 added ETag / If-Match optimistic concurrency to `DynamicsService.updateRecord`, closing the TOCTOU on `wmkf_ai_summary` writeback. M2 `auditLogCreated` surfaced in responses. M5 Gemini key moved from URL query to `x-goog-api-key` header. M6 verified no-op, added invariant comment.
- **Second-pass hardening** (`5d86f25`): M3 new `DynamicsService.bypassRestrictions(requestId)` method; migrated 14 call sites from the ambiguous `setRestrictions([])` pattern. M8 `validatePath` decodes before the traversal check. M9 `listFiles` totalTimeoutMs wall-clock deadline. L2 `loadFile` allowlists `ref.source`. I5 `file-loader.js` rejects >50 MB buffers and races `pdf-parse` / `mammoth` against a 30 s timeout via new `withTimeout` helper. I7 `SHAREPOINT_SITE_URL` validated against `ALLOWED_SHAREPOINT_HOSTS`.
- **I3 closed** (`d6ac70f`): `wmkf_ai_run.rawOutput` retention accepted-as-is; IT-governed security profile + no PII in content set.
- **Deferred** (need input or external dependency): M4 prompt-editor governance (Connor), M7 per-user cost caps (scoped out in `project_api_credit_monitoring.md` memo — observability-only, email alerts via Dynamics `createAndSendEmail`), L1 roster CRUD superuser (product), I1 overwrite flag role gating (identity reconciliation), I4 / I6 (cleanup-level).

**Files:** `docs/SECURITY_AUDIT_2026-04-18.md` (new); `lib/services/{dynamics-service,graph-service,prompt-resolver,multi-llm-service}.js`; `lib/utils/file-loader.js`; `pages/api/dynamics-explorer/{download-document,chat}.js`; `pages/api/phase-i-dynamics/{summarize,summarize-v2}.js`; `pages/api/grant-reporting/lookup-grant.js`; `pages/api/virtual-review-panel.js`; `pages/phase-i-dynamics.js`; `shared/config/prompts/phase-i-dynamics.js` (new); 9 scripts migrated to `bypassRestrictions()`.

---

## April 2026 — Grant Reporting App + Multi-Library SharePoint Document Layer (Session 96)

Built the Grant Reporting app end-to-end and hardened the SharePoint document layer for both Grant Reporting and Dynamics Explorer.

- **Grant Reporting app**: Three-step wizard (Dynamics lookup → SharePoint document picker / upload fallback → editable form + Word export). Parallel `Promise.all` extraction calls — `createGrantReportExtractionPrompt` (report only, temp 0.1) and `createGoalsAssessmentPrompt` (proposal vs report, temp 0.2). `compareProposalToReport()` factored as a pure helper for future PowerAutomate-triggered backend use. New `requireAppAccess` route guards on both endpoints; staff-only (not in `DEFAULT_APP_GRANTS`).
- **SharePoint multi-library + subfolder discovery**: Older grants migrated from a previous grants management system store files in `RequestArchive1/2/3` libraries that Dynamics doesn't track, often inside subfolders like `Final Report/` or `Year 1/`. Built `lib/utils/sharepoint-buckets.js` `getRequestSharePointBuckets()` to discover all plausible buckets via Dynamics-tracked locations + speculative archive probes. Added recursive listing to `GraphService.listFiles({ recursive: true })` with depth/breadth caps; filters out folders. Fixed a token-leak/404 in `downloadFile()` by preferring `@microsoft.graph.downloadUrl` over `redirect: 'follow'` against the bound endpoint.
- **`classifyFile()` heuristic**: Custom separator class `[\s_\-]` (since `\b` fails between alphanumerics and underscores); proposal signals win when both fire so "Project Narrative ... FINAL.docx" stays a proposal; Phase I files explicitly excluded.
- **Dynamics Explorer document tools**: `listDocuments` and `searchDocuments` rewritten to use the shared helper. Result shape now carries per-file `library`/`folder`/`subfolder` and a `libraries[]` summary; top-level `library`/`folder` removed. `searchDocuments` fans out KQL searches across all buckets in parallel and dedupes by id/webUrl. Front-end `DocumentLinks` shows location next to each file. Verified: 993879 went from 10 → 63 files, 993347 surfaces nested files correctly.

**Files:** `pages/grant-reporting.js`, `pages/api/grant-reporting/{lookup-grant,extract}.js`, `shared/config/prompts/grant-reporting.js`, `shared/utils/grant-report-word-export.js`, `lib/utils/sharepoint-buckets.js`, `lib/services/graph-service.js`, `pages/api/dynamics-explorer/chat.js`, `pages/dynamics-explorer.js`, `docs/DYNAMICS_EXPLORER_DOCUMENT_LISTING_PLAN.md`

---

## April 2026 — Virtual Review Panel: Devil's Advocate Pass + Progress Timers (Session 93)

Added adversarial "devil's advocate" review stage and improved progress feedback for long-running LLM calls.

- **Devil's Advocate pass**: Optional pipeline stage after structured review, before synthesis. One randomly-selected provider produces an adversarial review (primary concern, failure scenario, challenged assumptions, competitive weaknesses, skeptical verdict). Output labeled separately in synthesis — not averaged with balanced reviews. Red-tinted UI card, full sections in MD/DOCX exports.
- **Progress timers**: Per-provider elapsed timer (ticks every second on in-progress cards), overall elapsed timer in progress header, 15-second server-side heartbeat events during all LLM calls to keep SSE alive and populate event log.

**Files:** `shared/config/prompts/virtual-review-panel.js`, `lib/services/panel-review-service.js`, `pages/virtual-review-panel.js`, `pages/api/virtual-review-panel.js`

---

## March 2026 — Virtual Review Panel: Stage 0 Intelligence + Prompt Rebalancing (Session 91)

Major iteration on Virtual Review Panel based on CSO feedback and new architecture for literature-grounded reviews.

- **Prompt rebalancing**: Rewrote all prompts to balance critique with upside evaluation per Keck's risk-tolerant philosophy. Added rating calibration (use full range), proposal classifier (5 types), `keyUncertaintyResolution` field. Renamed `keyWeaknesses` → `keyConcerns`, added `keyStrengths` and `resolvableVsFundamental` to synthesis.
- **Stage 0 pre-review intelligence**: Optional pipeline — Haiku extracts search queries → parallel searches across PubMed/arXiv/bioRxiv/ChemRxiv/Google Scholar → Haiku collates → Perplexity synthesizes field landscape. Intelligence block injected into Stage 1/2 prompts. Gracefully degradable at each substage.
- **New service**: `LiteratureSearchService` wrapping existing academic database services with deduplication and normalization.
- **Bug fixes**: OpenAI silent timeouts (3-min Promise.race), event log disappearing after completion, JSON parse failures silently passing null, `resolvableVsFundamental` objects crashing React render.
- **Frontend**: Stage 0 toggle, intelligence progress display, all new/renamed fields in UI + Markdown + DOCX exports.

**Files:** `lib/services/literature-search-service.js` (new), `lib/services/panel-review-service.js`, `lib/services/multi-llm-service.js`, `shared/config/prompts/virtual-review-panel.js`, `pages/virtual-review-panel.js`, `pages/api/virtual-review-panel.js`

---

## March 2026 — Feedback Logging, Query Fixes, Request Number Backfill (Session 85)

Built a feedback logging system for Dynamics Explorer (thumbs up/down + auto-detection of failures), fixed export_csv and status field query failures, and backfilled Dynamics request numbers into the Postgres database.

- **Feedback system**: `dynamics_feedback` table, `FeedbackService`, `POST/GET/PATCH /api/dynamics-explorer/feedback`, thumbs up/down UI on chat messages, admin review section on dashboard, auto-detection of failure patterns, maintenance cleanup
- **Query fixes**: EXPORT rule (reuse prior query params), error passthrough to Claude (actual error instead of generic), STATUS FIELD DISAMBIGUATION (Phase II Pending → akoya_requeststatus not wmkf_phaseiistatus)
- **Request numbers**: V23a migration adds `request_number` column to `reviewer_suggestions` and `proposal_searches`. Backfill script matched 23 proposals (332 candidate rows) to Dynamics request numbers. Numbers now visible in Reviewer Finder My Candidates and Review Manager table.

**Files:** `lib/services/feedback-service.js`, `pages/api/dynamics-explorer/feedback.js`, `pages/api/dynamics-explorer/chat.js`, `shared/config/prompts/dynamics-explorer.js`, `scripts/backfill-request-numbers.js`, `pages/reviewer-finder.js`, `pages/review-manager.js`

---

## March 2026 — SharePoint Document Content Search (Session 83)

Added `search_documents` tool to Dynamics Explorer (10th tool). Full-text search within SharePoint document contents (PDFs, Word docs, etc.) via Microsoft Graph Search API with KQL.

- **GraphService.searchFiles()**: `POST /search/query` with KQL path scoping to akoyaGO site. Requires `region: 'US'` for app permissions. Post-filters to ALLOWED_LIBRARIES. Returns hit highlights with matching text snippets.
- **search_documents handler**: Resolves request_number to folder path via sharepointdocumentlocations. Sends `document_links` SSE events for download links.
- **download-document.js**: Authenticated proxy for streaming SharePoint files to browser (committed from prior session).
- **DocumentLinks component**: Frontend component rendering download links from SSE events (committed from prior session).

**Files:** `lib/services/graph-service.js`, `pages/api/dynamics-explorer/chat.js`, `pages/api/dynamics-explorer/download-document.js`, `pages/dynamics-explorer.js`, `shared/config/prompts/dynamics-explorer.js`

---

## March 2026 — Close Profile Directory Enumeration & Security Audit Docs (Session 82)

Closed the profile directory enumeration vulnerability using a multi-tool audit process (Gemini, Codex, Claude Code, human review). Produced comprehensive hardening summary for IT.

- **Profile endpoint scoping**: `GET /api/user-profiles` returns only caller's own profile by default. Full directory via `?all=true` (superuser only). Cross-user `?id=X` lookups return 403. All methods use `requireAuthWithProfile`. Dev mode falls back to all profiles for compatibility.
- **Admin dashboard**: Role management fetch updated to `?all=true`.
- **Security hardening summary**: `docs/SECURITY_HARDENING_SUMMARY_2026-03-10.md` — covers all code changes, audit process, remaining organizational decisions, and three-track path forward for IT.
- **Security audit docs committed**: 12 previously untracked audit/response documents now in git for multi-Mac migration.

**Files:** `pages/api/user-profiles.js`, `pages/admin.js`, `docs/SECURITY_HARDENING_SUMMARY_2026-03-10.md`, `docs/SECURITY_AUDIT_RESPONSE_GEMINI.md`, `docs/SECURITY_AUDIT_RESPONSE_CODEX.md`

---

## March 2026 — Q&A Prompt Caching & Output Fixes (Session 73)

Implemented prompt caching, fixed truncated writeups, and improved Q&A UX.

- **Prompt caching**: System prompt in `/api/qa` now uses `cache_control: { type: 'ephemeral' }` so the large proposal context (~20K tokens) is cached across turns. Cache token metrics extracted from streaming response and logged to `api_usage_log` with correct pricing (1.25x write, 0.1x read). V21 migration adds `cache_creation_tokens` and `cache_read_tokens` columns.
- **Fixed truncated writeups**: `DEFAULT_MAX_TOKENS` was 2000, far too low for the two-part writeup format. Increased to 16384 (model output limit). Affects all summarization endpoints.
- **Q&A markdown rendering**: Added `renderMarkdown()` with DOMPurify sanitization for assistant responses (headers, bold, italic, lists, code, horizontal rules). User messages remain plain text.
- **Q&A conversation persistence**: Closing and reopening the side panel for the same file preserves the conversation. Only resets when switching files.
- **Admin stats**: Summary query now includes `total_cache_creation_tokens` and `total_cache_read_tokens` for monitoring cache effectiveness.

**Files:** `pages/api/qa.js`, `lib/utils/usage-logger.js`, `scripts/setup-database.js`, `pages/api/admin/stats.js`, `pages/proposal-summarizer.js`, `shared/config/baseConfig.js`

---

## March 2026 — Streaming Q&A Chat with Web Search (Session 72)

Upgraded the Proposal Summarizer Q&A from isolated single-question requests to a full streaming multi-turn chat with web search and a side panel UI.

- **Streaming Q&A endpoint**: Rewrote `/api/qa` as SSE streaming endpoint. Full conversation history, system prompt with proposal text (80K chars) + summary, conversation trimming (last 6 messages), 4096 max_tokens, retry on 429.
- **Web search with dynamic filtering**: `web_search_20260209` tool with code_execution auto-injected for dynamic result filtering. Source URLs extracted from streaming blocks and rendered as clickable citation links. Note: `web_search_20260209` auto-injects code_execution — do NOT add it explicitly or you get a 400 error.
- **Side panel UI**: Replaced centered modal with a 520px right-side slide-in panel. Writeup content stays visible underneath. Streaming text with pulsing cursor, dynamic thinking indicators, auto-scroll, AbortController for cancellation.
- **Prompt improvements**: Removed all em dashes from prompt templates to reduce Claude's em dash usage in output. Existing "minimize em dashes" instruction kept; the fix was removing the examples Claude was mirroring.
- **Extraction fixes**: Strip markdown code fences before JSON.parse (most common cause of fallback triggering). Expanded fallback keyword stop list from 12 to ~80 words. State postal abbreviations in city_state field. Extracted Data section collapsed by default.

**Files:** `pages/api/qa.js`, `pages/api/process.js`, `pages/proposal-summarizer.js`, `shared/config/prompts/proposal-summarizer.js`, `shared/components/ResultsDisplay.js`, `tailwind.config.js`

---

## March 2026 — OWASP ZAP Security Scan & Remediation (Session 71)

Performed an OWASP ZAP automated security scan (v2.17.0) against the application in development mode. The scan identified 17 unique alert types across 6 Medium, 4 Low, and 7 Informational findings. No High-risk vulnerabilities were found.

- **X-Powered-By header suppressed**: Added `poweredByHeader: false` to `next.config.js` to prevent `X-Powered-By: Next.js` information disclosure. This was the only actionable finding.
- **CSP warnings (5 Medium)**: All are development-mode artifacts — `unsafe-inline` and `unsafe-eval` required by Next.js HMR/Fast Refresh. Production deployments on Vercel use stricter nonce-based policies automatically.
- **Directory browsing (1 Medium, false positive)**: ZAP flagged `/_next/static/` directory structure, which is standard Next.js public asset serving.
- **HSTS missing (false positive)**: HSTS is configured; alert triggered because ZAP scanned `http://localhost` which doesn't support HTTPS.
- **X-Content-Type-Options missing (9 Low instances)**: Already configured in `next.config.js`; development-mode static assets may not receive the header. Vercel adds it automatically in production.
- **Informational findings (68 suspicious comments, timestamps, etc.)**: Normal development artifacts, no action required.

**Scan metadata:** OWASP ZAP 2.17.0, target `http://localhost:3000`, automated quick start scan, March 2, 2026.

**Files:** `next.config.js`, `docs/SECURITY_ARCHITECTURE.md`

---

## March 2026 — Word Template Export & Silent Truncation Fix (Session 70)

Implemented Phase II Word template export for Proposal Summarizer and fixed a critical silent text truncation bug affecting all PDF-processing apps.

- **Word template export**: `shared/utils/word-export.js` generates .docx files matching the Keck Phase II writeup template (Times New Roman, correct margins/tabs/spacing, page headers with PI/institution/title, page numbers). Export modal in `pages/proposal-summarizer.js` with editable AI-extracted fields and internal fields (Program Type, amounts, Staff Lead). Added Word button to `ResultsDisplay.js`.
- **Prompt restructure**: Two-part output — Part 1 (grade 13 audience summary page with Executive Summary, Impact, Methodology Overview, Personnel Overview, Rationale for Keck Funding) and Part 2 (technical detailed writeup with Background & Impact, Methodology, Personnel). `parseSections()` splits markdown into named sections for Word generation.
- **Silent truncation fix**: All prompt templates were truncating PDF text to 6K-15K characters, silently dropping personnel sections, budgets, and methodology details that appear later in proposals. Increased all limits to 100K characters across 6 prompt files, Q&A endpoint, and common.js TEXT_LIMITS. Affected: Proposal Summarizer, Phase I Summaries, Phase I Writeup, Reviewer Finder, Funding Gap Analyzer, Q&A.
- **PI name cross-reference**: `crossReferenceWithSummary()` in `process.js` extracts `<u>`-tagged names from the summary to fix incorrect PI names in structured extraction.
- **User-friendly API errors**: `getApiErrorMessage()` translates HTTP status codes (429 rate limit, 529/503 overloaded, 401 auth, 400 context length) into clear user-facing messages instead of generic "Failed to generate summary."
- **Legacy fallback**: Current implementation preserved as `proposal-summarizer-legacy.js`, `process-legacy.js`, and legacy prompts file.

**Files:** `shared/utils/word-export.js` (new), `shared/config/prompts/proposal-summarizer.js`, `pages/proposal-summarizer.js`, `pages/api/process.js`, `shared/components/ResultsDisplay.js`, `shared/config/prompts/common.js`, 5 other prompt files, `pages/api/qa.js`

---

## February 2026 — ErrorAlert, Crawler Prevention, Analytics & Dependency Cleanup (Session 69)

Security hardening and infrastructure cleanup session.

- **Shared ErrorAlert component**: `shared/components/ErrorAlert.js` — pattern-matches errors into 12 categories with user-friendly messages, timestamps, reference codes, and collapsible raw details. Validation messages get amber styling. Replaced 11 identical inline error blocks across all app pages.
- **Bot/crawler prevention**: `public/robots.txt` (disallow all), `X-Robots-Tag` header (noindex/nofollow/noarchive), `<meta name="robots">` tag in `_app.js`.
- **Vercel Web Analytics**: Added `@vercel/analytics` package and `<Analytics />` component, CSP updated for `vercel-insights.com`.
- **Dependency cleanup**: Removed unused `eslint`/`eslint-config-next` (resolved all 3 npm audit vulnerabilities), removed deprecated `swcMinify` config, committed missing `dompurify` dependency.
- **Dependabot**: `.github/dependabot.yml` for weekly npm dependency checks.
- **IT security response**: Drafted architecture documentation for IT review of Dynamics Explorer data flow.

**Files:** `shared/components/ErrorAlert.js`, `public/robots.txt`, `next.config.js`, `pages/_app.js`, `.github/dependabot.yml`, `package.json`, 11 app pages

---

## February 2026 — Security Remediation & Cron Fix (Session 67)

Implemented 4 security findings from SECURITY_ARCHITECTURE.md and fixed a production bug where all Vercel cron jobs were silently failing.

- **CSRF origin validation**: `validateOrigin()` in `lib/utils/auth.js` — checks `Origin`/`Referer` against `NEXTAUTH_URL` for state-changing methods. Called in `requireAuth()` and `requireAppAccess()`.
- **Session revocation**: `is_active` check added to `requireAppAccess()` (parallel query, cached) and `requireAuthWithProfile()` (direct query). Disabled accounts blocked before superuser bypass.
- **Dynamics denial logging**: V20 migration adds `was_denied`/`denial_reason` to `dynamics_query_log`. Restriction violations now persisted to audit table.
- **Orphan record cleanup**: `scripts/assign-orphan-records.js` for legacy NULL `user_profile_id` rows.
- **Cron middleware fix**: Edge middleware was intercepting `/api/cron/*` requests (JWT check on CRON_SECRET-authenticated requests). Added `api/cron` to matcher exclusions. All 4 crons were silently failing in production.
- **SECURITY_ARCHITECTURE.md v3.2**: Fixed maxAge (30d→7d), added M8/M9 as REMEDIATED, updated L8/L9 to REMEDIATED, documented cron exclusion.

**Files:** `lib/utils/auth.js`, `middleware.js`, `pages/api/dynamics-explorer/chat.js`, `scripts/setup-database.js`, `scripts/assign-orphan-records.js`, `scripts/README.md`, `docs/SECURITY_ARCHITECTURE.md`

---

## February 2026 — Error Message Hardening & Security Doc Regeneration (Session 64)

Fixed internal error message leakage and regenerated the security architecture document.

- **Error message leakage fix**: Patched ~19 unguarded catch blocks across 8 API files that returned `error.message` directly to clients. Inner helpers now return generic messages; health endpoint errors guarded with `NODE_ENV === 'development'`. Full errors preserved in server-side `console.error()` logs.
- **Security Architecture v3.0**: Complete rewrite of `docs/SECURITY_ARCHITECTURE.md` to match current codebase — 14 apps, three-layer auth model, 18 database tables, app-level access control, corrected CSP/headers, renumbered findings.

**Files:** `pages/api/evaluate-concepts.js`, `pages/api/evaluate-multi-perspective.js`, `pages/api/dynamics-explorer/chat.js`, `pages/api/reviewer-finder/generate-emails.js`, `pages/api/process.js`, `pages/api/process-phase-i.js`, `pages/api/process-phase-i-writeup.js`, `pages/api/health.js`, `docs/SECURITY_ARCHITECTURE.md`

---

## February 2026 — API-Level App Access Enforcement (Session 63)

Added server-side enforcement of app access control to all ~30 app-specific API endpoints. Previously, access control was UI-only — `RequireAppAccess` blocked page navigation and `Layout.js` hid nav links, but API endpoints had no checks. Any authenticated user could call any API directly.

- **`requireAppAccess(req, res, ...appKeys)`** in `lib/utils/auth.js`: Combines auth check + app access verification in one call. Variadic app keys with OR logic, in-memory cache (2-min TTL), parallel DB queries, superuser bypass, dev-mode bypass. Returns `{ profileId, session }` or sends 401/403.
- **Cache invalidation**: `clearAppAccessCache(profileId)` called in `pages/api/app-access.js` after admin grant/revoke operations.
- **29 endpoint updates**: All app-specific endpoints now call `requireAppAccess` with the correct app key(s). Multi-key endpoints (`process.js`, `qa.js`, `refine.js`) accept either `proposal-summarizer` or `batch-proposal-summaries`. Infrastructure endpoints (auth, admin, health, upload) unchanged.

**Files:** `lib/utils/auth.js`, `pages/api/app-access.js`, plus 29 app-specific API endpoint files.

---

## February 2026 — Auth Hardening & Security Audit (Session 62)

Comprehensive security hardening in response to IT security review. Added server-side authentication gate, removed attack surface, and fixed critical authorization vulnerabilities.

- **Next.js middleware auth gate** (`middleware.js`): Validates JWT via `withAuth`/`jose` (Edge Runtime compatible) before serving any page content or JS bundles. Unauthenticated users redirected to `/auth/signin` with no app structure exposed.
- **CORS wildcard removal**: Removed `Access-Control-Allow-Origin: *` from `next.config.js` global headers and 10 inline SSE streaming endpoints. Prevents cross-site request forgery against authenticated sessions.
- **Security headers**: Added `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` to all responses.
- **AppAccessContext deny-by-default**: `hasAccess()` returns `false` while loading (was `true`); errors set `allowedApps` to `[]` instead of falling through to allow-all.
- **Stripped debug info**: `/api/auth/status` now returns only `{ enabled }` — removed `debug: { authRequired, hasCredentials }`.
- **Fixed horizontal privilege escalation** in 4 endpoints: `user-preferences`, `user-profiles`, `my-candidates`, `integrity-screener/history` — all now derive `profileId` from the authenticated session instead of trusting user-supplied parameters.
- **Adversarial security audit**: Systematic review of middleware bypass vectors, SSRF, SQL injection, CORS, authorization, dependencies, cryptography. No critical issues remaining after fixes.

**Files:** `middleware.js`, `next.config.js`, `pages/api/auth/status.js`, `shared/context/AppAccessContext.js`, `pages/api/user-preferences.js`, `pages/api/user-profiles.js`, `pages/api/reviewer-finder/my-candidates.js`, `pages/api/integrity-screener/history.js`, plus CORS removal in 10 SSE streaming endpoints.

---

## February 2026 — Documentation & User Guide (Session 61)

Created comprehensive user-facing documentation and an in-app `/guide` page.

- **6 standalone Markdown guides** in `docs/guides/`: Getting Started, Reviewer Finder, Review Manager, Integrity Screener, Dynamics Explorer, Admin Guide
- **In-app guide page** (`pages/guide.js`): sidebar TOC on desktop, floating button on mobile, hash-based anchor navigation, access-filtered sections, admin-only section for superusers
- **HelpButton component**: `?` icon added to 4 complex app page headers, links to `/guide#appKey`
- **Navigation integration**: Guide link in nav ribbon, Layout footer, home page header/footer, WelcomeModal

**Files:** `docs/guides/*.md`, `pages/guide.js`, `shared/config/guideContent.js`, `shared/components/HelpButton.js`, `shared/components/Layout.js`, `pages/index.js`, `shared/components/WelcomeModal.js`

---

## February 2026 — Round-Efficiency Optimizations & Test Suite (Session 56)

Optimized Dynamics Explorer to resolve common queries in fewer tool-call rounds and built an integration test suite to verify.

- **Vocabulary glossary**: System prompt now maps common terms (PI, award amount, Phase I status) to correct CRM fields, reducing exploratory tool calls
- **Hardcoded program GUIDs**: MR, S&E, SoCal, NorCal GUIDs embedded in system prompt — model filters directly without querying lookup tables
- **Expanded get_entity select**: Request lookups now return `_wmkf_projectleader_value`, `akoya_grant`, `wmkf_phaseistatus`, and 20+ other fields in one call
- **Inline wmkf_grantprogram schema**: Added to TABLE_ANNOTATIONS to eliminate `describe_table` calls for program lookups
- **Round-efficiency test suite**: `scripts/test-dynamics-rounds.js` — 6 integration tests against live dev server, SSE stream parsing, pass/fail per query with round counts. All 6 passed (most in 2 rounds, max budget 3)

**Files:** `shared/config/prompts/dynamics-explorer.js`, `scripts/test-dynamics-rounds.js`

---

## February 2026 — AI-Powered Exports & Staff Lookups (Session 55)

Added Excel export with AI-powered data processing and fixed program director lookup accuracy in Dynamics Explorer.

- **Excel export**: `export_csv` tool generates .xlsx files from CRM queries with auto-width columns, delivered via `file_ready` SSE event
- **AI data processing**: Two-phase flow — estimate mode (count + sample + cost) → user confirmation → batch execution (15 records/call, 3 concurrent). AI results added as `ai_*` columns (displayed as "AI: ColumnName" in Excel)
- **countRecords fix**: `/$count` endpoint fails with complex OData filters (Edm.Int32 error). Replaced with `queryRecords` using `$count=true` parameter
- **systemuser entity**: Added to TABLE_ANNOTATIONS with staff lookup support. Model now correctly queries `systemusers` for GUIDs before filtering `akoya_requests` by `_wmkf_programdirector_value`, fixing incorrect program director exports

**Files:** `pages/api/dynamics-explorer/chat.js`, `shared/config/prompts/dynamics-explorer.js`, `pages/dynamics-explorer.js`, `lib/utils/usage-logger.js`

---

## February 2026 — Dynamics Explorer Performance Optimization (Session 54)

Optimized the Dynamics Explorer chat interface for speed and diagnosed a query accuracy bug.

- **Inline schemas**: Top 4 table schemas (akoya_request, account, contact, akoya_requestpayment) embedded in system prompt, eliminating 1 Claude API round-trip for ~80% of queries
- **Parallel execution**: DB queries via `Promise.all()`, multiple tool_use blocks via `Promise.allSettled()`
- **Streaming**: Claude API uses `stream: true`; final text responses forwarded as `text_delta` SSE events for near-zero perceived latency
- **Frontend memoization**: `React.memo` on MessageBubble, `useMemo`/`useCallback` for expensive operations, stable message keys
- **Bug diagnosed**: Model confuses two program lookup fields (`wmkf_grantprogram` with 11 values vs `akoya_program` with 24 values), causing wrong query results. Needs CRM expert input to clarify field semantics before annotation fix.

**Files:** `shared/config/prompts/dynamics-explorer.js`, `pages/api/dynamics-explorer/chat.js`, `pages/dynamics-explorer.js`

---

## February 2026 — App-Level Access Control (Session 53)

Implemented per-user app access control across all 13 apps. New users only get Dynamics Explorer by default with a welcome modal; superusers manage grants from the admin dashboard.

- **V16 migration**: `user_app_access` table with `(user_profile_id, app_key)` unique constraint
- **App registry**: `shared/config/appRegistry.js` — single source of truth for all app definitions (replaced duplicate arrays in Layout.js and index.js)
- **Access flow**: `AppAccessContext` fetches grants → Layout/home page filter by `hasAccess()` → `RequireAppAccess` guard blocks direct URL access
- **New user onboarding**: NextAuth auto-grants `dynamics-explorer`, `WelcomeModal` directs to email admin for more access
- **Admin UI**: Checkbox grid (users x apps) with local edit tracking, amber highlights, save/discard
- **Backfill**: All 7 existing users granted all 13 apps (91 grants)
- **Deferred**: Automated email notifications for new users (requires Azure Mail.Send permission)

**Files:** `shared/config/appRegistry.js`, `shared/context/AppAccessContext.js`, `shared/components/RequireAppAccess.js`, `shared/components/WelcomeModal.js`, `pages/api/app-access.js`, `pages/admin.js`, `pages/api/auth/[...nextauth].js`, all 13 app pages

---

## February 2026 — Dynamics Explorer Architecture Redesign (Sessions 51-52)

Redesigned the Dynamics Explorer from an OData-centric architecture (9 tools, ~3000 token system prompt) to a search-first architecture (7 tools, ~800 token prompt). Key changes:

- **New tool set**: `search`, `get_entity`, `get_related`, `describe_table`, `query_records`, `count_records`, `find_reports_due`. Removed 5 old tools, added 3 new ones.
- **`get_entity`**: Finds accounts by name, abbreviation, or Dataverse Search (handles "Stanford", "UCLA", "USC" → correct institutions). Runs OData + Search in parallel with exact-match tiebreaker.
- **`get_related`**: 11 server-side relationship paths replacing individual composite tools. Handles account→requests/emails/payments/reports, request→payments/reports/emails/annotations/reviewers, contact→requests, reviewer→requests.
- **`describe_table`**: On-demand field metadata from `TABLE_ANNOTATIONS` (17 tables). Replaces hardcoded schema in system prompt.
- **Account name resolution**: Triple-field search (name + akoya_aka + wmkf_dc_aka), Dataverse Search fallback for abbreviations, ambiguity handling when multiple accounts match.

**Files:** `pages/api/dynamics-explorer/chat.js`, `shared/config/prompts/dynamics-explorer.js`, `lib/services/dynamics-service.js`

---

## February 2026 — Dynamics Explorer (Sessions 47-48)

Built a natural-language chatbot for querying the Keck Foundation's Microsoft Dynamics 365 CRM. Uses an agentic tool-use loop: user asks a question → Claude picks tools (query_records, find_emails_for_account, etc.) → server executes against the Dynamics API → results fed back → Claude responds or calls more tools.

**Key architecture decisions:**
- Server-side composite tools for complex multi-step queries (email lookups across account → requests → emails) rather than relying on Claude to chain OData queries
- Hardcoded schema of populated fields in the system prompt (from `scripts/dynamics-schema-map.js` introspection)
- Haiku 4.5 model for higher rate limits (Sonnet 4 hit 30k token/min limit, Haiku 3.5 couldn't handle tool-use)
- Token optimization: conversation compaction between agentic rounds, compact text results instead of raw JSON, HTML stripping for email bodies

**Files:** `pages/dynamics-explorer.js`, `pages/api/dynamics-explorer/chat.js`, `lib/services/dynamics-service.js`, `shared/config/prompts/dynamics-explorer.js`

---

# Legacy chronological session log (pre-2026-03-12, deprecated format)

Everything below is the original session-by-session log from before the milestone-log format was adopted. It's preserved verbatim for archaeology. **Do not add new entries below this point** — milestones go above.

---

## September 2025 - Frontend-Backend Data Structure Consistency Audit

**Problem Identified:**
After implementing Vercel Blob storage, the backend was processing files correctly but the frontend wasn't displaying results. Through systematic debugging, identified a critical data structure mismatch between frontend and backend components.

**Root Cause:**
The backend APIs were returning `{formatted, structured}` but various frontend components expected different property names like `{summary, structuredData}`. This inconsistency prevented results from displaying despite successful processing.

**Comprehensive Solution:**
Conducted a systematic audit of all applications to ensure frontend-backend consistency:

### Files Audited and Fixed:

1. **find-reviewers.js** (`pages/find-reviewers.js:118`)
   - **Issue**: Used `structuredData:` instead of `structured:`
   - **Fix**: `structuredData: data.extractedInfo || {}` → `structured: data.extractedInfo || {}`

2. **peer-review-summarizer.js** (`pages/peer-review-summarizer.js`)
   - **Issues**: Multiple references to old data structure properties
   - **Fixes Applied**:
     - Line 116: `results.summary` → `results.formatted`
     - Line 119: `results.questions` → `results.structured?.questions`
     - Line 258: `results.summary` → `results.formatted`
     - Line 264: `results.questions` → `results.structured?.questions`
     - Line 270: `results.questions` → `results.structured.questions`

3. **document-analyzer.js** (`pages/document-analyzer.js`)
   - **Issue**: Refinement state update using wrong property
   - **Fix**: `summary: data.refinedSummary` → `formatted: data.refinedSummary`

4. **batch-proposal-summaries.js** (`pages/batch-proposal-summaries.js`)
   - **Issues**: Multiple summary property references
   - **Fixes**: All `result.summary` references → `result.formatted`

5. **shared/components/ResultsDisplay.js**
   - **Issues**: Inconsistent property names throughout shared component
   - **Fixes**: Standardized all references:
     - `result.summary` → `result.formatted`
     - `result.structuredData` → `result.structured`

6. **proposal-summarizer.js** (`pages/proposal-summarizer.js`)
   - **Issues**: Q&A and refinement context using wrong properties
   - **Fixes**: Updated context references to use `result.formatted`

### API Endpoints Verified:

- **`/api/process`**: Returns `{formatted, structured}` ✅
- **`/api/find-reviewers`**: Returns `{extractedInfo, reviewers, csvData, parsedReviewers, metadata}` ✅
- **`/api/refine`**: Returns `{refinedSummary, timestamp}` ✅
- **`/api/qa`**: Returns `{answer, timestamp}` ✅

### Standardized Data Structure:

All applications now use consistent data structure pattern:
- **`result.formatted`** - Main content/summary text
- **`result.structured`** - Extracted structured data objects
- **`result.metadata`** - File processing metadata
- **`result.csvData`** - CSV export data (reviewers app only)

### Commits Made:

1. **Commit a9ca806**: "Fix frontend-backend data structure consistency across all applications"
   - 6 files changed, 45 insertions(+), 27 deletions(-)
   - Core data structure consistency fixes

2. **Commit 5cb022d**: "Improve Vercel Blob upload handling and streaming response reliability"
   - 3 files changed, 20 insertions(+), 2 deletions(-)
   - Enhanced CORS headers, upload logging, and streaming improvements

**Result:**
Frontend-backend communication is now seamless across all applications. Each app correctly expects and receives the data structure that its corresponding API endpoint provides. The issue was systemic but localized to property naming conventions, not the underlying data flow architecture.

**Testing Required:**
All applications should now display results correctly after file processing. The data flow pattern is: File Upload → Vercel Blob Storage → Claude API Processing → Standardized Data Structure → ResultsDisplay Component.

---

## September 21, 2025 - Dropdown Parameter Integration

**Problem Identified:**
The batch-proposal-summaries app had dropdown menus for Summary Length (1-5 pages) and Technical Level (general-audience to academic), but these values were being sent to the API and completely ignored. The Claude prompts were static and didn't use the user's configuration choices.

**Root Cause:**
The API endpoint `/pages/api/process.js` was only extracting `files` and `apiKey` from the request body, ignoring `summaryLength` and `summaryLevel`. The `PROMPTS.SUMMARIZATION` function was static and didn't accept parameters.

**Solution Implemented:**
1. **API Parameter Extraction** (`pages/api/process.js:11`):
   - Added extraction: `const { files, apiKey, summaryLength = 2, summaryLevel = 'technical-non-expert' } = req.body;`
   - Added debugging logs to track parameter values
   - Updated `generateSummary()` function call to pass parameters

2. **Function Signature Update** (`pages/api/process.js:96`):
   - Modified `generateSummary(text, filename, apiKey, summaryLength, summaryLevel)`
   - Updated prompt generation to use dynamic parameters

3. **Enhanced Claude Prompt** (`lib/config.js:24`):
   - Converted `PROMPTS.SUMMARIZATION` to accept `(text, summaryLength, summaryLevel)` parameters
   - Added length requirements: 1-5 pages, ~500 words per page
   - Added audience-specific language instructions:
     - **General Audience**: Avoids technical jargon, explains concepts accessibly
     - **Technical Non-Expert**: Uses some technical terms with clear explanations
     - **Technical Expert**: Uses field-specific terminology, assumes domain knowledge
     - **Academic**: Uses precise scientific language and detailed methodology

**Result:**
Dropdown selections now properly customize Claude's responses. Users can select summary length and technical level, and Claude will generate summaries according to those specifications.

**Data Flow (Fixed):**
Frontend Dropdowns → POST Request Body → API Parameter Extraction → generateSummary() → Dynamic Claude Prompt → Customized Summary

### Commit Made:
- **Commit e029e0c**: "Implement dropdown parameter integration for batch proposal summaries"
  - 2 files changed, 23 insertions(+), 6 deletions(-)
  - Fixed missing functionality where dropdown selections were ignored

---

## November 7, 2025 - Federal Funding Gap Analyzer

**Feature Implemented:**
A comprehensive federal funding analysis tool that queries the NSF API for real-time award data and uses Claude to analyze the broader federal funding landscape (NIH, DOE, DOD).

**Implementation Details:**

**Files Created:**
1. `lib/fundingApis.js` - NSF API query utilities
   - `queryNSFforPI()` - Queries PI and Co-PI awards with state filtering
   - `queryNSFforKeywords()` - Analyzes funding by research keywords
   - Helper functions for formatting and date handling

2. `pages/api/analyze-funding-gap.js` - Main API endpoint (Pattern B with shared handlers)
   - Multi-step processing pipeline per proposal
   - Streaming SSE responses for real-time progress
   - Token optimization to stay under Claude's 200K limit
   - Individual report generation (no batch summary)

3. `pages/funding-gap-analyzer.js` - Frontend page
   - Configuration options: Search years (3/5/10), Include Co-PIs checkbox
   - Collapsible cards for each proposal (Option B)
   - Individual download buttons with naming pattern
   - ZIP download for all reports (using JSZip)

**Files Modified:**
4. `lib/config.js` - Added 3 new prompts:
   - `FUNDING_EXTRACTION` - Extracts PI, institution, state, and keywords
   - `FUNDING_ANALYSIS` - Generates comprehensive funding analysis
   - `BATCH_FUNDING_SUMMARY` - (Created but not used in final implementation)

5. `shared/components/Layout.js` - Added navigation link

**Key Technical Decisions:**

1. **State-Based Institution Matching:**
   - Changed from institution name matching to state code filtering
   - More reliable for NSF API queries
   - Claude infers state from institution (e.g., "UC Berkeley" → "CA")

2. **Search ALL NSF Awards (Not Just Active):**
   - Provides complete funding history
   - Shows active vs. expired awards in analysis

3. **Co-PI Search (Enabled by Default):**
   - Queries both `pdPIName` and `coPDPIName` parameters
   - Deduplicates awards to avoid double-counting
   - Provides comprehensive view of researcher's NSF involvement

4. **Token Optimization:**
   - Extraction: Limited to 6,000 characters (first few pages only)
   - NSF data: Truncated to 10 PI awards + 5 per keyword
   - Prevents Claude API "prompt too long" errors

5. **Smart Fallback:**
   - First tries full PI name
   - Automatically falls back to last name if no results

6. **Individual Report Mode:**
   - Each proposal generates standalone markdown report
   - Filename pattern: `funding_analysis_[PI_name]_[original_filename]_[date].md`
   - No combined batch report (cleaner for sharing)

**Data Flow:**
```
User uploads PDFs → Vercel Blob → Extract text → Claude (PI/state/keywords) →
NSF API (real awards data) → Claude (NIH/DOE/DOD analysis) →
Individual markdown reports → Collapsible cards + ZIP download
```

**UI/UX Features:**
- Collapsible proposal cards (collapsed by default)
- Quick summary: PI, Institution, State, NSF funding, Keywords
- "View Full Report" button to expand
- Individual "Download" buttons per proposal
- "Download All as ZIP" button at top
- Summary stats card (proposals analyzed, years searched, reports generated)

**Dependencies Added:**
- `jszip@3.10.1` - For ZIP file creation client-side

**Result:**
Fully functional federal funding gap analyzer with NSF integration. Successfully tested with multiple UC proposals. State-based filtering significantly improved NSF award matching accuracy.

**Testing Notes:**
- Single proposal: ~1-2 minutes processing time
- Batch (3 proposals): ~5-7 minutes total
- NSF API rate limiting: 200ms delay between keyword queries
- Token limits: Resolved through data truncation strategy

---

## December 10, 2025 - Expert Reviewers Pro (Beta)

**Feature Implemented:**
A multi-source academic database search tool that finds expert reviewers by querying PubMed, ArXiv, BioRxiv, and Google Scholar.

**Architecture Overview:**

```
Proposal PDF → Vercel Blob → Claude (metadata extraction) →
Multi-source search (PubMed, ArXiv, BioRxiv, Scholar) →
Deduplication → COI filtering → Relevance ranking →
Reviewer candidates with h-index and publications
```

**Files Created:**

1. **Database Schema & Migration:**
   - `lib/db/schema.sql` - 5 tables: search_cache, researchers, publications, researcher_keywords, reviewer_suggestions
   - `scripts/setup-database.js` - Migration script for Vercel Postgres

2. **Service Classes:**
   - `lib/services/database-service.js` - Caching, researcher CRUD, suggestion tracking
   - `lib/services/pubmed-service.js` - NCBI E-utilities API integration
   - `lib/services/arxiv-service.js` - ArXiv Atom feed API
   - `lib/services/biorxiv-service.js` - BioRxiv API with client-side filtering
   - `lib/services/scholar-service.js` - Google Scholar via SerpAPI
   - `lib/services/deduplication-service.js` - Name matching, COI filtering, ranking

3. **API & Frontend:**
   - `pages/api/search-reviewers-pro.js` - Orchestration endpoint (streaming)
   - `pages/find-reviewers-pro.js` - Frontend with source selection and results

**Key Technical Decisions:**

1. **Reuses Existing Code:**
   - File upload via `FileUploaderSimple`
   - Metadata extraction via `createExtractionPrompt()` from find-reviewers
   - Replaces Step 2 (Claude reviewer suggestions) with real database searches

2. **Intelligent Caching:**
   - 6-month cache expiry for search results
   - 3-month cache for individual profiles
   - Stored in Vercel Postgres

3. **Name Deduplication:**
   - Uses `string-similarity` package
   - Matches "J. Smith" with "John Smith"
   - Checks initials and partial first names

4. **Conflict of Interest Filtering:**
   - Excludes researchers from author's institution
   - Institution name normalization for accurate matching

5. **Relevance Ranking (100 points max):**
   - h-index: 0-40 points
   - Citations: 0-20 points (log scale)
   - Multiple sources: 0-15 points
   - Keyword matches: 0-25 points

**New Dependencies Required:**
```bash
npm install @vercel/postgres xml2js serpapi string-similarity
```

**Environment Variables Required:**
- `SERP_API_KEY` - For Google Scholar searches (paid service)
- `NCBI_API_KEY` - Optional, increases PubMed rate limits
- `POSTGRES_URL` - Auto-set by Vercel Postgres

**Setup Instructions:**

1. Create Vercel Postgres database in Vercel Dashboard
2. Run: `vercel env pull .env.local`
3. Run: `node scripts/setup-database.js`
4. Add `SERP_API_KEY` to environment variables

**Result:**
Fully implemented multi-source reviewer finder. Searches real academic databases, deduplicates results, filters conflicts, and ranks by relevance with h-index and citation counts.

---

## December 11, 2025 - Expert Reviewers Pro Improvements

**Issues Fixed:**

1. **PubMed Rate Limiting:**
   - Changed enrichment from `Promise.all()` (parallel) to sequential processing
   - Added 400ms delay between PubMed API calls
   - Prevents "API rate limit exceeded" errors
   - File: `pages/api/search-reviewers-pro.js:469-563`

2. **Publication URL Links:**
   - Added clickable URLs to all publications:
     - PubMed: `https://pubmed.ncbi.nlm.nih.gov/{pmid}`
     - ArXiv: `https://arxiv.org/abs/{arxivId}`
     - BioRxiv: `https://doi.org/${doi}`
   - Fixed operator precedence bug in URL generation
   - Updated on-screen display with blue clickable links
   - Updated markdown export with `[Title](URL)` format
   - Files: `pages/api/search-reviewers-pro.js`, `pages/find-reviewers-pro.js:606-614`

3. **Quality Filter for Results:**
   - Added filter requiring candidates to have BOTH:
     - Recent publications (within last 10 years)
     - Institutional affiliation
   - Removes incomplete/useless candidates from results
   - Stats now include `afterQualityFilter` count
   - File: `pages/api/search-reviewers-pro.js:565-575`

4. **Cache Issues Identified:**
   - Old cache contained irrelevant results from generic queries
   - Solution: Check "Skip cache" option to force fresh searches with Claude-generated queries

**Known Issues / Future Work:**

1. **Google Scholar** - Requires `SERP_API_KEY` (paid). Without it, h-index data unavailable.
2. **Testing Needed** - Verify with "Skip cache" enabled:
   - Claude-generated queries working correctly
   - Publication URLs are clickable
   - Quality filter removing incomplete candidates
3. **Potential Improvements:**
   - Adjust 10-year publication filter if too restrictive
   - Add h-index minimum filter option
   - Enhance affiliation extraction from PubMed articles

---

## December 14, 2025 - Expert Reviewer Finder v2 Session 9

**Features Implemented:**

1. **Google Scholar Profile Links** (`426b6d7`, `b094ee7`)
   - Added Scholar Profile link to CandidateCard and SavedCandidateCard
   - Opens Google Scholar author search in new tab (free, no API needed)
   - URL cleanup: removes titles (Dr., Prof.), extracts institution name from full affiliation
   - `buildScholarSearchUrl()` helper function in `pages/reviewer-finder.js`

2. **Claude API Retry Logic with Fallback Model** (`1cd7416`, `5efed48`)
   - Retry configuration: 2 retries with exponential backoff (1s, 2s delays)
   - After retries exhausted, falls back to `claude-3-haiku-20240307`
   - Only retries on overloaded/rate-limit errors (529, 503)
   - `callClaude()` returns `{ text, usedFallback, model }` object
   - Progress events include `status: 'fallback'` for UI notification
   - File: `lib/services/claude-reviewer-service.js`

3. **Fallback Model UI Indicator**
   - Progress messages track `type` field ('info' or 'fallback')
   - Fallback messages displayed with:
     - Warning emoji prefix
     - Amber/yellow background highlighting (`bg-amber-50 text-amber-600`)
   - Candidates track `reasoningFromFallback` flag

**Files Modified:**
- `pages/reviewer-finder.js` - Scholar links + fallback UI
- `lib/services/claude-reviewer-service.js` - Retry logic with fallback

---

## December 15, 2025 - Expert Reviewer Finder v2 Session 10

**Features Implemented:**

1. **Institution Mismatch Detection**
   - Compares Claude's suggested institution with PubMed-verified affiliation
   - Displays orange warning when institutions don't match (possible wrong person)
   - Handles departmental vs institutional affiliations (e.g., "Center for Integrative Genomics" matches "University of Lausanne")
   - Uses 50+ university abbreviation aliases
   - File: `lib/services/discovery-service.js` - `checkInstitutionMismatch()`

2. **Expertise Mismatch Detection**
   - Checks if Claude's claimed expertise terms appear in candidate's publications
   - Confidence thresholds: <35% (mismatch warning), 35-65% (weak match), >65% (good)
   - Filters generic terms that would match everything (biology, research, molecular, etc.)
   - File: `lib/services/discovery-service.js` - `checkExpertiseMismatch()`

3. **Claude Prompt Improvements**
   - Added INSTITUTION field requirement for verification
   - Added SOURCE field ("Mentioned in proposal", "References", "Known expert", "Field leader")
   - Fixed name order issue (Western order: FirstName LastName with examples)
   - Added "WHERE TO FIND REVIEWERS" prioritization section
   - Relaxed accuracy requirements to avoid missing proposal-mentioned candidates
   - File: `shared/config/prompts/reviewer-finder.js`

4. **UI Improvements**
   - Orange warnings for institution/expertise mismatches
   - Yellow indicator for weak matches (35-65% confidence)
   - Full Claude reasoning displayed (removed 150-character truncation)
   - Google Scholar URL now prefers university name over department name

**Key Functions Added:**

```javascript
// Institution mismatch detection
static checkInstitutionMismatch(verifiedAffiliation, suggestedInstitution) {
  // Simple containment check first
  if (verifiedLower.includes(suggestedLower)) return false;
  // 50+ university aliases (UC system, MIT, Caltech, etc.)
  // Pattern extraction for university names
  // Word overlap fallback (>50% match)
}

// Expertise mismatch detection
static checkExpertiseMismatch(publications, claimedExpertise) {
  // Extract significant terms from claimed expertise
  // Filter generic words (biology, research, molecular, etc.)
  // Check if terms appear in publication titles
  // Returns { hasMismatch, claimedTerms, matchedTerms }
}
```

**Files Modified:**
- `lib/services/discovery-service.js` - Added mismatch detection functions
- `pages/reviewer-finder.js` - UI warnings, Scholar URL fix, full reasoning display
- `shared/config/prompts/reviewer-finder.js` - Prompt improvements

**Bugs Fixed:**
- Name order reversed in Claude output (LastName FirstName → FirstName LastName)
- Google Scholar URL using department name instead of university
- Browser crash from missing `expanded` state variable
- False positive institution mismatches for departmental affiliations

---

## December 15-16, 2025 - Expert Reviewer Finder v2 Session 11 (Contact Enrichment)

**Phase 3: Contact Enrichment - Implementation Complete**

Implemented a tiered contact lookup system to find email addresses and faculty pages for verified candidates:

**Tier System:**
- **Tier 1: PubMed** (Free) - Extracts emails from recent publication affiliations
- **Tier 2: ORCID** (Free) - Looks up email, website, and ORCID ID via API
- **Tier 3: Claude Web Search** (Paid ~$0.015/candidate) - AI-powered faculty page search

**Files Created:**

1. **`shared/components/ApiSettingsPanel.js`** (NEW)
   - Collapsible settings panel for optional API keys (ORCID Client ID/Secret, NCBI API Key)
   - Keys stored in localStorage with base64 encoding
   - Follows existing UI patterns from other apps in the suite

2. **`lib/utils/contact-parser.js`** (NEW)
   - Extracts emails from PubMed affiliation strings using regex
   - Validates email recency (papers < 2 years old considered trustworthy)

3. **`lib/services/orcid-service.js`** (NEW)
   - ORCID API integration with OAuth 2.0 client credentials flow
   - Token caching for efficiency
   - Search by name + affiliation, fetch full profile

4. **`lib/services/contact-enrichment-service.js`** (NEW)
   - Orchestrates 3-tier lookup with fallback logic
   - `isUsefulWebsiteUrl()` filter to exclude generic directory pages
   - Cost estimation for Claude Web Search
   - Database persistence of enriched contact info

5. **`pages/api/reviewer-finder/enrich-contacts.js`** (NEW)
   - SSE streaming endpoint for real-time progress updates
   - Sends cost estimates, progress events, and final results

6. **`lib/db/migrations/002_contact_enrichment.sql`** (NEW)
   - Schema additions for contact tracking fields

**Files Modified:**

7. **`scripts/setup-database.js`**
   - Added v3Alterations array for contact enrichment columns:
     - `researchers.email_source`, `email_year`, `email_verified_at`
     - `researchers.faculty_page_url`, `contact_enriched_at`, `contact_enrichment_source`
     - `reviewer_suggestions.email_sent_at`, `response_type`

8. **`pages/reviewer-finder.js`**
   - Added ApiSettingsPanel integration
   - Added enrichment state management
   - Added "Find Contact Info" button for selected candidates
   - Added enrichment modal with tier options, cost estimate, progress display
   - Fixed ORCID/Claude checkboxes to show unchecked when credentials unavailable

**Bugs Fixed:**
- `DatabaseService.upsertResearcher is not a function` → Changed to `createOrUpdateResearcher`
- Claude API rate limit (30K input tokens/minute) → Switched to Haiku model, reduced prompt size
- Progress UI unclear during enrichment → Added immediate tier status indicators
- Unhelpful directory URLs (e.g., `?p=people`) → Added URL quality filter
- ORCID checkbox couldn't be unchecked → Fixed checkbox to reflect credential availability

**Key Implementation Details:**

```javascript
// URL quality filter
static isUsefulWebsiteUrl(url) {
  const genericPatterns = [
    /[?&]p=people/,           // ?p=people parameters
    /\/people\/?$/,           // ends with /people
    /\/directory\/?$/,        // ends with /directory
    /\/faculty\/?$/,          // ends with /faculty
    // ... more patterns
  ];
  return !genericPatterns.some(pattern => pattern.test(url));
}

// Cost estimation
const COSTS = {
  PUBMED: 0,
  ORCID: 0,
  CLAUDE_WEB_SEARCH: 0.015,  // ~$0.01 search + ~$0.005 Haiku tokens
};
```

**Database Migration:**
Run `node scripts/setup-database.js` to apply v3 schema changes.

---

## December 18-19, 2025 - Expert Reviewer Finder v2 Session 16

**Phase 4: Email Reviewers Feature + Contact Enrichment Improvements**

This session focused on implementing the Email Reviewers feature and fixing several issues with data persistence and contact enrichment.

### Features Implemented

**1. Email Reviewers Feature**

Created a complete system to generate .eml invitation files for reviewer candidates:

**Files Created:**
- `lib/utils/email-generator.js` - EML file generation with placeholder substitution
- `shared/components/EmailSettingsPanel.js` - Sender info and grant cycle settings
- `shared/components/EmailTemplateEditor.js` - Template editing with placeholder insertion
- `shared/components/EmailGeneratorModal.js` - Multi-step generation workflow
- `pages/api/reviewer-finder/generate-emails.js` - SSE endpoint for email generation
- `shared/config/prompts/email-reviewer.js` - Claude prompt for email personalization

**Placeholder System:**
| Placeholder | Source |
|-------------|--------|
| `{{greeting}}` | "Dear Dr. LastName" |
| `{{recipientName}}` | Candidate full name |
| `{{recipientLastName}}` | Parsed last name |
| `{{salutation}}` | "Dr." or "Professor" |
| `{{proposalTitle}}` | From proposal analysis |
| `{{proposalAbstract}}` | From proposal analysis |
| `{{piName}}` | PI name(s) |
| `{{piInstitution}}` | PI institution |
| `{{programName}}` | From grant cycle settings |
| `{{reviewDeadline}}` | Formatted date |
| `{{signature}}` | User's signature block |

**2. Abstract Extraction**
- Modified `shared/config/prompts/reviewer-finder.js` to extract abstract during analysis
- Updated `pages/api/reviewer-finder/analyze.js` to return `proposalAbstract`
- Updated `pages/api/reviewer-finder/save-candidates.js` to store abstract with proposals

### Bugs Fixed

**1. PI and Abstract Missing from Generated Emails**
- `handleSaveCandidates()` wasn't passing `proposalAbstract`, `proposalAuthors`, `proposalInstitution`
- Fixed by adding these fields to the save request in `pages/reviewer-finder.js`

**2. Enriched Contact Info Not Saving to Database**
- Two issues: async state update race condition and missing extraction from `contactEnrichment` object
- Fixed `save-candidates.js` to extract email/website from nested `contactEnrichment` object:
```javascript
const candidateEmail = candidate.email || candidate.contactEnrichment?.email || null;
const candidateWebsite = candidate.website || candidate.contactEnrichment?.website || null;
```

**3. Duplicate Proposals in Database**
- `generateProposalId()` used timestamps, creating unique IDs each save
- Changed to deterministic ID based only on title slug
- Added V5 database migration to merge existing duplicates

**4. Missing Salutation in Emails**
- Added `{{greeting}}` placeholder that combines "Dear Dr. LastName"
- Updated default template to use `{{greeting}}`

**5. Search Results Clearing on Tab Switch**
- Lifted state from `NewSearchTab` to parent `ReviewerFinderPage`
- Persists: `uploadedFiles`, `analysisResult`, `discoveryResult`, `selectedCandidates`

**6. State Clearing on Save**
- Wrapper functions didn't support callback pattern `setState(prev => ...)`
- Fixed by checking if argument is function and calling it with previous value

**7. Google Scholar API 400 Errors**
- `google_scholar_profiles` SerpAPI engine returning 400 errors
- Added `findScholarProfileViaGoogle()` fallback using regular Google search with `site:scholar.google.com`

### Contact Enrichment Improvements

**Expanded Faculty Page URL Detection:**
- More path patterns: `/research/`, `/lab/`, `/group/`, `/member/`, `/team/`, `/investigator/`, etc.
- International domain support: `.ac.uk`, `.ac.jp`, `.edu.au`, `.uni-`, `.u-`, etc.
- Research organization patterns: `nih.gov`, `nsf.gov`, `researchgate.net/profile`, `orcid.org`

**Multiple SerpAPI Fallback Queries:**
1. Primary: `"Name" institution email`
2. Fallback: `"Name" institution faculty`
3. Fallback: `"Name" site:.edu institution`
4. Fallback: `"Name" institution lab research`
5. Fallback: `"Name" institution profile`

**Google Scholar Profile Extraction:**
- New `findScholarProfile()` method for SerpAPI Scholar profiles
- Fallback `findScholarProfileViaGoogle()` for when Scholar API fails
- Returns: `scholarProfileUrl`, `scholarId`, `scholarName`, `scholarAffiliation`, `scholarCitedBy`

### UI Changes

- Renamed "New Search" tab to "Search"
- Search results now persist when switching between tabs

### Files Modified

- `pages/reviewer-finder.js` - State lifting, email integration, tab rename
- `pages/api/reviewer-finder/save-candidates.js` - Email/website extraction from enrichment
- `pages/api/reviewer-finder/analyze.js` - Abstract extraction
- `lib/services/serp-contact-service.js` - Enhanced URL detection, Scholar fallback
- `lib/utils/contact-parser.js` - `isInternationalAcademicDomain()`, improved `isUsefulWebsiteUrl()`
- `lib/utils/email-generator.js` - Added `{{greeting}}` placeholder
- `shared/config/prompts/reviewer-finder.js` - Added abstract extraction
- `scripts/setup-database.js` - V5 migration for duplicate merging

### Test Scripts Added

- `scripts/test-contact-enrichment.js` - Tests Claude web search, ORCID, and SerpAPI services

### Git Commits

- `6187951` Add fallback for Google Scholar API 400 errors
- (Previous commits in session: email feature, state persistence, duplicate fix, etc.)

---

## December 19, 2025 - Expert Reviewer Finder v2 Session 17

**Features Implemented & Bugs Fixed**

### 1. Google Scholar Profiles API Deprecation Fix (`16af684`)

The `google_scholar_profiles` SerpAPI engine has been deprecated and returns errors. Fixed by removing the deprecated API call and using the existing Google search fallback directly.

**File Modified:**
- `lib/services/serp-contact-service.js` - `findScholarProfile()` now calls `findScholarProfileViaGoogle()` directly

### 2. Edit Saved Candidates Feature (`8b92201`)

Added ability to edit researcher information for saved candidates in the My Candidates tab. Edits update the shared `researchers` table, affecting all proposals that include that researcher.

**Editable Fields:**
- Name, Affiliation, Email, Website, h-index

**Files Modified:**
- `pages/api/reviewer-finder/my-candidates.js` - Extended PATCH handler to update researchers table
- `pages/reviewer-finder.js` - Added `EditCandidateModal` component and edit button on `SavedCandidateCard`

**API Changes:**
```javascript
// Extended PATCH /api/reviewer-finder/my-candidates
{
  suggestionId: number,
  // Existing fields
  invited?: boolean,
  accepted?: boolean,
  notes?: string,
  // NEW: researcher fields
  name?: string,
  affiliation?: string,
  email?: string,
  website?: string,
  hIndex?: number
}
```

When email is edited, `email_source` is set to `'manual'` and `contact_enriched_at` is updated.

### 3. PI/Author Self-Suggestion Bug Fix (`3b9fbaf`)

Fixed issue where proposal authors (PI and co-PIs) were being suggested as reviewers for their own proposals.

**Implementation:**
- Added `filterProposalAuthors()` to `DeduplicationService` with fuzzy name matching via `areNamesSimilar()`
- Uses 85% string similarity threshold + initials matching
- Applied filter in `discover.js` to both verified and discovered candidates

**Files Modified:**
- `lib/services/deduplication-service.js` - Added `filterProposalAuthors()` and `areNamesSimilar()` methods
- `pages/api/reviewer-finder/discover.js` - Applied PI/author filter to both tracks

### 4. ChemRxiv Integration (`a01b7e4`, `1e18d24`)

Added ChemRxiv (chemistry preprints) as a new database search source alongside PubMed, ArXiv, and BioRxiv.

**Files Created:**
- `lib/services/chemrxiv-service.js` - Complete ChemRxiv Public API v1 integration
  - Base URL: `https://chemrxiv.org/engage/chemrxiv/public-api/v1`
  - `search()`, `parseResponse()`, `searchByAuthor()` methods
  - `isRelevantForChemRxiv()` - Keyword matching for chemistry-related proposals

**Files Modified:**
- `shared/config/prompts/reviewer-finder.js` - Added CHEMRXIV_QUERIES section to prompt
- `lib/services/discovery-service.js` - Added `searchChemRxiv` option and method
- `pages/reviewer-finder.js` - Added ChemRxiv toggle to search sources UI
- `pages/api/reviewer-finder/discover.js` - Added `searchChemrxiv` option

**ChemRxiv API Details:**
- Supports keyword search via `term` parameter
- Sort by relevance: `RELEVANT_DESC`
- Rate limit: 429 response indicates throttling needed
- Returns authors with corresponding author and institution data

### 5. Search Result Logging Enhancement (`8ef30b7`)

Added comprehensive logging to all four database search methods to help debug which searches return results.

**Log Format:**
```
[Discovery] PubMed search complete: 150 candidates from 3 queries
[Discovery] PubMed unique authors: 87 Smith J, Jones A, Brown M, Wilson K, Lee S...
[ChemRxiv] Query "cyanide donors synthesis..." → 12 total, 12 returned
[ChemRxiv] Sample authors: Pluth M, Smith J, Lee K
```

**Files Modified:**
- `lib/services/discovery-service.js` - Added logging to `searchPubMed()`, `searchArXiv()`, `searchBioRxiv()`, `searchChemRxiv()`
- `lib/services/chemrxiv-service.js` - Added per-query logging with total/returned counts

### Git Commits

- `16af684` Remove deprecated Google Scholar Profiles API
- `8b92201` Add edit saved candidates feature
- `3b9fbaf` Fix PI self-suggestion as reviewer bug
- `a01b7e4` Add ChemRxiv database search integration
- `1e18d24` Fix ChemRxiv API 400 errors (sort parameter)
- `8ef30b7` Add search result logging for all database sources

---

## December 20, 2025 - Session 18: Documentation & UI Cleanup

**Documentation, App Consolidation, and UI Polish Session**

With the Reviewer Finder now stable and production-ready, this session focused on documentation, deprecating redundant apps, and polishing the overall UI consistency.

### Part 1: Documentation & Planning

1. **Created `ROADMAP_DATABASE_TAB.md`**
   - Detailed implementation plan for the Database Tab feature
   - 4-phase approach: Browse/Search → Details → Management → Advanced
   - API endpoint design and UI mockup

2. **Updated project documentation**
   - Updated CLAUDE.md with current app state and categories
   - Added Session 18 summary to DEVELOPMENT_LOG.md

### Part 2: App Deprecation

Deprecated 3 redundant apps (hidden from UI, files retained):

| App | Reason |
|-----|--------|
| document-analyzer | Duplicate of proposal-summarizer with worse UX |
| find-reviewers | Superseded by Reviewer Finder |
| find-reviewers-pro | Merged into Reviewer Finder |

### Part 3: UI Consistency Updates

**App Renaming:**
- "Expert Reviewer Finder v2" → "Reviewer Finder"
- "Batch Proposal Summaries" → "Batch Phase II Summaries"
- "Funding Gap Analyzer" → "Funding Analysis"
- "Phase II Writeup" → "Create Phase II Writeup Draft"
- "Phase I Writeup" → "Create Phase I Writeup Draft"
- "Peer Review Summary" → "Summarize Peer Reviews"

**Icon Consistency:**
- ✍️ for both writeup apps (Phase I and Phase II)
- 📑 for both batch apps (Phase I and Phase II)
- Migrated icon toggle buttons from find-reviewers-pro to Reviewer Finder

**Landing Page Updates:**
- Reordered apps: Batch Phase I, Batch Phase II, Funding Analysis, Create Phase I, Create Phase II, Reviewer Finder, Summarize Peer Reviews, Expense Reporter, Literature Analyzer
- Changed category filters from "Available/Coming Soon" to "Phase I/Phase II/Other Tools"
- Removed redundant feature keywords from app cards
- Updated app descriptions for consistency

**Header Updates:**
- Removed redundant "Document Processing Suite" logo (Home link serves same purpose)
- Updated navigation order to match landing page
- Added Literature Analyzer to navigation

**Footer Updates:**
- Added author credit: "Written by Justin Gallivan" with mailto link

### Reviewer Finder - Current State

The application is feature-complete for the core workflow:
- PDF upload → Claude analysis → 4-database search (PubMed, ArXiv, BioRxiv, ChemRxiv)
- Contact enrichment (5 tiers)
- Email generation with .eml files
- Save/edit/delete candidates in database
- Multi-select operations

**Next Priority:** Database Tab Implementation (see ROADMAP_DATABASE_TAB.md)

---

## January 14, 2026 - Session 22: Email Generation V6 & Settings UI

**Major Feature: Email Generation with Attachments and Settings Modal**

This session completed the email generation workflow with proper attachment support, settings UI, and various bug fixes.

### Features Implemented

**1. Settings Modal Overhaul**
- Reordered sections: Sender Info → Grant Cycle → Email Template → Attachments
- Added "Additional Attachments" section for optional files
- Review template upload via Vercel Blob storage
- Grant cycle custom fields (proposalDueDate, honorarium, proposalSendDate, commitDate)
- Summary page extraction configuration

**2. Email Attachment Support**
- MIME multipart/mixed format for .eml files with attachments
- Automatic project summary extraction from proposal PDFs (using pdf-lib)
- Review template attachment (user-uploaded)
- Additional attachments (multiple optional files)
- Re-extract summary button in My Candidates tab

**3. Investigator Team Formatting**
- New `{{investigatorTeam}}` placeholder handles PI + Co-PI formatting gracefully:
  - 0 Co-PIs: "the PI Dr. Smith"
  - 1 Co-PI: "the PI Dr. Smith and co-investigator Dr. Jones"
  - 2+ Co-PIs: "the PI Dr. Smith and 2 co-investigators (Dr. Jones, Dr. Lee)"
- New `{{investigatorVerb}}` for subject-verb agreement ("was" vs "were")

**4. Enhanced Co-PI Extraction**
- Updated Claude prompt with detailed guidance for finding Co-PIs
- Looks in: title/cover pages, "Senior Personnel" sections, author lists
- Graceful fallback to just PI name when Co-PIs not found

**5. Custom Field Date Formatting**
- `formatCustomFields()` converts ISO dates (2026-01-29) to readable format (January 29, 2026)
- Auto-detects date fields by name pattern or ISO format

### Bug Fixes

- **Webpack cache errors**: Fixed by clearing .next/cache directory
- **Template literal interpretation**: Escaped `${{customField:...}}` to prevent JS interpolation
- **Upload handler mismatch**: Created `/api/upload-file` for direct FormData uploads
- **Custom fields not populating**: Fixed EmailGeneratorModal to merge all localStorage sources
- **Extract summary API error**: Fixed to pass `Buffer.from(extraction.buffer)` instead of object
- **Verb agreement**: "the PI Dr. Smith were" → "the PI Dr. Smith was"

### Email Workflow Documentation

Generated .eml files open as "received" messages in email clients. To send:
1. Open the .eml file
2. Forward to recipient (remove "Fwd:" from subject), OR
3. Copy content into a new message

**Future Consideration:** When integrated with CRM, implement direct email sending via SendGrid, AWS SES, or similar service.

### Files Created/Modified

**New Files:**
- `pages/api/upload-file.js` - Direct FormData upload to Vercel Blob
- `pages/api/reviewer-finder/extract-summary.js` - Re-extract summary pages
- `lib/utils/pdf-extractor.js` - PDF page extraction using pdf-lib

**Modified Files:**
- `lib/utils/email-generator.js` - Attachment support, investigatorTeam, date formatting
- `shared/components/SettingsModal.js` - Reordered sections, additional attachments
- `shared/components/EmailGeneratorModal.js` - Load settings from multiple sources
- `shared/components/EmailTemplateEditor.js` - New placeholder options
- `shared/config/prompts/reviewer-finder.js` - Enhanced Co-PI extraction
- `CLAUDE.md` - Updated documentation with email workflow and future considerations

### Database Schema

**V6 Additions:**
- `reviewer_suggestions.summary_blob_url` - URL to extracted summary PDF

### Git Commits

- Format custom date fields in email template
- Reorder Settings modal menu sections
- Add additional attachments support to Settings modal
- Add investigatorTeam placeholder for better PI/Co-PI formatting
- Enhance Co-PI extraction and improve fallback handling
- Fix extract-summary API: pass buffer not object to Vercel Blob
- Add investigatorVerb for proper subject-verb agreement
- Add X-Unsent header to .eml files for draft mode
- Add Apple Mail draft header and remove Date for draft .eml files
- Update email workflow instructions for Outlook compatibility
- Add email workflow instructions and document future CRM integration

---

## January 15, 2026 - Session 23: Grant Cycle Management & UI Enhancements

**Major Feature: Grant Cycle and Program Area Management**

This session added comprehensive grant cycle management and program area tracking to the Reviewer Finder.

### Features Implemented

**1. Database Migrations (V8, V9)**
- V8: Added `declined` column to `reviewer_suggestions` table
- V9: Added `program_area` column to `reviewer_suggestions` table
- Added historical grant cycles: J23, D23, J24, D24, J25, D25, J26

**2. My Candidates Tab Improvements**
- Editable program area dropdown on each proposal card
  - Options: Science & Engineering Research Program, Medical Research Program, Not assigned
  - Color-coded: Blue for Science & Eng, Red for Medical, Gray for unassigned
- Editable grant cycle dropdown on each proposal card
  - Shows all active cycles from database
  - Color-coded: Purple when assigned, Gray when unassigned
- Declined status button alongside Invited/Accepted (red styling)
- PI and Institution display on proposal cards
- Filter dropdowns for Institution, PI, and Program (only show when >1 unique value)

**3. New Search Tab Enhancement**
- Grant cycle selector dropdown (replaces static indicator)
- Auto-generates cycles for current year + next year (18 months coverage)
- Auto-creates missing cycles in database on page load
- Persists selected cycle to localStorage
- Defaults to first available cycle if none previously selected

**4. Prompt Updates**
- Updated Claude analysis prompt to extract Keck cover page fields:
  - `PROGRAM_AREA`: Medical Research Program or Science and Engineering Research Program
  - `PRINCIPAL_INVESTIGATOR`: Single name from "Project Leader" field
  - `CO_INVESTIGATORS`: Names from "Co-Principal Investigators" field
- Fixed PI field to contain single name (previously had multiple authors)

### API Changes

**`/api/reviewer-finder/my-candidates.js`**
- Added `programArea` to PATCH handler for bulk proposal updates
- Added `declined` to SELECT queries and response mapping
- Added `program_area` to SELECT queries and response mapping

**`/api/reviewer-finder/save-candidates.js`**
- Added `programArea` to request body and INSERT/UPDATE

### Files Modified

- `pages/reviewer-finder.js` - Cycle selector, program/cycle dropdowns, filters
- `pages/api/reviewer-finder/my-candidates.js` - PATCH support for program/cycle
- `pages/api/reviewer-finder/save-candidates.js` - Program area support
- `scripts/setup-database.js` - V8 and V9 migrations
- `shared/config/prompts/reviewer-finder.js` - Keck cover page field extraction

### Git Commits

- Add program area and grant cycle editing to My Candidates
- Add grant cycle selector dropdown to New Search tab

---

## January 16, 2026 - Session 24: Concept Evaluator App

**Major Feature: Pre-Phase I Concept Screening Tool**

This session implemented the Concept Evaluator app, a new tool for screening research concepts before Phase I.

### Features Implemented

**1. Concept Evaluator App**
- Upload multi-page PDFs where each page contains one research concept
- Two-stage AI evaluation process:
  - Stage 1: Claude Vision API extracts title, PI, summary, research area, keywords
  - Stage 2: Literature search + Claude provides final evaluation with ratings
- Automatic literature search based on detected research area:
  - Life sciences → PubMed + BioRxiv
  - Chemistry → PubMed + ChemRxiv
  - Physics/CS/Math → ArXiv
- Label-based ratings (Strong/Moderate/Weak) for:
  - Keck Alignment (high-risk, pioneering, wouldn't be funded elsewhere)
  - Scientific Merit (sound science, clear hypothesis)
  - Feasibility (technical challenges, likelihood of success)
  - Novelty (based on literature search results)
- Export to JSON and Markdown
- New "Concepts" category on landing page

**2. PDF Page Splitter Utility**
- `lib/utils/pdf-page-splitter.js` - Split multi-page PDF into individual pages
- Returns base64-encoded PDF for each page (for Claude Vision API)
- Uses pdf-lib (existing dependency)

### Files Created

- `pages/concept-evaluator.js` - Frontend with streaming progress and results display
- `pages/api/evaluate-concepts.js` - Two-stage evaluation API with literature search
- `lib/utils/pdf-page-splitter.js` - PDF page extraction utility
- `shared/config/prompts/concept-evaluator.js` - Evaluation prompts with Keck criteria

### Files Modified

- `pages/index.js` - Added Concept Evaluator app card and "Concepts" category filter
- `shared/components/Layout.js` - Added navigation link for Concept Evaluator
- `CLAUDE.md` - Added Concept Evaluator documentation

### Architecture

```
PDF Upload → Split Pages → For Each Page:
  1. Claude Vision (Stage 1) → Extract metadata + keywords
  2. Literature Search → PubMed/ArXiv/BioRxiv/ChemRxiv
  3. Claude Text (Stage 2) → Final evaluation with literature context
→ Aggregate Results → Export JSON/Markdown
```

### Git Commits

- Add Concept Evaluator app for pre-Phase I screening

---

## January 16, 2026 - Session 25: Concept Evaluator Refinements

**Concept Evaluator Testing and Improvements**

This session focused on testing the Concept Evaluator with real data and refining the evaluation approach based on user feedback.

### Issues Identified & Fixed

**1. Sycophantic Evaluations**
- Problem: 7 of 8 concepts received identical praise ("This concept represents exactly the type of pioneering, high-risk research that Keck should support")
- Solution: Completely rewrote Stage 2 prompt with anti-sycophancy instructions:
  - Explicit rating distribution guidance (Strong = top 10-20%)
  - List of language to avoid ("exciting", "groundbreaking", "pioneering")
  - Requirement that every concept have substantive concerns
  - Default skeptical stance

**2. Evaluation Framing - Impact vs Feasibility**
- User feedback: Focus on potential impact, not feasibility at screening stage
- Added `potentialImpact` rating with framing: "If everything proposed turns out correct, what is the impact?"
- Feasibility remains but as secondary criterion for identifying addressable concerns
- Key question: "Will success have significant impact on the field or world?"

**3. Literature Search Improvements**
- Problem: Queries too specific - combining 6+ keywords into one long query returned no results
- Example bad query: "retroviral immunity CRISPR screening packageable lentiviral vectors Simian Immunodeficiency Virus innate immunity"
- Solution: Adopted Reviewer Finder pattern:
  - Claude generates 2-3 SHORT queries (3-5 words each)
  - Each query executed individually
  - Results deduplicated across queries
- Example good queries: "CRISPR gene editing", "retroviral vector packaging", "host innate immunity"

**4. Author Display Bug**
- Problem: Authors displayed as "[object Object], [object Object]"
- Cause: Services return author objects with `name` property, code tried to join objects as strings
- Fix: Extract author names properly: `a.name || 'Unknown'`

**5. Missing Paper Links**
- Added clickable URLs to literature results
- Priority: DOI → PubMed → ArXiv
- Links display in both UI and markdown export

### UI Updates

- Literature search section now shows each query as styled tag
- Paper titles are clickable links
- Summary stats show "High Impact" / "Moderate Impact" instead of Keck Fit
- Ratings row: Impact, Keck Fit, Merit, Novelty, Feasibility (5 ratings)

### Model Configuration Discovery

Identified that model selection is centralized in `shared/config/baseConfig.js`:
```javascript
DEFAULT_MODEL: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514'
```

All apps currently use the same model. This was flagged as a significant issue - different apps may need different models based on task complexity. Deferred to Session 26 for per-app model configuration.

### Files Modified

- `shared/config/prompts/concept-evaluator.js` - Anti-sycophancy, impact framing, short queries
- `pages/api/evaluate-concepts.js` - Individual query execution, author name extraction, paper URLs
- `pages/concept-evaluator.js` - Query display, paper links, impact-focused stats

### Git Commits

- Enhance Concept Evaluator with impact focus and literature visibility
- Restore full feasibility analysis as secondary criterion
- Improve literature search with focused short queries
- Fix author display and add paper links in literature results

---

## Session 27 - January 18, 2026

### Email Tracking for Reviewer Candidates

Implemented full email tracking lifecycle for the Reviewer Finder:

**API Changes:**
- Extended `my-candidates.js` PATCH endpoint to accept `emailSentAt`, `responseType`, `responseReceivedAt`
- Added `markAsSent` option to `generate-emails.js` that auto-records timestamp when emails are generated
- Supports `'now'` as value for timestamps to set current time

**UI Changes:**
- EmailGeneratorModal now has "Mark candidates as Email Sent" checkbox (default: on)
- SavedCandidateCard displays sent timestamp (📧 Jan 18) next to status buttons
- Clicking Invited toggles `email_sent_at`
- Clicking Accepted/Declined sets `response_type` and `response_received_at`
- Added "Mark Bounced" button in expanded card details

### Database Tab Phase 3 - Researcher Management

Complete CRUD operations for researchers in the Database tab:

**API Endpoints Added (`/api/reviewer-finder/researchers`):**
- `GET ?mode=duplicates` - Find potential duplicates by email, normalized name, ORCID, Google Scholar ID
- `POST` - Merge researchers (moves keywords, transfers proposal associations, keeps best data)
- `PATCH` - Edit researcher fields (name, affiliation, email, website, metrics)
- `DELETE` - Delete single researcher or bulk delete multiple

**UI Features:**
- ResearcherDetailModal enhanced with Edit and Delete buttons
- Edit mode: inline form for all editable fields
- Delete confirmation showing proposal association count
- Bulk selection with checkbox column and "select all" header
- Bulk delete with confirmation dialog
- CSV Export button (fetches up to 1000 matching researchers)
- Find Duplicates button opens DuplicatesModal
- DuplicatesModal shows groups by match type, allows selecting primary and merging

**Merge Logic:**
- Keywords moved to primary (ON CONFLICT DO NOTHING for duplicates)
- Proposal associations (reviewer_suggestions) transferred to primary
- Missing data (email, website, ORCID, Scholar ID) filled from secondary
- Higher metrics (h-index, i10-index, citations) kept
- Secondary researcher deleted after merge

### Files Modified

**Email Tracking:**
- `pages/api/reviewer-finder/my-candidates.js` - Email tracking fields in GET and PATCH
- `pages/api/reviewer-finder/generate-emails.js` - markAsSent option with DB updates
- `shared/components/EmailGeneratorModal.js` - Checkbox and onEmailsGenerated callback
- `pages/reviewer-finder.js` - SavedCandidateCard email display and handlers

**Database Tab Phase 3:**
- `pages/api/reviewer-finder/researchers.js` - POST/PATCH/DELETE + duplicates mode
- `pages/reviewer-finder.js` - ResearcherDetailModal edit/delete, DuplicatesModal, bulk operations

### Git Commits

- `c89a8d4` Add email tracking for reviewer candidates
- `18be0af` Add Database Tab Phase 3: researcher management features

---

## Session 28 - January 18, 2026

### Literature Analyzer App Implementation

Implemented the Literature Analyzer app for research paper analysis and synthesis:

**Core Features:**
- Upload one or more research paper PDFs
- Claude Vision extracts key information from each paper
- Cross-paper synthesis for 2+ papers identifying themes and patterns
- Tabbed results view (Synthesis / Individual Papers)
- Optional focus topic to guide synthesis
- Export as JSON or Markdown

**Paper Extraction (per paper):**
- Title, authors, year, journal, DOI
- Abstract and research type classification
- Background (problem, motivation)
- Methods (approach, techniques, sample/data)
- Findings (main, quantitative, qualitative)
- Conclusions (summary, implications, limitations, future work)
- Keywords and field/subfield

**Synthesis Features (2+ papers):**
- Overview with date range and primary field
- Theme identification with consensus and disagreements
- Key findings categorized (established, emerging, contradictory)
- Research gaps (identified by authors, inferred)
- Methodological approaches comparison
- Future research directions
- Practical implications
- Quality assessment

**Files Created:**
- `pages/literature-analyzer.js` - Frontend with PaperCard and SynthesisSection components
- `pages/api/analyze-literature.js` - Two-stage API (extraction + synthesis)
- `shared/config/prompts/literature-analyzer.js` - Paper extraction and synthesis prompts

**Files Modified:**
- `shared/config/baseConfig.js` - Added literature-analyzer model config (Sonnet 4)
- `shared/components/Layout.js` - Enabled navigation link
- `pages/index.js` - Changed status from coming-soon to active
- `CLAUDE.md` - Added feature summary and model config documentation

### Git Commits

- `75559e3` Implement Literature Analyzer app for paper analysis and synthesis

---

## Session 29 - January 18-19, 2026

### User Profiles Phase 1 Implementation

Implemented multi-user support without authentication, enabling isolated API keys and "My Candidates" data per user.

**Database Schema (V10 Migration):**
- `user_profiles` table - User identity with avatar colors
- `user_preferences` table - Per-user settings with AES-256-GCM encryption for API keys
- Added `user_profile_id` FK to `proposal_searches` and `reviewer_suggestions`

**Core Features:**
- Profile selector dropdown in header for switching users
- Profile Settings page at `/profile-settings` for managing profiles
- Encrypted API key storage per profile (not shared via localStorage)
- My Candidates filtered by current user profile
- Legacy data (NULL user_profile_id) visible to all users until migrated

**API Endpoints:**
- `GET/POST/PATCH/DELETE /api/user-profiles` - Profile CRUD
- `GET/POST/DELETE /api/user-preferences` - Preference management with encryption

**Migration Tools:**
- `export-proposals-for-migration.js` - Export proposals to CSV
- `import-user-assignments.js` - Assign proposals to users from CSV
- `manage-preferences.js` - View/delete API key preferences

**Bug Fixes:**
- Fixed ProfileProvider placement (moved to `_app.js` for SSR compatibility)
- Fixed `setPreferences` naming conflict in ProfileContext
- Fixed infinite re-render loop when switching profiles
- Fixed localStorage fallback showing shared keys across profiles

**Files Created:**
- `lib/utils/encryption.js` - AES-256-GCM encryption utilities
- `shared/context/ProfileContext.js` - React context for profile state
- `shared/components/ProfileSelector.js` - Header dropdown
- `pages/profile-settings.js` - Profile management page
- `pages/api/user-profiles.js` - Profile API
- `pages/api/user-preferences.js` - Preferences API
- `scripts/export-proposals-for-migration.js`
- `scripts/import-user-assignments.js`
- `scripts/manage-preferences.js`
- `scripts/test-profiles.js`

**Files Modified:**
- `scripts/setup-database.js` - V10 migration
- `lib/services/database-service.js` - Profile/preference methods
- `pages/_app.js` - ProfileProvider wrapper
- `shared/components/Layout.js` - ProfileSelector in header
- `shared/components/ApiKeyManager.js` - Profile integration, isolated keys
- `shared/components/ApiSettingsPanel.js` - Profile integration, isolated keys
- `pages/api/reviewer-finder/my-candidates.js` - User scoping
- `pages/api/reviewer-finder/save-candidates.js` - User scoping
- `pages/reviewer-finder.js` - Pass userProfileId to APIs

### Git Commits

- `943cb65` Implement User Profiles Phase 1 for multi-user support
- `de60c03` Fix ProfileProvider and setPreferences naming conflict
- `8277c1b` Fix profile switching loop in API key components
- `f94ceb5` Isolate API keys per profile - do not show localStorage fallback
- `f088353` Add migration CSV to gitignore

---

## Session 30 - January 18, 2026

### Microsoft Azure AD Authentication Implementation

Implemented optional Microsoft Azure AD authentication using NextAuth.js. Authentication is **conditional** - it only activates when Azure credentials are configured in environment variables.

**Key Design Decision:**
- Authentication is optional until Azure AD app registration is set up
- App works exactly as before (with ProfileSelector) when credentials not configured
- Once credentials are added, login via Microsoft becomes required

**Database Schema (V11 Migration):**
- Added `azure_id` (VARCHAR, UNIQUE) to `user_profiles` - Azure AD user ID
- Added `azure_email` (VARCHAR) to `user_profiles` - User's Azure email
- Added `last_login_at` (TIMESTAMP) to `user_profiles` - Last Azure login
- Added `needs_linking` (BOOLEAN) to `user_profiles` - First-login flag
- Added indexes for fast Azure ID/email lookups

**Authentication Flow:**
1. User visits app → `RequireAuth` checks if Azure credentials configured
2. If not configured → App works as before with ProfileSelector
3. If configured and unauthenticated → Redirect to Microsoft login
4. After Azure auth → `signIn` callback checks for linked profile
5. First login → `ProfileLinkingDialog` lets user pick existing profile or create new
6. Future logins → Auto-selects linked profile from session

**Files Created:**
| File | Purpose |
|------|---------|
| `pages/api/auth/[...nextauth].js` | NextAuth API route with Azure AD provider |
| `pages/api/auth/link-profile.js` | API for linking Azure account to profile |
| `pages/api/auth/status.js` | Returns whether auth is enabled (credentials exist) |
| `pages/auth/signin.js` | Custom sign-in page with Microsoft branding |
| `pages/auth/error.js` | Custom error page for auth failures |
| `shared/components/RequireAuth.js` | Auth guard (passes through if auth disabled) |
| `shared/components/ProfileLinkingDialog.js` | First-login profile selection modal |
| `lib/utils/auth.js` | Server-side utilities: `requireAuth`, `requireAuthWithProfile` |

**Files Modified:**
| File | Changes |
|------|---------|
| `pages/_app.js` | Added `SessionProvider` wrapper from NextAuth |
| `pages/index.js` | Wrapped with `RequireAuth`, conditional user menu |
| `shared/components/Layout.js` | User menu when authenticated, ProfileSelector when not |
| `shared/context/ProfileContext.js` | Integrated with `useSession` for auto profile selection |
| `lib/services/database-service.js` | Added Azure fields to profile queries |
| `scripts/setup-database.js` | V11 migration for Azure columns |
| `CLAUDE.md` | Added authentication documentation |

**Environment Variables (Required when enabling auth):**
```env
NEXTAUTH_URL=http://localhost:3000     # Base URL
NEXTAUTH_SECRET=...                     # Generate: openssl rand -base64 32
AZURE_AD_CLIENT_ID=...                  # From Azure Portal
AZURE_AD_CLIENT_SECRET=...              # From Azure Portal
AZURE_AD_TENANT_ID=...                  # Organization tenant ID
```

**Server-Side Auth Utilities:**
```javascript
// In API routes:
import { requireAuth, requireAuthWithProfile } from '../../lib/utils/auth';

// Option 1: Just require authentication
const session = await requireAuth(req, res);
if (!session) return; // 401 already sent

// Option 2: Require auth + profile for data scoping
const profileId = await requireAuthWithProfile(req, res);
if (!profileId) return; // 401 or 403 already sent
```

### Git Commits

- `7de98a5` Add Microsoft Azure AD authentication with NextAuth.js
- `933ccf6` Make authentication optional when Azure credentials not configured

---

## Session 31 - January 19, 2026

### Manual Researcher Management & Bug Fixes

Added comprehensive manual researcher management features and fixed several critical bugs in the email generation workflow.

**New Features:**

1. **Researcher Notes Field (V12 Migration)**
   - Added `notes` column to `researchers` table for tracking conflicts, preferences, past interactions
   - Editable in researcher detail modal with yellow-highlighted display
   - Useful for recording decline reasons and other contextual information

2. **Add Researcher Button (Database Tab)**
   - New "+ Add Researcher" button in Database tab header
   - Opens `AddResearcherModal` with comprehensive form:
     - Basic Info: Name (required), Affiliation, Department
     - Contact: Email, Website, ORCID, Google Scholar ID
     - Metrics: h-index, i10-index, Citations
     - Expertise: Keywords (comma-separated)
     - Notes: General notes field
     - Proposal Association: Grant cycle selector → Proposal dropdown → Match reason

3. **Associate with Proposal (Researcher Detail Modal)**
   - New "+ Add to Proposal" link in Proposal Associations section
   - Expandable green form with grant cycle and proposal selectors
   - Links existing researchers to proposals without re-running discovery
   - Creates `reviewer_suggestions` entry with source='manual'

4. **Status Tracking Improvements**
   - Added "No Response" status option for closing out non-responders
   - Added "Mark as Sent" button for retroactive email tracking on older candidates
   - Filter support for "No Response" status in My Candidates

**Bug Fixes:**

1. **Email Generation Modal Cycling** (`EmailGeneratorModal.js`)
   - Fixed infinite loop caused by `onEmailsGenerated` callback triggering parent re-render during SSE
   - Added `generationTriggeredRef` guard to prevent double generation
   - Added `needsRefreshRef` to defer parent callback until modal closes
   - Consolidated initialization into single useEffect with `hasInitializedRef`

2. **ApiSettingsPanel Infinite Loop** (`ApiSettingsPanel.js`)
   - Fixed infinite re-render caused by `onSettingsChange` in useCallback dependency array
   - Implemented ref pattern: `onSettingsChangeRef.current` instead of direct callback

3. **Proposal Association Bug**
   - Fixed `parseInt()` being called on string proposal hash, causing `NaN`
   - Changed to pass proposalId as string directly

**API Changes:**

1. **POST /api/reviewer-finder/researchers** (Extended)
   - Now supports creating new researchers (when `name` provided instead of `primaryId`)
   - Accepts optional `proposalId` to associate with proposal on creation
   - Accepts `keywords` array for expertise tags

2. **GET /api/reviewer-finder/my-candidates?mode=proposals**
   - New mode to fetch all proposals (from `reviewer_suggestions`) for dropdowns
   - Supports `cycleId` filter for grant cycle scoping
   - Returns distinct proposals with title, hash, and cycle info

**Database:**
- V12 Migration: `ALTER TABLE researchers ADD COLUMN IF NOT EXISTS notes TEXT`

**Files Modified:**
| File | Changes |
|------|---------|
| `pages/reviewer-finder.js` | AddResearcherModal, notes field UI, associate feature, status tracking |
| `pages/api/reviewer-finder/researchers.js` | POST create handler, notes in GET/PATCH |
| `pages/api/reviewer-finder/my-candidates.js` | mode=proposals query |
| `shared/components/EmailGeneratorModal.js` | Fixed cycling/double-generation bugs |
| `shared/components/ApiSettingsPanel.js` | Fixed infinite loop |
| `scripts/setup-database.js` | V12 migration |
| `lib/db/schema.sql` | Added notes column |

### Git Commits

- `9553708` Add manual researcher management and fix email generation bugs

---

## Session 32 - January 20, 2026

### Azure AD (Entra ID) Integration Finalization

IT team completed and refined the Microsoft Azure AD authentication integration using their internal tools. This session focused on reviewing and documenting their changes.

**IMPORTANT: Authentication remains OPTIONAL.** The app continues to work exactly as before (ProfileSelector dropdown, no login required) until Azure credentials are explicitly configured in environment variables. This is by design - authentication only activates when all three Azure variables (`AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`) are set.

**What IT Implemented/Refined:**

The authentication infrastructure was built in Sessions 30-31, but IT refined several components and added new utilities:

**1. Auth Status Endpoint** (`pages/api/auth/status.js`) - NEW
- Simple endpoint returning `{ enabled: true|false }` based on Azure credentials
- Checks `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`
- Used by `RequireAuth` client component to determine if login is required

**2. Enhanced Auth Utilities** (`lib/utils/auth.js`) - REFINED
Added new helper functions:
| Function | Purpose |
|----------|---------|
| `getSession(req, res)` | Get session without sending error response |
| `requireAuth(req, res)` | Require auth, send 401 if unauthenticated |
| `requireAuthWithProfile(req, res)` | Require auth + linked profile, send 401/403 |
| `optionalAuth(req, res)` | Return session if present, null otherwise |

**3. RequireAuth Component** (`shared/components/RequireAuth.js`) - REFINED
- Now fetches `/api/auth/status` on mount to determine if auth is enabled
- Caches result in `window.__AUTH_ENABLED__` for subsequent renders
- Graceful fallback: if status check fails, assumes auth disabled
- Added `useRequireAuth()` hook for use in other components

**4. ProfileLinkingDialog** (`shared/components/ProfileLinkingDialog.js`) - REFINED
- Cleaner implementation with proper loading states
- Filters to only show unlinked profiles (`!p.azureId`)
- Sign out option to switch accounts
- Error handling with user-friendly messages

**5. NextAuth Configuration** (`pages/api/auth/[...nextauth].js`) - REFINED
- Robust signIn callback with multiple profile lookup strategies:
  1. Check by `azure_id` (returning user)
  2. Check by `azure_email` (auto-link if email matches)
  3. Create temp profile with `needs_linking=true` if unlinked profiles exist
  4. Create new profile if no existing profiles
- Error-tolerant: allows sign-in even if DB operations fail

**6. Link Profile Endpoint** (`pages/api/auth/link-profile.js`) - REFINED
- Verifies Azure ID matches session before allowing link
- Cleans up temporary profiles after linking
- Prevents linking to already-linked profiles

**New Files Created by IT:**
| File | Purpose |
|------|---------|
| `.env.local.example` | Template for environment variables |
| `docs/ENTRA_ID_INTEGRATION_SUMMARY.md` | IT's integration documentation |

**Authentication Flow (Finalized):**
```
1. RequireAuth → GET /api/auth/status
2. If enabled && unauthenticated → Show "Sign in with Microsoft" button
3. User clicks → signIn('azure-ad') → Microsoft OAuth
4. NextAuth signIn callback → Find/create/link profile in DB
5. jwt callback → Add profileId, needsLinking to token
6. session callback → Expose to client
7. If needsLinking → Show ProfileLinkingDialog
8. User links → POST /api/auth/link-profile → Reload page
```

**Environment Variables (Complete List):**
```env
# NextAuth Core
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<openssl rand -base64 32>

# Azure AD Credentials
AZURE_AD_CLIENT_ID=<from Azure Portal>
AZURE_AD_CLIENT_SECRET=<from Azure Portal>
AZURE_AD_TENANT_ID=<organization tenant ID>

# Database (auto-set by Vercel)
POSTGRES_URL=<connection string>
```

**Testing Checklist:**
1. `cp .env.local.example .env.local` and fill values
2. `npm run dev`
3. Visit `/api/auth/status` → expect `{"enabled":true}`
4. Visit any page → should redirect to Microsoft login
5. Complete OAuth → should show ProfileLinkingDialog (first login)
6. Link or create profile → should reload with full access
7. Visit `/api/auth/session` → should show `profileId`, `azureEmail`

**Note:** Azure app registration requires redirect URI:
- Dev: `http://localhost:3000/api/auth/callback/azure-ad`
- Prod: `https://your-domain.vercel.app/api/auth/callback/azure-ad`

---

## Session 33 - January 20, 2026

### Per-User Settings Storage for Reviewer Finder

Migrated Reviewer Finder settings from browser localStorage to per-user database storage using the existing `user_preferences` infrastructure.

**Problem:**
Settings (sender info, grant cycle settings, email template, current cycle ID) were stored in browser localStorage, meaning:
- Settings didn't persist across browsers/devices
- All users on the same machine shared the same settings
- No isolation between user profiles

**Solution:**
Updated all settings-related components to use profile preferences with localStorage fallback:

**New File:**
- `shared/config/reviewerFinderPreferences.js` - Preference key constants and legacy storage key mappings

**Updated Components:**
| Component | Changes |
|-----------|---------|
| `SettingsModal.js` | Save/load from profile preferences; auto-migrate from localStorage |
| `EmailTemplateEditor.js` | Save/load template from profile preferences |
| `EmailGeneratorModal.js` | Load settings from profile preferences first |
| `EmailSettingsPanel.js` | Collapsible panel uses profile preferences |

**Preference Keys:**
| Key | Data |
|-----|------|
| `reviewer_finder_sender_info` | Name, email, signature (JSON) |
| `reviewer_finder_grant_cycle_settings` | Program name, deadline, attachments, summary pages (JSON) |
| `reviewer_finder_email_template` | Subject and body template (JSON) |
| `reviewer_finder_current_cycle_id` | Active grant cycle selection |

**Behavior:**
- With profile: Settings stored in `user_preferences` table
- Without profile: Falls back to localStorage (backwards compatible)
- First profile use: Auto-migrates localStorage data to profile
- Profile switching: Loads that profile's saved settings

**Documentation:**
- Added "Settings Storage (Per-User)" section to CLAUDE.md

---

## Session 34 - January 20, 2026

### Multi-Proposal Email Generation Bug Fix

Fixed the bug where generating reviewer invitation emails across multiple proposals only used the first proposal's information.

**Root Cause:** Type mismatch in the proposal info Map lookup - search IDs were stored as integers but looked up as strings.

**Fix:** Added explicit string conversion when storing and looking up proposal info in the Map.

**Files Changed:**
- `pages/api/reviewer-finder/generate-emails.js` - Fixed Map key type handling

**Commits:**
- `cc30c26` - Fix multi-proposal email generation bug
- `8953341` - Fix type mismatch in proposal info Map lookup

---

## Session 35 - January 20, 2026

### Applicant Integrity Screener Implementation

Implemented a new standalone app to screen grant applicants (PIs and Co-PIs) for research integrity concerns before award decisions.

**Features:**
- **Retraction Watch Database** - Imported 68,248 retraction records for local searching
- **PubPeer Search** - SERP API integration with Claude Haiku analysis
- **Google News Search** - SERP API integration with Claude Haiku filtering
- **Multi-tier Name Matching** - Fuzzy matching with confidence scoring (50-100%)
- **SSE Streaming** - Real-time progress updates during screening
- **Dismissal System** - Mark false positives for future reference

**Database Schema (V13 Migration):**
- `retractions` - Retraction Watch data with GIN-indexed normalized author names
- `integrity_screenings` - Screening history with results
- `screening_dismissals` - False positive tracking

**Files Created:**
- `pages/integrity-screener.js` - Frontend with results display
- `pages/api/integrity-screener/screen.js` - Main screening API (SSE streaming)
- `pages/api/integrity-screener/history.js` - Screening history
- `pages/api/integrity-screener/dismiss.js` - False positive dismissal
- `lib/services/integrity-service.js` - Core screening orchestration
- `lib/services/integrity-matching-service.js` - Name matching algorithms
- `shared/config/prompts/integrity-screener.js` - Haiku prompts for analysis
- `scripts/import-retraction-watch.js` - CSV import script using pg package

**Files Modified:**
- `scripts/setup-database.js` - Added V13 migration
- `pages/index.js` - Added app to landing page
- `CLAUDE.md` - Documented new app

**Bug Fixes During Implementation:**
- Fixed ApiKeyManager prop usage (was using wrong props)
- Fixed Claude model ID for Haiku (`claude-haiku-4-20250514` → `claude-3-5-haiku-20241022`)
- Added `pg` package for Node.js v22 compatibility with database operations

**Cost Estimates:**
- SERP API: ~$0.02 per applicant (2 searches)
- Claude Haiku: ~$0.001 per applicant
- Retraction Watch search: Free (local database)

---

## Session 36 - January 21, 2026

### Integrity Screener Refinements

Improved the Applicant Integrity Screener with bug fixes and new features.

**New Features:**

1. **Markdown Export**
   - Added "Export Markdown" button alongside JSON export
   - Generates formatted report with summary, per-applicant results, and status indicators

**Bug Fixes:**

1. **Retraction Watch Display**
   - Fixed: Section only showed when matches were found
   - Now displays "Clear" status when searched with no matches
   - Shows any errors that occurred during search

2. **Middle Initial Search**
   - Fixed: "Justin Gallivan" wasn't matching "Justin P Gallivan"
   - Added text-based fallback search using LIKE patterns
   - Now correctly matches names with middle initials (95% confidence)

**Files Changed:**
- `pages/integrity-screener.js` - Added markdown export, fixed Retraction Watch display
- `lib/services/integrity-service.js` - Added text search fallback for middle initials

**Files Added:**
- `scripts/test-retractions.js` - Database search verification script

**Commits:**
- `7e06656` - Implement Applicant Integrity Screener
- `fa7f99c` - Add markdown export option to Integrity Screener
- `e764483` - Fix Retraction Watch results display in Integrity Screener
- `43c66fe` - Fix Retraction Watch search to handle middle initials

---

## Session 44 - January 30, 2026

### Comprehensive Codebase Cleanup

Performed a major codebase cleanup to remove deprecated code, unused files, and obsolete documentation.

**Impact:**
- **45 files deleted**
- **15,276 lines removed**

**Deprecated Pages Removed:**
- `pages/document-analyzer.js` - Duplicate of proposal-summarizer with worse UX
- `pages/find-reviewers.js` - Superseded by reviewer-finder.js
- `pages/find-reviewers-pro.js` - Merged into reviewer-finder.js

**Deprecated API Endpoints Removed:**
- `pages/api/find-reviewers.js`
- `pages/api/search-reviewers-pro.js`
- `pages/api/analyze-documents-simple.js`
- `pages/api/process-batch-simple.js`
- `pages/api/process-proposals-simple.js`

**Unused Components Removed:**
- `shared/components/FileUploader.js` - Replaced by FileUploaderSimple.js
- `shared/components/GoogleSearchResults.js`
- `shared/components/GoogleSearchModal.js`

**Unused Services & Utilities Removed:**
- `lib/services/scholar-service.js`
- `shared/utils/dataExtraction.js`
- `shared/utils/reviewerParser.js`
- `lib/config.js` and `lib/config.legacy.js`

**Unused Prompt Files Removed:**
- `shared/config/prompts/document-analyzer.js`
- `shared/config/prompts/batch-processor.js`
- `shared/config/prompts/find-reviewers.js`

**Root Directory Cleanup:**
Deleted 23 obsolete planning/migration markdown files:
- Config migration docs (REMAINING_API_MIGRATIONS.md, CONFIG_MIGRATION_AUDIT.md, etc.)
- Expert Reviewer planning docs (EXPERT_REVIEWERS_PRO_PLAN.md, etc.)
- Completed feature docs (ROADMAP_DATABASE_TAB.md, TIER4_SERP_GOOGLE_PLAN.md, etc.)

**Test Files Removed:**
- `test-nih-api.js`
- `tests/unit/prompts/find-reviewers.test.js`

**Files Modified:**
- `shared/config/index.js` - Removed exports for deleted prompt files

**Verification:**
- Build verified after each phase
- All 11 active applications remain functional

**Commits:**
- `5cd855c` - Slim down CLAUDE.md and move content to dedicated docs
- `13cca60` - Remove deprecated code, unused files, and obsolete documentation

---

## Session 58 - February 17, 2026

### Admin-Configurable Claude Model Overrides

Added a new admin dashboard section allowing superusers to change which Claude model each app uses — without code changes or redeployment. Available models are fetched dynamically from the Anthropic API.

**Architecture:**
- Model resolution priority: DB override → env var → hardcoded → default
- `loadModelOverrides()` async function pre-loads DB overrides into a module-level Map (5-min TTL)
- `getModelForApp()` stays synchronous — each API handler calls `loadModelOverrides()` once at the top

**New Files:**
- `pages/api/admin/models.js` — GET/PUT admin API for model overrides
- V17 migration: `system_settings` key-value table in `scripts/setup-database.js`

**Modified Files:**
- `shared/config/baseConfig.js` — Added cache, `loadModelOverrides()`, `clearModelOverridesCache()`, updated `getModelForApp()`
- `shared/config/index.js` — Re-exports
- `pages/admin.js` — New `ModelConfigSection` component (table of apps × model types with dropdowns)
- 12 API route files — Added `await loadModelOverrides()` after auth

**Bug Fixes:**
- Fixed 3 admin API endpoints (`/api/admin/models`, `/api/admin/stats`, `/api/dynamics-explorer/roles`) stalling in dev mode when `AUTH_REQUIRED=false` — applied early-return pattern from `app-access.js`
- Fixed FK constraint violation on `system_settings.updated_by` in dev mode (profileId=0 → null)

**Commits:**
- `a1e2a97` - Add admin-configurable Claude model overrides per app
- `c98b4d1` - Fix admin API endpoints stalling in dev mode
- `5da7efe` - Fix FK constraint violation when saving model overrides in dev mode

---

## Session 81 — Security Hardening: Tests, CI, Safe-Fetch (March 10, 2026)

Implemented the "Easy Wins" security hardening roadmap from the independent code review.

**Authorization Regression Tests (73 tests):**
- Auth mock helper with presets for unauthenticated, authenticated, disabled, no-profile
- Unit tests for all three auth functions + CSRF validation
- Route-level auth tests for 8 representative API endpoints
- Cross-user data isolation tests for email generation routes

**Centralized Fetch Wrapper (`safeFetch`):**
- `lib/utils/safe-fetch.js` — HTTPS-only host allowlist, manual redirect validation
- Migrated `fetchAttachment` in `generate-emails.js` and `send-emails.js`
- Fixed redirect bypass vulnerability found in code review

**CI Security Pipelines (4 new workflows):**
- Gitleaks (secret scanning), Trivy (CVE), CodeQL (static analysis), Jest (tests)
- Fixed orphaned test file and disabled aspirational coverage thresholds

**Also committed prior-session P0/P1 fixes:**
- Profile linking hardened (server-side identity, email match, already-linked guard)
- Token security comments + Semgrep rules

**Commits:**
- `c2be638` - Add security hardening: auth tests, safe-fetch, CI pipelines, PR template
- `f720976` - Add security hardening implementation summary
- `ea66438` - Fix safeFetch redirect bypass and remaining raw fetch calls
- `5395836` - Remove orphaned reviewerParser test
- `3b36957` - Disable aspirational coverage thresholds
- `c87e2a3` - Commit prior-session security fixes

---

### Session 84 — March 12, 2026

**Server-side aggregate tool for Dynamics Explorer**

Added an `aggregate` tool (11th tool) that uses OData `$apply` for exact server-side computation of sums, averages, min, max, and countdistinct. Previously Claude fetched records via `query_records` (capped at 100) and tried to sum them — producing wrong results. Now the CRM computes exact totals in a single API call with minimal token cost. Supports optional `group_by` for breakdowns (e.g., "total funding by program").

Changes across 3 files:
- `DynamicsService.aggregateRecords()` — builds `$apply` with filter/groupby/aggregate composition, restriction checks on field and groupBy
- Chat handler — 5 integration points: executeTool, summarizeToolResult, getThinkingMessage, checkRestriction (defense-in-depth for field/group_by), recordCount logging
- System prompt — added aggregate to TOOLS, added MATH rule, removed false "aggregation" claim from query_records

**Commits:**
- `f42cf99` - Add server-side aggregate tool to Dynamics Explorer for exact totals/averages

---

Last Updated: March 12, 2026
