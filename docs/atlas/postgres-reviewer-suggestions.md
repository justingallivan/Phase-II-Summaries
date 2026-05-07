# Atlas: `reviewer_suggestions` (Postgres)

**Last verified:** 2026-05-07 via `scripts/audit-postgres-state.js` + `scripts/backfill-reviewer-suggestions-parity.js`
**Live row count:** 337

## Source of truth

**Mixed and shifting.** Postgres holds the legacy historical record. Dataverse `wmkf_appreviewersuggestion` (336 rows) holds the active per-proposal lifecycle. Parity probe shows ~99% of Postgres rows are stale duplicates of Dataverse rows.

## Schema (live, 37 columns)

Identity: `id`, `proposal_id` (varchar(100) — title-prefix, NOT a cycle code), `proposal_title`, `researcher_id` (FK), `request_number` (varchar — natural join key to `akoya_request.akoya_requestnum`).

Scoring/match: `relevance_score`, `match_reason`, `sources` (text[]), `proposal_abstract`, `proposal_authors`, `proposal_institution`, `co_investigators`, `co_investigator_count`.

Lifecycle bools: `selected` (337/100%), `invited` (337/100%), `accepted` (29/9%), `declined` (337/100%).

Outreach timestamps: `email_sent_at` (43/13%), `email_opened_at` (0%), `response_received_at` (22/7%), `response_type` (22/7%; `accepted | declined | no_response`), `materials_sent_at` (19/6%), `reminder_sent_at` (1/0%), `reminder_count` (337/100%), `review_received_at` (1/0%), `review_blob_url` (1/0%), `review_filename` (1/0%), `thankyou_sent_at` (1/0%), `review_status` (20/6%).

External-reviewer intake: `proposal_url` (16/5%), `proposal_password` (16/5%).

Blob attachments: `summary_blob_url` (184/337 = 55% populated) — Vercel Blob URL of the extracted summary page(s). Written by `pages/api/reviewer-finder/extract-summary.js` (≈line 89) as part of save-candidates. **Legacy field** — was load-bearing for the deprecated `generate-emails` flow; the active `pages/api/review-manager/send-emails.js` flow attaches `grant_cycles.review_template_blob_url` (≈line 176, 379) instead. Migration can drop this column safely once `generate-emails` is retired.

User scoping: `user_profile_id` (337/100%), `program_area` (337/100%), `grant_cycle_id` (337/100%, FK grant_cycles.id).

UNIQUE constraint: `(proposal_id, researcher_id)`.

## Live state notes

- **`request_number` populated on 333 / 337 (99%)** — added retroactively via `scripts/backfill-request-numbers.js`. Critical for the Dataverse cutover (joins to `akoya_request`).
- 4 rows missing `request_number` are pre-J26 (from before the `akoya_requestnum` field was tracked).
- Cycle distribution (top 5): J26 program area title prefixes `qua/con/vis/res/fro/evo/mol/dea/cir/in-/ele/dec/die/mea/unc/gut/lin/fie/lig/all/non` — so `proposal_id` prefix is the proposal title's first 3 chars, not a structured code.
- **97.6% of rows are stale duplicates** of existing `wmkf_appreviewersuggestion` rows per parity probe. [VERIFIED 2026-05-06 via `scripts/backfill-reviewer-suggestions-parity.js`]
- **All 337 rows have `selected=true`** [VERIFIED 2026-05-07 via `scripts/audit-postgres-state.js`] — the "transient unselected scratch" pattern does not appear in live data. The Wave 2 cleanup-cron predicate is forward-looking only.
- **Pre-J26 data-quality caveat:** the tool that writes here was first used in J26 cycle and adoption was uneven; pre-J26 proposals (J25, J24, ...) have **no rows here** — picker falls back to `akoya_request.wmkf_potentialreviewer1..5` slot population. Pre-J26 zeros mean "unknown", NOT "0 invited". [Source: `project_reviewer_history_data_quality.md`]

## Read paths (16 files)

- `lib/services/database-service.js`, `lib/services/maintenance-service.js`
- `pages/api/reviewer-finder/{my-proposals,generate-emails,researchers,grant-cycles}.js`
- 11 scripts (audit, backfill, inspect, cleanup, etc.)

## Write paths (10 files)

- `lib/services/database-service.js`
- `pages/api/reviewer-finder/{extract-summary,generate-emails,researchers}.js`
- `scripts/{clear-all-database,backfill-request-numbers,setup-database,cleanup-duplicate-cycles,assign-orphan-records,import-user-assignments}.js`

**No `pages/api/review-manager/*` writers** — Review Manager reads `grant_cycles` from Postgres but writes lifecycle to Dataverse `wmkf_appreviewersuggestion` via the adapter.

## Cross-system

| Postgres | Dataverse `wmkf_appreviewersuggestion` |
|---|---|
| `(researcher_id → researchers.email)` + `request_number` | `(_wmkf_potentialreviewer_value, _wmkf_request_value)` (alt-key) |
| `selected`, `invited`, `accepted`, `declined` | identical booleans |
| `email_sent_at`, `response_received_at`, `materials_sent_at`, `reminder_sent_at`, `reminder_count`, `review_received_at`, `thankyou_sent_at`, `email_opened_at` | identical timestamps |
| `response_type` (string) | `wmkf_responsetype` (picklist; map in `lib/dataverse/adapters/reviewer-suggestion.js`) |
| `review_status` (string) | `wmkf_reviewstatus` (picklist) |
| `match_reason`, `relevance_score`, `sources`, `proposal_abstract`, `proposal_url`, `proposal_password`, `notes` | direct fields |

## Migration disposition [ASSUMED — per `docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md`]

- Backfill is **near-complete** (97.6% parity); remaining work is reconciling the ~2.4% delta + 4 orphans.
- Postgres `reviewer_suggestions` retired post-cutover via cleanup cron (drains, doesn't migrate).
- Cleanup cron predicate (locked S136): drops slot rows where `wmkf_meetingdate < today - 30 days` AND none of 8 engagement signals on the linked `wmkf_appreviewersuggestion` are populated: `wmkf_contact`, `wmkf_emailsentat`, `wmkf_responsetype`, `wmkf_selected`, `wmkf_externaltokenissued`, `wmkf_proposalfirstaccessed`, `wmkf_reviewsharepointfolder`, any review-form picklist (`wmkf_revieweraffiliation`, `wmkf_reviewerimpact`, `wmkf_reviewerrisk`, `wmkf_revieweroverallrating`).

## Open questions / gotchas

- `proposal_id` is title-prefix, not cycle-prefix. Idempotency on backfill must use `(researcher_email, request_number)`, NOT `(proposal_id, researcher_id)`. [VERIFIED via S136 Codex round 1 + parity probe]
- 4 rows lack `request_number` — handle as orphaned during cleanup. [VERIFIED 2026-05-07 via audit script]
