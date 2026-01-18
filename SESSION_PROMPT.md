# Document Processing Suite - Session 28 Prompt

## Current State (as of January 18, 2026)

### App Suite Overview

The suite now has **10 active apps** (Literature Analyzer implemented this session):

| Category | Apps |
|----------|------|
| **Concepts** | Concept Evaluator |
| **Phase I** | Batch Phase I Summaries, Funding Analysis, Create Phase I Writeup Draft, Reviewer Finder |
| **Phase II** | Batch Phase II Summaries, Funding Analysis, Create Phase II Writeup Draft, Reviewer Finder, Summarize Peer Reviews |
| **Other Tools** | Expense Reporter, **Literature Analyzer** |

### Session 28 Progress

**1. Literature Analyzer App (Completed)**

Full implementation of paper analysis and synthesis:

| Feature | Description |
|---------|-------------|
| PDF Upload | Multi-file upload for research papers |
| Paper Extraction | Claude Vision extracts title, authors, abstract, methods, findings, conclusions |
| Cross-Paper Synthesis | Themes, consensus, disagreements, gaps, future directions |
| Tabbed Results | Switch between Synthesis and Individual Papers views |
| Focus Topic | Optional topic to focus synthesis on specific aspects |
| Export | JSON and Markdown export for literature review sections |

**Key files created:**
- `pages/literature-analyzer.js` - Frontend with PaperCard and SynthesisSection components
- `pages/api/analyze-literature.js` - Two-stage API (extraction + synthesis)
- `shared/config/prompts/literature-analyzer.js` - Extraction and synthesis prompts
- `shared/config/baseConfig.js` - Added model config for literature-analyzer

**Documentation updated:**
- `CLAUDE.md` - Added Literature Analyzer feature summary and model config
- Navigation enabled in `Layout.js`
- Landing page updated with active status

### Session 27 Summary (Previous Session)

**1. Email Tracking (Completed)**
- PATCH endpoint accepts `emailSentAt`, `responseType`, `responseReceivedAt`
- Generate emails modal marks candidates as sent with timestamp
- UI indicators for sent date and response tracking

**2. Database Tab Phase 3 - Researcher Management (Completed)**
- Edit/Delete researchers with confirmation
- Bulk selection and bulk delete
- CSV export, Find Duplicates, Merge Duplicates

## Remaining Priority Tasks for Session 28

### 1. User Profiles (When Ready)
Phase 1 implementation:
- Create `user_profiles` and `user_preferences` tables
- Add profile selector component (simple dropdown, no auth)
- Move API key storage from localStorage to database
- Per-user model preferences

### 2. Reviewer Finder Enhancements
- Add reviewer response tracking dashboard/summary
- Export email tracking data to CSV
- Add "re-invite" workflow for non-responders

### 3. Additional Documentation
- Add email tracking workflow to documentation
- Document merge duplicates feature

## Key Files Reference

**Literature Analyzer:**
- `pages/literature-analyzer.js` - Frontend with tabbed results
- `pages/api/analyze-literature.js` - Two-stage analysis API
- `shared/config/prompts/literature-analyzer.js` - Extraction and synthesis prompts

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

Session 28 commits (pending):
- Implement Literature Analyzer app
