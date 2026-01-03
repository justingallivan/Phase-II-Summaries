# Document Processing Suite - Session 20 Prompt

## Current State (as of January 2, 2026)

### App Suite Overview

The suite has 9 apps organized into categories:

| Category | Apps |
|----------|------|
| **Phase I** | Batch Phase I Summaries, Funding Analysis, Create Phase I Writeup Draft, Reviewer Finder |
| **Phase II** | Batch Phase II Summaries, Funding Analysis, Create Phase II Writeup Draft, Reviewer Finder, Summarize Peer Reviews |
| **Other Tools** | Expense Reporter, Literature Analyzer (coming soon) |

### Session 19 Summary (Database Tab & Tagging)

**Database Tab - Phase 1 Complete:**
- Browse/search all saved researchers in the Database tab
- Search by name, affiliation, or email
- Sort by name, affiliation, h-index, or last updated
- Filter by "Has Email", "Has Website", or expertise tags
- Pagination with 50 researchers per page
- API: `GET /api/reviewer-finder/researchers`

**Auto-Generated Researcher Tags:**
- Expertise areas extracted from Claude analysis (purple tags)
- Discovery source tags like `source:pubmed` (green tags)
- Tags saved to `researcher_keywords` table during save
- Filter dropdown populated from available tags

**Database Behavior Fix:**
- Researchers are now ONLY added to database when user clicks "Save"
- Removed auto-save from discovery/deduplication process
- Contact enrichment only updates existing researchers

**New Utility Scripts:**
- `scripts/cleanup-database.js` - Remove researchers missing email or website
- `scripts/clear-all-database.js` - Delete all data for fresh start

### Reviewer Finder - Feature Complete

Complete pipeline for finding expert reviewers:
1. **Claude Analysis** - Extract proposal metadata and suggest reviewers
2. **Database Discovery** - Search PubMed, ArXiv, BioRxiv, ChemRxiv
3. **Contact Enrichment** - 5-tier system for emails and faculty pages
4. **Email Generation** - Create .eml invitation files
5. **Database Tab** - Browse/search all saved researchers

**Key Features:**
- Institution/expertise mismatch warnings
- Google Scholar profile links
- PI/author self-suggestion prevention
- Save/edit/delete candidates in database
- Multi-select operations (save, delete, email)
- Tag-based filtering in Database tab

## Suggested Next Steps (Priority Order)

### 1. Database Tab Phase 2 - Researcher Details
- Expandable rows or detail modal for full researcher info
- Show all contact info, publications, proposal associations
- Link from My Candidates to Database view

### 2. Database Tab Phase 3 - Management
- Edit researcher info directly in Database tab
- Delete researchers (with confirmation)
- Merge duplicate researchers
- Bulk export to CSV

### 3. Re-enrich Contacts Button
- Add button in My Candidates tab to re-run contact enrichment
- Currently must re-run full search to update contacts

### 4. Email Tracking
- Mark candidates as "email sent"
- Track response status (accepted, declined, no response)
- Use existing `email_sent_at`, `response_type` columns

### 5. Literature Analyzer App
- Currently "coming soon" placeholder
- Paper synthesis and citation analysis

## Key Files Reference

**Database Tab:**
- `pages/reviewer-finder.js` - DatabaseTab and ResearcherRow components
- `pages/api/reviewer-finder/researchers.js` - GET endpoint with filtering
- `lib/services/database-service.js` - Keyword methods
- `ROADMAP_DATABASE_TAB.md` - Implementation plan (Phase 1 complete)

**Reviewer Finder:**
- `pages/reviewer-finder.js` - Main page with 3 tabs
- `lib/services/discovery-service.js` - Multi-database search
- `lib/services/contact-enrichment-service.js` - 5-tier contact lookup
- `lib/services/deduplication-service.js` - Name matching, COI filtering
- `pages/api/reviewer-finder/save-candidates.js` - Save with keyword extraction

**Utility Scripts:**
- `scripts/setup-database.js` - Database migrations
- `scripts/cleanup-database.js` - Remove incomplete entries
- `scripts/clear-all-database.js` - Full database reset

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
Session 19 commits:
- Database Tab Phase 1 implementation
- Auto-generated researcher tags from discovery
- Fix: Only add researchers when explicitly saved
- Database utility scripts
- Documentation updates
