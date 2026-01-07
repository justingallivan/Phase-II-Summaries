# Document Processing Suite - Session 21 Prompt

## Current State (as of January 6, 2026)

### App Suite Overview

The suite has 9 apps organized into categories:

| Category | Apps |
|----------|------|
| **Phase I** | Batch Phase I Summaries, Funding Analysis, Create Phase I Writeup Draft, Reviewer Finder |
| **Phase II** | Batch Phase II Summaries, Funding Analysis, Create Phase II Writeup Draft, Reviewer Finder, Summarize Peer Reviews |
| **Other Tools** | Expense Reporter, Literature Analyzer (coming soon) |

### Session 20 Summary

**Simplified Save Flow:**
- Removed standalone "Save to My Candidates" button
- Renamed "Find Contact Info" to "Find Contacts & Save"
- Contact enrichment is now required before saving candidates
- Single streamlined path: Select → Enrich → Save

**Multi-Field Duplicate Detection:**
- Added robust duplicate checking when saving researchers
- Check order (first match wins):
  1. ORCID match (most reliable)
  2. Email match
  3. Google Scholar ID match
  4. Normalized name match (fallback)
- Existing records are updated with new data rather than creating duplicates

**Database Tab Phase 2 - Detail Modal:**
- Click any researcher row to open detail modal
- Contact Information section with email source (e.g., "from PubMed 2024")
- Metrics display: h-index, i10-index, total citations
- All expertise keywords grouped by source with relevance tooltips
- Proposal associations showing title, score, status, notes
- Keyboard support (Escape to close), click-outside-to-close

**API Enhancement:**
- `GET /api/reviewer-finder/researchers?id=123` returns single researcher with full details
- Includes all keywords and proposal associations

### Reviewer Finder - Current State

Complete pipeline for finding expert reviewers:
1. **Claude Analysis** - Extract proposal metadata and suggest reviewers
2. **Database Discovery** - Search PubMed, ArXiv, BioRxiv, ChemRxiv
3. **Contact Enrichment** - 5-tier system for emails and faculty pages (now required before save)
4. **Email Generation** - Create .eml invitation files
5. **Database Tab** - Browse/search all saved researchers with detail modal

**Key Features:**
- Institution/expertise mismatch warnings
- Google Scholar profile links
- PI/author self-suggestion prevention
- Multi-field duplicate detection on save
- Multi-select operations (save, delete, email)
- Tag-based filtering in Database tab
- Click-to-view researcher detail modal

## Suggested Next Steps (Priority Order)

### 1. Database Tab Phase 3 - Management
- Edit researcher info directly in Database tab
- Delete researchers (with confirmation)
- Merge duplicate researchers
- Bulk export to CSV

### 2. Re-enrich Contacts Button
- Add button in My Candidates tab to re-run contact enrichment
- Currently must re-run full search to update contacts

### 3. Email Tracking
- Mark candidates as "email sent"
- Track response status (accepted, declined, no response)
- Use existing `email_sent_at`, `response_type` columns

### 4. Literature Analyzer App
- Currently "coming soon" placeholder
- Paper synthesis and citation analysis

### 5. Link My Candidates to Database
- From My Candidates tab, link to researcher in Database tab
- Or open detail modal directly from My Candidates

## Key Files Reference

**Database Tab:**
- `pages/reviewer-finder.js` - DatabaseTab, ResearcherRow, ResearcherDetailModal components
- `pages/api/reviewer-finder/researchers.js` - GET endpoint with `?id=` for single researcher
- `lib/services/database-service.js` - Keyword methods

**Reviewer Finder:**
- `pages/reviewer-finder.js` - Main page with 3 tabs
- `lib/services/discovery-service.js` - Multi-database search
- `lib/services/contact-enrichment-service.js` - 5-tier contact lookup
- `lib/services/deduplication-service.js` - Name matching, COI filtering
- `pages/api/reviewer-finder/save-candidates.js` - Save with multi-field duplicate detection

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
Session 20 commits:
- Simplify save flow: require contact enrichment before saving
- Add researcher detail modal to Database Tab (Phase 2)
