# Expert Reviewer Finder v2 - Session 15 Prompt

## Current State (as of December 17, 2025)

The Expert Reviewer Finder is a multi-stage tool that:
1. **Claude Analysis** - Extracts proposal metadata and suggests reviewers (configurable count)
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
- **Temperature control** for proposal analysis (0.3-1.0, default 0.3)
- **Configurable reviewer count** (1-25, default 12)
- **My Candidates tab** with contact display, multi-select deletion

### Session 14 Work

**Added Temperature and Reviewer Count Controls**
- "Reviewer Diversity" slider (0.3-1.0, default 0.3) - controls Claude temperature
- "Number of Candidates" slider (1-25, default 12) - controls how many reviewers Claude suggests
- Fixed low temperature (0.2) for Tier 3 contact enrichment
- Reordered UI: Search Sources → Number of Candidates → Reviewer Diversity → Excluded Names → Additional Context

**Improved My Candidates Tab**
- Email/website links now visible directly on cards (not hidden in details)
- Extracts emails from affiliation strings when email field is null
- Multi-select deletion with checkboxes per candidate
- Select-all checkbox per proposal (with indeterminate state)
- "Delete Selected (N)" button for bulk removal

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
- Add "Re-enrich contacts" button for saved candidates (currently must re-run search)
- Add success rate tracking for each tier (how often does each tier find contacts?)
- Consider parallel enrichment for faster processing
- Database tab implementation (browse all researchers)

## Key Files Reference

**Frontend:**
- `pages/reviewer-finder.js` - Main page with all UI components
- `shared/components/ApiSettingsPanel.js` - API key management panel

**Services:**
- `lib/services/contact-enrichment-service.js` - 5-tier contact lookup (Tier 3 uses temp=0.2)
- `lib/services/claude-reviewer-service.js` - Claude analysis with temperature and reviewer count
- `lib/services/discovery-service.js` - Verification and mismatch detection
- `lib/services/orcid-service.js` - ORCID API integration
- `lib/services/pubmed-service.js` - PubMed API queries
- `lib/services/serp-contact-service.js` - Google search via SerpAPI

**API Endpoints:**
- `pages/api/reviewer-finder/analyze.js` - Claude analysis (accepts temperature, reviewerCount)
- `pages/api/reviewer-finder/discover.js` - Verification + discovery
- `pages/api/reviewer-finder/enrich-contacts.js` - Contact enrichment (SSE)
- `pages/api/reviewer-finder/my-candidates.js` - CRUD for saved candidates

**Prompts:**
- `shared/config/prompts/reviewer-finder.js` - Analysis prompt with dynamic reviewer count

**Database:**
- `scripts/setup-database.js` - Migration script
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
- `48ae63c` Fix SSE stream parsing with proper line buffering
- `03bfe43` Improve My Candidates tab: contact display and bulk deletion
- `0ff4f3d` Add configurable reviewer count slider and reorder UI
- `ae89f0a` Add temperature control for Claude proposal analysis
- `a5d9522` Update SESSION_PROMPT.md for Session 15
