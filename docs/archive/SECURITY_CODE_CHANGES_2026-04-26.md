# Security Code Changes - 2026-04-26

This document records the security hardening changes made during the security-header and baseline posture pass.

## Summary

Implemented a stronger browser/API security baseline for the Next.js app, tightened CSP coverage for auth pages, and added regression tests for the new behavior.

## Files Changed

### `next.config.js`

- Added a reusable `securityHeaders` list.
- Strengthened `Strict-Transport-Security` from one year to two years and added `preload`.
- Kept existing `poweredByHeader: false`.
- Preserved existing baseline headers:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Robots-Tag: noindex, nofollow, noarchive`
- Added modern browser isolation and capability controls:
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), serial=(), browsing-topics=()`
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Resource-Policy: same-origin`
  - `X-Permitted-Cross-Domain-Policies: none`
- Added default API response cache prevention:
  - `Cache-Control: no-store, max-age=0` for `/api/:path*`.

### `middleware.js`

- Replaced `Buffer.from(...).toString('base64')` nonce generation with Edge-compatible Web APIs:
  - `crypto.getRandomValues`
  - `btoa`
- Kept the existing nonce-based production CSP model.
- Changed auth-page handling so `/auth/*` routes still pass through middleware and receive CSP headers.
- Updated the matcher so `/auth/*` is no longer excluded from middleware.
- Added an `authorized` callback exception for `/auth/*` so login and error pages remain reachable without a valid session.

### `lib/utils/auth.js`

- Hardened CSRF validation for state-changing methods.
- Cookie-bearing `POST`, `PUT`, `PATCH`, and `DELETE` requests with neither `Origin` nor `Referer` now fail with `403`.
- Cookie-free state-changing requests can still pass for server-to-server callers.
- Updated comments to reflect the stricter behavior.

### `tests/unit/utils/auth.test.js`

- Added regression coverage for cookie-bearing `POST` requests missing both `Origin` and `Referer`.
- Existing auth and app-access tests continue to cover:
  - unauthenticated rejection
  - linked-profile enforcement
  - disabled-user rejection
  - app-level access checks
  - origin mismatch rejection

### `tests/unit/security-headers.test.js`

- Added tests to verify the global security-header baseline.
- Added tests to verify default `Cache-Control: no-store, max-age=0` on API routes.

## Verification

Commands run:

```bash
npm test -- --runTestsByPath tests/unit/utils/auth.test.js tests/unit/security-headers.test.js
npm test
npm run build
```

Results:

- Targeted security tests passed.
- Full Jest suite passed: 147 passed, 1 skipped.
- Production build passed.

Note: the first `npm run build` attempt failed inside the sandbox because Turbopack could not bind a local worker port. The build succeeded after rerunning with approved elevated permissions.

