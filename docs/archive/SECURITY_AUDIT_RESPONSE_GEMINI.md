# Response to Gemini Security Audit (March 2026)

**Author:** Lead Developer
**Date:** March 10, 2026
**Reference:** `docs/COMPREHENSIVE_SECURITY_AUDIT_2026.md`

---

## Summary of Actions

| Finding | Severity | Action |
|---------|----------|--------|
| SEC-AUTH-001 | Medium | **Fixed** — cache invalidation on deactivation |
| SEC-AUTH-002 | Low | **No code change** — policy/governance decision |
| SEC-AUTH-003 | Medium | **Fixed** — removed silent auto-linking |
| SEC-AUTH-004 | Medium | **Fixed** — fail-closed on DB error |
| SEC-DATA-001 | High | **No code change** — policy/governance decision |
| SEC-DATA-002 | Medium | **No code change** — partially mitigated already |

Three code fixes shipped. Two findings are policy/governance concerns without code-level remediation. One was already partially mitigated.

Additionally, a **user-profiles directory exposure** not identified by this audit was independently caught and fixed in commit `00b17d2` — see "What the Audit Missed" below.

---

## Finding-by-Finding Response

### SEC-AUTH-001: Session Revocation Latency

**What's accurate:** The `is_active` flag and app-access grants were cached for 2 minutes in `lib/utils/auth.js`. A deactivated user could continue making authenticated requests until the cache entry expired.

**What's overstated:** The audit frames this as a "window of vulnerability during offboarding." In practice, offboarding is an admin-initiated action that happens during business hours, not under adversarial time pressure. The 2-minute window is a latency/assurance issue, not a direct auth bypass.

**Action taken:** `clearAppAccessCache(profileId)` (which already existed and was already called when granting/revoking app access) is now also called immediately after `archiveUserProfile()` succeeds in `pages/api/user-profiles.js`. This eliminates the revocation lag for deactivation. The 2-minute TTL remains for normal cache refresh, which is appropriate for routine access checks.

---

### SEC-AUTH-002: CSRF Fail-Open on Missing Headers

**What's accurate:** The CSRF validator in `lib/utils/auth.js` allows state-changing requests (POST/PUT/DELETE) to proceed when both `Origin` and `Referer` headers are absent. This is intentional — it supports Vercel cron jobs and server-to-server callers that don't send browser headers.

**What's overstated:** The audit implies this is a bypass vector, but does not demonstrate a concrete browser-based CSRF path. Modern browsers always send `Origin` on cross-origin POST requests. The scenario where both headers are absent is characteristic of non-browser clients, which is exactly what the code is trying to allow.

**Action:** No code change. This is a defense-in-depth hardening topic. If IT requires stricter CSRF posture, the right approach is an explicit allowlist for non-browser callers (e.g., checking for the `CRON_SECRET` header on cron routes), not blocking all headerless requests. That work can be prioritized if IT flags it during review.

---

### SEC-AUTH-003: Profile Hijacking via Email Reuse

**What's accurate:** The signIn callback in `pages/api/auth/[...nextauth].js` silently auto-linked Azure AD users to existing profiles based solely on matching `azure_email`. If Entra ID reassigned an email address, a new person could inherit the previous employee's profile and data.

**Action taken:** The silent auto-link block (formerly lines 70-86) has been removed entirely. Users with a matching email but no `azure_id` now fall through to the existing Level 3 flow, which creates a temporary profile with `needs_linking = true` and shows the `ProfileLinkingDialog`. The user confirms the link with one click. This adds one confirmation step for first-time logins while preserving the same user experience for returning users (who match by `azure_id` at Level 1).

**Impact:** Minimal friction — one extra click on first login. No impact on returning users.

---

### SEC-AUTH-004: Fail-Open on Identity Database Error

**What's accurate:** The signIn callback's catch block returned `true` on any database error, allowing sign-in without profile verification.

**What should be clarified:** The practical impact was narrower than the audit implies. A user who signs in without a profile gets a session, but all sensitive routes require `requireAppAccess()` or `requireAuthWithProfile()`, which would fail without a valid profile. Still, fail-open is the wrong default for an identity boundary.

**Action taken:** Changed `return true` to `return false` in the catch block. Users now see `/auth/error` during database outages instead of getting a broken session. Since a database outage already breaks all app functionality, this aligns the auth boundary with reality — if the DB is down, nothing works anyway.

---

### SEC-DATA-001: Exposure of Raw Proposal Text to External AI

**What's accurate:** The reviewer-finder prompt sends up to 100,000 characters of raw proposal text to the Claude API without automated PII scrubbing. This is an intentional product behavior — the AI needs the full proposal text to perform meaningful analysis.

**What should be clarified:** This is a data governance and policy decision, not a code defect. The Anthropic API agreement includes data handling terms (no training on customer data). Whether transmitting raw proposal text is acceptable depends on the organization's data classification policy, Anthropic's contractual commitments, and institutional review.

**Action:** No code change. The appropriate remediation is organizational:
1. Confirm Anthropic's data handling terms satisfy institutional requirements
2. If needed, implement a PII scrubbing layer as a future enhancement
3. Document the data flow in the security architecture for IT review

---

### SEC-DATA-002: Verbose Data Transmission in Agentic Loops

**What's accurate:** The Dynamics Explorer chat loop preserves full tool results in the Claude conversation context.

**What's partially outdated:** The audit does not account for three existing minimization controls:
1. **Field restrictions** — admins can restrict which Dynamics fields are returned via the restrictions API (`/api/dynamics-explorer/restrictions`)
2. **Result limits** — OData queries are capped at configurable row limits
3. **Schema scoping** — only annotated/known fields from the inline schema are queried

**Action:** No code change. The existing controls already provide field-level and row-level minimization. Further reducing the data footprint (e.g., summarizing tool results before re-injecting them) would degrade the agentic reasoning quality. This is a tradeoff between data minimization and AI capability that should be evaluated at the policy level.

---

## What the Audit Missed

The audit did not identify a more concrete application-layer finding: the `GET /api/user-profiles` endpoint was returning full profile records including `azureId`, `azureEmail`, and `needsLinking` to any authenticated user. This enabled user enumeration and exposed identity-linking metadata.

**Closed.** Two-phase fix:
1. **Commit `00b17d2`:** `sanitizeProfile()` strips `azureId`, `azureEmail`, and `needsLinking` from all profile API responses. The profile-linking flow uses a dedicated `?linkable=true` query filtered server-side by the caller's email.
2. **Endpoint scoping:** `GET /api/user-profiles` now returns only the caller's own profile by default. The full directory is available only via `?all=true`, which requires superuser access (403 for non-superusers). The `?id=X` path is restricted to the caller's own profile (403 for cross-user lookups). The admin dashboard passes `?all=true` for its role management dropdown.

---

## Summary

The audit is directionally useful and identified real issues. Three of the six findings warranted code fixes, which are now complete. Two are policy/governance concerns that require organizational decisions rather than code changes. One (CSRF) describes intentional behavior that could be hardened if IT requires it.

The strongest security improvement from this cycle is the user-profiles directory enumeration fix (now fully closed), which the audit did not catch.
