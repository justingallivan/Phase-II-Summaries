# Document Processing Suite - Session 26 Prompt

## Current State (as of January 16, 2026)

### App Suite Overview

The suite has 10 apps organized into categories:

| Category | Apps |
|----------|------|
| **Concepts** | Concept Evaluator |
| **Phase I** | Batch Phase I Summaries, Funding Analysis, Create Phase I Writeup Draft, Reviewer Finder |
| **Phase II** | Batch Phase II Summaries, Funding Analysis, Create Phase II Writeup Draft, Reviewer Finder, Summarize Peer Reviews |
| **Other Tools** | Expense Reporter, Literature Analyzer (coming soon) |

### Session 25 Summary

**Concept Evaluator Refinements**

Tested and improved the Concept Evaluator based on real-world usage:

1. **Fixed Sycophantic Evaluations**
   - Rewrote prompts with anti-sycophancy instructions
   - Added rating distribution guidance (Strong = top 10-20%)
   - Required substantive concerns for every concept

2. **Reframed to Impact Focus**
   - Added `potentialImpact` as primary criterion
   - Key question: "If everything works, what's the impact on the field/world?"
   - Feasibility is secondary - helpful for identifying addressable concerns

3. **Fixed Literature Search**
   - Changed from one long concatenated query to 2-3 short focused queries
   - Each query (3-5 words) executed individually
   - Example: "CRISPR gene editing" instead of "CRISPR screening packageable lentiviral vectors..."

4. **Bug Fixes**
   - Fixed author display (was showing [object Object])
   - Added clickable paper links (DOI, PubMed, ArXiv)

### Model Configuration Issue Identified

All apps currently use the same Claude model, configured in `shared/config/baseConfig.js`:

```javascript
DEFAULT_MODEL: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514'
```

**Problem:** Different apps have different requirements:
- Simple tasks (expense parsing, email personalization) → Haiku is sufficient
- Complex analysis (concept evaluation, proposal summaries) → Sonnet or Opus may be needed
- Vision tasks (PDF analysis) → Must use vision-capable models

**Current model usage by app:**
| App | Current Model | Complexity | Suggested Model |
|-----|---------------|------------|-----------------|
| Batch Phase I/II Summaries | Sonnet 4 | High | Sonnet 4 |
| Concept Evaluator | Sonnet 4 | High (Vision + Analysis) | Opus 4? |
| Reviewer Finder Analysis | Sonnet 4 | High | Sonnet 4 |
| Contact Enrichment | Haiku | Low | Haiku ✓ |
| Email Personalization | Haiku | Low | Haiku ✓ |
| Expense Reporter | Sonnet 4 | Low | Haiku |
| Funding Analysis | Sonnet 4 | Medium | Sonnet 4 |
| Peer Review Summarizer | Sonnet 4 | High | Sonnet 4 |

## Priority Tasks for Session 26

### 1. Per-App Model Configuration (HIGH PRIORITY)

Design and implement a system for per-app model selection:

**Option A: App-Level Config**
- Each app specifies its preferred model in a config object
- Override via environment variable still possible
- Example:
  ```javascript
  const CONCEPT_EVALUATOR_CONFIG = {
    model: 'claude-opus-4-20250514',
    visionModel: 'claude-opus-4-20250514',
    fallbackModel: 'claude-sonnet-4-20250514'
  };
  ```

**Option B: Settings UI**
- Add model selector to Settings modal in each app
- Store preference in localStorage
- Default to recommended model per app

**Option C: Centralized Config with Per-App Overrides**
- Extend `shared/config/baseConfig.js` with per-app model mappings
- Apps can override but have sensible defaults

**Considerations:**
- Cost implications (Opus >> Sonnet >> Haiku)
- Some tasks require vision-capable models
- User should understand trade-offs
- Some apps have multiple Claude calls with different complexity

### 2. Test Concept Evaluator with New Model
- Try Opus 4 for concept evaluation
- Compare quality of evaluations
- Assess cost/benefit trade-off

### 3. Database Tab Phase 3 - Management (deferred)
- Edit researcher info directly in Database tab
- Delete researchers (with confirmation)
- Merge duplicate researchers
- Bulk export to CSV

### 4. Email Tracking (deferred)
- Mark candidates as "email sent"
- Track response status (accepted, declined, no response)
- Use existing `email_sent_at`, `response_type` columns

### 5. Literature Analyzer App (deferred)
- Currently "coming soon" placeholder
- Paper synthesis and citation analysis

## Key Files Reference

**Model Configuration:**
- `shared/config/baseConfig.js` - Central config with DEFAULT_MODEL
- `lib/services/claude-reviewer-service.js` - Has its own MODEL constant
- `lib/services/contact-enrichment-service.js` - Uses Haiku for web search

**Concept Evaluator:**
- `pages/concept-evaluator.js` - Frontend with file upload and results display
- `pages/api/evaluate-concepts.js` - API with Vision + text calls (lines 230, 401)
- `lib/utils/pdf-page-splitter.js` - PDF to pages utility
- `shared/config/prompts/concept-evaluator.js` - Analysis and evaluation prompts

**Reviewer Finder Core:**
- `pages/reviewer-finder.js` - Main page with 3 tabs, cycle selector, program dropdowns
- `lib/services/discovery-service.js` - Multi-database search
- `lib/services/contact-enrichment-service.js` - 5-tier contact lookup (uses Haiku)
- `shared/config/prompts/reviewer-finder.js` - Analysis prompt

**Literature Search Services:**
- `lib/services/pubmed-service.js` - NCBI E-utilities API
- `lib/services/arxiv-service.js` - ArXiv Atom feed API
- `lib/services/biorxiv-service.js` - BioRxiv API
- `lib/services/chemrxiv-service.js` - ChemRxiv Public API

## Environment Variables

```
CLAUDE_API_KEY=        # Required
CLAUDE_MODEL=          # Optional override for default model
POSTGRES_URL=          # Auto-set by Vercel Postgres
SERP_API_KEY=          # Google/Scholar search (optional)
NCBI_API_KEY=          # Higher PubMed rate limits (optional)
```

## Running the App

```bash
npm run dev
# Access at http://localhost:3000
```

## Git Status

Branch: main
Session 25 commits:
- Enhance Concept Evaluator with impact focus and literature visibility
- Restore full feasibility analysis as secondary criterion
- Improve literature search with focused short queries
- Fix author display and add paper links in literature results
