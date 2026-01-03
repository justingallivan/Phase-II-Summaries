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

### Active Apps (in landing page order)

| App | Page | API Endpoint | Categories | Description |
|-----|------|--------------|------------|-------------|
| Batch Phase I Summaries | `batch-phase-i-summaries.js` | `/api/process-phase-i` | Phase I | Batch Phase I proposal processing with Keck alignment evaluation |
| Batch Phase II Summaries | `batch-proposal-summaries.js` | `/api/process` | Phase II | Batch Phase II proposal processing with customizable length |
| Funding Analysis | `funding-gap-analyzer.js` | `/api/analyze-funding-gap` | Phase I, II | NSF API integration for federal funding analysis |
| Create Phase I Writeup Draft | `phase-i-writeup.js` | `/api/process-phase-i` | Phase I | Single Phase I writeup with Keck formatting |
| Create Phase II Writeup Draft | `proposal-summarizer.js` | `/api/process` | Phase II | Single Phase II writeup with Q&A and refinement |
| **Reviewer Finder** | `reviewer-finder.js` | `/api/reviewer-finder/*` | Phase I, II | **Production Ready** - AI + database search with contact enrichment |
| Summarize Peer Reviews | `peer-review-summarizer.js` | `/api/summarize-reviews` | Phase II | Analyze peer reviews and generate site visit questions |
| Expense Reporter | `expense-reporter.js` | `/api/process-expenses` | Other | Receipt/invoice processing with CSV export |
| Literature Analyzer | `literature-analyzer.js` | - | Other | Coming soon - Paper synthesis and citation analysis |

### Deprecated Apps (hidden from UI, files retained)

| App | Reason |
|-----|--------|
| document-analyzer | Duplicate of proposal-summarizer with worse UX |
| find-reviewers | Superseded by Reviewer Finder |
| find-reviewers-pro | Merged into Reviewer Finder |

### Reviewer Finder - Feature Summary

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
- **Database Tab** - Browse/search all saved researchers with tag filtering

**Database Tab Features:**
- Search by name, affiliation, or email
- Filter by "Has Email", "Has Website", or expertise tags
- Sort by name, affiliation, h-index, or last updated
- Auto-generated tags from discovery (expertise areas, source database)
- Pagination for large datasets

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

## Database Utility Scripts

Located in `scripts/`:

| Script | Description |
|--------|-------------|
| `setup-database.js` | Run database migrations, create tables and indexes |
| `cleanup-database.js` | Remove researchers missing email OR website (keeps high-quality entries) |
| `clear-all-database.js` | Delete ALL data from all tables for a fresh start |

Usage:
```bash
node scripts/cleanup-database.js      # Clean up incomplete entries
node scripts/clear-all-database.js    # Full reset
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
- `GET /api/reviewer-finder/researchers` - Browse all researchers (with search, sort, filter, pagination)
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

Last Updated: January 2, 2026
