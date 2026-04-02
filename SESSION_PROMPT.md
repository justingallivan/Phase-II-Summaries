# Session 94 Prompt

## Session 93 Summary

Added a Devil's Advocate pass to the Virtual Review Panel and improved progress feedback with elapsed timers and server-side heartbeats.

### What Was Completed

1. **Devil's Advocate Pass**
   - New `createDevilsAdvocatePrompt` — adversarial prompt that asks one model to find the strongest reasons NOT to fund. Structured JSON output: primaryConcern, failureScenario, challengedAssumptions, competitiveWeaknesses, budgetAndTimeline, bestCounterargument, verdictIfSkeptical
   - New `_runDevilsAdvocate` method in `PanelReviewService` — runs after structured review, before synthesis. Picks a random provider from the selected panel to avoid systematic bias
   - Updated `createPanelSynthesisPrompt` to accept DA result as a labeled "skeptical review" with `devilsAdvocateSummary` in synthesis output. Explicitly instructs synthesis not to average DA into panel ratings
   - Frontend: checkbox toggle ("Include devil's advocate"), red-tinted results card with all DA fields, DA summary in PanelSummary component
   - Both Markdown and DOCX exports include DA summary from synthesis + full DA review details
   - API route passes `includeDevilsAdvocate` through to service

2. **Progress Timers & Heartbeats**
   - Per-provider elapsed timer: `useElapsedTimer` hook ticks every second on in-progress provider cards, showing `Xs elapsed...`
   - Overall elapsed timer: `OverallTimer` component in progress section header shows `Xm XXs elapsed` during processing, `Total: Xm XXs` when done
   - Server-side heartbeats: 15-second `provider_heartbeat` events during all LLM calls (`_runStage`, `_runDevilsAdvocate`, `_runSynthesis`) to keep SSE connection alive and populate event log
   - Removed `animate-pulse` from in-progress cards since ticking timer is clearer

### Commits
- `50875e1` Add Devil's Advocate pass and progress timers to Virtual Review Panel

## Deferred Items (Carried Forward)

- **Staged Pipeline Implementation** — plan saved at `docs/STAGED_PIPELINE_IMPLEMENTATION_PLAN.md`, not yet scheduled
- **CRM Email Send (Phase A)** — pending feedback on plan (docs/CRM_EMAIL_SEND_PLAN.md)
- **Backend Automation Plan** — requires multi-stakeholder input before implementation (docs/BACKEND_AUTOMATION_PLAN.md)
- Build Proposal Picker component for Dynamics integration
- next-auth v5 migration (still in beta)
- Re-enable coverage thresholds when test coverage reaches 70%/80%
- Code hardening: upload attribution, legacy upload-file.js cleanup

## Potential Next Steps

### 1. Test Devil's Advocate End-to-End
Run several panel reviews with DA enabled and verify:
- DA provider is chosen randomly across runs
- DA output is substantive and specific (not generic skepticism)
- Synthesis integrates DA concerns appropriately without over-weighting them
- Exports render DA sections correctly in both MD and DOCX

### 2. Begin Staged Pipeline Implementation (Phase 1)
Start with the Fit Screener app — the simplest new app:
- V25 database migration for `pipeline_proposals` table
- Fit screening prompt with 6-item checklist
- `PipelineService` with CRUD + `runFitScreening`
- Page + API route following existing app patterns

### 3. Evaluate Review Quality with Stakeholders
Share updated panel reviews (with intelligence sections + devil's advocate in exports) with CSO and colleagues for feedback on:
- Whether the DA pass adds useful adversarial pressure
- Whether the progress timers improve the experience
- Whether the overall review output is actionable for funding decisions

### 4. Streaming LLM Responses
Currently all LLM calls are non-streaming (wait for full response). Could switch to streaming APIs for real-time token output — more complex but would give true real-time progress instead of heartbeat approximation.

## Key Files Reference

| File | Purpose |
|------|---------|
| `pages/virtual-review-panel.js` | Frontend — config, progress timers, DA display, exports |
| `lib/services/panel-review-service.js` | Orchestration — Stage 0/1/2/DA/synthesis pipeline, heartbeats |
| `shared/config/prompts/virtual-review-panel.js` | All prompts — DA prompt, updated synthesis prompt |
| `pages/api/virtual-review-panel.js` | API route — passes includeDevilsAdvocate option |
| `docs/STAGED_REVIEW_PIPELINE.md` | Pipeline spec — DA pass described in Stage 3 section |

## Testing

```bash
npm run dev                              # Start dev server
npm run build                            # Verify no build errors
npm test                                 # Run all tests
```
