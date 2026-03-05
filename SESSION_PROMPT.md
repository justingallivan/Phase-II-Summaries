# Session 76 Prompt: Next Steps

## Session 75 Summary

Fixed integrity screener URL issues and action type display, renamed proposal-summarizer to phase-ii-writeup with full URL/DB migration, and rewrote the Word export to match the new J27 template from leadership.

### What Was Completed

1. **Integrity Screener Source URL Fix**
   - Split semicolon-concatenated Retraction Watch URLs — now uses only the first (article) URL for "View Source" links
   - Fixed across HTML, markdown export, and PDF export paths

2. **Integrity Screener Action Type Badges**
   - Promoted `retractionNature` field to a colored badge displayed prominently on each match card
   - Red badge for retractions, yellow for expressions of concern
   - Renamed "Retraction Date" to "Date" since not all entries are retractions
   - Renamed "Nature" to "Action" in markdown and PDF exports, moved earlier in display order

3. **Rename proposal-summarizer to phase-ii-writeup**
   - Renamed page files: `proposal-summarizer.js` → `phase-ii-writeup.js` (and legacy)
   - Updated app key from `proposal-summarizer` to `phase-ii-writeup` in appRegistry, all API routes (`process.js`, `process-legacy.js`, `qa.js`, `refine.js`), and backfill script
   - Added 301 redirect in `next.config.js` from `/proposal-summarizer` to `/phase-ii-writeup`
   - V22 DB migration in `setup-database.js` renames app key in `user_app_access` (7 rows updated)

4. **Word Export: New J27 Template**
   - Rewrote `shared/utils/word-export.js` to match the new template from leadership
   - **Page 1 header area**: Borderless two-column table with Keck Foundation logo (left, `public/keck-logo.png`) and right-aligned institution name, city/state, program line
   - **Metadata fields**: Tab-aligned two-column layout (Meeting Date/Staff Lead/Recommendation on left, Requested Amount/Invited Amount/Project Budget right-aligned on right)
   - **Project Title**: Right-aligned tab value
   - **Page header**: Simplified to `Phase II Review` + `Page N` (pages 2+ only, no header on page 1)
   - **Section headings**: Bold Normal style instead of Heading 1
   - **Removed**: old table-based layout, short title field, PI name in header, city/state in old position
   - **New extracted fields**: `meeting_date`, `invited_amount`, `total_project_cost` added to structured data extraction prompt
   - Export modal simplified — pre-fills from proposal cover page data, Staff Lead shown as read-only (set in main form)

5. **IT Meeting Requirements Document** (from this machine)
   - Created `docs/IT_MEETING_GRAPH_API_REQUIREMENTS.md` for IT meeting on Microsoft Graph integration
   - Covers SharePoint document access (`Sites.Read.All`, `Files.Read.All`) and three email sending options
   - Recommended Option A: Dynamics 365 Email Activities (no new Azure AD permissions, just `prvSendEmail` role)
   - Option B: Graph Mail API with Application Access Policy instructions
   - Option C: Customer Insights - Journeys (may require additional licensing)

### Key Decisions from IT Meeting

*(Fill in after the meeting — what did IT approve?)*
- SharePoint approach: _____
- Email approach (Option A/B/C): _____
- App registration: extend existing or new? _____
- Sending mailbox: _____

### Commits
- `2da54ad` - Fix integrity screener: split concatenated URLs, promote action type badges
- `1451488` - Rename proposal-summarizer to phase-ii-writeup, update Word export to new template

## Deferred Items (Carried Forward)

- SharePoint document access (blocked on Azure AD admin consent)
- Dynamics Explorer search heuristics & query optimization
- Email notifications via Graph API (deferred until `Mail.Send` permission granted)
- next-auth v5 migration (still in beta)

## Potential Next Steps

### 1. Implement Microsoft Graph Integration
Based on IT meeting outcomes (see `docs/IT_MEETING_GRAPH_API_REQUIREMENTS.md`):
- **SharePoint access**: Add Graph authentication, resolve `sharepointdocumentlocation` entities to drive items, retrieve file content
- **Email sending**: Replace `.eml` file generation with direct sending (via Dynamics Email Activities or Graph Mail API)
- New service class needed (e.g., `lib/services/graph-service.js` for SharePoint, or extend `dynamics-service.js` for email activities)

### 2. Word Export Refinements
- Test with more proposals to verify field extraction and layout consistency
- Graphical abstract page (image upload for page 2)
- Batch Word export (ZIP of .docx files)

### 3. Batch Proposal Summaries Q&A
The batch page (`batch-proposal-summaries.js`) uses the same ResultsDisplay component but may need its own Q&A wiring to pass extractedText through.

### 4. Phase I Writeup Q&A
Apply the same streaming Q&A pattern to Phase I writeups (`phase-i-writeup.js`, `batch-phase-i-summaries.js`).

### 5. Prompt Caching for Other Endpoints
The same `cache_control` pattern could be applied to other endpoints that send large repeated context (e.g., batch processing, concept evaluator).

### 6. Production Deployment
Push to Vercel and verify all changes work in production (URL rename redirect, DB migration, logo asset).

## Key Files Reference

| File | Purpose |
|------|---------|
| `docs/IT_MEETING_GRAPH_API_REQUIREMENTS.md` | IT meeting requirements (SharePoint + email) |
| `docs/SECURITY_ARCHITECTURE.md` | Security architecture and threat model |
| `pages/phase-ii-writeup.js` | Phase II writeup page with Word export modal |
| `shared/utils/word-export.js` | Word document generator matching J27 template |
| `shared/config/appRegistry.js` | App registry (key: `phase-ii-writeup`) |
| `lib/services/dynamics-service.js` | Dynamics API service (OAuth, OData queries) |
| `lib/utils/email-generator.js` | Current .eml file generation |
| `pages/integrity-screener.js` | Integrity screener with URL fix and action badges |

## Testing

```bash
npm run dev                    # Start dev server
npm run build                  # Verify no build errors
# Phase II Writeup: upload proposal, verify Word export (logo, fields, layout)
# Test /proposal-summarizer redirects to /phase-ii-writeup
# Integrity Screener: verify "View Source" links are clean single URLs
# Verify action type badges (red for retraction, yellow for expression of concern)
node scripts/setup-database.js # Run V22 migration on new environments
```
