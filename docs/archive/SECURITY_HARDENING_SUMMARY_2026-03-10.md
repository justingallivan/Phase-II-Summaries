# Security Hardening Summary — March 10, 2026

**Prepared for:** IT Security Review
**Application:** Research Review App Suite (Next.js / Vercel)
**Author:** Lead Developer

---

## What Happened

Over the past several sessions, the Research Review App Suite underwent a multi-tool security audit and hardening cycle. The process used three independent AI review tools (Gemini, Codex, Claude Code) to identify and fix vulnerabilities, then cross-checked each tool's findings against the others. Human review caught additional issues that all three tools missed.

This document summarizes the concrete code changes shipped, the residual items that require organizational decisions, and a proposed path forward.

---

## Code Changes Shipped

### Authentication & Identity

| Change | Files | Effect |
|--------|-------|--------|
| Immediate cache invalidation on account deactivation | `pages/api/user-profiles.js` | Disabled users are blocked within milliseconds, not after 2-min cache TTL |
| Remove silent email-based profile auto-linking | `pages/api/auth/[...nextauth].js` | New users confirm profile links via dialog instead of inheriting profiles silently |
| Fail-closed on identity DB error | `pages/api/auth/[...nextauth].js` | Sign-in blocked (not allowed) when the user database is unreachable |
| Profile directory enumeration — closed | `pages/api/user-profiles.js` | Default GET returns only the caller's own profile; full directory requires superuser; cross-user `?id=X` lookups return 403; identity fields (`azureId`, `azureEmail`) stripped from all responses |

### Egress & Input Validation

| Change | Files | Effect |
|--------|-------|--------|
| `safeFetch` SSRF allowlist | `lib/utils/safe-fetch.js`, 30+ call sites | All server-side HTTP egress routed through a single utility with host allowlist, HTTPS enforcement, and redirect validation |
| `safeFetch` redirect bypass fix | `lib/utils/safe-fetch.js` | Redirects to non-allowed hosts are blocked (previously could bypass the allowlist) |
| Upload endpoint hardening | `pages/api/upload-handler.js` | File size limits, MIME type validation, path traversal prevention |
| CSP tightening | `middleware.js` | Removed direct blob storage domain from `connect-src` now that all blob access goes through authenticated proxy |

### CRM Integration (Dynamics Explorer)

| Change | Files | Effect |
|--------|-------|--------|
| `$expand` sideloading bypass — fixed | `dynamics-service.js`, `chat.js` | Restriction checks now parse `$expand` clauses to prevent accessing restricted tables/fields via navigation properties |
| Restriction concurrency detection | `dynamics-service.js` | Request ID tracking detects module-level state leakage between concurrent requests |

### CI & Static Analysis

| Change | Files | Effect |
|--------|-------|--------|
| Semgrep security rules | `.semgrep/`, CI config | Custom rules flag raw `fetch` usage, token exposure patterns, and missing auth checks |
| Auth route test coverage | `tests/integration/auth-routes.test.js` | Automated tests verify all ~30 API endpoints enforce authentication and app-access controls |

---

## How the Audit Process Worked

We deliberately used multiple tools with different strengths to get broader coverage:

1. **Gemini** produced a structured audit (`COMPREHENSIVE_SECURITY_AUDIT_2026.md`) that identified 6 findings across auth and data handling. Three warranted code fixes; two were policy/governance concerns; one described intentional behavior.

2. **Codex** reviewed Gemini's findings and provided a three-tier triage (code bugs vs. hardening gaps vs. policy decisions). It also identified the user-profiles directory exposure that Gemini missed entirely.

3. **Claude Code** implemented the fixes, caught a `safeFetch` redirect bypass during implementation, and performed the endpoint scoping that closed the directory enumeration.

4. **Human review** caught the `?id=X` cross-user lookup gap that remained after the initial endpoint scoping — a case where all three AI tools had marked the issue as resolved.

This multi-perspective approach caught more than any single tool would have alone. Each tool had blind spots that the others covered.

---

## Items Requiring Organizational Decisions

These are not code defects — they are policy and governance decisions that IT and leadership need to weigh in on. We have documented our recommendations but cannot unilaterally resolve them.

### 1. SharePoint Permission Scope (Sites.Selected)

**The concern:** The original permission request asked for `Sites.Read.All` (all SharePoint sites). IT correctly flagged this as overly broad.

**Our proposal:** We revised the request to `Sites.Selected`, which grants zero access by default. An admin then authorizes the app for only the single akoyaGO SharePoint site via a one-time Graph API call. We also dropped the `Mail.Send` request entirely — email is handled through Dynamics CRM activities, not Graph.

**What we need from IT:** Grant `Sites.Selected` on the app registration and authorize it for the akoyaGO site. We can walk through this together. (`docs/IT_SECURITY_RESPONSE.md` has the detailed steps.)

### 2. Audit Log Sharing

**The concern:** IT needs visibility into who is using the system and what data they're accessing.

**Current state:** The app logs all API usage to `api_usage_log` (model, tokens, cost, latency per request) and all auth events. These are currently only visible through the admin dashboard.

**Our proposal:** Three options offered in `docs/IT_SECURITY_RESPONSE.md`:
- **Option A (recommended):** Scheduled export of audit logs to a shared location (SharePoint folder, Azure Blob, or email)
- **Option B:** Authenticated API endpoint IT can query on demand
- **Option C:** Read-only database connection string for direct SQL access

**What we need from IT:** Choose a delivery mechanism so we can build it.

### 3. CSRF Hardening (SEC-AUTH-002)

**The concern:** The CSRF validator allows requests through when both `Origin` and `Referer` headers are absent. This is intentional — it supports Vercel cron jobs and non-browser callers.

**Current state:** Modern browsers always send `Origin` on cross-origin POST requests, so the browser attack vector is theoretical. The headerless path exists for server-to-server callers.

**What we can do if IT requires it:** Add an explicit allowlist for non-browser callers (e.g., verify `CRON_SECRET` on cron routes) rather than allowing all headerless requests. This is a bounded piece of work if IT prioritizes it.

---

## Proposed Path Forward

The code-level hardening is substantially complete. The remaining work falls into three tracks:

### Track 1: Admin Actions (IT — no code changes needed)

These are permissions and configuration changes on IT's side:

- [ ] Grant `Sites.Selected` on the app registration + authorize for akoyaGO site
- [ ] Assign "Email Sender" security role to the app's Dynamics application user
- [ ] Choose an audit log delivery mechanism (Options A/B/C above)

We are available to pair on any of these and can provide the exact site IDs and Graph API calls needed.

### Track 2: Remaining Code Hardening (Development — next sprint)

Low-effort items that strengthen the security posture further:

- [ ] Upload attribution — replace hardcoded `'anonymous'` uploader identity with `session.profileId` for full audit trail
- [ ] CSRF allowlist for non-browser callers (if IT requests it)
- [ ] Expand integration test coverage for the new profile scoping paths
- [ ] Legacy upload endpoint cleanup — verify `upload-file.js` migration is complete and remove if so

### Track 3: Policy Decisions (Leadership + IT)

These require organizational input, not code:

- [ ] Conditional access policy testing (once IT confirms which policies apply)
- [ ] Formal security review sign-off on the app registration

---

## Reference Documents

| Document | Purpose |
|----------|---------|
| `docs/SECURITY_ARCHITECTURE.md` | Full architecture, data flows, and threat model (v3.3) |
| `docs/IT_SECURITY_RESPONSE.md` | Point-by-point response to IT's permission concerns |
| `docs/SECURITY_AUDIT_RESPONSE_GEMINI.md` | Response to Gemini audit findings |
| `docs/SECURITY_AUDIT_RESPONSE_CODEX.md` | Response to Codex triage annotations |
| `docs/CREDENTIALS_RUNBOOK.md` | Secret rotation procedures and diagnostics |
| `docs/PENDING_ADMIN_REQUESTS.md` | Exact admin steps needed from IT |

---

## Key Takeaway

The application-layer security work is done and tested. The remaining blockers are admin permissions and policy decisions that only IT and leadership can resolve. We'd like to schedule a 30-minute walkthrough to cover the `Sites.Selected` authorization, audit log delivery preference, and any remaining questions — so we can unblock SharePoint integration and move forward.
