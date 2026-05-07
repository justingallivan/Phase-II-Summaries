---
name: Reviewer Postgres → Dataverse migration plan locked (S136)
description: Migration scope, model decisions, and feature scope locked 2026-05-06. Most "migration" is drain, not move. Match-on-discovery + history badges are first-class scope.
type: project
originSessionId: 064dffdf-ba31-44c3-81f2-73bf4d3b908f
---
**Status as of 2026-05-06 (S136)**: Plan rewritten against ground truth. Authoritative doc: `docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md`. Pilot deadline mid-June 2026 stands.

## Ground truth (what's already done)

Significant migration was already shipped before S136. Live in Dataverse:
- `wmkf_potentialreviewer` (per-proposal slot)
- `wmkf_appresearcher` (1:1 sidecar with the slot)
- `wmkf_appreviewersuggestion`
- Adapters in `lib/dataverse/adapters/`
- Endpoints fully migrated: `save-candidates`, `my-candidates`, `load-proposal`, all of Review Manager

## Locked decisions (don't re-litigate)

1. **1:1 model is correct, not a compromise.** Researchers are cycle-bounded transient candidate scratch (~25/proposal). Permanent reviewer identity lives in `contact` via promotion. No researcher pool table — Wave 1 doc's pool design is superseded.
2. **No new role-tracking child entity.** Engaged `wmkf_potentialreviewer` rows ARE the per-contact reviewer history. The cleanup cron is what turns the table from "scratch" into "history."
3. **Cleanup cron** runs weekly; only acts twice a year. Drops slots where `wmkf_meetingdate < today - 30 days` AND none of (`wmkf_contact`, `wmkf_emailsentat`, `wmkf_responsetype`, selected suggestion) populated. Cascade-drops 1:1 sidecar.
4. **Postgres tables drain, mostly don't migrate.** Real numbers (verified 2026-05-06 via `scripts/db-row-counts.js`): publications=0 (dead writer), proposal_searches=0, researchers=331, researcher_keywords=1028, reviewer_suggestions=337, grant_cycles=13. All <12 months old. Only `grant_cycles` migrates (→ new `wmkf_appgrantcycle`); rest drain via cleanup cron + cycle close.
5. **Naming follows live convention** `wmkf_app<name>` (no underscore), NOT the Wave 1 doc's proposed `wmkf_app_<name>`.

## First-class new scope: match-on-discovery + history badges

The visible payoff of finishing the migration. Not optional UX polish — it's the user-facing reason to do this.

- **Match-on-discovery** (not just match-on-promote): during Reviewer Finder discovery, after enrichment, look up each candidate against `contact.emailaddress1` then `contact.wmkf_orcid`. Skip name+affiliation fuzzy at discovery time.
- **History lookup** for matched candidates: reviewer history (`wmkf_potentialreviewer` filtered by `wmkf_contact eq <id>` AND engagement) + PI/co-PI history (`akoya_request._wmkf_projectleader_value` OR `_wmkf_copi1_value..5`).
- **Badges on each candidate card**: 🔁 reviewed (recency-colored), 🚫 declined (separate signal), 💰 funded PI. Click → modal with full history.
- **Batched lookup**: new endpoint `/api/reviewer-finder/contact-history` POST `{ contactIds }`. 25 candidates × 2 queries = use `$batch` or pre-fetch via `in (...)`.
- Justin's framing (S136): *"We don't want to wear out our welcome."* PD sees recency at a glance, decides whether to invite.

## Codex stress-test addressed (S136 evening)

Codex review found three top concerns + many smaller gaps. Plan rewritten end-to-end:
- Reviewer-suggestions backfill: three-group classification (Group A already-in-DV / Group B active-Postgres-only / Group C closed-discard); parity report; idempotent UPSERT; `--commit` gated.
- Grant-cycle field mapping: full Postgres-to-Dataverse mapping (probed live schema 2026-05-06; corrected `meeting_date`/`fiscal_year` not in Postgres, `is_archived` doesn't exist, `review_deadline` not `review_return_deadline`).
- Schema ownership corrected: reviewer-portal data is on `wmkf_appreviewersuggestion` per `wmkf_appreviewersuggestion-extensions.json`, NOT `wmkf_potentialreviewer`. Plan and engaged-predicate updated.
- Other gaps closed: SSE in-flight handling, rollback triggers (quantitative thresholds), maintenance-service blob-scanner cutover dependency, picklist value mapping, per-user scoping intentional model change documented, cross-user-isolation test rewrite plan.

## Open Connor questions resolved S136 (locked)

| Q | Resolution |
|---|---|
| Cleanup cron predicate | Locked as-is (8 signals across slot + suggestion: contact, emailsentat, responsetype, selected, ExternalTokenIssued, ProposalFirstAccessed, ReviewSharePointFolder, any review-form picklist) |
| Grace period | **14 days** (matches Wave 1 stability-clock pattern) |
| `researchers.js` | **Retire**. Database tab loses meaning under 1:1 model. Replaced by net-new "Add candidate by hand" feature in My Candidates tab |
| New suggestion fields | Add `wmkf_DeclineReason` (text) + `wmkf_ResponseReceivedAt` (datetime). Late/on-time + response-latency derive |
| Contact form "Reviewer history" view | **Add to pilot** (separate Connor ask; pilot's account-form work doesn't touch contact form) |
| PI/co-PI lookup | **`wmkf_apprequestperson` junction** (PI \| copi roles). One-time backfill ~3K rows; PA flow for ongoing sync; OR-clause fallback during pilot |
| `is_archived` on grant_cycles | Doesn't exist in Postgres (probed live); spec corrected |

## Two narrow questions left for Connor (Justin asking 2026-05-07)

Both nested under junction implementation:
1. Existing PA flow on `akoya_request` create/update we can extend, or net-new?
2. Junction-table preference — extends to indexes against vendor data, or only net-new app tables?

## Out-of-scope but flagged

- UI cleanup pass on Reviewer Finder + Review Manager (stale `.eml` references, etc.) — its own session, not migration scope.

## RR program code (probed S136)

`akoya_program = "Research Reviewer"`, `wmkf_code = "RR"`, GUID `7e744a42-37eb-f011-8543-6045bd02b4cc`. **Exists but unused.** No contact has it (no `_akoya_program_value` field on contact at all). Zero requests use it. No N:N table. **No existing convention to follow** for tagging contacts as reviewers — engagement-history approach is the answer, not a flag.

## How to apply

- Treat the Wave 1 doc's "Wave 2 — preview spec" as historical. Live model differs structurally (1:1 vs. pool) and naming-wise (no underscore). Read `docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md` instead.
- When working on Reviewer Finder code: confirm live state matches what the plan doc says. If something on the Postgres-only list got migrated independently, update both this memory and the plan.
- Don't propose adding a `wmkf_iscontactreviewer` boolean or similar denormalized role flag. Decision is engaged-slot-history; flags lose data the history preserves.
- Don't propose dropping Postgres reviewer tables outside the cleanup-cron path. The drain is intentional and gated on cycle close + 14-day clean window.
