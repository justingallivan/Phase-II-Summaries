# Expert Reviewer Finder v2 - Session 15 Prompt

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
- **Temperature control for proposal analysis** (new in Session 14)

### Session 14 Work

**Added Temperature Control for Claude Proposal Analysis**
- Added "Reviewer Diversity" slider to UI (range 0.3-1.0, default 0.3)
- Labels: "Conservative" ↔ "Creative" with dynamic descriptions based on value
- Temperature passed through API chain to Claude service
- Set fixed low temperature (0.2) for Tier 3 contact enrichment (deterministic extraction)

| Temperature | Behavior |
|-------------|----------|
| 0.3-0.4 | More predictable, established reviewers |
| 0.5-0.6 | Balanced mix of established and diverse candidates |
| 0.7-0.8 | More diverse, potentially unconventional suggestions |
| 0.9-1.0 | Maximum creativity, broader range of candidates |

### Current Tier System

| Tier | Source | Cost | Configuration |
|------|--------|------|---------------|
| 0 | Affiliation | Free | Automatic |
| 1 | PubMed | Free | Automatic |
| 2 | ORCID | Free | API Settings panel |
| 3 | Claude Web Search | ~$0.015 | Uses main Claude API key (temp=0.2) |
| 4 | SerpAPI Google | ~$0.005 | API Settings panel |

## Issues to Address Next Session

### Potential Enhancements
- Add success rate tracking for each tier (how often does each tier find contacts?)
- Consider parallel enrichment for faster processing
- Add "retry failed" button for candidates where enrichment found nothing

## Key Files Reference

**Frontend:**
- `pages/reviewer-finder.js` - Main page with all UI components (includes temperature slider)
- `shared/components/ApiSettingsPanel.js` - API key management panel (ORCID, NCBI, SerpAPI)

**Services:**
- `lib/services/contact-enrichment-service.js` - 5-tier contact lookup (Tier 3 uses temp=0.2)
- `lib/services/serp-contact-service.js` - Google search via SerpAPI
- `lib/services/claude-reviewer-service.js` - Claude analysis with retry/fallback and temperature support
- `lib/services/discovery-service.js` - Verification and mismatch detection
- `lib/services/orcid-service.js` - ORCID API integration
- `lib/services/pubmed-service.js` - PubMed API queries

**API Endpoints:**
- `pages/api/reviewer-finder/analyze.js` - Claude analysis (accepts temperature param)
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
- SerpAPI Key

## Running the App

```bash
npm run dev
# Access at http://localhost:3000/reviewer-finder
```

## Git Status

Branch: main
Recent commits:
- `ae89f0a` Add temperature control for Claude proposal analysis
- `283c6d8` Update SESSION_PROMPT.md for Session 14
- `f6d75b0` Add SerpAPI key to API Settings panel
- `5253d70` Update SESSION_PROMPT.md for Session 13
- `056aa20` Extract emails from affiliation strings (Tier 0)
