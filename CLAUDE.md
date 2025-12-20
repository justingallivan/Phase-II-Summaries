# Document Processing Multi-App System

## Git Commit Policy

**Commit working changes regularly.** This provides rollback points when debugging breaks things.

- Commit after completing a feature or fix that works
- Use descriptive commit messages
- Don't let multiple sessions accumulate without commits

---

## Project Overview

A multi-application document processing system using Claude AI for grant-related workflows. Built with Next.js and deployed on Vercel.

## Directory Structure (Actual)

```
/
├── pages/                     # Next.js pages and API routes
│   ├── api/                   # API endpoints
│   │   ├── reviewer-finder/   # Expert Reviewer Finder v2 endpoints
│   │   └── *.js               # Other API endpoints
│   └── *.js                   # Frontend pages
├── shared/                    # Shared components and utilities
│   ├── components/            # React components (Layout, FileUploader, etc.)
│   ├── config/prompts/        # Prompt templates
│   └── utils/                 # Utility functions
├── lib/                       # Core libraries
│   ├── services/              # Service classes (PubMed, ORCID, Claude, etc.)
│   ├── db/                    # Database schema and migrations
│   ├── utils/                 # Utility functions
│   ├── config.js              # App configuration and prompts
│   └── fundingApis.js         # NSF API utilities
├── scripts/                   # Setup and utility scripts
├── styles/                    # Global styles
└── tests/                     # Test files
```

## Applications

| App | Page | API Endpoint | Status | Description |
|-----|------|--------------|--------|-------------|
| **Expert Reviewer Finder v2** | `reviewer-finder.js` | `/api/reviewer-finder/*` | **Production Ready** | AI + database search for expert reviewers with contact enrichment and email generation |
| Batch Proposal Summaries | `batch-proposal-summaries.js` | `/api/process` | Stable | Batch document summarization with configurable length/level |
| Funding Gap Analyzer | `funding-gap-analyzer.js` | `/api/analyze-funding-gap` | Stable | NSF API integration for federal funding analysis |
| Expense Reporter | `expense-reporter.js` | `/api/process-expenses` | Stable | Receipt/invoice processing with CSV export |
| Find Reviewers (Legacy) | `find-reviewers.js` | `/api/find-reviewers` | Deprecated | Original Claude-only reviewer finder (superseded by v2) |
| Find Reviewers Pro | `find-reviewers-pro.js` | `/api/search-reviewers-pro` | Deprecated | Multi-database academic search (merged into v2) |

### Expert Reviewer Finder v2 - Feature Summary

The flagship application. Complete pipeline for finding and contacting expert reviewers:

**Core Pipeline:**
1. **Claude Analysis** - Extract proposal metadata (title, abstract, PI, institution) and suggest reviewers
2. **Database Discovery** - Search 4 academic databases: PubMed, ArXiv, BioRxiv, ChemRxiv
3. **Contact Enrichment** - 5-tier system to find email addresses and faculty pages
4. **Email Generation** - Create .eml invitation files with optional AI personalization

**Key Features:**
- Institution/expertise mismatch warnings
- Google Scholar profile links for all candidates
- PI/author self-suggestion prevention
- Claude retry logic with Haiku fallback on rate limits
- Temperature control (0.3-1.0) and configurable reviewer count
- Save candidates to database with edit capability
- Multi-select operations (save, delete, email)

**Roadmap:** See [ROADMAP_DATABASE_TAB.md](./ROADMAP_DATABASE_TAB.md) for next planned feature.

## Tech Stack

- **Frontend**: Next.js 14, React 18, Tailwind CSS 3.4
- **Backend**: Next.js API Routes
- **AI**: Claude API (Anthropic)
- **Database**: Vercel Postgres (for reviewer caching)
- **File Storage**: Vercel Blob (for uploads >4.5MB)
- **File Processing**: pdf-parse
- **Deployment**: Vercel

## Environment Variables

```env
# Required
CLAUDE_API_KEY=your_api_key

# Database (auto-set by Vercel Postgres)
POSTGRES_URL=...

# Optional - Enhanced Features
SERP_API_KEY=...           # Google Scholar searches (paid)
NCBI_API_KEY=...           # Higher PubMed rate limits
ORCID_CLIENT_ID=...        # ORCID API access
ORCID_CLIENT_SECRET=...    # ORCID API access
```

## Development Commands

```bash
npm install              # Install dependencies
npm run dev              # Run development server
npm run build            # Build for production
node scripts/setup-database.js  # Run database migrations
```

## Key Conventions

### Data Structures

All APIs return consistent data structures:
- `result.formatted` - Main content/summary text
- `result.structured` - Extracted structured data objects
- `result.metadata` - File processing metadata

### Shared Components

Located in `shared/components/`:
- `Layout.js` - Main layout with navigation
- `FileUploaderSimple.js` - File upload component
- `ApiKeyManager.js` - API key management
- `ApiSettingsPanel.js` - Optional API credentials (ORCID, NCBI)
- `ResultsDisplay.js` - Results visualization

### Service Classes

Located in `lib/services/`:
- `claude-reviewer-service.js` - Claude API with retry/fallback to Haiku
- `discovery-service.js` - Multi-database search orchestration
- `deduplication-service.js` - Name matching, COI filtering, PI exclusion
- `contact-enrichment-service.js` - 5-tier contact lookup
- `database-service.js` - Vercel Postgres operations
- `pubmed-service.js` - NCBI E-utilities API
- `arxiv-service.js` - ArXiv Atom feed API
- `biorxiv-service.js` - BioRxiv API
- `chemrxiv-service.js` - ChemRxiv Public API
- `orcid-service.js` - ORCID API
- `serp-contact-service.js` - Google/Scholar search via SerpAPI

## API Endpoints

### Document Processing
- `POST /api/process` - Batch document summarization (streaming)
- `POST /api/qa` - Q&A on processed documents
- `POST /api/refine` - Summary refinement

### Expert Reviewer Finder v2
- `POST /api/reviewer-finder/analyze` - Extract proposal metadata and abstract
- `POST /api/reviewer-finder/discover` - Find and verify candidates (streaming)
- `POST /api/reviewer-finder/save-candidates` - Save candidates to database
- `GET /api/reviewer-finder/my-candidates` - Retrieve saved candidates
- `PATCH /api/reviewer-finder/my-candidates` - Update candidate info (invited, notes, researcher fields)
- `DELETE /api/reviewer-finder/my-candidates` - Delete candidates
- `POST /api/reviewer-finder/enrich-contacts` - Contact lookup (streaming)
- `POST /api/reviewer-finder/generate-emails` - Generate .eml invitation files (streaming)

### Other
- `POST /api/analyze-funding-gap` - Federal funding analysis (streaming)
- `POST /api/process-expenses` - Expense extraction
- `POST /api/upload-handler` - Vercel Blob upload

## Database Setup

For Expert Reviewer Finder features:

1. Create Vercel Postgres database in Vercel Dashboard
2. Run: `vercel env pull .env.local`
3. Run: `node scripts/setup-database.js`

---

## Historical Development Log

For detailed session-by-session development history, see [DEVELOPMENT_LOG.md](./DEVELOPMENT_LOG.md).

---

Last Updated: December 20, 2025
