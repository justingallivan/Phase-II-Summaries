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

**Previous session (December 15, 2025 - Session 10):** Verification quality improvements

1. **Institution mismatch detection**
   - Compares Claude's suggested institution with PubMed-verified affiliation
   - Displays orange warning when institutions don't match (possible wrong person)
   - Handles departmental vs institutional affiliations correctly
   - Uses 50+ university abbreviation aliases (UC, MIT, Caltech, etc.)
   - File: `lib/services/discovery-service.js` - `checkInstitutionMismatch()`

2. **Expertise mismatch detection**
   - Checks if Claude's claimed expertise terms appear in candidate's publications
   - Warns when claimed expertise doesn't match publication record
   - Confidence levels: <35% (mismatch warning), 35-65% (weak match), >65% (good)
   - Filters generic terms (biology, research, molecular, etc.)
   - File: `lib/services/discovery-service.js` - `checkExpertiseMismatch()`

3. **Claude prompt improvements**
   - Added INSTITUTION field requirement for verification
   - Added SOURCE field to track where reviewer was found
   - Fixed name order requirement (Western order: FirstName LastName)
   - Prioritizes names mentioned in proposal over fabricated suggestions
   - File: `shared/config/prompts/reviewer-finder.js`

4. **UI improvements**
   - Orange warnings for institution/expertise mismatches
   - Yellow indicator for weak matches (35-65% confidence)
   - Full Claude reasoning displayed (removed 150-char truncation)
   - Google Scholar URL now prefers university name over department

**Session 9 (December 14, 2025):** Google Scholar links + Claude API retry logic

**Session 8 (December 13, 2025):** Metadata parsing fixes (`67f93c5`)

**Session 7 (December 13, 2025):** Bug fixes and optimizations:
- Institution abbreviation matching (UC, MIT, etc.)
- Fixed missing affiliations in database discoveries
- Optimized PubMed rate limiting with NCBI_API_KEY
- Fixed false positive institution COI
- Parallel COI checks (~5x speedup)

**Previous sessions:**
- Session 6: Save/Export buttons, My Candidates tab
- Session 5: Debug logging cleanup, test consolidation
- Session 4: COI filtering fixes
- Session 3: Relevance filtering for Track B
- Session 2: Coauthor COI detection
- Session 1: Verification fixes

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
- **🎓 Google Scholar links** - One-click profile lookup for h-index verification
- **Claude API retry + fallback** - Automatic retry with Haiku fallback on overload
- **Institution mismatch detection** - Warns when verified affiliation differs from Claude's suggestion
- **Expertise mismatch detection** - Warns when claimed expertise doesn't appear in publications
- **Weak match indicator** - Yellow warning for 35-65% confidence range
- **Full reasoning display** - Shows complete Claude rationale (no truncation)

## Priority Tasks for Next Session

### 1. Testing & Validation

- [ ] End-to-end test with real proposal to verify all Session 10 changes
- [ ] Verify institution mismatch detection doesn't produce false positives
- [ ] Verify expertise mismatch thresholds (35%/65%) are appropriate
- [ ] Test Google Scholar URL generation with various affiliation formats

### 2. UI/UX Improvements

- [ ] Add "View COI Details" expandable section showing coauthored paper titles
- [ ] Sort candidates with COI to bottom of list (or add toggle)
- [ ] Consider adding a summary stats card at top of results
- [ ] Add bulk export from My Candidates tab

### 3. Error Handling & Robustness

- [x] Add retry logic with exponential backoff for Claude API (implemented Session 9)
- [x] Batch COI checks to reduce API calls (implemented Session 7)
- [x] Institution mismatch detection (implemented Session 10)
- [x] Expertise mismatch detection (implemented Session 10)
- [ ] Add user-friendly error messages for PubMed failures
- [ ] Consider caching COI results in database

### 4. Future Enhancements

- [ ] Improve query specificity for Track B discoveries
- [ ] Batch processing for multiple proposals
- [ ] Remove old individual test scripts (keep only test-reviewer-finder.js)
- [ ] Implement Database tab (browse all discovered researchers)
- [ ] Remove debug logging from production (currently left in for troubleshooting)

## Key Files

### Services
- `lib/services/discovery-service.js` - Main verification + discovery logic (~1090 lines)
- `lib/services/claude-reviewer-service.js` - Claude API calls with retry/fallback logic
- `lib/services/pubmed-service.js` - PubMed API queries
- `lib/services/deduplication-service.js` - Name matching, COI filtering, ranking

### Config & Prompts
- `shared/config/prompts/reviewer-finder.js` - Claude prompts and parsing functions
- `shared/config/baseConfig.js` - Contains FALLBACK_MODEL setting

### API & Frontend
- `pages/api/reviewer-finder/analyze.js` - Stage 1 API (Claude analysis)
- `pages/api/reviewer-finder/discover.js` - Stage 2 API (verification + discovery)
- `pages/api/reviewer-finder/save-candidates.js` - Save selected candidates to database
- `pages/api/reviewer-finder/my-candidates.js` - Fetch/update/remove saved candidates
- `pages/reviewer-finder.js` - Frontend UI with CandidateCard, SavedCandidateCard, MyCandidatesTab

### Test Scripts
- `scripts/test-reviewer-finder.js` - **PREFERRED** Consolidated test suite with subcommands

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
```
