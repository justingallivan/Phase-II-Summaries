# Expert Reviewer Finder v2 - Session Startup Prompt

Copy and paste this prompt to start a new session focused on implementing the Expert Reviewer Finder v2.

---

## Prompt

I'm building a new app called "Expert Reviewer Finder" for my grant proposal processing suite. This will be a tiered, progressive reviewer discovery system.

**Please read these files to get up to speed:**

1. `CLAUDE.md` - Project overview and tech stack
2. `EXPERT_REVIEWER_FINDER_V2_PLAN.md` - Complete implementation plan (the main document)
3. `EXPERT_REVIEWER_FINDER_V2_CHECKLIST.md` - Implementation checklist (create if needed)

**Context:**
- This app replaces two existing apps: `/find-reviewers` (Claude-only suggestions) and `/find-reviewers-pro` (database search, incomplete)
- The new app combines the best of both: Claude's reasoning + real database verification
- Key insight: Claude provides the "why", databases provide verified "who"
- Tiered cost structure: Free searches first (PubMed, ArXiv, BioRxiv), paid enrichment (Google Scholar) only for selected candidates

**Tech Stack:**
- Next.js 14, React 18, Tailwind CSS
- Vercel Postgres (existing database)
- Claude API (user provides key)
- Free APIs: PubMed (NCBI), ArXiv, BioRxiv
- Paid APIs: SerpAPI for Google Scholar (deferred until free APIs validated)

**Existing Code to Reuse:**
- `lib/services/pubmed-service.js` - Works, needs rate limiting
- `lib/services/arxiv-service.js` - Works
- `lib/services/biorxiv-service.js` - Works, low result counts
- `lib/services/database-service.js` - Works, schema may need updates
- `lib/services/deduplication-service.js` - Works
- `shared/config/prompts/find-reviewers.js` - Has extraction prompts

**Current Priority: Phase 1 - Core Pipeline**

Please start by reviewing the plan, then let's discuss the implementation approach for Stage 1 (Claude analysis) and Stage 2 (Database discovery).

---

## Subagent Delegation Strategy

For parallel work, consider these subagent tasks:

### Research/Exploration Agents (subagent_type: Explore)
- "Explore the existing pubmed-service.js, arxiv-service.js, and biorxiv-service.js to understand current implementation patterns"
- "Explore the database schema in lib/db/schema.sql and compare to the v2 plan"
- "Find all usages of the existing find-reviewers prompts"

### Implementation Agents (subagent_type: general-purpose)
- "Implement the new Claude analysis prompt for Stage 1 that generates reviewer suggestions with reasoning AND search queries"
- "Create the rate-limiter.js service with configurable limits per API"
- "Update the database schema to match EXPERT_REVIEWER_FINDER_V2_PLAN.md"
- "Create the basic UI structure for the three-tab interface"

### Planning Agent (subagent_type: Plan)
- "Plan the implementation of Stage 2 discovery service that combines verification and discovery tracks"

---

## Quick Reference

| Stage | Description | Cost | Status |
|-------|-------------|------|--------|
| 1 | Claude analysis (reasoning + queries) | Free | TODO |
| 2 | Database discovery & verification | Free | TODO |
| 3 | User selection UI | Free | TODO |
| 4 | Google Scholar enrichment | Paid | Deferred |

**Key Files to Create:**
- `pages/reviewer-finder.js` - Main app (tabbed UI)
- `pages/api/reviewer-finder/analyze.js` - Stage 1
- `pages/api/reviewer-finder/discover.js` - Stage 2
- `lib/services/claude-reviewer-service.js` - Stage 1 logic
- `lib/services/discovery-service.js` - Stage 2 orchestration

**Verification Criteria:**
- 3+ publications in last 5 years = active researcher

**Database Approach:**
- Store researchers permanently (no expiry)
- Store Google Scholar URLs permanently (free to check manually later)
- Metrics (h-index) stored as snapshots with timestamps
