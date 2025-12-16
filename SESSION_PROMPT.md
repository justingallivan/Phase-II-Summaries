# Expert Reviewer Finder v2 - Session 12 Prompt

## Current State (as of December 16, 2025)

The Expert Reviewer Finder is a multi-stage tool that:
1. **Claude Analysis** - Extracts proposal metadata and suggests 10-15 expert reviewers
2. **PubMed Verification** - Verifies candidates exist with recent, relevant publications
3. **Contact Enrichment** - NEW! Finds email addresses and faculty pages for selected candidates

### What's Working
- Full search pipeline: Upload PDF → Claude analysis → PubMed verification → Results display
- Institution/expertise mismatch warnings for potentially wrong-person matches
- Google Scholar profile links for all candidates
- Claude retry logic with fallback to Haiku model on rate limits
- Contact enrichment with 3-tier system (PubMed → ORCID → Claude Web Search)
- API settings panel for ORCID credentials
- Enrichment modal with tier selection, cost estimate, and progress display

### Recent Session 11 Work (Contact Enrichment)
Implemented Phase 3: Contact Enrichment system with:
- **Tier 1: PubMed** (Free) - Extract emails from publication affiliations
- **Tier 2: ORCID** (Free) - API lookup for email, website, ORCID ID (requires credentials)
- **Tier 3: Claude Web Search** (Paid ~$0.015/candidate) - AI-powered faculty page search

Key files created:
- `shared/components/ApiSettingsPanel.js` - ORCID/NCBI key management
- `lib/utils/contact-parser.js` - Email extraction from affiliations
- `lib/services/orcid-service.js` - ORCID API integration
- `lib/services/contact-enrichment-service.js` - Tiered lookup orchestration
- `pages/api/reviewer-finder/enrich-contacts.js` - SSE streaming endpoint

Bugs fixed in Session 11:
- ORCID checkbox appearing checked when credentials not configured
- Generic directory URLs being returned as "website" (added quality filter)
- Claude API rate limits (switched to Haiku, reduced prompt)
- Unclear progress UI during enrichment

## Testing Needed

The user mentioned they still need to perform more tests on the contact enrichment feature. Key areas to verify:
1. PubMed email extraction from recent publications
2. ORCID lookup when credentials are configured
3. Claude Web Search fallback when Tiers 1-2 fail
4. URL quality filtering (no generic directory pages)
5. Enrichment results display and database persistence

## Priority Tasks for Next Session

### Immediate (User Testing Feedback)
- Address any bugs/issues discovered during user testing of contact enrichment
- Verify the 3-tier fallback logic works correctly

### Phase 4: Database Browser Tab (Planned)
- Create a tab to browse/search the growing database of verified researchers
- Show contact enrichment status (has email, ORCID, etc.)
- Allow re-running enrichment on previously found candidates

### Phase 5: Export & Polish (Planned)
- Export selected candidates with contact info to CSV/Excel
- Email template generation for outreach
- Polish UI/UX based on user feedback

## Key Files Reference

**Frontend:**
- `pages/reviewer-finder.js` - Main page with all UI components
- `shared/components/ApiSettingsPanel.js` - API key management panel

**Services:**
- `lib/services/claude-reviewer-service.js` - Claude analysis with retry/fallback
- `lib/services/discovery-service.js` - Verification and mismatch detection
- `lib/services/contact-enrichment-service.js` - 3-tier contact lookup
- `lib/services/orcid-service.js` - ORCID API integration
- `lib/services/pubmed-service.js` - PubMed API queries

**API Endpoints:**
- `pages/api/reviewer-finder/analyze.js` - Claude analysis
- `pages/api/reviewer-finder/discover.js` - Verification + discovery
- `pages/api/reviewer-finder/enrich-contacts.js` - Contact enrichment (SSE)

**Database:**
- `scripts/setup-database.js` - Migration script (includes v3 contact fields)
- `lib/db/migrations/002_contact_enrichment.sql` - Contact schema additions
- `lib/services/database-service.js` - Database CRUD operations

## Environment Variables Required

```
CLAUDE_API_KEY=        # Required for analysis and Tier 3 search
POSTGRES_URL=          # Auto-set by Vercel Postgres
SERP_API_KEY=          # Optional: Google Scholar via SerpAPI
NCBI_API_KEY=          # Optional: Higher PubMed rate limits
```

ORCID credentials are stored in localStorage via the UI:
- ORCID Client ID
- ORCID Client Secret

## Running the App

```bash
npm run dev
# Access at http://localhost:3000/reviewer-finder
```

## Git Status

Branch: main
Recent commits:
- `de5cac3` Fix ORCID checkbox appearing checked when credentials missing
- `d0ef0e5` Update documentation for Session 10
- Earlier commits for Session 10 mismatch detection features
