# Session 103 Prompt

## Session 102 Summary

Short planning session with Connor present. Answered two of the seven outstanding questions and updated design docs accordingly.

### What Was Completed

1. **Q1: `wmkf_prompt_template` table — Connor will create it**
   - Main blocker acknowledged; Connor taking action
   - Naming convention (`wmkf_` vs `wmkf_ai_` prefix) still TBD

2. **Q2: Full PA composition decided**
   - **Decision: Full PA composition** — PA owns the entire Claude call lifecycle for automated backend jobs, no Vercel dependency
   - Rationale: easier to debug PA-native flows; backend automation is mission-critical
   - PA will handle: trigger → prompt fetch → file extraction → Claude API call → retry/backoff → result write → `wmkf_ai_run` logging
   - Next.js `/api/execute-prompt` still needed for user-initiated features (test runs, overrides) but NOT called by PA flows
   - Updated `docs/PROMPT_STORAGE_DESIGN.md`, `docs/BACKEND_AUTOMATION_PLAN.md`, `docs/CONNOR_QUESTIONS_2026-04-15.md`

3. **Q3–Q7 not yet addressed** — session ended before reaching remaining questions

### Commits

- `{pending}` — Document full PA composition decision across design docs

## Deferred Items (Carried Forward)

From Session 98 — still open:

- **Reusable no-clobber helper** (`DynamicsService.updateIfEmpty(entitySet, guid, fieldName, value, { overwrite })`) — lift once a second user-initiated writeback ships
- **Surface existing writeback state in `lookup-grant`'s select** — so the frontend can warn upfront instead of paying a round-trip on submit
- **Register `/phase-i-dynamics` in main nav** once validated across a handful of requests
- **Wire `wmkf_ai_dataextract`** (structured JSON capture) — deferred until the capture shape is settled (will be partly addressed by the new `wmkf_output_schema` field)
- **Dynamics Identity Reconciliation (Steps 1–4)** — ~half day, plan at `docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md`
- **`prvCreateNote` on `annotation`** still not granted
- **Staged Pipeline Implementation** — plan at `docs/STAGED_PIPELINE_IMPLEMENTATION_PLAN.md`
- **CRM Email Send (Phase A)** — pending feedback on plan
- **Drop `Final Report Template.docx` into `public/templates/`**
- **`wmkf_ai_run` exclusion from Dynamics Explorer**
- **Stray file: `shared/config/prompts/expertise-finder.js.zip`**

## Pending Connor Responses

Full details in `docs/CONNOR_QUESTIONS_2026-04-15.md`:

1. ~~**Create `wmkf_prompt_template` table**~~ — Connor working on it (2026-04-16)
2. ~~**Hybrid vs. full PA composition**~~ — **Decided: Full composition** (2026-04-16)
3. **Template variable syntax** — `{{var}}` recommended; needs PA test to confirm double-braces in Memo fields don't trigger expression evaluation
4. **Field Set B timeline** — grant report fields on hold pending staff review
5. **Intermediate `akoya_request` fields** — 6 new fields for workflow chaining
6. **New `wmkf_ai_run` columns** — prompt override tracking, run-source choice
7. **PD expertise field on `systemuser`** — low priority, future

## Potential Next Steps

### 1. Answer remaining Connor questions (Q3–Q7)
Continue the Q&A session. Q3 (template syntax) and Q5 (intermediate fields) are the next most impactful.

### 2. Wait for `wmkf_prompt_template` table, then implement prompt resolver
Once Connor creates the table, build the Vercel-side resolver: OData read with cache, git-seed fallback, `/api/prompts/[app-key]/current` endpoint.

### 3. Validate Phase I Dynamics against more requests (carryover)
Run `/phase-i-dynamics` against 5–10 real requests to stress the SharePoint bucket walker + file loader path.

### 4. Ship Field Set C Compliance writeback (carryover)
Second user-initiated writeback surface. Fields are ready.

### 5. Batch Evaluation Tool (carryover)
Empirical testing against historical proposals.

### 6. Dynamics Explorer document listing fixes (carryover)
Integrate `sharepoint-buckets.js` into Dynamics Explorer tools.

## Key Files Reference

| File | Purpose |
|------|---------|
| `docs/CONNOR_QUESTIONS_2026-04-15.md` | Updated: Q1 in progress, Q2 decided |
| `docs/PROMPT_STORAGE_DESIGN.md` | Updated: full composition decision recorded |
| `docs/BACKEND_AUTOMATION_PLAN.md` | Updated: full composition confirmed, architecture note updated |

## Testing

No executable changes this session. All changes are documentation updates.

## Session hand-off notes

- No dev server running. Working tree will be clean after commit.
- Full PA composition is now locked in. When building the first PA flow, Connor will need patterns for: (1) Anthropic API retry/backoff in PA, (2) `cache_control` header assembly, (3) JSON schema validation for structured outputs. We should document these when the time comes.
- Q3 (template variable syntax) is low-risk but needs a quick PA test before we commit to `{{var}}`.
- Today's date: 2026-04-16.
