# Reviewer Postgres → Dataverse Migration Plan (Wave 2)

**Created:** 2026-05-06 (Session 136)
**Status:** Draft — pre-Connor sign-off on contact form / cleanup cron / history feature scope
**Priority:** Top — gates the intake portal pilot (mid-June 2026 Phase II Research)
**Target environment:** WM Keck Sandbox first; managed-solution export to prod

## What this doc supersedes

The Wave 2 spec in `docs/POSTGRES_TO_DATAVERSE_MIGRATION.md` (Session 106) was written assuming a **researcher-pool model** (free-standing `wmkf_app_researcher` rows accumulated across cycles, optional `wmkf_contact` lookup at promotion). What got actually built is different: a **per-proposal 1:1 sidecar model** (`wmkf_appresearcher` exists 1:1 with `wmkf_potentialreviewer`, scoped to specific proposal slots).

Connor (2026-05-06) confirmed the underlying intuition: researcher rows are **cycle-bounded transient candidate scratch**, not a permanent bibliometric pool. The 1:1 model coincidentally got this right. This doc operationalizes the migration around that ground truth.

## Where the migration actually stands today

**Already in Dataverse (live):**

- `wmkf_potentialreviewer` — per-proposal slot; canonical person/identity for that slot
- `wmkf_appresearcher` — 1:1 sidecar with the slot; bibliometric snapshot (h_index, ORCID, Scholar)
- `wmkf_appreviewersuggestion` — suggestion-log row per (reviewer, proposal)
- Adapters: `lib/dataverse/adapters/{contact, potential-reviewer, researcher, reviewer-suggestion}.js`
- Endpoints fully on Dataverse: `save-candidates.js`, `my-candidates.js`, `load-proposal.js`
- Review Manager fully on Dataverse: `reviewers.js`, `render-emails.js`, `send-emails.js`

**Postgres data still load-bearing:**

| Table | Rows (2026-05-06) | Disposition |
|---|---|---|
| `publications` | 0 | **Retire.** Writer is dead (`DatabaseService.addPublication` has no callers, table empty since at least 2026-05). Note: `researchers.js` admin UI still *reads* this table (publication browse + duplicate detection); read paths must be stubbed before the table can be dropped. |
| `proposal_searches` | 0 | **Reckon.** Writer is dead (no INSERT site found anywhere) **but `extract-summary.js` reads it as an IDOR ownership guard** (`pages/api/reviewer-finder/extract-summary.js:57`). Because the table is empty, the guard currently always fails — extract-summary is functionally broken today. **Decision needed**: (a) retire `extract-summary` entirely if it's unused (verify against UI), or (b) rewrite the IDOR guard against Dataverse (`wmkf_appreviewersuggestion._ownerid_value` or request-level access). |
| `researchers` | 331 | **Drain.** Don't migrate. Cycle close empties via cleanup cron. Read path in `researchers.js` is the blocker (admin UI). |
| `researcher_keywords` | 1,028 | **Drain.** Coverage moves to `wmkf_appresearcher.wmkf_keywords` for new rows. Same read-path blocker as above. |
| `reviewer_suggestions` | 337 | **Backfill spec needed** — see "Reviewer suggestions backfill" section below. Naive "active-cycle migrate, closed-cycle discard" is not enough. |
| `grant_cycles` | 13 | **Migrate** to net-new `wmkf_appgrantcycle`. Field-by-field mapping in "Grant cycle field mapping" section below — Postgres has more fields than the original §1 spec captured. |

Total live data is ~1,700 rows. The "migration" is mostly **letting Postgres data drain** as J26 closes, plus rewriting the few endpoints that still talk to Postgres.

## Locked decisions

### Data model: 1:1 stays

`wmkf_appresearcher` remains 1:1 with `wmkf_potentialreviewer`. Researchers are transient cycle scratch; permanent reviewer identity lives in `contact`. No researcher pool table.

Rationale: Reviewer Finder surfaces ~25 candidates per proposal. Selected reviewers promote to `contact` (permanent record). Unselected candidates have no value post-adjudication. Historical lookups about "have we worked with this person before" go through `contact` and the surviving `wmkf_potentialreviewer` rows linked to it.

### Cleanup cron

Cron runs weekly; only acts twice a year in practice (after June and December meeting dates).

**Logic:**

```
For each akoya_request where wmkf_meetingdate < (today - 14 days):
  For each wmkf_potentialreviewer row linked to that request:
    If the slot is "engaged" (defined below): keep
    Otherwise: delete (cascade-drops the 1:1 wmkf_appresearcher sidecar)
```

**"Engaged" predicate** — keep any slot where the slot OR its linked `wmkf_appreviewersuggestion` shows any engagement signal:

On `wmkf_potentialreviewer`:
- `wmkf_contact` populated (contact promotion happened)
- `wmkf_emailsentat` populated (we sent them anything)
- `wmkf_responsetype` populated (they responded)

On the linked `wmkf_appreviewersuggestion`:
- `wmkf_selected = true`
- `wmkf_ExternalTokenIssued` populated (we issued a magic link)
- `wmkf_ProposalFirstAccessed` populated (they engaged with the link)
- `wmkf_ReviewSharePointFolder` populated (review folder was created)
- Any of `wmkf_ReviewerImpact`, `wmkf_ReviewerRisk`, `wmkf_ReviewerOverallRating` populated (they submitted a review form)

The 14-day grace lets staff dip back into the unselected pool if late acceptances fall through. Reading `wmkf_meetingdate` at cron time handles board-moves-the-meeting cases automatically.

**Pre-delete backup**: before any delete, the cron exports the doomed rows (slot + sidecar + suggestion) to a JSON blob in Vercel Blob storage with 30-day retention. Provides a manual-restore path if a predicate-bug deletes wrongly. Restore script TBD; documenting the export is the gate.

### Engaged slots = de facto reviewer-history child entity

We don't need a new role-tracking entity. The set of `wmkf_potentialreviewer` rows that survive cleanup IS the per-contact reviewer history. Each row already carries timestamps, request linkage, and outcome. The cleanup cron is what turns the table from "current cycle scratch" into "permanent history of engaged reviewers."

This means the contact's history surface is just `wmkf_potentialreviewer` filtered by `wmkf_contact eq <id>`. No new entity to build, just a filter and a UI.

### Reviewer-portal data lives on `wmkf_appreviewersuggestion` (NOT `wmkf_potentialreviewer`)

**Correction from earlier draft.** Reviewer-portal field design is already partly built out as extensions to `wmkf_appreviewersuggestion` — see `lib/dataverse/schema/wave2-existing/wmkf_appreviewersuggestion-extensions.json`. That file already defines:

- External-token lifecycle: `wmkf_ExternalTokenHash`, `wmkf_ExternalTokenIssued`, `wmkf_ExternalTokenExpires`, `wmkf_ExternalTokenRevoked`
- Engagement timestamps: `wmkf_ProposalFirstAccessed`
- Review delivery: `wmkf_ReviewSharePointFolder`, `wmkf_ReviewUploadedByStaff`
- Review form responses: `wmkf_ReviewerAffiliation`, `wmkf_ReviewerImpact`, `wmkf_ReviewerRisk`, `wmkf_ReviewerOverallRating` (with sentinel `99 = unable to answer` on each picklist)

**Implications:**
- The "engagement predicate" for the cleanup cron must read from `wmkf_appreviewersuggestion` (token issuance, first-accessed, review uploaded), not just `wmkf_potentialreviewer`. Specifically: keep a `wmkf_potentialreviewer` slot if its linked suggestion has `wmkf_ExternalTokenIssued`, `wmkf_ProposalFirstAccessed`, or any review-form picklist populated.
- Match-on-discovery's "reviewer history" lookup walks `wmkf_appreviewersuggestion` rows linked through the slot's contact, not just `wmkf_potentialreviewer` rows. The richer suggestion fields (overall rating, response time derived from issued vs. first-accessed) are what surface in the history modal.
- **Net-new columns to add to extensions** (locked S136 2026-05-06):
  - `wmkf_DeclineReason` — multi-line text, optional. Captured at decline-time (magic-link landing page; or staff-entered if reviewer told us by email).
  - `wmkf_ResponseReceivedAt` — datetime, set when `wmkf_responsetype` flips from null to a value. Required for response-latency computation; without it the metric isn't derivable.
- **Derivable, no schema change**:
  - Late/on-time flag = `wmkf_reviewreceivedat` vs. cycle's `wmkf_reviewreturndeadline`.
  - Response latency hours = `wmkf_emailsentat` vs. `wmkf_ResponseReceivedAt`.

## New work in scope

### 1. `wmkf_appgrantcycle` entity

Net-new Dataverse table. Replaces Postgres `grant_cycles` (13 rows).

**Full field mapping** (every Postgres column accounted for):

| Postgres column | Dataverse column | Type | Notes |
|---|---|---|---|
| `id` (int PK) | `wmkf_appgrantcycleid` (GUID, native) | — | Postgres ID does not migrate — references rewrite to GUID. |
| `short_code` | `wmkf_shortcode` | Text (10) | **Alternate key.** Matches the cycle codes from `cycle-code.js` (J26, D23). Used in cross-table joins from `wmkf_appreviewersuggestion.wmkf_grantcyclecode` (text). |
| `name` | `wmkf_displayname` | Text (255) | Primary name attribute. e.g., `"June 2026 Board Meeting"`. |
| `program_name` | `wmkf_programname` | Text (100) | Friendly program label per cycle. |
| `summary_pages` | `wmkf_summarypages` | Text (50) | Per-cycle reviewer summary length config (e.g. `"2"`, `"1,2"`). |
| `review_deadline` | `wmkf_reviewdeadline` | Date | When reviewers must submit. (Postgres column is `review_deadline`, not `review_return_deadline` as the original spec assumed.) |
| `review_template_blob_url`, `review_template_filename` | `wmkf_reviewtemplateurl`, `wmkf_reviewtemplatefilename` | Text (500) | Vercel Blob URL + filename. |
| `additional_attachments` | `wmkf_additionalattachments` | Multi-line text | JSONB → JSON-as-text. **Validation**: `JSON.parse` round-trip on read; fail closed if invalid. |
| `custom_fields` | `wmkf_customfields` | Multi-line text | JSONB → JSON-as-text. Same validation. |
| `is_active` | `wmkf_isactive` | Yes/No | Drives the active-vs-archived distinction; **Postgres has no `is_archived` column**, the original Codex-flagged concern was unfounded. |
| `created_at`, `updated_at` | native `createdon`, `modifiedon` | DateTime | Built-in. |

**Derived (not in Postgres `grant_cycles`)** — populated from joins to `akoya_request`:

| Dataverse column | Source | Notes |
|---|---|---|
| `wmkf_meetingdate` | `akoya_request.wmkf_meetingdate` for the matching cycle | Denormalized for query speed; drift watched by reconciliation report. |
| `wmkf_fiscalyearcode` | `akoya_request.akoya_fiscalyear` for the matching cycle (e.g., `"June 2026"`) | Used for joins from `akoya_request`. |

**Counts (derived, not stored)**: `grant-cycles.js` today JOINs `proposal_searches` and `reviewer_suggestions` for per-cycle proposal/candidate counts. Equivalent in Dataverse: query `akoya_request` filtered by `akoya_fiscalyear = <code>` for proposal count; query `wmkf_appreviewersuggestion` filtered by `wmkf_grantcyclecode = <shortcode>` for candidate count. Wrap in a helper; expose as a single endpoint `/api/reviewer-finder/grant-cycles?withCounts=true`.

**Per-user current-cycle preference** (today held in `user_preferences`): unchanged — already in Dataverse via Wave 1's `wmkf_app_user_preference`. New code reads cycle GUID OR shortcode from prefs and resolves via alt-key.

Naming follows live convention `wmkf_app<name>` (no underscore — matches existing live entities, **not** the Wave 1 doc's proposed `wmkf_app_<name>`).

### 2. Match-on-discovery + history badges

The most visible payoff of the migration. Surfaces "have we worked with this person before" at the moment a PD is choosing candidates.

**Match-on-discovery** — runs in the discovery flow after contact enrichment, before ranking:

For each candidate with email or ORCID:
1. Lookup contact via `contact.emailaddress1` (exact, normalized) → `contact.wmkf_orcid` (exact). Skip name+affiliation fuzzy at discovery time; that's expensive and noisier.
2. If matched, attach `contactId` to the candidate record.

**History lookup** — for matched candidates, two queries:

- **Reviewer history**: `wmkf_potentialreviewer` rows where `wmkf_contact eq <id>` AND engagement predicate holds (any of `wmkf_emailsentat`, `wmkf_responsetype`, `wmkf_reviewreceivedat` populated). Returns: request number, meeting date (→ cycle code via `cycle-code.js`), response type, dates.
- **PI/co-PI history**: `akoya_request` rows where contact is `_wmkf_projectleader_value` OR any of `_wmkf_copi1_value..5`. Returns: request number, meeting date, decision/funding status.

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

Net-new junction table to support the PI/co-PI history badge. Replaces the 6-OR-clause query (`_wmkf_projectleader_value` + `_wmkf_copi1..5_value`) with a single `wmkf_contact eq <id>` filter. Locked S136 2026-05-06 — Connor's preference for junctions + cleaner long-term shape.

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
3. **Read-side fallback during pilot** — `/api/reviewer-finder/contact-history` reads the junction first; falls back to the 6-OR-clause query on `akoya_request` if the junction has no rows for that contact. Catches PA flow sync gaps. Removed post-pilot after one clean cycle.

**Open Connor questions** (nested under §6 below): is there an existing PA flow on `akoya_request` updates we can extend? Does his junction-table preference extend to us building one against vendor data?

### 6. Reviewer-portal field audit

Walk through what the reviewer portal will capture (response time, decline reason, late/on-time, quality rating, etc.) and confirm `wmkf_potentialreviewer` has columns for each. Add what's missing. Connor coordination on net-new columns.

## Reviewer suggestions backfill

The 337 Postgres `reviewer_suggestions` rows are not all replaceable by current Dataverse `wmkf_appreviewersuggestion` data — `save-candidates.js` only started writing Dataverse partway through cycle activity. So the Postgres rows fall into three groups; each needs a different action.

**Group A — already in Dataverse**: a Dataverse `wmkf_appreviewersuggestion` row exists for the same (proposal, reviewer-email) pair. **Action**: discard the Postgres row; verify Dataverse row's `wmkf_emailsentat`, `wmkf_responsetype`, summary blob URL, etc. are populated. If gaps, patch from Postgres.

**Group B — active cycle, only in Postgres**: J26 (or future) cycle, no Dataverse counterpart. **Action**: backfill into Dataverse via the suggestion adapter. Need to also ensure a `wmkf_potentialreviewer` slot + `wmkf_appresearcher` sidecar exists for the candidate (may need to create if save-candidates was never re-run).

**Group C — closed cycle, only in Postgres**: D25, J25, prior. **Action**: discard. The proposals are adjudicated; the candidate data has no forward use.

**Active vs. closed determination**: read the cycle code from `reviewer_suggestions.proposal_id` (forms like `J26-NN`, `D25-NN`) or from the joined `proposal_searches` if present. Closed = associated `akoya_request.wmkf_meetingdate` < today. Edge case: any J26 row is active (current cycle) regardless of meeting date.

**Backfill script** (`scripts/backfill-reviewer-suggestions-to-dataverse.js`) writes a parity report before acting:

```
   Group A (already in Dataverse, optional patch):  N rows
   Group B (active, needs backfill):                M rows
   Group C (closed, discard):                       K rows
   Anomalies (no proposal mapping, malformed):      X rows  ← STOP if X > 0
```

Run dry-first; require explicit `--commit` flag to write. Idempotent: re-running matches existing Dataverse rows by `(proposal_id, email)` and patches rather than duplicating.

**Per-user scoping change**: Postgres `reviewer_suggestions` filters by `user_profile_id` in places (e.g., `generate-emails.js:57` enforces "only your own saved candidates"). Dataverse `wmkf_appreviewersuggestion` is org-visible by default. **This is an intentional model change**: post-migration, all PDs see all suggestions; the "my candidates" filter becomes a UX convenience (filter on `_ownerid_value` or `_wmkf_programdirector_value` of the linked request), not a security boundary. Document explicitly so the cross-user-isolation tests can be updated rather than failing silently.

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
| `pages/api/reviewer-finder/generate-emails.js` | Reads `reviewer_suggestions`, writes `email_sent_at` | Read from `wmkf_appreviewersuggestion`; write `wmkf_emailsentat` on the slot. |
| `pages/api/reviewer-finder/extract-summary.js` | Writes `proposal_searches.summary_blob_url`, updates `reviewer_suggestions` | If `proposal_searches` is dead, just keep the suggestion update path on Dataverse. |
| `pages/api/reviewer-finder/grant-cycles.js` | Direct `sql\`\`` against `grant_cycles` (5+ sites) | Rewrite all sites against `wmkf_appgrantcycle` (alt-key by fiscal year). |
| `pages/api/reviewer-finder/my-proposals.js` | Mixed Postgres + Dataverse | Pick Dataverse; remove Postgres path. |

**New endpoints:**

- `pages/api/reviewer-finder/contact-history.js` — batched lookup. POST body: `{ contactIds: [...] }`. Returns: `{ <contactId>: { reviewerHistory: [...], piHistory: [...] } }`. Used by the picker UI to populate badges.

**Service-layer rewrites:**

- `lib/services/database-service.js` — researcher/publication/keyword paths gutted; suggestion paths point at `wmkf_appreviewersuggestion`.
- `lib/services/discovery-service.js` — `findResearcher` cache lookup replaced by match-on-discovery against `contact`.
- `lib/services/contact-enrichment-service.js` — no functional change; still does email/ORCID enrichment. Output now feeds match-on-discovery.
- `lib/services/deduplication-service.js` — reads candidates from Dataverse instead of Postgres; logic unchanged.
- New: `lib/services/contact-history-service.js` — encapsulates the match-on-discovery + history aggregation.

**No change:** `pubmed-service.js`, `arxiv-service.js`, `biorxiv-service.js`, `chemrxiv-service.js`, `orcid-service.js`, `serp-contact-service.js`, `claude-reviewer-service.js`. External-DB clients don't care where we persist.

## UI changes (`pages/reviewer-finder.js`)

31 fetch sites. HTTP contracts mostly unchanged so most call sites don't move. New work:

- **Candidate card** — render history badges. New props: `contactId`, `reviewerHistory`, `piHistory`. Bulk-fetch via `/api/reviewer-finder/contact-history` after discovery returns.
- **History modal component** — clickable badge → modal listing each event with request number link, cycle code, response type / decision, date. Color-code recency.
- **ID format sweep** — Postgres researcher IDs were `INTEGER`; Dataverse equivalents are GUIDs. Audit anywhere a researcher ID is used as a React key, compared with `===`, or coerced via `parseInt`.

## Dependency order

Hard constraints (each blocks the step after it):

1. **`researchers.js` rewrite-vs-retire decision.** Up front (W1, not W4). The decision drives whether `publications` and `researcher_keywords` reads need rewriting (rewrite path) or just removing (retire path). Retire is a UX decision, not just an API decision — needs Justin's call before any other endpoint work starts.
2. **`extract-summary.js` reckoning.** Up front (W1). The IDOR guard on `proposal_searches` is broken today (always fails because table is empty). Either retire the endpoint or rewrite the guard against Dataverse before any other work depends on it.
3. **Schema in sandbox.** Create `wmkf_appgrantcycle` with the full field mapping (above). Confirm `wmkf_appreviewersuggestion` extensions are deployed (already designed; check sandbox state). Identify any missing reviewer-portal fields.
4. **`grant-cycles.js` rewrite + `wmkf_appgrantcycle` migration.** Must complete **before email flows are migrated** — `generate-emails.js` reads cycle attachment settings (`grant-cycles.js:144`), so a flag flip on email without grant-cycle being Dataverse-resident would break.
5. **Reviewer-suggestions backfill.** Run dry, review parity report, then commit. Required before `generate-emails.js` and `my-proposals.js` flag flips.
6. **`my-proposals.js` lifecycle counts.** Currently labeled in code as "Postgres remains source of truth for lifecycle state until the wave-2 ledger backfill happens" (`pages/api/reviewer-finder/my-proposals.js:153`). Cannot flip until the suggestion backfill (step 5) is verified.
7. **`maintenance-service.js` blob orphan scanner.** Reads Postgres `proposal_searches`, `grant_cycles`, `reviewer_suggestions` to find live blob URLs (`lib/services/maintenance-service.js:84`). **Must rewrite to read Dataverse before cutover** — otherwise the next cron run after cutover will misclassify Dataverse-referenced blobs as orphaned and delete them.
8. **Cleanup cron (engaged predicate).** Build with backup-on-delete logic. Run dry-only for at least one full cycle before any real delete.
9. **Match-on-discovery + history endpoints + service.** Read-only; can ship anytime after step 3. Independent of cutover.
10. **History badges in UI.** Stacks on (9). Descope to post-pilot if W3–W4 compresses.
11. **Cutover.** Service layer flips per-table via `WAVE2_BACKEND_*` flags. Postgres marked read-only.
12. **Cleanup cron turns on for real.** Earliest 14 days post-cutover.
13. **Decommission.** Drop Postgres tables after 14+ days clean.

**Zero-downtime stance**: this migration is zero-downtime by design. Per-table `WAVE2_BACKEND_*` flags allow flip-back; Postgres tables stay readable until step 12. No maintenance window planned. If a step requires one, it's a sign the step should be split.

**In-flight SSE during flag flips**: `discover.js` and `generate-emails.js` stream via SSE for tens of seconds. A flag flip mid-stream could send a request through the new code path while later writes go through the old. Mitigation: each SSE handler reads the flag value **once at request start** and uses that for the full request lifetime. Document in service-layer doc; verify in code review of every flag-aware handler.

## Open questions for Connor

1. **Cleanup cron predicate** — see "Engaged predicate" section above. Slot- and suggestion-side signals listed; sign off the union or flag any we shouldn't include / should add?
2. **14-day grace period** — adequate for late-acceptance fallthrough? Longer? Shorter?
3. **`researchers.js` admin UI** — **resolved 2026-05-06**: retire. Database tab goes away. Replaced by "Add candidate by hand" feature (§4 above).
4. **Net-new reviewer-portal columns on `wmkf_appreviewersuggestion`** — **resolved 2026-05-06**: add `wmkf_DeclineReason` (multi-line text) + `wmkf_ResponseReceivedAt` (datetime). Late/on-time flag and response-latency hours derive at query time.
5. **Contact form "Reviewer history" view** — **resolved 2026-05-06**: separate ask of Connor (not bundled with pilot's account-form work; pilot doesn't touch the contact form). Justin opted in rather than deferring post-pilot.
6. **PI/co-PI junction (`wmkf_apprequestperson`)** — **resolved 2026-05-06**: junction approach locked (cleaner long-term + Connor's preference for junctions). Two implementation questions remain open for Connor:
   - **Existing PA flow extension?** Is there a current PA flow on `akoya_request` create/update we can hook into for keeping the junction in sync, or is this net-new automation?
   - **Junction against vendor data?** Does Connor's junction-table preference extend to us building one indexed against existing `akoya_request` person fields, or only to net-new app tables?
7. **`is_archived` on `grant_cycles`** — **resolved 2026-05-06**: column does not exist in Postgres; spec corrected (`is_active` handles active/archive distinction). Original Codex concern was a false alarm.

## Rollback strategy

Per step, mostly reversible until cutover:

1. Schema creation: delete table from solution; no prod impact.
2. Match-on-discovery + history: read-only; turn off via feature flag (`REVIEWER_FINDER_HISTORY_BADGES=false`) — no data implications.
3. Cleanup cron: dry-run mode logs what it would delete without acting. Run dry-run for one full cycle before turning on for real. Once acting, pre-delete export to blob with 30-day retention provides manual restore path.
4. Endpoint rewrites: behind a `WAVE2_BACKEND_*` env flag pattern (modeled on Wave 1). Per-table flip; rollback = flip back to Postgres.
5. Cutover: Postgres tables set read-only but not dropped. If cutover regresses, re-enable Postgres path, investigate.
6. Decommission: only after 14 days clean. Final blob backup.

### Rollback triggers (when to flip back)

Each flag flip publishes a watch dashboard. Auto-rollback is not built; **manual rollback within 15 minutes** if any of these breach:

| Signal | Threshold | Action |
|---|---|---|
| Dataverse write failure rate (5-min window) | > 2% of attempts | Flip flag back to Postgres for that table; investigate. |
| Dataverse query P95 latency (5-min window) | > 3× pre-cutover baseline | Same. |
| Email-generation failure rate | > 5% per hour OR any "no candidates found for known PD" 0-row response | Same. Email is high-stakes; staff notice immediately. |
| Suggestion-count drift (Postgres vs. Dataverse) | > 5 rows for an active cycle | Pause the relevant flag; reconcile before continuing. |
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

## Revised pilot timing

Today: 2026-05-06. Pilot: mid-June 2026 (~6 weeks). Updated to address Codex feedback on sequencing realism:

| Week | Target | Critical-path notes |
|---|---|---|
| W1 (now → 2026-05-13) | **Decisions, not code.** `researchers.js` rewrite-vs-retire decision (Justin). `extract-summary.js` retire-or-rewrite decision. Connor sign-off on cleanup-cron predicate, 14-day grace, contact form view, missing reviewer-portal field set. Sandbox `wmkf_appgrantcycle` schema deployed; field mapping verified. Reconciliation script (`scripts/reconcile-reviewer-migration.js`) skeleton. | Schema before code. |
| W2 (2026-05-13 → 2026-05-20) | `grant-cycles.js` rewrite + `wmkf_appgrantcycle` migration (cycle data first — emails depend on it). Reviewer-suggestions backfill script written + dry-run. Cleanup cron written, dry-run only. `maintenance-service.js` blob scanner rewrite. | Cycle migration unblocks email migration. |
| W3 (2026-05-20 → 2026-05-27) | Reviewer-suggestions backfill committed + parity report clean. Endpoint rewrites: `generate-emails.js`, `my-proposals.js`, `extract-summary.js` (or its retirement). Match-on-discovery service + `/api/reviewer-finder/contact-history` endpoint. | Suggestion backfill is the gating step. |
| W4 (2026-05-27 → 2026-06-03) | `discover.js` rewrite. `researchers.js` rewrite OR retirement. History badges in UI (descopable if W3 slipped). Cross-user-isolation test rewrite. Production-rehearsal dry-run with the reconciliation script. | History badges are slip-eligible. |
| W5 (2026-06-03 → 2026-06-10) | Production cutover (per-table, watching dashboards). Postgres marked read-only. Pilot launch readiness review. | Watch dashboards live before flag flips. |
| W6 (2026-06-10 → 2026-06-17) | Pilot launch (mid-June Phase II Research). Cleanup cron stays in dry-run. | Cron real-mode flip is post-pilot. |

**Slip budget**:
- History badges + match-on-discovery (W3–W4): pure additive UX. Slip to post-pilot if needed.
- Cleanup cron real-mode: post-pilot regardless. Built but dry-run only through cutover.
- `researchers.js` full rewrite: only fits if it gets the W1 decision early. Realistically expect **retire**, not rewrite, given pilot time pressure. Justin to confirm in W1.

**What's NOT in the slip budget** (these gate cutover, no descope):
- Suggestion backfill + parity report
- `wmkf_appgrantcycle` migration
- `maintenance-service.js` blob-scanner rewrite
- Per-user scoping documentation + test rewrite
- Email-generation smoke + lifecycle-count parity

## Related

- `docs/POSTGRES_TO_DATAVERSE_MIGRATION.md` — Wave 1 (shipped) + the original Wave 2 spec this doc supersedes
- `docs/INTAKE_PORTAL_DESIGN.md` — pilot design; the workstream this gates
- `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md` — pilot Dataverse schema audit (sibling)
- `docs/CONNOR_INTAKE_PORTAL_SYNC.md` — 2026-05-06 walkthrough
- `docs/EXTERNAL_REVIEWER_INTAKE_PLAN.md` — reviewer portal field shape
- `lib/dataverse/adapters/{contact, potential-reviewer, researcher, reviewer-suggestion}.js` — live adapter code
- `lib/utils/cycle-code.js` — `meetingDateToCycleCode(d)` for badge rendering
- `scripts/probe-rr-program-tagging.js` — confirms `akoya_program=RR` is unused, no existing convention to follow
- `scripts/db-row-counts.js` — current Postgres row counts
- `.claude-memory/project_reviewer_postgres_to_dataverse_migration.md` — strategic context
