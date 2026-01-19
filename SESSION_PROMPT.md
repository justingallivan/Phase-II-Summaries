# Document Processing Suite - Session 29 Prompt

## Current State (as of January 18, 2026)

### App Suite Overview

The suite has **10 active apps**:

| Category | Apps |
|----------|------|
| **Concepts** | Concept Evaluator |
| **Phase I** | Batch Phase I Summaries, Funding Analysis, Create Phase I Writeup Draft, Reviewer Finder |
| **Phase II** | Batch Phase II Summaries, Funding Analysis, Create Phase II Writeup Draft, Reviewer Finder, Summarize Peer Reviews |
| **Other Tools** | Expense Reporter, Literature Analyzer |

### Session 28 Summary (Completed)

**1. Response Tracking Dashboard (Completed)**
- Visual metrics cards: Not Invited, Invited, Awaiting, Accepted, Declined, Bounced
- Click-to-filter functionality on each metric card
- Response rate and acceptance rate calculations
- Color-coded "days since sent" indicators on candidate cards (gray <7d, yellow 7-14d, red >14d)

**2. Email Tracking CSV Export (Completed)**
- Export button in My Candidates tab header
- Includes: proposal info, reviewer info, email sent date, days since sent, response type, response date, notes
- Filename includes cycle name and date

**3. Re-invite Workflow (Completed)**
- "Select Pending" button to quickly select all non-responders
- "Re-invite" button for follow-up emails
- Dedicated follow-up email template with appropriate language
- Follow-up mode indicator in email generation modal

**4. Grant Cycle Improvements (Completed)**
- Fixed duplicate cycles bug in database and API
- Added "Show all cycles" option to dropdown
- Default shows rolling 18-month window (4 cycles)
- Expandable to show all active cycles sorted newest-first
- Added cleanup script: `scripts/cleanup-duplicate-cycles.js`

**5. Documentation Updates (Completed)**
- Added Microsoft Dynamics 365 integration notes to CLAUDE.md
- Documents future email tracking integration path via Dynamics webhooks
- Notes about `email_opened_at` field reserved for Dynamics integration

### Session 27 Summary (Previous)

- Email tracking fields and UI
- Database Tab Phase 3: researcher management, merge duplicates

## Remaining Priority Tasks for Session 29

### 1. User Profiles (When Ready)
Phase 1 implementation:
- Create `user_profiles` and `user_preferences` tables
- Add profile selector component (simple dropdown, no auth)
- Move API key storage from localStorage to database
- Per-user model preferences

### 2. Additional Documentation
- Document response tracking dashboard features
- Document re-invite workflow

### 3. Future Enhancements (Low Priority)
- Email open tracking via Dynamics 365 integration
- Response tracking charts/visualizations
- Automated reminder system for non-responders

## Key Files Reference

**Response Tracking Dashboard:**
- `pages/reviewer-finder.js` - MyCandidatesTab with metrics dashboard, CSV export, re-invite workflow
- `shared/components/EmailGeneratorModal.js` - Follow-up email template support

**Grant Cycles:**
- `pages/api/reviewer-finder/grant-cycles.js` - Duplicate prevention on create
- `scripts/cleanup-duplicate-cycles.js` - Database cleanup utility

**Literature Analyzer:**
- `pages/literature-analyzer.js` - Frontend with tabbed results
- `pages/api/analyze-literature.js` - Two-stage analysis API
- `shared/config/prompts/literature-analyzer.js` - Extraction and synthesis prompts

**Email Tracking:**
- `pages/api/reviewer-finder/my-candidates.js` - Email status CRUD
- `pages/api/reviewer-finder/generate-emails.js` - Auto-mark as sent

**Database Tab:**
- `pages/api/reviewer-finder/researchers.js` - Full CRUD + duplicates + merge
- `pages/reviewer-finder.js` - DatabaseTab, ResearcherDetailModal, DuplicatesModal

## Environment Variables

```
CLAUDE_API_KEY=        # Required
POSTGRES_URL=          # Auto-set by Vercel Postgres
SERP_API_KEY=          # Google/Scholar search (optional)
NCBI_API_KEY=          # Higher PubMed rate limits (optional)

# Per-app model overrides (optional)
CLAUDE_MODEL_CONCEPT_EVALUATOR=claude-sonnet-4-20250514
CLAUDE_MODEL_LITERATURE_ANALYZER=claude-sonnet-4-20250514
CLAUDE_MODEL_EXPENSE_REPORTER=claude-sonnet-4-20250514
```

## Running the App

```bash
npm run dev
# Access at http://localhost:3000
```

## Git Status

Branch: main

Session 28 commits:
- f6df26f Add "Show all cycles" option to grant cycle dropdown
- ae802aa Fix duplicate grant cycles in dropdown
- 4ef347b Add response tracking dashboard and re-invite workflow for Reviewer Finder
- 75559e3 Implement Literature Analyzer app for paper analysis and synthesis
