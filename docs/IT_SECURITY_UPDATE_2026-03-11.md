# Security Architecture Update — March 11, 2026

**Prepared for:** IT Review
**Application:** Research Review App Suite (Next.js / Vercel)
**Previous update:** March 10, 2026 (Security Hardening Summary)
**Full architecture reference:** `docs/SECURITY_ARCHITECTURE.md` (v3.4, ~1,350 lines)

---

## Purpose

This document provides IT with a current snapshot of the application's security posture, summarizing the architecture, all hardening work completed since the last update, CI/CD security automation now in place, and the items still awaiting IT action.

---

## 1. Architecture Overview

### Deployment

| Component | Detail |
|-----------|--------|
| **Platform** | Vercel (serverless, auto-scaling) |
| **Runtime** | Node.js serverless functions — no persistent server process |
| **Frontend** | Next.js 14, React 18, server-side rendered |
| **Database** | Vercel Postgres (Neon) — TLS enforced, AES-256 at rest |
| **File Storage** | Vercel Blob — accessed via authenticated proxy only |
| **Region** | US East |
| **Applications** | 14 internal tools for grant review workflows |

### External Services

All outbound traffic is server-side only. No browser-to-external-service calls exist (all AI, CRM, and research API calls go through our API routes).

| Service | Purpose | Auth Method |
|---------|---------|-------------|
| Claude API (Anthropic) | AI processing for all 14 apps | API key (server-side) |
| Azure AD (Entra ID) | User SSO | OAuth 2.0 Authorization Code |
| Dynamics 365 CRM | Grant/contact data queries, email activities | OAuth 2.0 Client Credentials |
| Microsoft Graph API | SharePoint document access, email sending (future) | OAuth 2.0 Client Credentials |
| PubMed, ArXiv, BioRxiv, ChemRxiv | Literature search | API key or none |
| ORCID | Researcher identification | OAuth 2.0 Client Credentials |
| SerpAPI | Google Scholar / PubPeer search | API key |
| NSF, NIH, USAspending | Federal funding data | None (public APIs) |

### SSRF Protection

All server-side outbound HTTP requests are routed through a centralized `safeFetch` wrapper (`lib/utils/safe-fetch.js`) that:

- **Requires HTTPS** (rejects `http://` URLs)
- **Allowlists hosts** — only 17 known, trusted hostname patterns are permitted
- **Validates redirects** — follows redirects manually, checking each hop against the allowlist
- **Blocks** cloud metadata endpoints, localhost, internal IPs, and arbitrary external hosts

---

## 2. Authentication & Authorization

### Three-Layer Defense-in-Depth

| Layer | Where | What It Does |
|-------|-------|--------------|
| **1. Edge Middleware** | `middleware.js` (Vercel Edge Runtime) | Validates JWT before any HTML/JS is served. Unauthenticated users never see the app. |
| **2. API Route Auth** | `lib/utils/auth.js` | Every API endpoint calls `requireAppAccess()` (30+ app endpoints) or `requireAuthWithProfile()` (infrastructure). Combines CSRF + auth + profile + `is_active` + app-grant checks. |
| **3. Client-Side Guards** | React components | `RequireAppAccess` wrappers on all 14 app pages. Deny-by-default during loading. |

### Session Management

| Attribute | Detail |
|-----------|--------|
| Strategy | JWT (encrypted, not database-stored) |
| Max age | 8 hours |
| Idle timeout | 2 hours (tracked via `lastActivity` JWT claim; enforced in jwt callback + edge middleware) |
| Cookie flags | httpOnly, Secure, SameSite=Lax |
| Session refresh | `refetchOnWindowFocus` — refreshes on tab focus (no background polling) |
| Revocation | `is_active` flag checked on every request (2-min cache TTL). Disabled accounts blocked before superuser bypass. |

### App-Level Access Control

- Each user is granted access to specific apps via the `user_app_access` table
- New users receive only `dynamics-explorer` by default; all other apps require explicit superuser grant
- Superusers manage per-user grants via the admin dashboard

### CRM Access Control (Dynamics Explorer)

- Service principal authentication (client credentials) — user credentials never touch Dynamics
- Role-based access: `superuser`, `read_only` (default), `read_write` (reserved)
- Table/field restrictions enforced at **two layers**: chat handler (user-facing) + DynamicsService (defense-in-depth)
- Generic CRM write operations are **stubbed and throw errors**; the exception is email activity operations (create, attach, send) for reviewer invitation workflows, which require the "Email Sender" security role (pending IT action)
- Every query logged to `dynamics_query_log` with user, session, parameters, timing, and denial status

---

## 3. Security Controls Summary

### Transport & Encryption

| Control | Implementation |
|---------|---------------|
| HTTPS | Vercel auto-redirects HTTP to HTTPS, TLS 1.3 |
| HSTS | `max-age=31536000; includeSubDomains` on all routes |
| Database TLS | Enforced by Neon |
| API key storage | AES-256-GCM with per-value random IV and auth tag |
| Session encryption | JWT encrypted with `NEXTAUTH_SECRET` |
| Production guard | Encryption key required in production (hard fail if missing) |

### Security Headers

| Header | Value |
|--------|-------|
| Content-Security-Policy | Nonce-based, per-request. No `unsafe-inline` or `unsafe-eval` in production `script-src`. |
| X-Content-Type-Options | `nosniff` |
| X-Frame-Options | `DENY` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| X-Powered-By | Suppressed |
| X-Robots-Tag | `noindex, nofollow, noarchive` |

### Input Validation

| Control | Implementation |
|---------|---------------|
| SQL injection | All queries use parameterized `sql` template literals — zero string interpolation |
| XSS | React default escaping + nonce-based CSP |
| CSRF | Origin header validation on state-changing methods (POST/PUT/PATCH/DELETE) |
| File upload | Whitelist of allowed types, 50MB limit, path traversal prevention |
| Blob proxy | URL hostname pattern matching prevents SSRF |

### Rate Limiting

Five-tier application-level rate limiting (standard, strict, hourly, upload, aiProcessing) plus per-service external rate controls for all literature and federal APIs.

### Error Handling

- Production: generic error messages only (e.g., "Processing failed")
- Development: detailed `error.message` for debugging
- Server-side: full errors logged via `console.error()` in all cases

### Monitoring (4 Automated Cron Jobs)

| Job | Schedule | Purpose |
|-----|----------|---------|
| Maintenance | Daily 3:00 AM UTC | Database/blob cleanup with configurable retention |
| Health Check | Every 15 min | Monitors 7 services (DB, Claude, Azure AD, Dynamics, Encryption, Blob, Graph) |
| Secret Check | Daily 8:00 AM UTC | Alerts on approaching secret expiration (14-day, 7-day, expired tiers) |
| Log Analysis | Every 6 hours | Vercel error log analysis |

Cron endpoints authenticate via `CRON_SECRET` (excluded from JWT middleware). All results recorded in audit tables and surfaced on the admin dashboard.

---

## 4. Security Hardening Completed Since Last Update

The following changes have been implemented, tested, and deployed since the initial security architecture was established. All items marked "shipped" below are live in production.

### Authentication & Identity (Shipped)

| Change | Effect |
|--------|--------|
| Immediate cache invalidation on account deactivation | Disabled users blocked within milliseconds, not after 2-min cache TTL |
| Silent email-based profile auto-linking removed | New users confirm profile links via dialog instead of inheriting profiles silently |
| Fail-closed on identity DB error | Sign-in blocked when user database is unreachable |
| Profile directory enumeration closed | `GET /api/user-profiles` returns only caller's own profile; full directory requires superuser; cross-user `?id=X` returns 403; identity fields stripped |
| Production auth bypass guard | `requireAuthWithProfile()` returns 403 if auth bypass attempted in production |

### Egress & Input Validation (Shipped)

| Change | Effect |
|--------|--------|
| `safeFetch` SSRF allowlist | All server-side HTTP egress routed through single utility with 17-host allowlist and HTTPS enforcement |
| `safeFetch` redirect bypass fix | Redirects to non-allowed hosts are blocked (previously could bypass the allowlist) |
| Upload endpoint hardening | File size limits, MIME type validation, path traversal prevention |
| CSP tightening | Removed direct blob storage domain from `connect-src`; migrated to nonce-based per-request CSP |

### CRM Integration (Shipped)

| Change | Effect |
|--------|--------|
| `$expand` sideloading bypass fixed | Restriction checks now parse `$expand` clauses to prevent accessing restricted data via navigation properties |
| Restriction concurrency detection | Request ID tracking detects module-level state leakage between concurrent requests |
| Denial audit logging | Restriction violations logged with `was_denied = true` and denial reason for compliance tracking |

### Error Handling (Shipped)

| Change | Effect |
|--------|--------|
| ~19 catch blocks hardened | Inner helper functions return generic messages; re-thrown errors stripped of `error.message`; health endpoint guarded with `isDev` check |

### Token Trust Chain (Shipped)

| Change | Effect |
|--------|--------|
| Token exposure audit | All 3 token-holding files audited; 8 non-exposure paths verified (console, API responses, errors, database, session, Claude, third-party, health check) |
| `SECURITY` JSDoc guards | All `getAccessToken()` / `getGraphToken()` methods carry documentation that token must never be logged, returned, stored, or sent to third parties |

---

## 5. CI/CD Security Automation

Five security pipelines run on every PR and push to main:

| Pipeline | Tool | What It Catches |
|----------|------|-----------------|
| **Token Audit** | Semgrep (9 custom rules) | Token leakage to console, API responses, database, SSE, error messages, third-party services; client secret exposure; auth header serialization |
| **Secret Scanning** | Gitleaks | Credentials committed in source code |
| **Dependency CVEs** | Trivy (also weekly) | HIGH and CRITICAL vulnerabilities in npm dependencies |
| **Static Analysis** | CodeQL (also weekly) | JavaScript dataflow and taint tracking |
| **Test Suite** | Jest (121 passing) | Auth enforcement, SSRF protection, cross-user isolation, encryption |

### PR Security Checklist

A pull request template (`.github/pull_request_template.md`) requires authors to confirm: no secrets in diff, auth on new endpoints, parameterized SQL, and safeFetch for new outbound calls.

### Test Coverage Breakdown

| Test File | Tests | Coverage |
|-----------|-------|----------|
| Auth unit tests (`auth.test.js`) | 17 | Core auth functions |
| Auth integration tests (`auth-routes.test.js`) | 23 | Route-level enforcement for 8 representative endpoints |
| SSRF protection (`safe-fetch.test.js`) | 31 | 17 allowed URLs, 7 SSRF vectors, protocol enforcement |
| Cross-user isolation (`cross-user-isolation.test.js`) | 2 | Per-user data scoping |
| API key encryption (`apiKeyManager.test.js`) | 17 | Encrypt/decrypt/masking lifecycle |

---

## 6. Security Finding Status

### Critical Findings

| ID | Finding | Status |
|----|---------|--------|
| C1 | Client-side API key storage (Base64 in localStorage) | **Remediated** — localStorage fallback removed; keys require encrypted DB storage |
| C2 | Blob storage URLs publicly accessible | **Remediated** — authenticated proxy added; direct blob domain removed from CSP |
| C3 | Dynamics service principal should be scoped | **Pending IT action** — see Section 7 |

### Medium Findings

All 9 medium findings (M1–M9) have been **remediated**:
- M1: Encryption key dev fallback (hard fail in production)
- M2: Dynamics restrictions application-layer only (dual-layer enforcement)
- M3: Auth bypass allows profile switching (403 in production)
- M4: No HSTS header (added)
- M5: CORS wildcard on SSE routes (removed)
- M6: Internal error messages leaked (generic messages in production)
- M7: Reviewer suggestions wrong user profile ID (session-derived)
- M8: No CSRF protection (Origin header validation added)
- M9: Session revocation for disabled accounts (`is_active` check on every request)

### Low Findings

All 10 low findings (L1–L10) have been **remediated**, including blob retention policy, encryption key rotation tooling, audit log cleanup, nonce-based CSP, denial audit logging, and legacy NULL data cleanup.

---

## 7. Items Awaiting IT Action

### 7a. Grant `Sites.Selected` Permission

**What:** Add the `Sites.Selected` permission to the app registration and authorize it for the akoyaGO SharePoint site only.

**Why:** This replaces the original `Sites.Read.All` request with a zero-trust approach — the permission grants no access by default, and a one-time admin Graph API call authorizes the app for exactly one site.

**How:** One-time `POST /sites/{siteId}/permissions` Graph API call. We can walk through this together.

**Blocked feature:** SharePoint document access from within the application.

### 7b. Assign "Email Sender" Security Role in Dynamics

**What:** Assign the "Email Sender" security role to the app's Dynamics application user (App ID: `d2e73696-537a-483b-bb63-4a4de6aa5d45`).

**Why:** Currently receiving `403: Principal user is missing prvCreateActivity privilege` when attempting to send reviewer invitation emails through Dynamics CRM activities.

**Blocked feature:** Automated reviewer invitation emails.

### 7c. Scope Dynamics Service Principal (C3)

**What:** Create a custom security role `App - Document Processing (Read Only)` with Organization-level Read on only the ~19 tables the app queries. Assign to the service principal and remove any broader roles.

**Why:** Limits blast radius if `DYNAMICS_CLIENT_SECRET` is compromised.

**Current risk:** The service principal may have broader permissions than necessary.

### 7d. Choose Audit Log Delivery Mechanism

**What:** The app logs all API usage, auth events, and CRM queries. IT needs to choose how to receive this data.

**Options:**
- **A (recommended):** Scheduled export to a shared location (SharePoint folder, Azure Blob, or email)
- **B:** Authenticated API endpoint IT can query on demand
- **C:** Read-only database connection string for direct SQL access

### 7e. Formal Security Review Sign-off

**What:** Acknowledge the current security posture and approve the app registration.

---

## 8. Audit Process

The security hardening was driven by a multi-tool audit cycle using three independent AI review tools:

1. **Gemini** — produced the initial structured audit (6 findings across auth and data handling)
2. **Codex** — triaged Gemini's findings; identified the user-profiles directory exposure that Gemini missed
3. **Claude Code** — implemented all fixes; caught the `safeFetch` redirect bypass during implementation
4. **Human review** — caught the `?id=X` cross-user lookup gap that all three AI tools had marked as resolved

Each tool had blind spots the others covered. The combination caught more than any single tool would have alone.

All findings, responses, and implementation details are documented in:

| Document | Content |
|----------|---------|
| `docs/SECURITY_ARCHITECTURE.md` | Full architecture, data flows, threat model (v3.4) |
| `docs/SECURITY_HARDENING_SUMMARY_2026-03-10.md` | Previous hardening summary sent to IT |
| `docs/IT_SECURITY_RESPONSE.md` | Point-by-point response to IT's permission concerns |
| `docs/CREDENTIALS_RUNBOOK.md` | Secret rotation procedures and diagnostics |
| `docs/PENDING_ADMIN_REQUESTS.md` | Step-by-step admin instructions for IT |

---

## 9. Summary

**What's working:** The application-layer security is substantially hardened — three-layer auth, SSRF protection, nonce-based CSP, encrypted API key storage, per-user data scoping, dual-layer CRM access control, comprehensive audit logging, 5 CI security pipelines, and 121 automated tests. All 22 security findings from the multi-tool audit have been remediated except C3 (Dynamics service principal scoping), which requires IT admin action.

**What's blocked on IT:** SharePoint document access (7a), automated reviewer emails (7b), Dynamics least-privilege scoping (7c), audit log delivery (7d), and formal sign-off (7e).

**Next step:** DFT grants the access that was discussed with William Cumming last week, or provides a clear path forward in a timely fashion.

---

*Generated March 11, 2026. For the full technical architecture, see `docs/SECURITY_ARCHITECTURE.md`.*
