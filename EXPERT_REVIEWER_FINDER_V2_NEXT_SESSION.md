# Expert Reviewer Finder v2 - Next Session Plan

**Created:** December 12, 2025
**Status:** Regression from earlier implementation - needs investigation

---

## Problem Summary

The current implementation is returning fewer verified reviewers than earlier versions. During this session, we made multiple changes to the filtering logic that resulted in a step backward in quality. The core issue is that we don't have a clear baseline to compare against since the code was never committed to git before this session.

### Symptoms
- Fewer candidates being verified than in earlier testing
- Good candidates (Suttle, Rohwer, Fuhrman, Breitbart, etc.) sometimes missing
- Claude's suggestions vary between runs (normal, but makes debugging harder)

### Changes Made This Session (potentially problematic)
1. Added email extraction for affiliation matching - then reverted
2. Removed aggressive expertise filtering (35% threshold) - this was correct
3. Added disambiguated search requirement (≥3) - then removed as too strict
4. Added detailed debug logging - kept
5. Fixed database truncation error - kept

---

## Priority 1: Investigate Filtering Regression

### Hypothesis
The `filterToMatchingAuthorMultiVariant` function or `namesMatch` function may be too strict, filtering out legitimate publications.

### Investigation Steps

1. **Compare with working state**: The earlier implementation (before git) was reportedly working better. We need to understand what logic it used.

2. **Test specific candidates**: Run the debug script with known good candidates and trace exactly where they're being filtered:
   ```bash
   node scripts/debug-reviewer-finder.js
   ```

3. **Check the author filtering logic** in `discovery-service.js`:
   - `filterToMatchingAuthorMultiVariant()` (line ~845)
   - `namesMatch()` (line ~879)
   - These may be rejecting papers where the author name format differs

4. **Check MIN_PUBLICATIONS threshold**: Currently set to 3. Was it different before?

5. **Check PubMed query construction**:
   - `buildAuthorQuery()`
   - `buildDisambiguatedAuthorQuery()`
   - Are these too narrow?

### Key Files to Review
- `lib/services/discovery-service.js` - Main verification logic
- `lib/services/pubmed-service.js` - PubMed API queries
- `scripts/debug-reviewer-finder.js` - Debug script for testing

---

## Priority 2: Add Conflict of Interest Detection

### Feature: Coauthor COI Detector

Implement a database search to identify if a candidate reviewer has co-authored papers with the proposal author(s).

### Implementation Plan

1. **Extract proposal author(s)** from Claude's analysis (already have `AUTHOR_INSTITUTION`)

2. **For each verified candidate**, search PubMed for co-authored papers:
   ```
   Query: "[Candidate Name][Author] AND [Proposal Author][Author]"
   ```

3. **Flag candidates with coauthor history**:
   - Store coauthor count in candidate object
   - Display warning in UI: "⚠️ Co-authored X papers with proposal author"
   - Don't auto-reject, but flag for user review

4. **Database caching**: Store coauthor relationships to avoid repeat lookups

### Files to Modify
- `lib/services/discovery-service.js` - Add `checkCoauthorHistory()` method
- `pages/reviewer-finder.js` - Display COI warnings in CandidateCard
- `shared/config/prompts/reviewer-finder.js` - Extract proposal author name(s)

### API Design
```javascript
static async checkCoauthorHistory(candidateName, proposalAuthors) {
  const coauthorships = [];
  for (const author of proposalAuthors) {
    const query = `${candidateName}[Author] AND ${author}[Author]`;
    const results = await PubMedService.search(query, 10);
    if (results.length > 0) {
      coauthorships.push({
        proposalAuthor: author,
        paperCount: results.length,
        papers: results.slice(0, 3) // Sample papers
      });
    }
  }
  return coauthorships;
}
```

---

## Updated Checklist

### Immediate Fixes Needed
- [ ] Investigate why fewer candidates are being verified vs earlier implementation
- [ ] Review `namesMatch()` logic for over-filtering
- [ ] Review `filterToMatchingAuthorMultiVariant()` for over-filtering
- [ ] Consider lowering or removing MIN_PUBLICATIONS threshold
- [ ] Test with multiple proposals to establish baseline

### New Features
- [ ] Add coauthor COI detection via PubMed search
- [ ] Display COI warnings in UI
- [ ] Add proposal author extraction to Claude prompt

### Technical Debt
- [ ] Remove excessive debug logging once stable
- [ ] Clean up commented-out code in discovery-service.js

---

## Testing Protocol

Before making changes, establish a baseline:

1. Run the same proposal 3 times
2. Record: number of Claude suggestions, number verified, specific names
3. After each change, repeat and compare

### Test Proposals
- Use the "Death as a Source of Life" proposal (microbial/phage ecology)
- Use at least one other proposal from a different field

### Expected Good Candidates (for microbial/phage proposal)
These researchers should generally be found and verified:
- Curtis Suttle (marine virology)
- Forest Rohwer (viral ecology)
- Mya Breitbart (environmental virology)
- Joshua Weitz (quantitative viral ecology)
- Will Harcombe (microbial evolution)
- Benjamin Kerr (evolutionary biology) - borderline, may or may not be relevant

---

## Notes for Next Session

1. **Git discipline**: Commit working states BEFORE making changes
2. **Incremental changes**: Make one change at a time and test
3. **Don't over-engineer**: The simpler the filtering logic, the better
4. **Trust Claude**: If Claude suggests someone, they're probably relevant - verification should confirm identity, not relevance
