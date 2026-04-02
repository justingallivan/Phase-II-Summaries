# Session 93 Prompt

## Session 92 Summary

Focused session on Virtual Review Panel export improvements, PI name disambiguation in the Stage 0 intelligence pass, and strategic planning for the staged proposal review pipeline.

### What Was Completed

1. **Stage 0 Intelligence Block in Exports**
   - Added `intelligenceBlock` state capture from SSE `complete` event
   - Added "Pre-Review Intelligence (Stage 0)" section to Markdown export with subsections: landscape summary, most relevant papers, active research groups, competing approaches, open problems, PI publication summary, additional context
   - Added matching section to DOCX export with proper formatting (bold citations, italic annotations, bulleted lists)
   - Fixed field mapping — data uses `citation` (not `title`), `pi` (not `name`), `piName` (not `name`) — initial version showed "Untitled" and "Unknown" for all entries

2. **PI Name Disambiguation**
   - Problem: Stage 0 PI publication lookup used bare `author:"Bo Li"` queries, surfacing papers by wrong researchers with the same name
   - Stage 0a prompt now extracts `piDetails` with institution and department alongside flat `piNames`
   - Google Scholar PI pub search now includes institution (or field as fallback): `author:"Bo Li" "MIT"`
   - Collation prompt (Stage 0c) includes PI Details and explicit disambiguation instructions
   - Perplexity synthesis prompt (Stage 0d) includes PI Details with emphasis on verifying correct person

3. **Staged Review Pipeline Planning**
   - Saved pipeline spec from external session to `docs/STAGED_REVIEW_PIPELINE.md` — 3-stage pipeline (fit screening → intelligence brief → virtual panel review)
   - Created implementation plan at `docs/STAGED_PIPELINE_IMPLEMENTATION_PLAN.md` — two new apps (Fit Screener + Proposal Pipeline), 5 implementation phases, designed for future PowerAutomate migration
   - Key insight: Stage 2 ≈ existing Stage 0 intelligence pass, Stage 3 ≈ existing Virtual Review Panel — most infrastructure already exists

### Commits
- `00c930c` Add Stage 0 intelligence to exports, fix PI disambiguation, save pipeline plan

## Deferred Items (Carried Forward)

- **Staged Pipeline Implementation** — plan saved at `docs/STAGED_PIPELINE_IMPLEMENTATION_PLAN.md`, not yet scheduled
- **CRM Email Send (Phase A)** — pending feedback on plan (docs/CRM_EMAIL_SEND_PLAN.md)
- **Backend Automation Plan** — requires multi-stakeholder input before implementation (docs/BACKEND_AUTOMATION_PLAN.md)
- Build Proposal Picker component for Dynamics integration
- next-auth v5 migration (still in beta)
- Re-enable coverage thresholds when test coverage reaches 70%/80%
- Code hardening: upload attribution, legacy upload-file.js cleanup

## Potential Next Steps

### 1. Begin Staged Pipeline Implementation (Phase 1)
Start with the Fit Screener app — the simplest new app:
- V25 database migration for `pipeline_proposals` table
- Fit screening prompt with 6-item checklist
- `PipelineService` with CRUD + `runFitScreening`
- Page + API route following existing app patterns

### 2. Test Stage 0 Intelligence + Exports End-to-End
Run several panel reviews with Stage 0 enabled and export results. Verify:
- PI disambiguation produces correct results across different name commonality levels
- Intelligence block renders properly in both Markdown and DOCX exports
- All subsections populate correctly (no more "Untitled"/"Unknown")

### 3. Evaluate Review Quality with Stakeholders
Share updated panel reviews (with intelligence sections in exports) with CSO and colleagues for feedback on:
- Whether the intelligence brief adds decision-relevant context
- Whether the rebalanced prompts are appropriately nuanced
- Whether the rating spread is useful for ranking

### 4. Devil's Advocate Pass
Add an adversarial single-model review to the Virtual Review Panel pipeline (described in pipeline spec). One model prompted to find strongest reasons NOT to fund, labeled separately in synthesis.

## Key Files Reference

| File | Purpose |
|------|---------|
| `pages/virtual-review-panel.js` | Frontend — panel config, progress, results display, exports (updated: intelligence block in MD/DOCX) |
| `lib/services/panel-review-service.js` | Orchestration — Stage 0/1/2/synthesis pipeline |
| `lib/services/literature-search-service.js` | Academic database searches (updated: PI disambiguation) |
| `shared/config/prompts/virtual-review-panel.js` | All prompts (updated: piDetails extraction, disambiguation guidance) |
| `docs/STAGED_REVIEW_PIPELINE.md` | Pipeline spec — 3-stage automated triage design |
| `docs/STAGED_PIPELINE_IMPLEMENTATION_PLAN.md` | Implementation plan — two apps, 5 phases |

## Testing

```bash
npm run dev                              # Start dev server
npm run build                            # Verify no build errors
npm test                                 # Run all tests
```
