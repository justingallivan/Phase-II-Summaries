# Session 102 Prompt

## Session 101 Summary

Documentation-only session. Reviewed all recent design docs to compile questions for Connor, updated docs to reflect two status changes (SharePoint write access granted, PA PDF preprocessing confirmed), and produced a standalone questions document for Connor's review.

### What Was Completed

1. **Connor questions document (`docs/CONNOR_QUESTIONS_2026-04-15.md`)**
   - Consolidated 7 questions/action items from across `PROMPT_STORAGE_DESIGN.md`, `WORKFLOW_CHAINING_DESIGN.md`, `DYNAMICS_AI_FIELDS_SPEC_v3_cn.md`, `DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md`, and `BACKEND_AUTOMATION_PLAN.md`
   - Prioritized: Q1 (create `wmkf_prompt_template` table) and Q2 (hybrid vs. full PA composition) are the main blockers
   - Added practical context for Q2 (hybrid vs. full composition — now reframed given PA's PDF capability) and Q3 (template variable syntax — specific PA expression concern + suggested test)

2. **SharePoint write access resolved**
   - IT granted `Sites.ReadWrite.Selected` on akoyaGO site (2026-04-15)
   - Updated `docs/DYNAMICS_AI_FIELDS_SPEC_v3_cn.md`, `docs/PENDING_ADMIN_REQUESTS.md`, `SESSION_PROMPT.md` deferred items
   - Updated memory file to reflect resolved status

3. **PA PDF preprocessing capability documented**
   - Connor confirmed PA has native PDF preprocessing — removes the PDF extraction dependency on Next.js
   - Updated `docs/PROMPT_STORAGE_DESIGN.md`: "What PA inherits" list, hybrid-vs-full analysis (added update note), full-composition sequence diagram (removed Next.js extract-text participant), diagram analysis text
   - Updated `docs/BACKEND_AUTOMATION_PLAN.md`: architecture note reflects shifted balance
   - Updated `docs/CONNOR_QUESTIONS_2026-04-15.md` Q2: reframed from "hybrid unless blocker" to "balanced decision — depends on PA-side complexity comfort"
   - Key impact: full composition is now genuinely self-contained (zero Vercel dependency). Hybrid still has advantages (single codepath, easier JSON validation/retry) but the gap has narrowed.

### Commits

- `{pending}` — Update docs for SharePoint write access granted and PA PDF capability; add Connor questions document

## Deferred Items (Carried Forward)

From Session 98 — still open:

- **Reusable no-clobber helper** (`DynamicsService.updateIfEmpty(entitySet, guid, fieldName, value, { overwrite })`) — lift once a second user-initiated writeback ships
- **Surface existing writeback state in `lookup-grant`'s select** — so the frontend can warn upfront instead of paying a round-trip on submit
- **Register `/phase-i-dynamics` in main nav** once validated across a handful of requests
- **Wire `wmkf_ai_dataextract`** (structured JSON capture) — deferred until the capture shape is settled (will be partly addressed by the new `wmkf_output_schema` field)
- **Dynamics Identity Reconciliation (Steps 1–4)** — ~½ day, plan at `docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md`
- **`prvCreateNote` on `annotation`** still not granted
- **Staged Pipeline Implementation** — plan at `docs/STAGED_PIPELINE_IMPLEMENTATION_PLAN.md`
- **CRM Email Send (Phase A)** — pending feedback on plan
- **Drop `Final Report Template.docx` into `public/templates/`**
- **`wmkf_ai_run` exclusion from Dynamics Explorer**
- **Stray file: `shared/config/prompts/expertise-finder.js.zip`**

## Pending Connor Responses

Full details in `docs/CONNOR_QUESTIONS_2026-04-15.md`:

1. **Create `wmkf_prompt_template` table** — blocks prompt storage work. Naming convention question: `wmkf_` vs `wmkf_ai_` prefix.
2. **Hybrid vs. full PA composition** — architecture decision, now more balanced since PA can handle PDF extraction natively. Remaining question: comfort with retry logic, JSON validation, `cache_control` assembly in PA.
3. **Template variable syntax** — `{{var}}` recommended; needs quick PA test to confirm double-braces in Memo field values don't trigger expression evaluation.
4. **Field Set B timeline** — grant report fields on hold pending staff review.
5. **Intermediate `akoya_request` fields** — 6 new fields for workflow chaining. Naming question same as Q1.
6. **New `wmkf_ai_run` columns** — prompt override tracking, run-source choice.
7. **PD expertise field on `systemuser`** — low priority, future.

## Potential Next Steps

### 1. Wait for Connor's responses on Q1–Q3, then implement
Q1 (table creation) and Q2 (composition decision) unblock the prompt storage implementation. Nothing on the Vercel side can move until the table exists.

### 2. Validate Phase I Dynamics against more requests (carryover)
Run `/phase-i-dynamics` against 5–10 real requests — mix active + migrated libraries — to stress the SharePoint bucket walker + file loader path and confirm writeback lands cleanly. Also useful as the baseline for the "target-state `phase-i-writeup` produces the same prose summary" A/B check.

### 3. Ship Field Set C Compliance writeback (carryover)
Second user-initiated writeback surface. Fields are ready (`akoya_submissionaccepted`, `wmkf_ai_complianceissues`, `wmkf_ai_compliancesummary`). Now one of the three v1 prompt rows.

### 4. Build the prompt resolver abstraction (can stub ahead of Dynamics)
The resolver interface (`/api/prompts/[app-key]/current`) can be designed and stubbed with mock responses. Pattern-aware: Pattern A + dual-caller apps read from Dynamics (with cache + git-seed fallback), Pattern B + C apps read from `.js`.

### 5. Batch Evaluation Tool (Phase 1 Priority — carryover)
Empirical testing against historical proposals to answer: does consolidating extractions hurt per-field quality? Does the target-state prompt match the defensive-extraction prompt's outputs?

### 6. Dynamics Explorer document listing fixes (carryover)
Plan at `docs/DYNAMICS_EXPLORER_DOCUMENT_LISTING_PLAN.md`. Now that `sharepoint-buckets.js` exists, the `listDocuments` and `searchDocuments` tools in `chat.js` can use it. Partially done in Session 96 for Grant Reporting; Dynamics Explorer tools still need the update.

## Key Files Reference

| File | Purpose |
|------|---------|
| `docs/CONNOR_QUESTIONS_2026-04-15.md` | **New.** Consolidated questions for Connor with context |
| `docs/PROMPT_STORAGE_DESIGN.md` | Updated: PA PDF capability, rebalanced hybrid-vs-full analysis |
| `docs/BACKEND_AUTOMATION_PLAN.md` | Updated: architecture note reflects PA PDF capability |
| `docs/DYNAMICS_AI_FIELDS_SPEC_v3_cn.md` | Updated: SharePoint write access resolved |
| `docs/PENDING_ADMIN_REQUESTS.md` | Updated: SharePoint write access marked done |

## Testing

No executable changes this session. All changes are documentation updates.

## Session hand-off notes

- No dev server running at session end. Working tree clean after commit, main up to date with origin/main.
- The hybrid-vs-full composition question is now genuinely open — previously hybrid was the clear recommendation; now it's a balanced trade-off. Connor's comfort level with PA-side retry/JSON-validation complexity is the deciding factor.
- Today's date: 2026-04-15.
