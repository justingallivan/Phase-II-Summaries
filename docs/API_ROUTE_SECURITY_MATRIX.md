# API Route Security Matrix

Last updated: 2026-05-04

## Purpose

This document is the living authorization inventory for `pages/api`. It is meant to do two jobs:

1. Capture the current access-control posture route by route.
2. Provide a recurring control so new routes, changed routes, and data-scope assumptions are reviewed consistently.

The matrix focuses on authorization and data ownership. It does not replace dependency scanning, secret scanning, CSP/header review, or AI data-minimization review.

## Access Classes

| Class | Meaning | Expected Guard |
|---|---|---|
| Public metadata | Safe to expose without a session. Should not reveal sensitive business data. | None, explicit rationale required |
| NextAuth | Framework-owned authentication endpoints. | NextAuth handler or `getServerSession` |
| Authenticated | Any signed-in user may call it. Use only for low-sensitivity shared utilities. | `requireAuth` |
| Profile | Signed-in user must have a linked active profile. User-owned data must be scoped to that profile. | `requireAuthWithProfile` |
| App | Signed-in user must have access to the named app. User-owned data must still be scoped where applicable. | `requireAppAccess(req, res, appKey)` |
| Superuser | Linked profile plus `dynamics_user_roles.role = 'superuser'`. | `requireAuthWithProfile` plus role check |
| Cron | Vercel scheduled/background endpoint. | `verifyCronSecret` |
| External token | Public magic-link route scoped by the token payload and server-side token verification. | `verifySuggestionToken` |

## Resolved Baseline Findings

These findings were identified in the first matrix pass and addressed in the follow-up hardening commits:

| Finding | Disposition | Current Control |
|---|---|---|
| P1: `/api/user-profiles` allowed standalone profile creation | Fixed | `POST` is no longer supported. Profile creation flows through `/api/auth/link-profile` during first-login Entra linking. |
| P1: `/api/blob-proxy` was authenticated but not ownership scoped | Accepted / documented | Blob proxy is explicitly limited to shared organizational assets. Future user-owned blob flows must use record-aware endpoints. |
| P1: `/api/review-manager/download-review` used app access rather than record ownership | Accepted / documented | Review Manager is a staff-shared workflow. `review-manager` access intentionally grants shared review-file access. |
| P2: Dynamics bypass routes needed explicit data boundaries | Fixed by documentation | Bypass routes now include inline data-boundary annotations describing org-wide, role-gated, PD-derived, or staff-shared scope. |
| P2: Superuser checks were duplicated | Fixed | Shared `requireSuperuser(req, res)` and `getUserRole(profileId)` helpers now live in `lib/utils/auth.js`; admin routes were migrated. |
| P3: `/api/auth/status` public contract could drift | Fixed by documentation | Endpoint is intentionally public and pinned to `{ enabled: boolean }` only. |

There are no open findings from the initial matrix pass as of this update. New findings should be added above the route matrix with priority, file/line references, disposition, and owner question. Medium-risk route notes in the matrix remain useful policy checkpoints, especially where an app intentionally has staff-wide access to Dynamics, SharePoint, reviewer, or file data.

## Route Matrix

| Route | Methods | Intended Class | Current Guard | Data Scope | Risk | Notes |
|---|---:|---|---|---|---|---|
| `/api/admin/alerts` | GET, PATCH | Superuser | `requireSuperuser` | Global admin | Low | Shared helper. |
| `/api/admin/health-history` | GET | Superuser | `requireSuperuser` | Global admin | Low | Shared helper. |
| `/api/admin/maintenance` | GET | Superuser | `requireSuperuser` | Global admin | Low | Shared helper. |
| `/api/admin/models` | GET, PUT | Superuser | `requireSuperuser` | Global admin | Low | Also calls Anthropic model list. |
| `/api/admin/reconcile-identities` | POST | Superuser | `requireSuperuser` | Global admin | Low | Manual equivalent of cron reconciliation. |
| `/api/admin/secrets` | GET, PUT | Superuser | `requireSuperuser` | Global admin | Low | Tracks metadata, not secret values. |
| `/api/admin/stats` | GET | Superuser | `requireSuperuser` | Global admin | Low | Usage statistics across users. |
| `/api/analyze-funding-gap` | POST | App | `requireAppAccess('funding-gap-analyzer')` | Request payload | Low | AI payload review still needed. |
| `/api/analyze-literature` | POST | App | `requireAppAccess('literature-analyzer')` | Request payload | Low | External research APIs / AI payload review. |
| `/api/api-capabilities` | GET | Authenticated | `requireAuth` | Shared metadata | Low | Authenticated capability metadata. |
| `/api/app-access` | GET, POST, DELETE | Profile / Superuser | `requireAuthWithProfile` + `getUserRole` | Own grants; all grants for superuser | Low | Superuser branch uses shared role helper. |
| `/api/auth/[...nextauth]` | Framework | NextAuth | NextAuth callbacks | Session/profile linking | Medium | Identity linking remains a strategic hardening area. |
| `/api/auth/link-profile` | POST | NextAuth linking | `getServerSession` + `needsLinking` | Matching Azure email | Low | Server-derived identity, email match enforced. |
| `/api/auth/status` | GET | Public metadata | None | None | Low | Intentionally public if needed pre-login. |
| `/api/blob-proxy` | GET | Authenticated | `requireAuth` | Shared organizational blob assets only | Low | Host allowlist is the boundary; do not extend to user-owned blobs. |
| `/api/cron/health-check` | GET, POST | Cron | `verifyCronSecret` | Global operational | Low | Stores health history and alerts. |
| `/api/cron/log-analysis` | GET, POST | Cron | `verifyCronSecret` | Vercel logs | Low | Review redaction expectations. |
| `/api/cron/maintenance` | GET, POST | Cron | `verifyCronSecret` | Global operational | Low | Retention/cleanup job. |
| `/api/cron/reconcile-identities` | GET, POST | Cron | `verifyCronSecret` | Global identity | Low | Background identity sync. |
| `/api/cron/secret-check` | GET, POST | Cron | `verifyCronSecret` | Secret metadata | Low | Expiration metadata only. |
| `/api/cron/spend-check` | GET, POST | Cron | `verifyCronSecret` | Usage/spend logs | Low | Global monitoring. |
| `/api/dynamics-explorer/chat` | POST | App | `requireAppAccess('dynamics-explorer')` | Org-wide CRM exploration shaped by Dynamics role and restrictions | Medium | Data boundary documented inline; AI minimization remains separate review area. |
| `/api/dynamics-explorer/download-document` | GET | App | `requireAppAccess('dynamics-explorer')` | Dynamics/SharePoint restrictions | Medium | Boundary documented inline. |
| `/api/dynamics-explorer/feedback` | GET, POST, PATCH | App / Superuser | POST uses app access; GET/PATCH require superuser | Feedback records | Low | Mixed route; current split is reasonable. |
| `/api/dynamics-explorer/restrictions` | GET, POST, DELETE | App / Role | `requireAppAccess('dynamics-explorer')` + `getUserRole` | Restriction config | Low | Read/write role handling in route. |
| `/api/dynamics-explorer/roles` | GET, POST, DELETE | App / Superuser | `requireAppAccess('dynamics-explorer')` + `getUserRole` | Own role or all roles | Low | Shared role helper. |
| `/api/evaluate-multi-perspective` | POST | App | `requireAppAccess('multi-perspective-evaluator')` | Request payload | Low | AI payload review. |
| `/api/expertise-finder/batch-match` | POST | App | `requireAppAccess('expertise-finder')` | Writes `user_profile_id` | Low | User-scoped usage/history writes. |
| `/api/expertise-finder/history` | GET | App | `requireAppAccess('expertise-finder')` | `user_profile_id` scoped | Low | Good scoping pattern. |
| `/api/expertise-finder/match` | POST | App | `requireAppAccess('expertise-finder')` | Writes `user_profile_id` | Low | User-scoped usage/history writes. |
| `/api/expertise-finder/proposals` | GET | App | `requireAppAccess('expertise-finder')` | App-wide Dynamics proposal lookup | Medium | Staff-wide visibility policy checkpoint. |
| `/api/expertise-finder/roster` | GET, POST, PATCH, DELETE | App | `requireAppAccess('expertise-finder')` | Shared roster | Medium | Shared mutable roster; confirm app-level access is sufficient. |
| `/api/external/review/[token]/context` | GET | External token | `verifySuggestionToken` | Token-scoped suggestion/request | Low | Public route protected by magic link verification. |
| `/api/external/review/[token]/proposal` | GET | External token | `verifySuggestionToken` | Token-scoped proposal files | Medium | High-sensitivity payload; keep token tests strong. |
| `/api/external/review/[token]/upload` | POST | External token | `verifySuggestionToken` | Token-scoped upload | Low | Good candidate for replay/expiry regression tests. |
| `/api/grant-reporting/extract` | POST | App | `requireAppAccess('grant-reporting')` | Request payload / Dynamics | Medium | AI and Dynamics data-boundary review. |
| `/api/grant-reporting/lookup-grant` | POST | App | `requireAppAccess('grant-reporting', 'batch-phase-i-summaries')` | Staff app-wide Dynamics/SharePoint lookup by request number | Medium | Boundary documented inline. |
| `/api/health` | GET | Authenticated | `requireAuth` | Service status | Low | Avoid exposing to unauthenticated users. |
| `/api/integrity-screener/dismiss` | POST, GET disallowed | App | `requireAppAccess('integrity-screener')` | Service layer | Low | Method parsing looks safe; confirm service-level scope. |
| `/api/integrity-screener/history` | GET, PATCH | App | `requireAppAccess('integrity-screener')` | `access.profileId` passed to service | Low | Good scoping pattern if service enforces it. |
| `/api/integrity-screener/screen` | POST | App | `requireAppAccess('integrity-screener')` | `access.profileId` passed to service | Low | AI/search payload review. |
| `/api/phase-i-dynamics/summarize` | POST | App | `requireAppAccess('batch-phase-i-summaries')` | App-wide request ID writeback | Medium | Writes AI summary by request GUID; policy checkpoint for who may target records. |
| `/api/phase-i-dynamics/summarize-v2` | POST | App | `requireAppAccess('batch-phase-i-summaries')` | App-wide request ID writeback | Medium | Shared executor path; policy checkpoint for who may target records. |
| `/api/process` | POST | App | `requireAppAccess('batch-proposal-summaries', 'phase-ii-writeup')` | Request payload | Low | AI payload review. |
| `/api/process-expenses` | POST | App | `requireAppAccess('expense-reporter')` | Request payload | Low | File/data minimization review. |
| `/api/process-legacy` | POST | App | `requireAppAccess('batch-proposal-summaries', 'phase-ii-writeup')` | Request payload | Low | Legacy route; consider retirement date. |
| `/api/process-peer-reviews` | POST | App | `requireAppAccess('peer-review-summarizer')` | Request payload | Low | AI payload review. |
| `/api/process-phase-i` | POST | App | `requireAppAccess('batch-phase-i-summaries')` | Request payload | Low | AI payload review. |
| `/api/process-phase-i-writeup` | POST | App | `requireAppAccess('phase-i-writeup')` | Request payload | Low | AI payload review. |
| `/api/qa` | POST | App | `requireAppAccess('phase-ii-writeup', 'batch-proposal-summaries')` | Request payload | Low | AI payload review. |
| `/api/refine` | POST | App | `requireAppAccess('phase-ii-writeup', 'batch-proposal-summaries')` | Request payload | Low | AI payload review. |
| `/api/review-manager/download-review` | GET | App | `requireAppAccess('review-manager')` | Staff-shared review-manager access | Low | Boundary documented inline; tighten to PD-only only if policy changes. |
| `/api/review-manager/mark-received-no-file` | POST | App | `requireAppAccess('review-manager')` | Staff-shared review-manager access | Medium | Token/review lifecycle action. |
| `/api/review-manager/regenerate-token` | POST | App | `requireAppAccess('review-manager')` | Staff-shared review-manager access | Medium | Token lifecycle action. |
| `/api/review-manager/render-emails` | POST | App | `requireAppAccess('review-manager')` | Staff-shared review-manager access | Medium | Token generation and email content review. |
| `/api/review-manager/reviewers` | GET, PATCH | App | `requireAppAccess('review-manager')` | Staff-shared review-manager access with PD listing convenience | Medium | Boundary documented inline. |
| `/api/review-manager/revoke-token` | POST | App | `requireAppAccess('review-manager')` | Staff-shared review-manager access | Medium | Token lifecycle action. |
| `/api/review-manager/send-emails` | POST | App | `requireAppAccess('review-manager')` | Staff-shared review-manager access | Medium | Boundary documented inline; sends email and mints/uses tokens. |
| `/api/review-manager/upload-review` | POST | App | `requireAppAccess('review-manager')` | Staff-shared review-manager access | Medium | Staff upload path. |
| `/api/reviewer-finder/analyze` | POST | App | `requireAppAccess('reviewer-finder')` | `access.profileId` passed | Low | Existing auth tests cover representative route. |
| `/api/reviewer-finder/discover` | POST | App | `requireAppAccess('reviewer-finder')` | `access.profileId` passed | Low | External discovery APIs / AI review. |
| `/api/reviewer-finder/enrich-contacts` | POST | App | `requireAppAccess('reviewer-finder')` | Request payload | Low | Rate-limited; server-side credentials only. |
| `/api/reviewer-finder/contact-history` | GET | App | `requireAppAccess('reviewer-finder')` | Org-visible Dataverse data; reads junction + projectleader for `?contactId=<guid>` | Low | UNION read of `wmkf_apprequestperson` + `akoya_request._wmkf_projectleader_value`. No write side. |
| `/api/reviewer-finder/extract-summary` | POST | App | `requireAppAccess('reviewer-finder')` | `proposal_id` scoped by `user_profile_id` | Low | Good scoping pattern. |
| `/api/reviewer-finder/generate-emails` | POST | App | `requireAppAccess('reviewer-finder')` | `user_profile_id` scoped | Low | Existing cross-user tests cover representative behavior. |
| `/api/reviewer-finder/grant-cycles` | GET, POST, PATCH, DELETE | App | `requireAppAccess('reviewer-finder')` | Shared grant cycles | Medium | Shared mutable records; confirm app-level access is enough. |
| `/api/reviewer-finder/load-proposal` | POST | App | `requireAppAccess('reviewer-finder')` | App-wide proposal file load by request ID | Medium | Policy checkpoint for who may load proposal source files. |
| `/api/reviewer-finder/my-candidates` | GET, PATCH, DELETE | App | `requireAppAccess('reviewer-finder')` | Org-visible Dataverse data; PD filter is UX default | Medium | Boundary documented inline. |
| `/api/reviewer-finder/my-proposals` | GET | App | `requireAppAccess('reviewer-finder')` | Caller Azure email -> PD | Low | Good identity-derived scope pattern. |
| `/api/reviewer-finder/researchers` | GET, POST, PATCH, DELETE | App | `requireAppAccess('reviewer-finder')`; some admin subpaths check superuser | Mixed shared/user | Medium | Needs endpoint-level sub-action review. |
| `/api/reviewer-finder/save-candidates` | POST | App | `requireAppAccess('reviewer-finder')` | Trusted internal Dataverse writeback by request ID | Medium | Policy checkpoint for who may write candidate suggestions to a request. |
| `/api/test-email` | POST | App | `requireAppAccess('dynamics-explorer')` | Caller email | Low | Consider moving under admin/test namespace or disabling in prod if not needed. |
| `/api/upload-file` | POST | Authenticated | `requireAuth` | Uploaded file only | Medium | Any authenticated user can upload; consider app-specific upload routes. |
| `/api/upload-handler` | POST | Authenticated | `requireAuth` | Blob upload token | Medium | Any authenticated user can request blob upload token. |
| `/api/user-preferences` | GET, POST, PUT, DELETE | Profile | `requireAuthWithProfile` | `profileId` | Low | Intended user-owned settings. |
| `/api/user-profiles` | GET, PATCH, DELETE | Profile / Superuser | `requireAuthWithProfile`; `?all=true` uses `getUserRole` | Own profile; all profiles for superuser | Low | `POST` intentionally unsupported; profile creation flows through `/api/auth/link-profile`. |
| `/api/virtual-review-panel` | GET, POST | App | `requireAppAccess('virtual-review-panel')` | Request payload | Low | AI payload review. |

## Regular Maintenance Process

### On every PR that touches `pages/api`

- Add or update the row in this matrix.
- State the intended access class in the PR description.
- Link the guard used in code.
- State the data boundary: own profile, app-wide, superuser global, token-scoped, cron-only, or intentionally public.
- Add or update tests when the route reads/writes user data, external reviewer data, tokens, files, CRM records, or admin settings.
- Treat new unlisted API routes as release-blocking once the route-inventory CI check exists.

### Weekly review

- Review Dependabot, CodeQL, Trivy, and Gitleaks results.
- Review health, secret, spend, and cron alerts.
- Review any owner questions or ambiguous matrix rows that were raised during PR review.

### Monthly review

- Re-run an API route inventory and compare it to this matrix.
- Confirm public routes are still intentionally public.
- Confirm app-level access still maps to current operational roles.
- Review high-sensitivity routes: external reviewer token routes, file downloads, profile/admin routes, and Dynamics bypass routes.

## Current Automation

`npm run check:api-routes` runs `scripts/check-api-route-security-matrix.js`. The script scans `pages/api/**/*.js` and fails when any API route is missing from this matrix. It also warns when a route does not contain one of the recognized guard tokens, unless the route is explicitly documented with `Current Guard = None`.

Recognized guard tokens:

- `requireAuth`
- `requireAuthWithProfile`
- `requireAppAccess`
- `requireSuperuser`
- `verifyCronSecret`
- `verifySuggestionToken`
- `getServerSession`
- `NextAuth`

The check runs in `.github/workflows/test.yml` before Jest. It should not try to prove authorization correctness. Its job is to prevent unreviewed routes from appearing silently.
