# Session 111 Prompt: Backend Executor extensions + cycle prep

## Session 110 Summary

Phase 0 of the Executor + prompt-row architecture is **shipped on the Vercel side**, on time for the May 1 2026 cycle. The cycle path (user-facing `/phase-i-dynamics`) is end-to-end functional against Dynamics with the new infrastructure. PA-side Phase 1 is Connor's, post-cycle.

A strategic shift surfaced mid-session that reshapes Session 111+ priorities (see "Strategic shift" below).

### What was completed

1. **CI fix** — `tests/integration/auth-routes.test.js` mock for `baseConfig` was missing the internal cache helpers (`_shouldReloadOverrides`, `_setOverridesCache`, `clearModelOverridesCache`), causing the dynamics-explorer/chat path to throw post-auth. Added the helpers + a direct mock of `lib/services/model-override-loader`. Bumped all `actions/checkout@v4` → `@v5` and `actions/setup-node@v4` → `@v5` to silence the Node 20 deprecation warning.
2. **`phase-i.summary` prompt row seeded** in `wmkf_ai_prompts` (sandbox row `d4201d8e-3840-f111-88b5-000d3a3065b8`). Idempotent seed at `scripts/seed-phase-i-summary-prompt.js`. Documents the Phase 0 placement compromise (3 of 4 declared user-placement variables physically interpolate into the system prompt — kept as-is to avoid prompt-quality drift this close to cycle; Phase 2 reconciles via `placement: "system"` on context blocks).
3. **`executePrompt()` Executor service** at `lib/services/execute-prompt.js`. Implements the 10-step contract. Single entry point. Phase 0 supported source kinds: `dynamics`, `sharepoint`, `override`. Target kinds: `akoya_request` (with optional `$.foo` jsonPath), `none`. Guards: `skip-if-populated`, `always-overwrite`. parseModes: `raw`, `json`. Returns `{ parsed, runId, cacheHit, blocked, conflicts, writeResults, usage, meta }`.
4. **Executor Contract extended** with output guards (`docs/EXECUTOR_CONTRACT.md`). Step 4 = preflight guards before Claude call (no wasted tokens on conflicts). New section "Notes for caller authors" gives explicit guidance for Connor on `forceOverwrite` defaults per parent-flow type. Added `usage` + `meta` to return shape for caller observability.
5. **`summarize-v2.js` refactored** from 292 → 145 lines. Now does only Vercel-specific concerns (auth, rate limit, file load from `fileRef`, 409 shaping for UI, per-user usage logging). UI compatibility preserved — same 409 conflict shape, same 200 success shape.
6. **End-to-end smoke test** — `scripts/test-execute-prompt.js`. Three runs verified against sandbox request 993879 (Carter/UNC-CH):
   - empty field, no force → write OK, run row OK, both Lookups populated, 23.1s
   - populated, no force → blocked, no Claude call, 0.4s, run row with `Needs Review` status
   - populated, `--force` → write OK, **`cacheHit: true`** on rerun, 21.5s
7. **UI smoke test** through `/phase-i-dynamics` — works first time, 409 warning on second run, overwrite-with-cache-hit on third. Justin verified.
8. **Doc reconciliations:**
   - `docs/PROMPT_STORAGE_DESIGN.md` — body rewrite applying the Session 109 renames (`wmkf_prompt_template` → `wmkf_ai_prompt`, etc.); reconciliation banner becomes a tighter history note.
   - `docs/BACKEND_AUTOMATION_PLAN.md` — Session 110 update describing the Vercel-side ship, the strategic winddown framing, and pending Executor extensions for backend automation.
   - `docs/POSTGRES_TO_DATAVERSE_MIGRATION.md` — Wave 1 ✅ shipped 2026-04-24 with outstanding follow-ups listed.
   - `docs/WAVE1_VERCEL_FLAG_ROLLOUT.md` — added explicit retirement criterion (3 flags on dataverse 14+ days, table-drop scheduled).

### Strategic shift (mid-session)

Justin clarified the post-May-2026 trajectory. Key points (captured in `memory/project_phase_i_summary_app_winddown.md`):

- **Cycle structure changes** post-May 2026: Phase I and Phase II merge into a streamlined single-phase process. Many proposals will use AI-generated summaries instead of human writeups. Demand for the `/phase-i-dynamics` user-facing app collapses.
- **Backend automation owns the future** of intake-style workflows (compliance, fit assessment, keywords). These should be authored backend-first (PA-triggered Executor calls), not as new user-facing routes.
- **User-driven apps that tie into Dynamics still get forward investment** — reviewer finder, Phase II writeup/Q&A, Expertise Finder, Grant Reporting, Review Manager. Justin specifically called this out so it doesn't get caught in the winddown framing.
- **`phase-i.compliance` was deferred from Phase 0.** When built (post-cycle), it's a backend-first prompt. The Executor extensions needed to support it are listed below as Session 111+ work.

### Commits (5 ahead of origin)

- `107a73b` Fix CI: baseConfig mock + actions v5
- `f465799` seed phase-i.summary + output guards in contract
- `b12282e` Phase 0 Executor + smoke test
- `56a170a` Refactor summarize-v2 (292 → 145 lines)
- `6945d6b` Doc reconciliations after Phase 0 ship

**Not yet pushed to origin.** First step in Session 111 is `git push origin main`.

## Key state facts

- **Phase 0 Vercel implementation: complete.** No further changes needed for the May 1 cycle to function via the new Executor.
- **`phase-i.summary` row**: GUID `d4201d8e-3840-f111-88b5-000d3a3065b8` in sandbox. Single output to `wmkf_ai_summary`, parseMode raw, guard skip-if-populated. Sonnet 4 model, temperature 0.3, max_tokens 16384.
- **`phase-i.compliance` row**: not authored. Connor provided a draft prompt (in Session 110 conversation transcript). Plan: trim to clerical + keywords + priority-fit (drop summary task — `phase-i.summary` owns that). Backend-first.
- **Executor extensions still pending** (needed for backend intake automation, not for May 1):
  1. `preprocess: pdf_native` — send PDFs to Claude as document content blocks (Anthropic supports). Required for budget compliance check.
  2. Multi-output PATCH coalescing — current Executor PATCHes outputs sequentially with the same ETag; second PATCH would 412. Group all `akoya_request` writes into one PATCH (one GET for jsonPath fields, one PATCH for everything).
  3. Picklist target output type — `wmkf_ai_compliancecheck` and `wmkf_ai_fitassessment` are Picklists. Add an output-schema convention for label→option-set mapping so Claude returns string labels and Executor maps to numeric values.
- **Wave 1 flag flips still pending** (orthogonal — Justin to flip on his pace).
- **Today's date: 2026-04-25.** Cycle arrives 2026-05-01 — 6 days.

## Potential next steps

### 1. Push Session 110 commits to origin
`git push origin main`. Five commits waiting.

### 2. Cycle-prep verification (May 1 readiness)
Light pre-flight before the cycle hits:
- `npm run test:ci` — confirm CI green on the merged Session 110 commits
- One more end-to-end smoke run via `/phase-i-dynamics` to confirm prod parity (the UI test we already did was against sandbox via dev server)
- Spot-check that the seed row is unchanged in sandbox: `grep -A 2 "phase-i.summary" scripts/seed-phase-i-summary-prompt.js | head -3`

### 3. Executor extensions for backend automation (post-cycle work)
None of these block May 1. All three are needed before backend intake automation can ship.

**3a. `preprocess: pdf_native`** — Anthropic's messages API supports PDF document blocks (`{type: "document", source: {type: "base64", data: "...", media_type: "application/pdf"}}`). Add this preprocess hint to the variable resolver — when set, instead of running pdf-parse → text, the file's buffer is base64-encoded and inserted into the user message as a content block. Will need to update `composeMessages()` to support an array of content parts (mix of text + document blocks).

**3b. Multi-output PATCH coalescing** — refactor `persistOutputs()` in the Executor:
- Compose a single PATCH payload merging all `akoya_request` field-targets
- For jsonPath outputs sharing the same Memo field, do one GET → merge all paths → include in the single PATCH
- Use the captured ETag for `If-Match` once
- Document: "all outputs to same row → one PATCH" semantics

**3c. Picklist target type** — extend output schema:
```json
{
  "name": "clerical_status",
  "type": "string",
  "target": { "kind": "akoya_request", "field": "wmkf_ai_compliancecheck" },
  "valueMap": { "pass": 682090000, "fail": 682090001, "review": 682090002 }
}
```
Executor reads `valueMap[claudeReturnedString]` and writes the numeric value. Probe option-set values for `wmkf_ai_compliancecheck` and `wmkf_ai_fitassessment` before authoring `phase-i.intake-check`.

### 4. Author `phase-i.intake-check` prompt (post-cycle)
After 3a-3c land. Three tasks: clerical (sections + budget validation) + keywords + priority fit. Drop the summary task (overlaps `phase-i.summary`). Connor's draft prompt is in the Session 110 conversation transcript at `/Users/gallivan/.claude/plans/` if needed; otherwise reauthor against the trimmed scope. Six outputs targeting:
- `wmkf_ai_compliancecheck` (Picklist via valueMap)
- `wmkf_ai_complianceissues` (Memo, list of violations)
- `wmkf_ai_compliancesummary` (Memo, brief rationale)
- `wmkf_ai_fitassessment` (Picklist via valueMap)
- `wmkf_ai_fitrationale` (Memo)
- `wmkf_ai_dataextract.$.keywords` (jsonPath)

### 5. User-driven app forward work (Justin's emphasis)
Don't park user-driven apps that tie into Dynamics. Possible Session 111+ targets:
- Reviewer Finder Dynamics integration (currently Postgres-resident; Wave 2 of the migration plan covers it)
- Phase II writeup/Q&A — does it need any Dynamics writeback today?
- Expertise Finder — currently Postgres-resident roster; Wave 4 migration target
- Grant Reporting — already integrates with Dynamics for grant lookup; consider whether report content should write back to a `wmkf_ai_report` row when the user finalizes

These don't have a deadline; they're "what's next" candidates once cycle is stable.

### 6. (Stretch) Other Session 109 punch-list items
- `docs/STAGED_PIPELINE_IMPLEMENTATION_PLAN.md` — re-resolve pipeline-state storage decision (recommend: `akoya_request` fields + `wmkf_ai_run` JSON, not a new Postgres table)
- `docs/ARCHITECTURE_SPINE.md` — write as canonical link target so future design docs stop drifting
- `DEVELOPMENT_LOG.md` — last entry is Session 84; long backfill task, low priority

## Key files reference

| File | Purpose |
|---|---|
| `lib/services/execute-prompt.js` | **The Executor.** 10-step Phase 0 implementation. |
| `docs/EXECUTOR_CONTRACT.md` | Shared spec; Connor builds PA-side `ExecutePrompt` against this. |
| `pages/api/phase-i-dynamics/summarize-v2.js` | Reference call site (~145 lines). |
| `scripts/seed-phase-i-summary-prompt.js` | Idempotent seed for `phase-i.summary` row. |
| `scripts/test-execute-prompt.js` | End-to-end smoke test. `--force-overwrite`, `--restore ""` options. |
| `lib/services/dynamics-service.js` | `getRecord` / `updateRecord` (with `ifMatch`) / `queryRecords` / `createRecord` — already wired with `_etag` capture in `processAnnotations`. |
| `lib/utils/sharepoint-buckets.js` | `getRequestSharePointBuckets` — walks active + archive libraries. |
| `lib/utils/file-loader.js` | `loadFile` (via fileRef) and `extractTextFromBuffer` (used directly by Executor's sharepoint resolver). |
| `memory/project_phase_i_summary_app_winddown.md` | Strategic context for post-cycle direction. |

## Testing

```bash
# Reproduce the cycle path locally (auth disabled in dev)
npm run dev
# → http://localhost:3000/phase-i-dynamics

# Re-run the executor smoke test
node scripts/test-execute-prompt.js                  # default — block-or-write
node scripts/test-execute-prompt.js --force-overwrite # force, expect cacheHit on rerun
node scripts/test-execute-prompt.js --restore ""      # reset wmkf_ai_summary

# Re-seed if the prompt row drifts
node scripts/seed-phase-i-summary-prompt.js --execute

# CI suite
npm run test:ci
```

## Session hand-off notes

- **Push the commits early.** Five commits ahead of origin; pushing at the start of the next session puts `origin/main` in the right state for any branch work.
- **Don't start Executor extensions (3a-3c) under cycle pressure.** They're real work and they're for backend automation, not for May 1. Cycle pressure encourages cutting corners; do these post-cycle.
- **Connor will need a brief on the contract changes** — output guards, `forceOverwrite`, `usage`/`meta` return additions. The "Notes for caller authors" section in `EXECUTOR_CONTRACT.md` is the deliverable; ping Connor once Phase 0 is fully shipped (probably after the first cycle smoke test).
- **The strategic shift is real.** Don't spend Session 111 cycles on `/phase-i-dynamics` UI polish or new user-facing intake routes. The backend track is the future. User-driven apps that tie into Dynamics (review finder etc.) remain investment-worthy — see the dedicated note above.
