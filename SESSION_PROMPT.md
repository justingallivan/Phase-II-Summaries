# Session 104 Prompt

## Session 103 Summary

Experimental session — prototyped the Dynamics-stored prompt pattern end-to-end against a scratch `wmkf_ai_run` record Connor set aside, measured the A/B effect of the system/user split, and in the process discovered that Sonnet 4.6's empirical cache minimum is ~2,048 tokens (not the docs-stated 1,024). Propagated findings across five planning docs and drafted an email to Connor summarizing what it means for his PA work.

### What Was Completed

1. **Dynamics Explorer caching fix (`0018804`... actually `a01d240`)**
   - Added `cache_control` marker + array-form system block to both `callClaude` and `callClaudeBatch` in `pages/api/dynamics-explorer/chat.js`
   - Wired `cacheCreationTokens` / `cacheReadTokens` through `logUsage` so the effect becomes visible in `api_usage_log`
   - Dynamics Explorer is the highest-volume endpoint (893 calls/yr) — previously paying full input cost on every call

2. **Phase I prompt-storage experiment (`0018804`)**
   - `lib/services/prompt-resolver.js` — new service. Fetches prompt from Dynamics, 5-min in-memory cache, `{{var}}` interpolation. Errors loudly on fetch failure (experiment-appropriate; production needs `.js` fallback)
   - `pages/api/phase-i-dynamics/summarize-v2.js` — parallel endpoint. Fetches prompt via resolver, uses system/user split, applies `cache_control`, logs `promptSource` to audit
   - `scripts/seed-phase-i-prompt.js` — idempotent writer for the scratch record (`wmkf_ai_runs` GUID `a03f77d9-913a-f111-88b5-000d3a3065b8`, system prompt → `wmkf_ai_notes`, user template → `wmkf_ai_rawoutput`)
   - `scripts/ab-phase-i-prompts.js` — bypasses endpoints to run N trials per variant; collects length/token/cache/latency stats
   - Frontend: "Use Dynamics-stored prompt (v2)" checkbox on `/phase-i-dynamics` with a debug panel on v2 results
   - Fixed extensionless imports in `lib/utils/{file-loader,sharepoint-buckets}.js` blocking raw node scripts

3. **Empirical findings from the A/B on a real Phase I proposal (Rife/Levin, 3 trials each)**
   - v2 (split) produces consistently tighter output: 5,210 vs 5,812 chars on average, all 3 v2 trials shorter than all 3 v1 trials
   - Same facts, same Keck verdict, same classification — tighter prose not less content
   - Cache did NOT fire for Phase I. System block (~1,650 tok) is below Sonnet 4.6's effective threshold
   - Follow-up binary search: 1,210-token prompts don't cache; 2,403-token prompts do. **Empirical Sonnet 4.6 minimum is ~2,048**, not the docs-stated 1,024
   - Memo field round-trip: 6,634 chars written + verified with no truncation (our 2,000-char cap in `logAiRun` is writer-side, not a Dynamics limit)

4. **Doc propagation of findings (`0146216`)**
   - `PROMPT_CACHING_PLAN.md` — 2,048 threshold documented, per-app implications table, image path asymmetry (PA-strips vs user-side-keeps), workflow chaining cache pattern with code shape, A/B findings section
   - `PROMPT_STORAGE_DESIGN.md` — Q1 marked resolved on Next.js side; new "Session 103 prototype findings" section; memo cap comment updated to reflect actual behavior; PA-inherits section flags 2,048 threshold
   - `CONNOR_QUESTIONS_2026-04-15.md` — Q3 marked partially verified with empirical evidence; Q5 points at extraction plan for future-state expansion
   - `BACKEND_AUTOMATION_PLAN.md` — Session 103 update block (three empirical findings + prototype + extraction plan pointer)
   - `PROPOSAL_CONTEXT_EXTRACTION_PLAN.md` — **new doc**. Forward-looking plan for single-phase cycle (two cycles out): initial Claude pass extracts ~15 structured fields into Dynamics so downstream deep-dive calls read ~1.5K tokens of curated context instead of 7K-token proposals. Compounds with expensive models + multi-LLM panels. ~42K tokens saved per advancing proposal × provider count

5. **Memory updates**
   - Added `project_proposal_context_extraction.md` with strategic framing
   - Added pointer under Strategic Direction in MEMORY.md

6. **Draft email to Connor** at `/tmp/connor-email-2026-04-17.md` summarizing findings and asking for the PA-side `{{var}}` check, memo cap matching, and the 2,048-token rule for his cache work

### Commits

- `a01d240` — Enable prompt caching on Dynamics Explorer; add caching plan
- `0018804` — Phase I prompt-storage experiment: Dynamics-backed prompts with A/B
- `0146216` — Propagate Session 103 findings across planning docs

## Deferred Items (Carried Forward)

From Session 98 — still open:

- **Reusable no-clobber helper** (`DynamicsService.updateIfEmpty(entitySet, guid, fieldName, value, { overwrite })`)
- **Surface existing writeback state in `lookup-grant`'s select** — avoid round-trip on submit
- **Register `/phase-i-dynamics` in main nav** once validated across more requests
- **Wire `wmkf_ai_dataextract`** (now has a defined capture shape — see `PROPOSAL_CONTEXT_EXTRACTION_PLAN.md`)
- **Dynamics Identity Reconciliation (Steps 1–4)** — ~half day, plan at `docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md`
- **`prvCreateNote` on `annotation`** still not granted
- **Staged Pipeline Implementation** — plan at `docs/STAGED_PIPELINE_IMPLEMENTATION_PLAN.md`
- **CRM Email Send (Phase A)** — pending feedback on plan
- **Drop `Final Report Template.docx` into `public/templates/`**
- **`wmkf_ai_run` exclusion from Dynamics Explorer**
- **Stray file: `shared/config/prompts/expertise-finder.js.zip`**

New from Session 103:
- **Silent `.js` fallback** in `PromptResolver` for production (currently errors loudly — experiment-appropriate only)
- **`PromptResolver` version tracking** — when `wmkf_prompt_template` ships, the scratch record has no version column; need to wire the real version field into `wmkf_ai_run.wmkf_ai_promptversion`
- **Repeat the A/B on a PDF with images** — we only have measurements for the text-only (.docx) path; user-side vision-input path is untested

## Pending Connor Responses

Updated in `docs/CONNOR_QUESTIONS_2026-04-15.md`:

1. ~~**Create `wmkf_prompt_template` table**~~ — Connor working on it (2026-04-16)
2. ~~**Hybrid vs. full PA composition**~~ — Decided: Full composition (2026-04-16)
3. **Template variable syntax** — `{{var}}` **verified on Next.js side**; PA-side 10-min test still pending. Connor: create a test Memo with `{{name}}`, read via PA, confirm passes through unmodified
4. **Field Set B timeline** — grant report fields on hold
5. **Intermediate `akoya_request` fields** — 6 new fields for v1 workflow chaining (expansion plan in `PROPOSAL_CONTEXT_EXTRACTION_PLAN.md`)
6. **New `wmkf_ai_run` columns** — prompt override tracking, run-source choice
7. **PD expertise field on `systemuser`** — low priority, future

New asks of Connor (in the draft email):
- PA-side `{{var}}` test (10 min)
- Match `wmkf_prompt_template.wmkf_body` memo cap to `wmkf_ai_rawoutput` (1M chars)
- Apply the 2,048-token rule when building PA `cache_control` logic

## Potential Next Steps

### 1. Send the Connor email
Draft is at `/tmp/connor-email-2026-04-17.md`. Review tone and detail, then send.

### 2. Add the `.js` fallback to PromptResolver
Production-harden the resolver so Dynamics outage doesn't break the v2 path. Pattern: try Dynamics → on failure, fall back to `.js` with a logged warning. Keeps the experiment loud in dev; reliable in prod.

### 3. Run A/B on a PDF with figures
Current A/B is text-only (.docx). Repeat against a 5-page PDF with figures to measure the user-side vision-input profile. This is the scenario that most benefits from caching in chained workflows.

### 4. Validate `/phase-i-dynamics` v2 against 5–10 more requests
Mix active + archived SharePoint libraries to stress the bucket walker. Confirm v2 output quality holds beyond the single Rife/Levin trial.

### 5. Verify cache fix on Dynamics Explorer
The caching fix shipped this session. After a few real chat sessions, re-query `api_usage_log` for `dynamics-explorer` rows with non-zero `cache_read_tokens` to confirm it's firing.

### 6. Field Set C Compliance writeback (carryover)
Second user-initiated writeback surface. Fields ready. One of the v1 prompt rows.

### 7. Dynamics Explorer document listing fixes (carryover)
Wire `sharepoint-buckets.js` into `chat.js` tools.

## Key Files Reference

| File | Purpose |
|------|---------|
| `lib/services/prompt-resolver.js` | **New.** Fetches prompts from Dynamics, caches, interpolates `{{var}}`. Ready to swap `_fetchFromDynamics` when `wmkf_prompt_template` ships |
| `pages/api/phase-i-dynamics/summarize-v2.js` | **New.** Parallel endpoint using the resolver + system/user split |
| `scripts/seed-phase-i-prompt.js` | **New.** Writes system + user template to the scratch record |
| `scripts/ab-phase-i-prompts.js` | **New.** Direct A/B test runner (bypasses endpoints); run with `--request <guid> --file <filename> --trials N` |
| `docs/PROPOSAL_CONTEXT_EXTRACTION_PLAN.md` | **New.** Future-state field extraction plan for single-phase cycle |
| `docs/PROMPT_CACHING_PLAN.md` | Updated with 2,048 threshold, chaining pattern, image path asymmetry |
| `docs/PROMPT_STORAGE_DESIGN.md` | Updated with prototype findings section |
| `/tmp/connor-email-2026-04-17.md` | Draft email summarizing findings for Connor |

## Testing

No new automated tests. Manual testing:
- v1 vs v2 A/B: `node scripts/ab-phase-i-prompts.js --request <guid> --file "<filename>" --trials 3`
- UI: `/phase-i-dynamics`, toggle "Use Dynamics-stored prompt (v2)" checkbox
- Dev server already running at http://localhost:3000 (started mid-session)

## Session hand-off notes

- Working tree clean after three commits. Two ahead of origin until push.
- Scratch record `a03f77d9-913a-f111-88b5-000d3a3065b8` has the Phase I v2 prompt seeded (ASCII-normalized — em-dashes and en-dashes stripped for apples-to-apples A/B). If Connor's real table ships, this record can be retired.
- The 2,048-token cache threshold finding is the most consequential takeaway — affects all prior assumptions in `PROMPT_CACHING_PLAN.md` about which apps benefit. The doc reflects this but it's worth keeping in mind for planning.
- `PromptResolver` currently throws on Dynamics fetch failure. Intentional for experiment visibility. Before production, add `.js` fallback.
- Today's date: 2026-04-17.
