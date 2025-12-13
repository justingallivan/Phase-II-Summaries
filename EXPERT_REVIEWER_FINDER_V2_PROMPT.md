# Expert Reviewer Finder v2 - Session Prompt

Continue working on the Expert Reviewer Finder v2 app at:
`/Users/gallivan/Library/Mobile Documents/com~apple~CloudDocs/Documents/Programming/ClaudeCode/Grant_Review_Packages/Phase-II-Summaries`

## Context

**Previous session (December 13, 2025 - Session 2):** Implemented Coauthor COI Detection feature:

1. **Prompt modification** - Added `PROPOSAL_AUTHORS` field extraction to Claude prompt
2. **COI checking methods** - Added `checkCoauthorHistory()`, `checkCoauthorshipsForCandidates()`, and `toPubMedAuthorFormat()` to discovery-service.js
3. **API integration** - Integrated COI checking into discover.js API after verification
4. **UI display** - Added red-highlighted COI warnings in CandidateCard component
5. **Testing** - Verified with known coauthors (Curtis Suttle / Mya Breitbart)

**Key implementation details:**
- PubMed author searches use "LastName FirstInitial" format (e.g., "Rohwer F") which works better than quoted full names
- COI warnings show paper count and sample publication titles
- Candidates with COI get red border and warning banner

**Commits made this session:**
- `59b4c89` - Add coauthor COI detection to Expert Reviewer Finder v2

**Previous session (December 13, 2025 - Session 1):** Fixed verification issues:
- `451a69b` - Fix debug script data structure mismatch
- `359a484` - Improve expertise match confidence algorithm
- `f63d541` - Add debugging to discover API

## Current State

The Expert Reviewer Finder v2 is now feature-complete for basic functionality:
- Claude analyzes proposals and suggests reviewers
- Suggestions are verified via PubMed
- Name matching handles variants (Will/William, initials)
- Expertise confidence uses synonym expansion
- **NEW: Coauthor COI detection flags candidates who have published with proposal authors**

## Priority Tasks for Next Session

### 1. Clean Up Technical Debt

- [ ] Review and remove excessive debug logging if no longer needed
- [ ] Clean up any commented-out code in discovery-service.js
- [ ] Consider consolidating test scripts into a single test suite

### 2. UI/UX Improvements

- [ ] Add "View COI Details" expandable section showing coauthored paper titles
- [ ] Consider sorting candidates with COI to bottom of list
- [ ] Add export option that includes COI information

### 3. Rate Limiting & Error Handling

- [ ] Add retry logic for PubMed rate limit errors in COI checking
- [ ] Consider batching COI checks to reduce API calls
- [ ] Add better error messages for PubMed failures

## Key Files

- `lib/services/discovery-service.js` - Main verification logic + COI checking (~1070 lines)
- `lib/services/pubmed-service.js` - PubMed API queries
- `shared/config/prompts/reviewer-finder.js` - Claude prompts and parsing
- `pages/reviewer-finder.js` - Frontend UI with COI warnings
- `pages/api/reviewer-finder/discover.js` - API endpoint (Stage 2)

## Test Scripts

- `node scripts/debug-reviewer-finder.js` - Tests individual candidates
- `node scripts/test-all-candidates.js` - Tests 5 known good candidates
- `node scripts/test-confidence-scores.js` - Tests expertise matching
- `node scripts/test-verification-flow.js` - Simulates full API flow with COI checking
  - Set `REAL_COI_TEST=true` to test with real coauthors

## Key Principles

1. **Commit working states** before making changes
2. **One change at a time** with testing
3. **Trust Claude** - verification confirms identity, not relevance
4. **Simple filtering** - don't over-engineer
5. **Flag, don't auto-reject** - let users make COI decisions
