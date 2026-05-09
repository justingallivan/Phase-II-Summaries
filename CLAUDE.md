# Document Processing Multi-App System

## Git Commit Policy

**Commit working changes regularly.** This provides rollback points when debugging.

- Commit after completing a feature or fix that works
- Use descriptive commit messages
- Don't let multiple sessions accumulate without commits

## Carryover Hygiene

**Verify destructive carryover items before acting on them.** Any task carried over from a prior session that says **drop**, **remove**, **retire**, **archive**, **delete**, or **deprecate** infrastructure (table, column, endpoint, env var, file, dispatch wrapper, dependency, feature flag) must be grep-verified against live state first. Carryover lists in `SESSION_PROMPT.md`, memory, or user prompts go stale — a belief from a prior session can propagate forward through several handoffs without re-verification.

Quick pre-flight: grep for live callers, read the most likely ones to confirm they're not load-bearing. If anything looks live, **stop and report back** — don't proceed because the carryover said to. After a successful verification, update the originating memory entry so the wrong belief doesn't keep propagating.

This rule does NOT apply to additive work (new features, endpoints, tables) — only destructive work.

## Ground-truth requirement

**Probe live state before drafting plans.** Session 136 produced three rounds of plan corrections because state claims weren't being verified. Self-correction rules live in **`docs/CLAUDE_REMEDIATION_PLAN.md`** (read this before starting any migration / integration / data-layer work):

1. **Probe-before-plan** — every state claim labeled `[VERIFIED via X]` or `[ASSUMED — needs verification]`
2. **Memory hygiene** — read full memory entries that match the work, not just the index
3. **Adjacent-context survey** — when citing a file, `ls` its parent; when citing a doc, `ls docs/`; before claiming "X has no Y", grep for Y
4. **Active doubt on state claims** — "the convention is X" / "the design landed at Y" need three independent sources before stating

The **Application State Atlas** at `docs/APPLICATION_STATE_ATLAS.md` (with per-entity pages in `docs/atlas/`) is the canonical reference for live-state lookups. Read the relevant per-entity page before any plan claim about that entity's schema, source-of-truth, read paths, or write paths. Re-run the probe scripts (`scripts/audit-postgres-state.js`, `scripts/audit-dataverse-state.js`) if a page hasn't been touched in 60+ days and you're planning destructive work.

CI gates the Atlas: `npm run check:atlas` fails if a Postgres table or Dataverse entity referenced in source isn't mentioned in any Atlas page. Run before committing data-layer changes.

**Coverage tools have a binding self-test.** When modifying any `scripts/check-*.js` gate (or building a new one), the matching self-test must pass: `npm run check:atlas:self-test` exercises every Atlas pattern documented in `docs/CLAUDE_COVERAGE_LESSONS.md`; `npm run check:doc-currency:self-test` exercises every doc-currency `DRIFT_PATTERNS` entry (positive + negation-guard fixtures). When external review (Codex, etc.) catches a structural pattern an existing gate missed, the order is mandatory: (1) update `CLAUDE_COVERAGE_LESSONS.md` (or the matching pattern catalog) with the new pattern + parallels, (2) add a fixture to the relevant self-test that exercises it, (3) patch the gate, (4) commit all four changes (lesson, fixture, fix, atlas page if needed) together. Skip step 1 and you'll forget the lesson; skip step 2 and the gate can regress silently.

**Red gates are P0 blockers, not side-notes.** If `npm run check:atlas`, `:atlas:self-test`, or `:api-routes` is failing on `main`, do NOT commit changes to data-layer surfaces (`pages/api/**`, `lib/dataverse/**`, `lib/db/**`, `lib/services/{dynamics,database,execute-prompt}*`, `scripts/audit-*`, `docs/atlas/**`, `docs/APPLICATION_STATE_ATLAS.md`) until the gate is green. The fix is to make the gate green — adding to `ALLOWED_UNDOCUMENTED_*` requires a written justification and is a last resort, not a default. This rule applies regardless of which session caused the red state: a red gate on `main` is the rubric being violated *right now*, and "not my regression" is not a valid reason to proceed past it. Established 2026-05-08 after a two-session gap where the `wmkf_apprequestpersons` Atlas miss from S139 sat unfixed because each subsequent session classified it as out-of-scope.

---

## Project Overview

A multi-application document processing system using Claude AI for grant-related workflows. Built with Next.js and deployed on Vercel.

## Directory Structure

```
/
├── middleware.js               # Server-side auth gate (Edge Runtime, withAuth/jose)
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
| Multi-Perspective Evaluator | `multi-perspective-evaluator.js` | `/api/evaluate-multi-perspective` | 3-perspective evaluation with synthesis |
| Batch Phase I Summaries | `batch-phase-i-summaries.js` | `/api/process-phase-i` | Batch Phase I proposal processing |
| Batch Phase II Summaries | `batch-proposal-summaries.js` | `/api/process` | Batch Phase II proposal processing |
| Funding Analysis | `funding-gap-analyzer.js` | `/api/analyze-funding-gap` | NSF API integration for federal funding |
| Phase I Writeup | `phase-i-writeup.js` | `/api/process-phase-i-writeup` | Single Phase I writeup |
| Phase II Writeup | `phase-ii-writeup.js` | `/api/process` | Single Phase II writeup with Q&A |
| Reviewer Finder | `reviewer-finder.js` | `/api/reviewer-finder/*` | AI + database search for expert reviewers |
| Review Manager | `review-manager.js` | `/api/review-manager/*` | Post-acceptance review lifecycle management |
| Peer Review Summarizer | `peer-review-summarizer.js` | `/api/process-peer-reviews` | Analyze peer reviews |
| Expense Reporter | `expense-reporter.js` | `/api/process-expenses` | Receipt/invoice processing |
| Literature Analyzer | `literature-analyzer.js` | `/api/analyze-literature` | Research paper synthesis |
| Integrity Screener | `integrity-screener.js` | `/api/integrity-screener/*` | Screen applicants for research integrity |
| Dynamics Explorer | `dynamics-explorer.js` | `/api/dynamics-explorer/*` | Natural language CRM queries via agentic tool-use |
| Expertise Finder | `expertise-finder.js` | `/api/expertise-finder/*` | Match proposals to internal staff, consultants, and board members |
| Grant Reporting | `grant-reporting.js` | `/api/grant-reporting/*` | Interactive grant final report extraction with Dynamics auto-fill, goals assessment vs. original proposal, and Word export |
| Virtual Review Panel | `virtual-review-panel.js` | `/api/virtual-review-panel` | Multi-LLM review panel (Claude, GPT, Gemini, Perplexity) with claim verification + structured review + synthesis. Not in default grants; admin-assigned. |
| Phase I Dynamics (Test) | `phase-i-dynamics.js` | `/api/phase-i-dynamics/summarize` | Single-request Phase I summarization with writeback to `akoya_request.wmkf_ai_summary` + `wmkf_ai_run` audit row. Pre-flight overwrite guard. Not in nav — direct URL only. |

## Tech Stack

- **Frontend**: Next.js 14, React 18, Tailwind CSS 3.4
- **Backend**: Next.js API Routes
- **Authentication**: NextAuth.js with Azure AD + server-side middleware gate (see `docs/AUTHENTICATION_SETUP.md`)
- **AI**: Claude API (Anthropic)
- **Database**: Vercel Postgres
- **File Storage**: Vercel Blob
- **Deployment**: Vercel

## Environment Variables

Full list, defaults, rotation cadence, and diagnostics: **`docs/CREDENTIALS_RUNBOOK.md`**.

Required for any deployment:
- `CLAUDE_API_KEY`
- `POSTGRES_URL` (auto-set by Vercel Postgres)
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`
- `AUTH_REQUIRED` (kill switch; production fails closed unless `EMERGENCY_AUTH_BYPASS=true`)

Required for production-only paths:
- `CRON_SECRET` — `/api/cron/*` authentication
- `EXTERNAL_LINK_SECRET` — 32+ char HMAC for external-reviewer JWTs (separate from `NEXTAUTH_SECRET`)
- `VRP_ALLOWED_PROVIDERS` — Virtual Review Panel allowlist (intersects with configured API keys; production fails closed if unset; must include `claude`)
- `EXTERNAL_AZURE_AD_*` (tenant/client/secret) — applicant intake portal; provider only registers when all three are set, so staff-only deployments don't need them

Notable optional flags:
- `DYNAMICS_IMPERSONATION_ENABLED=true` — sends `MSCRMCallerID` on user-driven Dynamics writes; off by default for safe rollout (see `docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md`)
- `PROMPT_RESOLVER_STRICT=true` — disables bundled-prompt fallback for prompt-dev loops
- `WAVE1_BACKEND_SETTINGS` / `WAVE1_BACKEND_APP_ACCESS` / `WAVE1_BACKEND_PREFS` — Wave 1 backend dispatch flags

## Per-App Model Configuration

Defaults live in `shared/config/baseConfig.js` (`getModelForApp()`); admin can override per-app at runtime via `/admin` (persisted in `system_settings`). Per-app `CLAUDE_MODEL_<APP>` env vars also work as a static override.

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

## Authentication Architecture

Three-layer defense-in-depth:

1. **Server-side middleware** (`middleware.js`) — Edge Runtime `withAuth`/`jose` validates JWT before any HTML/JS is served. Unauthenticated users never see the app. Respects `AUTH_REQUIRED` kill switch. Excludes `/api/auth/*` and `/api/cron/*` (cron jobs authenticate via `CRON_SECRET`, not JWT).
2. **API route auth** (`lib/utils/auth.js`) — App-specific endpoints use `requireAppAccess(req, res, ...appKeys)` which combines CSRF origin check + auth + `is_active` check + app access in one call. Returns `{ profileId, session }` on success; sends 401/403 on failure. Uses in-memory cache with 2-min TTL (includes `isActive` flag). Disabled accounts blocked before superuser bypass. Infrastructure endpoints (auth, admin, health) use `requireAuth()` or `requireAuthWithProfile()`.
3. **Client-side guards** (`RequireAuth`, `RequireAppAccess`) — Defense in depth for navigation/UI.

**Important:** When adding new app-specific API endpoints, use `requireAppAccess(req, res, 'app-key')` with the correct app key from `appRegistry.js`. For infrastructure endpoints, use `requireAuthWithProfile()` for user-scoped data. Superuser-only routes use `requireSuperuser(req, res)` (returns `{ profileId }` or null after sending 401/403); the lower-level `getUserRole(profileId)` is available when a route needs role beyond just superuser. Never accept `profileId` from query/body params — derive it from `access.profileId` or the session.

### Dual-provider NextAuth (staff + applicants)

`pages/api/auth/[...nextauth].js` registers two providers: `azure-ad` (staff; sessions carry `azureId` / `profileId` / `dynamicsSystemuserId`) and `entra-external` (applicants, separate Entra External ID tenant, OTP-only; sessions carry `contactOid` / `contactEmail`; env-gated on `EXTERNAL_AZURE_AD_*`).

Sessions self-identify with `session.user.userType: 'staff' | 'applicant'` — branch on this, never infer from populated fields. Middleware enforces non-crossing both directions: staff sessions can't hit `/apply/*`, applicant sessions can't hit non-`/apply` routes. `/auth/signin` auto-dispatches to External ID OAuth when `callbackUrl` resolves to `/apply*`.

---

## Key Conventions

### Data Structures

All APIs return consistent structures:
- `result.formatted` - Main content/summary text
- `result.structured` - Extracted structured data objects
- `result.metadata` - File processing metadata

### Shared Components

Located in `shared/components/`. Notable: `Layout.js` (nav filtered by app access), `FileUploaderSimple.js`, `ResultsDisplay.js`, `RequireAppAccess.js`, `WelcomeModal.js`. API keys are server-side only — UI consumes `/api/api-capabilities` for boolean availability.

### Shared Config

Located in `shared/config/`:
- `appRegistry.js` - Single source of truth for app definitions (keys, names, routes, icons, categories)
- `baseConfig.js` - Per-app model configuration, `loadModelOverrides()` cache, `getModelForApp()` with DB override support

### Service Classes

Located in `lib/services/`. Source files are authoritative; entries below describe purpose at one-line resolution.

- `claude-reviewer-service.js` — legacy Claude wrapper with retry/fallback (new code uses `llm-client.js`)
- `discovery-service.js` — Multi-database literature search orchestration
- `deduplication-service.js` — Name matching, COI filtering
- `contact-enrichment-service.js` — 5-tier contact lookup
- `database-service.js` — Vercel Postgres operations; Wave 1 dispatch lives here
- `pubmed-service.js`, `arxiv-service.js`, `biorxiv-service.js`, `chemrxiv-service.js`, `orcid-service.js`, `serp-contact-service.js` — external research-DB clients
- `integrity-service.js`, `integrity-matching-service.js` — Integrity Screener orchestration + name matching
- `dynamics-service.js` — Dynamics 365 / Dataverse client (OAuth, OData, Dataverse Search, email activities, `updateIfEmpty`, `logAiRun`). Impersonation contract (`actingUserSystemId` + `MSCRMCallerID` + privilege intersection) is documented in `docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md`
- `graph-service.js` — Microsoft Graph (SharePoint files, listing/download, content search)
- `feedback-service.js`, `alert-service.js`, `notification-service.js`, `maintenance-service.js` — admin/monitoring services
- `prompt-resolver.js` — Fetches prompts from `wmkf_ai_prompt` (5-min cache, `{{var}}` interpolation). Falls back to bundled `.js` modules on Dynamics failure (60s cache TTL); `PROMPT_RESOLVER_STRICT=true` disables fallback
- `program-director-resolver.js` — Email → Dynamics `systemuser` bridge for Reviewer Finder's PD-filtered picker
- `llm-client.js` — Canonical Anthropic API wrapper (`complete()` + `stream()`). SSRF allowlist, abortable timeouts, 429/529 retry, single fallback-model swap, usage logging, API-key redaction. Replaced 14 ad-hoc fetch sites
- `dynamics-context.js` — AsyncLocalStorage restriction context for per-request scoping; legacy static-method shims deprecated but retained for unmigrated scripts
- `external-token.js` — HS256 HMAC JWT primitive for external-reviewer magic links; hash-only storage for cheap revocation
- `intake-draft-service.js`, `intake-audit-service.js` — Applicant intake portal (drafts with attachment JSONB ops; append-only sha256-hashed audit)
- `review-upload.js` — Shared `writeReviewFiles` core for staff and reviewer-self upload paths; SharePoint write + Dataverse PATCH + rollback on failure
- `execute-prompt.js` — Implementation of the Executor contract (`docs/EXECUTOR_CONTRACT.md`); mirrors the PA `ExecutePrompt` child flow
- `multi-llm-service.js`, `panel-review-service.js` — Virtual Review Panel (Claude / GPT / Gemini / Perplexity)
- `literature-search-service.js` — Multi-database literature search shared by Lit Analyzer + panel claim verification
- `settings-service.js` / `dataverse-settings-service.js` — Wave 1 `system_settings` (env: `WAVE1_BACKEND_SETTINGS`)
- `app-access-service.js` / `dataverse-app-access-service.js` — Wave 1 `user_app_access` (env: `WAVE1_BACKEND_APP_ACCESS`)
- `dataverse-prefs-service.js` — Wave 1 `user_preferences` adapter (env: `WAVE1_BACKEND_PREFS`)
- `dataverse-identity-map.js`, `dynamics-identity-service.js` — `user_profiles` ↔ Dynamics `systemuser` bridge; reconciliation CLI at `scripts/reconcile-dynamics-identities.js`
- `model-override-loader.js` — Per-app model overrides for `baseConfig.js`

Located in `lib/external/` (external-reviewer flow):
- `token-lifecycle.js` — `mintAndStore` / `revoke` / `ensureToken` (idempotent) / `extendForPostSubmissionWindow` / `buildExternalUrl`
- `verify-suggestion-token.js` — Combined JWT + suggestion-row check; discriminated result with reason codes
- `reviewer-materials.js` — Enforces "files outside `Reviewer_Downloads/` are invisible to reviewers" at list + download
- `review-form-schema.js` — 4 structured fields (affiliation, impact, risk, overallRating); supports `{ partial: true }` validation

### Utility Classes

Located in `lib/utils/`:
- `cron-auth.js` - Vercel cron secret verification
- `auth-policy.js` - Edge-compatible `isAuthRequired()` shared between `middleware.js` and `lib/utils/auth.js`. Reads only `process.env`, no Node-only imports. Production fails closed unless `EMERGENCY_AUTH_BYPASS=true`. Misconfig warnings memoized once per process.
- `health-checker.js` - Reusable health check logic (7 services incl. Microsoft Graph)
- `file-loader.js` - Shared FileRef loader (upload/SharePoint → PDF/DOCX text) used by Grant Reporting and Phase I Dynamics
- `sharepoint-buckets.js` - `getRequestSharePointBuckets(requestId, requestNumber)` — walks active + archive libraries for a request
- `cycle-code.js` - Grant cycle code helpers (`Jxx`/`Dxx` from June/December meeting dates). `meetingDateToCycleCode(d)`, `parseCycleCode(s)`, `cycleCodeToOdataFilter(code, field)` for Dataverse range queries.

---

## Database Schema

Vercel Postgres. Authoritative source: `lib/db/schema.sql` + `lib/db/migrations/*.sql`. Run `node scripts/setup-database.js` to apply.

| Table | Purpose |
|-------|---------|
| `user_profiles` | Identity (azure_id, azure_email, is_active, dynamics_systemuser_id) |
| `user_preferences` | Per-user settings; values encrypted (AES-256-GCM) when `is_encrypted` |
| `user_app_access` | Per-user app grants `(user_profile_id, app_key)`; app_key matches `appRegistry.js` |
| `system_settings` | Generic key-value (model overrides, etc.) |
| `researchers`, `publications`, `grant_cycles` | Reviewer Finder shared pool |
| `proposal_searches`, `reviewer_suggestions` | Reviewer Finder per-user state |
| `retractions`, `integrity_screenings`, `screening_dismissals` | Integrity Screener (Retraction Watch + per-user history) |
| `dynamics_feedback` | Dynamics Explorer thumbs + auto-detected failures |
| `expertise_roster`, `expertise_matches` | Expertise Finder roster + match history |
| `panel_reviews`, `panel_review_items` | Virtual Review Panel persistence |
| `intake_drafts`, `intake_audit` | Applicant intake portal — drafts (Postgres-only, cleared on submit) + sha256-hashed audit |
| `system_alerts`, `health_check_history`, `maintenance_runs` | Monitoring + cron job audit trail |

User-scoping convention: shared tables for organization-wide reference data; per-user tables for "my X" surfaces. Wave 1 migration (in progress) moves `system_settings`, `user_app_access`, `user_preferences` to Dataverse — see `docs/POSTGRES_TO_DATAVERSE_MIGRATION.md`.

---

## API Endpoints

The full route catalogue lives in **`docs/API_ROUTE_SECURITY_MATRIX.md`** (76 routes, CI-gated via `npm run check:api-routes` — PRs touching `pages/api/**` fail without a matrix update). Source files in `pages/api/<app>/` are authoritative for behavior.

Conventions:
- App-specific routes use `requireAppAccess(req, res, 'app-key')`. App keys live in `shared/config/appRegistry.js`.
- Infrastructure routes use `requireAuth()` / `requireAuthWithProfile()` / `requireSuperuser()`.
- `/api/cron/*` authenticates via `CRON_SECRET`, not session JWT.
- `/api/external/*` token-authenticated (HMAC JWT); public, allowlisted in `middleware.js`. See `docs/EXTERNAL_REVIEWER_INTAKE_PLAN.md`.
- Streaming endpoints use SSE; convention is `text/event-stream` with `data: {...}` frames.

---

## Extended Documentation

Operational docs to know about (others in `docs/` are design backdrop, roadmaps, or point-in-time audits — find via grep when relevant):

- **`docs/EXECUTOR_CONTRACT.md`** — shared spec PA `ExecutePrompt` and Vercel `executePrompt()` both implement. Read before any prompt work.
- **`docs/API_ROUTE_SECURITY_MATRIX.md`** — 76-route catalogue, CI-gated.
- **`docs/SECURITY_OPERATING_PLAN.md`** — weekly/monthly/quarterly security cadence + watch-item escalation thresholds.
- **`docs/CREDENTIALS_RUNBOOK.md`** — env vars, secret rotation, diagnostics.
- **`docs/AUTHENTICATION_SETUP.md`** — Azure AD configuration.
- **`docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md`** — `MSCRMCallerID` impersonation contract + privilege intersection.
- **`docs/EXTERNAL_REVIEWER_INTAKE_PLAN.md`** — token primitive, magic-link landing, SharePoint upload flow.
- **`docs/INTAKE_PORTAL_DESIGN.md`** — applicant intake portal pilot (mid-June 2026 Phase II Research).
- **`docs/POSTGRES_TO_DATAVERSE_MIGRATION.md`** — Wave 1+ migration plan.
- **`docs/GRANT_CYCLE_LIFECYCLE.md`** — proposal lifecycle stages, statuses, triggers.
- **`DEVELOPMENT_LOG.md`** — session-by-session history.
- **`docs/guides/`** — user-facing guides (one per app).
- **`modules/expertise_matching/CLAUDE.md`** — Expertise Finder module rules + matching procedures.
