# Document Processing Suite - Session 27 Prompt

## Current State (as of January 17, 2026)

### App Suite Overview

The suite has 10 apps organized into categories:

| Category | Apps |
|----------|------|
| **Concepts** | Concept Evaluator |
| **Phase I** | Batch Phase I Summaries, Funding Analysis, Create Phase I Writeup Draft, Reviewer Finder |
| **Phase II** | Batch Phase II Summaries, Funding Analysis, Create Phase II Writeup Draft, Reviewer Finder, Summarize Peer Reviews |
| **Other Tools** | Expense Reporter, Literature Analyzer (coming soon) |

### Session 26 Summary

**Per-App Model Configuration (Completed)**

Implemented centralized per-app model configuration in `shared/config/baseConfig.js`:

| App | Model | Complexity |
|-----|-------|------------|
| Concept Evaluator | Opus 4 | High (Vision + Analysis) |
| Batch Phase I/II Summaries | Sonnet 4 | High |
| Phase I/II Writeup | Sonnet 4 | High |
| Reviewer Finder | Sonnet 4 | High |
| Peer Review Summarizer | Sonnet 4 | High |
| Funding Analysis | Sonnet 4 | Medium |
| Q&A, Refine | Sonnet 4 | Medium |
| Expense Reporter | Haiku 3.5 | Low |
| Contact Enrichment | Haiku 3.5 | Low (unchanged) |
| Email Personalization | Haiku 3.5 | Low (unchanged) |

**Key Implementation Details:**
- Added `APP_MODELS` config object with per-app model defaults
- Added `getModelForApp()` and `getFallbackModelForApp()` helper functions
- Updated 13 API endpoints to use app-specific models
- Environment variable override support: `CLAUDE_MODEL_<APP_NAME>=<model>`

### Testing Notes

The Concept Evaluator is now configured to use Opus 4 for highest quality evaluations. To test:
1. Run a concept evaluation with the current Opus 4 config
2. Compare quality to previous Sonnet 4 evaluations
3. Assess cost/benefit trade-off

To test with Sonnet 4 instead:
```env
CLAUDE_MODEL_CONCEPT_EVALUATOR=claude-sonnet-4-20250514
```

## Priority Tasks for Session 27

### 1. Test Concept Evaluator with Opus 4
- Run evaluations on sample concepts
- Compare quality vs. Sonnet 4 evaluations
- Document findings and cost implications

### 2. Database Tab Phase 3 - Management (deferred from Session 26)
- Edit researcher info directly in Database tab
- Delete researchers (with confirmation)
- Merge duplicate researchers
- Bulk export to CSV

### 3. Email Tracking
- Mark candidates as "email sent"
- Track response status (accepted, declined, no response)
- Use existing `email_sent_at`, `response_type` columns

### 4. Literature Analyzer App
- Currently "coming soon" placeholder
- Paper synthesis and citation analysis

## Key Files Reference

**Model Configuration:**
- `shared/config/baseConfig.js` - Central config with APP_MODELS and getModelForApp()
- `shared/config/index.js` - Exports getModelForApp, getFallbackModelForApp

**Concept Evaluator:**
- `pages/concept-evaluator.js` - Frontend with file upload and results display
- `pages/api/evaluate-concepts.js` - API with Vision + text calls
- `shared/config/prompts/concept-evaluator.js` - Evaluation prompts

**Reviewer Finder Core:**
- `pages/reviewer-finder.js` - Main page with 3 tabs
- `lib/services/claude-reviewer-service.js` - Uses getModelForApp('reviewer-finder')
- `lib/services/discovery-service.js` - Multi-database search

## Environment Variables

```
CLAUDE_API_KEY=        # Required
POSTGRES_URL=          # Auto-set by Vercel Postgres
SERP_API_KEY=          # Google/Scholar search (optional)
NCBI_API_KEY=          # Higher PubMed rate limits (optional)

# Per-app model overrides (optional)
CLAUDE_MODEL_CONCEPT_EVALUATOR=   # Override Opus → Sonnet if needed
CLAUDE_MODEL_EXPENSE_REPORTER=    # Upgrade Haiku → Sonnet if needed
```

## Running the App

```bash
npm run dev
# Access at http://localhost:3000
```

## Git Status

Branch: main
Session 26 commits:
- Add per-app model configuration for optimized cost/performance
