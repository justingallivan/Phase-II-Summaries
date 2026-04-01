# Session 92 Prompt

## Session 91 Summary

Major feature session for Virtual Review Panel — implemented Stage 0 pre-review intelligence pass, rebalanced all review prompts per CSO feedback, fixed several bugs, and added frontend UI for new features.

### What Was Completed

1. **Prompt Rebalancing (CSO Feedback)**
   - Rewrote Stage 1 and Stage 2 prompts to balance critique with upside evaluation
   - Added "ABOUT THE KECK FOUNDATION'S APPROACH" section embracing risk-tolerant philosophy
   - Added RATING CALIBRATION section — use full range, prescreened proposals can be "Excellent"
   - Stopped penalizing lack of preliminary data and over-extrapolating prior art from different systems
   - Updated funding alternatives guidance for current federal funding climate

2. **Proposal Classifier + New Fields**
   - Added proposal classification (experimental, instrument-building, theoretical, AI/data-driven, hybrid) to Stage 1 and Stage 2 prompts
   - Added `keyUncertaintyResolution` field between `riskNarrative` and `methodsAssessment` in Stage 2
   - Synthesis: renamed `keyWeaknesses` to `keyConcerns`, added `keyStrengths`, added `resolvableVsFundamental`

3. **Stage 0: Pre-Review Intelligence Pass**
   - New `lib/services/literature-search-service.js` — wraps PubMed, arXiv, bioRxiv, ChemRxiv, Google Scholar (SerpAPI)
   - Pipeline: Haiku extracts queries (0a) → parallel database searches (0b) → Haiku collates (0c) → Perplexity synthesizes (0d)
   - Intelligence block injected into Stage 1 and Stage 2 prompts to ground reviews in real literature
   - Gracefully degradable — each substage can fail without killing the pipeline
   - Optional via frontend toggle

4. **Bug Fixes**
   - OpenAI silent failures: added 3-minute timeout via `Promise.race` in multi-llm-service.js
   - Event log disappearing: changed progress condition from `processing &&` to `(processing || events.length > 0) &&`
   - JSON parse failures: now send `provider_error` event instead of silently passing null
   - `resolvableVsFundamental` rendering: items can be strings or objects — handled both formats

5. **Frontend Updates**
   - Stage 0 toggle checkbox in Panel Configuration card
   - Stage 0 progress display with per-substage indicators (checkmark/X/pulse)
   - `keyStrengths` rendering (green icons), `keyConcerns` renamed from `keyWeaknesses`
   - `keyUncertaintyResolution` in ReviewerCard, `resolvableVsFundamental` in PanelSummary
   - All three exports (UI, Markdown, DOCX) updated for all new/renamed fields

### Commits
- `8f69af3` Add Virtual Review Panel app — multi-LLM proposal evaluation
- `54c2b35` Fix Gemini truncation, add export buttons, harden JSON parser
- `43f7472` Show model names in provider selector and progress cards
- `2cf4050` Add Stage 0 intelligence pass, rebalance review prompts per CSO feedback

## Deferred Items (Carried Forward)

- **CRM Email Send (Phase A)** — pending feedback on plan (docs/CRM_EMAIL_SEND_PLAN.md)
- **Backend Automation Plan** — requires multi-stakeholder input before implementation (docs/BACKEND_AUTOMATION_PLAN.md)
- Build Proposal Picker component for Dynamics integration
- next-auth v5 migration (still in beta)
- Re-enable coverage thresholds when test coverage reaches 70%/80%
- Code hardening: upload attribution, legacy upload-file.js cleanup

## Potential Next Steps

### 1. Test Stage 0 Intelligence Pass End-to-End
Run a full panel review with Stage 0 enabled. Verify:
- All database searches return results
- Haiku extraction/collation produces valid JSON
- Perplexity synthesis adds value beyond raw search results
- Intelligence block meaningfully changes review quality vs. without it

### 2. Evaluate Review Quality with Stakeholders
Share updated panel reviews with CSO and colleagues. Key questions:
- Are the rebalanced prompts appropriately nuanced? Still too harsh? Too generous?
- Is the rating spread useful for ranking?
- Does Stage 0 intelligence noticeably improve review grounding?

### 3. Tune Stage 0 Parameters
Based on testing, may need to adjust:
- Number of search queries extracted (currently up to 10 novelty + 5 technique)
- Max results per database (currently 20)
- Whether to always run Stage 0 or make it default-on

### 4. Begin Backend Automation (Phase 0/1)
If stakeholder discussions have progressed, Phase 0 (service auth) and Phase 1 (configurable prompts) have no external dependencies.

## Key Files Reference

| File | Purpose |
|------|---------|
| `pages/virtual-review-panel.js` | Frontend — panel config, progress, results display, exports |
| `pages/api/virtual-review-panel.js` | API route — streams SSE events |
| `lib/services/panel-review-service.js` | Orchestration — Stage 0/1/2/synthesis pipeline |
| `lib/services/literature-search-service.js` | NEW — wraps academic database APIs for Stage 0 |
| `lib/services/multi-llm-service.js` | Multi-LLM fan-out with timeout/retry |
| `shared/config/prompts/virtual-review-panel.js` | All prompts — Stage 0 extraction/collation/synthesis, Stage 1/2, synthesis |

## Testing

```bash
npm run dev                              # Start dev server
npm run build                            # Verify no build errors
npm test                                 # Run all tests
```
