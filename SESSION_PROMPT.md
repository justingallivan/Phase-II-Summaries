# Document Processing Suite - Session 28 Prompt

## Current State (as of January 18, 2026)

### App Suite Overview

The suite has 9 active apps (Literature Analyzer is planned but not yet implemented):

| Category | Apps |
|----------|------|
| **Concepts** | Concept Evaluator |
| **Phase I** | Batch Phase I Summaries, Funding Analysis, Create Phase I Writeup Draft, Reviewer Finder |
| **Phase II** | Batch Phase II Summaries, Funding Analysis, Create Phase II Writeup Draft, Reviewer Finder, Summarize Peer Reviews |
| **Other Tools** | Expense Reporter |

### Session 27 Summary

**1. Email Tracking (Completed)**

Implemented full email tracking for reviewer candidates:

| Feature | Description |
|---------|-------------|
| API Updates | PATCH endpoint accepts `emailSentAt`, `responseType`, `responseReceivedAt` |
| Auto-mark sent | Generate emails modal marks candidates as sent with timestamp |
| UI indicators | Sent date displayed on candidate cards (📧 Jan 18) |
| Response tracking | Clicking Accepted/Declined sets response type and timestamp |
| Bounced emails | Mark Bounced button in expanded details |

**Key files:**
- `pages/api/reviewer-finder/my-candidates.js` - Extended PATCH for email fields
- `pages/api/reviewer-finder/generate-emails.js` - Added `markAsSent` option
- `shared/components/EmailGeneratorModal.js` - Added checkbox and callback
- `pages/reviewer-finder.js` - SavedCandidateCard email status display

**2. Database Tab Phase 3 - Researcher Management (Completed)**

Full researcher management in the Database tab:

| Feature | Description |
|---------|-------------|
| Edit Researcher | Click row → Edit → modify name, affiliation, email, website, metrics |
| Delete Researcher | Click row → Delete → confirmation with proposal count warning |
| Bulk Selection | Checkbox column, select all on page |
| Bulk Delete | Select multiple → Delete Selected → confirmation |
| CSV Export | Export up to 1000 matching researchers with all fields |
| Find Duplicates | Scans by email, name, ORCID, Google Scholar ID |
| Merge Duplicates | Select primary → merge keywords/proposals → delete secondary |

**API endpoints added:**
- `GET ?mode=duplicates` - Find potential duplicate researchers
- `POST` - Merge researchers (combines data, transfers associations)
- `PATCH` - Edit researcher info
- `DELETE` - Delete single or multiple researchers

**Key files:**
- `pages/api/reviewer-finder/researchers.js` - All CRUD + merge operations
- `pages/reviewer-finder.js` - ResearcherDetailModal with edit/delete, DuplicatesModal

**Session 27 Commits:**
- `c89a8d4` Add email tracking for reviewer candidates
- `18be0af` Add Database Tab Phase 3: researcher management features

## Priority Tasks for Session 28

### 1. Literature Analyzer App
- Currently placeholder, hidden from navigation
- Paper synthesis and citation analysis
- Consider integration with existing literature search services (PubMed, ArXiv, etc.)
- Potential features:
  - Upload PDFs of papers
  - Extract key findings, methods, conclusions
  - Generate synthesis across multiple papers
  - Citation network visualization

### 2. User Profiles (When Ready)
Phase 1 implementation:
- Create `user_profiles` and `user_preferences` tables
- Add profile selector component (simple dropdown, no auth)
- Move API key storage from localStorage to database
- Per-user model preferences

### 3. Reviewer Finder Enhancements
- Add reviewer response tracking dashboard/summary
- Export email tracking data to CSV
- Add "re-invite" workflow for non-responders

### 4. Documentation Updates
- Update CLAUDE.md with Session 27 features
- Add email tracking workflow to documentation
- Document merge duplicates feature

## Key Files Reference

**Email Tracking:**
- `pages/api/reviewer-finder/my-candidates.js` - Email status CRUD
- `pages/api/reviewer-finder/generate-emails.js` - Auto-mark as sent
- `shared/components/EmailGeneratorModal.js` - Mark as Sent checkbox

**Database Tab Phase 3:**
- `pages/api/reviewer-finder/researchers.js` - Full CRUD + duplicates + merge
- `pages/reviewer-finder.js` - DatabaseTab, ResearcherDetailModal, DuplicatesModal

**Model Configuration:**
- `shared/config/baseConfig.js` - APP_MODELS config and getModelForApp()
- `shared/utils/modelNames.js` - Model ID to friendly name mapping

**Navigation:**
- `shared/components/Layout.js` - Navigation items array

## Database Schema (Email Tracking Fields)

```sql
-- reviewer_suggestions table (existing columns now in use)
email_sent_at TIMESTAMP        -- When invitation was sent
response_type VARCHAR(50)      -- 'accepted', 'declined', 'no_response', 'bounced'
response_received_at TIMESTAMP -- When response was received
```

## Environment Variables

```
CLAUDE_API_KEY=        # Required
POSTGRES_URL=          # Auto-set by Vercel Postgres
SERP_API_KEY=          # Google/Scholar search (optional)
NCBI_API_KEY=          # Higher PubMed rate limits (optional)

# Per-app model overrides (optional)
CLAUDE_MODEL_CONCEPT_EVALUATOR=claude-sonnet-4-20250514
CLAUDE_MODEL_EXPENSE_REPORTER=claude-sonnet-4-20250514
```

## Running the App

```bash
npm run dev
# Access at http://localhost:3000
```

## Git Status

Branch: main

Session 27 commits:
- Add email tracking for reviewer candidates
- Add Database Tab Phase 3: researcher management features
