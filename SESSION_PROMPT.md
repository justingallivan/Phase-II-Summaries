# Expert Reviewer Finder v2 - Session 17 Prompt

## Current State (as of December 19, 2025)

The Expert Reviewer Finder is a multi-stage tool that:
1. **Claude Analysis** - Extracts proposal metadata (title, abstract, PI, institution) and suggests reviewers
2. **PubMed Verification** - Verifies candidates exist with recent, relevant publications
3. **Contact Enrichment** - 5-tier system to find email addresses and faculty pages
4. **Email Generation** - Creates .eml invitation files for selected candidates

### What's Working

**Core Pipeline:**
- Upload PDF → Claude analysis → PubMed verification → Results display
- Institution/expertise mismatch warnings for potentially wrong-person matches
- Google Scholar profile links for all candidates
- Claude retry logic with fallback to Haiku model on rate limits
- Temperature control (0.3-1.0) and configurable reviewer count (1-25)

**Contact Enrichment (5-tier):**
| Tier | Source | Cost | Status |
|------|--------|------|--------|
| 0 | Affiliation parsing | Free | ✅ Working |
| 1 | PubMed | Free | ✅ Working |
| 2 | ORCID | Free | ✅ Working (needs credentials) |
| 3 | Claude Web Search | ~$0.015 | ✅ Working |
| 4 | SerpAPI Google | ~$0.005 | ✅ Working with Scholar fallback |

**Email Reviewers Feature (NEW in Session 16):**
- Email settings panel (sender name, email, signature, grant cycle info)
- Template editor with placeholder insertion buttons
- Placeholders: `{{greeting}}`, `{{recipientName}}`, `{{proposalTitle}}`, `{{proposalAbstract}}`, `{{piName}}`, `{{programName}}`, `{{reviewDeadline}}`, `{{signature}}`
- Optional Claude personalization per email
- Generate .eml files for download (individual or ZIP bundle)

**My Candidates Tab:**
- Saved candidates with emails/websites visible on cards
- Multi-select deletion with checkboxes
- "Email Selected" button opens generation modal

**State Persistence:**
- Search results persist when switching between tabs
- Deterministic proposal IDs prevent duplicates in database

### Session 16 Work Summary

**Features Added:**
1. Complete Email Reviewers feature with .eml generation
2. Abstract extraction during Claude analysis
3. Google Scholar profile fallback for SerpAPI 400 errors
4. Improved faculty page URL detection (international domains, more patterns)
5. Multiple SerpAPI fallback queries for better contact discovery

**Bugs Fixed:**
1. PI/Abstract missing from generated emails
2. Enriched contact info not saving to database
3. Duplicate proposals in database
4. Missing salutation in emails (added `{{greeting}}` placeholder)
5. Search results clearing on tab switch
6. State clearing on save (callback pattern support)
7. Google Scholar API 400 errors

### Potential Next Steps

1. **Test Email Generation End-to-End**
   - Verify .eml files open correctly in Outlook/Mail
   - Test Claude personalization option
   - Test ZIP download with multiple candidates

2. **Re-enrich Contacts Button**
   - Currently must re-run full search to re-enrich saved candidates
   - Add button in My Candidates to re-run contact enrichment

3. **Database Tab Implementation**
   - Browse all researchers in database
   - Search/filter by name, institution, expertise

4. **Contact Enrichment Success Tracking**
   - Track which tiers find contacts (for optimization)
   - Display tier source on candidate cards

5. **Email Tracking**
   - Mark candidates as "email sent"
   - Track response status (accepted, declined, no response)

## Key Files Reference

**Email Feature:**
- `lib/utils/email-generator.js` - EML generation and placeholders
- `shared/components/EmailSettingsPanel.js` - Sender/grant cycle settings
- `shared/components/EmailTemplateEditor.js` - Template editing UI
- `shared/components/EmailGeneratorModal.js` - Generation workflow
- `pages/api/reviewer-finder/generate-emails.js` - SSE generation endpoint
- `shared/config/prompts/email-reviewer.js` - Claude personalization prompt

**Core Services:**
- `lib/services/contact-enrichment-service.js` - 5-tier contact lookup
- `lib/services/claude-reviewer-service.js` - Claude analysis
- `lib/services/discovery-service.js` - PubMed verification
- `lib/services/serp-contact-service.js` - Google/Scholar search via SerpAPI
- `lib/services/orcid-service.js` - ORCID API

**Frontend:**
- `pages/reviewer-finder.js` - Main page with tabs (Search, My Candidates, Database)
- `shared/components/ApiSettingsPanel.js` - API key management

**API Endpoints:**
- `pages/api/reviewer-finder/analyze.js` - Claude analysis
- `pages/api/reviewer-finder/discover.js` - Verification
- `pages/api/reviewer-finder/enrich-contacts.js` - Contact enrichment (SSE)
- `pages/api/reviewer-finder/save-candidates.js` - Save to database
- `pages/api/reviewer-finder/my-candidates.js` - CRUD for saved candidates
- `pages/api/reviewer-finder/generate-emails.js` - Email generation (SSE)

**Prompts:**
- `shared/config/prompts/reviewer-finder.js` - Analysis prompt
- `shared/config/prompts/email-reviewer.js` - Email personalization

**Database:**
- `scripts/setup-database.js` - Migrations (currently at V5)
- `lib/services/database-service.js` - Database operations

**Test Scripts:**
- `scripts/test-contact-enrichment.js` - Test enrichment services

## Environment Variables

```
CLAUDE_API_KEY=        # Required for analysis and Tier 3 search
POSTGRES_URL=          # Auto-set by Vercel Postgres
SERP_API_KEY=          # Tier 4 Google/Scholar search
NCBI_API_KEY=          # Optional: Higher PubMed rate limits
```

Client-side credentials stored in localStorage via ApiSettingsPanel:
- ORCID Client ID / Secret
- SerpAPI Key (also used server-side for Tier 4)

## Running the App

```bash
npm run dev
# Access at http://localhost:3000/reviewer-finder
```

## Git Status

Branch: main
Recent commits:
- `6187951` Add fallback for Google Scholar API 400 errors
- `e0d7e07` Update SESSION_PROMPT.md with SSE fix commit
- `48ae63c` Fix SSE stream parsing with proper line buffering
- `03bfe43` Improve My Candidates tab: contact display and bulk deletion
- `0ff4f3d` Add configurable reviewer count slider and reorder UI

## Plan File

A detailed implementation plan exists at `~/.claude/plans/abundant-zooming-firefly.md` covering the email feature architecture. Most of this plan has been implemented.
