# Expert Reviewer Finder v2 - Session 18 Prompt

## Current State (as of December 19, 2025)

The Expert Reviewer Finder is a multi-stage tool that:
1. **Claude Analysis** - Extracts proposal metadata (title, abstract, PI, institution) and suggests reviewers
2. **Database Discovery** - Searches PubMed, ArXiv, BioRxiv, and ChemRxiv for candidates
3. **Contact Enrichment** - 5-tier system to find email addresses and faculty pages
4. **Email Generation** - Creates .eml invitation files for selected candidates

### What's Working

**Core Pipeline:**
- Upload PDF → Claude analysis → Multi-database verification → Results display
- **4 database sources:** PubMed, ArXiv, BioRxiv, ChemRxiv (NEW in Session 17)
- Institution/expertise mismatch warnings for potentially wrong-person matches
- Google Scholar profile links for all candidates
- PI/author self-suggestion prevention (won't suggest the proposal authors as reviewers)
- Claude retry logic with fallback to Haiku model on rate limits
- Temperature control (0.3-1.0) and configurable reviewer count (1-25)
- Comprehensive search result logging in dev console

**Contact Enrichment (5-tier):**
| Tier | Source | Cost | Status |
|------|--------|------|--------|
| 0 | Affiliation parsing | Free | ✅ Working |
| 1 | PubMed | Free | ✅ Working |
| 2 | ORCID | Free | ✅ Working (needs credentials) |
| 3 | Claude Web Search | ~$0.015 | ✅ Working |
| 4 | SerpAPI Google | ~$0.005 | ✅ Working with Scholar fallback |

**Email Reviewers Feature:**
- Email settings panel (sender name, email, signature, grant cycle info)
- Template editor with placeholder insertion buttons
- Placeholders: `{{greeting}}`, `{{recipientName}}`, `{{proposalTitle}}`, `{{proposalAbstract}}`, `{{piName}}`, `{{programName}}`, `{{reviewDeadline}}`, `{{signature}}`
- Optional Claude personalization per email
- Generate .eml files for download (individual or ZIP bundle)

**My Candidates Tab:**
- Saved candidates with emails/websites visible on cards
- **Edit candidate info** (name, affiliation, email, website, h-index) - NEW in Session 17
- Multi-select deletion with checkboxes
- "Email Selected" button opens generation modal

**State Persistence:**
- Search results persist when switching between tabs
- Deterministic proposal IDs prevent duplicates in database

### Session 17 Work Summary

**Features Added:**
1. **Edit Saved Candidates** - Modal to update name, affiliation, email, website, h-index
2. **ChemRxiv Integration** - New chemistry preprint database source
3. **Search Result Logging** - Console shows candidate counts and sample names for each database
4. **Google Scholar Profiles API fix** - Removed deprecated API, uses Google search fallback

**Bugs Fixed:**
1. PI/Author self-suggestion as reviewer (fuzzy name matching filter)
2. ChemRxiv API 400 errors (fixed sort parameter: `RELEVANT_DESC`)
3. Google Scholar Profiles API deprecation

### Potential Next Steps

1. **Test ChemRxiv Integration**
   - Verify chemistry proposals get relevant ChemRxiv candidates
   - Check if results are being properly deduplicated

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

6. **Bulk Operations**
   - Bulk invite/accept toggle for multiple candidates
   - Export selected candidates to CSV

## Key Files Reference

**ChemRxiv (NEW):**
- `lib/services/chemrxiv-service.js` - ChemRxiv API integration

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
- `lib/services/discovery-service.js` - Multi-database verification (PubMed, ArXiv, BioRxiv, ChemRxiv)
- `lib/services/deduplication-service.js` - Name matching, COI filtering, PI exclusion
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
- `pages/api/reviewer-finder/my-candidates.js` - CRUD for saved candidates (PATCH extended for editing)
- `pages/api/reviewer-finder/generate-emails.js` - Email generation (SSE)

**Prompts:**
- `shared/config/prompts/reviewer-finder.js` - Analysis prompt (includes ChemRxiv queries)
- `shared/config/prompts/email-reviewer.js` - Email personalization

**Database:**
- `scripts/setup-database.js` - Migrations (currently at V5)
- `lib/services/database-service.js` - Database operations

**Test Scripts:**
- `scripts/test-contact-enrichment.js` - Test enrichment services
- `scripts/test-reviewer-finder.js` - Test reviewer discovery
- `scripts/debug-reviewer-finder.js` - Debug specific issues

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
- `8ef30b7` Add search result logging for all database sources
- `1e18d24` Fix ChemRxiv API 400 errors (sort parameter)
- `a01b7e4` Add ChemRxiv database search integration
- `3b9fbaf` Fix PI self-suggestion as reviewer bug
- `8b92201` Add edit saved candidates feature
- `16af684` Remove deprecated Google Scholar Profiles API
