# Expert Reviewer Finder v2 - Session 14 Prompt

## Current State (as of December 17, 2025)

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
- API settings panel for ORCID, NCBI, and SerpAPI credentials
- Enrichment modal with tier selection, cost estimate, and progress display
- Export to Markdown/CSV includes contact info

### Session 13 Work

**Added SerpAPI Key to API Settings Panel**
- Users can now configure SerpAPI key via UI (no server env var required)
- Added to `ApiSettingsPanel.js` alongside ORCID and NCBI credentials
- Client-provided key takes priority over `SERP_API_KEY` env var
- Tier 4 option now shows "(Configure SerpAPI key in API Settings)" warning when not configured
- Key stored in localStorage with base64 encoding (same as other credentials)

### Current Tier System

| Tier | Source | Cost | Configuration |
|------|--------|------|---------------|
| 0 | Affiliation | Free | Automatic |
| 1 | PubMed | Free | Automatic |
| 2 | ORCID | Free | API Settings panel |
| 3 | Claude Web Search | ~$0.015 | Uses main Claude API key |
| 4 | SerpAPI Google | ~$0.005 | API Settings panel |

## Issues to Address Next Session

### 1. Claude Web Search Temperature Settings
The Claude call in Tier 3 (`contact-enrichment-service.js:claudeWebSearch()`) doesn't specify temperature. Consider:
- Optimal temperature for contact extraction (lower = more deterministic)
- Whether to make it configurable
- Current minimal prompt may benefit from tuning

### 2. Potential Enhancements
- Add success rate tracking for each tier (how often does each tier find contacts?)
- Consider parallel enrichment for faster processing
- Add "retry failed" button for candidates where enrichment found nothing

## Key Files Reference

**Frontend:**
- `pages/reviewer-finder.js` - Main page with all UI components
- `shared/components/ApiSettingsPanel.js` - API key management panel (ORCID, NCBI, SerpAPI)

**Services:**
- `lib/services/contact-enrichment-service.js` - 5-tier contact lookup orchestration
- `lib/services/serp-contact-service.js` - Google search via SerpAPI
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
SERP_API_KEY=          # Optional fallback: Tier 4 Google search
NCBI_API_KEY=          # Optional: Higher PubMed rate limits
```

Client-side credentials stored in localStorage via ApiSettingsPanel:
- ORCID Client ID
- ORCID Client Secret
- SerpAPI Key (new in Session 13)

## Running the App

```bash
npm run dev
# Access at http://localhost:3000/reviewer-finder
```

## Git Status

Branch: main
Recent commits:
- `f6d75b0` Add SerpAPI key to API Settings panel
- `5253d70` Update SESSION_PROMPT.md for Session 13
- `056aa20` Extract emails from affiliation strings (Tier 0)
- `03a6452` Include contact enrichment data in Markdown and CSV exports
- `4de0a13` Implement Tier 4: SerpAPI Google Search for contact enrichment
