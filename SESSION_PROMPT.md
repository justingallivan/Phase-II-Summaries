# Session 150 Prompt: Item 6 test results → schema-slice build, plus carryovers

## Heads up

Session 149 was a long live-meeting day with two distinct Connor syncs:

- **Morning sync** ran the 2026-05-14 schema review — 7 of 8 items closed under a "human-legibility over normalization purity" principle that emerged mid-meeting. Item 6 (drain-vs-PA write conflict on aggregate fields) deferred to a separate decision.
- **Afternoon sync** worked Item 6 to a locked path (A+B hybrid) and produced a maker-portal test runbook Connor takes back to prove the mechanics.

The most important deltas to be aware of:
- **Item 6's pre-deploy preconditions are not yet cleared.** Schema slice 0 is blocked on Connor's maker-portal test results + the rule-exception edit to `INTAKE_PORTAL_DESIGN.md`. Do not write JSON specs or apply schema until those land.
- **Five Wave 2 / Item 5 schema-fact corrections went live during the meeting** via `EntityDefinitions` probe. The agenda-doc's proposed-new fields collapsed: 3 of 4 already exist on `akoya_request` (`wmkf_numberofyearsoffunding`, `akoya_request` Money field, `akoya_expenses`). Only `wmkf_totalothersources` is net-new.
- **Codex caught a recurring failure mode of mine** — making confident platform-behavior claims (Dataverse rollup latency, PA filter capability, plug-in cost) from training-data memory rather than verifying against Microsoft Learn. Memory rule saved: `feedback_verify_external_platform_claims`. Use-case-specific verification, not feature-existence verification.

## Session 149 summary

### Morning — 2026-05-14 schema review w/ Connor

Eight items walked through; outcomes:

| # | Topic | Outcome |
|---|---|---|
| 1 | Cost-share entity | **Unified into `wmkf_proposalbudgetline.wmkf_category` enum** (no new entity). 3 new values: `WaivedIndirect`, `WaivedTuition`, `OtherCostShare`. Accepted forever-filter cost. |
| 2 | Budget line extra fields | Add 3 fields: `wmkf_rolecode`, `wmkf_headcount`, `wmkf_effortpct`. |
| 3 | Roster entity | **Extend existing `wmkf_apprequestperson`** (5,561-row junction). Add 3 nullable fields. Expand `wmkf_role` enum from 2 → 5 values (PI / Co-PI / Senior Personnel / Key Personnel / Other). |
| 4 | Re-application history | Add `wmkf_priordecisionstatus` to `wmkf_portal_membership`. |
| 5 | Aggregate fields | **Live-probe found 3 of 4 already exist.** Reuse `wmkf_numberofyearsoffunding`, `akoya_request`, `akoya_expenses`. Add only `wmkf_totalothersources`. |
| 6 | Cache-drift protection | **Deferred** — in-meeting PA-flow-on-child-writes plan flagged by Codex as violating `INTAKE_PORTAL_DESIGN.md` § "Power Automate boundary." See afternoon sync. |
| 7 | Reviewer packet rendering | No `wmkf_category` enum expansion. Single packet PA renders rows via `wmkf_description` + `wmkf_rolecode`. |
| 8 | Naming | Moot — Items 1+3 collapsed both new-entity-naming questions. |

Code patches downstream of decisions:
- `pages/api/reviewer-finder/contact-history.js` — PI/Co-PI source filter so expanded role enum doesn't pollute reviewer history.
- `pages/api/grant-reporting/lookup-grant.js` — removed `akoya_request` fallback for award amount (drain will now write that field with applicant ask).
- `scripts/acceptance-w4.js` — same role filter + zero-row hit-rate gate.
- `scripts/inspect-request-copis.js` — comment documenting expanded enum.
- `shared/forms/phase-ii-research-2026-06/map-to-dynamics.js` — resolved entity-choice TODOs for budget + roster.

Doc normalization (BUDGET_FORM_SPEC v3 + agenda outcome banner + new SCHEMA_CHANGES 2026-05-14 entry + Atlas amendments + INTAKE_PORTAL_DESIGN open-work refresh).

### Afternoon — Item 6 sync w/ Connor

Two questions answered:
- **Q1:** "Does anything in AkoyaGO today write to `akoya_request` (Money field) or `akoya_expenses`?" → **"GoApply updates write to these fields."** Option C (rollup fields) is dead.
- **Q2:** "Are you OK with an explicit narrow exception to the 'they never write the same field' rule?" → **"Yes, with the narrow exception language."**

Active path locked: **A+B hybrid.**
- Option A (status-gated PA flow filtering on parent status via lookup navigation) ships for slice 0.
- Option B (`$batch` + change sets in `dynamics-service.js`) ships as near-term infrastructure follow-up after pilot.

Four preconditions, three pre-deploy + one post-deploy:
1. PA trigger filter expression validates on Create AND Update AND Delete events.
2. Delete trigger payload exposes deleted row's parent ID.
3. Rule-exception language lands in `INTAKE_PORTAL_DESIGN.md` § "Power Automate boundary."
4. Real-schema verification after slice 0 deploys (post-deploy; blocks PA flow go-live, not the deploy itself).

Codex review went through six rounds across the two new docs (`INTAKE_PORTAL_ITEM_6_DISCUSSION.md` v1 → v3 + post-sync patches; `INTAKE_PORTAL_ITEM_6_MAKER_PORTAL_TESTS.md` + `INTAKE_PORTAL_ITEM_6_QUICK_PROBE.md`). Final state: all findings resolved, gates green.

### Commits this session

- `4bcfdd6` — S149 schema-review decisions (code + doc patches, Item 6 deferred)
- `83b4495` — Item 6 discussion doc (v3, three Codex review rounds)
- `1c9e143` — Item 6 Connor sync (Q1+Q2 locked, A+B hybrid path, maker-portal test runbook)

## Production state

- 4 commits ahead of `origin/main` at session-end (this prompt's commit is the fourth).
- Working tree clean once this prompt is committed.
- CI gates green (`check:atlas`, `check:api-routes`).
- Connor has both Item 6 docs (`DISCUSSION.md` + `MAKER_PORTAL_TESTS.md` + `QUICK_PROBE.md`) for the maker-portal runbook.

## Where to pick up — Session 150

### A. Wait for Connor's Item 6 test results (PRIMARY blocker)

Connor runs Test 1 (filter-expression syntax — Candidates A–E) and Test 2 (Delete trigger payload introspection). Three outcomes route to three paths:

| Test outcome | Path |
|---|---|
| Both pass cleanly | **A+B hybrid confirmed.** Connor builds the PA flow; we write the schema slice + plan Option B. |
| Test 1 passes, Test 2 fails | A handles Create/Update; design huddle for Delete fallback (stored mapping + reconcile cron). |
| Test 1 fails on any event | A is dead. **Option B alone** — build `$batch` first; slips schema slice past 2026-05-19. |

Until results land, do not write JSON specs or apply schema. Idle work that doesn't depend on Item 6:

### B. Land the rule-exception edit in `INTAKE_PORTAL_DESIGN.md` (PRE-DEPLOY PRECONDITION #3)

Draft the narrow-exception language from `INTAKE_PORTAL_ITEM_6_DISCUSSION.md` § 6 Q2 into the existing § "Power Automate boundary" section. Name the three aggregate fields and the lifecycle gate. Non-negotiable; do not skip.

### C. Postgres migration `009_submission_jobs.sql`

Tracked all session as missing infrastructure that blocks any drain. Independent of Item 6 outcome — can land now. Schema is sketched in `INTAKE_PORTAL_DESIGN.md` § "Submission lifecycle"; needs the actual `.sql` file under `lib/db/migrations/`.

### D. Reserve numeric integer values for new enum entries (pre-deploy)

Codex flagged "picking integers at deploy is too late." For slice 0 deploy, decide and document:
- `wmkf_proposalbudgetline.wmkf_category` — 9 values (6 WMKF-spend + 3 cost-share). Microsoft convention: 100000000, 100000001, …
- `wmkf_apprequestperson.wmkf_role` — 3 new values (Senior Personnel, Key Personnel, Other) extending existing PI=100000000 / Co-PI=100000001.
- `wmkf_portal_membership.wmkf_priordecisionstatus` — 3 values (Rejected, Revoked, Approved).

Record in Atlas pages at slice 0.

### E. Carryover from S147–S148 (low priority)

- COI policy body wording (Stage 2a reviewer engagement).
- Revert temp role elevations on prod app user (deferred through pilot iteration).
- Visual smoke of the Gemini refactor on `/phase-ii-writeup` (S148 carryover — landed visually green per S148 prompt; if any regressions surface, this is the carryover).
- Sarah's Phase II Research field inventory (Track 2 carryover from 2026-05-13; primary blocker for the form module).

## Calendar checkpoints

- **2026-05-15** — Connor's flow-list reply target (from S148 — still pending if not arrived).
- **2026-05-19** — Schema slice 0 deploy target. **Blocked on Item 6 test results + rule-exception edit + `submission_jobs` migration + enum integer reservations.**
- **2026-05-26** — Dry-run: manually flip throwaway test request to `'Phase II Pending'` and watch PA flows fire.
- **2026-05-30** — Go/no-go review.
- **2026-06-01** — Pilot accepting submissions for mid-June Phase II Research cycle.

## Key files modified this session

| File | Status | Purpose |
|---|---|---|
| `docs/INTAKE_PORTAL_ITEM_6_DISCUSSION.md` | NEW | Full Item 6 walkthrough; § 0 locks Connor sync decisions, § 5 Option A–F analysis, § 8 active next steps |
| `docs/INTAKE_PORTAL_ITEM_6_MAKER_PORTAL_TESTS.md` | NEW (Codex) | Step-by-step PA maker-portal runbook for Connor — 823 lines |
| `docs/INTAKE_PORTAL_ITEM_6_QUICK_PROBE.md` | NEW (Codex) | Fast-path Item 6 probe — companion to the full runbook |
| `docs/BUDGET_FORM_SPEC.md` | EDITED → v3 | Unified-table decision, reused-field aggregate definitions, Item 6 deferral inline |
| `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md` | EDITED | New 2026-05-14 entry as authoritative; pre-deploy checklist explicit |
| `docs/INTAKE_PORTAL_SCHEMA_REVIEW_2026-05-14.md` | EDITED | Outcome banner mapping each item to actual decision |
| `docs/INTAKE_PORTAL_DESIGN.md` | EDITED | Launch blockers refreshed (Item 6, missing `submission_jobs`); resolved-decision entry for 2026-05-14 |
| `docs/atlas/dataverse-wmkf-apprequestperson.md` | EDITED | Read-path filter narrowing + missing consumers |
| `docs/atlas/dataverse-akoya-request.md` | EDITED | Stale `wmkf_personnel` references replaced |
| `pages/api/reviewer-finder/contact-history.js` | EDITED | PI/Co-PI source filter |
| `pages/api/grant-reporting/lookup-grant.js` | EDITED | Removed `akoya_request` award-amount fallback |
| `scripts/acceptance-w4.js` | EDITED | Role filter + zero-row hit-rate gate |
| `scripts/inspect-request-copis.js` | EDITED | Expanded-enum comment |
| `shared/forms/.../map-to-dynamics.js` | EDITED | Resolved 2 entity-choice TODOs; header distinguishes Item-6 vs. design-question blockers |
| `.claude-memory/feedback_human_legibility_schema_principle.md` | NEW | Schema design principle from morning sync |
| `.claude-memory/feedback_codex_verbatim_output.md` | NEW | Codex output must be pasted verbatim |
| `.claude-memory/feedback_verify_external_platform_claims.md` | NEW | Verify external-platform claims via WebFetch before stating |
| `SESSION_PROMPT.md` | REWRITTEN | This file |

## Testing

```bash
# Sanity gates (should remain green — nothing in this session broke ground-truth)
npm run check:atlas
npm run check:api-routes

# When Item 6 test results land, slice 0 schema work begins:
node scripts/apply-dataverse-schema.js --target=prod --wave=2
```

## Gotchas to remember

- **Item 6 is the schema-slice blocker.** Three pre-deploy preconditions must clear: Connor's two maker-portal tests + the design-doc rule-exception edit. Plus `submission_jobs` migration + enum integers. Do not write schema JSON before they land.
- **GoApply still writes `akoya_request` and `akoya_expenses`.** Drain's future writes to these fields must coexist with GoApply for the pilot duration. Don't convert them to rollups, don't take them over.
- **External-platform claims need WebFetch verification before being stated.** Memory rule `feedback_verify_external_platform_claims`. Use-case-specific verification ("Y works for combination Z") not just feature-existence ("Y exists").
- **Codex output is verbatim, always.** Memory rule `feedback_codex_verbatim_output`. My commentary goes AFTER the verbatim block, never instead of it.
- **Dataverse `EntityCustomization` 429s** between metadata writes — wrap multi-attribute deploys in 30s-backoff retry per `project_dataverse_schema_deploy_gotchas`.
- **`@odata.bind` keys are PascalCase nav-property names**, not lowercase logical names. The portal submit handler will hit this when posting budget rows with `wmkf_Request@odata.bind`.
- **Demo-token mint wrote to prod Dataverse** on suggestion `489ecf2c-...` (Aspuru-Guzik) — left over from S148. If you query that row, expect live `wmkf_proposalfirstaccessed` data from the demo visit.
- **`EXTERNAL_LINK_SECRET`** in `.env.local` is a dev-only random secret, gitignored. Different from prod.
