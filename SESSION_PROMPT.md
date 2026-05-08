# Session 141 Prompt: Resume S140 carryover (doc triage / migration sweep) on a green-gate base

## Heads up — read before doing anything

S140 was meant to be Codex review of the S139 build set. It became, instead, a small accountability moment plus rubric repair. Two things happened:

1. **The Codex review found three real bugs** (all Dataverse pagination completeness — same family). Fixed in `aa9bd09`.
2. **The Atlas gate had been red on `main` since S139** because S139 deployed a junction entity (`wmkf_apprequestperson`) without an Atlas page. I noticed during S140 and originally classified it as a side-note. Justin called this out as a rubric violation — exactly the failure mode the remediation plan exists to prevent. Fixed in `33902a5`, which also codified a hard rule and patched the /start skill so future sessions can't repeat it.

The mechanical takeaway lives in CLAUDE.md "Ground-truth requirement" and `feedback_red_gates_are_p0.md`. Read those before any data-layer work.

## Session 140 summary

### What was completed

1. **Codex review of S139 commits** (commit `aa9bd09`)
   - Independent review via codex-rescue agent on the 5 build commits (`2eda700`, `c8cbfe1`, `8b9b287`, `b536121`, `b23586c`).
   - Three findings, all "wrote pagination for the small case":
     - **High** — `pages/api/reviewer-finder/contact-history.js`: source queries used `queryRecords` `top:100`, silently truncating high-volume PIs/co-PIs. Switched to `queryAllRecords` (5000-cap, paginated) with cap-hit warning.
     - **Medium** — same file: request-metadata fetch did one "remaining" pass — only worked because sources were pre-capped. Replaced with deterministic 50-id chunked OR-filter and unresolved-id sweep with warning.
     - **Medium** — `scripts/backfill-request-person-junction.js`: existing-row prefetch used `queryAllRecords` (5000 cap). Backfill itself created 5,561 rows, so reruns aborted at the cap-guard. Switched to raw `@odata.nextLink` pagination, mirroring the Step 2 pattern already in the same file.
   - Schema deploys (`c8cbfe1`, `b536121`) and echo-parity harness (`2eda700`) came back clean.

2. **Atlas gap close + rubric reinforcement** (commit `33902a5`)
   - **Atlas page for `wmkf_apprequestperson`** (`docs/atlas/dataverse-wmkf-apprequestperson.md`): documents the 5,561-row junction, UNION-read strategy, PascalCase `@odata.bind` requirement, `queryAllRecords` 5000-cap gotcha, and Connor PA dual-write pending.
   - **`dataverse-akoya-request.md` updated** for S139 reality: 6 workflow-chaining `wmkf_ai_*` fields enumerated, Field Set B status flipped from "on hold" to "DEPLOYED" with all 22 field shapes summarized, junction-relationship section added.
   - **`APPLICATION_STATE_ATLAS.md` index** updated: replaced "Planned ... not yet deployed" line with deployed-status link, added junction row to the reviewer-finder Dataverse table.
   - **Hard rule in `CLAUDE.md`** under "Ground-truth requirement": red `npm run check:*` gate on `main` blocks all data-layer commits until green. "Pre-existing" / "out of scope" / "not my regression" explicitly disallowed as reasons to proceed.
   - **`/start` skill patched** (`~/.claude/skills/start/skill.md`): Step 2 runs `check:atlas` / `:atlas:self-test` / `:api-routes` before context loading; red gates get reported first in the summary as P0 blockers.
   - **Feedback memory** added: `feedback_red_gates_are_p0.md`, indexed in `MEMORY.md`.

### Commits

- `aa9bd09` — Address Codex review of S139 build set: Dataverse pagination completeness
- `33902a5` — Close Atlas gap from S139 + codify red-gate-is-P0 rule

### Memory updates

- New: `feedback_red_gates_are_p0.md` — "red `check:*` gate on main is a rubric violation right now; fix before any data-layer commits, regardless of who broke it"
- `MEMORY.md` index updated with the new entry under Operational

## Production state

- All three CI gates green: 28 Postgres tables, 25 Dataverse entities, 77 API routes covered.
- Wave 2 build set (S139) remains live and unchanged in semantics — only the pagination edges were patched.
- No production writes happened this session.
- Wave 1 stability clock: still ticking until 2026-05-17.

## Where to pick up — Session 141

The S140 prompt's three candidate threads are all still on the table — none of them were touched this session because the rubric-repair path took priority.

### A. **Doc-triage cleanup** (still the primary candidate)

S138 ran Step 1+2+3 of doc-triage (categorization + 36-doc archive). The remaining steps:

- **Bucket A refresh** (3 docs): `AUTHENTICATION_SETUP.md` (101d, dual-provider Entra External shipped since), `CREDENTIALS_RUNBOOK.md` (76d), `API_ROUTE_SECURITY_MATRIX.md` (endpoint-persistence annotation per Atlas v1 known-gaps).
- **"Other" archive batch** (6 candidates): `DYNAMICS_AI_FIELDS_SPEC_v2.md`, `DYNAMICS_AI_FIELDS_SPEC_cn-notes.md`, `DYNAMICS_EXPLORER_DOCUMENT_LISTING_PLAN.md`, `CRM_EMAIL_SEND_PLAN.md`, `ENTRA_ID_INTEGRATION_SUMMARY.md`, `SHAREPOINT_DOCUMENT_ACCESS.md` (verify-then-archive).
- **Bucket B "flagged for refresh"**: `STRATEGY.md` (59d), `GRANT_CYCLE_LIFECYCLE.md` (31d), `REVIEWER_LIFECYCLE_PROPOSAL.md` (43d, Phase A shipped since), `STAGED_REVIEW_PIPELINE.md` + `STAGED_PIPELINE_IMPLEMENTATION_PLAN.md` (39d), `DYNAMICS_SCHEMA_ANNOTATION.md`.
- **Bucket D guides refresh**: 6 per-app guides, last touched 81d. Spot-check vs current app behavior.
- **Promote `check-doc-currency.js` to CI** — extend the `check:atlas:self-test` pattern to bind drift probes into the CI gate.

### B. **REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md status sweep**

The plan has a lot of "W2 owner: Justin" rows that are now done (Wave 2 build set landed S139). Worth sweeping to mark completion and identify what's actually next on the critical path. Cycle gating: aligned with Connor cadence, so don't strand it ahead of the next sync.

### C. **Externally gated** (don't pursue without signal)

- **Wave 1 retirement** — earliest 2026-05-17.
- **Connor's PA-side `ExecutePrompt` build** — when it lands, run the parity oracle from both sides and verify byte-identical `wmkf_ai_rawoutput`. The Vercel side is ready (`scripts/test-echo-parity.js`).
- **Connor's `akoya_request` create/update PA flows** — when they ship, the contact-history endpoint's per-row `sources` array stops showing single-source `[junction]` for newly-PI-touched data.

## Key files added/modified

| File | Status | Purpose |
|---|---|---|
| `pages/api/reviewer-finder/contact-history.js` | EDITED | Switched both source queries to `queryAllRecords`; chunked metadata fetch (50 ids/batch) with unresolved sweep |
| `scripts/backfill-request-person-junction.js` | EDITED | Replaced 5K-capped prefetch with raw `@odata.nextLink` pagination |
| `docs/atlas/dataverse-wmkf-apprequestperson.md` | NEW | Atlas page for the S139 junction (5,561 rows) |
| `docs/atlas/dataverse-akoya-request.md` | EDITED | Field Set B deployed status; 6 workflow-chaining fields; junction relationship |
| `docs/APPLICATION_STATE_ATLAS.md` | EDITED | Junction added to Reviewer-finder Dataverse table; "Planned" line replaced |
| `CLAUDE.md` | EDITED | "Red gates are P0 blockers, not side-notes" rule under Ground-truth requirement |
| `~/.claude/skills/start/skill.md` | EDITED | New Step 2 runs `check:*` gates before context loading; red-gate-first reporting |
| `.claude-memory/feedback_red_gates_are_p0.md` | NEW | Lesson-from-failure feedback memory |
| `.claude-memory/MEMORY.md` | EDITED | Indexed new feedback memory under Operational |

## Testing

```bash
# All three should be green at session start (and stay that way)
npm run check:atlas
npm run check:atlas:self-test
npm run check:api-routes

# Pagination fixes — no automated test, but the smoke handles the happy path
# (requires npm run dev or fixed ESM-import resolution; pre-existing limitation)
node scripts/smoke-contact-history.js --contactId <guid>

# Backfill rerun is now safe above the 5K threshold
node scripts/backfill-request-person-junction.js --dry-run
```

## How to know Session 141 went well

- The /start skill ran the gates and they were green (rubric stayed enforced).
- Whatever thread got picked up landed deliberately (doc-triage cleanup OR plan sweep), with commits + an updated SESSION_PROMPT for S142.
- No new entity / table / endpoint shipped without an Atlas update in the same commit.
