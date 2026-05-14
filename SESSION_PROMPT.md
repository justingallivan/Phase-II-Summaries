# Session 151 Prompt: Connor's Item 6 test results land → schema slice 0 build

## Heads up

Session 150 was a short idle-work session while waiting on Connor's Item 6 maker-portal tests. Three idle items from the S149 hand-off (B / D / C) landed plus a full Codex pass on top.

Most important deltas:
- **All three pre-deploy preconditions on the slice-0 schema deploy now sit on Connor's side, not ours.** Power Automate boundary rule-exception drafted (precondition #3 cleared S150). Enum integers reserved (Microsoft convention, documented in `INTAKE_PORTAL_SCHEMA_CHANGES.md`). `submission_jobs` migration written + wired into setup script (`009_submission_jobs.sql` + V30 inline block).
- **Codex review of the slice-0 prep caught a real high-severity defect.** Original `submission_jobs.draft_id` was `NOT NULL REFERENCES intake_drafts(id)` with `NO ACTION`, which would have blocked the documented "drafts cleared on submit" lifecycle. Fixed to nullable + `ON DELETE SET NULL`; the frozen `payload` JSONB is the authoritative snapshot, so traceability survives.
- **One unresolved pre-deploy probe carries forward**: live Dataverse option-set metadata on `wmkf_apprequestperson.wmkf_role` must be probed before deploy to confirm no existing values occupy `100000002`–`100000004`. Codex couldn't reach live Dataverse from the session, only the Atlas page and checked-in JSON spec. **Don't deploy without running this probe.**

## Session 150 summary

### A. Rule-exception edit in `INTAKE_PORTAL_DESIGN.md` (pre-deploy precondition #3 — CLEARED)

Added an **"Exception — intake portal aggregate fields on `akoya_request`"** subsection directly under the "Power Automate boundary" critical invariant. Names the three fields with an exhaustive scope table:

- `akoya_request` (Money) — WMKF-spend total
- `akoya_expenses` (Money) — unfiltered sum of child `wmkf_proposalbudgetline.wmkf_amount` (tightened post-Codex)
- `wmkf_totalothersources` (Money) — cost-share total

Lifecycle gate is parent `akoya_requeststatus = 'Phase II Pending'`. Four preconditions stated: 1–3 are pre-deploy (gate slice 0), #4 is post-deploy (gates PA flow go-live only). GoApply co-existence note included. "Future designs cannot extend this exception" non-extensibility clause locked in.

### B. Enum integer reservations (pre-deploy)

Reserved Microsoft-convention integer values for three option sets in `INTAKE_PORTAL_SCHEMA_CHANGES.md` § "Numeric integer values reserved (pre-deploy)":

- **`wmkf_proposalbudgetline.wmkf_category`** (new, 9 values) — `100000000` Personnel … `100000005` Indirect (WMKF-spend); `100000006` WaivedIndirect … `100000008` OtherCostShare (cost-share). WMKF-spend aggregate queries filter `NOT IN (100000006, 100000007, 100000008)`.
- **`wmkf_apprequestperson.wmkf_role`** (existing 2, extending to 5) — preserves PI=`100000000` / Co-PI=`100000001`; adds Senior Personnel=`...2` / Key Personnel=`...3` / Other=`...4`. Source-filter invariant on existing reviewer/co-PI consumers means expansion is non-breaking by construction.
- **`wmkf_portal_membership.wmkf_priordecisionstatus`** (new, 3 values) — Rejected=`100000000` / Revoked=`100000001` / Approved=`100000002`. Field nullable so "no prior decision" is absence, not a fourth value.

Apprequestperson Atlas page amended with the planned expansion + source-filter invariant.

### C. Postgres migration `009_submission_jobs.sql`

Created the migration file under `lib/db/migrations/` with matching V30 inline block in `scripts/setup-database.js` (table runs at next setup-script invocation). Atlas entry added to `docs/atlas/postgres-infra-tables.md`. Atlas gate returned to green.

Schema highlights:
- `idempotency_key TEXT NOT NULL UNIQUE` — client-generated UUID per submit click
- `draft_id INTEGER REFERENCES intake_drafts(id) ON DELETE SET NULL` (post-Codex correction — was NOT NULL initially)
- `payload JSONB NOT NULL` — frozen validated draft snapshot, drain reads this never `intake_drafts`
- `status` CHECK constraint enforcing the documented state machine (`queued → scanning → files_moved → dynamics_patched → status_flipped → completed`; terminal `failed` / `cancelled`)
- `(status terminal) = (completed_at IS NOT NULL)` consistency CHECK
- Partial index `idx_submission_jobs_active_ready` for drain queries
- **Partial unique index `idx_submission_jobs_one_active_per_request`** on `(account_id, request_id, form_key) WHERE status NOT IN terminal` — added post-Codex; catches tab-refresh-resubmit that fresh UUID would slip past

### D. Codex review pass

Spawned `codex:codex-rescue` on commit `07a43ce` (the slice-0 prep). Surfaced 10 findings; 9 were addressed in commit `3f167f5`. The deferred one (DDL-DIVERGENCE on `COMMENT ON` statements) matches V26/V28/V29 inline-block house style.

Findings worth remembering for future slice-0 work:
- The terminal-state CHECK `(status IN (...)) = (completed_at IS NOT NULL)` was confirmed correct (with `status NOT NULL`, the four-truth-table is rejected on the two invalid combos).
- The launch-blocker for Item 6 in `INTAKE_PORTAL_DESIGN.md` was still phrased as "unresolved" with "three viable redesigns" — rewrote to reflect A+B-locked status with the actual remaining gates.
- "Add to V27 migration" reference in design doc § "Migration note" was stale — updated to V30 / 009.

### Commits this session

- `07a43ce` — S150 slice-0 prep — rule exception, enum integers, submission_jobs migration
- `3f167f5` — S150 Codex review fixes — slice-0 prep
- (This session prompt commit is the third.)

## Production state

- 3 commits ahead of `origin/main` at session-end (this prompt's commit is the third).
- Working tree clean once this prompt is committed.
- CI gates green (`check:atlas`, `check:api-routes`).
- `submission_jobs` table exists in code but NOT yet applied to prod Postgres — runs with the slice 0 deploy.

## Where to pick up — Session 151

### A. Connor's Item 6 test results (PRIMARY)

Three outcomes route to three paths (unchanged from S150 prompt):

| Test outcome | Path |
|---|---|
| Both pass cleanly | **A+B hybrid confirmed.** Write the schema slice JSON specs + plan Option B follow-up. |
| Test 1 passes, Test 2 fails | A handles Create/Update; design huddle for Delete fallback. |
| Test 1 fails on any event | A is dead. **Option B alone** — build `$batch` first; slips schema slice past 2026-05-19. |

### B. Pre-deploy live probe (BLOCKING — do this before any schema deploy)

Run `node scripts/dynamics-schema-diff.js` (or equivalent EntityDefinitions probe) against `wmkf_apprequestperson.wmkf_role` and confirm no existing live values occupy `100000002`–`100000004`. This was the one slice-0 enum claim Codex couldn't verify from the session — Atlas + checked-in JSON say PI/Co-PI only, but live state since S139 hasn't been re-probed.

If the probe shows occupants at any of those values, the role-enum expansion plan must be re-numbered before deploy. Update Atlas + `INTAKE_PORTAL_SCHEMA_CHANGES.md` accordingly.

### C. Write the schema slice JSON specs (when A clears)

Targets in `lib/dataverse/schema/wave2/` (or `intake/` subdir per the 2026-05-13 SCHEMA_CHANGES entry):

- `wmkf_proposalbudgetline.json` — new entity with 9-value `wmkf_category` enum, lookup to `akoya_request`, parental cascade-delete, all fields per `BUDGET_FORM_SPEC.md` v3.
- `wmkf_apprequestperson` extension — add `wmkf_effortpct` / `wmkf_biosketchurl` / `wmkf_lineorder`; expand `wmkf_role` enum to 5 values.
- `akoya_request.wmkf_totalothersources` (Money, the only net-new aggregate field).
- `wmkf_portal_membership.wmkf_priordecisionstatus` (Choice, 3 values, nullable).

Use the integer values reserved in S150 (documented in `INTAKE_PORTAL_SCHEMA_CHANGES.md`). Wrap deploys in 30s-backoff retry per `project_dataverse_schema_deploy_gotchas`.

### D. Atlas pages for new entities (alongside C)

- NEW: `docs/atlas/dataverse-wmkf-proposalbudgetline.md` (full page; transcribe the 9-value `wmkf_category` enum integer table from `INTAKE_PORTAL_SCHEMA_CHANGES.md`).
- AMEND: `docs/atlas/dataverse-wmkf-apprequestperson.md` for the three new fields (the enum expansion banner is already in place from S150).
- NEW or AMEND (TBD): a page covering `wmkf_portal_membership` or an entry on a shared page documenting the `wmkf_priordecisionstatus` enum.

Atlas CI gate fails if a new entity is referenced in source without an Atlas page, so these must land in the same PR as any read-path additions.

### E. Apply `submission_jobs` to prod Postgres

`node scripts/setup-database.js` will run V30 idempotently. Confirm via psql that the table + 7 indexes exist post-run.

### F. Carryover from S147–S149 (low priority)

- COI policy body wording (Stage 2a reviewer engagement).
- Revert temp role elevations on prod app user (deferred through pilot iteration).
- Visual smoke of the Gemini refactor on `/phase-ii-writeup` (landed visually green in S148; carryover only if regressions surface).
- Sarah's Phase II Research field inventory (Track 2 carryover from 2026-05-13; primary blocker for the form module).

## Calendar checkpoints

- **2026-05-15** — Connor's flow-list reply target (from S148 — overdue if unanswered).
- **2026-05-19** — Schema slice 0 deploy target. **Blocked on Connor's Item 6 tests + live-probe verification of `wmkf_role` enum integers.**
- **2026-05-26** — Dry-run: manually flip throwaway test request to `'Phase II Pending'` and watch PA flows fire.
- **2026-05-30** — Go/no-go review.
- **2026-06-01** — Pilot accepting submissions for mid-June Phase II Research cycle.

## Key files modified this session

| File | Status | Purpose |
|---|---|---|
| `docs/INTAKE_PORTAL_DESIGN.md` | EDITED | Added PA boundary "Exception" subsection; updated launch blocker #2 to reflect A+B locked; corrected "Add to V27 migration" → V30 / 009; added 4th precondition to exception preconditions list |
| `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md` | EDITED | Added enum integer reservation tables for all three option sets; struck through resolved pre-deploy bullets; new pre-deploy bullet for live-probe verification |
| `docs/atlas/dataverse-wmkf-apprequestperson.md` | EDITED | Documented enum expansion (PI/Co-PI preserved, 3 new values reserved) + source-filter invariant for non-breaking-by-construction |
| `docs/atlas/postgres-infra-tables.md` | EDITED | Added `submission_jobs` entry under § Intake Portal |
| `lib/db/migrations/009_submission_jobs.sql` | NEW | Async submission queue table + 8 indexes (incl. partial active-jobs unique index added post-Codex) + state-machine CHECK + terminal-consistency CHECK |
| `scripts/setup-database.js` | EDITED | V30 inline block + run-loop wiring + summary line |
| `SESSION_PROMPT.md` | REWRITTEN | This file |

## Testing

```bash
# Sanity gates (must remain green)
npm run check:atlas
npm run check:api-routes

# Pre-deploy live probe (NEW — required before slice 0)
node scripts/dynamics-schema-diff.js   # confirm wmkf_apprequestperson.wmkf_role
                                       # has no occupants at 100000002-100000004

# When Connor's tests land + live probe is clean, apply migration to prod
node scripts/setup-database.js         # runs V30 idempotently (CREATE IF NOT EXISTS)

# When schema slice 0 deploys:
node scripts/apply-dataverse-schema.js --target=prod --wave=2
```

## Gotchas to remember

- **The pre-deploy live probe on `wmkf_role` is non-negotiable.** Atlas + checked-in JSON spec say only PI/Co-PI are deployed, but Codex couldn't confirm from session. If anything occupies `100000002`–`100000004` in live Dataverse, the role-enum expansion plan must be re-numbered.
- **`submission_jobs.draft_id` is nullable + ON DELETE SET NULL.** This is intentional — the frozen `payload` JSONB carries authoritative traceability. If you find yourself wanting NOT NULL back, you're probably also changing the "drafts cleared on submit" lifecycle, which has cascading implications.
- **The partial unique index `idx_submission_jobs_one_active_per_request`** means at most one non-terminal job exists per `(account_id, request_id, form_key)`. Tab-refresh-resubmit becomes safe by construction. If a real use case for concurrent active jobs surfaces, the index — not the application code — is what needs revisiting.
- **The PA-boundary exception is narrow and non-extensible.** Future aggregate-field designs cannot rationalize "we already broke the rule once, add ours too." Adding a fourth field requires a new explicit decision and an update to the exception section.
- **Precondition #4 (post-deploy real-schema verification) gates PA flow go-live, NOT slice-0 deploy.** Easy to confuse. The schema can land while the PA flow is still under verification — Option B alone (drain `$batch`) would be the operative path during that window if anything in precondition 1 or 2 surfaces gaps.
- **Codex output is verbatim, always** (memory rule `feedback_codex_verbatim_output`). When summarizing instead, surface the raw stdout block first.
