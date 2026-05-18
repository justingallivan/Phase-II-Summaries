# Session 162 Prompt: Track B is LIVE — pivot to the UI/UX discussion

## Session 161 Summary

**Power Tools Track B (Dataverse Bulk Export) shipped to production and is verified working end-to-end.** S160 left the API layer done but no front-end; S161 built the builder UI, then hardened it through real prod use (three live-data defects, a Blob-infra gap, and a disclosure round) — every fix probe-driven against live Dataverse, never guessed. The user confirmed the final Caltech case works. **The user has explicitly deferred a UI/UX discussion to the next session** ("several issues regarding how and what we might search for") — that is the primary next step.

### What was completed

1. **Builder UI built** — `pages/dataverse-bulk-export.js`: forced-fan-out filter builder over the stable S160 `/preview`→`/run`→`/download` seam; RequireAppAccess; confirm-gated; loud truncation; fail-loud taxonomy. Nav is registry-driven (entry already existed). Added `docs/guides/DATAVERSE_BULK_EXPORT.md`; dropped the "builder UI not yet built" caveat from CLAUDE.md; reconciled status in build-plan §10 + design-doc AUTHORITATIVE LIST.
2. **Two Codex UI rounds folded** — cold review (P0×2/P1×2/P2/P3) then a confirm round (2 residuals: stuck-spinner on stale preview, post-unmount setState). `mountedRef`/`specRev`/AbortController/expiry-timer all in.
3. **Three live-Dataverse defects** (only surface on real data — tests mock the taxonomy; the fail-loud surfaces caught all three on first real use):
   - `akoya_program` PrimaryNameAttribute is **`akoya_program`**, not `akoya_name` (`live-taxonomy.js`).
   - operational-exclusion picklist label is **`Phone Call`**, not `Phone` (`constants.js`; fixture corrected too).
   - the `institution` axis was **non-functional** — it emitted a bare condition on the `akoya_applicantid` *lookup*. Now compiles to an inner `account` link with OR(name, akoya_aka), eq/contains/in (`compiler.js`). Codex-reviewed.
4. **Dedicated private Blob store** — prod `/run` failed: shared store is **public**, `put({access:'private'})` throws. Provisioned `dvx-export-private` + **`DVX_BLOB_RW_TOKEN`** (prod/preview/dev), threaded into `run.js`/`download.js` with a pre-stream fail-loud guard. Shared `BLOB_READ_WRITE_TOKEN` verified untouched throughout.
5. **Loud exclusion waterfall** — reconciled a 29-vs-35 user report (29 was correct; their AkoyaGO ref silently mixed 29 grants + 6 of 18 operational rows). `/preview` now returns a `composition` (matched → −operational → −test → exported), rendered prominently. Codex-reviewed; one P2 folded (replaced silent `Math.max(0,…)` clamps with a hard fail-loud count invariant).

### Commits (S161, `main`, all pushed)
`31f56c6` builder UI · `e4d49d3` Codex UI fold+confirm · `83fc00e` akoya_program field · `a69fbe7` Phone Call label · `c11a27c` institution axis · `8ff9c5e` private Blob store · `2c20e4d` loud waterfall · (+ this doc commit)

## Carry Forward

### A. UI/UX discussion — THE PRIMARY NEXT STEP (user-flagged, deferred from S161)
The user wants a working session on **how and what to search** in the builder — "several issues" regarding the search/filter experience. This is a *discussion first*, not an implementation task. Do NOT pre-build changes; surface options, let the user drive. Likely themes (infer, don't assume): the program filter is single-GUID exact (Caltech research $ is spread across Directors'/Matching/Medical programs, not just "Science and Engineering Research"); institution is exact name/AKA eq (works for clean accounts, no fuzzy/variant matching by design — §3c Normalize is disclosure-only); no multi-program / OR-across-axes; no preset/guided slices (Phase 3, gated). Bring the §10 ledger + design AUTHORITATIVE LIST to the conversation; the QuerySpec→FetchXML seam is stable + 4× Codex-reviewed — UI/semantics changes emit the same spec, never re-derive.

### B. Track B follow-ups (non-blocking; decide deliberately)
- **Blob object lifecycle** — exposure closed (private + gated + ~1h token); physical deletion still rides the maintenance Blob sweep, which targets the *shared* store. The new `dvx-export-private` store has its OWN retention need — a deliberate cleanup decision is owed before GA (not a v1 blocker).
- **Phase 3 preset library / AI on-ramp / async job / bulk DOCX decline-rationale / Track A** — all still non-v1-core, unchanged.
- **Operational-resolver coverage** — a new operational variant in Dataverse ⇒ preview/run fail loud (422) by design; correct behavior, needs a data-only label reality surfaced loudly, never silent.

### C. slice-0 deploy — STILL the pilot path; gated on Connor Item 6
Unchanged from S161. Report factually: "gated on Connor's Item 6 maker-portal Tests 1+2" — not "overdue". Soft target 2026-05-19 was imminent at S161 close (session date 2026-05-17); no slice-0 movement (all S161 was Track B by user direction). Specs READY (`lib/dataverse/schema/wave4*/`, do NOT re-author). Deploy procedure when Item 6 clears: see S161 prompt §C (4 steps; re-run BLOCKING `scripts/probe-apprequestperson-role-data.js`, Connor field review, `apply-dataverse-schema.js --wave=4`, `setup-database.js` V30, post-deploy Atlas + gates).

### D-F. Unchanged from S161
Data-quality follow-up `#1001205`/`#1001249` (user → Connor/Sarah, not a Track B blocker); Reviewer Manager→Dataverse (read `project_reviewer_identity_fragmentation` first); COI policy wording; revert temp role elevations; Sarah's Phase II Research field inventory.

## Open Items (pending Connor / a working-session — unchanged)
- **Field Set D doc-label collision** — `dataverse-akoya-request.md` vs `DYNAMICS_AI_FIELDS_SPEC_v3_cn.md:107`. `check:memory-drift` red BY DESIGN until resolved. Ask Connor; do NOT silence.
- **121-view recognition working-session** — gates the Phase-3 preset library only (NOT v1-core). Evidence `docs/atlas/evidence/akoya-recognition-sizing-2026-05-17.txt`.
- **`incompatible_shape` drift bucket** — unbuilt in `reconcile-memory-claims.js`. Follow-up only if memory-drift tooling invested further.

## Calendar Checkpoints (soft — Connor good-faith; report factually)
- **2026-05-19** — slice-0 deploy *target* (soft); gated on Connor Item 6.
- **2026-05-26** — dry-run: flip a throwaway test request to `'Phase II Pending'`, watch PA flows fire.
- **2026-05-30** — go/no-go review. **2026-06-01** — pilot accepts submissions (mid-June Phase II Research cycle).

## Gotchas

- **🔵 Blob store model = TWO stores, do not conflate.** Shared **public** `phase-ii-summaries-blob` (`BLOB_READ_WRITE_TOKEN`, 264d) serves uploads/reviewer-finder/review-manager/maintenance. Dataverse Bulk Export has its OWN **private** `dvx-export-private` (`DVX_BLOB_RW_TOKEN`). Never point dataverse-export at the public store (CRM-data exposure — Codex S160 P1) and never flip the shared store private (breaks every upload feature). Vercel CLI (53.x + 54.x) **cannot** connect a 2nd Blob store under a custom env-var name (errors on the `BLOB_READ_WRITE_TOKEN` collision — safely, never clobbers); provision via dashboard token read + `vercel env add`. Detail in CLAUDE.md env section.
- **🔴 Living-taxonomy lesson (recurring this session).** The 69→74 dataverse-export tests **mock the taxonomy/fetch**, so any constant/field that drifts from live Dataverse is invisible to them — it ONLY surfaces on real Dataverse, which the fail-loud surfaces did, immediately, every time. When touching `lib/services/dataverse-export/{constants,live-taxonomy,compiler}.js`, verify field/label/option names against a live probe (env-loaded `.mjs`, client-credentials token, raw FetchXML/OData) — do not trust the fixture as ground truth.
- **Codex relay rule** (`feedback_codex_relay_verbatim`): deliver Codex output verbatim, no commentary, foreground, FRESH cold thread, never resume. **Shell-safe prompts**: the codex-rescue dispatch shell-mangled a prompt containing code-blocks / `key: value` / `{ }` lines (lost 3 lines, "command not found"). Write review prompts as PROSE — no code fences, no `=`/`{`/backticks/leading-`word:` lines. A clean re-issue fixed it. Know when to STOP: S161's preview round did review→confirm and converged (0 P0/P1, 1 P2 folded).
- **The QuerySpec→FetchXML seam is stable + 4× Codex-reviewed.** UI emits a QuerySpec; `/preview` is the authority for total/composition/warnings. The future AI on-ramp emits the same spec into the same confirm gate (additive).
- **`createdon`-era ≠ business-era.** Time-slice on `akoya_decisiondate`; `eraScope` is creation-PROVENANCE only.
- **W6 Postgres table-drop** (`project_w6_table_drop_pending`) triggers ≥ 2026-07-01 — not yet due. **Unverified-until-checked destructive carryover** — grep-verify the 4 drain-only tables have no live readers before any DROP.
- **`check:memory-drift` red by design** (Field Set D). Advisory, NOT a P0 blocker. Don't silence.
- **iCloud `.nosync` can clear `node_modules`** at session start — `npm ci` restores it. `git restore` usually right for silent working-tree mutations.
- **dataverse-export tests use `@jest-environment node`** (jose ESM won't parse under jsdom). Run: `node node_modules/jest/bin/jest.js <file>`. The jest env here has NO real `fetch` — live repro must be a standalone env-loaded `.mjs`, not a jest test.

## Key Files Reference

| File | Purpose |
|------|---------|
| `pages/dataverse-bulk-export.js` | The builder UI (forced fan-out, confirm gate, loud waterfall + truncation, fail-loud taxonomy) |
| `pages/api/dataverse-export/{metadata,preview,run,download}.js` | Phase 2 API; `/preview` now returns `composition` waterfall + count-invariant fail-loud |
| `lib/services/dataverse-export/{constants,live-taxonomy,compiler}.js` | Spine — live field/label names are ground truth (verify via probe, not fixtures) |
| `tests/unit/dataverse-export*.test.js` | 74 tests (mock the taxonomy — green ≠ live-correct) |
| `docs/DATAVERSE_POWER_TOOLS_{DESIGN,TRACK_B_BUILD_PLAN}.md` | Design AUTHORITATIVE LIST owns status; build plan §6/§10 owns engineering. Bring to the UI/UX discussion |
| `docs/guides/DATAVERSE_BULK_EXPORT.md` | User guide |

## Testing

```bash
node node_modules/jest/bin/jest.js tests/unit/dataverse-export.test.js tests/unit/dataverse-export-routes.test.js  # 74/74
npm run check:atlas && npm run check:atlas:self-test && npm run check:api-routes  # P0 gates (green; api-routes=84)
node scripts/check-memory-drift.js   # advisory; exits 1 on Field Set D by design
# Live probe pattern (when touching the spine): standalone .mjs, load .env.local,
#   client_credentials token, raw FetchXML/OData. NOT a jest test (no fetch in that env).
```
