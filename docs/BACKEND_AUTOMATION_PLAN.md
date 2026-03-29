# Long-Term Plan: Event-Driven Backend Automation via PowerAutomate

**Status:** Planning — requires multi-stakeholder input before implementation.
**Created:** Session 90, 2026-03-28
**Stakeholders:** Justin (API design), Connor (PowerAutomate/Dynamics), IT (permissions), AkoyaGO vendor (schema)

## Context

This project started as a personal workflow automation tool and has grown into a multi-user platform. Leadership now wants key processing tasks (especially proposal summarization) to happen automatically when documents arrive in Dynamics/Dataverse — no manual uploads, no button clicks. Other tasks (reviewer finding, review management) remain human-initiated but should write results back to Dynamics. **All results ultimately live in Dynamics as the source of truth.**

The plan uses PowerAutomate as the bridge for CRM writes initially (it already has full Dynamics access), with direct API writes as a future optimization once IT grants write permissions on our app registration.

Beyond automating existing workflows, two new AI capabilities are planned: **compliance screening** (flagging proposals that don't fit the Foundation's criteria) and **staff-proposal matching** (routing proposals to the right staff, consultants, and board members). These will be developed via batch evaluation against historical data, then deployed automatically for new proposals.

---

## Two Automation Tiers

### Tier 1: Fully Automatic (PowerAutomate-triggered, high volume)
- Proposal uploaded to Dynamics → PowerAutomate detects status change → calls our API → writes results back to Dynamics
- Example: Phase II proposal submitted → auto-generate summary → store in `akoya_request` fields
- No human in the loop
- **Text-only processing** — `pdf-parse` extracts text, images stripped. Sufficient for summaries, much cheaper at scale (~100x more queries than later stages)

### Tier 2: Human-Initiated, CRM-Connected (selective, high touch)
- Staff uses our web UI for tasks requiring judgment (reviewer finding with specific expertise criteria, review management)
- Results flow back to Dynamics via PowerAutomate initially, direct API writes later
- **Full PDF processing** — Claude's vision API accepts raw PDFs (base64 with `media_type: "application/pdf"`), figures/tables/diagrams may be meaningful for detailed evaluation
- Example: Program director runs reviewer discovery with specific expertise criteria → selected reviewers written to Dynamics

---

## Phase 0: Service Authentication Layer

**Goal:** Allow PowerAutomate to call our APIs without a browser session.

**What to build:**
- New env var `SERVICE_API_KEY` (high-entropy secret, separate from `CRON_SECRET`)
- New auth utility `lib/utils/service-auth.js` — checks `Authorization: Bearer {SERVICE_API_KEY}`, returns `{ authenticated: true, caller: 'service' }` or sends 401
- Add `api/service` to middleware.js matcher exclusion (same pattern as `api/cron`)
- Audit logging: `service_api_log` table (endpoint, method, caller_ip, request_body_hash, status_code, duration_ms, created_at)
- Dual-auth wrapper: `requireServiceOrUserAuth(req, res)` so endpoints can serve both PowerAutomate and the UI

**Key files to modify:**
- `middleware.js` — add exclusion pattern
- `lib/utils/cron-auth.js` — template for new service-auth.js (same Bearer token pattern)
- `lib/utils/auth.js` — add dual-auth wrapper

**Dependencies:** None. Can start immediately.

---

## Phase 1: Configurable Prompt System

**Goal:** Move prompts from code-only to database-backed, editable via admin UI, so non-developers can adjust what Claude does without code deploys. Both Tier 1 (automatic) and Tier 2 (human-initiated) use the same prompt system.

**What to build:**

### Database schema
```sql
CREATE TABLE prompt_templates (
  id SERIAL PRIMARY KEY,
  app_key VARCHAR(100) NOT NULL,           -- e.g. 'batch-phase-ii'
  prompt_key VARCHAR(100) NOT NULL,        -- e.g. 'summarization'
  version INTEGER NOT NULL DEFAULT 1,
  template_text TEXT NOT NULL,             -- prompt with {{placeholders}}
  description TEXT,                        -- human-readable description
  parameters JSONB DEFAULT '[]',           -- [{name, type, description, default}]
  is_active BOOLEAN DEFAULT true,
  created_by INTEGER REFERENCES user_profiles(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(app_key, prompt_key, version)
);
```

### Runtime resolution
- New `lib/utils/prompt-resolver.js` with `resolvePrompt(appKey, promptKey, params)`
- Checks DB for active template first, falls back to hardcoded JS function
- In-memory cache with 5-min TTL (same pattern as `loadModelOverrides()` in `shared/config/baseConfig.js`)
- Placeholders: `{{text}}`, `{{summaryLength}}`, etc. — simple string interpolation, not arbitrary code

### Admin UI
- New "Prompts" tab on `/admin` page
- List templates grouped by app, click to edit
- "Save as new version" (never overwrites — creates version N+1)
- Version history with diff view and rollback
- "Test" button: fill sample parameters, preview resolved prompt

### API endpoint
- `pages/api/admin/prompts.js` — GET (list), POST (new version), PUT (toggle active version)
- Superuser-only, same pattern as `/api/admin/models.js`

### Migration strategy
- Seed `prompt_templates` with current hardcoded prompts from `shared/config/prompts/`
- JS files remain as fallback defaults
- Processing endpoints change from `createSummarizationPrompt(text, len)` to `resolvePrompt('batch-phase-ii', 'summarization', { text, summaryLength })`

**Key files:**
- `shared/config/prompts/*.js` — current prompts (15+ files), become fallback defaults
- `shared/config/baseConfig.js` — `loadModelOverrides()` pattern to replicate for prompts
- `pages/admin.js` — add Prompts tab
- `pages/api/process.js`, `pages/api/process-phase-i.js` — update to use `resolvePrompt()`

**Dependencies:** None (can parallel with Phase 0).

---

## Phase 2: Service Processing Endpoints

**Goal:** Stateless API endpoints that PowerAutomate can call to process documents.

**What to build:**

### `POST /api/service/process-document`
Primary endpoint. Accepts document + processing instructions, returns results synchronously.

```json
// Request (Tier 1: text extraction mode)
{
  "documentBase64": "JVBERi0...",
  "documentFilename": "Proposal_1001289.pdf",
  "processingMode": "text",
  "appKey": "batch-phase-ii",
  "promptKey": "summarization",
  "parameters": { "summaryLength": 2 },
  "requestNumber": "1001289"
}

// Request (Tier 2: full PDF mode — future)
{
  "documentBase64": "JVBERi0...",
  "documentFilename": "Proposal_1001289.pdf",
  "processingMode": "vision",
  "appKey": "batch-phase-ii",
  "promptKey": "detailed-evaluation",
  "parameters": {},
  "requestNumber": "1001289"
}

// Response
{
  "jobId": "uuid",
  "status": "completed",
  "results": {
    "formatted": "# Project Title...",
    "structured": { "principal_investigator": "...", ... },
    "metadata": { "model": "...", "inputTokens": 1234, "processingTimeMs": 45000 }
  }
}
```

### Two processing modes
- **`text` mode (Tier 1):** `pdf-parse` extracts text → sends text to Claude. Cheap, fast, sufficient for summaries. This is what the app already does.
- **`vision` mode (Tier 2):** Raw PDF sent to Claude's vision API as base64. More expensive but Claude sees figures, tables, diagrams. New code path.

### Implementation approach
- Extract core processing logic from `pages/api/process.js` into shared `lib/processing/document-processor.js`
- Both the existing UI endpoint (with SSE streaming) and the new service endpoint (synchronous JSON) call the same processor
- Body size limit: `20mb` for base64-encoded PDFs (typical proposals are 2-10MB)
- Auth: `verifyServiceAuth()` from Phase 0

### `POST /api/service/process-batch`
- Up to 5 documents per call (Vercel 300s timeout, each doc takes 30-60s)
- Sequential processing, checks elapsed time before each document
- Returns partial results if timeout approaches
- PowerAutomate flow handles splitting larger batches

### `GET /api/service/health`
- Simple connectivity check for PowerAutomate

### Results storage
```sql
CREATE TABLE processing_results (
  id SERIAL PRIMARY KEY,
  job_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  request_number VARCHAR(50),
  app_key VARCHAR(100) NOT NULL,
  prompt_key VARCHAR(100),
  processing_mode VARCHAR(20),            -- 'text' or 'vision'
  document_filename VARCHAR(500),
  formatted_output TEXT,
  structured_output JSONB,
  metadata JSONB,
  status VARCHAR(50) DEFAULT 'completed',
  error_message TEXT,
  triggered_by VARCHAR(50) NOT NULL,      -- 'user', 'service', 'cron'
  user_profile_id INTEGER REFERENCES user_profiles(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Key files:**
- `pages/api/process.js` — extract core logic into shared module
- `pages/api/process-phase-i.js` — same extraction
- `shared/api/handlers/claudeClient.js` — reuse for Claude calls
- `lib/services/claude-reviewer-service.js` — retry/fallback patterns to reuse

**Dependencies:** Phase 0 (service auth). Phase 1 nice-to-have but not required (falls back to hardcoded prompts).

---

## Phase 3: Dynamics Write-Back

**Goal:** Get processing results into Dynamics. Two sub-phases based on permissions.

### Phase 3A: PowerAutomate Writes (No new permissions needed)

PowerAutomate already has full Dynamics access. The flow:

```
PowerAutomate trigger (status change on akoya_request)
  → HTTP POST to /api/service/process-document
  → Parse JSON response
  → Update akoya_request record with results (PA does the write)
  → On failure: send alert email to admin
```

Our API just returns results in the response body. PowerAutomate's "Update a row" action writes them to Dynamics fields.

**New custom fields needed on `akoya_request`:**

| Proposed Field | Type | Purpose |
|---|---|---|
| `wmkf_ai_summary` | Multi-line text | AI-generated proposal summary (formatted) |
| `wmkf_ai_structured_data` | Multi-line text (JSON) | Structured extraction (PI, methods, keywords, etc.) |
| `wmkf_ai_summary_generated_at` | DateTime | When summary was last generated |
| `wmkf_ai_summary_model` | Single-line text | Which Claude model was used |
| `wmkf_ai_summary_version` | Integer | Prompt template version used |

**Schema ownership TBD:** Need to determine whether the AkoyaGO vendor or internal staff (Connor) can create these fields. The plan specs exactly what's needed so the request is ready regardless.

### Phase 3B: Direct API Writes (Blocked on IT approval)

When IT grants write permissions on our app registration:
- Un-stub `updateRecord()` and `createRecord()` in `dynamics-service.js` (currently throw "Write operations are not yet enabled")
- Our UI endpoints can write directly without PowerAutomate as intermediary
- Tier 2 (human-initiated) flows become simpler: user clicks in our UI → our API writes to Dynamics directly

**Permissions needed:**
- Custom security role "App - Proposal Processing" on the app's application user
- Privileges: `prvUpdate` on `akoya_request` (at minimum)
- Potentially `prvCreate` if we need to create related records
- Scoped to specific tables (not blanket write access) for least privilege
- App registration ID: `d2e73696-537a-483b-bb63-4a4de6aa5d45`

**Key files:**
- `lib/services/dynamics-service.js` — stubbed write methods
- `docs/PENDING_ADMIN_REQUESTS.md` — update with new permission request

---

## Phase 4: PowerAutomate Flow Configuration

**Goal:** Configure the actual triggers in PowerAutomate. Collaboration between Justin (API design, testing) and Connor (PowerAutomate expertise, Dynamics triggers).

This is primarily configuration work in the Power Platform, not code in our app. Flow specs below are detailed enough to build from.

### Flow 1: Auto-Summarize New Phase II Proposals

**Trigger:** Dataverse connector → "When a row is added, modified or deleted"
- Table: `akoya_requests`
- Change type: Modified
- Scope: Organization (all records, not just user-owned)

**Condition:** Check that status changed to target value
```
@equals(triggerOutputs()?['body/akoya_requeststatus'], 'Phase II Pending')
```

**Actions:**
1. **Get SharePoint documents** — SharePoint connector → "Get files (properties only)"
   - Site: `appriver3651007194.sharepoint.com/sites/akoyaGO`
   - Library: the document library linked to this request
   - Folder path: `{RequestNumber}_{GUIDNoHyphens}` pattern
   - Filter: file extension eq 'pdf'

2. **For each PDF:**
   - **Get file content** — SharePoint → "Get file content" using file identifier from step 1
   - **Convert to base64** — Expression: `base64(outputs('Get_file_content')?['body'])`
   - **Call our API** — HTTP connector:
     ```
     Method: POST
     URI: https://{your-vercel-domain}/api/service/process-document
     Headers:
       Authorization: Bearer {SERVICE_API_KEY}
       Content-Type: application/json
     Body:
       {
         "documentBase64": "@{base64(outputs('Get_file_content')?['body'])}",
         "documentFilename": "@{items('For_each')?['FileLeafRef']}",
         "processingMode": "text",
         "appKey": "batch-phase-ii",
         "requestNumber": "@{triggerOutputs()?['body/akoya_requestnum']}"
       }
     Timeout: PT280S  (280 seconds, under our 300s limit)
     ```
   - **Parse JSON** — parse the response body
   - **Update Dynamics record** — Dataverse → "Update a row"
     - Table: `akoya_requests`
     - Row ID: `@{triggerOutputs()?['body/akoya_requestid']}`
     - Fields: map parsed response to the custom fields (wmkf_ai_summary, etc.)

3. **Error handling** — Wrap in a Scope block with "Configure run after → has failed" branch:
   - Send email notification to admin with error details
   - Optionally retry once after 60 seconds

### Flow 2: Auto-Summarize Phase I
Same structure, different trigger condition (`'Phase I Pending'`) and `appKey` (`'batch-phase-i'`).

### Future Flows (Tier 2 support):
- **Reviewer write-back:** HTTP trigger (called by our app) → update reviewer fields on `akoya_request`
- **Review status sync:** When review status changes in our app → PA flow updates Dynamics
- **Review archival:** When review received → PA flow uploads to SharePoint

**Who does what:**
- Justin: designs API contracts, tests endpoints, provides SERVICE_API_KEY for flow configuration
- Connor: builds flows in Power Platform, configures triggers and Dataverse connectors, handles error notification routing

**Dependencies:** Phases 0-2 (working service endpoints). Phase 3A fields must exist in Dynamics.

---

## Phase 5: Human-Initiated Flows Write to Dynamics

**Goal:** When staff use Reviewer Finder or Review Manager, results flow back to Dynamics.

### Interim (via PowerAutomate):
- Our UI endpoints return results as normal
- Additionally call a PowerAutomate HTTP trigger with the results
- PA flow writes to Dynamics

### Long-term (direct writes, after Phase 3B):
- Our API endpoints call `DynamicsService.updateRecord()` directly
- Example: saving reviewer candidates writes them to both our `reviewer_suggestions` table AND Dynamics
- Example: sending materials updates Dynamics request timeline

### What changes in our code:
- Add optional Dynamics write-back to existing endpoints (behind feature flag until ready)
- `pages/api/reviewer-finder/save-candidates.js` — after saving to Postgres, also update Dynamics
- `pages/api/review-manager/reviewers.js` — status changes reflected in Dynamics
- `pages/api/review-manager/send-emails.js` — email activity linked to Dynamics request

**Dependencies:** Phase 3A or 3B (a write path to Dynamics must exist).

---

## Phase 6: Operational Maturity

**Goal:** Production-grade monitoring, retry, and visibility.

- **Processing dashboard** on admin page: view all jobs from `processing_results`, filter by status/app/trigger source, retry failed jobs
- **Retry queue:** Failed jobs auto-queued for retry (new cron job, 3 retries with backoff)
- **Alerting:** Extend existing `AlertService` for processing failure rates, Claude API errors, service auth failures
- **API documentation:** Clear endpoint docs for Connor to reference when building PowerAutomate flows

**Dependencies:** Phases 0-4 in production.

---

## New Capability: Compliance Screening

**Goal:** Automatically flag proposals that don't fit the Foundation's written criteria. Develop against historical data, then deploy for new proposals.

### Criteria Source
The Foundation has existing written criteria documents defining what types of research are supported and what is excluded. These become the prompt context — Claude evaluates each proposal against the criteria and produces a compliance assessment.

### Development Pipeline: Batch Evaluation

**Step 1: Build batch evaluation endpoint**

`POST /api/service/batch-evaluate`
```json
// Request
{
  "evaluationType": "compliance",
  "filter": {
    "statusValues": ["Phase I Pending", "Phase I Declined", "Proposal Invited"],
    "dateRange": { "from": "2023-01-01", "to": "2025-12-31" }
  },
  "maxProposals": 50,
  "promptKey": "compliance-screening",
  "outputFormat": "csv"
}

// Response
{
  "jobId": "uuid",
  "status": "completed",
  "resultsUrl": "/api/service/download/uuid.csv",
  "summary": {
    "processed": 50,
    "flagged": 12,
    "compliant": 35,
    "inconclusive": 3
  }
}
```

**Processing per proposal:**
1. Query Dynamics for proposal metadata (request number, status, outcome, PI, institution)
2. Fetch full PDF from SharePoint via Graph API (already have read access)
3. Extract text with `pdf-parse` (images stripped — critical at scale)
4. Run compliance prompt: criteria document + proposal text → assessment
5. Record: proposal ID, AI decision (compliant/flagged/inconclusive), reasoning, confidence, actual outcome from Dynamics

**CSV output columns:**
| Column | Source |
|--------|--------|
| Request Number | Dynamics |
| PI / Institution | Dynamics |
| Proposal Title | Dynamics |
| Actual Outcome | Dynamics (`akoya_requeststatus`) |
| AI Assessment | Claude (compliant / flagged / inconclusive) |
| AI Reasoning | Claude (2-3 sentence explanation) |
| Criteria Matched | Claude (which specific criteria triggered the flag) |
| Confidence | Claude (high / medium / low) |

**Step 2: Human review and iteration**
- Staff review CSV, annotate where AI was right/wrong
- Refine prompt via admin UI (Phase 1 configurable prompts)
- Re-run batch, compare improvement
- Track accuracy metrics across iterations

**Step 3: Deploy to production**
Once accuracy is acceptable, wire the same compliance prompt into the PowerAutomate automatic pipeline (Phase 4). New proposals get screened on arrival, flagged ones routed for human review.

### Data Source
- **Initial testing:** Phase I proposals in Dynamics (current format, being phased out)
- **Future:** Whatever proposal format replaces Phase I — the screening logic transfers, only the prompt needs adjustment
- **Full PDFs required** — abstracts alone are insufficient for compliance assessment
- **Text-only extraction** — `pdf-parse` strips images, keeping costs manageable at batch scale

---

## New Capability: Staff-Proposal Matching

**Goal:** Route proposals to the right people at three tiers: staff lead, consultant review, and board member expertise.

### Matching Tiers

| Tier | People | Matching Granularity | Purpose |
|------|--------|---------------------|---------|
| Staff lead | ~16 staff | Coarse (program area, workload) | Assign a program director/coordinator to lead |
| Consultant flag | Retained consultants | Domain expertise | Flag when specialist input would add value |
| Board member | Board members | Subject matter expertise | Identify board members with relevant knowledge |

### Rules Source
A colleague has made a first attempt at creating matching rules. These become the starting point for the prompt. Rules will be refined through batch evaluation, same as compliance screening.

### Development Pipeline
Same batch evaluation infrastructure as compliance screening:

1. **Batch endpoint** — same `/api/service/batch-evaluate` with `evaluationType: "staff-matching"`
2. **Processing per proposal:** criteria/rules document + proposal text → recommended staff lead + consultant flags + board member matches, with reasoning
3. **CSV output:** proposal info, AI recommendations per tier, reasoning, actual assignments from Dynamics (for comparison)
4. **Human review:** staff review recommendations, refine matching rules
5. **Deploy:** wire into PowerAutomate pipeline once tuned

### CSV output columns for matching:
| Column | Source |
|--------|--------|
| Request Number | Dynamics |
| Research Area | Claude extraction |
| Recommended Staff Lead | Claude |
| Staff Lead Reasoning | Claude |
| Consultant Recommended? | Claude (yes/no + who) |
| Consultant Reasoning | Claude |
| Board Members with Expertise | Claude |
| Board Reasoning | Claude |
| Actual Staff Assignment | Dynamics |

---

## Batch Evaluation Infrastructure

Both new capabilities share common infrastructure:

### Shared components
- **Batch orchestrator** (`lib/processing/batch-evaluator.js`) — queries Dynamics for proposals matching filter, fetches PDFs from SharePoint, runs processing, generates CSV
- **CSV generator** — structured output with metadata columns + AI assessment columns
- **Results storage** — `processing_results` table (same as Phase 2) captures each evaluation for audit
- **Progress tracking** — for large batches, SSE or polling endpoint to show completion %

### Vercel timeout management
- Large batches exceed the 300s function timeout
- Strategy: process in chunks of 5-10 proposals per API call
- The batch endpoint accepts `offset` and `limit` parameters
- A wrapper script (or PowerAutomate flow) calls repeatedly until all proposals processed
- Each chunk's results appended to the same CSV

### Prompt iteration workflow
1. Admin edits prompt in admin UI (Phase 1 configurable prompts)
2. Re-run batch evaluation with updated prompt
3. Compare results across prompt versions (version number tracked in output)
4. When satisfied, mark prompt version as "production" — PowerAutomate flows use it

### Relationship to Dynamics Explorer
The Dynamics Explorer chat can also run one-off compliance checks or staff matching queries — useful for ad-hoc testing or checking a specific proposal. But **batch evaluation is the primary development tool** for tuning these capabilities at scale.

---

## Sequencing & Dependencies

```
Can start now (parallel):
  Phase 0: Service Auth Layer
  Phase 1: Configurable Prompts
  Phase A: CRM Email Send (existing plan, independent)

After Phase 0:
  Phase 2: Service Processing Endpoints

After Phase 2:
  Batch Evaluation Infrastructure (compliance screening + staff matching)
  → Iterate on prompts with historical Phase I data
  → Refine with staff feedback

After Phase 2 + custom fields created in Dynamics:
  Phase 3A: PowerAutomate Writes (interim)
  Phase 4: PowerAutomate Flow Configuration (with Connor)
  → Include compliance screening + staff matching in automatic flows
    (only after batch evaluation shows acceptable accuracy)

When IT grants write permissions:
  Phase 3B: Direct API Writes
  Phase 5: Human-Initiated → Dynamics

Ongoing:
  Phase 6: Operational Maturity
```

## IT/Admin Requests to Prepare

1. **New custom fields on `akoya_request`** — Determine who can create them (vendor vs. internal). Fields spec'd in Phase 3A above.
2. **Write permissions for app registration** — Custom security role with `prvUpdate` on `akoya_request`. App ID: `d2e73696-537a-483b-bb63-4a4de6aa5d45`.
3. **Pending from previous sessions:** "Email Sender" role assignment, `Sites.Selected` authorization (tracked in `docs/PENDING_ADMIN_REQUESTS.md`).

---

## PDF Processing Strategy

| Tier | Volume | Processing Mode | How It Works | When |
|------|--------|----------------|--------------|------|
| Tier 1 (auto) | High (~100x) | Text only | `pdf-parse` extracts text, images ignored. Cheap, fast, sufficient for summaries. | Every proposal submission |
| Tier 2 (manual) | Low (selective) | Full PDF vision | Raw PDF sent to Claude vision API as base64. Claude sees figures, tables, diagrams. | Reviewer finding, detailed evaluation |

No shell-command pre-processing needed: `pdf-parse` already strips images during text extraction (Tier 1), and Claude handles full PDFs natively via vision API (Tier 2).

---

## Verification Plan

- **Phase 0:** `curl -H "Authorization: Bearer $SERVICE_API_KEY" /api/service/health` returns 200; without token returns 401
- **Phase 1:** Create prompt in admin UI → processing endpoint uses new template → revert to previous version works
- **Phase 2:** `curl` with base64 PDF to `/api/service/process-document` returns summary JSON; check `processing_results` table
- **Phase 3A:** PowerAutomate test flow writes to a test Dynamics record
- **Phase 4:** Upload test proposal to Dynamics → verify summary appears automatically
- **Phase 5:** Save reviewer candidate in UI → verify data appears in Dynamics
- **Phase 6:** Deliberately fail a processing job → verify retry queue picks it up → verify alert fires

---

## Key Files Reference

| File | Role in This Plan |
|------|-------------------|
| `middleware.js` | Add `api/service` exclusion (Phase 0) |
| `lib/utils/cron-auth.js` | Template for `service-auth.js` (Phase 0) |
| `lib/utils/auth.js` | Add dual-auth wrapper (Phase 0) |
| `shared/config/baseConfig.js` | Cache pattern to replicate for prompts (Phase 1) |
| `shared/config/prompts/*.js` | Current prompts → seed DB + fallback defaults (Phase 1) |
| `pages/admin.js` | Add Prompts tab (Phase 1), Processing dashboard (Phase 6) |
| `pages/api/process.js` | Extract core logic to shared module (Phase 2) |
| `pages/api/process-phase-i.js` | Same extraction (Phase 2) |
| `lib/services/dynamics-service.js` | Un-stub write methods (Phase 3B) |
| `docs/PENDING_ADMIN_REQUESTS.md` | Update with write permission request (Phase 3B) |
| `docs/CRM_EMAIL_SEND_PLAN.md` | Phase A, independent but complementary |
