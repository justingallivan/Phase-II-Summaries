# Application State Atlas

**Created:** 2026-05-07 (S137, Phase 1 of `docs/CLAUDE_REMEDIATION_PLAN.md`)
**Probe scripts:** `scripts/audit-postgres-state.js`, `scripts/audit-dataverse-state.js`

## Claim labeling

Per remediation rule #1 (probe-before-plan), every state claim across the Atlas pages should be labeled:
- **[VERIFIED YYYY-MM-DD via X]** — actually probed (live audit, grep, file read)
- **[ASSUMED — per Y]** — sourced from a memory entry, design doc, or prior session decision; not re-verified

**Default:** unlabeled headers (Schema / Read paths / Write paths) are derived from probes; their content is verified unless explicitly marked otherwise. Migration-disposition / planned-additions / locked-decisions blocks are assumptions and labeled as such.

If a claim is unlabeled and you can't tell which kind it is, treat it as `[ASSUMED]` and probe before acting.

The canonical reference for the live state of the application's data layer.

> **How to use this:** before any data-layer plan claim ("X is the source of truth," "Y is empty," "Z has no Dataverse counterpart"), find the relevant per-entity page below and cite it. If the page is older than 60 days and the work is destructive, re-run the probe script first and update the page.

## Per-entity pages

### Reviewer-finder domain (Postgres)

| Table | Rows | Status | Page |
|---|---:|---|---|
| `researchers` | 331 | active | [postgres-researchers.md](atlas/postgres-researchers.md) |
| `publications` | 0 | dead writer | [postgres-publications.md](atlas/postgres-publications.md) |
| `researcher_keywords` | 1,028 | active | [postgres-other-reviewer-tables.md](atlas/postgres-other-reviewer-tables.md) |
| `reviewer_suggestions` | 337 | mirror (~99% parity to Dataverse) | [postgres-reviewer-suggestions.md](atlas/postgres-reviewer-suggestions.md) |
| `grant_cycles` | 13 | sole source — load-bearing | [postgres-grant-cycles.md](atlas/postgres-grant-cycles.md) |
| `proposal_searches` | 0 | dead | [postgres-other-reviewer-tables.md](atlas/postgres-other-reviewer-tables.md) |
| `search_cache` | 0 | dead | [postgres-other-reviewer-tables.md](atlas/postgres-other-reviewer-tables.md) |

### Reviewer-finder domain (Dataverse)

| Entity | Rows | Status | Page |
|---|---:|---|---|
| `wmkf_appresearcher` | 334 | active sidecar to potentialreviewers | [dataverse-wmkf-appresearcher.md](atlas/dataverse-wmkf-appresearcher.md) |
| `wmkf_appreviewersuggestion` | 336 | active lifecycle ledger | [dataverse-wmkf-appreviewersuggestion.md](atlas/dataverse-wmkf-appreviewersuggestion.md) |
| `wmkf_potentialreviewers` (vendor + ext.) | 4,267 | per-person scratch+history (drains via cleanup cron) | [dataverse-wmkf-potentialreviewers.md](atlas/dataverse-wmkf-potentialreviewers.md) |
| `wmkf_apppublication` | 0 | deployed, no callers | [dataverse-wmkf-apppublication-and-appgrantcycle.md](atlas/dataverse-wmkf-apppublication-and-appgrantcycle.md) |
| `wmkf_appgrantcycle` | 0 | deployed (partial schema), no callers | same page |
| `wmkf_appproposalsearch` | n/a | NOT DEPLOYED (schema-as-code only) | same page |
| `wmkf_app_z_publication_author` | n/a | NOT DEPLOYED | same page |
| `wmkf_apprequestperson` | 5,561 | active junction (S139); awaiting Connor PA dual-write | [dataverse-wmkf-apprequestperson.md](atlas/dataverse-wmkf-apprequestperson.md) |

### Vendor entities (master records)

| Entity | Rows | Status | Page |
|---|---:|---|---|
| `akoya_request` | 5,000+ | master grant-request record | [dataverse-akoya-request.md](atlas/dataverse-akoya-request.md) |
| `contact` | 5,000+ | reviewer promotion target | (covered in adapter `lib/dataverse/adapters/contact.js`) |
| `account` | 4,601 | organization pivot | (Wave 2 intake portal will extend) |
| `systemuser` | 222 | internal staff | (used for impersonation; see `dataverse-identity-map.js`) |
| `wmkf_ai_run` | 325 | append-only AI invocation audit ledger | [dataverse-wmkf-ai-run-and-prompt.md](atlas/dataverse-wmkf-ai-run-and-prompt.md) |
| `wmkf_ai_prompt` | 10 | staff-editable prompt rows for Executor | same page |

### Vendor entities — Dynamics Explorer read-only

The Dynamics Explorer (`pages/api/dynamics-explorer/chat.js`) traverses several vendor entities for natural-language queries. These are **read-only from the app's perspective** — no migration scope, no app-owned writes.

| Entity set | Purpose |
|---|---|
| `akoya_programs` | Grant program definitions; lookup target from `akoya_request.wmkf_grantprogram` |
| `akoya_requestpayments` | Per-request payment ledger; explorer payments tool reads here |
| `annotations` | Vendor-standard Dataverse notes entity; explorer annotations tool reads. App registration does NOT have `prvCreateNote` (per `project_dynamics_ai_writeback.md`) — read-only by design. |

Promote any of these to a per-entity page if app code starts writing to it.

### Other Postgres (compact summary, promote on touch)

| Group | Tables | Page |
|---|---|---|
| Identity / app access (Wave 1) | `user_profiles`, `user_app_access`, `user_preferences`, `system_settings` | [postgres-infra-tables.md](atlas/postgres-infra-tables.md) |
| Dynamics Explorer state | `dynamics_query_log`, `dynamics_feedback`, `dynamics_user_roles`, `dynamics_restrictions` | same |
| Expertise Finder | `expertise_roster`, `expertise_matches` | same |
| Integrity Screener | `integrity_screenings`, `screening_dismissals`, `retractions` | same |
| Virtual Review Panel | `panel_reviews`, `panel_review_items` | same |
| Intake portal (pre-pilot) | `intake_drafts`, `intake_audit` | same |
| Monitoring | `health_check_history`, `system_alerts`, `maintenance_runs`, `api_usage_log` | same |

## Adapter inventory (`lib/dataverse/adapters/`)

| File | Entity set | Methods | Callers |
|---|---|---|---|
| `researcher.js` | `wmkf_appresearchers` | `getByPotentialReviewer`, `upsertByPotentialReviewer`, `updateById` | `pages/api/reviewer-finder/{save-candidates,my-candidates}.js` |
| `potential-reviewer.js` | `wmkf_potentialreviewerses` | `getByEmail`, `getById`, `upsertByEmail`, `update`, `setContactLink` | `pages/api/reviewer-finder/{save-candidates,my-candidates}.js`, `pages/api/review-manager/send-emails.js` |
| `reviewer-suggestion.js` | `wmkf_appreviewersuggestions` | `findByPotentialReviewerAndRequest`, `findByRequest`, `findByPD`, `findAcceptedByPD`, `upsert`, `updateLifecycle`, `softDelete`, `bulkUpdateByRequest`, `findById` | `pages/api/reviewer-finder/{save-candidates,my-candidates}.js`, `pages/api/review-manager/{render-emails,send-emails,reviewers}.js` |
| `contact.js` | `contacts` | `findByEmail`, `findOrCreateByEmail` | `pages/api/review-manager/send-emails.js` |

No adapter exists yet for: `wmkf_apppublication`, `wmkf_appgrantcycle`, `wmkf_appproposalsearch`, `akoya_request` (accessed direct via `DynamicsService`).

## Service-layer inventory (`lib/services/`)

The high-leverage services for data-layer work — full source remains authoritative.

| Service | Postgres tables touched | Dataverse access | Notes |
|---|---|---|---|
| `database-service.js` | most reviewer-side + `user_profiles`, `api_usage_log`, `system_settings`, etc. | none | central Postgres gateway; Wave 1 dispatch dispatches some methods to Dataverse equivalents |
| `discovery-service.js` | `researchers` (read), `publications` (read, dead), `researcher_keywords` (read) | none | calls `DatabaseService.findResearcher` (1 of 3 callers) |
| `deduplication-service.js` | `researchers` (read) | none | calls `DatabaseService.findResearcher` (2 of 3) |
| `contact-enrichment-service.js` | `researchers` (write via `createOrUpdateResearcher`) | none | Codex round-3 #3: this is an active writer (3rd `findResearcher` caller too) |
| `dynamics-service.js` | none | all entities | canonical Dataverse client (OAuth, OData, search, email, `updateIfEmpty`, `logAiRun`, impersonation) |
| `dynamics-context.js` | none | all | AsyncLocalStorage scoping for restrictions |
| `dynamics-identity-service.js` | `user_profiles` (read) | `systemusers` (read) | impersonation contract (`MSCRMCallerID`) |
| `dataverse-identity-map.js` | `user_profiles` | `systemusers` | bridge resolver |
| `program-director-resolver.js` | none | `systemusers` (read) | email → `systemuserid` |
| `app-access-service.js` / `dataverse-app-access-service.js` | `user_app_access` | (Wave 1 dispatch) | `WAVE1_BACKEND_APP_ACCESS` |
| `settings-service.js` / `dataverse-settings-service.js` | `system_settings` | (Wave 1 dispatch) | `WAVE1_BACKEND_SETTINGS` |
| `dataverse-prefs-service.js` | `user_preferences` | (Wave 1 dispatch) | `WAVE1_BACKEND_PREFS` |
| `prompt-resolver.js` | none | **`wmkf_ai_run` scratch row** (read, 5-min cache) — NOT `wmkf_ai_prompt` (Session 103 holdover; will swap when v3 path matures) | falls back to bundled `.js` modules unless `PROMPT_RESOLVER_STRICT=true` |
| `execute-prompt.js` | none — calls Claude API directly via `fetch()`, does NOT route through `llm-client.js` | `wmkf_ai_prompts` (read), `akoya_requests` (read for overwrite check ≈line 504, **write target field at ≈line 511** based on prompt's declared `target.field`), `wmkf_ai_runs` (write audit with FKs to prompt + request) | Executor contract; **dynamically writes to `akoya_request` flat fields** (e.g. `wmkf_ai_summary`) — the Executor is the canonical writer for prompts that declare a target |
| `llm-client.js` | `api_usage_log` (write via DatabaseService) | none | canonical Anthropic wrapper |
| `intake-draft-service.js` | `intake_drafts` (R/W) | none | drafts cleared on submit |
| `intake-audit-service.js` | `intake_audit` (write append-only) | none | sha256-hashed |
| `integrity-service.js`, `integrity-matching-service.js` | `integrity_screenings`, `screening_dismissals`, `retractions` | none — Postgres-only chain | imports only `@vercel/postgres`; no Dynamics client. UI may pass Dataverse-derived applicant data into the request body, but the service itself doesn't read `akoya_request`. |
| `panel-review-service.js`, `multi-llm-service.js` | `panel_reviews`, `panel_review_items` | none | Virtual Review Panel |
| `feedback-service.js` | `dynamics_feedback`, `dynamics_query_log` | none | |
| `notification-service.js`, `alert-service.js`, `maintenance-service.js`, `health-checker.js` | `system_alerts`, `health_check_history`, `maintenance_runs` | none | |
| `graph-service.js` | none | none (Microsoft Graph, separate token cache) | SharePoint files |
| `external-token.js` | none (read/write live on `wmkf_appreviewersuggestion` extension fields) | `wmkf_appreviewersuggestion` | HMAC JWT primitive |
| `review-upload.js` | none | `wmkf_appreviewersuggestion` (PATCH) + SharePoint | shared writer for staff + reviewer paths |
| `claude-reviewer-service.js` | none | none | legacy; new code uses `llm-client.js` |
| `discovery-service.js` external clients (`pubmed-service.js`, `arxiv-service.js`, `biorxiv-service.js`, `chemrxiv-service.js`, `orcid-service.js`, `serp-contact-service.js`) | none | none | external research-DB clients |
| `literature-search-service.js` | none | none | shared search shim |

## Endpoint inventory

For per-endpoint persistence info, see **`docs/API_ROUTE_SECURITY_MATRIX.md`** — the security matrix is CI-gated, so it's the canonical endpoint list. The Atlas defers to it rather than duplicate. ~~**Atlas v1 gap:** the matrix doesn't yet annotate "writes Postgres `<table>` / Dataverse `<entity>`."~~ **Closed S141 (2026-05-08)**: the matrix now has a Persistence column annotating writes for all 77 routes (PG = Postgres, DV = Dataverse).

For the reviewer-finder + review-manager subset, the per-entity pages above already enumerate read/write endpoints.

## Cross-system join keys

Useful summary of how Postgres ↔ Dataverse currently join (or will join post-cutover):

| Postgres key | Dataverse counterpart | Join field |
|---|---|---|
| `user_profiles.dynamics_systemuser_id` | `systemusers.systemuserid` | direct |
| `researchers.email` | `wmkf_potentialreviewers.wmkf_emailaddress` | de-dupe key |
| `reviewer_suggestions.request_number` | `akoya_requests.akoya_requestnum` | natural key |
| `reviewer_suggestions.researcher_id` (→ email) | `wmkf_appreviewersuggestion._wmkf_potentialreviewer_value` | indirect |
| `grant_cycles` (entire table) | `wmkf_appgrantcycle` (deployed but empty) | post-migration |
| `wmkf_appreviewersuggestion.wmkf_reviewsharepointfolder` | SharePoint `akoya_request/{requestNumber}_{guidNoHyphensUpper}/Reviewer_Uploads/{reviewerSubfolder}` | written by `lib/services/review-upload.js`; any plan that touches reviewer suggestions must preserve this path or orphan the SharePoint files |
| `wmkf_ai_run.wmkf_ai_Prompt@odata.bind` | `wmkf_ai_prompt` | written by `lib/services/execute-prompt.js`; FK from audit row to source prompt |
| `wmkf_ai_run.wmkf_ai_Request@odata.bind` | `akoya_request` | written by `execute-prompt.js` + `dynamics-service.js logAiRun`; FK from audit row to processed request |
| `proposal_searches.grant_cycle_id` (Postgres) | `grant_cycles.id` (Postgres) | LEFT JOIN in `grant-cycles.js`; load-bearing for cycle UI even though table is empty |

## "As-built vs. as-designed" reconciliation (Wave 2)

| Entity | Schema-as-code | Live deployment | Has data |
|---|---|---|---|
| `wmkf_appresearcher` | ✅ 21 attrs | ✅ 24 attrs | ✅ 334 rows |
| `wmkf_appreviewersuggestion` | extension manifest | ✅ 52 attrs | ✅ 336 rows |
| `wmkf_apppublication` | ✅ 14 attrs | ✅ 14 attrs | empty |
| `wmkf_appgrantcycle` | ✅ 8 attrs | ✅ 10 attrs (different gap from Postgres) | empty |
| `wmkf_appproposalsearch` | ✅ | ❌ NOT DEPLOYED | n/a |
| `wmkf_app_z_publication_author` | ✅ | ❌ NOT DEPLOYED | n/a |

## Known gaps in this Atlas (v1)

- ~~**Endpoint persistence annotation** not yet merged into `API_ROUTE_SECURITY_MATRIX.md`.~~ Closed S141 (2026-05-08).
- **Vendor `contact` and `account` extension fields** not enumerated yet — needed for intake portal pilot work (AO/Liaison fields per `project_intake_portal_pilot_decisions_2026-05-06.md`).
- **`wmkf_ai_prompt` and `wmkf_ai_run`**: per-entity page at [`atlas/dataverse-wmkf-ai-run-and-prompt.md`](atlas/dataverse-wmkf-ai-run-and-prompt.md). Both schemas now documented from live code (verified 2026-05-07 via `execute-prompt.js:193-200,535-553`).
- **`wmkf_apprequestperson` junction** — DEPLOYED S139 (`c8cbfe1`); 5,561 rows backfilled (`8b9b287`). Atlas page: [`atlas/dataverse-wmkf-apprequestperson.md`](atlas/dataverse-wmkf-apprequestperson.md). Steady-state still pending Connor's PA dual-write flows.
- **Intake portal entities** not yet created (per pilot scope) — `wmkf_portal_membership`, `wmkf_budgetline`, `wmkf_personnel`, `wmkf_priorsupport`, `wmkf_milestone`, plus `account` / `wmkf_potentialreviewer` extensions. Catalog goes in `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md`; once entities exist, link from this Atlas.

## Probe re-run

```bash
node scripts/audit-postgres-state.js     # ~5s, free
node scripts/audit-dataverse-state.js    # ~10s, free, hits live tenant
```

Both scripts are read-only and idempotent.
