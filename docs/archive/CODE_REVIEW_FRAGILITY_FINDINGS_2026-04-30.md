# Codebase Fragility Review Findings

Date: 2026-04-30  
Reviewer: Codex  
Scope: Static senior-engineering review of the Next.js application, API routes, shared services, Dataverse/Graph integrations, LLM execution paths, upload handling, authorization boundaries, and test suite. No code changes were made as part of the review.

## Executive Summary

The codebase shows substantial recent hardening work, especially around authentication, app-level access, SSRF protection, security headers, log redaction, and user-scoped route checks. The main long-term fragility is not a single bug; it is a pattern of request-specific policy and operational controls living in process memory or spread across parallel enforcement layers.

The most important risks are:

- Dynamics field/table restrictions are stored in process-wide mutable state.
- Middleware auth behavior and API auth behavior can diverge in production misconfiguration scenarios.
- Several multi-step write flows can partially commit without transactional boundaries or replayable recovery.
- LLM provider calls are implemented through multiple client paths with inconsistent timeout, abort, retry, logging, and allowlist behavior.
- Sensitive uploaded documents are stored as public blobs.
- Rate limiting is process-local and will not hold reliably across horizontal scaling or serverless cold starts.
- The test suite is useful for recent security regressions, but it is not yet broad enough to catch the highest-fragility workflow failures.

## Findings

### High: Dynamics Restrictions Use Process-Wide Mutable State

`lib/services/dynamics-service.js` keeps request-specific restrictions in module-level variables:

- `activeRestrictions`
- `_restrictionRequestId`

Routes call `DynamicsService.setRestrictions(...)` or `DynamicsService.bypassRestrictions(...)` before asynchronous work. Because these values are global to the warm process, concurrent requests can affect each other's restriction state. The existing request-id mismatch logic logs a warning, but it does not fail closed.

Why this is fragile:

- A trusted internal write path can call `bypassRestrictions()` while a Dynamics Explorer request is still running.
- A second user request can overwrite restrictions while the first request is mid-query.
- Behavior may be fine locally and fail only under real concurrency.
- The failure mode can be either over-blocking or data exposure.

Recommendation:

Move restrictions into an explicit per-request context object and pass that context into Dynamics read/query methods. Avoid storing authorization or masking policy in module globals. For an incremental migration, keep the current static methods but add context-aware variants, then move high-risk routes first.

### High: Middleware and API Auth Semantics Can Diverge

`middleware.js` allows requests through when `AUTH_REQUIRED !== 'true'`. Separately, `lib/utils/auth.js` fails closed in production unless `EMERGENCY_AUTH_BYPASS=true`.

Why this is fragile:

- A production misconfiguration can expose pages while API routes still reject.
- Operators may see inconsistent behavior during an auth incident.
- Client-side page guards can give misleading confidence if the server-side API guard behaves differently.

Recommendation:

Centralize production auth-required logic so middleware and API utilities share the same semantics. Middleware should mirror `isAuthRequired()` or use a small shared edge-compatible equivalent with the same production fail-closed rules.

### Medium: Candidate Save Flow Is Not Transactional

`pages/api/reviewer-finder/save-candidates.js` performs a long sequence of related writes:

- find or create researcher
- update researcher metadata
- insert/update reviewer suggestion
- add keywords/tags
- optionally dual-write to Dataverse

Errors are collected per candidate, but already-committed Postgres writes remain committed.

Why this is fragile:

- A candidate can be half-saved.
- Researcher records and suggestions can drift.
- Retrying after partial failure can produce duplicate or confusing merged records.
- Dataverse dual-write failures are logged in the response but not clearly queued for replay.

Recommendation:

Wrap the Postgres source-of-truth writes for each candidate in a transaction. Store Dataverse writeback attempts and failures in a durable table or status field so failed dual-writes can be retried intentionally rather than inferred from logs.

### Medium: LLM Execution Is Fragmented

The codebase has multiple LLM clients and call styles. `MultiLLMService` uses `safeFetch`, while `shared/api/handlers/claudeClient.js` uses raw `fetch`. Some paths use `Promise.race` for timeout without aborting the underlying request.

Why this is fragile:

- Hanging provider calls can continue after the app has considered them timed out.
- Retry behavior varies by route.
- Usage logging and error shape are inconsistent.
- Provider migration or model changes need to be patched in multiple places.
- Some LLM call paths bypass the centralized SSRF allowlist.

Recommendation:

Create one canonical server-side LLM execution layer for provider calls. It should own:

- allowlisted outbound fetch
- abortable timeout
- retry/backoff policy
- usage logging
- redacted error handling
- model override handling
- provider-specific response normalization

Then migrate older Claude-only helpers onto that layer.

### Medium: Uploaded Documents Are Stored as Public Blobs

`pages/api/upload-file.js` uploads with `access: 'public'` and returns the blob URL.

Why this is fragile:

- Auth protects upload, but not subsequent URL access.
- Grant proposals, reviewer documents, reports, and contact data may be sensitive.
- Public URLs can leak through logs, browser history, pasted support messages, or downstream LLM prompts.

Recommendation:

Default sensitive document uploads to private storage or short-lived signed access. If public blob access is still needed for specific assets, make that an explicit route-level decision and document which file categories are allowed to be public.

### Medium: Rate Limiting Is Process-Local

`shared/api/middleware/rateLimiter.js` stores request counts in an in-memory `Map`.

Why this is fragile:

- Limits reset on cold start.
- Limits are not shared across serverless instances.
- Horizontal scaling weakens protection on expensive AI routes.
- A burst can exceed intended spend or provider-rate protection.

Recommendation:

For expensive routes, move rate limits to a shared store such as Vercel KV, Redis, Postgres, or provider-side quota controls. Keep local rate limiting only as a best-effort development convenience.

### Medium: App Access Cache Is Also Process-Local

`lib/utils/auth.js` caches app grants and superuser status per profile for two minutes.

Why this is fragile:

- Revocation is not instant across instances.
- Cache invalidation only affects the current process.
- Superuser/app access decisions may stay stale after admin changes.

Recommendation:

For high-risk privileges, prefer a shared cache with explicit invalidation or a short-circuit database check on sensitive operations. At minimum, distinguish ordinary app access from elevated admin/superuser checks and avoid caching the latter for long.

### Low: Error and Console Noise Reduces Test Signal

The test suite currently emits expected warnings/errors during passing tests. This makes real regressions harder to spot in CI output.

Recommendation:

Suppress or assert expected logging in targeted tests. Treat unexpected `console.error` as a test failure for most unit/integration suites.

## Test Suite Assessment

The repository currently has a small Jest suite:

- 8 test files
- 164 tests total
- 1 skipped test

At review time, running `npm test -- --runInBand` produced:

```text
Test Suites: 2 failed, 6 passed, 8 total
Tests:       2 failed, 1 skipped, 161 passed, 164 total
```

### What Is Well Covered

The strongest coverage is around recent security hardening:

- `tests/unit/utils/auth.test.js`
  - authentication required behavior
  - profile-required behavior
  - disabled users
  - app-level access
  - superuser bypass
  - CSRF origin/referer checks
  - production fail-closed auth behavior

- `tests/unit/utils/safe-fetch.test.js`
  - SSRF host allowlist
  - HTTPS-only enforcement
  - redirect validation
  - internal/metadata/localhost blocking

- `tests/unit/utils/log-redactor.test.js`
  - token redaction
  - email redaction
  - Postgres URL redaction
  - blob URL redaction

- `tests/unit/security-headers.test.js`
  - baseline browser security headers
  - API no-cache headers

- `tests/integration/auth-routes.test.js`
  - representative API routes reject unauthenticated users
  - representative API routes reject users without required app grants

### Current Failing Tests

Two test failures were observed:

1. `tests/integration/auth-routes.test.js`
   - The `review-manager/reviewers` authorized-path test fails because the mocked `DynamicsService` does not provide `bypassRestrictions`, while the route now calls it.
   - This appears to be stale test mock setup rather than a product-code failure.

2. `tests/integration/cross-user-isolation.test.js`
   - The `review-manager/send-emails` cross-user isolation test expects an SSE message containing `No reviewers found`, but no write output was observed.
   - This could be stale expectations, incomplete mocks, or a changed route path that the test no longer exercises correctly.

### Main Test Gaps

The suite is useful, but it is not yet a broad workflow safety net. It does not substantially cover:

- concurrent Dynamics restriction leakage
- Dataverse query restriction behavior under interleaved requests
- transactional integrity of candidate saving
- retry/replay behavior for Dataverse dual-writes
- private/public blob access decisions
- upload MIME/content validation beyond basic route behavior
- LLM timeout and abort behavior
- provider fallback behavior
- parsing failures from real LLM-shaped responses
- end-to-end app workflows in a browser
- migration/backend-dispatch parity between Postgres and Dataverse

## Prioritized Recommendations

### P0: Fix Current Test Failures

Bring the integration mocks back in sync with production route dependencies.

Recommended actions:

- Add `bypassRestrictions`, `setRestrictions`, and any route-used Dynamics methods to the `DynamicsService` mock.
- Update the `send-emails` cross-user isolation test to assert the current behavior intentionally.
- Ensure `npm test -- --runInBand` passes in CI before relying on the suite as a regression gate.

### P1: Add Concurrency Tests for Dynamics Restrictions

Add focused tests around the highest-risk design:

- Request A sets restricted fields.
- Request B calls `bypassRestrictions()`.
- Request A attempts a restricted query.
- The query must not inherit Request B's bypass.

This test may be difficult with the current global design; that is useful signal. It should guide the refactor toward request-local restriction context.

### P1: Add Transaction/Partial Failure Tests for Candidate Saving

Test failure injection around each stage:

- researcher create succeeds, suggestion insert fails
- suggestion insert succeeds, keyword insert fails
- Postgres succeeds, Dataverse dual-write fails
- retry after partial failure

The expected behavior should be explicit: rollback, durable failure state, or idempotent retry.

### P1: Consolidate LLM Client Tests

Before refactoring provider clients, add tests for the desired contract:

- timeout aborts underlying request
- retryable status codes retry with bounded attempts
- non-retryable status codes fail once
- usage logging happens on success and failure
- errors are redacted
- provider responses normalize to the same shape

### P2: Add Blob Privacy Tests

Add tests that encode the policy for sensitive files:

- proposal/report/reviewer uploads should not be public by default
- returned URLs should go through authenticated proxy or signed access
- public blob URLs should be limited to explicitly allowed asset classes

### P2: Add Backend Parity Tests

For services that dispatch between Postgres and Dataverse, add shared contract tests:

- app grants
- user preferences
- researcher/proposal lookups
- settings

Each backend should satisfy the same behavior contract.

### P2: Add Browser-Level Smoke Tests

Add a small Playwright suite for the highest-value flows:

- sign-in/auth-required redirect behavior
- app access hides/blocks unavailable apps
- reviewer finder happy-path skeleton
- dynamics explorer restriction-denied path
- upload flow with oversized and unsupported files

These do not need to be exhaustive; a few end-to-end checks would catch integration drift that unit tests miss.

## Suggested Sequencing

1. Fix stale integration mocks and get Jest green.
2. Add a regression test that demonstrates the Dynamics restriction global-state hazard.
3. Refactor Dynamics restrictions to request-local context.
4. Add transactional/idempotency tests around reviewer candidate saving.
5. Consolidate LLM client behavior and pin it with contract tests.
6. Decide and encode blob privacy policy in tests.
7. Add a small browser smoke suite once core API behavior is stable.

## Closing Note

The suite is doing useful work: it clearly reflects recent attention to security boundaries. The next step is to make it protect operational correctness as strongly as it protects auth regressions. The highest leverage move is to test the places where production behavior differs most from local behavior: concurrency, distributed state, partial failure, and external service drift.
