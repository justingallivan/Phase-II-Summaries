# Session 112 Prompt: Cycle ride-along + post-cycle Executor extensions

## Session 111 Summary

A short, mechanical session focused on **Plan A** prompt-row authoring for two more apps (Reviewer Finder, Peer Review Summarizer) plus light housekeeping. No live code was touched — all migrations remain dormant on the Vercel side until post-cycle refactors. Cycle still arrives 2026-05-01 (5 days from now); the explicit hand-off rule from Session 110 — *don't start route refactors under cycle pressure* — was respected.

### What was completed

1. **Reviewer Finder prompt rows seeded on prod Dynamics.** Architecture sketch was reconciled with the actual code: live pipeline has **two** Claude calls (not three as the sketch said) and emits delimited text (not JSON). Templates extracted to `shared/config/prompts/reviewer-finder-dynamics.js`; idempotent seed at `scripts/seed-reviewer-finder-prompts.js`.
   - `reviewer-finder.analyze` → `ecae2da2-e340-f111-88b4-000d3a306da2` (combined metadata + suggestions + DB queries; 4 vars; 4096 tokens)
   - `reviewer-finder.score-candidates` → `02fb0aa0-e340-f111-88b5-000d3a306d45` (per-batch relevance scoring; 2 vars; 1024 tokens)

2. **Peer Review Summarizer prompt rows seeded on prod Dynamics.** Same Plan A shape. The two unused functions in `peer-reviewer.js` (`createThemeSynthesisPrompt`, `createActionItemsPrompt`) are dead code and were skipped. Templates at `shared/config/prompts/peer-reviewer-dynamics.js`; seed at `scripts/seed-peer-review-summarizer-prompts.js`.
   - `peer-review-summarizer.analyze` → `c28c4dd8-e640-f111-88b5-000d3a306b0f` (combined SUMMARY + QUESTIONS pass; 3 vars; 2500 tokens)
   - `peer-review-summarizer.questions` → `1b1341dc-e640-f111-88b5-000d3a306d45` (fallback questions-only; 2 vars; 16384 tokens)

3. **Architecture doc reconciled.** `docs/REVIEWER_FINDER_FUTURE_ARCHITECTURE.md` rewritten to reflect 2-prompts-with-raw-parseMode reality (was: 3-prompts-JSON). Sequenced plan updated.

4. **`concept-evaluator` rows dropped from `user_app_access`.** Session 110 housekeeping leftover. 4 grants removed (Justin id=2, Beth id=5, cnoda id=9, shibler id=13). Postgres-only; Wave 1 Dataverse flag isn't flipped yet, so no Dataverse mirror cleanup needed. Script at `scripts/cleanup-concept-evaluator-grants.js`.

5. **Connor brief drafted** at `docs/CONNOR_BRIEF_PHASE0.md`. Includes pre-send checklist. Not yet sent — wait for ~5 working days of clean cycle runs before sending.

### Commits (2 ahead of origin → all pushed)

- `34e850e` Seed reviewer-finder.analyze + score-candidates prompt rows
- `3862593` Seed peer-review-summarizer prompts + housekeeping

### Pattern that emerged across both seeds

Three of three apps approached so far (`phase-i.summary`, both `reviewer-finder.*`, both `peer-review-summarizer.*`) have followed the **same Plan A shape**:

- Read live Claude callsite + prompt-template function
- Extract the prompt body verbatim into a `*-dynamics.js` template-string file with `{{var}}` placeholders
- Convert inline conditionals (`additionalNotes ? ... : ''`) into caller-formatted block variables
- Write idempotent seed script mirroring `seed-phase-i-summary-prompt.js`
- `parseMode: "raw"` + single `response_text` output + `target.kind: "none"` (route owns post-parse + persistence)
- All variables `placement: "user"` / `source: { kind: "override" }`
- Empty system prompt (preserves single-user-message behavior of legacy code)
- Dry-run, then execute, then verify

This shape is now repeatable. Future apps (Phase II Writeup, Q&A, etc.) follow the same recipe.

## Key state facts

- **Production is fully cycle-ready.** No code changed this session. `phase-i.summary` is still the only live Executor caller; `summarize-v2.js` is its reference call site.
- **Five `wmkf_ai_prompts` rows exist on prod** — `phase-i.summary` (live), `reviewer-finder.analyze`, `reviewer-finder.score-candidates`, `peer-review-summarizer.analyze`, `peer-review-summarizer.questions` (all dormant pending route refactor).
- **Concept Evaluator is fully cleaned up** — page archived (Session 110), grants removed (Session 111). Nothing left to do for it.
- **Today's date: 2026-04-25.** Cycle arrives 2026-05-01 — 5 days.
- **Wave 1 flag flips still pending.** Justin's call when to flip per `docs/WAVE1_VERCEL_FLAG_ROLLOUT.md`. Orthogonal to this session's work.

## Potential next steps

### 1. Cycle ride-along (May 1 → mid-May)
Phase 0 is shipped, smoke-tested, and stable. Cycle itself doesn't require code work. Likely interruptions:
- A user reports a 500 → check Vercel runtime logs for `executePrompt` failures
- An odd writeback edge case → run `node scripts/test-execute-prompt.js --restore ""` against the affected request to reset
- Connor has a question about the contract → point at `docs/EXECUTOR_CONTRACT.md`, especially the "Notes for caller authors" section
- Spend monitoring catches an anomaly → existing cron handles this

### 2. Send the Connor brief
After ~5 working days of clean cycle runs, follow the pre-send checklist in `docs/CONNOR_BRIEF_PHASE0.md` and send. Offer the echo-prompt test oracle if Connor wants parity verification.

### 3. Post-cycle Executor extensions (`docs/EXECUTOR_EXTENSIONS_PLAN.md`)
Sequenced order from Session 110:
1. **Multi-PATCH coalescing** (~2 hrs) — correctness fix; unblocks any multi-output prompt. Do first.
2. **Picklist target type + `scripts/probe-picklist.js`** (~2 hrs) — small; needed for `phase-i.intake-check`.
3. **Native PDF input** (`preprocess: pdf_native`) (~half day to day) — biggest; budget compliance needs it.

After all three: author `phase-i.intake-check` (clerical + keywords + priority-fit), test, hand the prompt-row + parent flow to Connor for PA-trigger build.

### 4. Reviewer Finder route refactor (post-cycle, top user-facing priority)
Prompts are seeded; this is now pure wiring. See `docs/REVIEWER_FINDER_FUTURE_ARCHITECTURE.md` for the sequenced plan. Steps:
1. Refactor `pages/api/reviewer-finder/analyze.js` to call `executePrompt('reviewer-finder.analyze', ...)` with the four override variables. Smallest call site; good warm-up.
2. Refactor `discover.js` / `claude-reviewer-service.js` to use `executePrompt('reviewer-finder.score-candidates', ...)` per batch. Streaming SSE stays at the route level; emit progress events between Executor calls.
3. Smoke test against a known proposal.
4. Delete the now-unused legacy `createAnalysisPrompt` / `createDiscoveredReasoningPrompt` from `shared/config/prompts/reviewer-finder.js` (parsers stay).

### 5. Peer Review Summarizer route refactor
Prompts seeded; route is `pages/api/process-peer-reviews.js`. Smaller and more linear than Reviewer Finder. Two `executePrompt` calls, one of which is conditional on the first's parse output. Good second migration target if Reviewer Finder feels too big.

### 6. Lighter migrations
- Phase II Writeup / Q&A — multi-call, high-touch app. Same Plan A pattern can author the prompts now if there's bandwidth.
- Anything else with prompts in `shared/config/prompts/*.js` follows the same recipe.

### 7. Stretch / housekeeping
- `docs/STAGED_PIPELINE_IMPLEMENTATION_PLAN.md` re-resolve pipeline-state storage (recommend `akoya_request` fields + `wmkf_ai_run` JSON, not a new Postgres table)
- `docs/ARCHITECTURE_SPINE.md` — write as canonical link target so future design docs stop drifting
- Optional: echo-prompt test oracle row (mentioned in Connor brief) — small `wmkf_ai_prompt` row that just echoes inputs as outputs, for cross-implementation parity verification

## Key files reference

| File | Purpose |
|---|---|
| `lib/services/execute-prompt.js` | **The Executor.** 10-step Phase 0 implementation. |
| `docs/EXECUTOR_CONTRACT.md` | Shared spec; Connor builds PA-side `ExecutePrompt` against this. |
| `docs/EXECUTOR_EXTENSIONS_PLAN.md` | **Read first when starting post-cycle Executor work.** Design-only sketch. |
| `docs/REVIEWER_FINDER_FUTURE_ARCHITECTURE.md` | **Read first when starting Reviewer Finder route refactor.** Updated this session. |
| `docs/CONNOR_BRIEF_PHASE0.md` | **Pre-drafted handoff message.** Send after cycle runs cleanly for ~5 working days. |
| `pages/api/phase-i-dynamics/summarize-v2.js` | Reference call site for `executePrompt()` (~145 lines). |
| `shared/config/prompts/phase-i-dynamics.js` | `phase-i.summary` template source of truth (live). |
| `shared/config/prompts/reviewer-finder-dynamics.js` | `reviewer-finder.*` template source of truth (dormant). |
| `shared/config/prompts/peer-reviewer-dynamics.js` | `peer-review-summarizer.*` template source of truth (dormant). |
| `scripts/seed-phase-i-summary-prompt.js` | Pattern reference for all prompt-row seeds. |
| `scripts/seed-reviewer-finder-prompts.js` | Idempotent seed for both reviewer-finder rows. |
| `scripts/seed-peer-review-summarizer-prompts.js` | Idempotent seed for both peer-review-summarizer rows. |
| `scripts/cleanup-concept-evaluator-grants.js` | One-shot cleanup; safe to re-run (no-op when already clean). |
| `scripts/test-execute-prompt.js` | End-to-end smoke test. `--force-overwrite`, `--restore ""` options. |
| `DEVELOPMENT_LOG.md` | Milestone log (NOT per-session). Session 111 did not warrant a milestone entry. |

## Testing

```bash
# Reproduce the cycle path locally
npm run dev
# → http://localhost:3000/phase-i-dynamics

# Re-run the executor smoke test
node scripts/test-execute-prompt.js                  # block-or-write
node scripts/test-execute-prompt.js --force-overwrite # force, expect cacheHit on rerun
node scripts/test-execute-prompt.js --restore ""      # reset wmkf_ai_summary

# Re-seed any prompt row if it drifts (all idempotent)
node scripts/seed-phase-i-summary-prompt.js --execute
node scripts/seed-reviewer-finder-prompts.js --execute
node scripts/seed-peer-review-summarizer-prompts.js --execute

# CI suite
npm run test:ci

# Vercel deployment status
vercel ls   # Production deploys auto from main; verify Ready
```

## Session hand-off notes

- **Don't start Executor extensions or route refactors under cycle pressure.** Carried forward from Session 110. Cycle is in 5 days. Even the dormant prompt rows seeded this session are fine; refactoring the routes that consume them is post-cycle work.
- **Plan A pattern is now the default** for any new Claude-using app: seed the prompt row in `wmkf_ai_prompt` first (ahead of any route refactor), let staff see it in Dynamics, then refactor the route post-cycle. Three apps in, the pattern is mechanical.
- **Don't seed the dead-code prompts** in `peer-reviewer.js` (`createThemeSynthesisPrompt`, `createActionItemsPrompt`). They're defined but never imported — confirmed via `grep`. If a future change wires them up, add them to `peer-reviewer-dynamics.js` + the seed script then.
- **`wmkf_ai_systemprompt`** has no underscore between "system" and "prompt". Easy to fat-finger.
- **Resist `executeAgent()` design** until a second concrete caller wants the same shape (Reviewer Finder doesn't need it; Dynamics Explorer chat could be a future migration if the abstraction proves clean).
- **No DEVELOPMENT_LOG.md entry this session.** It's a milestone log; Plan A seeding for two more apps follows an already-shipped pattern and isn't a milestone. The next milestone-worthy event is probably the cycle running cleanly through `phase-i.summary` (post-May-1 entry: "Phase 0 Executor delivered first cycle").
