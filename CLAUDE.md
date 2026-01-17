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
| **Concept Evaluator** | `concept-evaluator.js` | `/api/evaluate-concepts` | Concepts | **NEW** - Pre-Phase I screening with AI analysis and literature search |
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

### Concept Evaluator - Feature Summary

Pre-Phase I screening tool to identify the strongest concepts from multi-page PDFs:

**Core Pipeline:**
1. **PDF Splitting** - Split multi-page PDF into individual pages (1 concept per page)
2. **Claude Vision Analysis** - Extract title, PI, summary, research area, and keywords from each page
3. **Literature Search** - Auto-select databases based on research area (PubMed, ArXiv, BioRxiv, ChemRxiv)
4. **Final Evaluation** - Claude interprets literature context and provides ratings

**Evaluation Criteria:**
- **Keck Alignment** - High-risk, pioneering, wouldn't be funded elsewhere
- **Scientific Merit** - Sound science, clear hypothesis, quality approach
- **Feasibility** - Technical challenges, likelihood of success
- **Novelty** - Based on recent literature search results

**Output:**
- Label-based ratings (Strong/Moderate/Weak) with reasoning
- Strengths and concerns for each concept
- Export to JSON or Markdown

**Key Files:**
- `pages/concept-evaluator.js` - Frontend with streaming progress
- `pages/api/evaluate-concepts.js` - Two-stage evaluation API
- `lib/utils/pdf-page-splitter.js` - PDF page extraction
- `shared/config/prompts/concept-evaluator.js` - Evaluation prompts

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
- **Detail Modal** - Click any row to view full researcher info:
  - Contact info with source (e.g., "from PubMed 2024")
  - Metrics: h-index, i10-index, total citations
  - All expertise keywords grouped by source
  - Proposal associations with status and notes

### Email Generation Workflow

The Reviewer Finder includes a complete email generation system for sending reviewer invitations:

#### Setup (Before First Grant Cycle)

1. **Click the gear icon (⚙️)** next to the tab navigation to open Settings
2. **Configure Grant Cycle settings:**
   - Program Name (e.g., "W. M. Keck Foundation")
   - Review Deadline
   - Summary Pages - which page(s) to extract from proposals (default: "2")
   - Custom date fields (Proposal Due Date, Send Date, Commit Date, Honorarium)
3. **Upload Review Template** in Attachments section (PDF or Word document)
4. **Configure Sender Info:**
   - Your Name
   - Your Email
   - Signature block
5. **Customize Email Template** (optional - default is Keck Foundation format)

#### Email Generation Process

1. **Upload Proposal** - Summary page(s) are automatically extracted based on settings
2. **Find Reviewers** - Run discovery to find candidates
3. **Enrich Contacts** - Get email addresses for selected candidates
4. **Save Candidates** - Store to My Candidates with summary attachment link
5. **Generate Emails:**
   - Select candidates in My Candidates tab
   - Click "Email Selected"
   - Review options (Claude personalization available)
   - Click Generate → Download .eml files
   - Open in email client and send

#### Re-extracting Summaries

If you need to change which pages are extracted:
1. Update "Summary Pages" in Settings → Grant Cycle
2. Go to My Candidates tab
3. Click "Re-extract" or "Extract Summary" button on the proposal card
4. Upload the proposal PDF again
5. New summary will be extracted using updated settings

#### Template Placeholders

Available placeholders for email templates:

| Placeholder | Description |
|-------------|-------------|
| `{{greeting}}` | "Dear Dr. LastName" |
| `{{recipientName}}` | Full name without honorific |
| `{{recipientFirstName}}` | First name |
| `{{recipientLastName}}` | Last name |
| `{{salutation}}` | "Dr." or detected honorific |
| `{{recipientAffiliation}}` | Institution |
| `{{proposalTitle}}` | Proposal title |
| `{{piName}}` | Principal Investigator name |
| `{{piInstitution}}` | PI institution |
| `{{coInvestigators}}` | Co-PI names (comma-separated) |
| `{{coInvestigatorCount}}` | Number of Co-PIs |
| `{{investigatorTeam}}` | Formatted PI + Co-PIs (e.g., "the PI Dr. Smith and 2 co-investigators...") |
| `{{investigatorVerb}}` | "was" (singular PI) or "were" (PI + Co-PIs) for verb agreement |
| `{{programName}}` | From Grant Cycle settings |
| `{{reviewDeadline}}` | Formatted deadline date |
| `{{signature}}` | Sender signature block |
| `{{customField:fieldName}}` | Custom field from Grant Cycle |

#### Email Attachments

Each generated email can include:
- **Review Template** - Uploaded via Settings → Attachments
- **Project Summary** - Auto-extracted from proposal during analysis
- **Additional Attachments** - Optional files uploaded via Settings → Attachments

Attachments are encoded in MIME multipart/mixed format, compatible with all major email clients.

#### Email Workflow Note

Generated .eml files open as "received" messages in email clients. To send:
1. Open the .eml file
2. **Forward** to the recipient and remove "Fwd:" from the subject line, OR
3. Copy the email content into a new message

This is a limitation of the .eml format - it's designed for message import/export, not drafts.

#### Future Considerations: Direct Email Sending

When this app is integrated with a CRM or email service, consider implementing direct email sending:
- **Email Service APIs**: SendGrid, AWS SES, Mailgun, Postmark
- **CRM Integration**: Salesforce, HubSpot, or custom CRM APIs
- **Benefits**: Skip the .eml workflow, send directly from the app with tracking
- **Requirements**: SMTP credentials or API keys, sender verification, bounce handling
- **Privacy**: Consider data handling implications when sending through third-party services

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

## Per-App Model Configuration

Each app uses a model optimized for its task complexity. Configured in `shared/config/baseConfig.js`:

| App | Default Model | Complexity |
|-----|---------------|------------|
| Concept Evaluator | Opus 4 | High (Vision + Analysis) |
| Batch Phase I/II Summaries | Sonnet 4 | High |
| Phase I/II Writeup | Sonnet 4 | High |
| Reviewer Finder | Sonnet 4 | High |
| Peer Review Summarizer | Sonnet 4 | High |
| Funding Analysis | Sonnet 4 | Medium |
| Q&A, Refine | Sonnet 4 | Medium |
| Expense Reporter | Haiku 3.5 | Low |
| Contact Enrichment | Haiku 3.5 | Low |
| Email Personalization | Haiku 3.5 | Low |

**Override via environment variable:**
```env
CLAUDE_MODEL_CONCEPT_EVALUATOR=claude-sonnet-4-20250514  # Override Opus → Sonnet
CLAUDE_MODEL_EXPENSE_REPORTER=claude-sonnet-4-20250514   # Upgrade Haiku → Sonnet
```

**Helper functions:**
```javascript
import { getModelForApp, getFallbackModelForApp } from '../../shared/config/baseConfig';

const model = getModelForApp('concept-evaluator');           // Returns configured model
const vision = getModelForApp('concept-evaluator', 'visionModel'); // Vision-specific model
const fallback = getFallbackModelForApp('concept-evaluator'); // Fallback on error
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
- `POST /api/reviewer-finder/analyze` - Extract proposal metadata, abstract, program area, and summary pages
- `POST /api/reviewer-finder/discover` - Find and verify candidates (streaming)
- `POST /api/reviewer-finder/save-candidates` - Save candidates with multi-field duplicate detection (ORCID, email, Scholar ID, name)
- `GET /api/reviewer-finder/my-candidates` - Retrieve saved candidates with summary URLs; supports `?cycleId=N` filter
- `PATCH /api/reviewer-finder/my-candidates` - Update candidate info (invited, declined, notes, researcher fields, programArea, grantCycleId)
- `DELETE /api/reviewer-finder/my-candidates` - Delete candidates
- `GET /api/reviewer-finder/researchers` - Browse all researchers (with search, sort, filter, pagination); use `?id=` for single researcher with full details
- `GET /api/reviewer-finder/grant-cycles` - List all grant cycles
- `POST /api/reviewer-finder/grant-cycles` - Create new grant cycle
- `PATCH /api/reviewer-finder/grant-cycles` - Update grant cycle
- `DELETE /api/reviewer-finder/grant-cycles` - Archive grant cycle
- `POST /api/reviewer-finder/enrich-contacts` - Contact lookup (streaming)
- `POST /api/reviewer-finder/generate-emails` - Generate .eml invitation files with attachments (streaming)
- `POST /api/reviewer-finder/extract-summary` - Re-extract summary pages from proposal PDF

### Concept Evaluator
- `POST /api/evaluate-concepts` - Evaluate research concepts with literature search (streaming)

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

Last Updated: January 17, 2026
