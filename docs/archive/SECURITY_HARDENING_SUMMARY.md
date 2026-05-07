# Security Hardening Implementation Summary

**Date:** March 10, 2026
**Source:** `docs/Easy_Wins.md` security review roadmap
**Commit:** `c2be638`

---

## Overview

This implements the actionable "Easy Win" and "Medium Effort" items from the independent security review. P0/P1 code vulnerabilities (profile linking, user scoping, SSRF) were already fixed in prior sessions. This work adds **regression tests**, **CI security tooling**, a **centralized fetch wrapper**, and a **PR security checklist** to prevent regressions and catch future issues early.

Items that are IT-dependent (split app registrations, `Sites.Selected`, session hardening, certificate auth) are excluded.

---

## Part 1: Authorization Regression Tests

**73 new tests** across 4 files ensure every auth path is covered.

### Test Helper — `tests/helpers/auth-mock.js`

Shared mocking infrastructure that stubs `getServerSession` (next-auth) and `sql` (@vercel/postgres) with predictable presets:

| Preset | Behavior |
|--------|----------|
| `mockUnauthenticated()` | No session — triggers 401 |
| `mockAuthenticatedUser(profileId, appKeys[], opts)` | Valid session with specific app grants; optional `isSuperuser` |
| `mockDisabledUser(profileId)` | `is_active = false` — triggers 403 |
| `mockNoProfile()` | Azure AD session but no linked profile — triggers 403 |

Also provides `createMockReq()` and `createMockRes()` helpers with `jest.fn()` spies.

### Auth Unit Tests — `tests/unit/utils/auth.test.js` (17 tests)

Tests the three core auth functions from `lib/utils/auth.js`:

- **`requireAuth`**: unauthenticated → 401, CSRF origin mismatch → 403, valid session passes, server-to-server (no Origin) passes
- **`requireAuthWithProfile`**: no profile → 403, disabled user → 403, valid user returns profileId
- **`requireAppAccess`**: wrong app → 403, correct app passes, OR logic for multi-app endpoints, superuser bypass, disabled overrides superuser, CSRF on POST

### Route-Level Auth Tests — `tests/integration/auth-routes.test.js` (23 tests)

Imports 8 representative route handlers directly and verifies auth gating:

| Route | App Key | Checks |
|-------|---------|--------|
| `/api/reviewer-finder/analyze` | `reviewer-finder` | 401, 403, pass |
| `/api/reviewer-finder/generate-emails` | `reviewer-finder` | 401, 403, pass |
| `/api/review-manager/send-emails` | `review-manager` | 401, 403, pass |
| `/api/review-manager/reviewers` | `review-manager` | 401, 403, pass |
| `/api/dynamics-explorer/chat` | `dynamics-explorer` | 401, 403, pass |
| `/api/integrity-screener/screen` | `integrity-screener` | 401, 403, pass |
| `/api/admin/stats` | superuser-only | 401, 403 |
| `/api/app-access` (POST) | superuser-only | 401 |
| `/api/user-profiles` | profile-scoped | 401 (GET), 401 (PATCH) |

### Cross-User Isolation Tests — `tests/integration/cross-user-isolation.test.js` (2 tests)

Verifies that user-scoped DB queries correctly filter by `profileId`:

- **`send-emails`**: User B queries for User A's suggestion IDs → gets "No reviewers found" (empty result set)
- **`generate-emails`**: User B's `markAsSent` UPDATE includes `user_profile_id` filter, preventing cross-user mutation

---

## Part 2: Centralized Fetch Wrapper (`safeFetch`)

### `lib/utils/safe-fetch.js`

Standardized outbound `fetch()` with host allowlisting to prevent SSRF:

```js
import { safeFetch, isAllowedUrl } from '../../lib/utils/safe-fetch';
```

**Security properties:**
- Requires HTTPS — rejects `http://` URLs
- Allowlists 17 trusted host patterns (RegExp matching)
- Blocks cloud metadata (`169.254.169.254`), localhost, internal IPs, arbitrary external hosts

**Allowed hosts:**

| Category | Hosts |
|----------|-------|
| Microsoft | `graph.microsoft.com`, `login.microsoftonline.com`, `wmkf.crm.dynamics.com`, `appriver3651007194.sharepoint.com` |
| Vercel | `*.public.blob.vercel-storage.com`, `api.vercel.com` |
| Anthropic | `api.anthropic.com` |
| Research | `eutils.ncbi.nlm.nih.gov`, `pub.orcid.org`, `api.openalex.org`, `export.arxiv.org`, `api.biorxiv.org`, `api.semanticscholar.org`, `serpapi.com`, `chemrxiv.org` |
| Federal | `api.nsf.gov`, `api.reporter.nih.gov` |

### Tests — `tests/unit/utils/safe-fetch.test.js` (31 tests)

- 17 allowed URL cases (one per host)
- 7 blocked SSRF vectors (metadata, localhost, loopback, internal IP, arbitrary, similar-sounding, subdomain attack)
- Protocol enforcement (HTTP rejected, invalid URLs rejected)
- Options pass-through verified
- `isAllowedUrl()` helper tested separately

### Migration

| File | Change |
|------|--------|
| `pages/api/reviewer-finder/generate-emails.js` | Replaced inline `isAllowedBlobUrl` + raw `fetch` with `safeFetch`/`isAllowedUrl` |
| `pages/api/review-manager/send-emails.js` | Replaced inline `isAllowedBlobUrl` + raw `fetch` with `safeFetch`/`isAllowedUrl` |
| `docs/SECURITY_ARCHITECTURE.md` | Added §7.5.1 documenting the pattern and allowed hosts |

**Future migration:** Other services (dynamics-service, graph-service, literature APIs) can be migrated incrementally. The inline SSRF checks are removed from the two email routes; all other `fetch` calls remain unchanged for now.

---

## Part 3: CI Security Pipelines

Four new GitHub Actions workflows:

| Workflow | File | Trigger | Purpose |
|----------|------|---------|---------|
| **Gitleaks** | `.github/workflows/gitleaks.yml` | PR + push to main | Secret scanning (API keys, tokens, passwords in commits) |
| **Trivy** | `.github/workflows/trivy.yml` | PR + push + weekly Monday 8am | Dependency CVE scanning (HIGH/CRITICAL severity) |
| **CodeQL** | `.github/workflows/codeql.yml` | PR + push + weekly Monday 6am | JavaScript static analysis (dataflow, taint tracking) |
| **Jest** | `.github/workflows/test.yml` | PR + push to main | Runs `npm run test:ci` (all 138+ tests with coverage) |

These complement the existing Semgrep token audit workflow (`.github/workflows/security-scan.yml`).

---

## Part 4: PR Security Checklist

**`.github/pull_request_template.md`** — automatically populates new PRs with:

- [ ] Auth required (`requireAppAccess` or `requireAuthWithProfile`)
- [ ] Cross-user access blocked (queries scoped by `profileId` from session)
- [ ] SSRF considered (outbound fetch uses `safeFetch` or validates URLs)
- [ ] Output redaction considered (no tokens/secrets in responses or logs)
- [ ] Logging reviewed (no sensitive data in console output)

---

## Verification

| Check | Result |
|-------|--------|
| `npm run test:ci` | 138 pass, 1 pre-existing skip, 0 failures |
| `npm run build` | Success, no errors from modified files |
| Auth tests catch exact vulnerabilities fixed | Unauthenticated access, wrong app, disabled user, cross-user |
| `safeFetch` blocks SSRF vectors | `169.254.169.254`, `localhost`, `127.0.0.1`, `10.0.0.1`, arbitrary hosts |

---

## Files Created/Modified

### New Files (11)

| File | Lines | Purpose |
|------|-------|---------|
| `tests/helpers/auth-mock.js` | 163 | Auth mocking infrastructure |
| `tests/unit/utils/auth.test.js` | 197 | Auth utility unit tests |
| `tests/unit/utils/safe-fetch.test.js` | 100 | Safe-fetch unit tests |
| `tests/integration/auth-routes.test.js` | 234 | Route-level auth regression |
| `tests/integration/cross-user-isolation.test.js` | 177 | Cross-user isolation |
| `lib/utils/safe-fetch.js` | 71 | Centralized fetch wrapper |
| `.github/workflows/gitleaks.yml` | 16 | Secret scanning |
| `.github/workflows/trivy.yml` | 16 | Dependency scanning |
| `.github/workflows/codeql.yml` | 19 | Static analysis |
| `.github/workflows/test.yml` | 16 | Jest CI |
| `.github/pull_request_template.md` | 14 | PR checklist |

### Modified Files (3)

| File | Change |
|------|--------|
| `pages/api/reviewer-finder/generate-emails.js` | Migrated to `safeFetch`/`isAllowedUrl` |
| `pages/api/review-manager/send-emails.js` | Migrated to `safeFetch`/`isAllowedUrl` |
| `docs/SECURITY_ARCHITECTURE.md` | Added §7.5.1 (centralized fetch wrapper documentation) |
