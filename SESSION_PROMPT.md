# Session 101 Prompt

## Sessions 99–100 Summary

Design sessions — no production code changed. Worked through prompt storage strategy end-to-end: where prompts should live now that PowerAutomate-triggered backend jobs are on the horizon, how Next.js keeps reading them without drift, how versioning/audit/editing/safety should work. Session 99 (CLI) framed the problem and landed the core decisions; Session 100 (browser Claude Code, so Mermaid diagrams rendered inline) expanded from 8 to 22 locked-in decisions, mapped every current app into a migration pattern (A / B / C / dual-caller), narrowed v1 scope to three prompt rows, and extracted the "ingest once, chain downstream" token-efficiency principle into its own companion doc. Hybrid composition is now leaning ahead of full-PA composition — the list of things PA would have to re-implement (PDF extraction, Anthropic retry, prompt caching, JSON schema validation) turned out to be heavy enough that routing Claude calls through a thin Next.js `/api/execute-prompt` endpoint is the more pragmatic path. Everything is committed and pushed; the next session starts with specs ready for schema + first implementation.

### What Was Completed

1. **Prompt storage design doc (`b58d159`, `4697101`, `3bbf70a`)**
   - Single authoritative spec at `docs/PROMPT_STORAGE_DESIGN.md` covering: 9 guiding principles, 22 locked-in decisions, app pattern taxonomy (A / B / C / dual-caller), full app inventory with per-app migration verdicts, `wmkf_prompt_template` schema sketch, user-facing prompt visibility + per-session override design, multi-tier editor safety model (draft/publish + structural lint + pre-publish test-run + append-only rollback), draft/publish state machine (Mermaid), full-vs-hybrid composition sequence diagrams (Mermaid), and the four original open questions now resolved into decisions.
   - v1 scope deliberately narrow: **three prompt rows** — `phase-i-writeup`, `phase-ii-writeup`, `compliance-field-set-c`. Pattern B/C prompts stay in `.js` indefinitely (no PA driver). Q&A sub-prompts stay in `.js` for v1.
   - Retirement decisions baked in: Concept Evaluator (concepts workflow retired), Batch Phase I/II Summaries UIs (backend will loop the single-writeup prompt; batch apps only existed because programmatic Dynamics access didn't), Multi-Perspective Evaluator (playground, out of scope).
   - Dual-caller pattern codified: one prompt row serves both PA auto-drafts on status change AND Vercel interactive refinement; both callers log `wmkf_ai_run` with the same `wmkf_ai_promptversion`.

2. **Workflow chaining companion doc (`f8f9568`)**
   - `docs/WORKFLOW_CHAINING_DESIGN.md` captures the "ingest-once, chain-downstream" principle as a first-class design concern. Not just token efficiency — forces explicit thinking about what data a workflow produces and consumes.
   - Adds a new required column to `wmkf_prompt_template`: `wmkf_output_schema` (JSON, declares fields a prompt produces + their Dynamics targets). Extends `wmkf_variables` entries with optional `source:` references to upstream outputs so downstream prompts don't re-read the proposal.
   - Worked example: Phase I writeup becomes the canonical "ingest" call producing `wmkf_ai_summary` + `wmkf_keywords` + `wmkf_methodologies` + `wmkf_risk_flags` + `wmkf_team_info` + others in one hit. Downstream compliance / reviewer matching / portfolio analytics / PD assignment consume structured fields, not the PDF. Order-of-magnitude token savings for a 5-step chain on a 50k-token proposal.
   - New Dynamics schema work surfaced: intermediate fields on `akoya_request` (`wmkf_keywords`, `wmkf_methodologies`, `wmkf_risk_flags`, `wmkf_team_info`, `wmkf_budget_summary`, `wmkf_timeline`). Connor's domain, needs to be sequenced alongside `wmkf_prompt_template` creation.

3. **`docs/BACKEND_AUTOMATION_PLAN.md` updated (`f8f9568`)**
   - Added Session 100 update note at the top flagging that Phase 1 prompt development should be designed with the storage schema in mind, and Phase 4 PA flow construction reads prompts from the Dynamics table rather than hard-coded text.
   - Architecture section flagged that the original "PA calls Anthropic directly" variant is being revisited — hybrid composition routes Claude calls through Next.js `/api/execute-prompt` to reuse file extraction, retry/backoff, prompt caching, and JSON-schema validation.

4. **`CLAUDE.md` updated (`f8f9568`)**
   - Both new design docs registered in the Extended Documentation table.

### Commits

- `b58d159` Draft prompt storage design doc for browser handoff (Session 99, CLI)
- `4697101` Sketch draft/publish state machine and full-vs-hybrid sequence diagrams (Session 100, browser)
- `3bbf70a` Capture app patterns, dual-caller, and sharpened v1 scope in design doc (Session 100, browser)
- `f8f9568` Capture Session 100 prompt-storage decisions across planning docs (Session 100, browser)
- `42952ab` Merge: prompt storage and workflow chaining design (Session 99-100) — `--no-ff` merge commit grouping the design work

## Deferred Items (Carried Forward)

From Session 98 — still open, no movement this session:

- **Reusable no-clobber helper** (`DynamicsService.updateIfEmpty(entitySet, guid, fieldName, value, { overwrite })`) — lift once a second user-initiated writeback ships
- **Surface existing writeback state in `lookup-grant`'s select** — so the frontend can warn upfront instead of paying a round-trip on submit
- **Register `/phase-i-dynamics` in main nav** once validated across a handful of requests
- **Wire `wmkf_ai_dataextract`** (structured JSON capture) — deferred until the capture shape is settled (will be partly addressed by the new `wmkf_output_schema` field)
- **Dynamics Identity Reconciliation (Steps 1–4)** — ~½ day, plan at `docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md`
- **`prvCreateNote` on `annotation`** still not granted
- **SharePoint `Sites.ReadWrite.Selected`** email drafted but not sent
- **Staged Pipeline Implementation** — plan at `docs/STAGED_PIPELINE_IMPLEMENTATION_PLAN.md`
- **CRM Email Send (Phase A)** — pending feedback on plan
- **Drop `Final Report Template.docx` into `public/templates/`**
- **`wmkf_ai_run` exclusion from Dynamics Explorer**
- **Stray file: `shared/config/prompts/expertise-finder.js.zip`**

## Potential Next Steps

### 1. Hand the storage schema to Connor for Dynamics creation
`docs/PROMPT_STORAGE_DESIGN.md` has a complete `wmkf_prompt_template` schema sketch (name, version, body, model, maxtokens, temperature, status, is_current, variables, output_schema, notes, audit fields). Next move is Connor creating the table in Dynamics with the memo caps raised (same pattern as `wmkf_ai_run.rawOutput`). While that's in flight, the intermediate `akoya_request` fields from the workflow-chaining doc (`wmkf_keywords`, `wmkf_methodologies`, etc.) can be scoped in parallel. Nothing on the Vercel side can move until the table exists.

### 2. Build the prompt resolver abstraction
Even ahead of Dynamics availability, the resolver interface (`/api/prompts/[app-key]/current`) can be designed and stubbed. It's pattern-aware: Pattern A + dual-caller apps read from Dynamics (with cache + git-seed fallback), Pattern B + C apps read from `.js`. Same interface, different source. This is the load-bearing piece of the storage design — once it exists, universal prompt visibility + per-session overrides drop in on top of it. Worth building with a mock Dynamics response so it's ready the day the table is live.

### 3. Seed the first three prompt rows from existing `.js`
The v1 set — `phase-i-writeup`, `phase-ii-writeup`, `compliance-field-set-c` — needs to be derived from current `shared/config/prompts/*.js`. The target-state prompts drop most of the ~20% "defensive extraction" layer because structured callers pass `institution`, `pi_name`, etc. as known variables. That's a real refactor, not a copy-paste. Good excuse to write the `phase-i-writeup` target-state prompt as an "ingest" prompt producing the full structured-output set from the workflow-chaining doc. Needs testing against historical proposals to confirm chained extractions don't degrade individual-field quality (honest caveat from the chaining doc — consolidating 8 extractions into one call sometimes hurts).

### 4. Validate Phase I Dynamics against more requests (carryover)
Still worthwhile before Session 99–100's theoretical work turns into concrete `phase-i-writeup` seed content. Run `/phase-i-dynamics` against 5–10 real requests — mix active + migrated libraries — to stress the SharePoint bucket walker + file loader path and confirm writeback lands cleanly. Also useful as the baseline for the "target-state `phase-i-writeup` produces the same prose summary" A/B check when the ingest prompt is rewritten.

### 5. Ship Field Set C Compliance writeback
Second user-initiated writeback surface. Now arguably higher-priority than before because it's one of the three v1 prompt rows — shipping the feature and writing the Dynamics row happen close to simultaneously. Fields are ready (`akoya_submissionaccepted` existing, `wmkf_ai_complianceissues` Memo JSON, `wmkf_ai_compliancesummary` Memo).

### 6. Batch Evaluation Tool (Phase 1 Priority — carryover)
Unchanged from 95/96/97/98. Even more relevant now — the prompt storage + chaining design surfaces several questions ("does consolidating extractions hurt per-field quality? does the target-state prompt match the defensive-extraction prompt's outputs?") that can only be answered empirically against historical proposals.

## Key Files Reference

| File | Purpose |
|------|---------|
| `docs/PROMPT_STORAGE_DESIGN.md` | **Primary deliverable.** Full design — guiding principles, 22 decisions, schema, app patterns, state machine, sequence diagrams, editor safety tiers |
| `docs/WORKFLOW_CHAINING_DESIGN.md` | Companion doc. Ingest-once / chain-downstream principle. New column (`wmkf_output_schema`) + new `akoya_request` intermediate fields |
| `docs/BACKEND_AUTOMATION_PLAN.md` | Original architecture plan; Session 100 update note flags which sections are being revisited |
| `CLAUDE.md` | Extended Documentation table registers both new design docs |

## Testing

No executable changes this session. Validation happens when implementation starts:

```bash
# When the resolver exists (stubbed or real):
curl http://localhost:3000/api/prompts/phase-i-writeup/current | jq

# When the first prompt row is seeded:
node scripts/seed-prompt-templates.js --prompt phase-i-writeup --dry-run
```

## Session hand-off notes

- Two sessions in one handoff: Session 99 (CLI, this terminal) framed the problem and wrote the initial doc; Session 100 (browser Claude Code on the same repo) expanded it with Mermaid diagrams and the full decision set. Both sessions' work is in the merge commit `42952ab`.
- The browser-session approach worked well for this kind of visual/conceptual design work — consider repeating the CLI-frame-then-browser-expand pattern for future architecture conversations (prompt resolver shape, dashboard wireframes).
- No dev server is running at session end. No uncommitted changes. Working tree clean, main up to date with origin/main.
- Today's dates this session: 2026-04-14 (Session 99 CLI) and 2026-04-15 (Session 100 browser, per commit timestamps + in-doc notes).
