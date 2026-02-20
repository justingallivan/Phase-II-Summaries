# Session 63 Prompt: Next Steps

## Session 62 Summary

Comprehensive authentication hardening and security audit. Added server-side middleware gate, removed CORS wildcards, added security headers, and fixed critical horizontal privilege escalation vulnerabilities in 4 API endpoints.

### What Was Completed

1. **Next.js Middleware Auth Gate** (`middleware.js`) — Server-side authentication using `withAuth` from `next-auth/middleware` (Edge Runtime compatible via `jose`). Validates JWT cryptographically before serving any HTML/JS, preventing unauthenticated users from seeing the app structure. Respects `AUTH_REQUIRED` kill switch. Matcher excludes `_next/static`, `_next/image`, `favicon.ico`, `/api/auth/*`.

2. **Stripped Debug Info** (`pages/api/auth/status.js`) — Removed `debug: { authRequired, hasCredentials }` from response. Now returns only `{ enabled: boolean }`.

3. **AppAccessContext Deny-by-Default** (`shared/context/AppAccessContext.js`) — `hasAccess()` returns `false` while loading (was `true`). On fetch error, sets `allowedApps` to `[]` instead of `null` (which fell through to allow-all).

4. **Removed CORS Wildcards** — Removed `Access-Control-Allow-Origin: *` from `next.config.js` global headers AND from 10 inline SSE streaming endpoints (`process-peer-reviews`, `send-emails`, `process-expenses`, `screen`, `generate-emails`, `enrich-contacts`, `chat`, `discover`, `analyze`, `upload-handler`). These are same-origin requests that never needed CORS.

5. **Security Headers** (`next.config.js`) — Added `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` to all responses.

6. **Fixed Horizontal Privilege Escalation** — 4 API endpoints trusted user-supplied `profileId` without verifying it matched the authenticated session:
   - `user-preferences` — Now uses `requireAuthWithProfile()`. Blocks cross-user API key theft.
   - `user-profiles` PATCH/DELETE — Verifies `id === session.user.profileId`. Blocks cross-user profile modification.
   - `reviewer-finder/my-candidates` — GET uses session profileId; PATCH/DELETE verify suggestion ownership via SQL WHERE clause.
   - `integrity-screener/history` — All operations scoped to session profileId.

7. **Security Audit** — Thorough adversarial audit covering middleware bypass vectors, SSRF, injection, authorization, dependencies, cryptography. Documented findings in conversation.

### Commits
- `5237c60` Harden auth: server-side middleware gate, remove recon surface
- `bdb5c76` Fix middleware Edge Runtime crash: use withAuth instead of getToken
- `085c777` Remove inline CORS wildcards from 10 endpoints, add security headers
- `94dff14` Fix horizontal privilege escalation: enforce session-based ownership

## Security Audit Findings — Remaining Items

### Already Fixed This Session
- Server-side auth gate (middleware)
- Debug info in `/api/auth/status`
- CORS wildcards (global + 10 inline)
- AppAccessContext allow-all defaults
- Horizontal privilege escalation (4 endpoints)
- Security headers (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
- `error.message` leakage in fixed endpoints

### Not Yet Fixed (Documented for Future)
- **`error.message` in ~40 remaining catch blocks** — Internal errors returned verbatim in many API routes. Should use generic messages.
- **Rate limiting gaps** — Only 4 of 14+ Claude-calling endpoints have rate limiters. Missing on `evaluate-concepts` (Opus, most expensive), `process`, `analyze-literature`, `dynamics-explorer/chat`.
- **`xlsx` prototype pollution** — npm audit reports 34 vulnerabilities (32 high). XLSX used in Dynamics Explorer export.
- **30-day JWT session lifetime** — No session revocation mechanism. Consider reducing `maxAge` or adding revocation table.
- **`/api/reviewer-finder/researchers` PATCH/DELETE** — Any authenticated user can modify/delete shared researcher records. May be intentional (shared pool) but lacks audit trail.
- **Encryption fallback key** — `lib/utils/encryption.js` uses hardcoded dev key when `NODE_ENV !== 'production'`. Safe if Vercel always sets production, but fragile.
- **No CSRF on custom POST/DELETE routes** — NextAuth handles its own routes but custom endpoints lack CSRF validation.

## Deferred Items (Carried Forward)

- SharePoint document access (blocked on Azure AD admin consent — see `docs/SHAREPOINT_DOCUMENT_ACCESS.md`)
- Disambiguate CRM program lookup fields (needs domain expert)
- Dynamics Explorer search heuristics & query optimization
- Deferred email notifications (`docs/TODO_EMAIL_NOTIFICATIONS.md`)
- Investigate why `DEFAULT_APP_GRANTS` may not work reliably for new users

## Key Files Reference

| File | Purpose |
|------|---------|
| `middleware.js` | Server-side auth gate (Edge Runtime, withAuth/jose) |
| `pages/api/auth/status.js` | Auth status endpoint (debug info removed) |
| `shared/context/AppAccessContext.js` | Client-side access control (deny-by-default) |
| `next.config.js` | Security headers (HSTS, nosniff, DENY, referrer) |
| `pages/api/user-preferences.js` | User prefs (session-scoped via requireAuthWithProfile) |
| `pages/api/user-profiles.js` | User profiles (PATCH/DELETE ownership enforced) |
| `pages/api/reviewer-finder/my-candidates.js` | Candidates (session-scoped + ownership checks) |
| `pages/api/integrity-screener/history.js` | Screening history (session-scoped) |
| `lib/utils/auth.js` | Auth utilities (requireAuth, requireAuthWithProfile) |

## Testing

```bash
npm run dev              # Dev mode (AUTH_REQUIRED=false) — all pages accessible, no middleware redirect
npm run build            # Verify middleware compiles for Edge Runtime

# Production verification (after deploy):
# 1. Incognito browser → app URL → should redirect to /auth/signin (no JS bundle served)
# 2. Postman unauthenticated → GET /api/auth/status → { enabled: true } only (no debug)
# 3. Authenticated user → all pages and apps work normally
# 4. Check response headers include X-Frame-Options: DENY, X-Content-Type-Options: nosniff
```
