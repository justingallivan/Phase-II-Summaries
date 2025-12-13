# Expert Reviewer Finder v2 - Implementation Checklist

**Last Updated:** December 12, 2025
**Status:** Phase 1 Core Pipeline Complete - Ready for Testing

---

## Phase 1: Core Pipeline

### Stage 1 - Claude Analysis
- [x] Create `lib/services/claude-reviewer-service.js`
  - [x] Implement `analyzeProposal(proposalText, additionalNotes)`
  - [x] Generate reviewer suggestions with detailed reasoning
  - [x] Generate optimized search queries for each database
  - [x] Extract potential reviewers from references
  - [x] Return structured JSON output
- [x] Create `shared/config/prompts/reviewer-finder.js`
  - [x] Analysis prompt (combines extraction + suggestions + queries)
  - [x] Reasoning generation prompt (for discovered candidates)
- [x] Create `pages/api/reviewer-finder/analyze.js`
  - [x] Accept file upload (reuse existing blob handling)
  - [x] Call Claude analysis service
  - [x] Return structured results via SSE streaming

### Stage 2 - Database Discovery
- [x] Create `lib/services/discovery-service.js`
  - [x] Track A: Verify Claude's suggestions via PubMed
  - [x] Track B: Discover new candidates via database searches
  - [x] Filter: 3+ publications in last 5 years
  - [x] Deduplicate across sources
  - [x] COI filter (exclude author's institution)
- [ ] Create `lib/services/rate-limiter.js` (DEFERRED - using per-service delays)
  - Per decision: Keep existing per-service rate limiting approach
  - PubMed: 400ms delay between requests
  - ArXiv: 3000ms delay between requests
  - BioRxiv: 1000ms delay between requests
- [x] Create `pages/api/reviewer-finder/discover.js`
  - [x] Orchestrate verification + discovery
  - [x] Stream progress updates (SSE)
  - [x] Return combined candidate list with reasoning

### Basic UI
- [x] Create `pages/reviewer-finder.js`
  - [x] Three-tab structure (New Search, My Candidates, Database)
  - [x] File upload component (reuse FileUploaderSimple)
  - [x] Configuration options (sources, excluded names, notes)
  - [x] Progress indicators for each stage
- [x] Results display
  - [x] Candidate cards with reasoning
  - [x] Publication links
  - [x] Verification status
  - [x] Selection checkboxes
- [x] Add to navigation (Layout.js)
- [x] Add to homepage (index.js)

### Database Schema
- [x] Create `lib/db/schema-v2.sql`
  - [x] Add proposal_searches table
  - [x] Add google_scholar_url column to researchers
  - [x] Add orcid_url column to researchers
  - [x] Add metrics_updated_at column to researchers
  - [x] Add url column to publications
  - [x] Add new indexes
- [x] Update `scripts/setup-database.js` for v2 migration
  - [x] Backwards-compatible ALTER TABLE statements
  - [x] Safe to run on existing databases

### Testing Phase 1
- [ ] Test with biology/biomedical proposal
- [ ] Test with CS/physics proposal
- [ ] Verify Claude generates good queries
- [ ] Verify deduplication works correctly
- [ ] Verify COI filtering works
- [ ] Check candidate quality
- [ ] Run database migration on Vercel Postgres

---

## Phase 2: Selection & Storage

### Candidate Management
- [ ] Create `pages/api/reviewer-finder/candidates.js`
  - [ ] GET: List saved candidates
  - [ ] POST: Save selected candidates
  - [ ] DELETE: Remove candidates
- [ ] Implement "My Candidates" tab
  - [ ] Group by proposal
  - [ ] Show enrichment status
  - [ ] Bulk actions

---

## Phase 3: Enrichment (Deferred)

### Google Scholar Integration
- [ ] Create `lib/services/enrichment-service.js`
  - [ ] Check database first (avoid paid lookups)
  - [ ] SerpAPI integration for Google Scholar
  - [ ] Store results permanently
- [ ] Create `pages/api/reviewer-finder/enrich.js`
  - [ ] Calculate cost estimate
  - [ ] Process selected candidates
  - [ ] Return enriched profiles

### Cost Estimate UI
- [ ] Show candidates already in DB (free)
- [ ] Show candidates needing lookup (paid)
- [ ] Calculate and display total cost
- [ ] Confirmation dialog

---

## Phase 4: Database Browser

- [ ] Implement "Database" tab
  - [ ] Search by name, institution, field
  - [ ] Filter by has email, has h-index
  - [ ] Sort options
- [ ] Create `pages/api/reviewer-finder/database.js`
  - [ ] GET: Search/list researchers
  - [ ] GET /[id]: Get single researcher profile
- [ ] Researcher profile view
  - [ ] All stored data
  - [ ] Publication history
  - [ ] Link to Google Scholar (if available)

---

## Phase 5: Export & Polish

### Export Formats
- [ ] CSV export
- [ ] Markdown export
- [ ] JSON export
- [ ] PDF export (`shared/utils/pdf-export.js`)

### Polish
- [ ] Progress persistence
- [ ] Batch operations
- [ ] Error handling improvements
- [ ] Loading states
- [ ] Mobile responsiveness

---

## Future (Not This Release)

- [ ] Multi-user authentication
- [ ] Per-user saved candidates
- [ ] Usage analytics
- [ ] ORCID API integration
- [ ] Admin dashboard

---

## Files Created/Modified (Phase 1)

### New Files
- `shared/config/prompts/reviewer-finder.js` - Analysis and reasoning prompts
- `lib/services/claude-reviewer-service.js` - Stage 1 Claude API service
- `lib/services/discovery-service.js` - Stage 2 discovery orchestration
- `lib/db/schema-v2.sql` - Schema additions (backwards-compatible)
- `pages/api/reviewer-finder/analyze.js` - Stage 1 API endpoint
- `pages/api/reviewer-finder/discover.js` - Stage 2 API endpoint
- `pages/reviewer-finder.js` - Main UI with 3-tab interface

### Modified Files
- `scripts/setup-database.js` - Added v2 schema migrations
- `shared/components/Layout.js` - Added navigation link
- `pages/index.js` - Added app to homepage

---

## Notes

- Keep existing apps (`/find-reviewers`, `/find-reviewers-pro`) running during development
- Test thoroughly before deprecating old apps
- Google Scholar (SerpAPI) integration deferred until free APIs validated
- Rate limiting kept per-service (not centralized) per user preference
- Schema v2 is backwards-compatible - can run on existing database

---

## Next Steps

1. **Run database migration**: `node scripts/setup-database.js`
2. **Start dev server**: `npm run dev`
3. **Test with sample proposal**: Upload a PDF and verify the full pipeline
4. **Validate results**: Check quality of suggestions and discovered candidates
