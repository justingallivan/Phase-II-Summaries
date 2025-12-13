# Expert Reviewers Pro - Gap Analysis

**Date:** December 11, 2025
**Purpose:** Identify gaps between the implementation plan and current code for production readiness

---

## Executive Summary

The Expert Reviewers Pro app has **~80% of planned functionality implemented**. The core architecture is solid: database schema, all four API services, deduplication, and the frontend are working. Key gaps are around **testing, error handling, missing features from the plan, and production hardening**.

### Current Focus
**Priority:** Get the free API services (PubMed, ArXiv, BioRxiv) returning high-quality results before investing in paid services (Google Scholar via SerpAPI, Contact Enrichment).

**Rationale:** SerpAPI costs money. Until the free sources are validated and returning appropriate reviewer candidates, there's no point in paying for additional data enrichment.

---

## Detailed Gap Analysis

### 1. Missing Features from Plan

#### 1.1 Contact Enrichment Service (DEFERRED)
**Plan:** Phase 7 specifies `/enrich-contacts` endpoint using Google Custom Search to find researcher emails and websites.

**Current:** Not implemented. ScholarService provides some contact info from profiles, but no dedicated enrichment.

**Impact:** Limited contact information for researchers without Google Scholar profiles.

**Status:** DEFERRED - Requires paid Google API. Will implement after free APIs are validated.

**Future Implementation:** `lib/services/contact-enrichment-service.js` that:
- Uses Google Custom Search API to find researcher homepages
- Extracts emails from university faculty pages
- Falls back to constructed emails (e.g., firstname.lastname@university.edu)

#### 1.2 Cache Statistics Endpoint (LOW PRIORITY)
**Plan:** Phase 7 specifies `/cache-stats` endpoint for analytics.

**Current:** `DatabaseService.getCacheStats()` exists but no API endpoint exposes it.

**Impact:** No visibility into cache utilization. Minor issue.

**Recommendation:** Add `pages/api/cache-stats.js` endpoint (simple, ~20 lines).

#### 1.3 Cleanup Cache Script (LOW PRIORITY)
**Plan:** Phase 2 specifies `npm run db:cleanup-cache` script.

**Current:** `DatabaseService.cleanupExpiredCache()` method exists but no script.

**Impact:** Minor - expired cache entries not automatically cleaned.

**Recommendation:** Add `scripts/cleanup-cache.js` and package.json script.

---

### 2. Implementation Differences

#### 2.1 Query Generation Approach (NEUTRAL)
**Plan:** Each service has its own `generateQuery(metadata)` method that takes extracted proposal metadata.

**Current:** Claude generates search queries via `createSearchQueryPrompt()`, which is actually **better** than the plan because:
- Queries are tailored to each proposal
- Claude understands context and generates field-specific terms
- More accurate than generic pattern matching

**Recommendation:** Keep current approach. Document as intentional improvement.

#### 2.2 Author Selection Strategy (IMPLEMENTED DIFFERENTLY)
**Plan:** Does not specify author selection strategy.

**Current:** Only takes **last author** from publications (typically PI/senior author). This is a reasonable choice for reviewer finding.

**Recommendation:** Keep current approach. Consider making configurable in future.

#### 2.3 Claude-Suggested Reviewers (GOOD ADDITION)
**Plan:** Does not mention using Claude to identify potential reviewers from references.

**Current:** `createSearchQueryPrompt()` extracts "POTENTIAL_REVIEWERS" from proposal references. These get 25-point bonus in ranking.

**Recommendation:** Keep this - it's a valuable enhancement over the plan.

---

### 3. Quality & Testing Gaps

#### 3.1 No Automated Tests (HIGH PRIORITY)
**Plan:** Phase 10 specifies test scripts.

**Current:** No test files found.

**Impact:** No confidence in reliability. Bugs may go unnoticed.

**Recommendation:** Create test suite:
```
tests/
├── services/
│   ├── database-service.test.js
│   ├── pubmed-service.test.js
│   ├── deduplication-service.test.js
│   └── ...
├── api/
│   └── search-reviewers-pro.test.js
└── integration/
    └── full-workflow.test.js
```

#### 3.2 Error Handling Improvements (MEDIUM PRIORITY)
**Current Issues:**
- API errors logged but not always surfaced clearly to user
- Some services swallow errors silently (return empty arrays)
- No retry logic for transient failures

**Recommendation:**
- Add exponential backoff for API retries
- Surface error types to frontend (rate limit vs. API down vs. no results)
- Add Sentry or similar for production error tracking

#### 3.3 No Input Validation (MEDIUM PRIORITY)
**Current:** Minimal validation of user inputs.

**Recommendation:**
- Validate API key format before using
- Validate maxCandidates range on backend
- Sanitize excludedReviewers input
- Validate file type/size

---

### 4. Performance Gaps

#### 4.1 Slow Enrichment Phase (MEDIUM PRIORITY)
**Current:** Sequential PubMed lookup for each candidate (400ms delay each). With 20 candidates, this is ~8 seconds.

**Already Fixed:** Dec 11 change added sequential processing to avoid rate limits.

**Potential Improvement:** Cache author-based PubMed queries to avoid redundant lookups across runs.

#### 4.2 No Progress Granularity During Enrichment (LOW PRIORITY)
**Current:** Progress jumps from 90% to 100% during enrichment.

**Recommendation:** Add per-candidate progress updates during enrichment phase.

---

### 5. Missing Documentation

#### 5.1 User Guide (MEDIUM PRIORITY)
**Current:** Only beta warning banner exists.

**Recommendation:** Add help documentation covering:
- What each source provides (h-index requires Scholar)
- How to get SERP_API_KEY
- Interpreting relevance scores
- Understanding COI filtering

#### 5.2 API Documentation (LOW PRIORITY)
**Current:** Code comments exist but no API reference.

**Recommendation:** Add OpenAPI/Swagger spec or markdown documentation for `/api/search-reviewers-pro`.

---

### 6. Production Readiness Gaps

#### 6.1 No Monitoring/Alerting (MEDIUM PRIORITY)
**Current:** Console logging only.

**Recommendation:**
- Add structured logging (JSON format)
- Integrate with logging service (Vercel Logs, LogDNA, etc.)
- Add alerts for API failures, rate limits

#### 6.2 No Usage Analytics (LOW PRIORITY)
**Current:** `reviewer_suggestions` table tracks suggestions but not queried.

**Recommendation:** Add simple analytics dashboard showing:
- Searches per day
- Cache hit rates
- Source utilization

#### 6.3 Rate Limiting Refinement (LOW PRIORITY)
**Current:** 3 requests per minute global limit.

**Recommendation:** Consider:
- Per-user rate limiting (if auth added)
- Source-specific limits based on API quotas
- Queue system for high-volume usage

---

## Priority Matrix

| Gap | Impact | Effort | Priority | Notes |
|-----|--------|--------|----------|-------|
| **Test free APIs with real proposals** | High | Medium | **P0** | Must validate before paid services |
| Validate PubMed query results | High | Low | P0 | Are we finding relevant authors? |
| Validate ArXiv query results | High | Low | P0 | Check CS/Physics proposals |
| Validate BioRxiv query results | High | Low | P0 | Check biology proposals |
| Automated Tests | High | High | P1 | After manual validation |
| Error Handling Improvements | Medium | Medium | P2 | |
| Input Validation | Medium | Low | P2 | |
| User Guide/Help | Medium | Low | P2 | |
| Google Scholar (SerpAPI) | High | Low | **DEFERRED** | Costs money - wait for free API validation |
| Contact Enrichment Service | Medium | Medium | **DEFERRED** | Requires Google API - wait |
| Progress During Enrichment | Low | Low | P3 | |
| Cache Stats Endpoint | Low | Low | P3 | |
| Cleanup Cache Script | Low | Low | P3 | |
| Monitoring/Alerting | Medium | Medium | P3 | |
| API Documentation | Low | Medium | P3 | |

---

## Recommended Action Plan

### Phase 0: Validate Free APIs (CURRENT PRIORITY)
1. Test with a real biology/biomedical proposal → check PubMed + BioRxiv results
2. Test with a real CS/physics proposal → check ArXiv results
3. Evaluate: Are the returned authors actually relevant experts?
4. Evaluate: Is Claude generating good search queries?
5. Identify any issues with query generation or result parsing

**Key Questions to Answer:**
- Do PubMed queries return recent, relevant publications?
- Are we correctly extracting author names and affiliations?
- Does the deduplication merge the right people?
- Does COI filtering correctly exclude the author's institution?
- Are the top-ranked candidates actually qualified reviewers?

### Phase A: Stabilization (after Phase 0)
1. Fix any issues found in Phase 0
2. Add basic test suite for services
3. Add integration test with sample proposal

### Phase B: Hardening
4. Improve error handling and surfacing
5. Add input validation
6. Create user guide

### Phase C: Paid Services (after free APIs validated)
7. Set up SerpAPI account
8. Test Google Scholar integration
9. Implement contact enrichment if needed
10. Evaluate ROI of paid services

---

## Code Quality Observations

### Strengths
- Clean separation of concerns (services, API, frontend)
- Good use of caching with configurable expiry
- Thoughtful deduplication with multiple matching strategies
- SSE streaming for real-time progress

### Areas for Improvement
- Inconsistent error handling patterns across services
- Some magic numbers could be constants (e.g., 400ms delay, 10-year filter)
- Mix of CommonJS and ES modules (works but not ideal)
- Some console.log statements should be removed for production

---

## Files Reviewed

| File | Lines | Status |
|------|-------|--------|
| `lib/db/schema.sql` | 157 | Complete, matches plan |
| `lib/services/database-service.js` | 491 | Complete, has extras (clearAllCache) |
| `lib/services/pubmed-service.js` | 289 | Complete, well-structured |
| `lib/services/arxiv-service.js` | 205 | Complete |
| `lib/services/biorxiv-service.js` | 147 | Complete |
| `lib/services/scholar-service.js` | 295 | Complete |
| `lib/services/deduplication-service.js` | 378 | Complete, good ranking |
| `pages/api/search-reviewers-pro.js` | 600 | Complete, main orchestrator |
| `pages/find-reviewers-pro.js` | 645 | Complete, full frontend |
| `scripts/setup-database.js` | 180 | Complete |
| `shared/config/prompts/find-reviewers.js` | 336 | Complete, includes search queries |

**Total: ~3,723 lines of implementation code**

---

## Conclusion

Expert Reviewers Pro is a well-architected application that successfully implements the core vision of the plan. The main gaps are around **testing and production hardening** rather than fundamental functionality. The Claude-based query generation is an improvement over the original plan.

**Recommendation:** Focus on Phase A (Stabilization) before removing the "Beta" label.
