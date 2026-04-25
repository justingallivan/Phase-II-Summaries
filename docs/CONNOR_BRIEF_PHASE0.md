# Connor brief — Phase 0 Executor handoff

**Status:** Draft. Send after the May 1 2026 cycle has run cleanly through `phase-i.summary` for ~1 week with no production incidents. Phase 0 is shipped and working as of Session 110 (2026-04-25); this brief is what Justin sends Connor when it's confirmed stable.

Edit freely before sending — the structure below is just to make sure nothing important gets dropped.

---

## Subject

Phase 0 Executor — shipped + ready for PA-side build

## Body

Hi Connor,

Phase 0 of the prompt-row architecture is live on Vercel and has been running cleanly through the cycle. The shared Executor contract is ready for you to build the PA-side `ExecutePrompt` child flow against — both implementations follow the same 10-step spec, so caller flows can swap between them without behavioral changes.

**Read first:**

- **`docs/EXECUTOR_CONTRACT.md`** — the shared spec. Both Vercel `executePrompt()` and your PA `ExecutePrompt` child flow implement this. Pay special attention to:
  - **§ Notes for caller authors** — defaults for `forceOverwrite` per parent-flow type (status-change-driven vs. re-summarize batch). This is the part most likely to bite you.
  - **§ Output guards** (`skip-if-populated` / `always-overwrite`) — preflight happens at step 4, before Claude is called. A blocked run writes a `Needs Review` audit row and returns `{ blocked: true, conflicts: [...], runId }` without spending tokens.
  - **§ wmkf_ai_run logging contract** — every call (success / failure / blocked / cache hit) writes a row. Same shape on both sides.

- **`docs/EXECUTOR_EXTENSIONS_PLAN.md`** — design-only sketch of the three Phase 1 extensions queued for post-cycle work. Not in scope for what you'd build now, but worth knowing about so the PA child flow doesn't make decisions that conflict:
  1. Multi-output PATCH coalescing (correctness fix for prompts with multiple writeback targets)
  2. Native PDF input (`preprocess: pdf_native`) — needed for the budget-compliance use case
  3. Picklist target type (`valueMap`) — needed for `phase-i.intake-check`

**Production prompt rows already seeded** (all on `wmkf.crm.dynamics.com`, `wmkf_ai_prompts`):

- `phase-i.summary` — Vercel-side reference call site is `pages/api/phase-i-dynamics/summarize-v2.js`
- `reviewer-finder.analyze` and `reviewer-finder.score-candidates` — seeded ahead of route refactor; live routes still use legacy generators until post-cycle
- `peer-review-summarizer.analyze` and `peer-review-summarizer.questions` — same

The reviewer-finder and peer-review-summarizer rows are dormant on the Vercel side (route refactor is post-cycle work), but they're already authored and visible in Dynamics for staff edit/review. Useful as parity targets for your PA-side implementation if you want a second concrete prompt to test against.

**Parity verification — echo-prompt test oracle.** Happy to set up a tiny `wmkf_ai_prompt` row that just echoes its inputs as outputs. Both Executors should produce byte-identical `wmkf_ai_run` rows for the same inputs. Quick way to catch contract drift early. Let me know if you want it.

Anything ambiguous in the spec, just ping me — better to fix the contract than to have the two implementations diverge.

— Justin

---

## Pre-send checklist

- [ ] Cycle has been running for at least 5 working days without an `executePrompt` 500 in Vercel runtime logs
- [ ] No anomalies in `wmkf_ai_run` audit rows (skim the table for `Failed` status patterns)
- [ ] Justin has personally re-read `docs/EXECUTOR_CONTRACT.md § Notes for caller authors` so he can answer Connor's first follow-up question without rereading
- [ ] If any Phase 0 changes have shipped since 2026-04-25, the seeded prompt-row IDs and call-site references above are still accurate (`grep` the repo for `phase-i.summary` and verify)
