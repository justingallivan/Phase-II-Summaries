# Development Log

This file contains the historical development log for the Document Processing Multi-App System. For current project documentation, see [CLAUDE.md](./CLAUDE.md).

---

## September 2025 - Frontend-Backend Data Structure Consistency Audit

**Problem Identified:**
After implementing Vercel Blob storage, the backend was processing files correctly but the frontend wasn't displaying results. Through systematic debugging, identified a critical data structure mismatch between frontend and backend components.

**Root Cause:**
The backend APIs were returning `{formatted, structured}` but various frontend components expected different property names like `{summary, structuredData}`. This inconsistency prevented results from displaying despite successful processing.

**Comprehensive Solution:**
Conducted a systematic audit of all applications to ensure frontend-backend consistency:

### Files Audited and Fixed:

1. **find-reviewers.js** (`pages/find-reviewers.js:118`)
   - **Issue**: Used `structuredData:` instead of `structured:`
   - **Fix**: `structuredData: data.extractedInfo || {}` → `structured: data.extractedInfo || {}`

2. **peer-review-summarizer.js** (`pages/peer-review-summarizer.js`)
   - **Issues**: Multiple references to old data structure properties
   - **Fixes Applied**:
     - Line 116: `results.summary` → `results.formatted`
     - Line 119: `results.questions` → `results.structured?.questions`
     - Line 258: `results.summary` → `results.formatted`
     - Line 264: `results.questions` → `results.structured?.questions`
     - Line 270: `results.questions` → `results.structured.questions`

3. **document-analyzer.js** (`pages/document-analyzer.js`)
   - **Issue**: Refinement state update using wrong property
   - **Fix**: `summary: data.refinedSummary` → `formatted: data.refinedSummary`

4. **batch-proposal-summaries.js** (`pages/batch-proposal-summaries.js`)
   - **Issues**: Multiple summary property references
   - **Fixes**: All `result.summary` references → `result.formatted`

5. **shared/components/ResultsDisplay.js**
   - **Issues**: Inconsistent property names throughout shared component
   - **Fixes**: Standardized all references:
     - `result.summary` → `result.formatted`
     - `result.structuredData` → `result.structured`

6. **proposal-summarizer.js** (`pages/proposal-summarizer.js`)
   - **Issues**: Q&A and refinement context using wrong properties
   - **Fixes**: Updated context references to use `result.formatted`

### API Endpoints Verified:

- **`/api/process`**: Returns `{formatted, structured}` ✅
- **`/api/find-reviewers`**: Returns `{extractedInfo, reviewers, csvData, parsedReviewers, metadata}` ✅
- **`/api/refine`**: Returns `{refinedSummary, timestamp}` ✅
- **`/api/qa`**: Returns `{answer, timestamp}` ✅

### Standardized Data Structure:

All applications now use consistent data structure pattern:
- **`result.formatted`** - Main content/summary text
- **`result.structured`** - Extracted structured data objects
- **`result.metadata`** - File processing metadata
- **`result.csvData`** - CSV export data (reviewers app only)

### Commits Made:

1. **Commit a9ca806**: "Fix frontend-backend data structure consistency across all applications"
   - 6 files changed, 45 insertions(+), 27 deletions(-)
   - Core data structure consistency fixes

2. **Commit 5cb022d**: "Improve Vercel Blob upload handling and streaming response reliability"
   - 3 files changed, 20 insertions(+), 2 deletions(-)
   - Enhanced CORS headers, upload logging, and streaming improvements

**Result:**
Frontend-backend communication is now seamless across all applications. Each app correctly expects and receives the data structure that its corresponding API endpoint provides. The issue was systemic but localized to property naming conventions, not the underlying data flow architecture.

**Testing Required:**
All applications should now display results correctly after file processing. The data flow pattern is: File Upload → Vercel Blob Storage → Claude API Processing → Standardized Data Structure → ResultsDisplay Component.

---

## September 21, 2025 - Dropdown Parameter Integration

**Problem Identified:**
The batch-proposal-summaries app had dropdown menus for Summary Length (1-5 pages) and Technical Level (general-audience to academic), but these values were being sent to the API and completely ignored. The Claude prompts were static and didn't use the user's configuration choices.

**Root Cause:**
The API endpoint `/pages/api/process.js` was only extracting `files` and `apiKey` from the request body, ignoring `summaryLength` and `summaryLevel`. The `PROMPTS.SUMMARIZATION` function was static and didn't accept parameters.

**Solution Implemented:**
1. **API Parameter Extraction** (`pages/api/process.js:11`):
   - Added extraction: `const { files, apiKey, summaryLength = 2, summaryLevel = 'technical-non-expert' } = req.body;`
   - Added debugging logs to track parameter values
   - Updated `generateSummary()` function call to pass parameters

2. **Function Signature Update** (`pages/api/process.js:96`):
   - Modified `generateSummary(text, filename, apiKey, summaryLength, summaryLevel)`
   - Updated prompt generation to use dynamic parameters

3. **Enhanced Claude Prompt** (`lib/config.js:24`):
   - Converted `PROMPTS.SUMMARIZATION` to accept `(text, summaryLength, summaryLevel)` parameters
   - Added length requirements: 1-5 pages, ~500 words per page
   - Added audience-specific language instructions:
     - **General Audience**: Avoids technical jargon, explains concepts accessibly
     - **Technical Non-Expert**: Uses some technical terms with clear explanations
     - **Technical Expert**: Uses field-specific terminology, assumes domain knowledge
     - **Academic**: Uses precise scientific language and detailed methodology

**Result:**
Dropdown selections now properly customize Claude's responses. Users can select summary length and technical level, and Claude will generate summaries according to those specifications.

**Data Flow (Fixed):**
Frontend Dropdowns → POST Request Body → API Parameter Extraction → generateSummary() → Dynamic Claude Prompt → Customized Summary

### Commit Made:
- **Commit e029e0c**: "Implement dropdown parameter integration for batch proposal summaries"
  - 2 files changed, 23 insertions(+), 6 deletions(-)
  - Fixed missing functionality where dropdown selections were ignored

---

## November 7, 2025 - Federal Funding Gap Analyzer

**Feature Implemented:**
A comprehensive federal funding analysis tool that queries the NSF API for real-time award data and uses Claude to analyze the broader federal funding landscape (NIH, DOE, DOD).

**Implementation Details:**

**Files Created:**
1. `lib/fundingApis.js` - NSF API query utilities
   - `queryNSFforPI()` - Queries PI and Co-PI awards with state filtering
   - `queryNSFforKeywords()` - Analyzes funding by research keywords
   - Helper functions for formatting and date handling

2. `pages/api/analyze-funding-gap.js` - Main API endpoint (Pattern B with shared handlers)
   - Multi-step processing pipeline per proposal
   - Streaming SSE responses for real-time progress
   - Token optimization to stay under Claude's 200K limit
   - Individual report generation (no batch summary)

3. `pages/funding-gap-analyzer.js` - Frontend page
   - Configuration options: Search years (3/5/10), Include Co-PIs checkbox
   - Collapsible cards for each proposal (Option B)
   - Individual download buttons with naming pattern
   - ZIP download for all reports (using JSZip)

**Files Modified:**
4. `lib/config.js` - Added 3 new prompts:
   - `FUNDING_EXTRACTION` - Extracts PI, institution, state, and keywords
   - `FUNDING_ANALYSIS` - Generates comprehensive funding analysis
   - `BATCH_FUNDING_SUMMARY` - (Created but not used in final implementation)

5. `shared/components/Layout.js` - Added navigation link

**Key Technical Decisions:**

1. **State-Based Institution Matching:**
   - Changed from institution name matching to state code filtering
   - More reliable for NSF API queries
   - Claude infers state from institution (e.g., "UC Berkeley" → "CA")

2. **Search ALL NSF Awards (Not Just Active):**
   - Provides complete funding history
   - Shows active vs. expired awards in analysis

3. **Co-PI Search (Enabled by Default):**
   - Queries both `pdPIName` and `coPDPIName` parameters
   - Deduplicates awards to avoid double-counting
   - Provides comprehensive view of researcher's NSF involvement

4. **Token Optimization:**
   - Extraction: Limited to 6,000 characters (first few pages only)
   - NSF data: Truncated to 10 PI awards + 5 per keyword
   - Prevents Claude API "prompt too long" errors

5. **Smart Fallback:**
   - First tries full PI name
   - Automatically falls back to last name if no results

6. **Individual Report Mode:**
   - Each proposal generates standalone markdown report
   - Filename pattern: `funding_analysis_[PI_name]_[original_filename]_[date].md`
   - No combined batch report (cleaner for sharing)

**Data Flow:**
```
User uploads PDFs → Vercel Blob → Extract text → Claude (PI/state/keywords) →
NSF API (real awards data) → Claude (NIH/DOE/DOD analysis) →
Individual markdown reports → Collapsible cards + ZIP download
```

**UI/UX Features:**
- Collapsible proposal cards (collapsed by default)
- Quick summary: PI, Institution, State, NSF funding, Keywords
- "View Full Report" button to expand
- Individual "Download" buttons per proposal
- "Download All as ZIP" button at top
- Summary stats card (proposals analyzed, years searched, reports generated)

**Dependencies Added:**
- `jszip@3.10.1` - For ZIP file creation client-side

**Result:**
Fully functional federal funding gap analyzer with NSF integration. Successfully tested with multiple UC proposals. State-based filtering significantly improved NSF award matching accuracy.

**Testing Notes:**
- Single proposal: ~1-2 minutes processing time
- Batch (3 proposals): ~5-7 minutes total
- NSF API rate limiting: 200ms delay between keyword queries
- Token limits: Resolved through data truncation strategy

---

## December 10, 2025 - Expert Reviewers Pro (Beta)

**Feature Implemented:**
A multi-source academic database search tool that finds expert reviewers by querying PubMed, ArXiv, BioRxiv, and Google Scholar.

**Architecture Overview:**

```
Proposal PDF → Vercel Blob → Claude (metadata extraction) →
Multi-source search (PubMed, ArXiv, BioRxiv, Scholar) →
Deduplication → COI filtering → Relevance ranking →
Reviewer candidates with h-index and publications
```

**Files Created:**

1. **Database Schema & Migration:**
   - `lib/db/schema.sql` - 5 tables: search_cache, researchers, publications, researcher_keywords, reviewer_suggestions
   - `scripts/setup-database.js` - Migration script for Vercel Postgres

2. **Service Classes:**
   - `lib/services/database-service.js` - Caching, researcher CRUD, suggestion tracking
   - `lib/services/pubmed-service.js` - NCBI E-utilities API integration
   - `lib/services/arxiv-service.js` - ArXiv Atom feed API
   - `lib/services/biorxiv-service.js` - BioRxiv API with client-side filtering
   - `lib/services/scholar-service.js` - Google Scholar via SerpAPI
   - `lib/services/deduplication-service.js` - Name matching, COI filtering, ranking

3. **API & Frontend:**
   - `pages/api/search-reviewers-pro.js` - Orchestration endpoint (streaming)
   - `pages/find-reviewers-pro.js` - Frontend with source selection and results

**Key Technical Decisions:**

1. **Reuses Existing Code:**
   - File upload via `FileUploaderSimple`
   - Metadata extraction via `createExtractionPrompt()` from find-reviewers
   - Replaces Step 2 (Claude reviewer suggestions) with real database searches

2. **Intelligent Caching:**
   - 6-month cache expiry for search results
   - 3-month cache for individual profiles
   - Stored in Vercel Postgres

3. **Name Deduplication:**
   - Uses `string-similarity` package
   - Matches "J. Smith" with "John Smith"
   - Checks initials and partial first names

4. **Conflict of Interest Filtering:**
   - Excludes researchers from author's institution
   - Institution name normalization for accurate matching

5. **Relevance Ranking (100 points max):**
   - h-index: 0-40 points
   - Citations: 0-20 points (log scale)
   - Multiple sources: 0-15 points
   - Keyword matches: 0-25 points

**New Dependencies Required:**
```bash
npm install @vercel/postgres xml2js serpapi string-similarity
```

**Environment Variables Required:**
- `SERP_API_KEY` - For Google Scholar searches (paid service)
- `NCBI_API_KEY` - Optional, increases PubMed rate limits
- `POSTGRES_URL` - Auto-set by Vercel Postgres

**Setup Instructions:**

1. Create Vercel Postgres database in Vercel Dashboard
2. Run: `vercel env pull .env.local`
3. Run: `node scripts/setup-database.js`
4. Add `SERP_API_KEY` to environment variables

**Result:**
Fully implemented multi-source reviewer finder. Searches real academic databases, deduplicates results, filters conflicts, and ranks by relevance with h-index and citation counts.

---

## December 11, 2025 - Expert Reviewers Pro Improvements

**Issues Fixed:**

1. **PubMed Rate Limiting:**
   - Changed enrichment from `Promise.all()` (parallel) to sequential processing
   - Added 400ms delay between PubMed API calls
   - Prevents "API rate limit exceeded" errors
   - File: `pages/api/search-reviewers-pro.js:469-563`

2. **Publication URL Links:**
   - Added clickable URLs to all publications:
     - PubMed: `https://pubmed.ncbi.nlm.nih.gov/{pmid}`
     - ArXiv: `https://arxiv.org/abs/{arxivId}`
     - BioRxiv: `https://doi.org/${doi}`
   - Fixed operator precedence bug in URL generation
   - Updated on-screen display with blue clickable links
   - Updated markdown export with `[Title](URL)` format
   - Files: `pages/api/search-reviewers-pro.js`, `pages/find-reviewers-pro.js:606-614`

3. **Quality Filter for Results:**
   - Added filter requiring candidates to have BOTH:
     - Recent publications (within last 10 years)
     - Institutional affiliation
   - Removes incomplete/useless candidates from results
   - Stats now include `afterQualityFilter` count
   - File: `pages/api/search-reviewers-pro.js:565-575`

4. **Cache Issues Identified:**
   - Old cache contained irrelevant results from generic queries
   - Solution: Check "Skip cache" option to force fresh searches with Claude-generated queries

**Known Issues / Future Work:**

1. **Google Scholar** - Requires `SERP_API_KEY` (paid). Without it, h-index data unavailable.
2. **Testing Needed** - Verify with "Skip cache" enabled:
   - Claude-generated queries working correctly
   - Publication URLs are clickable
   - Quality filter removing incomplete candidates
3. **Potential Improvements:**
   - Adjust 10-year publication filter if too restrictive
   - Add h-index minimum filter option
   - Enhance affiliation extraction from PubMed articles

---

## December 14, 2025 - Expert Reviewer Finder v2 Session 9

**Features Implemented:**

1. **Google Scholar Profile Links** (`426b6d7`, `b094ee7`)
   - Added Scholar Profile link to CandidateCard and SavedCandidateCard
   - Opens Google Scholar author search in new tab (free, no API needed)
   - URL cleanup: removes titles (Dr., Prof.), extracts institution name from full affiliation
   - `buildScholarSearchUrl()` helper function in `pages/reviewer-finder.js`

2. **Claude API Retry Logic with Fallback Model** (`1cd7416`, `5efed48`)
   - Retry configuration: 2 retries with exponential backoff (1s, 2s delays)
   - After retries exhausted, falls back to `claude-3-haiku-20240307`
   - Only retries on overloaded/rate-limit errors (529, 503)
   - `callClaude()` returns `{ text, usedFallback, model }` object
   - Progress events include `status: 'fallback'` for UI notification
   - File: `lib/services/claude-reviewer-service.js`

3. **Fallback Model UI Indicator**
   - Progress messages track `type` field ('info' or 'fallback')
   - Fallback messages displayed with:
     - Warning emoji prefix
     - Amber/yellow background highlighting (`bg-amber-50 text-amber-600`)
   - Candidates track `reasoningFromFallback` flag

**Files Modified:**
- `pages/reviewer-finder.js` - Scholar links + fallback UI
- `lib/services/claude-reviewer-service.js` - Retry logic with fallback

---

## December 15, 2025 - Expert Reviewer Finder v2 Session 10

**Features Implemented:**

1. **Institution Mismatch Detection**
   - Compares Claude's suggested institution with PubMed-verified affiliation
   - Displays orange warning when institutions don't match (possible wrong person)
   - Handles departmental vs institutional affiliations (e.g., "Center for Integrative Genomics" matches "University of Lausanne")
   - Uses 50+ university abbreviation aliases
   - File: `lib/services/discovery-service.js` - `checkInstitutionMismatch()`

2. **Expertise Mismatch Detection**
   - Checks if Claude's claimed expertise terms appear in candidate's publications
   - Confidence thresholds: <35% (mismatch warning), 35-65% (weak match), >65% (good)
   - Filters generic terms that would match everything (biology, research, molecular, etc.)
   - File: `lib/services/discovery-service.js` - `checkExpertiseMismatch()`

3. **Claude Prompt Improvements**
   - Added INSTITUTION field requirement for verification
   - Added SOURCE field ("Mentioned in proposal", "References", "Known expert", "Field leader")
   - Fixed name order issue (Western order: FirstName LastName with examples)
   - Added "WHERE TO FIND REVIEWERS" prioritization section
   - Relaxed accuracy requirements to avoid missing proposal-mentioned candidates
   - File: `shared/config/prompts/reviewer-finder.js`

4. **UI Improvements**
   - Orange warnings for institution/expertise mismatches
   - Yellow indicator for weak matches (35-65% confidence)
   - Full Claude reasoning displayed (removed 150-character truncation)
   - Google Scholar URL now prefers university name over department name

**Key Functions Added:**

```javascript
// Institution mismatch detection
static checkInstitutionMismatch(verifiedAffiliation, suggestedInstitution) {
  // Simple containment check first
  if (verifiedLower.includes(suggestedLower)) return false;
  // 50+ university aliases (UC system, MIT, Caltech, etc.)
  // Pattern extraction for university names
  // Word overlap fallback (>50% match)
}

// Expertise mismatch detection
static checkExpertiseMismatch(publications, claimedExpertise) {
  // Extract significant terms from claimed expertise
  // Filter generic words (biology, research, molecular, etc.)
  // Check if terms appear in publication titles
  // Returns { hasMismatch, claimedTerms, matchedTerms }
}
```

**Files Modified:**
- `lib/services/discovery-service.js` - Added mismatch detection functions
- `pages/reviewer-finder.js` - UI warnings, Scholar URL fix, full reasoning display
- `shared/config/prompts/reviewer-finder.js` - Prompt improvements

**Bugs Fixed:**
- Name order reversed in Claude output (LastName FirstName → FirstName LastName)
- Google Scholar URL using department name instead of university
- Browser crash from missing `expanded` state variable
- False positive institution mismatches for departmental affiliations

---

## December 15-16, 2025 - Expert Reviewer Finder v2 Session 11 (Contact Enrichment)

**Phase 3: Contact Enrichment - Implementation Complete**

Implemented a tiered contact lookup system to find email addresses and faculty pages for verified candidates:

**Tier System:**
- **Tier 1: PubMed** (Free) - Extracts emails from recent publication affiliations
- **Tier 2: ORCID** (Free) - Looks up email, website, and ORCID ID via API
- **Tier 3: Claude Web Search** (Paid ~$0.015/candidate) - AI-powered faculty page search

**Files Created:**

1. **`shared/components/ApiSettingsPanel.js`** (NEW)
   - Collapsible settings panel for optional API keys (ORCID Client ID/Secret, NCBI API Key)
   - Keys stored in localStorage with base64 encoding
   - Follows existing UI patterns from other apps in the suite

2. **`lib/utils/contact-parser.js`** (NEW)
   - Extracts emails from PubMed affiliation strings using regex
   - Validates email recency (papers < 2 years old considered trustworthy)

3. **`lib/services/orcid-service.js`** (NEW)
   - ORCID API integration with OAuth 2.0 client credentials flow
   - Token caching for efficiency
   - Search by name + affiliation, fetch full profile

4. **`lib/services/contact-enrichment-service.js`** (NEW)
   - Orchestrates 3-tier lookup with fallback logic
   - `isUsefulWebsiteUrl()` filter to exclude generic directory pages
   - Cost estimation for Claude Web Search
   - Database persistence of enriched contact info

5. **`pages/api/reviewer-finder/enrich-contacts.js`** (NEW)
   - SSE streaming endpoint for real-time progress updates
   - Sends cost estimates, progress events, and final results

6. **`lib/db/migrations/002_contact_enrichment.sql`** (NEW)
   - Schema additions for contact tracking fields

**Files Modified:**

7. **`scripts/setup-database.js`**
   - Added v3Alterations array for contact enrichment columns:
     - `researchers.email_source`, `email_year`, `email_verified_at`
     - `researchers.faculty_page_url`, `contact_enriched_at`, `contact_enrichment_source`
     - `reviewer_suggestions.email_sent_at`, `response_type`

8. **`pages/reviewer-finder.js`**
   - Added ApiSettingsPanel integration
   - Added enrichment state management
   - Added "Find Contact Info" button for selected candidates
   - Added enrichment modal with tier options, cost estimate, progress display
   - Fixed ORCID/Claude checkboxes to show unchecked when credentials unavailable

**Bugs Fixed:**
- `DatabaseService.upsertResearcher is not a function` → Changed to `createOrUpdateResearcher`
- Claude API rate limit (30K input tokens/minute) → Switched to Haiku model, reduced prompt size
- Progress UI unclear during enrichment → Added immediate tier status indicators
- Unhelpful directory URLs (e.g., `?p=people`) → Added URL quality filter
- ORCID checkbox couldn't be unchecked → Fixed checkbox to reflect credential availability

**Key Implementation Details:**

```javascript
// URL quality filter
static isUsefulWebsiteUrl(url) {
  const genericPatterns = [
    /[?&]p=people/,           // ?p=people parameters
    /\/people\/?$/,           // ends with /people
    /\/directory\/?$/,        // ends with /directory
    /\/faculty\/?$/,          // ends with /faculty
    // ... more patterns
  ];
  return !genericPatterns.some(pattern => pattern.test(url));
}

// Cost estimation
const COSTS = {
  PUBMED: 0,
  ORCID: 0,
  CLAUDE_WEB_SEARCH: 0.015,  // ~$0.01 search + ~$0.005 Haiku tokens
};
```

**Database Migration:**
Run `node scripts/setup-database.js` to apply v3 schema changes.

---

## December 18-19, 2025 - Expert Reviewer Finder v2 Session 16

**Phase 4: Email Reviewers Feature + Contact Enrichment Improvements**

This session focused on implementing the Email Reviewers feature and fixing several issues with data persistence and contact enrichment.

### Features Implemented

**1. Email Reviewers Feature**

Created a complete system to generate .eml invitation files for reviewer candidates:

**Files Created:**
- `lib/utils/email-generator.js` - EML file generation with placeholder substitution
- `shared/components/EmailSettingsPanel.js` - Sender info and grant cycle settings
- `shared/components/EmailTemplateEditor.js` - Template editing with placeholder insertion
- `shared/components/EmailGeneratorModal.js` - Multi-step generation workflow
- `pages/api/reviewer-finder/generate-emails.js` - SSE endpoint for email generation
- `shared/config/prompts/email-reviewer.js` - Claude prompt for email personalization

**Placeholder System:**
| Placeholder | Source |
|-------------|--------|
| `{{greeting}}` | "Dear Dr. LastName" |
| `{{recipientName}}` | Candidate full name |
| `{{recipientLastName}}` | Parsed last name |
| `{{salutation}}` | "Dr." or "Professor" |
| `{{proposalTitle}}` | From proposal analysis |
| `{{proposalAbstract}}` | From proposal analysis |
| `{{piName}}` | PI name(s) |
| `{{piInstitution}}` | PI institution |
| `{{programName}}` | From grant cycle settings |
| `{{reviewDeadline}}` | Formatted date |
| `{{signature}}` | User's signature block |

**2. Abstract Extraction**
- Modified `shared/config/prompts/reviewer-finder.js` to extract abstract during analysis
- Updated `pages/api/reviewer-finder/analyze.js` to return `proposalAbstract`
- Updated `pages/api/reviewer-finder/save-candidates.js` to store abstract with proposals

### Bugs Fixed

**1. PI and Abstract Missing from Generated Emails**
- `handleSaveCandidates()` wasn't passing `proposalAbstract`, `proposalAuthors`, `proposalInstitution`
- Fixed by adding these fields to the save request in `pages/reviewer-finder.js`

**2. Enriched Contact Info Not Saving to Database**
- Two issues: async state update race condition and missing extraction from `contactEnrichment` object
- Fixed `save-candidates.js` to extract email/website from nested `contactEnrichment` object:
```javascript
const candidateEmail = candidate.email || candidate.contactEnrichment?.email || null;
const candidateWebsite = candidate.website || candidate.contactEnrichment?.website || null;
```

**3. Duplicate Proposals in Database**
- `generateProposalId()` used timestamps, creating unique IDs each save
- Changed to deterministic ID based only on title slug
- Added V5 database migration to merge existing duplicates

**4. Missing Salutation in Emails**
- Added `{{greeting}}` placeholder that combines "Dear Dr. LastName"
- Updated default template to use `{{greeting}}`

**5. Search Results Clearing on Tab Switch**
- Lifted state from `NewSearchTab` to parent `ReviewerFinderPage`
- Persists: `uploadedFiles`, `analysisResult`, `discoveryResult`, `selectedCandidates`

**6. State Clearing on Save**
- Wrapper functions didn't support callback pattern `setState(prev => ...)`
- Fixed by checking if argument is function and calling it with previous value

**7. Google Scholar API 400 Errors**
- `google_scholar_profiles` SerpAPI engine returning 400 errors
- Added `findScholarProfileViaGoogle()` fallback using regular Google search with `site:scholar.google.com`

### Contact Enrichment Improvements

**Expanded Faculty Page URL Detection:**
- More path patterns: `/research/`, `/lab/`, `/group/`, `/member/`, `/team/`, `/investigator/`, etc.
- International domain support: `.ac.uk`, `.ac.jp`, `.edu.au`, `.uni-`, `.u-`, etc.
- Research organization patterns: `nih.gov`, `nsf.gov`, `researchgate.net/profile`, `orcid.org`

**Multiple SerpAPI Fallback Queries:**
1. Primary: `"Name" institution email`
2. Fallback: `"Name" institution faculty`
3. Fallback: `"Name" site:.edu institution`
4. Fallback: `"Name" institution lab research`
5. Fallback: `"Name" institution profile`

**Google Scholar Profile Extraction:**
- New `findScholarProfile()` method for SerpAPI Scholar profiles
- Fallback `findScholarProfileViaGoogle()` for when Scholar API fails
- Returns: `scholarProfileUrl`, `scholarId`, `scholarName`, `scholarAffiliation`, `scholarCitedBy`

### UI Changes

- Renamed "New Search" tab to "Search"
- Search results now persist when switching between tabs

### Files Modified

- `pages/reviewer-finder.js` - State lifting, email integration, tab rename
- `pages/api/reviewer-finder/save-candidates.js` - Email/website extraction from enrichment
- `pages/api/reviewer-finder/analyze.js` - Abstract extraction
- `lib/services/serp-contact-service.js` - Enhanced URL detection, Scholar fallback
- `lib/utils/contact-parser.js` - `isInternationalAcademicDomain()`, improved `isUsefulWebsiteUrl()`
- `lib/utils/email-generator.js` - Added `{{greeting}}` placeholder
- `shared/config/prompts/reviewer-finder.js` - Added abstract extraction
- `scripts/setup-database.js` - V5 migration for duplicate merging

### Test Scripts Added

- `scripts/test-contact-enrichment.js` - Tests Claude web search, ORCID, and SerpAPI services

### Git Commits

- `6187951` Add fallback for Google Scholar API 400 errors
- (Previous commits in session: email feature, state persistence, duplicate fix, etc.)

---

## December 19, 2025 - Expert Reviewer Finder v2 Session 17

**Features Implemented & Bugs Fixed**

### 1. Google Scholar Profiles API Deprecation Fix (`16af684`)

The `google_scholar_profiles` SerpAPI engine has been deprecated and returns errors. Fixed by removing the deprecated API call and using the existing Google search fallback directly.

**File Modified:**
- `lib/services/serp-contact-service.js` - `findScholarProfile()` now calls `findScholarProfileViaGoogle()` directly

### 2. Edit Saved Candidates Feature (`8b92201`)

Added ability to edit researcher information for saved candidates in the My Candidates tab. Edits update the shared `researchers` table, affecting all proposals that include that researcher.

**Editable Fields:**
- Name, Affiliation, Email, Website, h-index

**Files Modified:**
- `pages/api/reviewer-finder/my-candidates.js` - Extended PATCH handler to update researchers table
- `pages/reviewer-finder.js` - Added `EditCandidateModal` component and edit button on `SavedCandidateCard`

**API Changes:**
```javascript
// Extended PATCH /api/reviewer-finder/my-candidates
{
  suggestionId: number,
  // Existing fields
  invited?: boolean,
  accepted?: boolean,
  notes?: string,
  // NEW: researcher fields
  name?: string,
  affiliation?: string,
  email?: string,
  website?: string,
  hIndex?: number
}
```

When email is edited, `email_source` is set to `'manual'` and `contact_enriched_at` is updated.

### 3. PI/Author Self-Suggestion Bug Fix (`3b9fbaf`)

Fixed issue where proposal authors (PI and co-PIs) were being suggested as reviewers for their own proposals.

**Implementation:**
- Added `filterProposalAuthors()` to `DeduplicationService` with fuzzy name matching via `areNamesSimilar()`
- Uses 85% string similarity threshold + initials matching
- Applied filter in `discover.js` to both verified and discovered candidates

**Files Modified:**
- `lib/services/deduplication-service.js` - Added `filterProposalAuthors()` and `areNamesSimilar()` methods
- `pages/api/reviewer-finder/discover.js` - Applied PI/author filter to both tracks

### 4. ChemRxiv Integration (`a01b7e4`, `1e18d24`)

Added ChemRxiv (chemistry preprints) as a new database search source alongside PubMed, ArXiv, and BioRxiv.

**Files Created:**
- `lib/services/chemrxiv-service.js` - Complete ChemRxiv Public API v1 integration
  - Base URL: `https://chemrxiv.org/engage/chemrxiv/public-api/v1`
  - `search()`, `parseResponse()`, `searchByAuthor()` methods
  - `isRelevantForChemRxiv()` - Keyword matching for chemistry-related proposals

**Files Modified:**
- `shared/config/prompts/reviewer-finder.js` - Added CHEMRXIV_QUERIES section to prompt
- `lib/services/discovery-service.js` - Added `searchChemRxiv` option and method
- `pages/reviewer-finder.js` - Added ChemRxiv toggle to search sources UI
- `pages/api/reviewer-finder/discover.js` - Added `searchChemrxiv` option

**ChemRxiv API Details:**
- Supports keyword search via `term` parameter
- Sort by relevance: `RELEVANT_DESC`
- Rate limit: 429 response indicates throttling needed
- Returns authors with corresponding author and institution data

### 5. Search Result Logging Enhancement (`8ef30b7`)

Added comprehensive logging to all four database search methods to help debug which searches return results.

**Log Format:**
```
[Discovery] PubMed search complete: 150 candidates from 3 queries
[Discovery] PubMed unique authors: 87 Smith J, Jones A, Brown M, Wilson K, Lee S...
[ChemRxiv] Query "cyanide donors synthesis..." → 12 total, 12 returned
[ChemRxiv] Sample authors: Pluth M, Smith J, Lee K
```

**Files Modified:**
- `lib/services/discovery-service.js` - Added logging to `searchPubMed()`, `searchArXiv()`, `searchBioRxiv()`, `searchChemRxiv()`
- `lib/services/chemrxiv-service.js` - Added per-query logging with total/returned counts

### Git Commits

- `16af684` Remove deprecated Google Scholar Profiles API
- `8b92201` Add edit saved candidates feature
- `3b9fbaf` Fix PI self-suggestion as reviewer bug
- `a01b7e4` Add ChemRxiv database search integration
- `1e18d24` Fix ChemRxiv API 400 errors (sort parameter)
- `8ef30b7` Add search result logging for all database sources

---

## December 20, 2025 - Session 18: Documentation & UI Cleanup

**Documentation, App Consolidation, and UI Polish Session**

With the Reviewer Finder now stable and production-ready, this session focused on documentation, deprecating redundant apps, and polishing the overall UI consistency.

### Part 1: Documentation & Planning

1. **Created `ROADMAP_DATABASE_TAB.md`**
   - Detailed implementation plan for the Database Tab feature
   - 4-phase approach: Browse/Search → Details → Management → Advanced
   - API endpoint design and UI mockup

2. **Updated project documentation**
   - Updated CLAUDE.md with current app state and categories
   - Added Session 18 summary to DEVELOPMENT_LOG.md

### Part 2: App Deprecation

Deprecated 3 redundant apps (hidden from UI, files retained):

| App | Reason |
|-----|--------|
| document-analyzer | Duplicate of proposal-summarizer with worse UX |
| find-reviewers | Superseded by Reviewer Finder |
| find-reviewers-pro | Merged into Reviewer Finder |

### Part 3: UI Consistency Updates

**App Renaming:**
- "Expert Reviewer Finder v2" → "Reviewer Finder"
- "Batch Proposal Summaries" → "Batch Phase II Summaries"
- "Funding Gap Analyzer" → "Funding Analysis"
- "Phase II Writeup" → "Create Phase II Writeup Draft"
- "Phase I Writeup" → "Create Phase I Writeup Draft"
- "Peer Review Summary" → "Summarize Peer Reviews"

**Icon Consistency:**
- ✍️ for both writeup apps (Phase I and Phase II)
- 📑 for both batch apps (Phase I and Phase II)
- Migrated icon toggle buttons from find-reviewers-pro to Reviewer Finder

**Landing Page Updates:**
- Reordered apps: Batch Phase I, Batch Phase II, Funding Analysis, Create Phase I, Create Phase II, Reviewer Finder, Summarize Peer Reviews, Expense Reporter, Literature Analyzer
- Changed category filters from "Available/Coming Soon" to "Phase I/Phase II/Other Tools"
- Removed redundant feature keywords from app cards
- Updated app descriptions for consistency

**Header Updates:**
- Removed redundant "Document Processing Suite" logo (Home link serves same purpose)
- Updated navigation order to match landing page
- Added Literature Analyzer to navigation

**Footer Updates:**
- Added author credit: "Written by Justin Gallivan" with mailto link

### Reviewer Finder - Current State

The application is feature-complete for the core workflow:
- PDF upload → Claude analysis → 4-database search (PubMed, ArXiv, BioRxiv, ChemRxiv)
- Contact enrichment (5 tiers)
- Email generation with .eml files
- Save/edit/delete candidates in database
- Multi-select operations

**Next Priority:** Database Tab Implementation (see ROADMAP_DATABASE_TAB.md)

---

## January 14, 2026 - Session 22: Email Generation V6 & Settings UI

**Major Feature: Email Generation with Attachments and Settings Modal**

This session completed the email generation workflow with proper attachment support, settings UI, and various bug fixes.

### Features Implemented

**1. Settings Modal Overhaul**
- Reordered sections: Sender Info → Grant Cycle → Email Template → Attachments
- Added "Additional Attachments" section for optional files
- Review template upload via Vercel Blob storage
- Grant cycle custom fields (proposalDueDate, honorarium, proposalSendDate, commitDate)
- Summary page extraction configuration

**2. Email Attachment Support**
- MIME multipart/mixed format for .eml files with attachments
- Automatic project summary extraction from proposal PDFs (using pdf-lib)
- Review template attachment (user-uploaded)
- Additional attachments (multiple optional files)
- Re-extract summary button in My Candidates tab

**3. Investigator Team Formatting**
- New `{{investigatorTeam}}` placeholder handles PI + Co-PI formatting gracefully:
  - 0 Co-PIs: "the PI Dr. Smith"
  - 1 Co-PI: "the PI Dr. Smith and co-investigator Dr. Jones"
  - 2+ Co-PIs: "the PI Dr. Smith and 2 co-investigators (Dr. Jones, Dr. Lee)"
- New `{{investigatorVerb}}` for subject-verb agreement ("was" vs "were")

**4. Enhanced Co-PI Extraction**
- Updated Claude prompt with detailed guidance for finding Co-PIs
- Looks in: title/cover pages, "Senior Personnel" sections, author lists
- Graceful fallback to just PI name when Co-PIs not found

**5. Custom Field Date Formatting**
- `formatCustomFields()` converts ISO dates (2026-01-29) to readable format (January 29, 2026)
- Auto-detects date fields by name pattern or ISO format

### Bug Fixes

- **Webpack cache errors**: Fixed by clearing .next/cache directory
- **Template literal interpretation**: Escaped `${{customField:...}}` to prevent JS interpolation
- **Upload handler mismatch**: Created `/api/upload-file` for direct FormData uploads
- **Custom fields not populating**: Fixed EmailGeneratorModal to merge all localStorage sources
- **Extract summary API error**: Fixed to pass `Buffer.from(extraction.buffer)` instead of object
- **Verb agreement**: "the PI Dr. Smith were" → "the PI Dr. Smith was"

### Email Workflow Documentation

Generated .eml files open as "received" messages in email clients. To send:
1. Open the .eml file
2. Forward to recipient (remove "Fwd:" from subject), OR
3. Copy content into a new message

**Future Consideration:** When integrated with CRM, implement direct email sending via SendGrid, AWS SES, or similar service.

### Files Created/Modified

**New Files:**
- `pages/api/upload-file.js` - Direct FormData upload to Vercel Blob
- `pages/api/reviewer-finder/extract-summary.js` - Re-extract summary pages
- `lib/utils/pdf-extractor.js` - PDF page extraction using pdf-lib

**Modified Files:**
- `lib/utils/email-generator.js` - Attachment support, investigatorTeam, date formatting
- `shared/components/SettingsModal.js` - Reordered sections, additional attachments
- `shared/components/EmailGeneratorModal.js` - Load settings from multiple sources
- `shared/components/EmailTemplateEditor.js` - New placeholder options
- `shared/config/prompts/reviewer-finder.js` - Enhanced Co-PI extraction
- `CLAUDE.md` - Updated documentation with email workflow and future considerations

### Database Schema

**V6 Additions:**
- `reviewer_suggestions.summary_blob_url` - URL to extracted summary PDF

### Git Commits

- Format custom date fields in email template
- Reorder Settings modal menu sections
- Add additional attachments support to Settings modal
- Add investigatorTeam placeholder for better PI/Co-PI formatting
- Enhance Co-PI extraction and improve fallback handling
- Fix extract-summary API: pass buffer not object to Vercel Blob
- Add investigatorVerb for proper subject-verb agreement
- Add X-Unsent header to .eml files for draft mode
- Add Apple Mail draft header and remove Date for draft .eml files
- Update email workflow instructions for Outlook compatibility
- Add email workflow instructions and document future CRM integration

---

## January 15, 2026 - Session 23: Grant Cycle Management & UI Enhancements

**Major Feature: Grant Cycle and Program Area Management**

This session added comprehensive grant cycle management and program area tracking to the Reviewer Finder.

### Features Implemented

**1. Database Migrations (V8, V9)**
- V8: Added `declined` column to `reviewer_suggestions` table
- V9: Added `program_area` column to `reviewer_suggestions` table
- Added historical grant cycles: J23, D23, J24, D24, J25, D25, J26

**2. My Candidates Tab Improvements**
- Editable program area dropdown on each proposal card
  - Options: Science & Engineering Research Program, Medical Research Program, Not assigned
  - Color-coded: Blue for Science & Eng, Red for Medical, Gray for unassigned
- Editable grant cycle dropdown on each proposal card
  - Shows all active cycles from database
  - Color-coded: Purple when assigned, Gray when unassigned
- Declined status button alongside Invited/Accepted (red styling)
- PI and Institution display on proposal cards
- Filter dropdowns for Institution, PI, and Program (only show when >1 unique value)

**3. New Search Tab Enhancement**
- Grant cycle selector dropdown (replaces static indicator)
- Auto-generates cycles for current year + next year (18 months coverage)
- Auto-creates missing cycles in database on page load
- Persists selected cycle to localStorage
- Defaults to first available cycle if none previously selected

**4. Prompt Updates**
- Updated Claude analysis prompt to extract Keck cover page fields:
  - `PROGRAM_AREA`: Medical Research Program or Science and Engineering Research Program
  - `PRINCIPAL_INVESTIGATOR`: Single name from "Project Leader" field
  - `CO_INVESTIGATORS`: Names from "Co-Principal Investigators" field
- Fixed PI field to contain single name (previously had multiple authors)

### API Changes

**`/api/reviewer-finder/my-candidates.js`**
- Added `programArea` to PATCH handler for bulk proposal updates
- Added `declined` to SELECT queries and response mapping
- Added `program_area` to SELECT queries and response mapping

**`/api/reviewer-finder/save-candidates.js`**
- Added `programArea` to request body and INSERT/UPDATE

### Files Modified

- `pages/reviewer-finder.js` - Cycle selector, program/cycle dropdowns, filters
- `pages/api/reviewer-finder/my-candidates.js` - PATCH support for program/cycle
- `pages/api/reviewer-finder/save-candidates.js` - Program area support
- `scripts/setup-database.js` - V8 and V9 migrations
- `shared/config/prompts/reviewer-finder.js` - Keck cover page field extraction

### Git Commits

- Add program area and grant cycle editing to My Candidates
- Add grant cycle selector dropdown to New Search tab

---

## January 16, 2026 - Session 24: Concept Evaluator App

**Major Feature: Pre-Phase I Concept Screening Tool**

This session implemented the Concept Evaluator app, a new tool for screening research concepts before Phase I.

### Features Implemented

**1. Concept Evaluator App**
- Upload multi-page PDFs where each page contains one research concept
- Two-stage AI evaluation process:
  - Stage 1: Claude Vision API extracts title, PI, summary, research area, keywords
  - Stage 2: Literature search + Claude provides final evaluation with ratings
- Automatic literature search based on detected research area:
  - Life sciences → PubMed + BioRxiv
  - Chemistry → PubMed + ChemRxiv
  - Physics/CS/Math → ArXiv
- Label-based ratings (Strong/Moderate/Weak) for:
  - Keck Alignment (high-risk, pioneering, wouldn't be funded elsewhere)
  - Scientific Merit (sound science, clear hypothesis)
  - Feasibility (technical challenges, likelihood of success)
  - Novelty (based on literature search results)
- Export to JSON and Markdown
- New "Concepts" category on landing page

**2. PDF Page Splitter Utility**
- `lib/utils/pdf-page-splitter.js` - Split multi-page PDF into individual pages
- Returns base64-encoded PDF for each page (for Claude Vision API)
- Uses pdf-lib (existing dependency)

### Files Created

- `pages/concept-evaluator.js` - Frontend with streaming progress and results display
- `pages/api/evaluate-concepts.js` - Two-stage evaluation API with literature search
- `lib/utils/pdf-page-splitter.js` - PDF page extraction utility
- `shared/config/prompts/concept-evaluator.js` - Evaluation prompts with Keck criteria

### Files Modified

- `pages/index.js` - Added Concept Evaluator app card and "Concepts" category filter
- `shared/components/Layout.js` - Added navigation link for Concept Evaluator
- `CLAUDE.md` - Added Concept Evaluator documentation

### Architecture

```
PDF Upload → Split Pages → For Each Page:
  1. Claude Vision (Stage 1) → Extract metadata + keywords
  2. Literature Search → PubMed/ArXiv/BioRxiv/ChemRxiv
  3. Claude Text (Stage 2) → Final evaluation with literature context
→ Aggregate Results → Export JSON/Markdown
```

### Git Commits

- Add Concept Evaluator app for pre-Phase I screening

---

## January 16, 2026 - Session 25: Concept Evaluator Refinements

**Concept Evaluator Testing and Improvements**

This session focused on testing the Concept Evaluator with real data and refining the evaluation approach based on user feedback.

### Issues Identified & Fixed

**1. Sycophantic Evaluations**
- Problem: 7 of 8 concepts received identical praise ("This concept represents exactly the type of pioneering, high-risk research that Keck should support")
- Solution: Completely rewrote Stage 2 prompt with anti-sycophancy instructions:
  - Explicit rating distribution guidance (Strong = top 10-20%)
  - List of language to avoid ("exciting", "groundbreaking", "pioneering")
  - Requirement that every concept have substantive concerns
  - Default skeptical stance

**2. Evaluation Framing - Impact vs Feasibility**
- User feedback: Focus on potential impact, not feasibility at screening stage
- Added `potentialImpact` rating with framing: "If everything proposed turns out correct, what is the impact?"
- Feasibility remains but as secondary criterion for identifying addressable concerns
- Key question: "Will success have significant impact on the field or world?"

**3. Literature Search Improvements**
- Problem: Queries too specific - combining 6+ keywords into one long query returned no results
- Example bad query: "retroviral immunity CRISPR screening packageable lentiviral vectors Simian Immunodeficiency Virus innate immunity"
- Solution: Adopted Reviewer Finder pattern:
  - Claude generates 2-3 SHORT queries (3-5 words each)
  - Each query executed individually
  - Results deduplicated across queries
- Example good queries: "CRISPR gene editing", "retroviral vector packaging", "host innate immunity"

**4. Author Display Bug**
- Problem: Authors displayed as "[object Object], [object Object]"
- Cause: Services return author objects with `name` property, code tried to join objects as strings
- Fix: Extract author names properly: `a.name || 'Unknown'`

**5. Missing Paper Links**
- Added clickable URLs to literature results
- Priority: DOI → PubMed → ArXiv
- Links display in both UI and markdown export

### UI Updates

- Literature search section now shows each query as styled tag
- Paper titles are clickable links
- Summary stats show "High Impact" / "Moderate Impact" instead of Keck Fit
- Ratings row: Impact, Keck Fit, Merit, Novelty, Feasibility (5 ratings)

### Model Configuration Discovery

Identified that model selection is centralized in `shared/config/baseConfig.js`:
```javascript
DEFAULT_MODEL: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514'
```

All apps currently use the same model. This was flagged as a significant issue - different apps may need different models based on task complexity. Deferred to Session 26 for per-app model configuration.

### Files Modified

- `shared/config/prompts/concept-evaluator.js` - Anti-sycophancy, impact framing, short queries
- `pages/api/evaluate-concepts.js` - Individual query execution, author name extraction, paper URLs
- `pages/concept-evaluator.js` - Query display, paper links, impact-focused stats

### Git Commits

- Enhance Concept Evaluator with impact focus and literature visibility
- Restore full feasibility analysis as secondary criterion
- Improve literature search with focused short queries
- Fix author display and add paper links in literature results

---

## Session 27 - January 18, 2026

### Email Tracking for Reviewer Candidates

Implemented full email tracking lifecycle for the Reviewer Finder:

**API Changes:**
- Extended `my-candidates.js` PATCH endpoint to accept `emailSentAt`, `responseType`, `responseReceivedAt`
- Added `markAsSent` option to `generate-emails.js` that auto-records timestamp when emails are generated
- Supports `'now'` as value for timestamps to set current time

**UI Changes:**
- EmailGeneratorModal now has "Mark candidates as Email Sent" checkbox (default: on)
- SavedCandidateCard displays sent timestamp (📧 Jan 18) next to status buttons
- Clicking Invited toggles `email_sent_at`
- Clicking Accepted/Declined sets `response_type` and `response_received_at`
- Added "Mark Bounced" button in expanded card details

### Database Tab Phase 3 - Researcher Management

Complete CRUD operations for researchers in the Database tab:

**API Endpoints Added (`/api/reviewer-finder/researchers`):**
- `GET ?mode=duplicates` - Find potential duplicates by email, normalized name, ORCID, Google Scholar ID
- `POST` - Merge researchers (moves keywords, transfers proposal associations, keeps best data)
- `PATCH` - Edit researcher fields (name, affiliation, email, website, metrics)
- `DELETE` - Delete single researcher or bulk delete multiple

**UI Features:**
- ResearcherDetailModal enhanced with Edit and Delete buttons
- Edit mode: inline form for all editable fields
- Delete confirmation showing proposal association count
- Bulk selection with checkbox column and "select all" header
- Bulk delete with confirmation dialog
- CSV Export button (fetches up to 1000 matching researchers)
- Find Duplicates button opens DuplicatesModal
- DuplicatesModal shows groups by match type, allows selecting primary and merging

**Merge Logic:**
- Keywords moved to primary (ON CONFLICT DO NOTHING for duplicates)
- Proposal associations (reviewer_suggestions) transferred to primary
- Missing data (email, website, ORCID, Scholar ID) filled from secondary
- Higher metrics (h-index, i10-index, citations) kept
- Secondary researcher deleted after merge

### Files Modified

**Email Tracking:**
- `pages/api/reviewer-finder/my-candidates.js` - Email tracking fields in GET and PATCH
- `pages/api/reviewer-finder/generate-emails.js` - markAsSent option with DB updates
- `shared/components/EmailGeneratorModal.js` - Checkbox and onEmailsGenerated callback
- `pages/reviewer-finder.js` - SavedCandidateCard email display and handlers

**Database Tab Phase 3:**
- `pages/api/reviewer-finder/researchers.js` - POST/PATCH/DELETE + duplicates mode
- `pages/reviewer-finder.js` - ResearcherDetailModal edit/delete, DuplicatesModal, bulk operations

### Git Commits

- `c89a8d4` Add email tracking for reviewer candidates
- `18be0af` Add Database Tab Phase 3: researcher management features

---

## Session 28 - January 18, 2026

### Literature Analyzer App Implementation

Implemented the Literature Analyzer app for research paper analysis and synthesis:

**Core Features:**
- Upload one or more research paper PDFs
- Claude Vision extracts key information from each paper
- Cross-paper synthesis for 2+ papers identifying themes and patterns
- Tabbed results view (Synthesis / Individual Papers)
- Optional focus topic to guide synthesis
- Export as JSON or Markdown

**Paper Extraction (per paper):**
- Title, authors, year, journal, DOI
- Abstract and research type classification
- Background (problem, motivation)
- Methods (approach, techniques, sample/data)
- Findings (main, quantitative, qualitative)
- Conclusions (summary, implications, limitations, future work)
- Keywords and field/subfield

**Synthesis Features (2+ papers):**
- Overview with date range and primary field
- Theme identification with consensus and disagreements
- Key findings categorized (established, emerging, contradictory)
- Research gaps (identified by authors, inferred)
- Methodological approaches comparison
- Future research directions
- Practical implications
- Quality assessment

**Files Created:**
- `pages/literature-analyzer.js` - Frontend with PaperCard and SynthesisSection components
- `pages/api/analyze-literature.js` - Two-stage API (extraction + synthesis)
- `shared/config/prompts/literature-analyzer.js` - Paper extraction and synthesis prompts

**Files Modified:**
- `shared/config/baseConfig.js` - Added literature-analyzer model config (Sonnet 4)
- `shared/components/Layout.js` - Enabled navigation link
- `pages/index.js` - Changed status from coming-soon to active
- `CLAUDE.md` - Added feature summary and model config documentation

### Git Commits

- (pending) Implement Literature Analyzer app

---

Last Updated: January 18, 2026
