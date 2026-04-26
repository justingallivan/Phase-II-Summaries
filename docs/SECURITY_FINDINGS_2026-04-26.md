# Security Findings - 2026-04-26

This document collects findings from the OWASP-oriented review and the credential/sensitive-data leak review. Findings are ordered by priority.

## OWASP Review Findings

### P1 - App-access auth fails open when auth config is incomplete

File: `lib/utils/auth.js`

`isAuthRequired()` returns false when Azure credentials are missing, and `requireAppAccess()` then grants access with `{ authBypassed: true }`. In production this can turn many app-gated API routes into unauthenticated endpoints if `AUTH_REQUIRED` or identity environment variables are misconfigured.

OWASP mapping:

- A01 Broken Access Control
- A05 Security Misconfiguration
- A07 Identification and Authentication Failures

Recommended fix: production auth/app-access gates should fail closed unless an explicit, separately protected emergency bypass is active.

### P1 - Uploaded sensitive documents are stored as public blobs

Files:

- `pages/api/upload-file.js`
- `pages/api/reviewer-finder/extract-summary.js`
- `pages/api/review-manager/upload-review.js`
- `pages/api/upload-handler.js`

Grant proposals, summaries, templates, and review documents are uploaded with public blob access and raw blob URLs are returned or persisted. Public blob URLs behave like bearer secrets: anyone with the URL can read the file.

OWASP mapping:

- A01 Broken Access Control
- A02 Cryptographic Failures / Sensitive Data Exposure

Recommended fix: use private storage, authenticated proxy/download routes, short-lived signed URLs, and avoid returning storage-origin URLs to clients.

### P1 - Proposal summary update is not scoped to the caller

File: `pages/api/reviewer-finder/extract-summary.js`

Any authenticated `reviewer-finder` user can submit an arbitrary `proposalId`, upload a new public summary, and update every `reviewer_suggestions` row for that proposal. The route does not verify ownership or admin authority before the update.

OWASP mapping:

- A01 Broken Access Control

Recommended fix: verify that the proposal belongs to the caller, or require a superuser/admin role for cross-user proposal updates.

### P1 - Multipart uploads are buffered before size enforcement

Files:

- `pages/api/upload-file.js`
- `pages/api/reviewer-finder/extract-summary.js`
- `pages/api/review-manager/upload-review.js`

Busboy handlers collect file chunks into memory and only enforce size after parsing finishes. A large multipart body can exhaust serverless memory before app-level limits run.

OWASP mapping:

- A04 Insecure Design
- A05 Security Misconfiguration

Recommended fix: add Busboy `limits.fileSize`, enforce `Content-Length`, abort on `limit` events, and add upload-specific rate limits.

### P1 - Production dependency audit has high-severity advisories

File: `package.json`

`npm audit --omit=dev` reported 13 production vulnerabilities: 7 high and 6 moderate. High-severity advisories included `next`, `express-rate-limit`, transitive `@xmldom/xmldom`, `path-to-regexp`, `picomatch`, `undici`, and `underscore`. Moderate advisories included DOMPurify XSS issues.

OWASP mapping:

- A06 Vulnerable and Outdated Components

Recommended fix: upgrade vulnerable production dependencies, especially Next.js beyond the reported vulnerable ranges, and refresh `package-lock.json`.

### P2 - Dynamics restrictions use mutable module-global state

File: `lib/services/dynamics-service.js`

`activeRestrictions` is process-global and overwritten per request. Concurrent Dynamics Explorer requests with different restrictions can interleave, causing one user's restriction context to affect another user's tool calls. The code logs mismatches but does not fail closed.

OWASP mapping:

- A01 Broken Access Control
- A04 Insecure Design

Recommended fix: pass restrictions and request IDs explicitly, use request-local storage, or fail closed when restriction context does not match the active request.

### P2 - Rate limiter key can be attacker-controlled

File: `shared/api/middleware/rateLimiter.js`

The limiter keys by `x-api-key` or `req.body.apiKey` before falling back to IP. A caller can vary that value to create new buckets and bypass expensive-operation limits.

OWASP mapping:

- A04 Insecure Design
- A05 Security Misconfiguration

Recommended fix: key limits by authenticated profile/session plus normalized IP, and do not trust arbitrary request body/header values as the primary rate-limit identity.

## Credential And Sensitive-Data Leak Findings

### P1 - API can return decrypted user API keys to browser JavaScript

Files:

- `pages/api/user-preferences.js`
- `shared/context/ProfileContext.js`
- `shared/components/ApiKeyManager.js`

`includeDecrypted=true` returns decrypted encrypted preference values, including API keys, directly in JSON. Frontend code calls this endpoint, so user API credentials become available to browser JavaScript.

Risk:

- Any injected script, malicious extension, compromised dependency, or frontend logging path can capture decrypted credentials.

Recommended fix: do not return raw decrypted credentials to the browser. Use stored credentials server-side, or issue short-lived opaque tokens that cannot reveal the underlying secret.

### P1 - Server logs are sent to a third-party LLM without redaction

File: `pages/api/cron/log-analysis.js`

The log-analysis cron fetches Vercel error logs and sends up to 50 raw log messages to Claude. If logs contain tokens, cookies, connection strings, public blob URLs, proposal passwords, emails, or document snippets, those values leave the system boundary.

Recommended fix: add deterministic redaction before constructing prompts and alert metadata. Redact authorization headers, cookies, API keys, connection strings, emails where possible, public blob URLs, and known password fields.

### P2 - Proposal passwords are returned in Review Manager API responses

File: `pages/api/review-manager/reviewers.js`

The Review Manager endpoint includes `proposalPassword` in the normal GET payload for proposal lists. Even though the route is authenticated and scoped, this exposes shared proposal passwords to all frontend runtime code and increases accidental leak risk.

Recommended fix: return a masked value by default and add a narrowly scoped reveal/update endpoint for explicit user actions.

### P2 - Legacy localStorage API key migration stores base64, not encryption

File: `shared/components/ApiKeyManager.js`

The legacy migration path reads `claude_api_key_encrypted` from `localStorage` and decodes it with `atob()`. Existing users may have had API keys persisted as reversible base64 in browser storage.

Recommended fix: remove the migration path after a cutoff, clear the legacy key proactively, and treat affected user keys as potentially exposed.

## Additional Notes

- No high-confidence committed production secrets were found in tracked files during regex scanning.
- `.env.local` exists locally but is ignored by `.gitignore` and is not tracked.
- `docs/security-audit/secrets-scan-results.json` is tracked and reports no findings, but it is a generated audit artifact and may not need to remain in source control.

