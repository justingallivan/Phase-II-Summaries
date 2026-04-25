# Long-Term Plan: Event-Driven Backend Automation via PowerAutomate

**Status:** Planning — architecture finalized Session 94, ready to begin implementation.
**Created:** Session 90, 2026-03-28
**Last Updated:** Session 94, 2026-04-08
**Stakeholders:** Justin (prompt development, Vercel app), Connor (PowerAutomate flows, Dynamics admin)

## Context

This project started as a personal workflow automation tool and has grown into a multi-user platform. Leadership wants key processing tasks (especially proposal summarization and compliance screening) to happen automatically when documents arrive in Dynamics/Dataverse — no manual uploads, no button clicks. Other tasks (reviewer finding, review management) remain human-initiated but should write results back to Dynamics. **All results ultimately live in Dynamics as the source of truth.**

See `docs/GRANT_CYCLE_LIFECYCLE.md` for the full proposal lifecycle with stage-by-stage detail.

---

> **Update — Session 100, 2026-04-15:** Two design decisions taken since this plan was originally written change how Phase 1+ should be approached:
>
> 1. **Prompts move out of `.js` into a Dataverse `wmkf_prompt_template` table** so PA can read them natively. See `docs/PROMPT_STORAGE_DESIGN.md`. Affects Phase 1 (prompts under development now should be designed with the storage schema in mind) and Phase 4 (PA flow construction reads from this table, not from hard-coded text).
> 2. **Workflow chaining via structured outputs** — the first call in a backend lifecycle (e.g., Phase I writeup) produces structured fields that downstream calls (compliance, PD assignment, etc.) consume from Dynamics, rather than re-reading the proposal. See `docs/WORKFLOW_CHAINING_DESIGN.md`. Materially changes what the "Summary + keyword extraction" prompt should produce, and what intermediate Dynamics fields need to exist on `akoya_request` before downstream PA flows can chain.
>
> The "Hybrid vs. full PA composition" question was resolved in Session 102 (2026-04-16): **full PA composition**. PA owns the entire flow including direct Anthropic API calls. The architecture diagram below accurately reflects the chosen path.

> **Update — Session 110, 2026-04-25:** Phase 0 of the prompt-storage + Executor architecture is **shipped on the Vercel side**. Concrete state:
>
> 1. **`wmkf_ai_prompt` table is live** in Dynamics with a real seed row (`phase-i.summary`, GUID `d4201d8e-3840-f111-88b5-000d3a3065b8`). Seed script at `scripts/seed-phase-i-summary-prompt.js` is idempotent and round-trips cleanly. Field names finalized: `wmkf_ai_systemprompt`, `wmkf_ai_promptbody`, `wmkf_ai_promptvariables`, `wmkf_ai_promptoutputschema`, plus the new `wmkf_ai_Prompt` Lookup on `wmkf_ai_run` for provenance.
> 2. **`executePrompt()` Executor service** lives at `lib/services/execute-prompt.js`. Implements the 10-step contract in `docs/EXECUTOR_CONTRACT.md` including the new step-4 output guards (`skip-if-populated` / `always-overwrite` + `forceOverwrite` input). Always writes a `wmkf_ai_run` row — even on failure or block — with both Lookups populated. Phase 0 source kinds: `dynamics`, `sharepoint`, `override`. Phase 0 target kinds: `akoya_request` (with optional `$.foo` jsonPath), `none`. Phase 0 parseModes: `raw`, `json`.
> 3. **Reference call site refactored** — `pages/api/phase-i-dynamics/summarize-v2.js` shrank from 292 → 145 lines and now does only Vercel-specific concerns (auth, rate limit, file load from `fileRef`, 409 shaping, per-user usage logging). UI compatibility preserved.
> 4. **Strategic shift on user-facing intake apps** — see `memory/project_phase_i_summary_app_winddown.md`. Phase I summary as a user-facing task is winding down post-May-2026 cycle; future intake prompts (compliance, fit-assessment, keywords) should be designed **backend-first** (PA-triggered) rather than as new Vercel routes. User-driven apps that tie into Dynamics (reviewer finder, Phase II tools, Expertise Finder, Grant Reporting, Review Manager) stay in active development.
>
> **Phase 1 implications for Connor:** the `ExecutePrompt` PA child flow builds against `docs/EXECUTOR_CONTRACT.md` — same 10 steps, same prompt-row schema, same `wmkf_ai_run` write contract. The Vercel implementation is the test oracle (echo-prompt parity). PA-side `forceOverwrite` defaults to caller's choice — see contract § "Notes for caller authors" for explicit guidance per parent flow type. The `phase-i.compliance` prompt row was deferred from Phase 0; when authored, it's a backend-first prompt.
>
> **Executor extensions still pending** before backend automation can do compliance/fit/keywords: native PDF input (`preprocess: pdf_native`), multi-output PATCH coalescing (current Executor's same-row second-PATCH would 412), Picklist-target output type. None blocking May 1; needed before backend intake automation.

> **Update — Session 103, 2026-04-17:** Three empirical findings affect PA flow design:
>
> 1. **`{{var}}` interpolation syntax verified on the Next.js side** (still needs a PA-side confirmation). Dataverse Memo fields holding `{{proposal_text}}`-style placeholders round-trip cleanly through OData — `{{` is not interpreted as an expression. See `docs/CONNOR_QUESTIONS_2026-04-15.md` Q3.
> 2. **Sonnet 4.6's empirical cache minimum is ~2,048 tokens** (docs say 1,024). PA flows should only bother assembling `cache_control` JSON when the stable prefix (tools + system + cached user blocks) comfortably exceeds 2K tokens. For smaller prompts the marker is a no-op. See `docs/PROMPT_CACHING_PLAN.md`.
> 3. **Image handling creates a path asymmetry.** PA backend strips images in a pre-filter (lean, text-only); user-side Vercel paths likely keep PDFs with images intact. The cached content profiles differ significantly — a user-side PDF with figures may be 12–20K tokens vs. 5–7K text-only. Caching ROI is correspondingly higher on the user-side path.
>
> Related: Session 103 shipped a working prototype of the Dynamics-stored-prompt pattern against the Phase I test endpoint — see the "Session 103 prototype findings" section of `PROMPT_STORAGE_DESIGN.md`. The `PromptResolver` service is in place; swap its `_fetchFromDynamics()` to read from `wmkf_prompt_template` when Connor's table lands.
>
> Also in Session 103: a **proposal context extraction plan** (`docs/PROPOSAL_CONTEXT_EXTRACTION_PLAN.md`) that extends the workflow-chaining idea for the upcoming single-phase cycle. Proposes ~15 structured fields the initial pass should extract so deep-dive calls (reviewer matching, panel review, compliance) read ~1.5K tokens of curated context instead of the full ~7K-token proposal. Compounds with expensive models and multi-LLM panel work. Not blocking v1; factored in when planning single-phase cycle Dynamics fields.

## Architecture

### Automated AI Tasks (PowerAutomate → Claude API → Dynamics)

PowerAutomate flows handle all automated processing:
1. Detect status change or document arrival in Dynamics
2. Fetch proposal PDFs from SharePoint
3. Call Claude API directly (HTTP connector with API key)
4. Write results back to Dynamics fields

Our Vercel app is **not in the loop** for automated tasks. This keeps the architecture simple — PowerAutomate already has full Dynamics + SharePoint access and can call Claude's API directly.

> **Decision (2026-04-16, Session 102):** Full PA composition confirmed. PA owns the entire Claude call lifecycle for automated backend jobs — no Vercel dependency at runtime. This matches the original architecture above. Rationale: easier to debug PA-native flows, and backend automation is mission-critical. PA handles PDF extraction natively (confirmed 2026-04-15). Retry, `cache_control`, and JSON validation will be implemented in PA flows. See `PROMPT_STORAGE_DESIGN.md` for full decision record.

### Human-Initiated Tasks (Vercel App → Dynamics)

Staff use the Vercel app for tasks requiring judgment:
- Reviewer finding with specific expertise criteria
- Review management and materials distribution
- Integrity screening
- Virtual review panels
- Ad-hoc proposal summarization and analysis

Results from these tools will flow back to Dynamics via direct API writes (once write permissions are granted).

### Prompt Development (Vercel App → Batch Evaluation)

New AI capabilities (compliance screening, PD assignment, staff matching) are developed by:
1. Building and testing prompts against historical proposals via batch evaluation tools in the Vercel app
2. Iterating with staff feedback until accuracy is acceptable
3. Handing proven prompts to Connor for deployment in PowerAutomate flows

---

## Phase 1: Prompt Development & Batch Evaluation

**Goal:** Build tools to develop, test, and validate prompts against historical proposals. Proven prompts are then deployed by Connor in PowerAutomate flows.

**AI tasks to develop prompts for (ordered by lifecycle priority):**
1. **Compliance checking** — does the application meet Foundation requirements? (lifecycle step 4)
2. **Summary + keyword extraction** — generate summary and keywords for Dynamics fields (lifecycle step 4)
3. **PD assignment by specialty area** — route proposals to the right program director (lifecycle step 6, rules to be built from scratch)
4. **Phase II compliance** — similar to Phase I but requirements may differ (lifecycle step 14)
5. **Staff-proposal matching** — route to staff lead, flag for consultant, identify relevant board members. **Now powered by the Expertise Finder app** (`pages/expertise-finder.js`) with the roster managed in Vercel Postgres (`expertise_roster` table). Prompt template at `shared/config/prompts/expertise-finder.js`. When validated, hand prompt to Connor for automated PowerAutomate flow.

### What to build

#### Batch evaluation tool
A Vercel app page + API endpoint that:
1. Queries Dynamics for historical proposals matching filter criteria (status, date range, program area)
2. Fetches PDFs from SharePoint via Graph API (read access already exists)
3. Extracts text with `pdf-parse`
4. Runs the prompt under development against each proposal
5. Generates CSV output: proposal info + AI assessment + actual outcome (for comparison)
6. Tracks results across prompt iterations for accuracy comparison

#### CSV output (compliance screening example)

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

#### CSV output (staff matching example)

| Column | Source |
|--------|--------|
| Request Number | Dynamics |
| Research Area | Claude extraction |
| Recommended Staff Lead | Claude |
| Staff Lead Reasoning | Claude |
| Consultant Recommended? | Claude (yes/no + who) |
| Board Members with Expertise | Claude |
| Actual Staff Assignment | Dynamics |

#### Prompt iteration workflow
1. Develop prompt in code (`shared/config/prompts/`)
2. Run batch evaluation against historical proposals
3. Review CSV results with staff — annotate where AI was right/wrong
4. Refine prompt, re-run, compare improvement
5. When accuracy is acceptable, hand prompt to Connor for PowerAutomate deployment

#### Vercel timeout management
- Large batches exceed the 300s function timeout
- Strategy: process in chunks of 5-10 proposals per API call
- Batch endpoint accepts `offset` and `limit` parameters
- Frontend handles pagination automatically
- Each chunk's results appended to the same output

### Data sources
- **Criteria documents:** Already digitized and available for compliance prompt context
- **Historical proposals:** Phase I proposals in Dynamics (current format, actively evolving)
- **Text-only extraction** at batch scale — `pdf-parse` strips images, keeping costs manageable
- **Staff matching rules:** Need to be built from scratch based on staff input about current routing practices

### Key files
- `shared/config/prompts/*.js` — existing prompt patterns to follow
- `lib/services/dynamics-service.js` — Dynamics read access (working)
- `lib/services/graph-service.js` — SharePoint document access (working)
- `shared/config/baseConfig.js` — cache patterns to reuse

**Dependencies:** None. Can start immediately.

---

## Phase 2: Dynamics Write-Back (Human-Initiated Tools)

**Goal:** When staff use Reviewer Finder, Review Manager, or other Vercel app tools, results flow back to Dynamics.

### Prerequisites (Connor)
- Grant write permissions on app registration `d2e73696-537a-483b-bb63-4a4de6aa5d45`
- Custom security role "App - Proposal Processing" with `prvUpdate` on `akoya_request` (at minimum)
- Potentially `prvCreate` if we need to create related records
- Scoped to specific tables (not blanket write access) for least privilege

### What to build
- Un-stub `updateRecord()` and `createRecord()` in `dynamics-service.js` (currently throw "Write operations are not yet enabled")
- Add Dynamics write-back to existing endpoints:
  - `pages/api/reviewer-finder/save-candidates.js` — reviewer data written to Dynamics
  - `pages/api/review-manager/reviewers.js` — status changes reflected in Dynamics
  - `pages/api/review-manager/send-emails.js` — email activity linked to Dynamics request
- Behind feature flag until ready

### Key files
- `lib/services/dynamics-service.js` — stubbed write methods, existing auth token flow works
- `docs/PENDING_ADMIN_REQUESTS.md` — update with permission request

**Dependencies:** Connor grants write permissions.

---

## Phase 3: Data Migration to Dynamics

**Goal:** Move all operational data from Vercel Postgres to Dynamics so Dynamics is the single source of truth.

### Tables to migrate

| Table | Records | Purpose |
|-------|---------|---------|
| `researchers` | Expert profiles | Shared pool of reviewer candidates |
| `publications` | Linked to researchers | Publication history |
| `reviewer_suggestions` | Per-user per-proposal | "My Candidates" saved reviewers |
| `proposal_searches` | Per-user | Proposal analysis results |
| `grant_cycles` | Shared | Grant cycle definitions |
| `integrity_screenings` | Per-user | Screening history |
| `screening_dismissals` | Per-user | False positive dismissals |
| `panel_reviews` | Per-user | Virtual review panel results |
| `expertise_roster` | Shared | Internal reviewer/consultant/board roster (38+ entries) |
| `expertise_matches` | Per-user | AI proposal-to-reviewer matching history |

### What stays in Vercel Postgres
System/infrastructure data that has no Dynamics equivalent:
- `user_profiles`, `user_preferences`, `user_app_access` — auth & access control
- `dynamics_user_roles`, `dynamics_restrictions` — Dynamics Explorer permissions
- `system_settings` — model overrides, config
- `api_usage_log`, `dynamics_query_log` — usage tracking
- `system_alerts`, `health_check_history`, `maintenance_runs` — monitoring
- `dynamics_feedback` — Dynamics Explorer feedback
- `retractions` — Retraction Watch reference data (~63K rows)

### Prerequisites (Connor)
- Create corresponding entities/fields in Dynamics for each table above
- Define the Dynamics schema for reviewer data, screening results, etc.

### Migration strategy
TBD — options are:
1. **Gradual dual-write:** App writes to both Vercel Postgres and Dynamics during transition, cut over when confident
2. **One-time bulk migration:** Migrate existing data, switch app to Dynamics-only reads/writes

After migration, service classes switch from Vercel Postgres queries to Dynamics API calls for operational data.

**Dependencies:** Phase 2 (write access), Connor creates Dynamics entities.

---

## Phase 4: PowerAutomate Flow Configuration

**Goal:** Configure the automated AI processing flows in PowerAutomate. This is primarily Connor's work in the Power Platform.

### Flows to build

| Flow | Trigger | AI Task | Status |
|------|---------|---------|--------|
| Phase I file organization | Request created, `Phase I Status = Pending Committee Review` | — | Planned |
| Phase I AI check-in | File organization complete | Claude: compliance + summary + keywords | Planned |
| Phase I staff version | AI check passes compliance | — (PDF formatting) | Planned |
| PD assignment | After application deadline (batch) | Claude: assign PD by specialty | Planned |
| Phase II file organization | `Phase II Status = Phase II Pending Committee Review` | — | Planned |
| Phase II AI check-in | File organization complete | Claude: compliance (+ TBD) | Planned |
| Phase II staff version | AI check passes compliance | — (PDF formatting) | Planned |

### Flow architecture (each AI flow)
```
Dataverse trigger (status change on akoya_request)
  → SharePoint: get files from request folder
  → For each PDF:
    → SharePoint: get file content
    → HTTP: call Claude API directly (with proven prompt from Phase 1)
    → Parse response
    → Dataverse: update akoya_request with AI results
  → On failure: email Connor + Justin
```

### Trigger conditions
To be determined during flow construction — the proposal process is actively evolving, so exact status values and conditions will be customized as flows are built.

### Who does what
- **Justin:** develops and validates prompts (Phase 1), provides proven prompts for flows
- **Connor:** builds flows in Power Platform, configures triggers and Dataverse connectors, handles error notification routing

**Dependencies:** Phase 1 (proven prompts ready for deployment).

---

## Phase 5: Operational Maturity

**Goal:** Production-grade monitoring, retry, and visibility.

- **Processing dashboard** on admin page: view batch evaluation results, track prompt accuracy across iterations
- **Alerting:** Extend existing `AlertService` for processing failures, Dynamics write errors
- **Monitoring:** PowerAutomate flow run history (native in Power Platform) + Vercel app health checks

**Dependencies:** Phases 1-4 in production.

---

## Sequencing & Dependencies

```
Can start now:
  Phase 1: Prompt Development & Batch Evaluation
  Phase A: CRM Email Send (existing plan, independent)

Connor (parallel):
  Create custom fields on akoya_request for AI outputs
  Draft PowerAutomate flows (trigger logic, SharePoint file retrieval)
  Grant write permissions on app registration

After Phase 1 prompts are validated:
  Phase 4: PowerAutomate Flow Configuration (deploy prompts in flows)

When Connor grants write permissions:
  Phase 2: Dynamics Write-Back (human-initiated tools)

After Phase 2 + Connor creates Dynamics entities:
  Phase 3: Data Migration to Dynamics

Ongoing:
  Phase 5: Operational Maturity
```

---

## Connor's Admin Actions

All within Connor's access — no external IT or vendor dependencies.

1. **Custom fields on `akoya_request`** for AI outputs — fields spec'd in `docs/GRANT_CYCLE_LIFECYCLE.md`
2. **Write permissions** for app registration — custom security role with `prvUpdate` on `akoya_request`. App ID: `d2e73696-537a-483b-bb63-4a4de6aa5d45`
3. **Dynamics entities** for data migration — schema for reviewer data, screenings, panel reviews, etc.
4. **PowerAutomate flows** — build flows per Phase 4 specs using prompts developed in Phase 1
5. **Premium connectors** — available, no licensing blocker
6. **Pending from previous sessions:** "Email Sender" role assignment, `Sites.Selected` authorization (tracked in `docs/PENDING_ADMIN_REQUESTS.md`)

---

## Verification Plan

- **Phase 1:** Batch evaluation produces CSV with AI assessments alongside actual outcomes; staff confirm accuracy is acceptable
- **Phase 2:** Save reviewer candidate in UI → verify data appears in Dynamics
- **Phase 3:** Migrate test data → verify Vercel app reads from Dynamics correctly
- **Phase 4:** Upload test proposal to Dynamics → verify AI results appear automatically via PowerAutomate flow
- **Phase 5:** Deliberately fail a processing job → verify alert fires

---

## Key Files Reference

| File | Role in This Plan |
|------|-------------------|
| `shared/config/prompts/*.js` | Prompt development (Phase 1) |
| `lib/services/dynamics-service.js` | Dynamics read access (Phase 1), un-stub writes (Phase 2) |
| `lib/services/graph-service.js` | SharePoint document access (Phase 1) |
| `shared/config/baseConfig.js` | Cache patterns to reuse |
| `pages/admin.js` | Batch evaluation UI (Phase 1), processing dashboard (Phase 5) |
| `pages/api/reviewer-finder/save-candidates.js` | Add Dynamics write-back (Phase 2) |
| `pages/api/review-manager/reviewers.js` | Add Dynamics write-back (Phase 2) |
| `docs/GRANT_CYCLE_LIFECYCLE.md` | Full lifecycle reference |
| `docs/PENDING_ADMIN_REQUESTS.md` | Permission requests |
| `docs/CRM_EMAIL_SEND_PLAN.md` | Phase A, independent but complementary |
