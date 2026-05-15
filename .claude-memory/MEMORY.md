# Project Memory

## Operational
- [Verify before destructive carryover](feedback_verify_before_destructive_carryover.md) — drop/remove/retire/archive items from carryover lists must be grep-verified first. Carryover lists go stale; one nearly broke Reviewer Finder on 2026-05-03.
- [Check memory before asking the user](feedback_check_memory_before_asking_user.md) — pre-send "has X happened" items are lookup tasks, not user-confirm tasks. Scan MEMORY.md + recent commits first; rewrite stale doc framing without asking.
- [Red CI gates are P0 blockers, not side-notes](feedback_red_gates_are_p0.md) — run `check:atlas` + `check:api-routes` manually at session start. A red gate means the rubric is being violated right now — fix before any data-layer commits.
- [Surface every finding from external reviewers, don't filter](feedback_surface_full_review_findings.md) — when Codex / code-reviewer / similar raises issues, list ALL findings using the reviewer's own labels. My recommendations come after the full set, not instead of it.
- [Thoroughness is the default, not optional](feedback_thoroughness_default.md) — skimming saves session time but costs the user Codex tokens + review attention. Banner-only edits, description-only memory edits, and same-frame re-reads are unacceptable shortcuts. Surface incompleteness explicitly when it exists.
- [Codex output is verbatim, always](feedback_codex_verbatim_output.md) — every Codex round-trip in a session must paste stdout exactly as returned, no paraphrase or summary. My commentary goes after the verbatim block, never instead of it.
- [Verify external-platform claims](feedback_verify_external_platform_claims.md) — before stating Dataverse / PA / Azure / Vercel / etc. behavior, WebFetch the authoritative doc. Memory of platform shape is lossy on defaults, configurability, edge cases. Structure (matrices, tables) smuggles confidence regardless of whether claims are verified.
- [Dataverse schema-deploy gotchas](project_dataverse_schema_deploy_gotchas.md) — 429 throttling between metadata writes (wrap in 30s-backoff retry), `@odata.bind` keys are PascalCase nav-properties, queryAllRecords caps at 5000.
- [Human-legibility schema principle](feedback_human_legibility_schema_principle.md) — prefer expanding enums on existing entities over proliferating obscure child tables; non-technical staff browse Dataverse, fewer tables wins.

## Collaboration Notes
- [Concepts vs Phase I are different grant stages](feedback_concepts_vs_phase_i.md) — hard-exclude `/concept/i` files from Phase I prompt pipelines
- [Cycle gating vs. Executor scope](feedback_cycle_vs_executor_scope.md) — "cycle" only gates Connor-collaboration work; Executor is for backend-automation prompts; user-facing apps (Reviewer Finder) are independent of both
- [Codex as recurring code review surface](project_codex_recurring_review.md) — Justin runs Codex periodically; treat findings as input not to-do list, mirror the 2026-04-30 response doc shape

## Wave 1 Prod Migration (CLOSED 2026-05-12)
- [Wave 1 closeout](project_wave1_pending.md) — Postgres tables dropped 2026-05-12; dispatcher defaults flipped to Dataverse. Only tail item: elevation revert on prod app user (deferred until pilot iteration settles).
- [Automated onboarding design](project_wave1_onboarding.md) — zero-touch first-login provisioning via NextAuth callback; design still relevant for future build

## Wave 2 Pending Tail Items
- [W6 Postgres table-drop pending (fire ≥ 2026-07-01)](project_w6_table_drop_pending.md) — drain-only reviewer tables (researchers / researcher_keywords / publications / proposal_searches) await one-shot DELETE + DROP. P0 start-of-session item if today ≥ 2026-07-01 and tables still exist.

## Repo Hygiene Triggers
- [Archive intake meeting agenda (fire ≥ 2026-05-27)](project_intake_meeting_agenda_cleanup.md) — `git mv` `docs/INTAKE_PORTAL_MEETING_AGENDA_2026-05-13.md` to `docs/archive/` once meeting decisions have landed in design + schema-changes docs.

## Planned Capabilities
- [IRS tax-exempt verification](project_irs_exempt_verification.md) — bulk CSVs in Postgres, PA→Vercel lookup endpoint, verified result written back to Dynamics `account`.

## Strategic Direction
- [Strategy direction + key decisions](project_strategy_direction.md) — AkoyaGO posture (minimize, not replace), Dynamics as ground truth, backend triggers, Connor collaboration. See `docs/STRATEGY.md` for full doc.
- [Backend Automation Vision](project_backend_automation.md) — PowerAutomate-triggered processing, configurable prompts, Dynamics write-back
- [Interim grant report auto-evaluation](project_interim_report_automation.md) — backend job to evaluate yearly interim reports + write to Dynamics. Blocked on Dynamics write access.
- [Staged Review Pipeline](project_staged_review_pipeline.md) — 3-stage automated triage (fit screen → intelligence brief → virtual panel) for new cycle's higher volume
- [Proposal Context Extraction](project_proposal_context_extraction.md) — pre-extract structured fields so downstream calls use curated ~1.5K-token extracts instead of full ~7K-token proposals. Full plan at `docs/PROPOSAL_CONTEXT_EXTRACTION_PLAN.md`
- [Phase I summary app winddown](project_phase_i_summary_app_winddown.md) — strategic deprioritization, NOT a freeze. `/phase-i-dynamics` still actively iterated as a prompt-tuning surface.
- [Dynamics as staff-prompt ground truth](project_dynamics_as_prompt_ground_truth.md) — `wmkf_ai_prompt` should hold all staff-facing prompts; new prompts default there; migrate user-driven apps when touched.
- [App roadmap 2026-04-25](project_app_roadmap_2026-04-25.md) — Concept Evaluator deprecating; Grant Reporting + Integrity Screener growing PA triggers; Reviewer Finder is top post-cycle priority.
- [Grant phasing evolution](project_grant_phasing_evolution.md) — reviewer-finding only at Phase II; concepts going away; next cycle: one applicant-facing package, internal Phase I/II labels persist.

## Intake Portal (GOapply replacement)
- [External ID auth foundation SHIPPED (S129)](project_intake_portal_external_id_foundation.md) — tenant `04a1406b...`, NextAuth `entra-external` provider, `/apply` route auth round-trip verified.
- [Skinny pilot scope, not feature-for-feature](project_intake_portal_skinny_scope.md) — pilot sized like external reviewer intake; Phase II Research mid-June 2026; design doc at `docs/INTAKE_PORTAL_DESIGN.md`
- [Capture machine-legible structured data](project_machine_legible_form_capture.md) — split budgets/rosters/milestones into structured fields, not narrative; Sarah + Connor own form wishlists
- [Pilot decisions locked 2026-05-06](project_intake_portal_pilot_decisions_2026-05-06.md) — six-decision walkthrough w/ Connor. **Items 1C + 1D superseded by 2026-05-13 entry.**
- [Pilot Track 1 decisions 2026-05-13](project_intake_portal_pilot_decisions_2026-05-13.md) — 4 Track-1 items closed (1A membership Option A, 1B PA flows origin-agnostic, 1C reversed to PA-built packet, 1D narrowed to budget+roster)
- [Reviewer migration plan locked S136](project_reviewer_postgres_to_dataverse_migration.md) — 1:1 model; most Postgres tables drain not migrate; auth doc `docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md`
- [Dataverse creator privileges delegated](project_dataverse_creator_privileges.md) — Connor 2026-05-06 OK'd direct entity creation for pilot scope; maintain `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md` audit catalog
- [Slice-0 wmkf_role pre-deploy probe](project_slice0_role_probe.md) — use `scripts/probe-apprequestperson-role-data.js` NOT `dynamics-schema-diff.js`; CLEAR 2026-05-15 (5,561 rows, none in 100000002–4); re-run at deploy time
- [Slice-0 scope is 4 items not 3](project_slice0_scope.md) — carryover C dropped `wmkf_portal_membership`; trust the 2026-05-14 SCHEMA_CHANGES catalog, wave dir = wave4

## Dynamics Explorer
- [Multi-library + subfolder document listing shipped](project_dynamics_explorer_archive_libs.md) — `list_documents` and `search_documents` walk archives + nested folders via `lib/utils/sharepoint-buckets.js`
- [Tool-result serializer SHIPPED](project_dynamics_explorer_serializer_deferred.md) — `lib/utils/dynamics-explorer-serializer.js` redacts sensitive fields + caps long strings
- [Dataverse Search API + perf optimizations](project_dynamics_explorer_details.md) — Search API enabled (77K+ docs), inline schemas, parallel execution, SSE streaming
- [Schema discovery: prefer the diff tool](project_dynamics_explorer_schema_diff.md) — `scripts/dynamics-schema-diff.js` enumerates ALL Dataverse attributes; older `dynamics-schema-map.js` silently drops sparsely-populated fields

## Dynamics CRM
- [CRM users + licensing](project_dynamics_crm_users.md) — 16 licensed staff (@wmkeck.org) + ~180 service accounts; OBO not recommended due to complexity
- [Identity reconciliation SHIPPED](project_dynamics_identity_reconciliation.md) — DB bridge + MSCRMCallerID + adapter chain + token lifecycle (S127–S129). Delegate role granted 2026-05-06; impersonation smoke PASS.
- [Email activities](project_dynamics_email.md) — `SendEmail` bound action; sender party must include `partyid_systemuser@odata.bind`; methods in `dynamics-service.js`
- [OData API limitations](project_dynamics_crm_limitations.md) — `$skip` unsupported; `$count` endpoint fails with complex filters; `_formatted` fields not in `$select`
- [AI fields — v3 canonical, all sets deployed](project_dynamics_ai_writeback.md) — 28 wmkf_ai_* fields on akoya_request deployed 2026-05-07; canonical field names in v3 spec
- [akoya_request PD fields](project_akoya_request_pd_fields.md) — `wmkf_programdirector` is lead PD; `wmkf_programdirector2` does NOT assign reviewers; `ownerid` is integration service account
- [Grant lifecycle states confirmed (2026-05-01)](project_grant_lifecycle_states_confirmed.md) — `akoya_requeststatus` string: 'Concept Pending' → 'Phase I Pending' → 'Phase II Pending'

## SharePoint
- [SharePoint document integration](project_sharepoint_integration.md) — site URL, folder pattern, multi-library layout (akoya_request + 3 archives), Graph API service, Sites.Selected permissions

## Reviewer Lifecycle
- [Reviewer lifecycle automation plan](project_reviewer_lifecycle.md) — phased plan (A-D); Phase A (CRM send) is foundation
- [Lifecycle tracking → automation goal](project_reviewer_lifecycle_automation.md) — schema's manual timestamp/status fields designed for cron-driven reminders + state machine in Wave 2
- [Accept/decline magic links](project_reviewer_accept_decline_links.md) — HMAC primitive shipped; build atop existing token, don't add new secret
- [Reviewer Finder Dataverse-native entry path](project_reviewer_finder_dataverse_entry_path.md) — fully Dataverse-native (W3–W6 cutovers complete 2026-05-12); Postgres reviewer tables are drain-only, scheduled for deletion ≥ 2026-07-01 per W6 plan
- [Contact promotion verified working](project_contact_promotion_permission.md) — AppendTo on Contact (BU) granted 2026-05-01; send-emails fully links potentialreviewer → contact
- [External reviewer file access architecture](project_external_reviewer_file_access.md) — SHIPPED 2026-05-03. Token primitive, /external/* endpoints, SharePoint upload, event-driven token expiry all live.
- [Reviewer count invariant](project_reviewer_count_invariant.md) — need 3 confirmed reviewers per proposal; 5 wmkf_potentialreviewer slots are over-invite buffer
- [Reviewer history data quality](project_reviewer_history_data_quality.md) — pre-J26 proposals have no Postgres rows; zeros are "unknown", not "0 invited"

## App Infrastructure
- [App-level access control](project_app_access_control.md) — Dataverse `wmkf_appuserappaccesses`; appRegistry.js source of truth; `requireAppAccess()` on all ~30 endpoints
- [Admin dashboard + API keys](project_admin_dashboard.md) — centralized server-side keys; usage logged to `api_usage_log`; Justin (id=2) is superuser
- [Virtual Review Panel](project_virtual_review_panel.md) — Multi-LLM panel (Claude, GPT, Gemini, Perplexity); app key `virtual-review-panel`; stays Postgres permanently
- [Tone calibration](feedback_review_panel_tone.md) — CSO feedback: don't mimic conservative study sections; balance critique with upside
- [API Credit Monitoring](project_api_credit_monitoring.md) — admin dashboard widget + low-balance email alerts

## Prompt + Execution
- [Prompt storage strategy + Executor Contract](project_prompt_storage_strategy.md) — Path B (declarative wrappers). Spec: `docs/EXECUTOR_CONTRACT.md`. Table: `wmkf_ai_prompt`. Implementation: `lib/services/execute-prompt.js`.
- [PDF Processing Tiers](project_pdf_processing_tiers.md) — text-only for auto/bulk, full PDF vision for selective/detailed

## New AI Capabilities
- [Compliance + Staff Matching](project_new_ai_capabilities.md) — batch eval on historical data → auto-deploy via PowerAutomate

## Dev Environment
- [Dev environment](project_dev_environment.md) — `npm run dev` port 3000; auth off in dev; `.env.local` values are quoted; WAVE1 flags mirror prod since 2026-05-11

## User Context
- [PA Experience](user_powerautomate.md) — Justin: no experience; Connor: moderate. Write flow specs at middle detail.
