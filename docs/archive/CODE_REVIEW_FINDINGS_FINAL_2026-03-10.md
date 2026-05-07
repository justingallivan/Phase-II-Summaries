# Code Review Findings Final

Date: March 10, 2026

## Finding 1

**File:** `pages/api/auth/link-profile.js:35`

**Severity:** P0

**Title:** First-time users can still claim arbitrary active profiles

The new `needsLinking` gate only prevents already-linked users from calling this endpoint. It does not authenticate the target profile itself. Any newly signed-in user whose temporary account has `needs_linking = true` can still submit any active `profileId`, pass the `azureId` check, and bind that profile to their Azure account. Because `/api/user-profiles` still returns the full active profile list, the original account-takeover path remains reachable during first login.
