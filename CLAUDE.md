# Document Processing Multi-App System

## Git Commit Policy

**Commit working changes regularly.** This provides rollback points when debugging.

- Commit after completing a feature or fix that works
- Use descriptive commit messages
- Don't let multiple sessions accumulate without commits

---

## Project Overview

A multi-application document processing system using Claude AI for grant-related workflows. Built with Next.js and deployed on Vercel.

## Directory Structure

```
/
├── pages/                     # Next.js pages and API routes
│   ├── api/                   # API endpoints
│   └── *.js                   # Frontend pages
├── shared/                    # Shared components and utilities
│   ├── components/            # React components
│   ├── config/prompts/        # Prompt templates
│   └── utils/                 # Utility functions
├── lib/                       # Core libraries
│   ├── services/              # Service classes
│   ├── db/                    # Database schema and migrations
│   └── utils/                 # Utility functions
├── scripts/                   # Setup and utility scripts
├── docs/                      # Extended documentation
├── styles/                    # Global styles
└── tests/                     # Test files
```

## Applications

| App | Page | API Endpoint | Description |
|-----|------|--------------|-------------|
| Concept Evaluator | `concept-evaluator.js` | `/api/evaluate-concepts` | Pre-Phase I screening with AI + literature search |
| Multi-Perspective Evaluator | `multi-perspective-evaluator.js` | `/api/evaluate-multi-perspective` | 3-perspective evaluation with synthesis |
| Batch Phase I Summaries | `batch-phase-i-summaries.js` | `/api/process-phase-i` | Batch Phase I proposal processing |
| Batch Phase II Summaries | `batch-proposal-summaries.js` | `/api/process` | Batch Phase II proposal processing |
| Funding Analysis | `funding-gap-analyzer.js` | `/api/analyze-funding-gap` | NSF API integration for federal funding |
| Phase I Writeup | `phase-i-writeup.js` | `/api/process-phase-i` | Single Phase I writeup |
| Phase II Writeup | `proposal-summarizer.js` | `/api/process` | Single Phase II writeup with Q&A |
| Reviewer Finder | `reviewer-finder.js` | `/api/reviewer-finder/*` | AI + database search for expert reviewers |
| Peer Review Summarizer | `peer-review-summarizer.js` | `/api/summarize-reviews` | Analyze peer reviews |
| Expense Reporter | `expense-reporter.js` | `/api/process-expenses` | Receipt/invoice processing |
| Literature Analyzer | `literature-analyzer.js` | `/api/analyze-literature` | Research paper synthesis |
| Integrity Screener | `integrity-screener.js` | `/api/integrity-screener/*` | Screen applicants for research integrity |
| Dynamics Explorer | `dynamics-explorer.js` | `/api/dynamics-explorer/*` | Natural language CRM queries via agentic tool-use |

## Tech Stack

- **Frontend**: Next.js 14, React 18, Tailwind CSS 3.4
- **Backend**: Next.js API Routes
- **Authentication**: NextAuth.js with Azure AD (see `docs/AUTHENTICATION_SETUP.md`)
- **AI**: Claude API (Anthropic)
- **Database**: Vercel Postgres
- **File Storage**: Vercel Blob
- **Deployment**: Vercel

## Environment Variables

```env
# Required
CLAUDE_API_KEY=your_api_key

# Database (auto-set by Vercel Postgres)
POSTGRES_URL=...

# Authentication (see docs/AUTHENTICATION_SETUP.md)
AUTH_REQUIRED=true
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=...
AZURE_AD_CLIENT_ID=...
AZURE_AD_CLIENT_SECRET=...
AZURE_AD_TENANT_ID=...

# Optional - Enhanced Features
SERP_API_KEY=...           # Google Scholar searches
NCBI_API_KEY=...           # Higher PubMed rate limits
ORCID_CLIENT_ID=...        # ORCID API access
ORCID_CLIENT_SECRET=...

# Optional - User Profiles
USER_PREFS_ENCRYPTION_KEY=...  # 32-byte hex key for API key encryption

# Optional - Dynamics Explorer (CRM queries)
DYNAMICS_URL=https://wmkf.crm.dynamics.com
DYNAMICS_TENANT_ID=...
DYNAMICS_CLIENT_ID=...
DYNAMICS_CLIENT_SECRET=...
```

## Per-App Model Configuration

Each app uses a model optimized for its task. Configured in `shared/config/baseConfig.js`:

| App | Default Model | Override Env Var |
|-----|---------------|------------------|
| Concept Evaluator | Opus 4 | `CLAUDE_MODEL_CONCEPT_EVALUATOR` |
| Literature Analyzer | Sonnet 4 | `CLAUDE_MODEL_LITERATURE_ANALYZER` |
| Batch Summaries | Sonnet 4 | - |
| Reviewer Finder | Sonnet 4 | - |
| Expense Reporter | Haiku 3.5 | `CLAUDE_MODEL_EXPENSE_REPORTER` |
| Contact Enrichment | Haiku 3.5 | - |
| Dynamics Explorer | Haiku 4.5 | - |

## Development

```bash
npm install              # Install dependencies
npm run dev              # Run development server
npm run build            # Build for production
node scripts/setup-database.js  # Run database migrations
```

See `scripts/README.md` for database utility scripts.

For multi-Mac development, see `docs/MULTI_MAC_SETUP.md`.

---

## Key Conventions

### Data Structures

All APIs return consistent structures:
- `result.formatted` - Main content/summary text
- `result.structured` - Extracted structured data objects
- `result.metadata` - File processing metadata

### Shared Components

Located in `shared/components/`:
- `Layout.js` - Main layout with navigation
- `FileUploaderSimple.js` - File upload component
- `ApiKeyManager.js` - API key management
- `ResultsDisplay.js` - Results visualization

### Service Classes

Located in `lib/services/`:
- `claude-reviewer-service.js` - Claude API with retry/fallback
- `discovery-service.js` - Multi-database search orchestration
- `deduplication-service.js` - Name matching, COI filtering
- `contact-enrichment-service.js` - 5-tier contact lookup
- `database-service.js` - Vercel Postgres operations
- `pubmed-service.js` - NCBI E-utilities API
- `arxiv-service.js` - ArXiv API
- `biorxiv-service.js` - BioRxiv API
- `chemrxiv-service.js` - ChemRxiv API
- `orcid-service.js` - ORCID API
- `serp-contact-service.js` - Google/Scholar search via SerpAPI
- `integrity-service.js` - Integrity screening orchestration
- `integrity-matching-service.js` - Name matching algorithms
- `dynamics-service.js` - Microsoft Dynamics 365 CRM API (OAuth, OData queries)

---

## Database Schema

### User System

**`user_profiles`** - User identity
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| name | VARCHAR(255) | Unique username |
| azure_id | VARCHAR(255) | Azure AD user ID (unique) |
| azure_email | VARCHAR(255) | User's Azure email |
| is_active | BOOLEAN | Soft delete flag |

**`user_preferences`** - Per-user settings
| Column | Type | Description |
|--------|------|-------------|
| user_profile_id | INTEGER | FK to user_profiles |
| preference_key | VARCHAR(100) | Setting name |
| preference_value | TEXT | Value (encrypted if API key) |
| is_encrypted | BOOLEAN | Whether AES-256-GCM encrypted |

### User Scoping

| Table | Scoping | Rationale |
|-------|---------|-----------|
| `researchers` | Shared | Global pool of expert data |
| `publications` | Shared | Linked to researchers |
| `grant_cycles` | Shared | Organization-wide cycles |
| `reviewer_suggestions` | Per-user | "My Candidates" is user-specific |
| `proposal_searches` | Per-user | Each user's proposal analyses |

### Reviewer Finder Tables

- `researchers` - Expert researcher profiles with contact info
- `publications` - Linked publications
- `grant_cycles` - Grant cycle definitions
- `proposal_searches` - Proposal analysis results
- `reviewer_suggestions` - Saved candidates per proposal

### Integrity Screener Tables

- `retractions` - Retraction Watch data (~63,000+ entries)
- `integrity_screenings` - Screening history per user
- `screening_dismissals` - False positive dismissals

---

## API Endpoints

### Document Processing
- `POST /api/process` - Batch document summarization (streaming)
- `POST /api/process-phase-i` - Phase I processing
- `POST /api/qa` - Q&A on processed documents
- `POST /api/refine` - Summary refinement

### Reviewer Finder
- `POST /api/reviewer-finder/analyze` - Extract proposal metadata
- `POST /api/reviewer-finder/discover` - Find candidates (streaming)
- `POST /api/reviewer-finder/save-candidates` - Save to database
- `GET/PATCH/DELETE /api/reviewer-finder/my-candidates` - Manage saved candidates
- `GET /api/reviewer-finder/researchers` - Browse all researchers
- `GET/POST/PATCH/DELETE /api/reviewer-finder/grant-cycles` - Manage cycles
- `POST /api/reviewer-finder/enrich-contacts` - Contact lookup (streaming)
- `POST /api/reviewer-finder/generate-emails` - Generate .eml files (see `docs/REVIEWER_FINDER.md`)
- `POST /api/reviewer-finder/extract-summary` - Extract summary pages

### Concept Evaluator
- `POST /api/evaluate-concepts` - Evaluate concepts with literature search (streaming)

### Integrity Screener
- `POST /api/integrity-screener/screen` - Screen applicants (SSE streaming)
- `GET/PATCH /api/integrity-screener/history` - Screening history
- `POST/GET /api/integrity-screener/dismiss` - Manage dismissals

### Dynamics Explorer
- `POST /api/dynamics-explorer/chat` - Agentic chat with Dynamics 365 CRM (SSE streaming)
- `GET/POST/DELETE /api/dynamics-explorer/roles` - User role management (superuser only)
- `GET/POST/DELETE /api/dynamics-explorer/restrictions` - Table/field restrictions (superuser only)

### User Management
- `GET/POST/PATCH/DELETE /api/user-profiles` - Profile CRUD
- `GET/POST/DELETE /api/user-preferences` - Preference management

### Authentication
- `GET /api/auth/status` - Check if auth is enabled
- `POST /api/auth/link-profile` - Link Azure account to profile

### Other
- `POST /api/analyze-funding-gap` - Federal funding analysis
- `POST /api/process-expenses` - Expense extraction
- `POST /api/upload-handler` - Vercel Blob upload

---

## Extended Documentation

| Document | Content |
|----------|---------|
| `docs/AUTHENTICATION_SETUP.md` | Azure AD configuration guide |
| `docs/REVIEWER_FINDER.md` | Email workflow, templates, settings |
| `docs/MULTI_MAC_SETUP.md` | Multi-Mac development setup |
| `docs/PDF_EXPORT.md` | PDF export utility and architecture |
| `scripts/README.md` | Database utility scripts |
| `DEVELOPMENT_LOG.md` | Session-by-session history |
| `docs/DYNAMICS_SCHEMA_ANNOTATION.md` | CRM field annotation plan for Dynamics Explorer |

---

Last Updated: February 2026
