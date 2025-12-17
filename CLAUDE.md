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

| App | Page | API Endpoint | Description |
|-----|------|--------------|-------------|
| Batch Proposal Summaries | `batch-proposal-summaries.js` | `/api/process` | Batch document summarization with configurable length/level |
| Expert Reviewer Finder v2 | `reviewer-finder.js` | `/api/reviewer-finder/*` | AI + database search for expert reviewers with contact enrichment |
| Funding Gap Analyzer | `funding-gap-analyzer.js` | `/api/analyze-funding-gap` | NSF API integration for federal funding analysis |
| Expense Reporter | `expense-reporter.js` | `/api/process-expenses` | Receipt/invoice processing with CSV export |
| Find Reviewers (Legacy) | `find-reviewers.js` | `/api/find-reviewers` | Original Claude-only reviewer finder |
| Find Reviewers Pro | `find-reviewers-pro.js` | `/api/search-reviewers-pro` | Multi-database academic search |

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
- `claude-reviewer-service.js` - Claude API with retry/fallback
- `pubmed-service.js` - NCBI E-utilities
- `orcid-service.js` - ORCID API
- `discovery-service.js` - Reviewer verification logic
- `contact-enrichment-service.js` - Multi-tier contact lookup
- `database-service.js` - Vercel Postgres operations

## API Endpoints

### Document Processing
- `POST /api/process` - Batch document summarization (streaming)
- `POST /api/qa` - Q&A on processed documents
- `POST /api/refine` - Summary refinement

### Expert Reviewer Finder v2
- `POST /api/reviewer-finder/analyze` - Extract proposal metadata
- `POST /api/reviewer-finder/discover` - Find and verify candidates (streaming)
- `POST /api/reviewer-finder/save-candidates` - Save to database
- `GET /api/reviewer-finder/my-candidates` - Retrieve saved candidates
- `POST /api/reviewer-finder/enrich-contacts` - Contact lookup (streaming)

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

Last Updated: December 16, 2025
