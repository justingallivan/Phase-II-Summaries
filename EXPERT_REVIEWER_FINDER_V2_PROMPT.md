# Expert Reviewer Finder v2 - Session Prompt

Continue working on the Expert Reviewer Finder v2 app at:
`/Users/gallivan/Library/Mobile Documents/com~apple~CloudDocs/Documents/Programming/ClaudeCode/Grant_Review_Packages/Phase-II-Summaries`

## Context

**Previous session (December 13, 2025):** Fixed the reported "regression" - it was actually two separate issues:

1. **Debug script bug** - The debug script expected `extractBestAffiliationMultiVariant()` to return an object but it returns a string, causing misleading "NONE FOUND" output
2. **Expertise confidence algorithm too strict** - Required 2+ keyword matches from exact phrases. Fixed by adding synonym expansion and single-keyword matching.

**Results after fixes:**
- All 5 known good candidates (Suttle, Rohwer, Breitbart, Weitz, Harcombe) now pass verification
- Confidence scores improved dramatically (e.g., Curtis Suttle: 0% → 100%)
- Tested with a new proposal (chemical biology/quantum computing) - 10/13 suggestions verified correctly

**Commits made:**
- `451a69b` - Fix debug script data structure mismatch and add test scripts
- `359a484` - Improve expertise match confidence algorithm for reviewer verification
- `f63d541` - Add debugging to discover API and test script for verification flow

## Current State

The verification pipeline is working correctly:
- Claude suggestions are being verified via PubMed
- Name matching handles variants (Will/William, initials)
- Expertise confidence uses synonym expansion
- Debug logging shows what's happening at each step

## Priority Tasks for This Session

### 1. Add Coauthor COI Detection (NEW FEATURE)

Implement PubMed-based detection of coauthorship between candidates and proposal authors:

1. **Extract proposal author name(s)** from Claude's analysis
   - Modify prompt in `shared/config/prompts/reviewer-finder.js` to extract `PROPOSAL_AUTHORS`
   - Parse in `parseAnalysisResponse()`

2. **For each verified candidate**, search PubMed for coauthored papers:
   ```javascript
   Query: "${candidateName}[Author] AND ${proposalAuthor}[Author]"
   ```

3. **Flag candidates with coauthor history** (don't auto-reject):
   - Add `coauthorships` array to candidate object
   - Display warning in UI: "⚠️ Co-authored X papers with proposal author"

**Files to modify:**
- `shared/config/prompts/reviewer-finder.js` - Add PROPOSAL_AUTHORS field
- `lib/services/discovery-service.js` - Add `checkCoauthorHistory()` method
- `pages/reviewer-finder.js` - Display COI warnings in CandidateCard

### 2. Clean Up Technical Debt

- [ ] Review and remove excessive debug logging if no longer needed
- [ ] Clean up any commented-out code in discovery-service.js
- [ ] Consider consolidating test scripts

## Key Files

- `lib/services/discovery-service.js` - Main verification logic (~950 lines)
- `lib/services/pubmed-service.js` - PubMed API queries
- `shared/config/prompts/reviewer-finder.js` - Claude prompts and parsing
- `pages/reviewer-finder.js` - Frontend UI
- `pages/api/reviewer-finder/discover.js` - API endpoint (Stage 2)

## Test Scripts

- `node scripts/debug-reviewer-finder.js` - Tests individual candidates
- `node scripts/test-all-candidates.js` - Tests 5 known good candidates
- `node scripts/test-confidence-scores.js` - Tests expertise matching
- `node scripts/test-verification-flow.js` - Simulates full API flow

## Key Principles

1. **Commit working states** before making changes
2. **One change at a time** with testing
3. **Trust Claude** - verification confirms identity, not relevance
4. **Simple filtering** - don't over-engineer
