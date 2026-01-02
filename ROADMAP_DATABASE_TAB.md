# Database Tab Implementation - Roadmap

## Overview

The Database Tab will provide a browsable interface to view and manage all researchers saved in the Vercel Postgres database. Currently, researchers can only be viewed in the context of specific proposals via the "My Candidates" tab.

## Status: Phase 1 Complete (January 2, 2026)

## Current Database Schema

The `researchers` table contains:
- `id`, `name`, `affiliation`, `h_index`
- `email`, `email_source`, `email_year`, `email_verified_at`
- `faculty_page_url`, `orcid_id`
- `contact_enriched_at`, `contact_enrichment_source`
- `pubmed_verified`, `pubmed_pubs`, `arxiv_pubs`, `biorxiv_pubs`
- `created_at`, `updated_at`

Related tables:
- `reviewer_suggestions` - Links researchers to proposals
- `publications` - Researcher publications cache
- `researcher_keywords` - Expertise keywords

## Implementation Plan

### Phase 1: Basic Browse & Search ✅ COMPLETE

**Goal:** Display all researchers in a searchable, sortable table.

**Implemented:**
1. ✅ API endpoint `GET /api/reviewer-finder/researchers`
   - Pagination support (limit/offset, default 50 per page)
   - Sort options: name, affiliation, h_index, last_updated
   - Search filter: name, affiliation, email (ILIKE search)
   - Filters: hasEmail, hasWebsite

2. ✅ `DatabaseTab` component in `pages/reviewer-finder.js`
   - Table view with columns: Name, Affiliation, h-index, Contact, Updated
   - Debounced search input (300ms)
   - Click-to-sort column headers with indicators
   - Checkbox filters for email/website
   - Full pagination (First, Prev, Page X of Y, Next, Last)
   - Google Scholar links for each researcher
   - Email/website icons with hover tooltips

3. ✅ Wired to existing tab navigation

### Phase 2: Researcher Details

**Goal:** View full details for individual researchers.

**Tasks:**
1. Create researcher detail modal or expandable row
   - Show all contact info (email, website, ORCID)
   - Show publications if cached
   - Show proposals they're associated with

2. Link from "My Candidates" saved cards to database view

### Phase 3: Database Management

**Goal:** Allow editing and organizing researchers.

**Tasks:**
1. Edit researcher info (reuse `EditCandidateModal`)
2. Merge duplicate researchers
3. Delete researchers (with confirmation, cascade to suggestions)
4. Bulk export to CSV

### Phase 4: Advanced Features (Future)

**Possible enhancements:**
- Tag/categorize researchers by expertise area
- Track contact history (emails sent, responses)
- Import researchers from CSV
- Researcher "notes" field for tracking

## API Endpoint Design

### GET /api/reviewer-finder/researchers

```javascript
// Query parameters
{
  search: string,        // Search name, affiliation, email
  sortBy: string,        // 'name' | 'affiliation' | 'h_index' | 'updated_at'
  sortOrder: string,     // 'asc' | 'desc'
  limit: number,         // Default: 50
  offset: number,        // Default: 0
  hasEmail: boolean,     // Filter: only with email
  hasWebsite: boolean,   // Filter: only with website
}

// Response
{
  researchers: [...],
  total: number,
  limit: number,
  offset: number
}
```

### DELETE /api/reviewer-finder/researchers/[id]

Deletes researcher and associated reviewer_suggestions.

### GET /api/reviewer-finder/researchers/[id]/proposals

Returns all proposals where this researcher was suggested.

## UI Mockup

```
┌─────────────────────────────────────────────────────────────┐
│  Search  │  My Candidates  │  Database                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🔍 Search researchers...          Sort: [Name ▼] [A-Z ▼]  │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Name          │ Affiliation    │ h-index │ Email │ ... ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ John Smith    │ MIT            │ 45      │ ✓     │ ✏️  ││
│  │ Jane Doe      │ Stanford       │ 32      │ ✓     │ ✏️  ││
│  │ Bob Wilson    │ UC Berkeley    │ 28      │ -     │ ✏️  ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  Showing 1-50 of 234 researchers    [< Prev] [Next >]      │
│                                                             │
│  [Export CSV]                                               │
└─────────────────────────────────────────────────────────────┘
```

## Estimated Effort

- Phase 1: Basic implementation
- Phase 2: Detail views
- Phase 3: Management features
- Phase 4: Future enhancements

## Dependencies

- Existing `database-service.js` methods
- Existing `EditCandidateModal` component (reusable)
- Existing table styling patterns from other apps

## Files Created/Modified

**New Files (Phase 1):**
- `pages/api/reviewer-finder/researchers.js` - GET endpoint with search, sort, pagination

**Modified Files (Phase 1):**
- `pages/reviewer-finder.js` - Implemented full DatabaseTab component with ResearcherRow

---

Created: December 20, 2025
Phase 1 Complete: January 2, 2026
