# Session 110 Prompt: Build `executePrompt()` + seed `phase-i.summary`

## Session 109 Summary

Day-long architectural reconciliation session with Connor in the room. Input: six overlapping design docs written over Sessions 90–108, plus the Wave 1 prod migration that shipped yesterday, plus Connor's quietly-built-out Dynamics schema. Output: one shared spec (`docs/EXECUTOR_CONTRACT.md`) and a phased delivery plan that both sides can build against, with the first piece targeted for May 1 2026 when a few hundred Phase I proposals arrive.

### What Was Completed

1. **Live schema probe** — ground-truth pass against sandbox to see what Connor had actually built vs. what the design docs described
   - `wmkf_ai_prompt` table present with 17 custom fields (pre-session), 0 rows
   - `wmkf_ai_promptoutputschema` Memo already existed — `WORKFLOW_CHAINING_DESIGN` treated this as future work, it's there
   - `wmkf_ai_rollbackfrom`, `preflightpasseddatetime`, `lasttestdatetime`, `iscurrent`, `promptstatus` picklist all present
   - Surfaced provenance gap: `wmkf_ai_run.wmkf_ai_promptversion` is an Integer with no way to disambiguate which prompt produced a run

2. **Architectural reconciliation** (captured in `/Users/gallivan/.claude/plans/ok-claude-connor-is-precious-dove.md`)
   - **Path B chosen** over Path A (duplicated wrappers) and Path C (HTTP gateway). Declarative wrappers on the prompt row + generic executors in both PA and Vercel.
   - **Key vocabulary split:** separate the **function** (prompt row — inputs, body, outputs) from the **process** (Flow — trigger, sequence, side effects). Dynamics owns the function. PA and Vercel each own their own processes. The shared thing is the Executor contract.
   - **Two chain shapes, both first-class:** sequential (output → input via `prior_output` source kind) and parallel-consumer (shared raw input via `context_block` source kind, with `placement: system` for cross-prompt cache alignment)
   - **Routing decision:** Option 4 — Lookup `wmkf_ai_prompt` on `wmkf_ai_run` + naming convention `<domain>.<purpose>` on `wmkf_ai_promptname` (e.g., `phase-i.summary`, `phase-i.compliance`, `shared.full_application`)
   - **Caching contract:** byte-identical prefixes across callers; `cacheable: true|false` flag on each declared variable; variables declared in system vs user placement; context blocks (Phase 2) enable cross-prompt cache alignment

3. **Walked the architecture through concrete lenses** (each a section in the plan file)
   - **User-friendly Vercel features** — PDF upload (all-`override` variables), interactive Q&A (each turn = separate Executor call, state in route), download formats (post-Executor utilities), prompt preview + per-session edit (`overridePromptBody` deferred to Phase 2), streaming (stays outside Executor for now), Dynamics Explorer agent loop (separate path)
   - **Vercel code shift** — orchestration moves to Dynamics + shared Executor; UI/auth/UX stays entirely on Vercel. Reference route like `summarize-v2.js` shrinks from ~200 lines to ~30
   - **Worked example** — Summary + Keywords from PDF: one prompt row in Dynamics, 9 identical Executor steps in both callers, PA and Vercel differ only in trigger/auth/runSource/post-execution UX
   - **Connor's "compliance needs full docs" observation** — expanded the architecture to include parallel-consumer chains via context blocks with `placement: system` so summary + compliance share cached document prefix

4. **Connor additions confirmed live end-of-session (2026-04-24)**
   - `wmkf_ai_systemprompt` Memo on `wmkf_ai_prompt` — enables system/user split for Claude prompt caching. **Note: the field name is `wmkf_ai_systemprompt` (no underscore between "system" and "prompt"); EXECUTOR_CONTRACT.md and memory updated to reflect.**
   - Lookup `wmkf_ai_prompt` on `wmkf_ai_run` targeting `wmkf_ai_prompt` — fixes provenance gap. Bonus: auto-generated virtual `wmkf_ai_promptname` String on run rows, so resolved prompt name is available without a join.
   - `wmkf__ai_summary` double-underscore still present on `akoya_request` — not yet deleted; cosmetic only, we ignore it (all writes target single-underscore `wmkf_ai_summary`).

5. **Phased delivery plan** (Phase 0 → 1 → 2)
   - **Phase 0 (by 2026-05-01):** shared Dynamics core + Vercel Executor only. No PA flows, no context blocks, no cross-prompt cache alignment. First prompt row: `phase-i.summary`. Reference route: `summarize-v2.js` refactored to ~30 lines.
   - **Phase 1 (post-cycle):** Connor builds `ExecutePrompt` PA child flow + first parent flow. Same prompt rows. Adds `prior_output` source kind. Echo-prompt test oracle verifies byte-identical output from both callers.
   - **Phase 2 (when compliance joins summary):** context blocks + parallel-consumer chains. `shared.full_application` block authored. `placement: system` attribute added. `context_block` source kind added. Cross-prompt cache alignment kicks in.

6. **Docs + memory**
   - `docs/EXECUTOR_CONTRACT.md` created — the one-page operational spec, whiteboard-ready. Both implementations build against this. Scope-of-generality section makes it explicit that this is NOT a universal LLM workflow engine — it's for Pattern A / dual-caller / Pattern B+C prompts. Agent loops, streaming, non-Claude, Batch API stay on separate paths.
   - `docs/PROMPT_STORAGE_DESIGN.md` reconciliation banner added — name-rename table, Connor's Phase 0 additions noted as live, phased plan pointer, EXECUTOR_CONTRACT reference. Didn't do a full-body rename — banner prevents someone implementing from stale names without seeing the correction.
   - `memory/project_prompt_storage_strategy.md` rewritten — Session 109 decisions captured: Path B, function/process split, two chain shapes, ground-truth schema, phased plan, non-goals.
   - `MEMORY.md` index line updated to point to EXECUTOR_CONTRACT.md as the operational spec.

### Commits

- `adef1c8` Session 109: Executor Contract + Phase 0 schema reconciliation

(Session 109 produced a single commit because most of the work was architectural/conceptual — the plan file at `/Users/gallivan/.claude/plans/ok-claude-connor-is-precious-dove.md` captures ~4× more detail than fit into the committed docs, intentionally. The plan file is the complete record of the reconciliation conversation; the committed docs are the operational distillation.)

## Key State Facts

- **Phase 0 schema is complete in Dynamics sandbox.** Every field the Executor contract needs — reading or writing — exists in the live schema. No further schema asks pending for Phase 0. The one outstanding cosmetic item (`wmkf__ai_summary` deletion) doesn't block anything.
- **`wmkf_ai_prompt` still has 0 rows.** Table is ready; awaiting first seed (`phase-i.summary`).
- **Vercel code is unchanged this session.** No executor service function yet, no route refactor yet. `pages/api/phase-i-dynamics/summarize-v2.js` still uses the scratch-row `PromptResolver` from Session 103.
- **Wave 1 flag flips still pending** (orthogonal to this work — per `docs/WAVE1_VERCEL_FLAG_ROLLOUT.md`).
- **Today's date: 2026-04-24.** Cycle arrives 2026-05-01 — 7 days.

## Potential Next Steps

### 1. Seed `phase-i.summary` prompt row (prerequisite for everything else)
Write a script like `scripts/seed-phase-i-summary-prompt.js` that creates or updates the first `wmkf_ai_prompt` row. Fields to populate:
- `wmkf_ai_promptname`: `phase-i.summary`
- `wmkf_ai_systemprompt`: the system prompt text (extract from `shared/config/prompts/phase-i-dynamics.js`)
- `wmkf_ai_promptbody`: the user prompt template with `{{var}}` slots + explicit `<<<CACHE_BOUNDARY>>>` marker
- `wmkf_ai_promptvariables`: JSON array per the contract (`dynamics` + `sharepoint` + `override` source kinds)
- `wmkf_ai_promptoutputschema`: JSON with `outputs[]` (targets: `wmkf_ai_summary` + `wmkf_ai_dataextract.$.keywords`) and `jsonSchema`
- `wmkf_ai_model`: `claude-sonnet-4-6`
- `wmkf_ai_promptstatus`: `Published` (682090001)
- `wmkf_ai_iscurrent`: `true`
- `wmkf_promptversion`: `1`

Run it against sandbox first. Validate by fetching the row back and round-tripping the JSON fields.

### 2. Build `executePrompt()` Vercel service function
New file `lib/services/execute-prompt.js`. Nine steps per `docs/EXECUTOR_CONTRACT.md`:
1. Resolve prompt (extend existing `PromptResolver` or replace with direct Dataverse query by name + iscurrent)
2. Parse `wmkf_ai_promptvariables`
3. Resolve each variable via source-kind switch: `dynamics` (use `DynamicsService.getRecord`), `sharepoint` (use `GraphService.listFiles` + `lib/utils/file-loader.js`), `override` (from input)
4. Compose Claude payload: system + user split, `cache_control: ephemeral` at `<<<CACHE_BOUNDARY>>>` marker
5. Call Anthropic API
6. Parse output JSON against `wmkf_ai_promptoutputschema.jsonSchema`
7. Persist each output: PATCH `akoya_request` fields (with JSON-path set for `wmkf_ai_dataextract`)
8. Create `wmkf_ai_run` row with the new Lookup populated + full audit fields
9. Return `{ parsed, runId, cacheHit }`

Write a unit/integration test that goes end-to-end against a known sandbox request.

### 3. Refactor `summarize-v2.js` as the reference call site
Reduce `pages/api/phase-i-dynamics/summarize-v2.js` to ~30 lines: auth, overwrite guard, `await executePrompt('phase-i.summary', requestId, overrides, 'Vercel Interactive')`, return response. The existing route is the natural testbed because it already uses `PromptResolver` + has the overwrite-guard pattern.

### 4. Smoke test end-to-end against a real Phase I request
Pick a test request in sandbox. Run through the UI at `/phase-i-dynamics`. Verify:
- Prompt fetched from Dynamics
- PDF pulled from SharePoint via the existing bucket walker
- Claude called with system/user split + cache_control
- Summary written to `akoya_request.wmkf_ai_summary`
- Keywords written to `akoya_request.wmkf_ai_dataextract` at `$.keywords`
- `wmkf_ai_run` row created with Lookup populated
- Second invocation on same request → `cacheHit: true`

### 5. (Optional) Author `phase-i.compliance` prompt row
Same mechanics as `phase-i.summary` but for format + content compliance check. Phase 0 version reads the full PDF again (no cache alignment with summary yet — Phase 2 fixes that via context blocks). If bandwidth allows, ship for May 1; otherwise defer to post-cycle.

### 6. (After Phase 0 ships) Remaining reconciliations from the plan file
- Global body rewrite of `docs/PROMPT_STORAGE_DESIGN.md` (banner is in place; full rename of field references still pending)
- Update `docs/BACKEND_AUTOMATION_PLAN.md` with "Wave 1 complete" note + prompt-reshape milestone
- Update `docs/POSTGRES_TO_DATAVERSE_MIGRATION.md` with Wave 1 ✅
- Set explicit retirement criterion in `docs/WAVE1_VERCEL_FLAG_ROLLOUT.md`
- Re-resolve `docs/STAGED_PIPELINE_IMPLEMENTATION_PLAN.md` pipeline-state storage question (recommend: akoya_request fields + wmkf_ai_run JSON, not a new Postgres table)
- Consider writing `docs/ARCHITECTURE_SPINE.md` as the canonical link-target so future design docs stop drifting

## Key Files Reference

| File | Purpose |
|------|---------|
| `docs/EXECUTOR_CONTRACT.md` | **The shared spec.** Both PA and Vercel executors build against this. One page. Whiteboard-ready. |
| `docs/PROMPT_STORAGE_DESIGN.md` | Design backdrop; now carries a reconciliation banner mapping old field names to actual |
| `/Users/gallivan/.claude/plans/ok-claude-connor-is-precious-dove.md` | Full record of the Session 109 reconciliation conversation — ~4× more detail than the committed docs |
| `lib/services/prompt-resolver.js` | Current Session 103 scratch-row resolver; needs extension or replacement for Phase 0 |
| `pages/api/phase-i-dynamics/summarize-v2.js` | Reference call site; will shrink to ~30 lines |
| `shared/config/prompts/phase-i-dynamics.js` | Current canonical prompt text; extract system vs. body for the seed |
| `scripts/inspect-ai-fields.js` | Pre-existing schema probe — `wmkf_ai_*` fields on `akoya_request` + `wmkf_ai_run` |
| `/tmp/verify-phase0-schema.mjs` | Session 109 probe — use as template for future schema verification |
| `lib/services/dynamics-service.js` | `getRecord` / `updateIfEmpty` — the Vercel executor's Dataverse client |
| `lib/services/graph-service.js` | `listFiles` / `getFileContent` — the Vercel executor's SharePoint client |
| `lib/utils/sharepoint-buckets.js` | `getRequestSharePointBuckets` — walks active + archive libraries for a request |
| `lib/utils/file-loader.js` | PDF/DOCX → text extraction (preprocess hint `pdf_to_text`) |

## Testing

```bash
# Re-run the Phase 0 schema probe (sandbox)
node /tmp/verify-phase0-schema.mjs

# (New in Session 110) Seed the first prompt row
node scripts/seed-phase-i-summary-prompt.js --target=sandbox --dry-run
node scripts/seed-phase-i-summary-prompt.js --target=sandbox --execute

# (New in Session 110) End-to-end test against a known request
# via the UI at http://localhost:3000/phase-i-dynamics with auth disabled

# Wave 1 parity tests (unchanged from Session 108, still safe to rerun)
node scripts/test-wave1-flag-dispatch.js
node scripts/verify-wave1-read-path.js --target=prod
```

## Session hand-off notes

- **Do the prompt row before the Executor code.** The Executor's debugging loop is much cleaner when there's a real row to fetch. Ship the seed script first, confirm the row is fetchable + the JSON round-trips cleanly, then build `executePrompt()` against a known-good seed.
- **Cycle deadline is real but narrow.** If Executor work is still shaky by 2026-04-30, fall back: keep `summarize-v2.js` using the scratch-row `PromptResolver` for the May cycle. The Executor work isn't wasted — Phase 1 (PA) will consume the same prompt rows either way. No data loss either way; the prompts for Phase I summaries would just use the Session 103 code path one more cycle.
- **`wmkf_ai_systemprompt` — no underscore in "systemprompt".** Easy to get wrong. Committed docs reflect the correct name.
- **Resist building context blocks in Phase 0.** Tempting given the architecture's clean, but it's Phase 2 by design. Summary + compliance running back-to-back without context blocks pays the token double-bill for a few hundred proposals — bounded cost, acceptable.
- **Connor is Phase 1+ owner.** Don't do any PA work in Vercel's name; the handoff to Connor is the echo-prompt test oracle + a fresh read of `docs/EXECUTOR_CONTRACT.md`.
- **Session-ending verification passed.** Re-probing schema end of session confirmed Connor's two additions are live; no blockers to beginning implementation.
