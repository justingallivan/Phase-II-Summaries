# Expert Reviewers Pro - Implementation Checklist

**Last Updated:** December 11, 2025
**Status:** Beta - Gaps identified for production readiness

---

## Phase 1: Vercel Infrastructure
- [x] Create Vercel Postgres database
- [x] Add environment variables (SERP_API_KEY, NCBI_API_KEY, etc.)
- [x] Install Vercel CLI

## Phase 2: Project Setup
- [x] Create Next.js app (integrated into existing project)
- [x] Install dependencies (@vercel/postgres, xml2js, string-similarity, etc.)
- [x] Copy existing code from Find Expert Reviewers (reused prompts)

## Phase 3: Database Schema
- [x] Create schema.sql file (`lib/db/schema.sql`)
- [x] Create migration script (`scripts/setup-database.js`)
- [x] Run migration

## Phase 4: Database Service
- [x] Implement DatabaseService class (`lib/services/database-service.js`)
- [ ] Test cache operations (needs verification)
- [ ] Test researcher operations (needs verification)

## Phase 5: External API Services
- [x] Implement PubMedService (`lib/services/pubmed-service.js`)
- [x] Implement ArXivService (`lib/services/arxiv-service.js`)
- [x] Implement BioRxivService (`lib/services/biorxiv-service.js`)
- [x] Implement ScholarService (`lib/services/scholar-service.js`)

## Phase 6: Deduplication
- [x] Implement DeduplicationService (`lib/services/deduplication-service.js`)
- [ ] Test name matching thoroughly
- [ ] Test conflict filtering thoroughly

## Phase 7: Orchestration
- [x] Create search-reviewers API route (`pages/api/search-reviewers-pro.js`)
- [ ] Test multi-source search end-to-end
- [ ] Verify database recording works correctly

## Phase 8: Frontend
- [x] Update homepage (added to Layout.js navigation)
- [x] Create reviewer results component (`pages/find-reviewers-pro.js`)
- [ ] Test full workflow with real proposals

## Phase 9: Deployment
- [x] Deploy to Vercel
- [x] Verify production database
- [ ] Test in production environment

## Phase 10: Testing
- [ ] Create test scripts
- [ ] Verify caching works as expected
- [ ] Test with real proposals (multiple fields)
- [ ] Performance testing

---

## Gap Analysis Summary

### Implemented (Working)
1. All database schema and services
2. Multi-source search (PubMed, ArXiv, BioRxiv, Scholar)
3. Deduplication with name similarity
4. COI filtering by institution
5. Relevance ranking
6. Frontend with SSE streaming progress
7. Export to CSV/Markdown/JSON
8. Skip cache option
9. Quality filter (requires both publications AND affiliation)
10. Sequential PubMed enrichment (rate limiting fix)
11. Publication URLs added to results

### Current Priority: Validate Free APIs

Before investing in paid services (SerpAPI for Google Scholar), we need to validate that the free APIs are returning quality results:

- [ ] Test PubMed with a biomedical proposal
- [ ] Test ArXiv with a CS/physics proposal
- [ ] Test BioRxiv with a biology proposal
- [ ] Verify Claude is generating appropriate search queries
- [ ] Verify deduplication is working correctly
- [ ] Verify COI filtering excludes author's institution
- [ ] Evaluate: Are top-ranked candidates actually qualified?

### Deferred (Paid Services)
- Google Scholar integration (requires SERP_API_KEY - $50/mo+)
- Contact enrichment service (requires Google Custom Search API)

See `EXPERT_REVIEWERS_PRO_GAPS.md` for detailed gap analysis.
