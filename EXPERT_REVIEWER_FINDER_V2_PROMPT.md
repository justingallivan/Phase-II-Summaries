# Expert Reviewer Finder v2 - Session Prompt

Continue working on the Expert Reviewer Finder v2 app at:
/Users/gallivan/Library/Mobile Documents/com~apple~CloudDocs/Documents/Programming/ClaudeCode/Grant_Review_Packages/Phase-II-Summaries

## Context

Read the session plan at: `EXPERT_REVIEWER_FINDER_V2_NEXT_SESSION.md`

The previous session resulted in a **regression** - the system is now returning fewer verified reviewers than earlier implementations. We need to investigate and fix the filtering logic.

## Priority Tasks

### 1. Investigate Filtering Regression (HIGH PRIORITY)

The verification logic in `lib/services/discovery-service.js` may be too strict. Key areas to investigate:

- `filterToMatchingAuthorMultiVariant()` (~line 845) - May be filtering out legitimate papers
- `namesMatch()` (~line 879) - Name matching logic may be too strict
- `MIN_PUBLICATIONS` threshold (currently 3) - May need adjustment

**Debug approach:**
1. Run `node scripts/debug-reviewer-finder.js` with known good candidates
2. Trace where papers are being lost in the pipeline
3. Compare search results vs filtered results

**Known good candidates for testing (microbial ecology proposals):**
- Curtis Suttle, Forest Rohwer, Mya Breitbart, Joshua Weitz, Will Harcombe

### 2. Add Coauthor COI Detection (NEW FEATURE)

Implement PubMed-based detection of coauthorship between candidates and proposal authors:

1. Extract proposal author name(s) from Claude's analysis
2. For each candidate, search: `"[Candidate][Author] AND [Proposal Author][Author]"`
3. Flag candidates with coauthor history (don't auto-reject)
4. Display warning in UI

Files to modify:
- `lib/services/discovery-service.js` - Add `checkCoauthorHistory()` method
- `pages/reviewer-finder.js` - Display COI warnings
- `shared/config/prompts/reviewer-finder.js` - Ensure author extraction

## Key Principles

1. **Commit early and often** - Always commit working states before making changes
2. **One change at a time** - Test after each modification
3. **Simple filtering** - The verification should confirm identity, not judge relevance
4. **Trust Claude** - If Claude suggests someone, they're likely relevant

## Current State

- Git: Latest commit `54d28e6` - "Remove disambiguated search requirement"
- The filtering is currently minimal: accept if ≥3 publications found
- Expertise match score is calculated but doesn't cause rejection
- Debug logging is enabled showing search/filter pipeline

## Files to Focus On

- `lib/services/discovery-service.js` - Main verification logic (investigate filtering)
- `scripts/debug-reviewer-finder.js` - Debug tool for testing candidates
- `pages/reviewer-finder.js` - Frontend (for COI display)
