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

**Previous session (December 13, 2025 - Session 8):** Metadata parsing fixes:

1. **Fixed Claude markdown formatting parsing** (`67f93c5`)
   - Root cause: Claude sometimes outputs `**AUTHOR_INSTITUTION:**` instead of `AUTHOR_INSTITUTION:`
   - Updated regex to handle markdown formatting variations (bold, list items)
   - Added asterisk cleanup from parsed values
   - This fixes institution COI not being detected for same-institution reviewers

**Session 7 (December 13, 2025):** Bug fixes and optimizations:

1. **Institution abbreviation matching** (`d74b2b1`)
   - Added 30+ abbreviation mappings (UC, MIT, Georgia Tech, UCLA, etc.)
   - "UC Berkeley" now correctly matches "University of California, Berkeley"
2. **Fixed missing affiliations in database discoveries** (`6003874`)
   - PubMed: Added `affiliation` alias for UI compatibility
   - BioRxiv: Fixed extraction to use `article.institution` field
3. **Optimized PubMed rate limiting** (`2a2814a`)
   - Now uses `NCBI_API_KEY` for 4x faster searches (100ms vs 400ms)
   - Removed redundant delays for ArXiv/BioRxiv (services have built-in delays)
4. **Fixed false positive institution COI** (`191fb7d`)
   - Bug: Greedy regex in `normalizeInstitution()` consumed entire string when no commas
   - Example: "University of Michigan" was incorrectly matching "UC San Diego"
   - Fix: Changed regex to require comma before removing department prefixes
5. **Parallel COI checks** (`6298f28`)
   - Implemented batched parallel processing for coauthor COI checks
   - Batch size: 5 with API key, 2 without (~5x speedup)

**Previous sessions:**
- Session 6: Save/Export buttons, My Candidates tab (`f31ba87`)
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
- Institution COI detection with abbreviation support (UC, MIT, etc.)
- Coauthor COI detection (published together)
- COI warnings displayed with red highlighting (🏛️ and 🚨 icons)
- Debug logging controlled via `DEBUG_REVIEWER_FINDER` env var
- **Optimized rate limiting** - Uses `NCBI_API_KEY` for 4x faster PubMed searches
- **Affiliations displayed** - PubMed and BioRxiv discoveries now show institutions
- **Save to My Candidates** - Persist selections to database
- **Export Markdown/CSV** - Download selected candidates
- **My Candidates tab** - View/manage saved candidates

## Priority Tasks for Next Session

### 1. UI/UX Improvements

- [ ] Add "View COI Details" expandable section showing coauthored paper titles
- [ ] Sort candidates with COI to bottom of list (or add toggle)
- [ ] Consider adding a summary stats card at top of results
- [ ] Add bulk export from My Candidates tab

### 2. Error Handling & Robustness

- [ ] Add retry logic with exponential backoff for PubMed rate limit errors
- [ ] Batch COI checks to reduce API calls (currently one per candidate)
- [ ] Add user-friendly error messages for PubMed failures
- [ ] Consider caching COI results in database

### 3. Future Enhancements (Lower Priority)

- [ ] Improve query specificity for Track B discoveries
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
