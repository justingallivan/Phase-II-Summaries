# Document Processing Suite - Session 25 Prompt

## Current State (as of January 16, 2026)

### App Suite Overview

The suite has 10 apps organized into categories:

| Category | Apps |
|----------|------|
| **Concepts** | Concept Evaluator |
| **Phase I** | Batch Phase I Summaries, Funding Analysis, Create Phase I Writeup Draft, Reviewer Finder |
| **Phase II** | Batch Phase II Summaries, Funding Analysis, Create Phase II Writeup Draft, Reviewer Finder, Summarize Peer Reviews |
| **Other Tools** | Expense Reporter, Literature Analyzer (coming soon) |

### Session 24 Summary

**New App: Concept Evaluator**

Created a pre-Phase I screening tool to evaluate research concepts:

1. **PDF Page Splitter**
   - `lib/utils/pdf-page-splitter.js` - Extract individual pages as base64 PDFs
   - Uses pdf-lib to create single-page documents for Claude Vision API

2. **Two-Stage Evaluation Process**
   - Stage 1: Claude Vision API extracts title, PI, summary, research area, keywords
   - Stage 2: After literature search, Claude provides final evaluation with ratings

3. **Automated Literature Search**
   - Auto-selects databases based on research area:
     - Life sciences → PubMed + BioRxiv
     - Chemistry → PubMed + ChemRxiv
     - Physics/CS/Math → ArXiv
   - Searches recent publications (last 3 years)

4. **Keck-Aligned Ratings**
   - Keck Alignment (high-risk, pioneering, wouldn't be funded elsewhere)
   - Scientific Merit (sound science, clear hypothesis)
   - Feasibility (technical challenges, likelihood of success)
   - Novelty (based on literature search results)
   - Label-based: Strong / Moderate / Weak with reasoning

5. **Export Options**
   - JSON (full structured data)
   - Markdown (human-readable report)

### Concept Evaluator - Current State

Complete pipeline for screening research concepts:
1. **Upload PDF** - Each page contains one independent concept
2. **Claude Vision Analysis** - Extract metadata and keywords from each page
3. **Literature Search** - Find recent publications in relevant databases
4. **Final Evaluation** - Claude interprets literature and provides ratings
5. **Export** - Download as JSON or Markdown

**Key Files:**
- `pages/concept-evaluator.js` - Frontend with streaming progress
- `pages/api/evaluate-concepts.js` - Two-stage evaluation API
- `lib/utils/pdf-page-splitter.js` - PDF page extraction
- `shared/config/prompts/concept-evaluator.js` - Evaluation prompts

## Priority Tasks for Session 25

### 1. Test Concept Evaluator with Real Data
- Upload actual concept PDFs and verify the evaluation quality
- Check that literature search returns relevant results
- Validate JSON parsing (watch for markdown code blocks in Claude responses)
- Test export functionality

### 2. Concept Evaluator Improvements (based on testing)
- Adjust prompts based on actual results
- Fine-tune research area detection for database selection
- Consider adding more databases or adjusting search queries

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

**Concept Evaluator:**
- `pages/concept-evaluator.js` - Main page with file upload and results display
- `pages/api/evaluate-concepts.js` - API with streaming, PDF splitting, Claude Vision, literature search
- `lib/utils/pdf-page-splitter.js` - PDF to pages utility
- `shared/config/prompts/concept-evaluator.js` - Analysis and evaluation prompts

**Reviewer Finder Core:**
- `pages/reviewer-finder.js` - Main page with 3 tabs, cycle selector, program dropdowns
- `lib/services/discovery-service.js` - Multi-database search
- `lib/services/contact-enrichment-service.js` - 5-tier contact lookup
- `shared/config/prompts/reviewer-finder.js` - Analysis prompt with Keck fields

**Literature Search Services:**
- `lib/services/pubmed-service.js` - NCBI E-utilities API
- `lib/services/arxiv-service.js` - ArXiv Atom feed API
- `lib/services/biorxiv-service.js` - BioRxiv API
- `lib/services/chemrxiv-service.js` - ChemRxiv Public API

## Environment Variables

```
CLAUDE_API_KEY=        # Required
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
Session 24 commits:
- Add Concept Evaluator app for pre-Phase I screening
