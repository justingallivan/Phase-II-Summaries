# Document Processing Suite - Session 24 Prompt

## Current State (as of January 15, 2026)

### App Suite Overview

The suite has 9 apps organized into categories:

| Category | Apps |
|----------|------|
| **Phase I** | Batch Phase I Summaries, Funding Analysis, Create Phase I Writeup Draft, Reviewer Finder |
| **Phase II** | Batch Phase II Summaries, Funding Analysis, Create Phase II Writeup Draft, Reviewer Finder, Summarize Peer Reviews |
| **Other Tools** | Expense Reporter, Literature Analyzer (coming soon) |

### Session 23 Summary

**Grant Cycle Management & UI Enhancements:**

1. **Database Migrations (V8, V9)**
   - V8: Added `declined` column to reviewer_suggestions
   - V9: Added `program_area` column to reviewer_suggestions
   - Historical grant cycles added: J23-J26, D23-D25

2. **My Candidates Tab Improvements**
   - Editable program area dropdown (Medical/Science & Eng) on proposal cards
   - Editable grant cycle dropdown on proposal cards
   - Declined status button alongside Invited/Accepted
   - PI and Institution display with filters

3. **New Search Tab Enhancement**
   - Grant cycle selector dropdown
   - Auto-creates cycles for current year + next year (18 months coverage)
   - Persists selected cycle to localStorage
   - Defaults intelligently to first available cycle

4. **Prompt Updates**
   - Updated Claude prompt to extract Keck cover page fields
   - Program area extraction (Medical vs Science & Engineering)
   - Principal Investigator field (single name, not multiple authors)

### Reviewer Finder - Current State

Complete pipeline for finding expert reviewers:
1. **Claude Analysis** - Extract proposal metadata (PI, Co-PIs, abstract, program area) and suggest reviewers
2. **Database Discovery** - Search PubMed, ArXiv, BioRxiv, ChemRxiv
3. **Contact Enrichment** - 5-tier system for emails and faculty pages
4. **Email Generation** - Create .eml files with attachments
5. **Database Tab** - Browse/search all saved researchers with detail modal

**Key Features:**
- Grant cycle selector in New Search (auto-creates future cycles)
- Editable program area and grant cycle on proposal cards
- Declined status tracking
- Institution/expertise mismatch warnings
- Google Scholar profile links
- PI/author self-suggestion prevention
- Multi-field duplicate detection on save
- Multi-select operations (save, delete, email)
- Tag-based filtering in Database tab

## Priority Tasks for Session 24

### 1. Concept Evaluation App (NEW - TOP PRIORITY)
Create a new app to help evaluate concepts received for upcoming grant cycles. This is a workflow priority shift as we approach a new grant cycle.

**Suggested scope to explore:**
- Upload concept documents (likely 1-2 page PDFs)
- Claude analysis to extract key information
- Evaluation criteria (alignment with foundation priorities, feasibility, innovation, etc.)
- Scoring or ranking suggestions
- Export evaluation summaries

*Note: User should clarify the specific workflow and evaluation criteria before implementation.*

### 2. Database Tab Phase 3 - Management (deferred)
- Edit researcher info directly in Database tab
- Delete researchers (with confirmation)
- Merge duplicate researchers
- Bulk export to CSV

### 3. Email Tracking (deferred)
- Mark candidates as "email sent"
- Track response status (accepted, declined, no response)
- Use existing `email_sent_at`, `response_type` columns

### 4. Re-enrich Contacts Button (deferred)
- Add button in My Candidates tab to re-run contact enrichment
- Currently must re-run full search to update contacts

### 5. Literature Analyzer App (deferred)
- Currently "coming soon" placeholder
- Paper synthesis and citation analysis

## Key Files Reference

**Reviewer Finder Core:**
- `pages/reviewer-finder.js` - Main page with 3 tabs, cycle selector, program dropdowns
- `lib/services/discovery-service.js` - Multi-database search
- `lib/services/contact-enrichment-service.js` - 5-tier contact lookup
- `shared/config/prompts/reviewer-finder.js` - Analysis prompt with Keck fields

**Grant Cycle Management:**
- `pages/api/reviewer-finder/grant-cycles.js` - CRUD for cycles
- `pages/api/reviewer-finder/my-candidates.js` - GET/PATCH/DELETE with cycle/program support
- `shared/components/SettingsModal.js` - Cycle management UI

**Database:**
- `scripts/setup-database.js` - Database migrations (V1-V9)
- V8: `declined` column
- V9: `program_area` column

**Email Generation:**
- `lib/utils/email-generator.js` - EML generation with attachments
- `shared/components/EmailGeneratorModal.js` - Multi-step email workflow
- `shared/components/SettingsModal.js` - Settings UI with 4 sections

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
Session 23 commits:
- Add program area and grant cycle editing to My Candidates
- Add grant cycle selector dropdown to New Search tab
