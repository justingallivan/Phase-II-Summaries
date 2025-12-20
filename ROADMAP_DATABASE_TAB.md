# Database Tab Implementation - Roadmap

## Overview

The Database Tab will provide a browsable interface to view and manage all researchers saved in the Vercel Postgres database. Currently, researchers can only be viewed in the context of specific proposals via the "My Candidates" tab.

## Priority: High (Next Major Feature)

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

### Phase 1: Basic Browse & Search

**Goal:** Display all researchers in a searchable, sortable table.

**Tasks:**
1. Create API endpoint `GET /api/reviewer-finder/researchers`
   - Pagination support (limit/offset)
   - Sort options: name, affiliation, h_index, updated_at
   - Search filter: name, affiliation, email

2. Create `DatabaseTab` component in `pages/reviewer-finder.js`
   - Table view with columns: Name, Affiliation, h-index, Email, Website
   - Search input field
   - Sort dropdown
   - Pagination controls

3. Wire up to existing tab navigation

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

## Files to Create/Modify

**New Files:**
- `pages/api/reviewer-finder/researchers.js` - CRUD endpoint
- `shared/components/ResearchersTable.js` - Table component (optional)

**Modified Files:**
- `pages/reviewer-finder.js` - Add DatabaseTab
- `lib/services/database-service.js` - Add researcher query methods

---

Created: December 20, 2025
Status: Planned
