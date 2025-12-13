# Expert Reviewer Finder v2 - Session Prompt

Continue working on the Expert Reviewer Finder v2 app at:
`/Users/gallivan/Library/Mobile Documents/com~apple~CloudDocs/Documents/Programming/ClaudeCode/Grant_Review_Packages/Phase-II-Summaries`

## Before Starting: Review Architecture

**IMPORTANT:** Before making any changes, read `CLAUDE.md` to understand the overall project architecture. This is a multi-application document processing system with shared components. Key architectural concepts:

- Shared components in `/shared/` (Layout, FileUploader, ResultsDisplay, etc.)
- App-specific code in `/pages/` and `/lib/`
- Prompts in `/shared/config/prompts/`
- API routes in `/pages/api/`

## Context

**Previous session (December 13, 2025 - Session 6):** Activated Save/Export buttons:

1. **Save to My Candidates** - Now functional
   - Creates `save-candidates.js` API to persist to Postgres
   - Stores in `reviewer_suggestions` table with `selected=true`
   - Creates researcher records if they don't exist
2. **Export Selected** - Now functional
   - Export Markdown: Full details with publications and COI warnings
   - Export CSV: Tabular format for spreadsheets
3. **My Candidates tab** - Now functional
   - Fetches saved candidates grouped by proposal
   - Shows Invited/Accepted status toggles
   - Notes field for each candidate
   - Remove from list functionality

**Previous sessions:**
- Session 5: Debug logging cleanup, test consolidation (`2815905`)
- Session 4: COI filtering fixes (`6ed9ae1`, `31b8f98`)
- Session 3: Relevance filtering for Track B (`9dd137c`)
- Session 2: Coauthor COI detection (`59b4c89`)
- Session 1: Verification fixes (`451a69b`, `359a484`, `f63d541`)

## Current State

The Expert Reviewer Finder v2 has core functionality working:
- Claude analyzes proposals and suggests reviewers (Track A)
- Suggestions are verified via PubMed with name variant handling
- Database discovery finds additional candidates (Track B)
- Relevance filtering removes off-topic candidates
- Institution COI filtering (same institution as PI)
- Coauthor COI detection (published together)
- COI warnings displayed with red highlighting
- Debug logging controlled via environment variable
- **Save to My Candidates** - Persist selections to database
- **Export Markdown/CSV** - Download selected candidates
- **My Candidates tab** - View/manage saved candidates

## Priority Tasks for Next Session

### 1. UI/UX Improvements

- [ ] Add "View COI Details" expandable section showing coauthored paper titles
- [ ] Sort candidates with COI to bottom of list (or add toggle)
- [ ] Consider adding a summary stats card at top of results
- [ ] Add bulk export from My Candidates tab

### 2. Rate Limiting & Error Handling

- [ ] Add retry logic with exponential backoff for PubMed rate limit errors
- [ ] Batch COI checks to reduce API calls (currently one per candidate)
- [ ] Add user-friendly error messages for PubMed failures
- [ ] Consider caching COI results in database

### 3. Future Enhancements (Lower Priority)

- [ ] Option 2 from earlier: Improve query specificity for Track B
- [ ] Add Google Scholar integration (requires SERP_API_KEY)
- [ ] Batch processing for multiple proposals
- [ ] Remove old individual test scripts (keep only test-reviewer-finder.js)
- [ ] Implement Database tab (browse all discovered researchers)

## Key Files

### Services
- `lib/services/discovery-service.js` - Main verification + discovery logic (~1090 lines)
- `lib/services/claude-reviewer-service.js` - Claude API calls for analysis + reasoning
- `lib/services/pubmed-service.js` - PubMed API queries
- `lib/services/deduplication-service.js` - Name matching, COI filtering, ranking

### Config & Prompts
- `shared/config/prompts/reviewer-finder.js` - Claude prompts and parsing functions

### API & Frontend
- `pages/api/reviewer-finder/analyze.js` - Stage 1 API (Claude analysis)
- `pages/api/reviewer-finder/discover.js` - Stage 2 API (verification + discovery)
- `pages/api/reviewer-finder/save-candidates.js` - Save selected candidates to database
- `pages/api/reviewer-finder/my-candidates.js` - Fetch/update/remove saved candidates
- `pages/reviewer-finder.js` - Frontend UI with CandidateCard, SavedCandidateCard, MyCandidatesTab

### Test Scripts
- `scripts/test-reviewer-finder.js` - **PREFERRED** Consolidated test suite with subcommands
- `scripts/debug-reviewer-finder.js` - (Legacy) Tests individual candidates
- `scripts/test-all-candidates.js` - (Legacy) Tests 5 known good candidates
- `scripts/test-confidence-scores.js` - (Legacy) Tests expertise matching
- `scripts/test-verification-flow.js` - (Legacy) Full API flow simulation
- `scripts/test-relevance-parsing.js` - (Legacy) Tests reasoning parsing

## Key Principles

1. **Commit working states** before making changes
2. **One change at a time** with testing
3. **Trust Claude** - verification confirms identity, not relevance
4. **Simple filtering** - don't over-engineer
5. **Flag, don't auto-reject** - let users make COI decisions
6. **Read CLAUDE.md first** - understand the shared architecture

## Quick Start Commands

```bash
# Start dev server
npm run dev

# Run consolidated test suite
node scripts/test-reviewer-finder.js --help
node scripts/test-reviewer-finder.js parsing          # Quick test (no API calls)
node scripts/test-reviewer-finder.js candidates       # Test PubMed verification
node scripts/test-reviewer-finder.js coi              # Test COI detection
node scripts/test-reviewer-finder.js all              # Run all tests
node scripts/test-reviewer-finder.js single "Forest Rohwer"  # Test specific candidate

# Enable debug logging for development
DEBUG_REVIEWER_FINDER=true npm run dev

# Test COI with real coauthors
REAL_COI_TEST=true node scripts/test-reviewer-finder.js coi

# Check institution matching
node -e "const { DeduplicationService } = require('./lib/services/deduplication-service'); console.log(DeduplicationService.institutionsMatch('university of michigan', 'michigan state university'));"
```
