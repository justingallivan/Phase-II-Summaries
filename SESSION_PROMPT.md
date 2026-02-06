# Session 47 Prompt: Evaluation Criteria Prompts Discussion

## Priority Topic for Next Session

**Discuss the prompts Claude receives about evaluation criteria** in the Multi-Perspective Evaluator. The relevant prompts are in:
- `shared/config/prompts/multi-perspective-evaluator.js`

Key areas to review:
- Framework definitions (Keck, NSF, General Scientific) - lines 15-85
- Perspective prompts (Optimist, Skeptic, Neutral) - see `createOptimistPrompt`, `createSkepticPrompt`, `createNeutralPrompt`
- Integrator synthesis prompt - see `createIntegratorPrompt`
- Proposal summary prompt - see `createProposalSummaryPrompt`

## Session 46 Summary

Implemented the **Multi-Perspective Concept Evaluator** - a new app that evaluates research concepts using three AI perspectives with fan-out/fan-in architecture.

### New Features Built

1. **Multi-Perspective Evaluator App**
   - Three parallel AI perspectives: Optimist, Skeptic, Neutral
   - Integrated synthesis with consensus, disagreements, and weighted recommendation
   - Configurable evaluation frameworks (Keck, NSF, General Scientific)
   - Proposal summary stage (what they're proposing + potential impact)

2. **PDF Export System**
   - Created reusable `PDFReportBuilder` utility in `shared/utils/pdf-export.js`
   - Fluent API for building PDF reports
   - Added to Multi-Perspective Evaluator (Export PDF button)
   - Documented architecture for adding to other apps

### Files Created

| File | Purpose |
|------|---------|
| `pages/multi-perspective-evaluator.js` | Frontend UI with framework selector, view toggle |
| `pages/api/evaluate-multi-perspective.js` | API with fan-out/fan-in architecture |
| `shared/config/prompts/multi-perspective-evaluator.js` | All prompt templates |
| `shared/utils/pdf-export.js` | Reusable PDF generation utility |
| `docs/PDF_EXPORT.md` | PDF export architecture documentation |

### Files Modified

| File | Change |
|------|--------|
| `shared/config/baseConfig.js` | Added model config for multi-perspective-evaluator |
| `pages/index.js` | Added app to homepage |
| `shared/components/Layout.js` | Added to navigation |
| `CLAUDE.md` | Updated apps list and docs reference |

### Architecture

```
Stage 1: Initial Analysis (Vision API)
    ↓
Stage 2: Literature Search (shared - runs once)
    ↓
Stage 2.5: Proposal Summary (what they're proposing + potential impact)
    ↓
Stage 3 (Fan-out): Promise.allSettled()
    ├── Optimist: Build strongest case FOR
    ├── Skeptic: Identify weaknesses/concerns
    └── Neutral: Balanced assessment
    ↓
Stage 4 (Fan-in): Integrator
    ├── Consensus (where all agree)
    ├── Disagreements (where they diverge + resolution)
    └── Weighted recommendation
```

## Pending Work

### PDF Export for Other Apps
The PDF export utility is ready. Apps that could benefit (see `docs/PDF_EXPORT.md`):
- Batch Phase I/II Summaries (High priority)
- Concept Evaluator (Medium)
- Literature Analyzer (Medium)
- Peer Review Summarizer (Medium)

### Integrity Screener Enhancements
- Complete dismissal functionality
- Add History tab
- PDF export for formal reports

## Key Files Reference

| File | Purpose |
|------|---------|
| `shared/config/prompts/multi-perspective-evaluator.js` | **Review for next session** |
| `pages/multi-perspective-evaluator.js` | Main UI |
| `pages/api/evaluate-multi-perspective.js` | API endpoint |
| `shared/utils/pdf-export.js` | PDF generation utility |

## Testing

```bash
npm run dev              # Run development server
npm run build            # Verify build succeeds
```

App accessible at `/multi-perspective-evaluator`
