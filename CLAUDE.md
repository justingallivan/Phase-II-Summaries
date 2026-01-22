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
| **Literature Analyzer** | `literature-analyzer.js` | `/api/analyze-literature` | Other | Analyze and synthesize research papers with AI |
| **Integrity Screener** | `integrity-screener.js` | `/api/integrity-screener/*` | Phase I, II | Screen applicants for research integrity concerns |

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

### Literature Analyzer - Feature Summary

Analyze and synthesize research papers for literature reviews:

**Core Pipeline:**
1. **PDF Upload** - Upload one or more research paper PDFs
2. **Claude Vision Analysis** - Extract key information from each paper (title, authors, abstract, methods, findings, conclusions)
3. **Cross-Paper Synthesis** - For 2+ papers, generate thematic synthesis identifying patterns and gaps
4. **Export** - Download results as JSON or Markdown for literature review sections

**Extracted Information (per paper):**
- Title, authors, year, journal, DOI
- Abstract and research type (empirical, theoretical, review, etc.)
- Background (problem, motivation)
- Methods (approach, techniques, sample/data)
- Findings (main results, quantitative, qualitative)
- Conclusions (summary, implications, limitations, future work)
- Keywords and research field/subfield

**Synthesis Features (2+ papers):**
- Overview with date range and primary field
- Theme identification across papers with consensus/disagreements
- Key findings categorized as established, emerging, or contradictory
- Research gaps (identified and inferred)
- Methodological approaches comparison
- Future research directions
- Practical implications

**Key Files:**
- `pages/literature-analyzer.js` - Frontend with tabbed results view
- `pages/api/analyze-literature.js` - Two-stage analysis API
- `shared/config/prompts/literature-analyzer.js` - Extraction and synthesis prompts

### Applicant Integrity Screener - Feature Summary

Screen grant applicants (PIs and Co-PIs) for research integrity concerns before award decisions:

**Core Pipeline:**
1. **Name Entry** - Manual input of applicant names with roles and institutions
2. **Retraction Watch Search** - Query local database (~63,000+ entries) with fuzzy name matching
3. **PubPeer Search** - Site-restricted Google search via SERP API with Haiku analysis
4. **News Search** - Google News search via SERP API with Haiku filtering for misconduct

**Data Sources:**
| Source | Type | Description |
|--------|------|-------------|
| Retraction Watch | Database | ~63,000+ retraction records, searchable by author name |
| PubPeer | AI-analyzed | Post-publication peer review comments |
| Google News | AI-analyzed | News articles filtered for integrity concerns |

**Name Matching:**
- Multi-tier confidence scoring (50-100%)
- Handles initials, name variants, "Last, First" formats
- Common name detection (high false positive risk warning)
- Institution-based confidence boost (+15%)

**AI Analysis (Haiku):**
- Summarizes PubPeer comments for data/image manipulation, statistical issues
- Filters news for misconduct, legal issues, sanctions, harassment
- Returns "No concerns found" for clean results

**Database Schema (V13):**
- `retractions` - Retraction Watch data with GIN-indexed author arrays
- `integrity_screenings` - Screening history per user
- `screening_dismissals` - Track false positive dismissals

**Key Files:**
- `pages/integrity-screener.js` - Frontend with results display
- `pages/api/integrity-screener/screen.js` - Main screening API (SSE streaming)
- `pages/api/integrity-screener/history.js` - Screening history
- `pages/api/integrity-screener/dismiss.js` - False positive dismissal
- `lib/services/integrity-service.js` - Screening orchestration
- `lib/services/integrity-matching-service.js` - Name matching algorithms
- `shared/config/prompts/integrity-screener.js` - Haiku prompts
- `scripts/import-retraction-watch.js` - Data import script

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
- **Add Researcher** - Manually add new researchers to database:
  - Basic info: Name, affiliation, department
  - Contact: Email, website, ORCID, Google Scholar ID
  - Metrics: h-index, i10-index, citations
  - Expertise keywords (comma-separated)
  - Notes field for conflicts, preferences, etc.
  - Optional: Associate with proposal via grant cycle selector
- **Detail Modal** - Click any row to view full researcher info:
  - Contact info with source (e.g., "from PubMed 2024")
  - Metrics: h-index, i10-index, total citations
  - Notes field (editable) for tracking conflicts/preferences
  - All expertise keywords grouped by source
  - Proposal associations with status and notes
  - **Associate with Proposal** - Link existing researcher to any proposal

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

#### Settings Storage (Per-User)

Reviewer Finder settings are stored per-user in the database when a profile is selected, with localStorage fallback when no profile is active.

**Settings stored per-profile:**
| Setting | Preference Key | Description |
|---------|---------------|-------------|
| Sender Info | `reviewer_finder_sender_info` | Name, email, signature |
| Grant Cycle Settings | `reviewer_finder_grant_cycle_settings` | Program name, deadline, attachments, summary pages |
| Email Template | `reviewer_finder_email_template` | Custom email subject and body |
| Current Cycle ID | `reviewer_finder_current_cycle_id` | Active grant cycle selection |

**Behavior:**
- When a user profile is active, settings are saved to the `user_preferences` table
- When no profile is active, settings fall back to localStorage (base64 encoded)
- On first profile selection, localStorage data auto-migrates to profile preferences
- Profile switching loads that profile's saved settings

**Key Files:**
- `shared/config/reviewerFinderPreferences.js` - Preference key constants
- `shared/components/SettingsModal.js` - Main settings UI with dual storage
- `shared/components/EmailTemplateEditor.js` - Template editor with dual storage
- `shared/components/EmailGeneratorModal.js` - Loads settings from profile/localStorage

#### Future Considerations: Direct Email Sending

When this app is integrated with a CRM or email service, consider implementing direct email sending:
- **Email Service APIs**: SendGrid, AWS SES, Mailgun, Postmark
- **CRM Integration**: Salesforce, HubSpot, or custom CRM APIs
- **Benefits**: Skip the .eml workflow, send directly from the app with tracking
- **Requirements**: SMTP credentials or API keys, sender verification, bounce handling
- **Privacy**: Consider data handling implications when sending through third-party services

#### Microsoft Dynamics 365 Integration (Recommended Path)

The organization uses Microsoft Dynamics, making **Dynamics 365 Customer Insights - Journeys** the preferred future integration for email sending and tracking.

**How Dynamics Email Tracking Works:**
- Embeds a unique, transparent 1x1 tracking pixel in each email
- When recipient opens and loads images, the open is registered
- Tracks: opens, clicks, forwards, bounces, spam reports, unsubscribes

**Available Metrics from Dynamics:**
| Metric | Description |
|--------|-------------|
| Delivery rate | Successfully delivered vs. bounced |
| Open rate | Recipients who opened the email |
| Click rate | Recipients who clicked links |
| Click-to-open rate | Clicks relative to opens |
| Spam reports | Marked as spam count |
| Unsubscribes | Opt-out count |

**Integration Architecture:**
1. **Send emails via Dynamics** instead of generating .eml files
2. **Webhook endpoint** - Dynamics POSTs open/click events to this app
3. **Update tracking fields** - Populate `email_opened_at`, `response_type`, etc. automatically
4. **Dataverse API** - Query email interaction data programmatically

**Database Field Ready:**
The `email_opened_at` field exists in the `reviewer_suggestions` table, reserved for this integration.

**Limitations to Consider:**
- Apple Mail Privacy Protection (iOS 15+) auto-loads images, inflating open rates
- Privacy blockers increasingly prevent tracking pixels
- Data retention: 12 months for insights views, 2 years for Dataverse entities

**Resources:**
- [Email insights - Dynamics 365 Customer Insights](https://learn.microsoft.com/en-us/dynamics365/customer-insights/journeys/email-insights)
- [Use webhooks in Dynamics 365](https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/use-webhooks)
- [Dataverse API reference](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/overview)

## User Profiles System

Multi-user support with Microsoft Azure AD authentication. Each user has isolated API keys and "My Candidates" data.

### Overview

- **Authentication**: Microsoft Azure AD (Entra ID) single sign-on required
- **Profile Linking**: Azure account linked to user profile on first login
- **API Key Isolation**: Each profile has its own encrypted API keys
- **Data Scoping**: My Candidates filtered by current profile
- **Settings Page**: `/profile-settings` for profile management

### Microsoft Authentication (V11)

**IMPORTANT: Authentication is OPTIONAL.** The app works exactly as before until Azure credentials are configured in environment variables. Without credentials, users see the ProfileSelector dropdown and can switch profiles freely. Authentication only activates when all three Azure variables are set.

**Flow (when authentication is enabled):**
1. User visits app → RequireAuth redirects to Microsoft login
2. After Azure authentication → signIn callback checks for linked profile
3. First login → ProfileLinkingDialog lets user pick existing profile or create new
4. Future logins → Auto-selects linked profile from session

**Environment Variables:**
```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generate-with: openssl rand -base64 32>
AZURE_AD_CLIENT_ID=<from Azure Portal>
AZURE_AD_CLIENT_SECRET=<from Azure Portal>
AZURE_AD_TENANT_ID=<your organization's tenant ID>
```

**Key Files:**
| File | Purpose |
|------|---------|
| `pages/api/auth/[...nextauth].js` | NextAuth API route with Azure AD provider |
| `pages/api/auth/link-profile.js` | API for linking Azure account to profile |
| `pages/api/auth/status.js` | Returns `{enabled: true/false}` based on Azure credentials |
| `pages/auth/signin.js` | Custom sign-in page |
| `pages/auth/error.js` | Custom error page |
| `shared/components/RequireAuth.js` | Auth guard component (checks status endpoint) |
| `shared/components/ProfileLinkingDialog.js` | First-login profile selection |
| `lib/utils/auth.js` | Server-side auth utilities |
| `.env.local.example` | Template for environment variables |
| `docs/ENTRA_ID_INTEGRATION_SUMMARY.md` | IT's integration documentation |

**Protecting API Routes:**

Available server-side auth utilities in `lib/utils/auth.js`:

| Function | Returns | Error Response |
|----------|---------|----------------|
| `getSession(req, res)` | Session or null | None |
| `requireAuth(req, res)` | Session or null | 401 if unauthenticated |
| `requireAuthWithProfile(req, res)` | profileId or null | 401/403 if no auth/profile |
| `optionalAuth(req, res)` | Session or null | None |

```javascript
import { requireAuth, requireAuthWithProfile, optionalAuth } from '../../lib/utils/auth';

export default async function handler(req, res) {
  // Option 1: Just require authentication
  const session = await requireAuth(req, res);
  if (!session) return; // 401 already sent

  // Option 2: Require auth + profile for data scoping
  const profileId = await requireAuthWithProfile(req, res);
  if (!profileId) return; // 401 or 403 already sent

  // Option 3: Optional auth - get session if present, proceed either way
  const session = await optionalAuth(req, res);
  const profileId = session?.user?.profileId || null;
}
```

### Database Tables (V10 + V11 Migrations)

**`user_profiles`** - User identity
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| name | VARCHAR(255) | Unique username |
| display_name | VARCHAR(255) | Display name |
| avatar_color | VARCHAR(7) | Hex color for avatar |
| is_default | BOOLEAN | Auto-select on fresh browser |
| is_active | BOOLEAN | Soft delete flag |
| last_used_at | TIMESTAMP | For sorting |
| azure_id | VARCHAR(255) | Azure AD user ID (unique) |
| azure_email | VARCHAR(255) | User's Azure email |
| last_login_at | TIMESTAMP | Last Azure login |
| needs_linking | BOOLEAN | True if first-time login |

**`user_preferences`** - Per-user settings (API keys encrypted)
| Column | Type | Description |
|--------|------|-------------|
| user_profile_id | INTEGER | FK to user_profiles |
| preference_key | VARCHAR(100) | Setting name |
| preference_value | TEXT | Value (encrypted if API key) |
| is_encrypted | BOOLEAN | Whether AES-256-GCM encrypted |

**Encrypted preference keys:**
- `api_key_claude`, `api_key_orcid_client_id`, `api_key_orcid_client_secret`, `api_key_ncbi`, `api_key_serp`

### User Scoping

| Table | Scoping | Rationale |
|-------|---------|-----------|
| `researchers` | Shared | Global pool of expert data |
| `publications` | Shared | Linked to researchers |
| `grant_cycles` | Shared | Organization-wide cycles |
| `reviewer_suggestions` | Per-user | "My Candidates" is user-specific |
| `proposal_searches` | Per-user | Each user's proposal analyses |

Legacy data (user_profile_id=NULL) is visible to all users until migrated.

### Profile Management Scripts

```bash
# Export proposals for user assignment
node scripts/export-proposals-for-migration.js

# Import user assignments from CSV (dry-run first)
node scripts/import-user-assignments.js --file proposals-for-migration.csv --dry-run
node scripts/import-user-assignments.js --file proposals-for-migration.csv

# View/delete API key preferences
node scripts/manage-preferences.js --list
node scripts/manage-preferences.js --delete-all-keys
node scripts/manage-preferences.js --delete-keys --profile 2
```

### Key Files

| File | Purpose |
|------|---------|
| `shared/context/ProfileContext.js` | React context for global profile state |
| `shared/components/RequireAuth.js` | Auth guard with profile linking |
| `shared/components/ProfileLinkingDialog.js` | First-login profile selection |
| `pages/profile-settings.js` | Profile management page |
| `pages/api/auth/[...nextauth].js` | NextAuth API route |
| `pages/api/auth/link-profile.js` | Profile linking endpoint |
| `pages/api/user-profiles.js` | CRUD API for profiles |
| `pages/api/user-preferences.js` | API for preferences with encryption |
| `lib/utils/encryption.js` | AES-256-GCM encryption utilities |
| `lib/utils/auth.js` | Server-side auth utilities |

## Tech Stack

- **Frontend**: Next.js 14, React 18, Tailwind CSS 3.4
- **Backend**: Next.js API Routes
- **Authentication**: NextAuth.js with Azure AD provider
- **AI**: Claude API (Anthropic)
- **Database**: Vercel Postgres (for reviewer caching + user profiles)
- **File Storage**: Vercel Blob (for uploads >4.5MB)
- **File Processing**: pdf-parse
- **Deployment**: Vercel

## Environment Variables

```env
# Required
CLAUDE_API_KEY=your_api_key

# Database (auto-set by Vercel Postgres)
POSTGRES_URL=...

# Required - Authentication (Azure AD)
NEXTAUTH_URL=http://localhost:3000     # Base URL (https://... in production)
NEXTAUTH_SECRET=...                     # Generate with: openssl rand -base64 32
AZURE_AD_CLIENT_ID=...                  # From Azure Portal app registration
AZURE_AD_CLIENT_SECRET=...              # From Azure Portal app registration
AZURE_AD_TENANT_ID=...                  # Your organization's tenant ID

# Optional - Enhanced Features
SERP_API_KEY=...           # Google Scholar searches (paid)
NCBI_API_KEY=...           # Higher PubMed rate limits
ORCID_CLIENT_ID=...        # ORCID API access
ORCID_CLIENT_SECRET=...    # ORCID API access

# Optional - User Profiles (uses dev fallback if not set)
USER_PREFS_ENCRYPTION_KEY=...  # 32-byte hex key for API key encryption
```

## Per-App Model Configuration

Each app uses a model optimized for its task complexity. Configured in `shared/config/baseConfig.js`:

| App | Default Model | Complexity |
|-----|---------------|------------|
| Concept Evaluator | Opus 4 | High (Vision + Analysis) |
| Literature Analyzer | Sonnet 4 | High (Vision + Synthesis) |
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
| `export-proposals-for-migration.js` | Export proposals to CSV for user profile assignment |
| `import-user-assignments.js` | Import user profile assignments from CSV |
| `manage-preferences.js` | View and delete user API key preferences |
| `test-profiles.js` | Test profile/preference database operations |
| `import-retraction-watch.js` | Import Retraction Watch CSV into database |
| `test-retractions.js` | Verify Retraction Watch database search functionality |
| `test-name-matching.js` | Test name matching variants and order swapping (41 tests) |
| `setup-git-nosync.sh` | Configure .git.nosync for iCloud compatibility |

Usage:
```bash
node scripts/cleanup-database.js      # Clean up incomplete entries
node scripts/clear-all-database.js    # Full reset
node scripts/manage-preferences.js --list  # View all preferences
node scripts/test-name-matching.js    # Run name matching tests
./scripts/setup-git-nosync.sh         # Set up .git.nosync (run once per Mac)
```

## Multi-Mac Development (iCloud)

This repo is designed for development across multiple Macs synced via iCloud.

**Problem:** iCloud can corrupt `.git` directories by syncing partial writes.

**Solution:** The `.git` directory is renamed to `.git.nosync` (which iCloud ignores) with a symlink from `.git`. Git history syncs via GitHub push/pull, not iCloud.

**Setup (once per Mac):**
```bash
./scripts/setup-git-nosync.sh
```

**Workflow:**
- Use `/start` at the beginning of each session (fetches and pulls if needed)
- Use `/stop` at the end of each session (commits, updates docs, pushes)
- GitHub is the source of truth for git history
- iCloud syncs only working files

**Recovery (if .git is corrupted):**
```bash
rm -rf .git .git.nosync
git clone https://github.com/justingallivan/Phase-II-Summaries.git temp
mv temp/.git .
rm -rf temp
./scripts/setup-git-nosync.sh
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

### Applicant Integrity Screener
- `POST /api/integrity-screener/screen` - Screen applicants against all sources (SSE streaming)
- `GET /api/integrity-screener/history` - List screening history (`?profileId=N`) or get single (`?id=N`)
- `PATCH /api/integrity-screener/history` - Update screening status (pending/reviewed/cleared/flagged)
- `POST /api/integrity-screener/dismiss` - Dismiss a match as false positive
- `GET /api/integrity-screener/dismiss` - Get dismissals for a screening (`?screeningId=N`)

### User Profiles
- `GET /api/user-profiles` - List all profiles (or single by `?id=N`)
- `POST /api/user-profiles` - Create profile
- `PATCH /api/user-profiles` - Update profile
- `DELETE /api/user-profiles` - Archive profile (soft delete)
- `GET /api/user-preferences` - Get preferences for profile (`?profileId=N`)
- `POST /api/user-preferences` - Set preference(s)
- `DELETE /api/user-preferences` - Delete preference

### Authentication
- `GET /api/auth/status` - Check if Azure AD authentication is enabled
- `POST /api/auth/link-profile` - Link Azure account to user profile
- `GET /api/auth/session` - Get current session (NextAuth built-in)
- `GET /api/auth/signin` - Sign-in page (NextAuth built-in)
- `GET /api/auth/callback/azure-ad` - OAuth callback (NextAuth built-in)

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

Last Updated: January 21, 2026
