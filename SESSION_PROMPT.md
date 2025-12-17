# Expert Reviewer Finder v2 - Session 13 Prompt

## Current State (as of December 16, 2025)

The Expert Reviewer Finder is a multi-stage tool that:
1. **Claude Analysis** - Extracts proposal metadata and suggests 10-15 expert reviewers
2. **PubMed Verification** - Verifies candidates exist with recent, relevant publications
3. **Contact Enrichment** - Finds email addresses and faculty pages for selected candidates

### What's Working
- Full search pipeline: Upload PDF → Claude analysis → PubMed verification → Results display
- Institution/expertise mismatch warnings for potentially wrong-person matches
- Google Scholar profile links for all candidates
- Claude retry logic with fallback to Haiku model on rate limits
- Contact enrichment with 5-tier system (see below)
- API settings panel for ORCID/NCBI credentials
- Enrichment modal with tier selection, cost estimate, and progress display
- Export to Markdown/CSV now includes contact info

### Session 12 Work

**Implemented Tier 4: SerpAPI Google Search**
- Added `lib/services/serp-contact-service.js` - Google search via SerpAPI
- Searches: `"FirstName LastName" institution email`
- Extracts emails from snippets, finds faculty page URLs
- Cost: ~$0.005 per search (cheaper than Claude's $0.015)
- Blue-themed UI in enrichment modal

**Fixed: Contact info not saving after enrichment**
- Added `applyEnrichmentResults()` function to merge enriched data into UI state
- Changed "Done" button to "Save & Close"
- Contact info now displays on candidate cards (email, website, ORCID badges)

**Fixed: Export not including contact info**
- Markdown export now includes Contact section
- CSV export now has Email, Email_Source, Website, ORCID columns

**Fixed: Emails in affiliation strings not captured (Tier 0)**
- Added check for embedded emails in affiliation field
- PubMed often includes "Electronic address: email@domain.com"
- Runs before all other tiers, returns immediately if found

### Current Tier System

| Tier | Source | Cost | Description |
|------|--------|------|-------------|
| 0 | Affiliation | Free | Extract email embedded in affiliation string |
| 1 | PubMed | Free | Extract email from publication affiliations |
| 2 | ORCID | Free | API lookup (requires credentials) |
| 3 | Claude Web Search | ~$0.015 | AI-powered web search |
| 4 | SerpAPI Google | ~$0.005 | Google search for faculty pages |

## Issues to Address Next Session

### 1. SerpAPI Key Not in API Settings Panel
The `ApiSettingsPanel.js` only shows ORCID and NCBI key fields. SerpAPI key is server-side only (`SERP_API_KEY` env var). Options:
- Add to ApiSettingsPanel for client-side configuration
- Or add status indicator showing if server has it configured

### 2. Claude Web Search Temperature Settings
The Claude call in Tier 3 (`contact-enrichment-service.js:claudeWebSearch()`) doesn't specify temperature. Should discuss:
- Optimal temperature for contact extraction (lower = more deterministic)
- Whether to make it configurable
- Current minimal prompt may benefit from tuning

## Key Files Reference

**Frontend:**
- `pages/reviewer-finder.js` - Main page with all UI components
- `shared/components/ApiSettingsPanel.js` - API key management panel

**Services:**
- `lib/services/contact-enrichment-service.js` - 5-tier contact lookup orchestration
- `lib/services/serp-contact-service.js` - NEW: Google search via SerpAPI
- `lib/services/claude-reviewer-service.js` - Claude analysis with retry/fallback
- `lib/services/discovery-service.js` - Verification and mismatch detection
- `lib/services/orcid-service.js` - ORCID API integration
- `lib/services/pubmed-service.js` - PubMed API queries

**API Endpoints:**
- `pages/api/reviewer-finder/analyze.js` - Claude analysis
- `pages/api/reviewer-finder/discover.js` - Verification + discovery
- `pages/api/reviewer-finder/enrich-contacts.js` - Contact enrichment (SSE)

**Database:**
- `scripts/setup-database.js` - Migration script (includes v3 contact fields)
- `lib/services/database-service.js` - Database CRUD operations

## Environment Variables

```
CLAUDE_API_KEY=        # Required for analysis and Tier 3 search
POSTGRES_URL=          # Auto-set by Vercel Postgres
SERP_API_KEY=          # Optional: Tier 4 Google search + Google Scholar
NCBI_API_KEY=          # Optional: Higher PubMed rate limits
```

ORCID credentials stored in localStorage via ApiSettingsPanel:
- ORCID Client ID
- ORCID Client Secret

## Running the App

```bash
npm run dev
# Access at http://localhost:3000/reviewer-finder
```

## Git Status

Branch: main
Recent commits (Session 12):
- `056aa20` Extract emails from affiliation strings (Tier 0)
- `03a6452` Include contact enrichment data in Markdown and CSV exports
- `d47636e` Fix contact enrichment results not being saved to UI state
- `4de0a13` Implement Tier 4: SerpAPI Google Search for contact enrichment
- `da4502b` Refactor CLAUDE.md: split development log into separate file
