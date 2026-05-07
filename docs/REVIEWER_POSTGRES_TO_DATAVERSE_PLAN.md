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
| `publications` | 0 | **Retire.** Empty + dead writer (`DatabaseService.addPublication` has no callers). |
| `proposal_searches` | 0 | **Retire (verify).** Likely same story; confirm no live writer. |
| `researchers` | 331 | **Drain.** Don't migrate. Cycle close empties via cleanup cron. |
| `researcher_keywords` | 1,028 | **Drain.** Coverage moves to `wmkf_appresearcher.wmkf_keywords` for new rows. |
| `reviewer_suggestions` | 337 | **Audit.** Active-cycle rows: migrate. Closed-cycle: discard. |
| `grant_cycles` | 13 | **Migrate** to net-new `wmkf_appgrantcycle`, alt-keyed to `akoya_request.akoya_fiscalyear`. |

Total live data is ~1,700 rows. The "migration" is mostly **letting Postgres data drain** as J26 closes, plus rewriting the few endpoints that still talk to Postgres.

## Locked decisions

### Data model: 1:1 stays

`wmkf_appresearcher` remains 1:1 with `wmkf_potentialreviewer`. Researchers are transient cycle scratch; permanent reviewer identity lives in `contact`. No researcher pool table.

Rationale: Reviewer Finder surfaces ~25 candidates per proposal. Selected reviewers promote to `contact` (permanent record). Unselected candidates have no value post-adjudication. Historical lookups about "have we worked with this person before" go through `contact` and the surviving `wmkf_potentialreviewer` rows linked to it.

### Cleanup cron

Cron runs weekly; only acts twice a year in practice (after June and December meeting dates).

**Logic:**

```
For each akoya_request where wmkf_meetingdate < (today - 30 days):
  For each wmkf_potentialreviewer row linked to that request:
    If the slot is "engaged" (defined below): keep
    Otherwise: delete (cascade-drops the 1:1 wmkf_appresearcher sidecar)
```

**"Engaged" predicate** — keep any slot where ANY of these are populated:
- `wmkf_contact` (contact promotion happened)
- `wmkf_emailsentat` (we sent them anything)
- `wmkf_responsetype` (they responded)
- A linked `wmkf_appreviewersuggestion` row with `wmkf_selected = true`

The 30-day grace lets staff dip back into the unselected pool if late acceptances fall through. Reading `wmkf_meetingdate` at cron time handles board-moves-the-meeting cases automatically.

### Engaged slots = de facto reviewer-history child entity

We don't need a new role-tracking entity. The set of `wmkf_potentialreviewer` rows that survive cleanup IS the per-contact reviewer history. Each row already carries timestamps, request linkage, and outcome. The cleanup cron is what turns the table from "current cycle scratch" into "permanent history of engaged reviewers."

This means the contact's history surface is just `wmkf_potentialreviewer` filtered by `wmkf_contact eq <id>`. No new entity to build, just a filter and a UI.

### Reviewer-portal data lives on `wmkf_potentialreviewer`

When the reviewer portal captures response-time, decline reason, review quality, late/on-time flag, etc., those fields land on the `wmkf_potentialreviewer` row. **Field audit needed** before pilot — what's there today vs. what the portal will produce. Connor coordination, since some of these may be net-new columns on his entity.

## New work in scope

### 1. `wmkf_appgrantcycle` entity

Net-new Dataverse table. Replaces Postgres `grant_cycles` (13 rows).

| Column | Type | Notes |
|---|---|---|
| `wmkf_fiscalyearcode` | Text (50) | **Alternate key.** Matches `akoya_request.akoya_fiscalyear` ("June 2026"). |
| `wmkf_meetingdate` | Date | Denormalized; truth lives on `akoya_request.wmkf_meetingdate`. |
| `wmkf_displayname` | Text (255) | Primary name attribute. |
| `wmkf_summarypages` | Text (50) | Per-cycle reviewer summary length config. |
| `wmkf_reviewreturndeadline` | Date | When reviewers must submit. |
| `wmkf_reviewtemplateurl`, `wmkf_reviewtemplatefilename` | Text | Vercel Blob URL + filename. |
| `wmkf_additionalattachments` | Multi-line text | JSON-as-text. |
| `wmkf_isactive` | Yes/No | |

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

### 3. Contact form view (Connor coordination)

A "Reviewer history" section on the contact form that lists the surviving `wmkf_potentialreviewer` rows. Same data as the popup in §2, viewed from the contact side rather than the candidate side. Connor is touching the contact form for pilot anyway — bundle into that conversation.

Optionally: derived summary fields on contact, recomputed on a cron — `wmkf_lastreviewedcycle`, `wmkf_avgresponsetimehours`, `wmkf_declinecount`. Nice-to-haves; not blocking.

### 4. Reviewer-portal field audit

Walk through what the reviewer portal will capture (response time, decline reason, late/on-time, quality rating, etc.) and confirm `wmkf_potentialreviewer` has columns for each. Add what's missing. Connor coordination on net-new columns.

## Endpoint rewrite scope

| Endpoint | Today | Migration work |
|---|---|---|
| `pages/api/reviewer-finder/discover.js` | Cache lookup via `DatabaseService.findResearcher` (Postgres `researchers`) | Replace cache lookup with match-on-discovery against `contact`. Drop Postgres dependency. |
| `pages/api/reviewer-finder/researchers.js` | Admin pool CRUD over `researchers` / `researcher_keywords` / `publications` | **Largest single rewrite.** Either: (a) rewrite against `wmkf_appresearcher` + `contact`-filtered "past reviewers" view, or (b) retire entirely if the admin UI loses meaning under transient-scratch model. Decide before pilot. |
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

1. **Schema in sandbox.** Create `wmkf_appgrantcycle`. Audit + extend `wmkf_potentialreviewer` for any reviewer-portal columns missing.
2. **Cleanup cron** (operational pre-req for the 1:1 model long-term, but doesn't block migration). Build now to inform the engaged-predicate definition; turn on after first migration validation.
3. **Match-on-discovery + history endpoints + service.** Read-only against existing Dataverse data; no Postgres dependency. Can ship in isolation.
4. **History badges in UI.** Stacks on top of (3).
5. **Endpoint rewrites for the Postgres-only ones.** `discover.js`, `generate-emails.js`, `extract-summary.js`, `grant-cycles.js`, `my-proposals.js`. Each independently.
6. **`researchers.js` admin UI** — biggest single piece; decide rewrite vs. retire before starting.
7. **Cutover** — service layer reads/writes Dataverse only; Postgres tables marked read-only.
8. **Cleanup cron flips on.** Drains the 331 researcher rows + 1,028 keywords + 337 suggestions for closed cycles.
9. **Decommission.** Drop Postgres tables after 14 days of clean operation.

## Pilot timing

Today: 2026-05-06. Pilot: mid-June 2026.

| Week | Target |
|---|---|
| W1 (now → 2026-05-13) | Connor sign-off on cleanup-cron predicate + reviewer-portal field audit + history-feature scope. Sandbox schema for `wmkf_appgrantcycle` + new fields on `wmkf_potentialreviewer`. |
| W2 (2026-05-13 → 2026-05-20) | Match-on-discovery service + `/api/reviewer-finder/contact-history` endpoint. Cleanup cron written + tested in sandbox. |
| W3 (2026-05-20 → 2026-05-27) | History badges + modals in UI. Endpoint rewrites: `grant-cycles`, `my-proposals`, `extract-summary`, `generate-emails`. |
| W4 (2026-05-27 → 2026-06-03) | `discover.js` rewrite (largest non-admin piece). `researchers.js` decision (rewrite vs. retire); execute. |
| W5 (2026-06-03 → 2026-06-10) | Production cutover. Cleanup cron turns on with safety check (dry-run mode first). Pilot launch readiness review. |
| W6 (2026-06-10 → 2026-06-17) | Pilot launch. Reviewer Finder running on Dataverse against pilot proposals with full history badges. |

**Slip budget:** the history feature (W2–W3) can be shipped after pilot if needed; it's additive, not blocking. The endpoint rewrites (W3–W4) are the real critical path. The `researchers.js` decision is the biggest unknown — if we choose "retire," W4 compresses significantly.

## Open questions for Connor

1. **Cleanup cron predicate** — is "any of `wmkf_contact`, `wmkf_emailsentat`, `wmkf_responsetype`, or selected suggestion" the right "engaged" definition? Anything we'd want to keep that's outside that set?
2. **30-day grace period** — adequate for late-acceptance fallthrough? Longer? Shorter?
3. **`researchers.js` admin UI** — keep (rewrite against Dataverse + contact-filtered past-reviewers view) or retire (does anyone use it post-cutover)?
4. **Reviewer-portal field set on `wmkf_potentialreviewer`** — what's planned for capture (response time, decline reason, quality, late flag)? Audit needed.
5. **Contact form "Reviewer history" view** — Connor is touching the contact form for pilot anyway; bundle this in?
6. **Co-PI lookup performance** — querying `_wmkf_copi1_value..5` is 5 OR clauses. Acceptable, or worth a different shape (e.g., M:N junction)? Probably fine at WMKF scale, just call it out.

## Rollback strategy

Per step, mostly reversible until cutover:

1. Schema creation: delete table from solution; no prod impact.
2. Match-on-discovery + history: read-only; turn off via feature flag (`REVIEWER_FINDER_HISTORY_BADGES=false`) — no data implications.
3. Cleanup cron: dry-run mode logs what it would delete without acting. Run dry-run for one full cycle before turning on for real.
4. Endpoint rewrites: behind a `WAVE2_BACKEND_*` env flag pattern (modeled on Wave 1). Per-table flip; rollback = flip back to Postgres.
5. Cutover: Postgres tables set read-only but not dropped. If cutover regresses, re-enable Postgres path, investigate.
6. Decommission: only after 14 days clean. Final blob backup.

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
