# Project Memory

## Operational
- [Verify before destructive carryover](feedback_verify_before_destructive_carryover.md) — drop/remove/retire/archive items from carryover lists must be grep-verified first. Carryover lists go stale; one nearly broke Reviewer Finder on 2026-05-03.
- [Check memory before asking the user](feedback_check_memory_before_asking_user.md) — pre-send "has X happened" items are lookup tasks, not user-confirm tasks. Scan MEMORY.md + recent commits first; rewrite stale doc framing without asking.

## Collaboration Notes
- [Concepts vs Phase I are different grant stages](feedback_concepts_vs_phase_i.md) — hard-exclude `/concept/i` files from Phase I prompt pipelines
- [Cycle gating vs. Executor scope](feedback_cycle_vs_executor_scope.md) — "cycle" only gates Connor-collaboration work; Executor is for backend-automation prompts; user-facing apps (Reviewer Finder) are independent of both
- [Codex as recurring code review surface](project_codex_recurring_review.md) — Justin runs Codex periodically; treat findings as input not to-do list, mirror the 2026-04-30 response doc shape

## Wave 1 Prod Migration
- [Wave 1 pending follow-ups](project_wave1_pending.md) — prod cutover done 2026-04-24; two TODO: flip Vercel flags per `docs/WAVE1_VERCEL_FLAG_ROLLOUT.md`; remove temp role elevations per `docs/WAVE1_REVERT_TEMP_ELEVATIONS.md`
- [Automated onboarding design](project_wave1_onboarding.md) — zero-touch first-login provisioning via NextAuth callback; build after flags flip, not before

## Strategic Direction
- See `docs/STRATEGY.md` for full strategy and [project_strategy_direction.md](memory/project_strategy_direction.md) for key decisions
- **Minimize reliance on AkoyaGO**, don't plan to replace — vendor/licensing dependency unresolved
- **Dynamics/Dataverse is ground truth** for all organizational data long-term
- Researcher/reviewer data currently in Postgres belongs in CRM long-term (paid API calls, reusable expertise)
- **Backend triggers are the future** — same API calls, initiated by status changes not user uploads
- [Backend Automation Vision](project_backend_automation.md) — PowerAutomate-triggered processing, configurable prompts, Dynamics write-back
- [Interim grant report auto-evaluation](project_interim_report_automation.md) — TODO: backend job to evaluate yearly interim reports + write to Dynamics. Blocked on Dynamics write access.
- Connor (Foundation staff, AkoyaGO expert) collaborating on backend vision — planning sessions in coming weeks
- Grant cycle is being redesigned (concepts changing, Phase I may be eliminated)
- [Staged Review Pipeline](project_staged_review_pipeline.md) — 3-stage automated triage (fit screen → intelligence brief → virtual panel) for new cycle's higher volume
- [Proposal Context Extraction](project_proposal_context_extraction.md) — for the single-phase cycle (2 out), pre-extract structured fields in initial Claude pass so downstream deep-dive calls use curated ~1.5K-token extracts instead of full ~7K-token proposals. Compounds with expensive models + multi-LLM panels. Full plan at `docs/PROPOSAL_CONTEXT_EXTRACTION_PLAN.md`
- `Sites.Selected` granted with **write role on akoyaGO site (2026-04-15)** — verified end-to-end via `scripts/probe-sharepoint-write.js` on 2026-05-01 (PUT + DELETE round-trip on `akoya_request` library both succeed); **Dynamics write access granted & verified 2026-04-14** (see Dynamics AI Writeback)
- [Phase I summary app winddown](project_phase_i_summary_app_winddown.md) — strategic deprioritization, NOT a freeze. `/phase-i-dynamics` still actively iterated as a prompt-tuning surface (v2 PromptResolver, A/B scripts). Backend automation owns volume.
- [Dynamics as staff-prompt ground truth](project_dynamics_as_prompt_ground_truth.md) — `wmkf_ai_prompt` should hold all staff-facing prompts (content readable/editable by non-technical staff). New prompts default there; migrate user-driven apps when touched. Discoverability principle: one table everyone can browse vs. scattered `.js`.
- [App roadmap 2026-04-25](project_app_roadmap_2026-04-25.md) — Concept Evaluator deprecating; Grant Reporting + Integrity Screener growing PA triggers (dual-caller); Reviewer Finder is top post-cycle priority and may need agent-loop support outside Executor contract.
- [Reviewer Finder Dataverse-native entry path](project_reviewer_finder_dataverse_entry_path.md) — picker + save-candidates SHIPPED. Postgres reviewer tables are NOT dormant — still load-bearing for browse/email/grant-cycles flows. Do not drop.
- [Contact promotion verified working](project_contact_promotion_permission.md) — AppendTo on Contact (BU) granted 2026-05-01; send-emails fully links potentialreviewer → contact
- [External reviewer file access architecture](project_external_reviewer_file_access.md) — SHIPPED 2026-05-03. Token primitive, /external/* endpoints, SharePoint upload, event-driven token expiry all live. Reusable for intake portal.
- [akoya_request PD fields](project_akoya_request_pd_fields.md) — `wmkf_programdirector` is the lead PD (filter on this); `wmkf_programdirector2` is secondary and does NOT assign reviewers; `ownerid` is the integration service account, not the PD
- [Grant phasing evolution](project_grant_phasing_evolution.md) — reviewer-finding only at Phase II; concepts going away; next cycle: one applicant-facing package, internal Phase I/II labels persist (Phase II becomes a label change, not a new doc)
- [Reviewer count invariant](project_reviewer_count_invariant.md) — we need 3 confirmed reviewers per proposal; the 5 wmkf_potentialreviewer1..5 slots are over-invite buffer for declines (not a "filled" target)
- [Reviewer history data quality](project_reviewer_history_data_quality.md) — pre-J26 proposals have no Postgres rows (tool didn't exist or wasn't used); zeros aren't "0 invited", they're "unknown"
- [Grant lifecycle states confirmed (2026-05-01)](project_grant_lifecycle_states_confirmed.md) — `akoya_requeststatus` is a string field with values 'Concept Pending' → 'Phase I Pending' → 'Phase II Pending'; picker filters to the third only; new submissions are 'Phase I Pending'

## Intake Portal (GOapply replacement)
- [External ID auth foundation SHIPPED (S129)](project_intake_portal_external_id_foundation.md) — tenant `04a1406b...`, NextAuth `entra-external` provider, `/apply` route auth round-trip verified. Membership/forms/Dynamics writes still ahead.
- [Skinny pilot scope, not feature-for-feature](project_intake_portal_skinny_scope.md) — pilot sized like external reviewer intake; Phase II Research mid-June 2026; design doc at `docs/INTAKE_PORTAL_DESIGN.md`
- [Capture machine-legible structured data](project_machine_legible_form_capture.md) — split budgets/rosters/milestones into structured fields, not narrative; Sarah + Connor own form wishlists

## Dynamics Explorer
- [Multi-library + subfolder document listing shipped](project_dynamics_explorer_archive_libs.md) — `list_documents` and `search_documents` now walk archives + nested folders via `lib/utils/sharepoint-buckets.js`
- [Tool-result serializer SHIPPED](project_dynamics_explorer_serializer_deferred.md) — Codex AI_DATA_FLOW_MATRIX P1 #2 — model-context minimization (NOT Dataverse RBAC). `lib/utils/dynamics-explorer-serializer.js` redacts sensitive/loopback fields + caps long strings; passthrough for describe_table / count_records / list_documents / search_documents.
- **Dataverse Search API** is enabled on the CRM instance (77K+ docs, 154MB index)
  - Endpoint: `{DYNAMICS_URL}/api/search/v1.0/query`
  - Searches all indexed text fields across tables simultaneously
  - Returns `@search.entityname`, `@search.objectid`, `@search.score`, `@search.highlights`
  - Highlights use `{crmhit}` / `{/crmhit}` tags
  - Query auto-expansion: "fungi" → "(fungus* | fungi)^2 OR (fungi~1)"
  - Entity filter format: `entities: [{ name: 'akoya_request' }]`
- **`wmkf_abstract`** field exists on `akoya_request` — full proposal abstract text, not in original schema but now added
- [Schema discovery: prefer the diff tool over the sample mapper](project_dynamics_explorer_schema_diff.md) — `scripts/dynamics-schema-diff.js` enumerates ALL Dataverse attributes via EntityDefinitions and reports gaps vs. inline annotations; the older `dynamics-schema-map.js` samples 25 records and silently drops sparsely-populated fields (this is why `wmkf_ai_summary` was missing until 2026-05-05).
- **Performance optimizations applied** — inline schemas for top 4 tables (saves 1 round-trip), parallel tool execution, streaming final response via `text_delta` SSE events, React.memo/useMemo on MessageBubble

## Dynamics CRM Users
- **16 licensed staff users** (Read-Write, `@wmkeck.org`) + ~180 Microsoft service accounts
- All staff already have Dynamics licenses — OBO flow would not require additional licensing (but is not recommended due to complexity)
- [Identity reconciliation SHIPPED](project_dynamics_identity_reconciliation.md) — DB bridge + MSCRMCallerID on user-driven writes + adapter chain + token lifecycle (S127–S129). Preview flag flipped + smoked S132 (2026-05-05); rollout BLOCKED on Connor granting **Delegate** role to app user `# WMK: Research Review App Suite` (app user lacks `prvActOnBehalfOfAnotherUser`). 403 fallback keeps prod safe; preview flag left on.

## SharePoint Document Integration
- Documents attached to requests are stored in **SharePoint**, not Dynamics
- **SharePoint site:** `https://appriver3651007194.sharepoint.com/sites/akoyaGO`
- Dynamics links via `sharepointdocumentlocation` entity (filter: `_regardingobjectid_value eq '{GUID}'`)
- Folder pattern: `{RequestNumber}_{GUIDNoHyphensUppercase}` (e.g., `1001289_EEC6F39CE7D4EF118EE96045BD082F70`)
- `sharepointdocument` virtual entity does NOT work via Web API
- **`lib/services/graph-service.js`** — Graph API service with SharePoint file listing/download, separate token cache from Dynamics
- `Sites.Selected` permission **granted** with both read AND write roles on the akoyaGO site (write granted 2026-04-15, verified end-to-end 2026-05-01 via `scripts/probe-sharepoint-write.js`). Note: `Sites.Selected` is the singular Graph permission name — read vs. write is set per-site at authorization time via `POST /sites/{id}/permissions`, not as separate Azure-portal permissions.
- IT security response: `docs/IT_SECURITY_RESPONSE.md`
- **Multiple document libraries hold request files** — `akoya_request` is the active library (the one Dynamics tracks via `sharepointdocumentlocations`), but `RequestArchive1`, `RequestArchive2`, and `RequestArchive3` hold migrated content from a previous grants management system. Older grants (e.g. 2023-vintage) often have their full file set — proposal, biosketches, budget, referee reviews, interim reports, award letters — in one of the archive libraries instead. Folder naming convention is identical (`{requestNumber}_{guidNoHyphensUpper}`), so callers can probe all archives speculatively in parallel and tolerate 404s. **Shared helper:** `lib/utils/sharepoint-buckets.js` `getRequestSharePointBuckets(requestId, requestNumber)` returns all plausible buckets — used by both `lookup-grant.js` and Dynamics Explorer's `list_documents`/`search_documents`.
- Migrated grants frequently keep files in subfolders (`Final Report/`, `Year 1/`, etc.) — `GraphService.listFiles(library, folder, { recursive: true })` walks them depth-first; each returned file carries its actual `folder` path so downloads route correctly.
- Concrete confirmation: request 993879 (Carter/UNC-CH) — Project Narrative lives in `RequestArchive3`, NOT `akoya_request`.

## Dynamics AI Writeback
- [AI fields — v3 canonical, write access verified](project_dynamics_ai_writeback.md) — Field Sets A/C/D ready, Set B on hold (reporting scope); canonical field names in v3 spec, NOT v2; `prvCreateNote` not in grant

## Dynamics Email Activities
- **Email sending is WORKING** (as of Session 77)
- `SendEmail` is a **bound action**: `emails({id})/Microsoft.Dynamics.CRM.SendEmail` with `{ IssueSend: true }`
- Sender party **must** include `partyid_systemuser@odata.bind` — plain `addressused` alone causes "Invalid sender party" error
- `resolveSystemUser(email)` looks up `systemuserid` by `internalemailaddress`
- CRM tracking token (e.g., `CRM:0309001`) prepended to subject by Dynamics Server-Side Sync (org-wide setting, not our code)
- Methods in `dynamics-service.js`: `resolveSystemUser`, `createEmailActivity`, `addEmailAttachment`, `sendEmail`, `createAndSendEmail`
- Test client: `/test-email` page + `/api/test-email` endpoint
- Test script: `scripts/test-dynamics-email.js`

## Dynamics CRM Limitations
- **`$skip` is NOT supported** — Dynamics CRM error `0x80060888: "Skip Clause is not supported in CRM"`. Do NOT add `$skip` to OData queries. Pagination must use keyset approach (filter on last value) or just increase result limits.
- **`$count` endpoint** fails with complex filters (Edm.Int32 error) — use `$count=true` query parameter instead
- **`_formatted` fields** cannot appear in `$select` — auto-returned via `Prefer: odata.include-annotations="*"` header

## Virtual Review Panel
- [Virtual Review Panel](project_virtual_review_panel.md) — Multi-LLM review panel (Claude, GPT, Gemini, Perplexity) with claim verification + structured review + synthesis
- [Tone calibration](feedback_review_panel_tone.md) — CSO feedback: don't mimic conservative study sections; balance critique with upside
- New env vars needed: `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`, `PERPLEXITY_API_KEY`
- App key: `virtual-review-panel` — NOT in DEFAULT_APP_GRANTS, access via admin dashboard
- DB tables: `panel_reviews`, `panel_review_items` (V24 migration)

## App-Level Access Control
- **`user_app_access`** table (V16 migration) — per-user app grants with `(user_profile_id, app_key)` unique constraint
- **`shared/config/appRegistry.js`** — single source of truth for all 15 app definitions (keys, names, icons, categories, descriptions). Used by Layout nav, home page, admin dashboard, and access control
- **`shared/context/AppAccessContext.js`** — React context fetches `/api/app-access` on mount, exposes `hasAccess(appKey)`, `isSuperuser`
- New users get only `dynamics-explorer` by default (configured in `DEFAULT_APP_GRANTS` in appRegistry.js)
- **API-level enforcement active** — `requireAppAccess(req, res, ...appKeys)` on all ~30 app endpoints

## Admin Dashboard & API Keys
- API keys are **centralized server-side** — all routes use `process.env.CLAUDE_API_KEY`, users no longer provide their own
- Usage logged to `api_usage_log` table (model, tokens, cost estimate, latency per request)
- Admin dashboard at `/admin` — health status + usage analytics + role management + app access management
- Justin (id=2) has superuser role granted

## Reviewer Lifecycle Automation
- [project_reviewer_lifecycle.md](memory/project_reviewer_lifecycle.md) — Phased plan (A-D) for automating full reviewer lifecycle
- Phase A (CRM send) is foundation; Phases B-D build on top
- [Lifecycle tracking → automation goal](project_reviewer_lifecycle_automation.md) — current schema's manual timestamp/status fields should be designed for cron-driven reminders + status transitions; consolidate into clean state machine in Wave 2 Dataverse schema
- [Accept/decline magic links](project_reviewer_accept_decline_links.md) — HMAC primitive shipped under broader external-reviewer landing. Dedicated accept/decline buttons NOT built; build atop existing token, don't add new secret.

## New AI Capabilities
- [Compliance + Staff Matching](project_new_ai_capabilities.md) — batch eval on historical data → auto-deploy via PowerAutomate

## Prompt Storage + Executor Contract (Phase 0 in flight for May 1 2026)
- [Phased plan + decisions](project_prompt_storage_strategy.md) — Path B (declarative wrappers, generic executors in PA+Vercel). Authoritative shared spec: **`docs/EXECUTOR_CONTRACT.md`**. Table is `wmkf_ai_prompt` (NOT `wmkf_prompt_template`); field names renamed accordingly. Separate **function** (prompt row) from **process** (Flow). Chains composed by caller, Executor runs one prompt per invocation. Two chain shapes: sequential (`prior_output`) + parallel-consumer (`context_block`). Naming: `<domain>.<purpose>`.

## PDF Processing
- [PDF Processing Tiers](project_pdf_processing_tiers.md) — text-only for auto/bulk, full PDF vision for selective/detailed

## PowerAutomate
- [PA Experience](user_powerautomate.md) — Justin: no experience; Connor: moderate. Write flow specs at middle detail.

## API Credit Monitoring
- [API Credit Monitoring](project_api_credit_monitoring.md) — admin dashboard widget + low-balance email alerts (ran out during batch run)

## Dev Environment
- Dev server: `npm run dev` on port 3000
- Auth disabled in dev (`AUTH_REQUIRED=false` in .env.local)
- `.env.local` values are quoted (e.g., `DYNAMICS_URL="https://..."`) — scripts that parse it must strip quotes

# currentDate
Today's date is 2026-03-17.
