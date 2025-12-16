# Document Processing Multi-App System

## ⚠️ IMPORTANT: Git Commit Policy

**Commit working changes to git regularly during each session.** This provides rollback points when debugging breaks things.

- Before making significant changes, ensure current working state is committed
- After completing a feature or fix that works, commit immediately
- Use descriptive commit messages
- Don't let multiple sessions of work accumulate without commits

This prevents losing working code when experimental changes cause regressions.

---

## Project Overview
This is a multi-application document processing system designed to handle various document analysis workflows using Claude AI. The architecture supports multiple specialized apps (proposal-summarizer, grant-reviewer, literature-analyzer) that share ~80% of their codebase.

## Architecture

### Directory Structure
```
/
├── shared/                    # Shared components and utilities
│   ├── api/
│   │   ├── handlers/         # Core processing logic
│   │   │   ├── claudeClient.js
│   │   │   ├── fileProcessor.js
│   │   │   └── responseStreamer.js
│   │   └── middleware/       # Common middleware
│   ├── components/           # Reusable React components
│   ├── utils/               # Utility functions
│   │   └── dataExtraction.js
│   └── config/              # Configuration
│       ├── baseConfig.js
│       └── prompts/         # Prompt templates
├── apps/                    # Individual applications
│   ├── proposal-summarizer/
│   ├── grant-reviewer/      # Future app
│   └── literature-analyzer/ # Future app
├── pages/                   # Current app (to be migrated)
├── lib/                     # Current config (to be migrated)
└── styles/                  # Current styles (to be shared)
```

### Key Design Principles
1. **Code Reusability**: Shared components handle 80% of functionality
2. **Modularity**: Each app only contains its unique configuration and prompts
3. **Scalability**: New apps can be added with minimal code
4. **Consistency**: Same UI/UX patterns across all apps
5. **Maintainability**: Fix once, benefit everywhere

## Current Status

### ✅ Completed
- **Phase II writeup draft app** - Fully functional with unified Layout system
- **Expense Reporter App** - Automated expense report generation from receipts/invoices (PDF & images)
- **Federal Funding Gap Analyzer** - (November 2025) - Comprehensive federal funding analysis tool
  - Real-time NSF API integration for PI award history
  - State-based filtering for accurate institution matching
  - Co-PI role search option (enabled by default)
  - Claude-based analysis for NIH/DOE/DOD funding landscapes
  - Individual report generation with collapsible cards
  - ZIP download for batch analyses
  - Filename pattern: `funding_analysis_[PI]_[filename]_[date].md`
  - Token optimization (6K chars for extraction, truncated NSF data)
  - Smart fallback to last name if full name search fails
- **Expert Reviewers Pro (Beta)** - NEW! (December 2025) - Multi-source academic database search
  - Searches PubMed, ArXiv, BioRxiv, and Google Scholar (via SerpAPI)
  - Vercel Postgres database for intelligent caching (6-month expiry)
  - Smart deduplication ("J. Smith" merges with "John Smith")
  - Conflict of interest filtering (excludes author's institution)
  - Results include h-index, citations, and recent publications
  - Relevance ranking based on h-index, citations, and keyword matches
  - Streaming progress updates during multi-source search
  - Export to CSV, Markdown, and JSON formats
- **Unified Layout System** - All pages using shared components:
  - `Layout.js` - Main layout with navigation and responsive design
  - `PageHeader.js` - Consistent page headers with icons
  - `Card.js` - Reusable content containers
  - `Button.js` - Standardized button components
  - `FileUploaderSimple.js` - File upload component
  - `ApiKeyManager.js` - API key management
  - `ResultsDisplay.js` - Results visualization
- **Tailwind CSS Integration** - Modern utility-first styling system
- **Error Handling Standardization** - Consistent error display patterns
- **Responsive Design** - Mobile and desktop optimized layouts
- **Runtime Error Fixes** - All CSS module conflicts resolved
- **Git Integration** - Complete codebase committed and pushed
- **Vercel Blob Storage Integration** - Replaced multer with Vercel Blob for large file uploads (>4.5MB)
- **Claude Vision API Integration** - Image analysis capabilities for receipt/invoice processing
- **Frontend-Backend Data Structure Consistency** - Comprehensive audit and fixes across all applications
- **Streaming Response Improvements** - Enhanced real-time progress tracking and debugging
- **Dropdown Parameter Integration** - Summary length and technical level selections now properly customize Claude prompts

### 🚧 Ready for Next Session
- Color palette application (systematic brand colors) - Detailed plan in `COLOR_PALETTE_PLAN.md`
- End-to-end functionality testing with new dropdown integration

### 📋 To Do (Lower Priority)
- Legacy file cleanup (blob-uploader.js, index-original.js)
- Create grant-reviewer app as proof of concept
- Build literature-analyzer app
- Add comprehensive testing
- Implement production features (rate limiting, caching)

## Tech Stack
- **Frontend**: Next.js 14, React 18, Tailwind CSS 3.4
- **Backend**: Next.js API Routes
- **AI**: Claude API (Anthropic)
- **File Processing**: pdf-parse, Vercel Blob Storage
- **File Storage**: Vercel Blob (for uploads >4.5MB)
- **Styling**: Tailwind CSS with PostCSS
- **Deployment**: Vercel

## API Endpoints

### Current (To Be Refactored)
- `/api/process` - Main document processing (streaming)
- `/api/find-reviewers` - Expert reviewer matching
- `/api/search-reviewers-pro` - Multi-source academic database search (streaming)
- `/api/qa` - Q&A functionality
- `/api/refine` - Summary refinement
- `/api/upload-handler` - Vercel Blob file upload handler
- `/api/process-expenses` - Expense extraction from receipts/invoices (PDF & images)
- `/api/analyze-funding-gap` - Federal funding gap analysis with NSF API integration (streaming)

### Future Architecture
Each app will have minimal API routes that call shared handlers:
```javascript
// apps/[app-name]/api/process.js
import { processDocument } from '@/shared/api/handlers';
import { APP_CONFIG } from '../config';

export default async function handler(req, res) {
  return processDocument(req, res, APP_CONFIG);
}
```

## Configuration System

### Base Configuration
All apps inherit from `shared/config/baseConfig.js`:
- Claude API settings
- File processing limits
- Model parameters
- Security settings

### App-Specific Configuration
Each app extends base config with:
- Custom prompts
- Specific processing rules
- UI customizations
- Export formats

## Development Workflow

### Adding a New App
1. Create directory: `apps/[app-name]/`
2. Add app-specific config and prompts
3. Create minimal API routes using shared handlers
4. Customize UI if needed (or use shared components)
5. Test and deploy

### Running Commands
```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Lint code
npm run lint
```

## Key Features

### Shared Capabilities
- PDF/text file upload and processing
- Claude AI integration
- Real-time progress tracking
- Multiple export formats (Markdown, JSON)
- Error handling and fallbacks
- Streaming responses

### App-Specific Features
- **Phase II writeup draft**: Research proposal writeup drafts, Q&A, refinement
- **Expense Reporter**: Receipt/invoice processing with CSV/Excel export
- **grant-reviewer**: Automated grant review scoring (planned)
- **literature-analyzer**: Literature review synthesis (planned)

## Environment Variables
```env
CLAUDE_API_KEY=your_api_key_here
CLAUDE_MODEL=claude-sonnet-4-20250514
NODE_ENV=development
```

## Testing Strategy
- Unit tests for shared utilities
- Integration tests for API endpoints
- E2E tests for critical workflows
- Component tests for React components

## Security Considerations
- API key validation
- File size limits
- Input sanitization
- Rate limiting (to be implemented)
- CORS configuration

## Performance Optimizations
- Text chunking for large documents
- Streaming responses for real-time updates
- Caching for repeated operations (planned)
- Concurrent processing support

## Deployment
- Designed for Vercel deployment
- Zero-configuration setup
- Environment variables via Vercel dashboard
- Automatic scaling

## Contributing Guidelines
1. Follow existing code patterns
2. Update shared code carefully (affects all apps)
3. Add tests for new features
4. Document API changes
5. Use semantic commit messages

## Future Enhancements
- [ ] Multi-language support
- [ ] Batch processing optimization
- [ ] User authentication
- [ ] Analytics dashboard
- [ ] Webhook integrations
- [ ] Custom template builder
- [ ] Collaborative features

## Support
- GitHub Issues: [Create an issue](https://github.com/justingallivan/Phase-II-Summaries/issues)
- Documentation: See `/docs` directory
- API Reference: See `/shared/api/README.md`

## License
[Your License Here]

## Development Log

### September 2025 - Frontend-Backend Data Structure Consistency Audit

**Problem Identified:**
After implementing Vercel Blob storage, the backend was processing files correctly but the frontend wasn't displaying results. Through systematic debugging, identified a critical data structure mismatch between frontend and backend components.

**Root Cause:**
The backend APIs were returning `{formatted, structured}` but various frontend components expected different property names like `{summary, structuredData}`. This inconsistency prevented results from displaying despite successful processing.

**Comprehensive Solution:**
Conducted a systematic audit of all applications to ensure frontend-backend consistency:

#### Files Audited and Fixed:

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

#### API Endpoints Verified:

- **`/api/process`**: Returns `{formatted, structured}` ✅
- **`/api/find-reviewers`**: Returns `{extractedInfo, reviewers, csvData, parsedReviewers, metadata}` ✅ 
- **`/api/refine`**: Returns `{refinedSummary, timestamp}` ✅
- **`/api/qa`**: Returns `{answer, timestamp}` ✅

#### Standardized Data Structure:

All applications now use consistent data structure pattern:
- **`result.formatted`** - Main content/summary text
- **`result.structured`** - Extracted structured data objects
- **`result.metadata`** - File processing metadata
- **`result.csvData`** - CSV export data (reviewers app only)

#### Commits Made:

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

### September 21, 2025 - Dropdown Parameter Integration

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

#### Commit Made:
- **Commit e029e0c**: "Implement dropdown parameter integration for batch proposal summaries"
  - 2 files changed, 23 insertions(+), 6 deletions(-)
  - Fixed missing functionality where dropdown selections were ignored

---

### November 7, 2025 - Federal Funding Gap Analyzer

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

5. `shared/components/Layout.js` - Added navigation link (💵 Funding Gap Analyzer)

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

### December 10, 2025 - Expert Reviewers Pro (Beta)

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

### December 11, 2025 - Expert Reviewers Pro Improvements

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

### December 14, 2025 - Expert Reviewer Finder v2 Session 9

**Features Implemented:**

1. **Google Scholar Profile Links** (`426b6d7`, `b094ee7`)
   - Added 🎓 Scholar Profile link to CandidateCard and SavedCandidateCard
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
     - ⚠️ warning emoji prefix
     - Amber/yellow background highlighting (`bg-amber-50 text-amber-600`)
   - Candidates track `reasoningFromFallback` flag

**Files Modified:**
- `pages/reviewer-finder.js` - Scholar links + fallback UI
- `lib/services/claude-reviewer-service.js` - Retry logic with fallback

---

### December 15, 2025 - Expert Reviewer Finder v2 Session 10

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

Last Updated: December 15, 2025
Version: 2.7 (Expert Reviewer Finder v2 - Verification quality improvements)