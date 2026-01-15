# Document Processing Suite - Session 23 Prompt

## Current State (as of January 14, 2026)

### App Suite Overview

The suite has 9 apps organized into categories:

| Category | Apps |
|----------|------|
| **Phase I** | Batch Phase I Summaries, Funding Analysis, Create Phase I Writeup Draft, Reviewer Finder |
| **Phase II** | Batch Phase II Summaries, Funding Analysis, Create Phase II Writeup Draft, Reviewer Finder, Summarize Peer Reviews |
| **Other Tools** | Expense Reporter, Literature Analyzer (coming soon) |

### Session 22 Summary

**Email Generation V6 - Complete:**

1. **Settings Modal Overhaul**
   - Reordered: Sender Info → Grant Cycle → Email Template → Attachments
   - Additional Attachments section for optional files
   - Review template upload via Vercel Blob
   - Grant cycle custom fields (proposalDueDate, honorarium, proposalSendDate, commitDate)

2. **Email Attachment Support**
   - MIME multipart/mixed format for .eml files
   - Auto-extracted project summary from proposal PDFs (pdf-lib)
   - Review template + additional attachments
   - Re-extract summary button in My Candidates tab

3. **Investigator Team Formatting**
   - `{{investigatorTeam}}` - formats PI + Co-PIs gracefully
   - `{{investigatorVerb}}` - "was" (singular) or "were" (plural)
   - Enhanced Co-PI extraction from proposals

4. **Bug Fixes**
   - Custom field date formatting (ISO → readable)
   - Template literal escaping for `${{...}}`
   - Extract summary API buffer handling
   - Subject-verb agreement

5. **Email Workflow Documentation**
   - .eml files open as "received" messages (format limitation)
   - Instructions: Forward and remove "Fwd:", or copy/paste
   - Future consideration documented for CRM/email service integration

### Reviewer Finder - Current State

Complete pipeline for finding expert reviewers:
1. **Claude Analysis** - Extract proposal metadata (PI, Co-PIs, abstract) and suggest reviewers
2. **Database Discovery** - Search PubMed, ArXiv, BioRxiv, ChemRxiv
3. **Contact Enrichment** - 5-tier system for emails and faculty pages
4. **Email Generation** - Create .eml files with attachments
5. **Database Tab** - Browse/search all saved researchers with detail modal

**Key Features:**
- Institution/expertise mismatch warnings
- Google Scholar profile links
- PI/author self-suggestion prevention
- Multi-field duplicate detection on save
- Multi-select operations (save, delete, email)
- Tag-based filtering in Database tab
- Settings gear icon (accessible before proposal upload)
- `{{investigatorTeam}}` and `{{investigatorVerb}}` placeholders

## Suggested Next Steps (Priority Order)

### 1. Database Tab Phase 3 - Management
- Edit researcher info directly in Database tab
- Delete researchers (with confirmation)
- Merge duplicate researchers
- Bulk export to CSV

### 2. Email Tracking
- Mark candidates as "email sent"
- Track response status (accepted, declined, no response)
- Use existing `email_sent_at`, `response_type` columns

### 3. Re-enrich Contacts Button
- Add button in My Candidates tab to re-run contact enrichment
- Currently must re-run full search to update contacts

### 4. Literature Analyzer App
- Currently "coming soon" placeholder
- Paper synthesis and citation analysis

### 5. CRM Integration (Future)
- Direct email sending via SendGrid/AWS SES
- Skip .eml workflow when CRM available
- See CLAUDE.md "Future Considerations" section

## Key Files Reference

**Email Generation:**
- `lib/utils/email-generator.js` - EML generation, investigatorTeam, date formatting
- `shared/components/EmailGeneratorModal.js` - Multi-step email workflow
- `shared/components/SettingsModal.js` - Settings UI with 4 sections
- `shared/components/EmailTemplateEditor.js` - Template editing with placeholders
- `pages/api/reviewer-finder/generate-emails.js` - SSE endpoint

**PDF Processing:**
- `lib/utils/pdf-extractor.js` - Page extraction using pdf-lib
- `pages/api/reviewer-finder/extract-summary.js` - Re-extract summary pages
- `pages/api/upload-file.js` - Direct FormData upload to Vercel Blob

**Database Tab:**
- `pages/reviewer-finder.js` - DatabaseTab, ResearcherRow, ResearcherDetailModal
- `pages/api/reviewer-finder/researchers.js` - GET endpoint with `?id=` for details
- `lib/services/database-service.js` - Keyword methods

**Reviewer Finder Core:**
- `pages/reviewer-finder.js` - Main page with 3 tabs
- `lib/services/discovery-service.js` - Multi-database search
- `lib/services/contact-enrichment-service.js` - 5-tier contact lookup
- `lib/services/deduplication-service.js` - Name matching, COI filtering
- `shared/config/prompts/reviewer-finder.js` - Analysis prompt with Co-PI extraction

**Utility Scripts:**
- `scripts/setup-database.js` - Database migrations (V1-V6)
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
Session 22 commits:
- Format custom date fields in email template
- Reorder Settings modal menu sections
- Add additional attachments support
- Add investigatorTeam/investigatorVerb placeholders
- Enhance Co-PI extraction and fallback handling
- Fix extract-summary API buffer handling
- Add email workflow instructions and documentation
