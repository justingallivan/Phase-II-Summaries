# Document Processing Suite - Session 19 Prompt

## Current State (as of December 20, 2025)

### App Suite Overview

The suite now has 9 apps organized into categories:

| Category | Apps |
|----------|------|
| **Phase I** | Batch Phase I Summaries, Funding Analysis, Create Phase I Writeup Draft, Reviewer Finder |
| **Phase II** | Batch Phase II Summaries, Funding Analysis, Create Phase II Writeup Draft, Reviewer Finder, Summarize Peer Reviews |
| **Other Tools** | Expense Reporter, Literature Analyzer (coming soon) |

### Session 18 Summary (Documentation & UI Cleanup)

**Apps Deprecated:**
- document-analyzer (duplicate of proposal-summarizer)
- find-reviewers (superseded by Reviewer Finder)
- find-reviewers-pro (merged into Reviewer Finder)

**UI Consistency Updates:**
- Renamed apps for consistency (e.g., "Funding Gap Analyzer" → "Funding Analysis")
- Unified icons (✍️ for writeups, 📑 for batch)
- Reordered apps on landing page and navigation
- Changed filters from "Available/Coming Soon" to "Phase I/Phase II/Other Tools"
- Removed redundant header logo and feature keywords
- Added author credit to footer with mailto link

### Reviewer Finder - Production Ready

Complete pipeline for finding expert reviewers:
1. **Claude Analysis** - Extract proposal metadata and suggest reviewers
2. **Database Discovery** - Search PubMed, ArXiv, BioRxiv, ChemRxiv
3. **Contact Enrichment** - 5-tier system for emails and faculty pages
4. **Email Generation** - Create .eml invitation files

**Key Features:**
- Icon toggle buttons for database sources
- Institution/expertise mismatch warnings
- Google Scholar profile links
- PI/author self-suggestion prevention
- Save/edit/delete candidates in database
- Multi-select operations

## Suggested Next Steps (Priority Order)

### 1. Database Tab Implementation (High Priority)
Browse/search all researchers in the database independent of proposals.
- See `ROADMAP_DATABASE_TAB.md` for detailed plan
- Phase 1: Basic browse & search with pagination
- Phase 2: Researcher detail views
- Phase 3: Edit/delete/merge operations

### 2. Re-enrich Contacts Button
- Add button in My Candidates tab to re-run contact enrichment
- Currently must re-run full search to update contacts

### 3. Contact Enrichment Tracking
- Track which tier found each contact
- Display enrichment source on candidate cards
- Useful for optimizing enrichment strategy

### 4. Email Tracking
- Mark candidates as "email sent"
- Track response status (accepted, declined, no response)

### 5. Bulk Operations
- Export selected candidates to CSV
- Bulk status updates

### 6. Literature Analyzer App
- Currently "coming soon" placeholder
- Paper synthesis and citation analysis

## Key Files Reference

**Reviewer Finder:**
- `pages/reviewer-finder.js` - Main page with tabs
- `lib/services/discovery-service.js` - Multi-database search
- `lib/services/contact-enrichment-service.js` - 5-tier contact lookup
- `lib/services/database-service.js` - Vercel Postgres operations
- `ROADMAP_DATABASE_TAB.md` - Database Tab implementation plan

**Phase I/II Writeups:**
- `pages/proposal-summarizer.js` - Phase II writeup
- `pages/phase-i-writeup.js` - Phase I writeup
- `shared/config/prompts/proposal-summarizer.js` - Phase II prompts
- `shared/config/prompts/phase-i-summaries.js` - Phase I prompts with Keck alignment

**Shared Components:**
- `shared/components/Layout.js` - Navigation and footer
- `pages/index.js` - Landing page with category filters

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
Recent Session 18 commits include:
- UI consistency updates (app renaming, icons, navigation order)
- App deprecation (document-analyzer, find-reviewers, find-reviewers-pro)
- Landing page updates (category filters, app ordering, descriptions)
- Footer author credit
- Documentation updates
