# Reviewer Postgres → Dataverse Migration Plan (Wave 2)

**Created:** 2026-05-06 (Session 136)
**Last revision:** 2026-05-12 — status banner + spec-vs-built table refreshed after the S139 build set + Wave 1 closeout.
**Status:** **Active build, partial ship.** Schema mostly deployed (`wmkf_potentialreviewer` extended, `wmkf_appresearcher`, `wmkf_appreviewersuggestion`, `wmkf_apprequestperson`, plus `wmkf_appgrantcycle` partially — 10/13 attrs live). `save-candidates` / `my-candidates` / `load-proposal` / `contact-history` all live in prod. Remaining: `wmkf_appgrantcycle` schema patch + data backfill; endpoint cutovers for `grant_cycles` (3 files) and `reviewer_suggestions` (4 files); `researchers.js` retirement; `database-service.js` rewrite; cleanup cron; match-on-discovery wiring + UI; `add-candidate-manual`. See "Spec'd vs. built" table below for the line-by-line state.
**Priority:** Top — gates the intake portal pilot (mid-June 2026 Phase II Research)
**Target environment:** Prod (Dataverse Wave 2 schema is live)

## Read this first: ground truth lives in the Atlas

For live state of any entity/table this plan touches, the canonical reference is the **Application State Atlas** (`docs/APPLICATION_STATE_ATLAS.md` + per-entity pages under `docs/atlas/`). Verified 2026-05-07 via `scripts/audit-postgres-state.js` + `scripts/audit-dataverse-state.js`. When this plan and an Atlas page disagree, the Atlas is authoritative — this plan describes the *target* state and the migration *steps*; the Atlas describes *current* state.

## Spec'd vs. built (verified 2026-05-07)

Refreshed 2026-05-12. Several artifacts have shipped since the plan was locked; the table below is line-by-line accurate against `git log` and the live repo state.

| Artifact | Status | Notes |
|---|---|---|
| `scripts/backfill-reviewer-suggestions-parity.js` | **BUILT** (S136) | Dry-run classification of all 337 Postgres rows |
| `scripts/audit-postgres-state.js`, `scripts/audit-dataverse-state.js` | **BUILT** (S136/S137) | Live-state probes; re-run before any migration work |
| `wmkf_apprequestperson` junction entity | **BUILT + DEPLOYED to prod** (S139, commit `c8cbfe1`) | Schema-as-code at `lib/dataverse/schema/wave2/wmkf_app_request_person.json`; alt key on `(wmkf_request, wmkf_contact, wmkf_role)` enforced |
| `scripts/backfill-request-person-junction.js` | **BUILT** | ~14 KB, dedup-guarded against existing junction rows. Has NOT been executed in commit mode yet — must run once to backfill ~3,000 historical rows so PI/co-PI history coverage is complete. |
| `pages/api/reviewer-finder/contact-history.js` | **BUILT** (S139, commit `b23586c`) | UNION read strategy across junction + `_wmkf_projectleader_value`. **Both paths are steady-state per S136 (§"Junction read strategy") — `_wmkf_projectleader_value` stays authoritative for the lead PI; the junction is the additive source for co-PIs.** Smoke at `scripts/smoke-contact-history.js`. |
| `scripts/backfill-reviewer-suggestions-to-dataverse.js` | spec'd | Idempotent commit-mode backfill of the 8-row Postgres-only delta. **Triage these 8 rows first** (per Codex 3b 2026-05-12): determine whether each is a genuine missed sync or a legitimate Postgres-only row (e.g., proposal not yet in Dataverse) before committing. |
| `pages/api/reviewer-finder/add-candidate-manual.js` | spec'd | Net-new "add candidate by hand" endpoint, replaces retired Database tab. Writes to all three Dataverse entities (`wmkf_potentialreviewer`, `wmkf_appresearcher`, `wmkf_appreviewersuggestion`) via existing adapters. |
| `lib/services/contact-history-service.js` | spec'd | Match-on-discovery aggregation helper. **Distinct from the existing endpoint** — the endpoint serves a batched Dataverse lookup; this service would consume it from `discovery-service.js` during candidate enrichment. |
| Match-on-discovery wiring in `lib/services/discovery-service.js` + history-badge UI in `pages/reviewer-finder.js` | spec'd | First-class new scope. Badge sources: 🔁 reviewed (from `wmkf_appreviewersuggestion` rows linked to the contact via slot's `wmkf_contact`); 🚫 declined (from `wmkf_appreviewersuggestion.wmkf_responsetype`); 💰 funded PI (from `wmkf_apprequestperson` junction + `_wmkf_projectleader_value` on `akoya_request` — the same UNION the contact-history endpoint already returns). |
| `wmkf_appgrantcycle` entity | **PARTIALLY DEPLOYED** (10 custom attrs live, 0 rows) | The entity exists in prod Dataverse but with an incomplete schema — 3 fields are missing (`wmkf_ShortCode`, `wmkf_ProgramName`, `wmkf_CustomFields`). See `docs/atlas/dataverse-wmkf-apppublication-and-appgrantcycle.md`. Remaining work is a **schema patch** (not a fresh deploy) plus data backfill from Postgres `grant_cycles`. |
| `grant_cycles` endpoint cutover | spec'd | Three application files write/read `grant_cycles` today (see "Drain-target endpoint inventory" below). Cutover blocks Review Manager email path. |
| Cleanup cron (`/api/cron/reviewer-cleanup` or similar) | spec'd | Drops unengaged `wmkf_appreviewersuggestion` rows post meeting + 14 days; weekly schedule. **Predicate locked S136 2026-05-06** (8 signals). |
| `scripts/restore-from-cleanup-backup.js` | spec'd | Reverse the cleanup-cron pre-delete backup blob. **Must exist before cleanup cron runs in real mode** (per `Rollback strategy §3`); not "post-cutover hygiene." |
| `scripts/repair-divergence-postflip.js` | spec'd | Replay Dataverse-window writes back into Postgres if a flag-flip rolls back. Only relevant if `WAVE2_BACKEND_*` flags are built. |
| `scripts/reconcile-reviewer-migration.js` | spec'd | Pre/post-cutover reconciliation report. Run before declaring any drain target retired. |
| `WAVE2_BACKEND_*` env-flag dispatch in services | spec'd — **decision pending** | See "Rollback strategy" below for the tradeoff. Zero matches in code today. |

### Drain-target endpoint inventory (verified 2026-05-12 via `git grep`)

Every application file holding a live Postgres read/write against a Wave 2 drain table. **This is the actual scope of "cutover" work** — not just the two endpoints originally cited (`render-emails.js` / `send-emails.js`).

| File | Drain tables touched | Operations | Notes |
|---|---|---|---|
| `pages/api/reviewer-finder/grant-cycles.js` | `grant_cycles`, `proposal_searches`, `reviewer_suggestions` | full CRUD | Largest single Postgres consumer; admin UI for cycle management. Cutover blocks `wmkf_appgrantcycle` adoption. |
| `pages/api/reviewer-finder/generate-emails.js` | `reviewer_suggestions` | read + UPDATE | Email-generation flow; updates per-suggestion send state. |
| `pages/api/reviewer-finder/my-proposals.js` | `reviewer_suggestions` | read | Per-PD proposals list. |
| `pages/api/reviewer-finder/extract-summary.js` | `proposal_searches` (read), `reviewer_suggestions` (UPDATE) | broken | IDOR guard reads `proposal_searches` which is empty — endpoint is functionally broken today. Locked S136: **retire entirely**; UI caller at `pages/reviewer-finder.js:3538`. |
| `pages/api/reviewer-finder/researchers.js` | `researchers`, `researcher_keywords`, `reviewer_suggestions`, `grant_cycles` | full CRUD | Admin UI; the heaviest Postgres consumer. Locked S136 retire decision. |
| `pages/api/review-manager/render-emails.js` | `grant_cycles` | read | `loadCycleConfigs()` reads cycle metadata for email composition. |
| `pages/api/review-manager/send-emails.js` | `grant_cycles` | read | Same `loadCycleConfigs()` path. |
| `lib/services/database-service.js` | `researchers`, `publications`, `researcher_keywords`, `reviewer_suggestions` | full CRUD | Service-layer methods called from `discovery-service.js`, `deduplication-service.js`, `contact-enrichment-service.js`. Cutover requires either swapping internals to Dataverse adapters or retiring these methods entirely. |
| `lib/services/maintenance-service.js` | `proposal_searches`, `grant_cycles`, `reviewer_suggestions` | read (blob URL cleanup) | Daily cron walks blob URLs in these tables to clean orphans in Vercel Blob. Cutover must redirect to Dataverse equivalents or accept that blob cleanup loses coverage during transition. |

**Not in scope** (Postgres tables that stay permanently): `user_profiles`, `api_usage_log`, `system_alerts`, `health_check_history`, `maintenance_runs`, `dynamics_query_log`, plus the per-app stores listed in "Out of scope" above.

## What this doc supersedes

The Wave 2 spec in `docs/POSTGRES_TO_DATAVERSE_MIGRATION.md` (Session 106) was written assuming a **researcher-pool model** (free-standing `wmkf_app_researcher` rows accumulated across cycles, optional `wmkf_contact` lookup at promotion). What got actually built is different: a **per-proposal 1:1 sidecar model** (`wmkf_appresearcher` exists 1:1 with `wmkf_potentialreviewer`, scoped to specific proposal slots).

Connor (2026-05-06) confirmed the underlying intuition: researcher rows are **cycle-bounded transient candidate scratch**, not a permanent bibliometric pool. The 1:1 model coincidentally got this right. This doc operationalizes the migration around that ground truth.

## Out of scope (Postgres tables this migration does NOT touch)

To prevent scope creep — destructive carryover items that name "drop Postgres tables" must explicitly exclude:

| Table | Why it stays | Owner |
|---|---|---|
| `retractions` | 63K+ rows, GIN-indexed array search; load-bearing for Integrity Screener | Wave 3 (separate plan) |
| `integrity_screenings`, `screening_dismissals` | Per-user history for Integrity Screener | Wave 3 |
| `dynamics_feedback` | Dynamics Explorer thumbs/auto-detected failures | Wave 5 |
| `expertise_roster`, `expertise_matches` | Expertise Finder roster + history | Wave 4 |
| `panel_reviews`, `panel_review_items` | Virtual Review Panel persistence | Wave 4 |
| `intake_drafts`, `intake_audit` | Applicant intake portal (separate workstream) | Pilot scope, not migration |
| `system_alerts`, `health_check_history`, `maintenance_runs` | Time-series monitoring; correctly stays in Postgres per Wave 1 doc | Stays Postgres permanently |
| `api_usage_log`, `dynamics_query_log` | High-volume audit logs; correctly stays in Postgres per Wave 1 doc | Stays Postgres permanently |
| `user_profiles` | Stays Postgres permanently (identity bridge to Dynamics `systemuser`) | Stays Postgres |
| `user_preferences`, `user_app_access`, `system_settings` | Wave 1 — fully migrated + Postgres tables DROPPED 2026-05-12 | Done |

**Rule**: any decommission script in this migration explicitly enumerates the Postgres tables it drops; never wildcards. See "Pre-drop grep gates" under Rollback Strategy.

## Where the migration actually stands today

**Already in Dataverse (live)** — three custom entities + extensions on `wmkf_potentialreviewer` (vendor-pattern existing entity):

- `wmkf_potentialreviewer` — global per-person identity (by email). One person across N proposals = ONE row. Source: pre-existing entity, extended per `lib/dataverse/schema/wave2-existing/wmkf_potentialreviewers-extensions.json`.
- `wmkf_appresearcher` — 1:1 sidecar to `wmkf_potentialreviewer`; bibliometric snapshot (h_index, ORCID, Scholar) — though h_index/citations are 0% populated in live data.
- `wmkf_appreviewersuggestion` — per-(person, request) lifecycle ledger. Extended per `wave2-existing/wmkf_appreviewersuggestion-extensions.json` with token fields, review-form picklists, and SharePoint folder.
- Adapters: `lib/dataverse/adapters/{contact, potential-reviewer, researcher, reviewer-suggestion}.js`
- Endpoints fully on Dataverse: `save-candidates.js`, `my-candidates.js`, `load-proposal.js`
- **Review Manager is mostly Dataverse but partially Postgres**: `reviewers.js` reads/writes Dataverse for the per-proposal lifecycle, but `render-emails.js` and `send-emails.js` both call `loadCycleConfigs()` which reads Postgres `grant_cycles`. (Surfaced by grep gate 2026-05-06; was incorrectly described as "fully Dataverse" in earlier revisions of this plan.)

**Pre-existing schema-as-code (designed but not deployed):**

The `lib/dataverse/schema/wave2/` directory holds six schema-as-code files written in an earlier session that designed the original Wave 2 entities. These were never deployed to sandbox or prod, but they describe the intended Wave 2 shape and **already encode the 1:1 sidecar model** (not the pool model the Wave 1 design doc text implied):

- `wmkf_app_grant_cycle.json` — `wmkf_AppGrantCycle` entity, OrganizationOwned, alt-keyed on `wmkf_FiscalYearCode`
- `wmkf_app_proposal_search.json` — `wmkf_AppProposalSearch` entity, UserOwned per-search analysis log
- `wmkf_app_publication.json` — `wmkf_AppPublication` entity, OrganizationOwned, alt-keyed on DOI; `authorsRaw` text + junction for tracked authors
- `wmkf_app_researcher.json` — `wmkf_AppResearcher`, **described in the file as "1:1 sidecar to wmkf_potentialreviewers"**
- `wmkf_app_reviewer_suggestion.json` — `wmkf_AppReviewerSuggestion`, UserOwned lifecycle ledger
- `wmkf_app_z_publication_author.json` — junction (the `z_` prefix is for create-order; junctions need both endpoints created first)

**Important**: filenames use snake_case for human readability; schemaName uses PascalCase (`wmkf_AppGrantCycle`); deployed logical names would be lowercase concatenated (`wmkf_appgrantcycle`). All three are internally consistent with the live entities' deployed naming. There is no "naming convention divergence" — earlier drafts of this plan claimed there was one, that was a misreading.

The migration question is therefore **"do we deploy what's already designed, or modify the designs first?"**, not "what should we design?" Most of the Wave 2 design work happened months ago.

**Postgres data still load-bearing:**

| Table | Rows (verified 2026-05-12) | Disposition |
|---|---|---|
| `publications` | 0 | **Retire** (deploy decision: skip). Writer is dead and reader `DatabaseService.getRecentPublications` (line 313) has **zero external callers** (verified 2026-05-07 via repo-wide grep — Codex R3 #7 resolved). The Dataverse counterpart `wmkf_apppublication` IS already deployed (14 custom attrs verified live 2026-05-07) but holds 0 rows; the junction `wmkf_app_z_publication_author` is **NOT deployed** (404 on entity set). With zero data on either side and the `researchers.js` admin UI being retired, the rational call is to **skip deployment** of the junction and let the empty `wmkf_apppublication` entity sit unused for now. Reviewer Finder discovery already rescrapes per-search; no need for a cached table. |
| `proposal_searches` | 0 | **Reckon.** Writer is dead but `extract-summary.js` reads it as an IDOR ownership guard (`pages/api/reviewer-finder/extract-summary.js:57`). Empty table → guard always fails → extract-summary is functionally broken today. A designed Dataverse counterpart exists (`wave2/wmkf_app_proposal_search.json`), but with zero data and a broken endpoint, **decision is: retire `extract-summary` entirely**. UI removal of any callers required (Reviewer Finder picker calls `/api/reviewer-finder/extract-summary` from `pages/reviewer-finder.js:3538`). Skip deployment of `wmkf_app_proposal_search`. |
| `researchers` | 331 | **Drain.** Don't migrate. Cycle close empties via cleanup cron. Read path in `researchers.js` is the blocker (admin UI). |
| `researcher_keywords` | 1,028 | **Drain.** Coverage moves to `wmkf_appresearcher.wmkf_keywords` for new rows. Same read-path blocker as above. |
| `reviewer_suggestions` | 337 | **Backfill spec needed** — see "Reviewer suggestions backfill" section below. Naive "active-cycle migrate, closed-cycle discard" is not enough. |
| `grant_cycles` | 13 | **Migrate** to net-new `wmkf_appgrantcycle`. Field-by-field mapping in "Grant cycle field mapping" section below — Postgres has more fields than the original §1 spec captured. |

Total live data is ~1,700 rows. The "migration" is mostly **letting Postgres data drain** as J26 closes, plus rewriting the few endpoints that still talk to Postgres.

### Verified live state (2026-05-06, `scripts/audit-postgres-state.js`)

Per-column population probed against live Neon Postgres. Highlights driving plan decisions:

**`reviewer_suggestions` (337 rows, 37 columns)** — richer than originally documented:
- 100% populated: `proposal_id`, `proposal_title`, `researcher_id`, `relevance_score`, `match_reason`, `sources`, `suggested_at`, `selected`, `invited`, `declined`, `grant_cycle_id`, `program_area`, `user_profile_id`, `proposal_authors`, `proposal_institution`, `reminder_count`
- 99%: `request_number` ← **direct join to `akoya_request.akoya_requestnum`**; basis for active/closed determination
- 97%: `proposal_abstract`
- 55%: `summary_blob_url`
- 13%: `email_sent_at` (43 invitations sent)
- 7%: `response_received_at`, `response_type` (22 responses)
- 6%: `materials_sent_at`, `review_status`
- 5%: `proposal_url`, `proposal_password`
- 1%: `review_received_at`, `review_blob_url`, `review_filename`, `thankyou_sent_at`, `notes`
- 0%: `co_investigators`, `co_investigator_count`, `email_opened_at`

**`researchers` (331 rows)** — bibliometric infrastructure was built but **never wired up**:
- 100%: `name`, `normalized_name`
- 99%: `email`
- 97%: `primary_affiliation`
- 42%: `website`
- 4%: `email_source`
- 2%: `contact_enriched_at`
- 1%: `orcid`, `google_scholar_id`, `orcid_url`, `google_scholar_url`, `metrics_updated_at`
- **0%: `h_index`, `i10_index`, `total_citations`, `last_checked`, `email_year`, `email_verified_at`, `faculty_page_url`, `contact_enrichment_source`, `notes`, `department` (1%)**

**Implication for `wmkf_appresearcher` (1:1 sidecar):** the bibliometric fields it carries (`wmkf_hindex`, `wmkf_i10index`, `wmkf_totalcitations`, `wmkf_lastchecked`) will continue to be null in practice. The match-on-discovery framing should not promise rich h-index data in history badges — we don't have it. What badges CAN show is engagement history (saved, invited, accepted, declined, reviewed) — which IS captured.

**`grant_cycles` (13 rows, 10 active)** — sparser than schema suggests:
- 100%: `name`, `short_code`, `program_name`, `summary_pages`, `is_active`
- **0%: `review_deadline`, `review_template_blob_url`, `review_template_filename`, `additional_attachments`, `custom_fields`**

So the "JSON validation" and "blob URL reachability" gymnastics in the plan can be simplified — those columns have no data to migrate. They remain in the Dataverse schema for forward compatibility.

**Cycles enumerated**: J26, D25, J25, D24, J24, D23, J23, D26, J27, D27 active; rows 11–13 are inactive duplicates of D26/J27/D27 (data hygiene cleanup, not load-bearing).

**Per-cycle suggestion volume**: ~10–30 rows per cycle prefix, all with `selected = true`. The "transient unselected scratch" the cleanup cron was originally framed against does not appear in live Postgres data — every Postgres `reviewer_suggestion` row is already a "saved" candidate. The cron's value remains forward-looking (future cycles, future code paths), not retroactive housekeeping.

## Locked decisions

### Data model: 1:1 sidecar (consistent across schema-as-code and live deployment)

The model:

- `wmkf_potentialreviewer` is **global per-person**, identified by email. `getByEmail(email)` returns one row. One person across N proposals = ONE potentialreviewer.
- `wmkf_appresearcher` is **1:1 with `wmkf_potentialreviewer`** (per-person bibliometric snapshot — h_index, ORCID, Scholar). Not per-proposal. Per-`wmkf_app_researcher.json`'s file description: *"1:1 sidecar to wmkf_potentialreviewers"*.
- `wmkf_appreviewersuggestion` is **per-(person, request)** — the lifecycle ledger. `findByPotentialReviewerAndRequest(prId, requestId)`.

So one John Smith on 5 proposals = 1 `wmkf_potentialreviewer` + 1 `wmkf_appresearcher` + 5 `wmkf_appreviewersuggestion`.

This model is **consistent across both** the live deployed entities AND the schema-as-code in `wave2/`. Earlier drafts of this plan framed a "pool vs 1:1" decision as an open fork — that was based on misreading the Wave 1 design doc's text rather than checking the schema-as-code in the repo. The schema-as-code already has the 1:1 design. There was never a real fork.

**Cleanup-cron implications** (corrected from "slot" framing in earlier drafts):
- Drops `wmkf_appreviewersuggestion` rows (per-proposal scratch), NOT `wmkf_potentialreviewer` rows. Dropping a potentialreviewer would erase the whole person.
- The 1:1 sidecar is between potentialreviewer and appresearcher, NOT between either of those and a proposal.
- Orphan-potentialreviewer policy (a person with zero remaining suggestions): defer; persist as stub for future re-suggestion.

Rationale: Reviewer Finder surfaces ~25 candidates per proposal. Selected reviewers promote to `contact` (permanent record). Per-proposal scratch (suggestions for proposals we never invited them to) post-adjudication has no value. Historical lookups about "have we worked with this person before" go through `contact` and the surviving `wmkf_appreviewersuggestion` rows linked to that person's potentialreviewer.

### Cleanup cron

Cron runs weekly; only acts twice a year in practice (after June and December meeting dates).

**Logic** (corrected 2026-05-07: drops suggestion rows, not potentialreviewer rows):

```
For each akoya_request where wmkf_meetingdate < (today - 14 days):
  For each wmkf_appreviewersuggestion row linked to that request:
    If the suggestion is "engaged" (defined below): keep
    Otherwise: delete the suggestion row only.
    Do NOT delete the linked wmkf_potentialreviewer (global per-person).
    Do NOT delete the linked wmkf_appresearcher (1:1 with potentialreviewer).
```

**"Engaged" predicate** — keep any `wmkf_appreviewersuggestion` row where any of these signals is populated. Either via the suggestion itself or via the linked `wmkf_potentialreviewer` (global per-person):

On the suggestion (`wmkf_appreviewersuggestion`):
- `wmkf_selected = true`
- `wmkf_emailsentat` populated (we sent invitation/materials)
- `wmkf_responsetype` populated (they responded)
- `wmkf_ExternalTokenIssued` populated (we issued a magic link)
- `wmkf_ProposalFirstAccessed` populated (they engaged with the link)
- `wmkf_ReviewSharePointFolder` populated (review folder was created)
- Any of `wmkf_ReviewerImpact`, `wmkf_ReviewerRisk`, `wmkf_ReviewerOverallRating` populated (they submitted a review form)

On the linked `wmkf_potentialreviewer` (global per-person):
- `wmkf_contact` populated (contact promotion happened — applies to ANY suggestion this person has)

If the linked potentialreviewer has `wmkf_contact` populated (e.g., they accepted on a different proposal), keep the suggestion regardless of its own state — that's a "this person became engaged with us at some point" signal worth preserving for cross-proposal history.

The 14-day grace lets staff dip back into the unselected pool if late acceptances fall through. Reading `wmkf_meetingdate` at cron time handles board-moves-the-meeting cases automatically.

**Orphan potentialreviewer policy** (open follow-up): after cron runs, some `wmkf_potentialreviewer` rows may have zero remaining `wmkf_appreviewersuggestion` rows. Decision deferred — initial implementation leaves them as stubs. If they accumulate, a separate orphan-cleanup pass can be added later.

**Pre-delete backup**: before any delete, the cron exports the doomed rows (suggestion only) to a JSON blob in Vercel Blob storage with 30-day retention. Provides a manual-restore path if a predicate-bug deletes wrongly. Restore script (`scripts/restore-from-cleanup-backup.js`) reads the blob and re-CREATEs the suggestion via `reviewerSuggestionAdapter.upsert`. Idempotent via alt key.

### Engaged suggestion rows = de facto reviewer-history child entity

We don't need a new role-tracking entity. The set of `wmkf_appreviewersuggestion` rows that survive cleanup IS the per-contact reviewer history. Each row carries the lifecycle fields (`wmkf_emailsentat`, `wmkf_responsetype`, `wmkf_reviewreceivedat`, decline reason, response-received-at, review form fields). The cleanup cron is what turns the table from "current cycle scratch" into "permanent history of engaged reviewers."

The reviewer-history surface for a contact is `wmkf_appreviewersuggestion` rows whose slot (`wmkf_potentialreviewer`) is linked to that contact via `wmkf_contact`. The slot is the join point; the lifecycle data lives on the suggestion. See §"Reviewer-portal data lives on `wmkf_appreviewersuggestion`" below for the field-by-field rationale.

### Reviewer-portal data lives on `wmkf_appreviewersuggestion` (NOT `wmkf_potentialreviewer`)

**Correction from earlier draft.** Reviewer-portal field design is already partly built out as extensions to `wmkf_appreviewersuggestion` — see `lib/dataverse/schema/wave2-existing/wmkf_appreviewersuggestion-extensions.json`. That file already defines:

- External-token lifecycle: `wmkf_ExternalTokenHash`, `wmkf_ExternalTokenIssued`, `wmkf_ExternalTokenExpires`, `wmkf_ExternalTokenRevoked`
- Engagement timestamps: `wmkf_ProposalFirstAccessed`
- Review delivery: `wmkf_ReviewSharePointFolder`, `wmkf_ReviewUploadedByStaff`
- Review form responses: `wmkf_ReviewerAffiliation`, `wmkf_ReviewerImpact`, `wmkf_ReviewerRisk`, `wmkf_ReviewerOverallRating` (with sentinel `99 = unable to answer` on each picklist)

**Implications:**
- The "engagement predicate" for the cleanup cron reads signals from both sides: (a) suggestion-side signals on `wmkf_appreviewersuggestion` (`wmkf_ExternalTokenIssued`, `wmkf_ProposalFirstAccessed`, any review-form picklist, `wmkf_emailsentat`, `wmkf_responsetype`); and (b) slot-side signals on `wmkf_potentialreviewer` (`wmkf_contact` populated indicates the person was promoted to a contact at some point — a cross-proposal "this person is engaged with us" signal). The keep decision is the union of both — see §"Engaged predicate" below for the full enumerated signal list. Cleanup acts on suggestion rows; the slot itself is never deleted by the cron.
- Match-on-discovery's "reviewer history" lookup walks `wmkf_appreviewersuggestion` rows linked through the slot's contact, not just `wmkf_potentialreviewer` rows. The richer suggestion fields (overall rating, response time derived from issued vs. first-accessed) are what surface in the history modal.
- **Net-new columns to add to extensions** (locked S136 2026-05-06):
  - `wmkf_DeclineReason` — multi-line text, optional. Captured at decline-time (magic-link landing page; or staff-entered if reviewer told us by email).
  - `wmkf_ResponseReceivedAt` — datetime, set when `wmkf_responsetype` flips from null to a value. Required for response-latency computation; without it the metric isn't derivable.
- **Derivable, no schema change**:
  - Late/on-time flag = `wmkf_reviewreceivedat` vs. cycle's `wmkf_reviewreturndeadline`.
  - Response latency hours = `wmkf_emailsentat` vs. `wmkf_ResponseReceivedAt`.

## New work in scope

### 1. `wmkf_appgrantcycle` entity — patch schema-as-code, then deploy

**Status (verified 2026-05-07 via `scripts/audit-dataverse-state.js` + EntityDefinitions metadata probe):** the entity IS already deployed (10 custom attrs live), but **with 0 rows and a partial schema** — see [`docs/atlas/postgres-grant-cycles.md`](atlas/postgres-grant-cycles.md) and [`docs/atlas/dataverse-wmkf-apppublication-and-appgrantcycle.md`](atlas/dataverse-wmkf-apppublication-and-appgrantcycle.md). This work is NOT a fresh deploy of the schema-as-code; it's a **schema patch** to add fields the deployed entity is missing.

The schema-as-code file `lib/dataverse/schema/wave2/wmkf_app_grant_cycle.json` defines 8 attributes (`wmkf_FiscalYearCode`, `wmkf_MeetingDate`, `wmkf_SummaryPages`, `wmkf_ReviewReturnDeadline`, `wmkf_ReviewTemplateUrl`, `wmkf_ReviewTemplateFilename`, `wmkf_AdditionalAttachments`, `wmkf_IsActive`) plus the primary name `wmkf_DisplayName`. **The schema-as-code is missing three fields the migration requires:** `wmkf_ShortCode`, `wmkf_ProgramName`, `wmkf_CustomFields`. These are also absent from the live deployment.

**W1 task:** patch `lib/dataverse/schema/wave2/wmkf_app_grant_cycle.json` to add the three missing attributes, then re-run `apply-dataverse-schema.js`. After patch the deployment will catch up.

The full field mapping below names every Postgres column. Postgres columns marked **0% populated** in live data are non-blocking — schema captured for forward compatibility, no data to migrate.

**Full field mapping** (every Postgres column accounted for):

| Postgres column | Dataverse column | Type | Notes |
|---|---|---|---|
| `id` (int PK) | `wmkf_appgrantcycleid` (GUID, native) | — | Postgres ID does not migrate — references rewrite to GUID. |
| `short_code` | `wmkf_shortcode` | Text (10) | **Alternate key.** Matches the cycle codes from `cycle-code.js` (J26, D23). Used in cross-table joins from `wmkf_appreviewersuggestion.wmkf_grantcyclecode` (text). |
| `name` | `wmkf_displayname` | Text (255) | Primary name attribute. e.g., `"June 2026 Board Meeting"`. |
| `program_name` | `wmkf_programname` | Text (100) | Friendly program label per cycle. |
| `summary_pages` | `wmkf_summarypages` | Text (50) | Per-cycle reviewer summary length config (e.g. `"2"`, `"1,2"`). |
| `review_deadline` | `wmkf_reviewreturndeadline` | Date | **0% populated in live data.** Optional. Renamed to `wmkf_reviewreturndeadline` to match deployed entity. |
| `review_template_blob_url`, `review_template_filename` | `wmkf_reviewtemplateurl`, `wmkf_reviewtemplatefilename` | Text (500) | Vercel Blob URL + filename. **0% populated in live data.** Schema captured for forward compatibility; no data to migrate. |
| `additional_attachments` | `wmkf_additionalattachments` | Multi-line text | JSONB → JSON-as-text. **0% populated in live data (verified 2026-05-06).** Optional column; no migration logic needed. |
| `custom_fields` | `wmkf_customfields` | Multi-line text | JSONB → JSON-as-text. **0% populated in live data.** Optional column. |
| `is_active` | `wmkf_isactive` | Yes/No | Drives the active-vs-archived distinction; **Postgres has no `is_archived` column**, the original Codex-flagged concern was unfounded. |
| `created_at`, `updated_at` | native `createdon`, `modifiedon` | DateTime | Built-in. |

**Derived (not in Postgres `grant_cycles`)** — populated from joins to `akoya_request`:

| Dataverse column | Source | Notes |
|---|---|---|
| `wmkf_meetingdate` | `akoya_request.wmkf_meetingdate` for the matching cycle | Denormalized for query speed; drift watched by reconciliation report. |
| `wmkf_fiscalyearcode` | `akoya_request.akoya_fiscalyear` for the matching cycle (e.g., `"June 2026"`) | Used for joins from `akoya_request`. |

**Counts (derived, not stored)**: `grant-cycles.js` today JOINs `proposal_searches` and `reviewer_suggestions` for per-cycle proposal/candidate counts. Equivalent in Dataverse: query `akoya_request` filtered by `akoya_fiscalyear = <code>` for proposal count; query `wmkf_appreviewersuggestion` filtered by `wmkf_grantcyclecode = <shortcode>` for candidate count. Wrap in a helper; expose as a single endpoint `/api/reviewer-finder/grant-cycles?withCounts=true`.

**Per-user current-cycle preference** (today held in Dataverse `wmkf_appuserpreferences` via the `database-service.js` dispatcher; Postgres `user_preferences` dropped 2026-05-12). New code reads cycle GUID OR shortcode from prefs and resolves via alt-key.

Naming follows live convention `wmkf_app<name>` (no underscore — matches existing live entities, **not** the Wave 1 doc's proposed `wmkf_app_<name>`).

### 2. Match-on-discovery + history badges

The most visible payoff of the migration. Surfaces "have we worked with this person before" at the moment a PD is choosing candidates.

**Match-on-discovery** — runs in the discovery flow after contact enrichment, before ranking:

For each candidate with email or ORCID:
1. Lookup contact via `contact.emailaddress1` (exact, normalized) → `contact.wmkf_orcid` (exact). Skip name+affiliation fuzzy at discovery time; that's expensive and noisier.
2. If matched, attach `contactId` to the candidate record.

**History lookup** — for matched candidates, two queries:

- **Reviewer history**: `wmkf_appreviewersuggestion` rows whose slot (`wmkf_potentialreviewer`) has `wmkf_contact eq <id>` AND the suggestion has an engagement signal (any of `wmkf_emailsentat`, `wmkf_responsetype`, `wmkf_reviewreceivedat`, or `wmkf_externaltokenissued` populated). Returns: request number, meeting date (→ cycle code via `cycle-code.js`), response type, dates, decline reason, review form fields.
- **PI/co-PI history**: UNION of (a) `akoya_request` rows where `_wmkf_projectleader_value eq <id>` and (b) `wmkf_apprequestperson` rows where `wmkf_contact eq <id>`. Steady-state per §"Junction read strategy" — projectleader stays authoritative for lead PI, junction is additive for co-PIs.

**Batching** — 25 candidates × 2 queries = 50 round trips per discovery run. Use `$batch` or pre-fetch in two queries (`wmkf_contact in (...)` and `_wmkf_projectleader_value in (...)`). Latency matters; PDs are at the screen waiting.

**UI badges on each candidate card**:

- **🔁 Reviewed 2× (last J26)** — recency-colored: green > 2 cycles ago, amber 1 cycle ago, red current cycle (the latter would be a bug, surface it as a warning)
- **🚫 Declined 3×** — separate badge; "they're saying not interested"
- **💰 Funded PI 1× (D23)** — past-grantee signal; potential COI flag if recent or topically related

Click any badge → modal with the full history list.

### 3. Contact form "Reviewer history" view

A "Reviewer history" subgrid (or tab) on the standard `contact` form. Lists `wmkf_appreviewersuggestion` rows linked to this contact via the slot's `wmkf_contact`. Columns: cycle code (derived from request's `wmkf_meetingdate`), request number (clickable), response type, materials sent date, review submission date, overall rating (when populated). Read-only.

Same data as the picker-side history modal (§2), surfaced from the contact side for staff who open a contact in Dynamics directly.

**Not bundled with pilot account-form work.** The pilot adds AO/Liaison lookups + institutional file fields to `account`, NOT to `contact`. So this is a separate ask for Connor — net-new contact-form change. Locked S136 2026-05-06: Justin opted to ask now rather than defer post-pilot, since the picker modal alone wasn't a sufficient reason to delay native contact-form access.

Optionally (later, not in pilot scope): derived summary fields on contact, recomputed on a cron — `wmkf_lastreviewedcycle`, `wmkf_avgresponsetimehours`, `wmkf_declinecount`. Nice-to-haves.

### 4. "Add candidate by hand" (net-new, replaces retired Database tab)

Today the Reviewer Finder Database tab has a "Create researcher" button that adds a row to the legacy Postgres `researchers` pool. Justin's actual usage was **adding reviewers PDs already knew about**, not browsing the pool. Under the 1:1 model the seed-the-pool target goes away, so this becomes a net-new feature attached to a specific proposal.

**UX**: a button on the My Candidates tab (per-proposal scope) — "Add candidate by hand." Opens a small modal:

| Field | Required | Notes |
|---|---|---|
| Name | yes | |
| Email | yes | Same email-required gate as save-candidates uses; required for match-on-promote later. |
| Affiliation | yes | |
| Expertise / why chosen | yes | Free text, mirrors `wmkf_appreviewersuggestion.wmkf_matchreason`. |
| ORCID | no | If supplied, used for match-on-discovery against existing contacts before write. |

**Write path**: identical to `save-candidates.js` for a single candidate — `potentialReviewerAdapter.upsertByEmail` + `researcherAdapter.upsertByPotentialReviewer` (with whatever bibliometric fields the user supplied; mostly null) + `reviewerSuggestionAdapter.upsert` with `wmkf_selected = true`. Match-on-discovery still runs (against contact) so we don't create dupes.

**Endpoint**: `POST /api/reviewer-finder/add-candidate-manual`. Same auth as `save-candidates.js` (`requireAppAccess('reviewer-finder')`). Single-candidate variant of the existing flow; ~half-day implementation.

### 5. `wmkf_apprequestperson` junction (PI + co-PI history)

Net-new junction table to support the PI/co-PI history badge. Locked S136 2026-05-06 — Connor's preference for junctions + cleaner long-term shape.

**Read strategy** (revised 2026-05-07 after Codex review): the junction supersedes the **co-PI** half of the legacy query (`_wmkf_copi1..5_value`) but **not** the PI half. Since `_wmkf_projectleader_value` stays live and is used by other flows that are not aware of the junction, the contact-history endpoint must read it as an authoritative parallel source — **not** treat it as a fallback that gets suppressed when the junction has any rows. Effective query:

```
junction rows for contact (role = pi OR copi)
  UNION
akoya_request rows where _wmkf_projectleader_value = contact
```

This avoids both transition-window failure modes Codex flagged: (a) backfill ran, PA dual-write hasn't, projectleader changes silently disappear from history; (b) PA misses an update, junction `pi` row goes stale, projectleader is right but ignored.

Pre-junction-deploy (today): the 6-OR query continues to work. Post-junction-deploy, pre-PA-flow-cutover: the UNION above. Post-PA-flow-cutover: same UNION (PA dual-writes; either source is authoritative for PI; junction is sole source for co-PI).

| Column | Type | Notes |
|---|---|---|
| `wmkf_request` | Lookup → akoya_request | |
| `wmkf_contact` | Lookup → contact | |
| `wmkf_role` | Choice | `pi \| copi`. Reviewers stay on `wmkf_potentialreviewer`; AO/Liaison are account-level per pilot scope — out of this junction. |
| `wmkf_authorposition` | Whole number, optional | 0 for PI, 1–5 for co-PI slot. |

Alt key: `(wmkf_request, wmkf_contact, wmkf_role)`.

**Population:**

1. **One-time backfill** (`scripts/backfill-request-person-junction.js`) — walks every `akoya_request`, writes one row per populated PI/co-PI lookup. ~1,000 requests × ~3 populated avg ≈ ~3,000 rows. Single `$batch` op.
2. **Ongoing sync** — PA flow on `akoya_request` create/update reads PI + co-PI 1–5, upsert/delete junction rows. **Connor's territory.**
3. **Read-side strategy (revised 2026-05-07)** — `/api/reviewer-finder/contact-history` does the UNION described in **Read strategy** above (junction OR `_wmkf_projectleader_value`). Not a fallback — projectleader stays authoritative for PI in parallel with the junction. This is the steady-state read; nothing to remove post-pilot.

**Resolved 2026-05-07** (both open Connor questions, jointly):
- Junction-table preference **does** extend to vendor-indexed data — `wmkf_apprequestperson` proceeds as spec'd.
- Ongoing sync is **net-new PA flows**, not an extension. Connor will build PA flows on `akoya_request` create/update that (a) create `contact` records as needed and (b) write junction rows directly.
- **`_wmkf_projectleader_value` (PI lookup) stays live** — used by other flows unrelated to reviewers; PA flows dual-write (projectleader field + junction `pi` row). Only the **co-PI slots** (`_wmkf_copi1..5_value`) become obsolete read-only legacy data once backfill + PA flows are live.
- Backfill script remains Justin/Claude's job.

### 6. Reviewer-portal field audit

Confirm `wmkf_appreviewersuggestion` (where reviewer-portal data lives — see "Reviewer-portal data lives on `wmkf_appreviewersuggestion`" section above) has columns for everything the portal will capture. Net-new fields locked S136: `wmkf_DeclineReason`, `wmkf_ResponseReceivedAt`. Late/on-time and response-latency derive from existing timestamps. Connor coordination only on whether anything else surfaces during portal build that isn't in the extensions JSON.

## Reviewer suggestions backfill

### Parity probe result (2026-05-06)

The Wave 2 backfill was a known forward task per memory entry `project_reviewer_history_data_quality.md`, which previously cited *"the Wave 2 backfill (333 Postgres rows → Dataverse)"*. The parity probe confirms what that memory implied — most rows already match.

`scripts/backfill-reviewer-suggestions-parity.js` ran a dry-run classification of all 337 Postgres `reviewer_suggestions` rows against live Dataverse. **Result:**

```
A   already in Dataverse (matching wmkf_appreviewersuggestion):  329 rows  (97.6%)
B   active cycle, would backfill:                                  0 rows
C2  closed cycle + engagement, backfill for history:               0 rows
C1  closed cycle, no engagement, discard:                          0 rows
Anomaly:                                                           8 rows
```

**The backfill workstream collapses to anomaly triage.** No Group B or Group C2 rows means there is nothing meaningful to copy from Postgres → Dataverse beyond the 8 anomalies. The 329 Postgres rows in Group A are stale duplicates of already-existing Dataverse rows; dropping the Postgres table at decommission loses no data.

The 8 anomalies trace cleanly to known data-quality gaps in the audit:
- 4 rows missing email (exactly the 4 `researchers` rows where email is null)
- 4 rows missing `request_number` (exactly the 4 `reviewer_suggestions` with null request_number)
- All 8 are J26 (current cycle); zero overlap between the two anomaly types

**Action**: triage the 8 anomalies manually before decommission. Most likely: the 4 missing-email rows are saved candidates whose email failed enrichment but who never got invited (no engagement signals on any of them, verifiable in raw data); the 4 missing-`request_number` rows pre-date the addition of the `request_number` column. Either fix or accept loss; document each.

### Why this collapse is real

`pages/api/reviewer-finder/save-candidates.js` writes Dataverse-only today, but at some prior point it wrote both Postgres and Dataverse — the 97.6% Group A overlap is consistent with sustained dual-write history rather than recent Dataverse adoption. The Postgres-only window must have been brief.

**Operational implication**: the original "reviewer-suggestions backfill is a large blocker" framing is wrong. 329/337 rows already match Dataverse; only 8 anomalies need triage. The backfill commit-mode run is scheduled in W4 per the refreshed schedule below; endpoint rewrites for `reviewer_suggestions` readers (`generate-emails.js`, `my-proposals.js`, `extract-summary.js`, `maintenance-service.js`, `database-service.js`) are in W5.

### Patch precedence (residual, only matters if anomaly triage finds anything migrate-worthy)

In the unlikely case that any of the 8 anomalies turns out to be a real Postgres-only row that should land in Dataverse, the patch precedence rules below apply. Otherwise these are vestigial.

### Identity contract (resolves Codex BLOCKER)

The backfill writer must establish three precise mappings before writing any Dataverse row. **No `(proposal_id, email)` shortcut** — Postgres `proposal_id` is the first chars of the proposal title, NOT a cycle code or request identifier.

**1. Postgres `request_number` → Dataverse request GUID**

```
SELECT akoya_requestid FROM akoya_request WHERE akoya_requestnum = $1
```

`reviewer_suggestions.request_number` is 99% populated. For the 1% missing, use `grant_cycle_id → grant_cycles.short_code` to identify the cycle, then **fail with manual-reconciliation flag** rather than guess. Do not auto-resolve ambiguous rows.

**2. Postgres email → Dataverse `wmkf_potentialreviewer` slot**

```
SELECT wmkf_potentialreviewerid FROM wmkf_potentialreviewer
WHERE wmkf_email = $1
  AND <slot is on the request from step 1, via _akoya_request_value or its slot relationship>
```

Email source: `researchers.email` joined via `reviewer_suggestions.researcher_id` (99% populated). If no matching slot exists on the request (Group B/C2 cases), create one via `potentialReviewerAdapter.upsertByEmail` — same code path `save-candidates.js` uses.

**3. Idempotency on Dataverse write**

Use the alt key `(wmkf_request, wmkf_potentialreviewer)` on `wmkf_appreviewersuggestion`. Dataverse adapter `reviewerSuggestionAdapter.upsert` already does this; the backfill calls into it rather than reimplementing.

### Patch precedence (Group A handling)

When a Dataverse row already exists for `(request, slot)`:

| Field type | Rule |
|---|---|
| Lifecycle timestamps (`wmkf_emailsentat`, `wmkf_responsereceivedat`, `wmkf_reviewreceivedat`, etc.) | Patch only if Dataverse field is null AND Postgres has a value. Dataverse is authoritative once populated. |
| `wmkf_responsetype`, `wmkf_reviewstatus` | Same as above. Picklist values mapped per "Picklist value mapping" section. |
| `wmkf_summaryblobeurl`, `wmkf_reviewblobeurl` | Patch only if Dataverse null. URL validation: `HEAD` request must return 200; if 404, log as anomaly and skip the field. |
| `wmkf_selected`, `wmkf_invited`, `wmkf_declined`, `wmkf_accepted` (legacy booleans) | Patch only if Dataverse null. |
| Any field already populated in Dataverse | **Never overwrite.** Log as `PRESERVED_DV` in parity report. |

### Backfill execution model + partial-failure repair

`scripts/backfill-reviewer-suggestions-to-dataverse.js`:

1. **Build parity report (dry-run, no writes)**:
   ```
      Group A (in DV, may need gap-patch):    N rows
      Group B (active, full backfill):        M rows
      Group C1 (closed, no engagement, discard): K1 rows
      Group C2 (closed, has engagement, backfill for history): K2 rows
      Anomalies (missing request_number, missing email, malformed): X rows  ← STOP if X > 0
   ```
2. **Human review.** Anomalies must be zero before commit.
3. **Commit phase** (`--commit` flag required): processes in batches of 50. After each batch, writes a checkpoint to `backfill-progress.json` recording `{ lastProcessedPostgresId, dataverseGuidsCreated[], errors[] }`.
4. **Failure mid-batch**: rerun resumes from `lastProcessedPostgresId + 1`. Idempotent because of step 3's alt-key UPSERT — re-attempting a created row patches rather than duplicates.
5. **Catastrophic failure (Dataverse outage mid-commit)**: pause the cron and any in-progress cutover (flag-flip under Option A, deploy under Option B), fix Dataverse, rerun. Checkpoint protects forward progress.

**No dual-write window.** The backfill is a one-shot data move, not a sustained dual-write pattern. Once done, cutover swaps source-of-truth atomically — by `WAVE2_BACKEND_*` flag flip (Option A) or by `git revert` + redeploy (Option B). See "No dual-write" subsection under Rollback Strategy below.

### Per-user scoping change

Postgres `reviewer_suggestions` filters by `user_profile_id` in places (e.g., `generate-emails.js:57` enforces "only your own saved candidates"). Dataverse `wmkf_appreviewersuggestion` is org-visible by default. **This is an intentional model change**: post-migration, all PDs see all suggestions; the "my candidates" filter becomes a UX convenience (filter on `_ownerid_value` or `_wmkf_programdirector_value` of the linked request), not a security boundary. Document explicitly so the cross-user-isolation tests can be updated rather than failing silently.

## Picklist value mapping

The `wmkf_appreviewersuggestion` adapter (`reviewer-suggestion.js:57`) **throws on unknown picklist values**. Two existing maps must be respected by anything writing into the entity:

| Postgres `response_type` | Dataverse picklist value |
|---|---|
| `accepted` | (look up in adapter `RESPONSE_TYPE_MAP`) |
| `declined` | (same) |
| `no_response` | (same) |

| Postgres `review_status` | Dataverse picklist value |
|---|---|
| `accepted` | (look up in adapter `REVIEW_STATUS_MAP`) |
| `materials_sent` | (same) |
| `under_review` | (same) |
| `review_received` | (same) |
| `complete` | (same) |

**Net-new picklists from extensions**: `wmkf_ReviewerImpact` (1–4 + 99 sentinel), `wmkf_ReviewerRisk` (1–4 + 99), `wmkf_ReviewerOverallRating` (1–5 + 99). Backfill never writes these — they originate at review submission time. Aggregations always filter `< 99`.

**Validation**: backfill rejects rows with picklist values not in the adapter maps — log to `Anomalies` count, do not coerce.

## Silent truncation gotcha

The `wmkf_potentialreviewer` adapter clamps `wmkf_organizationname` and `wmkf_areaofexpertise` to 100 chars (`lib/dataverse/adapters/potential-reviewer.js:43`). Existing comment is honest: *"speculative caps would silently truncate legitimate values."*

Backfill must:
- Log when truncation occurs with the original full string in the parity report.
- Treat truncation as a yellow flag, not a blocker. (100-char affiliation is rare; expertise often longer.)
- For expertise: if the original is a multi-clause string, truncate at the last `;` or `,` before 100 chars rather than mid-word.

Audit: are there other 100-char (or other) caps elsewhere in the adapter set? Run a one-off scan before pilot.

## Endpoint rewrite scope

| Endpoint | Today | Migration work |
|---|---|---|
| `pages/api/reviewer-finder/discover.js` | Cache lookup via `DatabaseService.findResearcher` (Postgres `researchers`) | Replace cache lookup with match-on-discovery against `contact`. Drop Postgres dependency. |
| `pages/api/reviewer-finder/researchers.js` | Admin pool CRUD over `researchers` / `researcher_keywords` / `publications` | **Retire** (locked S136 2026-05-06). Database tab loses meaning under 1:1 model. Replaced by net-new "Add candidate by hand" feature (see below). |
| `pages/api/reviewer-finder/generate-emails.js` | Reads `reviewer_suggestions`, writes `email_sent_at` | Read from `wmkf_appreviewersuggestion`; write `wmkf_emailsentat` on `wmkf_appreviewersuggestion`. |
| `pages/api/reviewer-finder/extract-summary.js` | Reads `proposal_searches` as IDOR guard (broken — table empty); writes `reviewer_suggestions` | **Retire entirely** (locked S136). Remove caller in `pages/reviewer-finder.js:3538`. |
| `pages/api/reviewer-finder/grant-cycles.js` | Direct `sql\`\`` against `grant_cycles` (5+ sites) **plus** `proposal_searches` and `reviewer_suggestions` reads (verified 2026-05-12 grep) | Rewrite all sites against `wmkf_appgrantcycle` (alt-key by short_code). The `proposal_searches`/`reviewer_suggestions` reads in this file go away when those tables retire — re-implement against Dataverse equivalents during this rewrite. |
| **`pages/api/review-manager/render-emails.js`** (scope addition, surfaced by grep gate 2026-05-06) | `loadCycleConfigs()` reads `grant_cycles.{short_code, name, program_name, review_deadline, custom_fields}` | Rewrite to read `wmkf_appgrantcycle`. Was missed in earlier scoping which described Review Manager as fully Dataverse-only. |
| **`pages/api/review-manager/send-emails.js`** (scope addition) | `loadCycleConfigs()` reads `grant_cycles.{short_code, review_template_blob_url, additional_attachments}` | Same rewrite. |
| `pages/api/reviewer-finder/my-proposals.js` | Mixed Postgres + Dataverse | Pick Dataverse; remove Postgres path. |

**Endpoints already built (S139):**

- `pages/api/reviewer-finder/contact-history.js` — batched lookup. POST body: `{ contactIds: [...] }`. Returns: `{ <contactId>: { reviewerHistory: [...], piHistory: [...] } }`. UNION-with-projectleader read strategy. Used by the picker UI to populate badges (consumer wiring is still to build).

**Net-new endpoints still to build:**

- `pages/api/reviewer-finder/add-candidate-manual.js` — net-new "add candidate by hand" feature, replaces retired Database tab. Writes to all three Dataverse entities via existing adapters.

**Service-layer rewrites:**

- `lib/services/database-service.js` — researcher/publication/keyword paths gutted; suggestion paths point at `wmkf_appreviewersuggestion`.
- `lib/services/discovery-service.js` — calls `DatabaseService.findResearcher` (1 of 3 callers, verified via Atlas). Replace with match-on-discovery against `contact`.
- `lib/services/deduplication-service.js` — calls `DatabaseService.findResearcher` (2 of 3 callers). Reads candidates from Dataverse instead of Postgres; logic unchanged.
- `lib/services/contact-enrichment-service.js` — **active Postgres writer (Codex round-3 correction).** Calls `DatabaseService.createOrUpdateResearcher` (writer) and `findResearcher` (3rd caller). Migration scope: rewrite the writer to upsert against `wmkf_potentialreviewers` + `wmkf_appresearcher` via the existing adapters (`upsertByEmail`, `upsertByPotentialReviewer`). Output continues to feed match-on-discovery; the storage destination changes.
- New: `lib/services/contact-history-service.js` — encapsulates the match-on-discovery + history aggregation.

**No change:** `pubmed-service.js`, `arxiv-service.js`, `biorxiv-service.js`, `chemrxiv-service.js`, `orcid-service.js`, `serp-contact-service.js`, `claude-reviewer-service.js`. External-DB clients don't care where we persist.

## UI changes (`pages/reviewer-finder.js`)

31 fetch sites. HTTP contracts mostly unchanged so most call sites don't move. New work:

- **Candidate card** — render history badges. New props: `contactId`, `reviewerHistory`, `piHistory`. Bulk-fetch via `/api/reviewer-finder/contact-history` after discovery returns.
- **History modal component** — clickable badge → modal listing each event with request number link, cycle code, response type / decision, date. Color-code recency.
- **ID format sweep** — Postgres researcher IDs were `INTEGER`; Dataverse equivalents are GUIDs. Audit anywhere a researcher ID is used as a React key, compared with `===`, or coerced via `parseInt`.

## Dependency order

Hard constraints (each blocks the step after it):

1. **Decisions locked** (no longer dependency-order items): `researchers.js` retires; `extract-summary.js` retires entirely; cleanup-cron predicate; 14-day grace; junction approach.
2. **Schema patch.** Patch `lib/dataverse/schema/wave2/wmkf_app_grant_cycle.json` to add the 3 missing fields (`wmkf_ShortCode`, `wmkf_ProgramName`, `wmkf_CustomFields`). Re-run `apply-dataverse-schema.js`. Entity already exists in prod; this is additive.
3. **`grant_cycles` migration + cutover.** Three-file scope (verified 2026-05-12 grep): `pages/api/reviewer-finder/grant-cycles.js`, `pages/api/review-manager/render-emails.js`, `pages/api/review-manager/send-emails.js`. Must complete **before email flows are migrated** — `generate-emails.js` reads cycle attachment settings indirectly through `grant-cycles.js`, so cycle data must be Dataverse-resident first. Postgres `grant_cycles` is the only Wave 2 table that actually migrates (the rest drain).
4. **Reviewer-suggestions parity triage** (8-row delta). Per Codex 3b: before commit-mode backfill, decide each row's true status — genuine missed sync vs. legitimate Postgres-only artifact. Then commit-mode the genuine misses. Required before `generate-emails.js` and `my-proposals.js` cutover (lifecycle counts depend on full Dataverse state).
5. **Junction backfill commit-mode run.** Execute `scripts/backfill-request-person-junction.js` against prod (~3,000 rows). After this, the junction holds the canonical co-PI history (additive). Per §"Junction read strategy," both reads are steady-state: projectleader stays authoritative for lead PI, junction is additive for co-PIs. Neither retires post-pilot.
6. **`my-proposals.js` lifecycle counts** (`pages/api/reviewer-finder/my-proposals.js:153`). Cutover after step 4 verifies.
7. **`maintenance-service.js` blob orphan scanner.** Reads Postgres `proposal_searches`, `grant_cycles`, `reviewer_suggestions` for blob URLs. **Live-data note**: only `reviewer_suggestions.summary_blob_url` (55%) and `review_blob_url` (1%) carry real data. Rewrite to read Dataverse before cutover; bounded urgency.
8. **`lib/services/database-service.js` researcher/publication/keyword methods.** Either gut (if no remaining callers) or rewrite to delegate to Dataverse adapters. Codex 5 — heavy consumer. Reachable from `discovery-service.js`, `deduplication-service.js`, `contact-enrichment-service.js`.
9. **Cleanup cron (engaged predicate).** Build with backup-on-delete logic; dry-run mode only until 14+ days post-cutover.
10. **Match-on-discovery service + discovery-service.js wiring.** Read-only; ships anytime after step 5.
11. **`WAVE2_BACKEND_*` decision (Option A vs B).** Per "Rollback strategy" — defer the call until step 3 build starts; revisit per-table if needed.
12. **Cutover.** Service layer flips per-table. Method depends on step 11 decision.
13. **Cleanup cron real-mode.** Earliest 14 days post-cutover. **`scripts/restore-from-cleanup-backup.js` must exist before this step.**
14. **Decommission.** Drop Postgres tables after 14+ days clean.

**Post-pilot enhancements (descoped from critical path):**
- History badges UI in Reviewer Finder (additive UX; ships after the data layer is clean).
- `add-candidate-manual.js` endpoint + UI (decision needed: do PDs accept discovery-only candidate entry for pilot? If yes, defers post-pilot; if no, must ship in step 10 window).
- Contact form "Reviewer history" subgrid (Connor's separate build; not in pilot critical path).

**Zero-downtime stance**: this migration is zero-downtime by design. Postgres tables stay readable until step 12, giving us inspection-after-cutover regardless of which Option (A or B) is chosen. Under Option A, per-table `WAVE2_BACKEND_*` flags also allow rapid flip-back. No maintenance window planned. If a step requires one, it's a sign the step should be split.

**In-flight SSE — only relevant under Option A**: `discover.js` and `generate-emails.js` stream via SSE for tens of seconds. If `WAVE2_BACKEND_*` flags are built (Option A), a flag flip mid-stream could send a request through the new code path while later writes go through the old. Mitigation: each SSE handler reads the flag value **once at request start** and uses that for the full request lifetime. Document in service-layer doc; verify in code review of every flag-aware handler. Under Option B (hard cutover), there is no mid-stream-flip scenario — the deploy boundary is the cutover point.

## Open questions for Connor

1. **Cleanup cron predicate** — **resolved S136 2026-05-06**: locked as-is (8 signals across slot + suggestion: `wmkf_contact`, `wmkf_emailsentat`, `wmkf_responsetype`, `selected`, `ExternalTokenIssued`, `ProposalFirstAccessed`, `ReviewSharePointFolder`, any review-form picklist). Per memory `project_reviewer_postgres_to_dataverse_migration`.
2. **14-day grace period** — **resolved S136 2026-05-06**: locked (matches Wave 1 stability-clock pattern).
3. **`researchers.js` admin UI** — **resolved 2026-05-06**: retire. Database tab goes away. Replaced by "Add candidate by hand" feature (§4 above).
4. **Net-new reviewer-portal columns on `wmkf_appreviewersuggestion`** — **resolved 2026-05-06**: add `wmkf_DeclineReason` (multi-line text) + `wmkf_ResponseReceivedAt` (datetime). Late/on-time flag and response-latency hours derive at query time.
5. **Contact form "Reviewer history" view** — **resolved 2026-05-06**: separate ask of Connor (not bundled with pilot's account-form work; pilot doesn't touch the contact form). Justin opted in rather than deferring post-pilot.
6. **PI/co-PI junction (`wmkf_apprequestperson`)** — **fully resolved 2026-05-07**: junction approach locked S136; both implementation questions answered jointly:
   - Junction-table preference extends to vendor-indexed data — proceed.
   - Sync is net-new PA flows (Connor's build), not an extension. PA flows on `akoya_request` create/update will create `contact` records as needed and write junction rows directly.
   - `_wmkf_projectleader_value` (PI lookup) **stays live** — used by other flows unrelated to reviewers. PA flows dual-write (projectleader field + junction `pi` row). Only the co-PI slots (`_wmkf_copi1..5_value`) become obsolete once backfill + PA flows are live.
   - Backfill script (`scripts/backfill-request-person-junction.js`) is Justin/Claude's job.
7. **`is_archived` on `grant_cycles`** — **resolved 2026-05-06**: column does not exist in Postgres; spec corrected (`is_active` handles active/archive distinction). Original Codex concern was a false alarm.

## Rollback strategy

### No dual-write — single-source-of-truth flips

To be explicit (Codex flagged this as a missing stance): **this migration does not run a dual-write window**. The rollback-safety question is **whether to gate cutovers on per-table `WAVE2_BACKEND_*` env flags or accept hard cutover**. Both are real options; pick one before doing endpoint rewrites.

**Option A — `WAVE2_BACKEND_*` flags (modeled on Wave 1).** Per-table flag dispatches at the service layer. Cutover = flag flip in Vercel env; rollback = flip back. Adds ~50 lines per service module. Necessary if we want a per-request rollback path during cutover.

**Option B — Hard cutover, no flags.** Just rewrite each endpoint to use Dataverse adapters and ship. Rollback = `git revert` + redeploy. Faster to build; rollback is coarser and slower (revert affects the whole endpoint, takes a deploy cycle).

The original plan implicitly assumed Option A. Build-priority discussion 2026-05-12 raised the question of whether Wave 1's flag pattern is actually necessary for Wave 2, since Wave 2 is drain rather than dual-write. Codex 3d (2026-05-12) pointed out that without flags, every cutover is hard. **Decision still pending** — defer until the first endpoint cutover is being built; the answer may be "Option A for `grant_cycles` (most-read), Option B for the smaller drain targets." Until decided, treat the `WAVE2_BACKEND_*` row in the spec-vs-built table as "decision pending," not "spec'd."

There is no period where both backends are simultaneously authoritative. This avoids the divergence-detection-via-reconciliation trap, but means **a Dataverse write failure in the post-flip window surfaces as a user-visible error**, not silent dual-write success. Rollback = flag flip (Option A) or `git revert` (Option B), not transactional rewind.

### Data-loss risk worth naming explicitly (Codex 7b, corrected 2026-05-12)

The previous framing of this section conflated two separate read paths. Corrected:

- **PI history** comes from `_wmkf_projectleader_value` on `akoya_request` (lead PI) **UNION** the `wmkf_apprequestperson` junction (PI + co-PIs). Both stay live as steady-state per §"Junction read strategy"; nothing retires post-pilot.
- **Reviewer history** comes from `wmkf_appreviewersuggestion` rows linked to a contact. The projectleader fallback **does not rescue** missing reviewer-suggestion rows — these are distinct data paths.

**The actual data-loss risk:** if any Postgres `reviewer_suggestions` row fails to backfill to Dataverse before the Postgres table is dropped, that row's reviewer-history content (decline reason, response timestamp, ack state, etc.) is **permanently lost**. The projectleader path won't recover it because that path serves PI history, not reviewer history.

**Mitigations the plan requires:**
1. **Triage the 8-row Postgres-only delta** (parity script output) before running `scripts/backfill-reviewer-suggestions-to-dataverse.js` in commit mode. For each anomaly, decide: genuine missed sync (must backfill) vs. legitimate Postgres-only artifact (e.g., proposal not yet in Dataverse; safe to discard).
2. **Run `scripts/reconcile-reviewer-migration.js`** after backfill commits and again immediately before any Postgres table drop. Cutover blocks until parity is 0-row drift on active-cycle data.
3. **Postgres tables stay read-only, not dropped, for 14+ days post-cutover.** If divergence surfaces in that window, the original rows are still available for inspection.

### Per step, mostly reversible until cutover

1. Schema creation: delete table from solution; no prod impact.
2. Match-on-discovery + history: read-only; turn off via feature flag (`REVIEWER_FINDER_HISTORY_BADGES=false`) — no data implications.
3. Cleanup cron: dry-run mode logs what it would delete without acting. Run dry-run for one full cycle before turning on for real. Once acting, pre-delete export to blob with 30-day retention provides manual restore path. **Restore script** (`scripts/restore-from-cleanup-backup.js`): reads the JSON blob, re-CREATEs the `wmkf_appreviewersuggestion` rows via `reviewerSuggestionAdapter.upsert`. Idempotent via alt key. (Slots and sidecars are never deleted by the cron — only suggestion rows — so the restore path is suggestion-only too.) Half-day to write; **must exist before cron's first real-mode run.**
4. Endpoint rewrites: see Option A vs B above; rollback path differs depending on which.
5. Cutover: Postgres tables set read-only but not dropped. If cutover regresses, re-enable Postgres path, investigate.
6. Decommission: only after 14 days clean. Final blob backup.

### Partial-write recovery (only applies under Option A — flag flips)

This subsection describes recovery from a flag flip-back, which is only possible if Option A (`WAVE2_BACKEND_*` flags) is chosen. **Under Option B (hard cutover), rollback is `git revert` + redeploy — there are no flag-window divergences to repair.** Skip this section if Option B is chosen.

If a flag flip happens, Dataverse takes a few writes, then we discover a problem and flip back to Postgres — those Dataverse-written rows are now divergent from the next Postgres-write attempts.

**Recovery procedure** (`scripts/repair-divergence-postflip.js`, spec'd):

1. **Note the flip-back timestamp.** All Dataverse rows on the affected entity with `createdon > flipForwardTimestamp AND createdon < flipBackTimestamp` are candidates for reconciliation.
2. **Dump the candidates** as JSON via the relevant adapter (`reviewerSuggestionAdapter.findRecent({ since })`).
3. **Replay into Postgres** via the legacy `DatabaseService` write paths. Idempotent on Postgres side via the existing UNIQUE constraints (`(proposal_id, researcher_id)` on `reviewer_suggestions`, etc.).
4. **Re-flip forward** only after reconciliation script reports zero drift between the dumped Dataverse set and the replayed Postgres set.

**Acceptance**: don't re-flip until repair script's parity report shows zero drift. If repair fails (Postgres write rejects, etc.), the Dataverse rows stay; flag stays Postgres; manual triage required before retry.

### Pre-drop grep gates (per CLAUDE.md carryover hygiene)

Before any destructive step, an explicit `rg` check must show zero live callers:

| Step | Grep targets | Pass condition |
|---|---|---|
| Drop `pages/api/reviewer-finder/researchers.js` | `rg "/api/reviewer-finder/researchers"` across `pages/`, `lib/`, `scripts/`, `tests/` | Zero matches |
| Drop Database tab from `pages/reviewer-finder.js` | `rg "fetch.*reviewer-finder/researchers"` in same scope | Zero matches |
| Drop Postgres `researchers` table | `rg "FROM researchers\b\|INTO researchers\b\|UPDATE researchers\b"` in `lib/`, `pages/`, `scripts/` | Zero matches |
| Drop Postgres `researcher_keywords` table | `rg "researcher_keywords"` in same scope | Zero matches |
| Drop Postgres `publications` table | `rg "FROM publications\b\|INTO publications\b\|UPDATE publications\b"` in same scope | Zero matches (verified 2026-05-06: writer is dead) |
| Drop Postgres `proposal_searches` table | `rg "proposal_searches"` in same scope | Zero matches outside ad-hoc scripts |
| Drop Postgres `reviewer_suggestions` table | `rg "FROM reviewer_suggestions\b\|INTO reviewer_suggestions\b\|UPDATE reviewer_suggestions\b"` in same scope | Zero matches |
| Drop Postgres `grant_cycles` table | `rg "FROM grant_cycles\b\|INTO grant_cycles\b\|UPDATE grant_cycles\b"` in same scope | Zero matches |

Each gate runs **immediately before** the destructive command, not at planning time. Output captured in the migration log. If any gate finds a live caller (added since cutover, missed in the rewrite), **stop and re-investigate** — do not proceed with `--force` or equivalent.

### Rollback triggers (when to flip back)

Each cutover (flag flip under Option A, or deploy under Option B) publishes a watch dashboard. Auto-rollback is not built; **manual rollback within 15 minutes** if any of these breach. Rollback mechanics differ by option: Option A is a Vercel env flip (~1 min effective); Option B is a `git revert` + redeploy (~10 min effective):

| Signal | Threshold | Action |
|---|---|---|
| Dataverse write failure rate (5-min window) | > 2% of attempts | Rollback that table (Option A: flip flag back; Option B: `git revert` + redeploy); investigate. |
| Dataverse query P95 latency (5-min window) | > 3× pre-cutover baseline | Same. |
| Email-generation failure rate | > 5% per hour OR any "no candidates found for known PD" 0-row response | Same. Email is high-stakes; staff notice immediately. |
| Suggestion-count drift (Postgres vs. Dataverse) | > 5 rows for an active cycle | Pause the relevant cutover (Option A: hold the flag at Postgres; Option B: revert the cutover commit before merging the next); reconcile before continuing. |
| User-reported regression (Slack / direct message) | 1 confirmed report | Pause; investigate. We don't have enough users for "wait for the second report." |

Pre-cutover baselines captured during W4 dry-run; documented in the watch dashboard.

## Acceptance tests + reconciliation reports

Pre-cutover and post-cutover, run a reconciliation script (`scripts/reconcile-reviewer-migration.js`) that produces a parity report. **Cutover blocks until parity is clean** for active-cycle data.

| Check | Postgres source | Dataverse equivalent | Tolerance |
|---|---|---|---|
| Active-cycle suggestion count by request | `SELECT COUNT(*) FROM reviewer_suggestions GROUP BY proposal_id` for active cycles | `wmkf_appreviewersuggestion` filtered by `wmkf_grantcyclecode` | 0 rows drift |
| Per-suggestion `email_sent_at` | `reviewer_suggestions.email_sent_at` | `wmkf_appreviewersuggestion.wmkf_emailsentat` | exact match for Group A |
| Per-suggestion `response_type` | `reviewer_suggestions.response_type` | `wmkf_appreviewersuggestion.wmkf_responsetype` (mapped) | exact match for Group A |
| Active grant cycle records | `SELECT * FROM grant_cycles WHERE is_active = true` | `wmkf_appgrantcycle` filtered by `wmkf_isactive` | 0 rows drift |
| Per-cycle attachment URLs | `grant_cycles.review_template_blob_url`, `additional_attachments` | `wmkf_appgrantcycle.wmkf_reviewtemplateurl`, `wmkf_additionalattachments` | URLs reachable (HEAD 200 OK) |
| `my-proposals` lifecycle counts (PD-scoped) | `fetchReviewerCounts` Postgres query | Equivalent Dataverse aggregate | 0 rows drift, sorted by request_number |
| Email-generation smoke (5 candidates, 1 known PD) | Postgres-backed run | Dataverse-backed run | identical .eml output (modulo whitespace) |

**Cross-user-isolation tests update**: `tests/cross-user-isolation.test.js` encodes Postgres-era "PDs only see their own suggestions" behavior. The intentional model change to org-visible-with-PD-default-filter requires those tests to be **rewritten, not just updated**. New test shape:

- All-PDs query returns all suggestions (org-visible).
- Default `/api/reviewer-finder/my-candidates` query (no `?requestId` etc.) returns suggestions filtered by `_wmkf_programdirector_value` of the linked request.
- Direct override (`?requestId=<guid>`) returns regardless of PD.
- Negative test: an applicant or external token hitting `/api/reviewer-finder/*` is still rejected.

## Dataverse readiness checklist

Every item below must have a check + date + owner before the relevant cutover step depends on it. Dates aligned to the refreshed W3–W7 schedule below.

| Item | Owner | Due | Verification |
|---|---|---|---|
| ~~`wmkf_appgrantcycle` entity created~~ | DONE (entity exists in prod, partial schema) | — | EntityDefinitions probe confirmed 10 attrs. |
| `wmkf_appgrantcycle` schema patch (3 missing attrs) | Justin | W3 | `apply-dataverse-schema.js` succeeds; EntityDefinitions shows all 13 attrs. |
| Alt key `wmkf_shortcode` on `wmkf_appgrantcycle` confirmed unique-enforced | Justin | W3 | Manual duplicate-create attempt returns Dataverse alt-key violation. |
| ~~`wmkf_appreviewersuggestion` extensions deployed (`wmkf_DeclineReason`, `wmkf_ResponseReceivedAt`)~~ | DONE 2026-05-09 (S143) | — | Live in prod; adapter `select` includes them. |
| ~~`wmkf_apprequestperson` junction created~~ | DONE 2026-05-07 (commit `c8cbfe1`) | — | Schema present in prod; alt key `(wmkf_request, wmkf_contact, wmkf_role)` enforced live. |
| OData filter performance: `wmkf_appreviewersuggestion` filtered by `wmkf_grantcyclecode` | Justin | W4 | Prod query of 100 rows returns < 500ms P95. |
| OData filter performance: `wmkf_potentialreviewer` filtered by `wmkf_contact` | Justin | W4 | Same. |
| OData filter performance: `wmkf_apprequestperson` filtered by `wmkf_contact` | Justin | W4 | Benchmark against the contact-history endpoint's real query shape. |
| `$batch` reviewer-suggestion writes succeed at 50-row batches | Justin | W4 | Prod batch test against backfill candidates. |
| Junction backfill executed in commit mode | Justin | W4 | ~3,000 rows in `wmkf_apprequestperson`; `contact-history` returns junction-sourced results in addition to projectleader. (Schedule-aligned with W4 "data alignment" theme.) |
| Reviewer-suggestions 8-row anomaly triage documented | Justin | W4 | Per-row decision captured in commit message of the backfill commit-mode run. |
| Smoke test: contact history endpoint batched lookup | Justin | W4 | 25-contact batch returns < 1s P95 (already smoke-tested via `scripts/smoke-contact-history.js`; rerun against full junction backfill). |
| Smoke test: `generate-emails` against migrated suggestion data | Justin | W5 | End-to-end email-generation flow against Dataverse data after `generate-emails.js` cutover. |
| Contact form "Reviewer history" subgrid added | Connor | Post-pilot (no pilot dependency) | Sandbox contact form renders the subgrid. In the Post-pilot row of the schedule. |

**Failure of any item postpones cutover.** No partial passes; if a smoke test reveals a regression, fix before flipping flags.

## Revised pilot timing

**Refreshed 2026-05-12.** Today: 2026-05-12. Pilot: mid-June 2026 (~5 weeks). The original W1–W6 schedule was written 2026-05-06; updated below to reflect what shipped since (S139 build set, Wave 1 closeout, junction backfill script built, contact-history endpoint built).

### State as of 2026-05-12 (was W1+W2 in original schedule)

**Shipped:**
- Junction entity (`wmkf_apprequestperson`) deployed to prod
- `/api/reviewer-finder/contact-history` endpoint (steady-state UNION of junction + projectleader for PI history)
- `scripts/backfill-request-person-junction.js` (built, not yet executed in commit mode)
- All four Wave 2 adapters live
- `save-candidates`, `my-candidates`, `load-proposal` fully on Dataverse
- Decline-reason fields + response-received-at on `wmkf_appreviewersuggestion`

**Still pending from W1:**
- `wmkf_appgrantcycle` schema **patch** (entity already exists in prod with 10 attrs live; 3 fields need adding: `wmkf_ShortCode`, `wmkf_ProgramName`, `wmkf_CustomFields`)
- Anomaly-triage decisions on the 8 parity outliers

### Updated forward schedule

Slip-eligible items (history badges UI, add-candidate-manual, match-on-discovery wiring, contact form subgrid) are explicitly moved to a "Post-pilot enhancements" block below the table so they don't crowd critical-path weeks. Cleanup-cron real-mode is post-pilot regardless. Each week below carries one major theme plus its safety prerequisites.

| Window | Theme | Concrete deliverables |
|---|---|---|
| W3 (2026-05-12 → 2026-05-19) | **Grant cycle migration.** Theme: get `grant_cycles` off Postgres so Review Manager email path is unblocked. | Patch `wmkf_appgrantcycle` schema (3 missing fields) + apply. **Verify `wmkf_shortcode` alt-key uniqueness** (readiness checklist item). Decide `WAVE2_BACKEND_*` Option A vs B. Rewrite `pages/api/reviewer-finder/grant-cycles.js` (full scope: `grant_cycles` + the file's `proposal_searches` + `reviewer_suggestions` reads). Rewrite `pages/api/review-manager/render-emails.js` + `send-emails.js` `loadCycleConfigs()` paths. Backfill `grant_cycles` data into `wmkf_appgrantcycle`. |
| W4 (2026-05-19 → 2026-05-26) | **Reviewer-suggestion data alignment.** Theme: Dataverse holds the complete suggestion ledger before any reader cutover. | Triage 8 parity outliers (decide each: recover vs accept-loss). Run `scripts/backfill-reviewer-suggestions-to-dataverse.js` in commit mode. Execute `scripts/backfill-request-person-junction.js` in commit mode (~3,000 rows). Smoke contact-history against full junction set. **OData filter perf benchmarks** on `wmkf_appreviewersuggestion`+`wmkf_grantcyclecode`, `wmkf_potentialreviewer`+`wmkf_contact`, `wmkf_apprequestperson`+`wmkf_contact` (all readiness-checklist items). **`$batch` 50-row write smoke** on `wmkf_appreviewersuggestion`. Write `scripts/reconcile-reviewer-migration.js`. |
| W5 (2026-05-26 → 2026-06-02) | **Reviewer-suggestion reader cutover + service-layer cleanup.** Theme: every Postgres `reviewer_suggestions` read goes to Dataverse. | Rewrite `pages/api/reviewer-finder/generate-emails.js`, `my-proposals.js`. Retire `extract-summary.js` entirely (remove caller in `pages/reviewer-finder.js:3538`). Rewrite `lib/services/maintenance-service.js` blob orphan scanner. Gut/rewrite `lib/services/database-service.js` researcher + publication + suggestion methods (Codex 5 — heavy consumer). |
| W6 (2026-06-02 → 2026-06-09) | **`researchers.js` retirement + cleanup cron.** Theme: heaviest Postgres consumer goes away; deletion machinery written but dormant. | Retire `pages/api/reviewer-finder/researchers.js` — API removal + Database-tab UI removal + test/doc cleanup, grep gates per §"Pre-drop grep gates." Write cleanup cron (`/api/cron/reviewer-cleanup` or similar) in dry-run-only mode. Write `scripts/restore-from-cleanup-backup.js` (must exist before any real-mode cron run). Production cutover begins per-table, watching dashboards. Postgres tables set read-only. |
| W7 (2026-06-09 → 2026-06-16) | **Pilot launch.** Theme: ship. | Pilot launch (mid-June Phase II Research cycle). Cleanup cron stays in dry-run. Dataverse readiness checklist 100% complete before launch. |
| Post-pilot (2026-06-16 onward) | **Enhancements + decommission.** Theme: visible polish + safe drops. | History badges UI in Reviewer Finder. `add-candidate-manual.js` endpoint + UI. Match-on-discovery service (`lib/services/contact-history-service.js`) + `discovery-service.js` wiring. Contact form "Reviewer history" subgrid (Connor). Cleanup cron real-mode (earliest 14 days post-cutover). Postgres table drops (14+ days post-cutover clean). |

**Slip-eligible** (already moved to "Post-pilot enhancements" row above — these will not gate the mid-June pilot):
- History badges + match-on-discovery wiring (additive UX)
- `add-candidate-manual` endpoint + UI (PDs save via discovery flow only during pilot)
- Contact form "Reviewer history" subgrid (Connor's separate build)
- Cleanup cron real-mode (post-pilot regardless)

**What's NOT slip-eligible** (gate cutover; must complete by W6):
- 8 parity-anomaly triage decisions documented (recover or accept loss, per row)
- `wmkf_appgrantcycle` schema patch + data backfill
- `grant_cycles` 3-file cutover (`grant-cycles.js`, `render-emails.js`, `send-emails.js`)
- `reviewer_suggestions` reader cutover (`generate-emails.js`, `my-proposals.js`)
- `extract-summary.js` retirement
- `researchers.js` retirement + grep-gated table drop preparation
- `maintenance-service.js` blob-scanner rewrite
- `database-service.js` researcher/publication/suggestion methods gutted-or-rewritten
- `WAVE2_BACKEND_*` Option A vs B decision (made by end of W3)
- Restore script written + tested before any cleanup-cron real-mode run
- Dataverse readiness checklist 100% complete before pilot launch

## Related

- `docs/POSTGRES_TO_DATAVERSE_MIGRATION.md` — Wave 1 (shipped) + the original Wave 2 spec this doc supersedes
- `docs/INTAKE_PORTAL_DESIGN.md` — pilot design; the workstream this gates
- `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md` — pilot Dataverse schema audit (sibling)
- `docs/archive/CONNOR_INTAKE_PORTAL_SYNC.md` — 2026-05-06 walkthrough
- `docs/EXTERNAL_REVIEWER_INTAKE_PLAN.md` — reviewer portal field shape
- `lib/dataverse/adapters/{contact, potential-reviewer, researcher, reviewer-suggestion}.js` — live adapter code
- `lib/utils/cycle-code.js` — `meetingDateToCycleCode(d)` for badge rendering
- `scripts/probe-rr-program-tagging.js` — confirms `akoya_program=RR` is unused, no existing convention to follow
- `scripts/db-row-counts.js` — current Postgres row counts
- `.claude-memory/project_reviewer_postgres_to_dataverse_migration.md` — strategic context
