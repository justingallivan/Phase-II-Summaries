# Expert Reviewer Finder v2 - Implementation Plan

**Date:** December 12, 2025
**Status:** Planning
**App Name:** Expert Reviewer Finder (new app, replaces both find-reviewers and find-reviewers-pro)

---

## Executive Summary

A tiered, progressive reviewer discovery system that combines Claude's analytical reasoning with real academic database verification. Designed to find qualified reviewers (including lesser-known experts) while minimizing paid API costs.

### Key Principles

1. **Claude provides the "why"** - Reasoning about fit and relevance
2. **Databases provide the "who"** - Real, verified researchers with publications
3. **Tiered cost structure** - Free searches first, paid enrichment only for selected candidates
4. **Discovery over verification** - Find hidden gems, not just famous names
5. **Database grows over time** - Store permanently to avoid repeat paid lookups

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                                │
├─────────────────────────────────────────────────────────────────────┤
│  Tab 1: New Search    │  Tab 2: My Candidates  │  Tab 3: Database   │
│  (Upload proposal)    │  (Saved/selected)      │  (Browse/search)   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         TIERED PIPELINE                              │
├──────────────┬──────────────┬──────────────┬───────────────────────┤
│   Stage 1    │   Stage 2    │   Stage 3    │       Stage 4         │
│   Claude     │   Database   │   User       │       Enrichment      │
│   Analysis   │   Discovery  │   Selection  │       (Paid)          │
│   (FREE)     │   (FREE)     │   (FREE)     │       (ON-DEMAND)     │
└──────────────┴──────────────┴──────────────┴───────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      VERCEL POSTGRES DATABASE                        │
│  researchers │ publications │ search_cache │ proposal_searches      │
│  (permanent) │ (permanent)  │ (6 months)   │ (permanent)            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Stage Details

### Stage 1: Claude Analysis (FREE)

**Input:** Uploaded proposal PDF + optional context

**Claude Tasks:**
1. Extract proposal metadata (title, research area, institution, etc.)
2. Generate reviewer suggestions with detailed reasoning:
   - Name
   - Why they're a good fit (2-3 sentences)
   - Expertise areas
   - Seniority estimate (Early/Mid/Senior career)
   - Potential concerns (if any)
3. Generate optimized search queries for databases
4. Extract names from references that could be reviewers

**Output:**
```json
{
  "proposalInfo": {
    "title": "...",
    "authorInstitution": "...",
    "primaryArea": "...",
    "keywords": ["..."]
  },
  "claudeSuggestions": [
    {
      "name": "Dr. Jane Smith",
      "reasoning": "Expert in bacteriophage ecology with recent work on...",
      "expertiseAreas": ["phage biology", "microbial ecology"],
      "seniorityEstimate": "Mid-career",
      "potentialConcerns": "May have collaborated with PI in 2019"
    }
  ],
  "searchQueries": {
    "pubmed": ["query1", "query2"],
    "arxiv": ["query1"],
    "biorxiv": ["query1"]
  },
  "referencedAuthors": ["Name1", "Name2"]
}
```

---

### Stage 2: Database Discovery & Verification (FREE)

**Two parallel tracks:**

#### Track A: Verify Claude's Suggestions
For each name Claude suggested:
1. Check local database first (avoid API calls if we know them)
2. Search PubMed for author name
3. Confirm active researcher (3+ publications in last 5 years)
4. Pull recent publications with links
5. Extract affiliation from publications

**Output per verified suggestion:**
```json
{
  "name": "Dr. Jane Smith",
  "verified": true,
  "affiliation": "University of Michigan, Dept of Microbiology",
  "recentPublications": [
    {"title": "...", "year": 2024, "pmid": "12345", "url": "https://..."}
  ],
  "publicationCount5yr": 8,
  "source": "claude_suggestion",
  "claudeReasoning": "Expert in bacteriophage ecology..."
}
```

#### Track B: Discover New Candidates
Using Claude's generated queries:
1. Search PubMed, ArXiv, BioRxiv
2. Extract authors from relevant papers
3. Filter: 3+ publications in last 5 years
4. Deduplicate across sources
5. Exclude author's institution (COI)

**For discovered candidates, generate reasoning:**
- Have Claude analyze why each discovered researcher is relevant
- Based on their publications and the proposal
- This adds the "why" that was missing in Pro

**Output per discovered candidate:**
```json
{
  "name": "Dr. John Doe",
  "verified": true,
  "affiliation": "Boston University",
  "recentPublications": [...],
  "publicationCount5yr": 5,
  "source": "pubmed_discovery",
  "generatedReasoning": "Recent publications on cross-feeding in microbial communities directly align with Aim 1..."
}
```

---

### Stage 3: User Review & Selection (FREE)

**UI Features:**

1. **Combined Results View**
   - All candidates in a unified list
   - Sortable by: Relevance score, Publication count, Source
   - Filterable by: Source (Claude/PubMed/ArXiv/BioRxiv), Verified status
   - Visual distinction between Claude-suggested and database-discovered

2. **Candidate Cards**
   Each card shows:
   ```
   ┌────────────────────────────────────────────────────────┐
   │ ☐ Dr. Jane Smith                        [Mid-career]  │
   │    University of Michigan                              │
   │                                                        │
   │    WHY: Expert in bacteriophage ecology with recent   │
   │    work on nutrient cycling...                        │
   │                                                        │
   │    ✓ Verified: 8 publications (last 5 years)          │
   │    Source: Claude suggestion + PubMed verified        │
   │                                                        │
   │    Recent Papers:                                      │
   │    • Phage lysis releases... (2024) [Link]            │
   │    • Cross-feeding in... (2023) [Link]                │
   │                                                        │
   │    [Select for Enrichment]                            │
   └────────────────────────────────────────────────────────┘
   ```

3. **Selection Actions**
   - Checkbox to select candidates
   - "Add to My Candidates" saves to database
   - "Enrich Selected" triggers Stage 4 (paid)

---

### Stage 4: Enrichment (PAID - On Demand)

**Triggered only for user-selected candidates**

**Cost Estimate UI (shown before enrichment):**
```
┌────────────────────────────────────────────────────────────┐
│  Enrich Selected Candidates                                │
│                                                            │
│  Selected: 8 candidates                                    │
│                                                            │
│  ✓ Already in database (free):     3 candidates           │
│  ○ Need Google Scholar lookup:     5 candidates           │
│                                                            │
│  Estimated cost: $0.25                                     │
│  (5 lookups × $0.05 per lookup)                           │
│                                                            │
│  [Cancel]                    [Proceed with Enrichment]    │
└────────────────────────────────────────────────────────────┘
```

**Step 1: Check Database First**
- If researcher already in DB with Google Scholar URL → skip API call
- Show cached data with "Last updated: [date]" note
- Option to "Refresh" if user wants current data

**Step 2: Google Scholar Lookup (if needed)**
Uses SerpAPI to find:
- Google Scholar profile URL (stored permanently)
- Google Scholar ID (stored permanently)
- h-index (snapshot)
- Total citations (snapshot)
- Research interests

**Step 3: Contact Info Search (if needed)**
Options:
- Parse email from PubMed affiliation strings (often included)
- Google Custom Search for "[name] [institution] email"
- University directory scraping (if allowed)

**Output - Complete Profile:**
```
┌────────────────────────────────────────────────────────────┐
│ Dr. Jane Smith                                             │
│ Associate Professor                                        │
│ University of Michigan, Dept of Microbiology              │
│                                                            │
│ WHY SELECTED:                                              │
│ Expert in bacteriophage ecology with recent work on        │
│ nutrient cycling in microbial communities. Her 2023 paper │
│ on cross-feeding directly relates to Aim 1 of proposal.   │
│                                                            │
│ VERIFICATION:                                              │
│ ✓ Active researcher: 8 publications (2020-2024)           │
│ ✓ Affiliation confirmed via PubMed                        │
│                                                            │
│ METRICS:                                                   │
│ • h-index: 24                                              │
│ • Citations: 2,847                                         │
│ • Google Scholar: [Link to profile]                        │
│                                                            │
│ RECENT PUBLICATIONS:                                       │
│ • "Phage lysis releases..." (2024) [PubMed]               │
│ • "Cross-feeding in synthetic..." (2023) [PubMed]         │
│ • "Nutrient cycling in soil..." (2023) [PubMed]           │
│                                                            │
│ CONTACT:                                                   │
│ • Email: jsmith@umich.edu                                  │
│ • Website: https://smith-lab.org                          │
│                                                            │
│ [Export Profile] [Remove from List]                        │
└────────────────────────────────────────────────────────────┘
```

---

## Database Schema Updates

### researchers (permanent storage)
```sql
CREATE TABLE researchers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  normalized_name VARCHAR(255),

  -- Affiliation (last known)
  primary_affiliation VARCHAR(500),
  department VARCHAR(255),

  -- Permanent identifiers (free lookups, stored forever)
  orcid VARCHAR(50),                -- ORCID iD (e.g., 0000-0002-1234-5678)
  orcid_url VARCHAR(255),           -- https://orcid.org/0000-0002-1234-5678
  google_scholar_id VARCHAR(100),
  google_scholar_url VARCHAR(500),
  pubmed_author_id VARCHAR(100),    -- For PubMed author disambiguation

  -- Contact info (last known)
  email VARCHAR(255),
  website VARCHAR(500),

  -- Metrics (snapshot, with timestamp)
  h_index INTEGER,
  i10_index INTEGER,
  total_citations INTEGER,
  metrics_updated_at TIMESTAMP,     -- When metrics were last fetched

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- No expiry - data stored permanently
  UNIQUE(normalized_name, primary_affiliation),
  UNIQUE(orcid)  -- ORCID is globally unique
);

-- Index for ORCID lookups
CREATE INDEX idx_researchers_orcid ON researchers(orcid);
```

### publications (permanent storage)
```sql
CREATE TABLE publications (
  id SERIAL PRIMARY KEY,
  researcher_id INTEGER REFERENCES researchers(id),

  title TEXT NOT NULL,
  authors TEXT[],
  year INTEGER,
  journal VARCHAR(500),

  -- Identifiers
  doi VARCHAR(100),
  pmid VARCHAR(50),
  arxiv_id VARCHAR(50),
  url VARCHAR(500),  -- Direct link to paper

  -- Metadata
  citations INTEGER DEFAULT 0,
  source VARCHAR(50),  -- pubmed, arxiv, biorxiv, scholar
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(doi),
  UNIQUE(pmid)
);
```

### proposal_searches (permanent - for history)
```sql
CREATE TABLE proposal_searches (
  id SERIAL PRIMARY KEY,
  proposal_title TEXT,
  proposal_hash VARCHAR(64),  -- To identify repeat searches
  author_institution VARCHAR(255),

  -- Results summary
  claude_suggestions JSONB,
  discovered_candidates JSONB,
  selected_candidates INTEGER[],  -- researcher IDs

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### search_cache (temporary - 6 months)
```sql
-- Keep existing structure for API response caching
-- Used for PubMed/ArXiv/BioRxiv query results
-- Prevents repeat API calls for same queries
```

---

## UI Design

### Tab 1: New Search

```
┌─────────────────────────────────────────────────────────────────────┐
│  [New Search]   [My Candidates]   [Database]                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  📄 Drop proposal PDF here or click to upload               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Additional Context (optional):                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Excluded Names (conflicts of interest):                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Search Sources:                                                    │
│  [✓] PubMed  [✓] ArXiv  [✓] BioRxiv                               │
│                                                                     │
│              [🔍 Find Reviewers]                                   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  Progress:                                                          │
│  ✓ Stage 1: Claude analysis complete                               │
│  ● Stage 2: Searching databases... (PubMed: 45 found)              │
│  ○ Stage 3: Ready for review                                        │
│  ○ Stage 4: Enrichment (on-demand)                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### Results View (After Stage 2)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Results for: "Death as a Source of Life in Microbial..."          │
│                                                                     │
│  Found: 28 candidates (12 Claude suggestions, 16 discovered)       │
│                                                                     │
│  Sort: [Relevance ▼]  Filter: [All Sources ▼]  [Verified Only ☐]  │
│                                                                     │
│  ┌─ Select All for Section ─────────────────────────────────────┐  │
│  │ CLAUDE SUGGESTIONS (Verified)                          12    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ☐ Dr. Will Harcombe                              [Mid-career]     │
│    Yale University, Dept of Ecology                                │
│    WHY: Leading researcher on metabolic interactions...            │
│    ✓ 12 publications (2020-2024) | Source: Claude + PubMed        │
│    [View Papers] [Expand]                                          │
│                                                                     │
│  ☐ Dr. Otto Cordero                               [Mid-career]     │
│    MIT, Dept of Civil & Environmental Engineering                  │
│    WHY: Expertise in microbial community dynamics...               │
│    ✓ 15 publications (2020-2024) | Source: Claude + PubMed        │
│    [View Papers] [Expand]                                          │
│                                                                     │
│  ┌─ DATABASE DISCOVERIES ───────────────────────────────────────┐  │
│  │ Found via PubMed/ArXiv/BioRxiv searches                16    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ☐ Dr. Daniel Segrè                               [Senior]         │
│    Boston University, Bioinformatics Program                       │
│    WHY: Recent publications on metabolic modeling of...            │
│    ✓ 8 publications (2020-2024) | Source: PubMed + ArXiv          │
│    [View Papers] [Expand]                                          │
│                                                                     │
│  ... more candidates ...                                           │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  Selected: 5 candidates                                             │
│  [Save to My Candidates]  [🔍 Enrich Selected (uses paid API)]     │
└─────────────────────────────────────────────────────────────────────┘
```

### Tab 2: My Candidates

```
┌─────────────────────────────────────────────────────────────────────┐
│  [New Search]   [My Candidates]   [Database]                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Saved Candidates (23 total)                                        │
│                                                                     │
│  Group by: [Proposal ▼]  Sort: [Date Added ▼]                      │
│                                                                     │
│  ┌─ "Death as a Source of Life..." (Dec 12, 2025) ──────────────┐  │
│  │                                                               │  │
│  │  ✓ Dr. Will Harcombe - Yale (Enriched)                       │  │
│  │  ✓ Dr. Otto Cordero - MIT (Enriched)                         │  │
│  │  ○ Dr. Daniel Segrè - Boston U (Not enriched)                │  │
│  │                                                               │  │
│  │  [Enrich All] [Export List] [Remove All]                     │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ "Quantum Effects in..." (Nov 28, 2025) ─────────────────────┐  │
│  │  ...                                                          │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Tab 3: Database Browser

```
┌─────────────────────────────────────────────────────────────────────┐
│  [New Search]   [My Candidates]   [Database]                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Researcher Database (487 researchers)                              │
│                                                                     │
│  Search: [_________________________________] [🔍]                   │
│                                                                     │
│  Filter by:                                                         │
│  Institution: [Any ▼]  Field: [Any ▼]  Has Email: [Any ▼]         │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Name              │ Institution      │ h-index │ Last Used   │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │ Dr. Will Harcombe │ Yale University  │ 28      │ Dec 12      │  │
│  │ Dr. Otto Cordero  │ MIT              │ 35      │ Dec 12      │  │
│  │ Dr. Jane Smith    │ U Michigan       │ 24      │ Nov 15      │  │
│  │ ...               │ ...              │ ...     │ ...         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  Click researcher to view full profile                              │
│                                                                     │
│  Database Stats:                                                    │
│  • 487 researchers stored                                           │
│  • 2,341 publications linked                                        │
│  • 156 with Google Scholar profiles                                 │
│  • 203 with email addresses                                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### New Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/reviewer-finder/analyze` | POST | Stage 1: Claude analysis |
| `/api/reviewer-finder/discover` | POST | Stage 2: Database discovery |
| `/api/reviewer-finder/enrich` | POST | Stage 4: Paid enrichment |
| `/api/reviewer-finder/candidates` | GET/POST | Manage saved candidates |
| `/api/reviewer-finder/database` | GET | Query researcher database |
| `/api/reviewer-finder/database/[id]` | GET | Get researcher profile |

### Deprecate

| Endpoint | Status |
|----------|--------|
| `/api/find-reviewers` | Keep for now, deprecate later |
| `/api/search-reviewers-pro` | Replace with new tiered system |

---

## Implementation Phases

### Phase 1: Core Pipeline (Priority)
1. Create new page: `/pages/reviewer-finder.js`
2. Implement Stage 1 (Claude analysis with reasoning)
3. Implement Stage 2 (Database discovery with generated reasoning)
4. Basic results UI with candidate cards
5. Test end-to-end with real proposals

### Phase 2: Selection & Storage
1. Implement candidate selection
2. Save to My Candidates functionality
3. Database schema updates for permanent storage
4. My Candidates tab

### Phase 3: Enrichment
1. Stage 4 implementation (Google Scholar via SerpAPI)
2. Contact info extraction
3. Database-first lookup to avoid repeat API calls
4. Complete profile view

### Phase 4: Database Browser
1. Database tab UI
2. Search and filter functionality
3. Researcher profile view
4. Export capabilities

### Phase 5: Export & Polish
1. Export formats:
   - CSV (for spreadsheets)
   - Markdown (for documentation)
   - JSON (for data interchange)
   - PDF (formatted reviewer profiles) - use react-pdf or similar
2. Progress persistence (resume interrupted searches)
3. Batch operations
4. Usage analytics

---

## Cost Analysis

**Free Operations:**
- Claude API calls (user provides key)
- PubMed searches (free, rate limited)
- ArXiv searches (free)
- BioRxiv searches (free)
- Local database lookups

**Paid Operations (Stage 4 only):**
- SerpAPI for Google Scholar: ~$0.05 per search
- Google Custom Search (if implemented): ~$0.005 per search

**Example Usage:**
- Search returns 30 candidates
- User selects 8 for enrichment
- 3 already in database (free)
- 5 need Google Scholar lookup = $0.25 total

---

## Migration Path

1. **Build new app** at `/reviewer-finder`
2. **Keep existing apps** running during development
3. **Beta test** new app with real proposals
4. **Add notice** to old apps pointing to new one
5. **Deprecate** old apps after validation

---

## Success Criteria

1. **Discovery:** Surface qualified reviewers not in Claude's training data
2. **Reasoning:** Every candidate has clear "why" explanation
3. **Verification:** All candidates verified with real publications (3+ in 5 years)
4. **Cost efficiency:** Paid API calls only for user-selected candidates
5. **Growing database:** Less API calls needed over time
6. **User satisfaction:** Actionable reviewer profiles with contact info

---

## Resolved Questions

1. **ORCID:** Yes, include ORCID lookup as a free verification method. Store in database.

2. **Rate Limiting Strategy:**
   - PubMed: 3 requests/second (NCBI guideline), 10 requests/second with API key
   - ArXiv: 1 request/second (their guideline)
   - BioRxiv: 1 request/second (conservative estimate)
   - SerpAPI: Per plan limits (track usage)
   - Implement request queuing with delays between calls

3. **Database Sharing:** Shared database for all users. Architecture should support future multi-user features.

4. **PDF Export:** Yes, implement PDF export for reviewer profiles and lists.

5. **Cost Estimate UI:** Show estimated cost before Stage 4 enrichment (e.g., "Enrich 5 candidates - Est. cost: $0.25")

## Future Considerations (TODO)

1. **Multi-user Support:**
   - User authentication (OAuth, email/password)
   - Per-user saved candidates and search history
   - Shared researcher database (read), private selections (write)
   - Usage tracking per user
   - Admin dashboard for usage analytics

2. **Architecture Flexibility:**
   - Abstract database operations behind service layer
   - Use dependency injection for external API services
   - Config-driven rate limits (easy to adjust)
   - Feature flags for gradual rollout

---

## Appendix: File Structure

```
pages/
├── reviewer-finder.js              # Main app page (tabbed interface)
├── api/
│   └── reviewer-finder/
│       ├── analyze.js              # Stage 1
│       ├── discover.js             # Stage 2
│       ├── enrich.js               # Stage 4
│       ├── candidates.js           # CRUD for saved candidates
│       └── database.js             # Query researcher DB

lib/
├── services/
│   ├── claude-reviewer-service.js  # Stage 1 logic
│   ├── discovery-service.js        # Stage 2 orchestration
│   ├── enrichment-service.js       # Stage 4 logic
│   ├── orcid-service.js            # ORCID API lookups (free)
│   ├── rate-limiter.js             # Configurable API rate limiting
│   └── (existing services...)
└── db/
    └── schema-v2.sql               # Updated schema

shared/
├── config/
│   └── prompts/
│       └── reviewer-finder.js      # All prompts for new app
└── utils/
    └── pdf-export.js               # PDF generation for profiles
```
