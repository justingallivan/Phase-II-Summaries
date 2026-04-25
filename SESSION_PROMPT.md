# Session 111 Prompt: Cycle ride-along + post-cycle Executor extensions

## Session 110 Summary

Phase 0 of the Executor + prompt-row architecture is **shipped on the Vercel side**, on time for the May 1 2026 cycle. Then a long second half: strategic clarifications from Justin reshaped the post-cycle roadmap, three design docs got written, one app got deprecated, and the development log was restructured to a milestone-only format. Eleven commits, all pushed to origin.

### What was completed

1. **CI fix** — `tests/integration/auth-routes.test.js` mock was missing `baseConfig` cache helpers; bumped `actions/checkout` and `actions/setup-node` to v5 to silence the Node 20 deprecation warning.
2. **`phase-i.summary` prompt row seeded** in `wmkf_ai_prompts` on **prod** Dynamics (row `d4201d8e-3840-f111-88b5-000d3a3065b8`). Note: there is no separate AI-work sandbox — the sandbox at `orgd9e66399.crm.dynamics.com` is for schema-migration work (Wave 1+) only. AI prompt rows + per-request writebacks are reversible enough to author directly in prod.
3. **`executePrompt()` Executor service** at `lib/services/execute-prompt.js`. 10-step contract; Phase 0 source kinds `dynamics`/`sharepoint`/`override`; target kinds `akoya_request`/`none`; guards `skip-if-populated`/`always-overwrite`; parseModes `raw`/`json`. Returns `{ parsed, runId, cacheHit, blocked, conflicts, writeResults, usage, meta }`.
4. **Executor Contract extended** (`docs/EXECUTOR_CONTRACT.md`) — output guards + step-4 preflight; `forceOverwrite` input; `usage` and `meta` returns; new "Notes for caller authors" section with explicit guidance for Connor on `forceOverwrite` defaults per parent-flow type.
5. **`summarize-v2.js` refactored** from 292 → 145 lines. Only Vercel-specific concerns remain. UI compatibility preserved.
6. **End-to-end smoke test verified** — three runs against prod request 993879 (write / block / cache-hit), then UI smoke test through `/phase-i-dynamics`. Justin verified both.
7. **Doc reconciliations** — `PROMPT_STORAGE_DESIGN.md` body rewrite (apply Session 109 renames), `BACKEND_AUTOMATION_PLAN.md` updated with Session 110 ship state, `POSTGRES_TO_DATAVERSE_MIGRATION.md` Wave 1 ✅, `WAVE1_VERCEL_FLAG_ROLLOUT.md` retirement criterion added.
8. **Concept Evaluator deprecated** — page + API + prompt moved to top-level `/_archived` directory (Next.js doesn't route it). Removed from `appRegistry`, `baseConfig` model map, admin name map, CLAUDE.md, and two utility scripts. New `_archived/README.md` documents the convention.
9. **Reviewer Finder architecture sketch** (`docs/REVIEWER_FINDER_FUTURE_ARCHITECTURE.md`) — reading the actual code shows it's NOT a tool-use agent. Three single-shot Claude calls + external API orchestration + DB lookups + SSE. Migrates cleanly to `executePrompt()` post-cycle without needing `executeAgent()`. ~1.5–2 sessions of mechanical refactor.
10. **Executor extensions plan** (`docs/EXECUTOR_EXTENSIONS_PLAN.md`) — design-only doc for the three post-cycle Executor changes that gate backend-automation use cases: multi-output PATCH coalescing (correctness fix), native PDF input (`preprocess: pdf_native`), Picklist target type (`valueMap`).
11. **Development log restructured** — `DEVELOPMENT_LOG.md` was 26 sessions out of date because it was nominally per-session but operationally only got entries at milestones. Made the milestone format explicit: top-of-file format note, Session 109 + 110 milestones backfilled, "Legacy chronological session log" divider before pre-2026-03-12 entries. Companion update to `~/.claude/skills/stop/skill.md` adds milestone-or-skip rule.
12. **Sandbox/prod terminology corrections** — I had been calling things "sandbox" when they were actually prod. Fixed in the new files: SESSION_PROMPT.md, DEVELOPMENT_LOG.md, seed/test scripts.

### Strategic clarifications from Justin (mid-session)

Three pieces of context that reshape Session 111+ priorities — all captured in memory:

1. **Phase I summary app winding down post-cycle** (`memory/project_phase_i_summary_app_winddown.md`) — backend automation owns intake-style flows; user-facing Phase I app demand collapses. Reviewer finder + Phase II tools + Executor/prompt-row infra get forward investment instead.

2. **Dynamics as staff-prompt ground truth** (`memory/project_dynamics_as_prompt_ground_truth.md`) — `wmkf_ai_prompt` should hold most/all staff-facing prompts (content readable/editable by non-technical staff). New prompts default there; migrate user-driven apps when touched. Discoverability principle: one table everyone can browse vs. scattered `.js`.

3. **App roadmap** (`memory/project_app_roadmap_2026-04-25.md`) — per-app status:
   - **Concept Evaluator:** deprecated this session
   - **Grant Reporting:** dual-caller (PA on report-arrival + Vercel UI) — needs Executor extensions before migration
   - **Integrity Screener:** dual-caller (PA on advancement + Vercel UI) — same
   - **Reviewer Finder:** top post-cycle priority, NOT an agent loop, sketch already written
   - **Phase II Writeup / Q&A:** stays as-is for May 1 cycle; high-touch / low-volume / late-cycle
   - **Peer Review Summarizer:** clean migration target when bandwidth allows
   - **Phase I summary app:** see winddown note

### Commits (11 ahead of origin → all pushed to origin/main)

- `107a73b` Fix CI: baseConfig mock + actions v5
- `f465799` Seed phase-i.summary + output guards in contract
- `b12282e` Phase 0 Executor + smoke test
- `56a170a` Refactor summarize-v2 (292 → 145 lines)
- `6945d6b` Doc reconciliations after Phase 0 ship
- `f47b849` Document Session 110 (initial draft of this doc — superseded)
- `618fc52` DEVELOPMENT_LOG.md: convert to milestone-log format
- `bd5656c` Correct sandbox/prod terminology in Session 110 artifacts
- `bb19027` Deprecate Concept Evaluator app
- `fc7a832` Reviewer Finder future architecture sketch
- `a523a9c` Executor extensions plan (post-cycle, design-only)

## Key state facts

- **Production is fully cycle-ready.** Prod Dynamics has the prompt row; prod Vercel deployment auto-deployed from Session 110 pushes and was confirmed Ready 2026-04-25. UI smoke-tested by Justin.
- **`phase-i.summary` row**: GUID `d4201d8e-3840-f111-88b5-000d3a3065b8` on `wmkf.crm.dynamics.com`. Single output → `wmkf_ai_summary`, parseMode raw, guard skip-if-populated. Sonnet 4 model, temperature 0.3, max_tokens 16384.
- **Concept Evaluator** is gone from the live app set. Grants in `user_app_access` for `concept-evaluator` left in place — harmless without an app, drop in a later cleanup pass.
- **DEVELOPMENT_LOG.md is now a milestone log.** New format documented at top of file. The `/stop` skill is updated with the milestone-or-skip rule. Most sessions don't get an entry.
- **Wave 1 flag flips still pending** (orthogonal — Justin to flip on his pace, see `docs/WAVE1_VERCEL_FLAG_ROLLOUT.md`).
- **Today's date: 2026-04-25.** Cycle arrives 2026-05-01 — 6 days.

## Potential next steps

### 1. Cycle ride-along (May 1 → mid-May)
Phase 0 is shipped and working. The cycle itself doesn't require any code work. What might come up:
- A user reports a 500 → check Vercel runtime logs for `executePrompt` failures
- An odd writeback edge case → run `node scripts/test-execute-prompt.js --restore ""` against the affected request to reset
- Connor has a question about the contract → point at `docs/EXECUTOR_CONTRACT.md`, especially the "Notes for caller authors" section
- Spend monitoring catches an anomaly → existing cron handles this

### 2. Post-cycle Executor extensions (the three from `docs/EXECUTOR_EXTENSIONS_PLAN.md`)
**Sequenced order:**
1. **Multi-PATCH coalescing** (~2 hrs) — correctness fix; unblocks any multi-output prompt. Do first.
2. **Picklist target type + `scripts/probe-picklist.js`** (~2 hrs) — small; needed for `phase-i.intake-check`.
3. **Native PDF input** (`preprocess: pdf_native`) (~half day to day) — biggest; budget compliance needs it.

After all three: author `phase-i.intake-check` (clerical + keywords + priority-fit), test, hand the prompt-row + parent flow to Connor for PA-trigger build.

### 3. Reviewer Finder migration (post-cycle, top priority)
See `docs/REVIEWER_FINDER_FUTURE_ARCHITECTURE.md`. Three prompt rows + route refactors. Explicitly NOT a tool-use agent migration — fits the existing Executor cleanly. Justin called this out as needed soon after May 1.

### 4. Lighter migrations when bandwidth allows
- Peer Review Summarizer (multi-call: analyze + questions). Migrate both prompts to Dynamics; route refactor calls `executePrompt` twice.
- Phase II Writeup / Q&A — high-touch app; only refactor outside cycle pressure. Multi-call.

### 5. Stretch / housekeeping
- Drop `concept-evaluator` rows from `user_app_access` (Postgres + Dataverse if Wave 1 flag is flipped)
- `docs/STAGED_PIPELINE_IMPLEMENTATION_PLAN.md` re-resolve pipeline-state storage (recommend `akoya_request` fields + `wmkf_ai_run` JSON, not a new Postgres table)
- `docs/ARCHITECTURE_SPINE.md` — write as canonical link target so future design docs stop drifting

## Key files reference

| File | Purpose |
|---|---|
| `lib/services/execute-prompt.js` | **The Executor.** 10-step Phase 0 implementation. |
| `docs/EXECUTOR_CONTRACT.md` | Shared spec; Connor builds PA-side `ExecutePrompt` against this. |
| `docs/EXECUTOR_EXTENSIONS_PLAN.md` | **Read first when starting post-cycle Executor work.** Design-only sketch of the three extensions. |
| `docs/REVIEWER_FINDER_FUTURE_ARCHITECTURE.md` | **Read first when starting Reviewer Finder migration.** Confirms NOT an agent loop. |
| `pages/api/phase-i-dynamics/summarize-v2.js` | Reference call site (~145 lines). |
| `scripts/seed-phase-i-summary-prompt.js` | Idempotent seed for `phase-i.summary` row on prod Dynamics. |
| `scripts/test-execute-prompt.js` | End-to-end smoke test. `--force-overwrite`, `--restore ""` options. |
| `_archived/` | Top-level dir for deprecated code (Concept Evaluator currently). |
| `DEVELOPMENT_LOG.md` | Milestone log (NOT per-session). Format note at top of file. |
| `MEMORY.md` (auto-memory) | Strategic context — winddown, ground-truth principle, app roadmap. |

## Testing

```bash
# Reproduce the cycle path locally
npm run dev
# → http://localhost:3000/phase-i-dynamics

# Re-run the executor smoke test
node scripts/test-execute-prompt.js                  # block-or-write
node scripts/test-execute-prompt.js --force-overwrite # force, expect cacheHit on rerun
node scripts/test-execute-prompt.js --restore ""      # reset wmkf_ai_summary

# Re-seed prompt row if it drifts
node scripts/seed-phase-i-summary-prompt.js --execute

# CI suite
npm run test:ci

# Vercel deployment status
vercel ls   # Production deploys auto from main; verify Ready
```

## Session hand-off notes

- **Don't start Executor extensions under cycle pressure.** They're real work and they're for backend automation, not for May 1. Cycle pressure encourages cutting corners; do these post-cycle. Plan in `docs/EXECUTOR_EXTENSIONS_PLAN.md` is the spec.
- **Connor brief.** When Phase 0 is fully through the cycle without issue, send Connor: a pointer to `docs/EXECUTOR_CONTRACT.md` (especially "Notes for caller authors"), `docs/EXECUTOR_EXTENSIONS_PLAN.md` (so he knows what's coming), and offer the echo-prompt test oracle for parity verification.
- **Strategic direction sticks.** Backend automation owns intake; user-facing apps get touched only at real value moments (Reviewer Finder is the next one). See memory.
- **`wmkf_ai_systemprompt`** has no underscore between "system" and "prompt". Easy to fat-finger.
- **Resist `executeAgent()` design** until a second concrete caller wants the same shape (Reviewer Finder doesn't need it; Dynamics Explorer chat could be a future migration if the abstraction proves clean).
