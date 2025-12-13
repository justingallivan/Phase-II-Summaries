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

**Previous session (December 13, 2025 - Session 4):** Fixed COI filtering and reasoning parsing:

1. **Institution COI fix** - Applied institution filter to Track A (verified suggestions), not just Track B
2. **Field name fix** - `filterConflicts` now checks both `affiliation` and `primaryAffiliation`
3. **Institution matching improvement** - Stricter matching prevents false positives:
   - "University of Michigan" no longer matches "Michigan State University"
   - "University of Texas" no longer matches "Texas A&M University"
   - Added conflicting words: `state`, `tech`, `polytechnic`, `am`, etc.
4. **Reasoning parsing fix** - Made regex more flexible to handle Claude response variations
5. **Fallback handling** - Candidates without parsed reasoning get "Reasoning not available" instead of nothing

**Commits made this session:**
- `6ed9ae1` - Fix institution-based COI filtering for reviewer candidates
- `31b8f98` - Improve reasoning parsing robustness for database discoveries

**Previous sessions:**
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

## Priority Tasks for Next Session

### 1. Clean Up Technical Debt (Start Here)

- [ ] Review and remove excessive debug logging in:
  - `lib/services/discovery-service.js`
  - `lib/services/claude-reviewer-service.js`
  - `pages/api/reviewer-finder/discover.js`
- [ ] Clean up any commented-out code
- [ ] Consolidate test scripts into a single test suite:
  - Current: `debug-reviewer-finder.js`, `test-all-candidates.js`, `test-confidence-scores.js`, `test-verification-flow.js`, `test-relevance-parsing.js`
  - Consider: Single `test-reviewer-finder.js` with subcommands

### 2. UI/UX Improvements

- [ ] Add "View COI Details" expandable section showing coauthored paper titles
- [ ] Sort candidates with COI to bottom of list (or add toggle)
- [ ] Add export option that includes COI information in output
- [ ] Consider adding a summary stats card at top of results

### 3. Rate Limiting & Error Handling

- [ ] Add retry logic with exponential backoff for PubMed rate limit errors
- [ ] Batch COI checks to reduce API calls (currently one per candidate)
- [ ] Add user-friendly error messages for PubMed failures
- [ ] Consider caching COI results in database

### 4. Future Enhancements (Lower Priority)

- [ ] Option 2 from earlier: Improve query specificity for Track B
- [ ] Add Google Scholar integration (requires SERP_API_KEY)
- [ ] Batch processing for multiple proposals

## Key Files

### Services
- `lib/services/discovery-service.js` - Main verification + discovery logic (~1070 lines)
- `lib/services/claude-reviewer-service.js` - Claude API calls for analysis + reasoning
- `lib/services/pubmed-service.js` - PubMed API queries
- `lib/services/deduplication-service.js` - Name matching, COI filtering, ranking

### Config & Prompts
- `shared/config/prompts/reviewer-finder.js` - Claude prompts and parsing functions

### API & Frontend
- `pages/api/reviewer-finder/analyze.js` - Stage 1 API (Claude analysis)
- `pages/api/reviewer-finder/discover.js` - Stage 2 API (verification + discovery)
- `pages/reviewer-finder.js` - Frontend UI with CandidateCard component

### Test Scripts
- `scripts/debug-reviewer-finder.js` - Tests individual candidates
- `scripts/test-all-candidates.js` - Tests 5 known good candidates
- `scripts/test-confidence-scores.js` - Tests expertise matching
- `scripts/test-verification-flow.js` - Full API flow simulation
- `scripts/test-relevance-parsing.js` - Tests reasoning parsing

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

# Run test scripts
node scripts/test-relevance-parsing.js
node scripts/test-verification-flow.js
REAL_COI_TEST=true node scripts/test-verification-flow.js

# Check institution matching
node -e "const { DeduplicationService } = require('./lib/services/deduplication-service'); console.log(DeduplicationService.institutionsMatch('university of michigan', 'michigan state university'));"
```
