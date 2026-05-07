# Code Review Findings Legacy Linking

Date: March 10, 2026

## Finding 1

**File:** `pages/api/auth/link-profile.js:68`

**Severity:** P1

**Title:** Profile-linking flow is still dead-ended for legacy users

This closes the takeover path, but the fallback path still is not actually usable in-product. `/api/auth/link-profile` now requires the target row’s `azure_email` to already match the caller, yet I could not find any admin or self-service route that can set `user_profiles.azure_email` for an existing unlinked profile. At the same time, the dialog still tells first-time users to pick an existing profile from `/api/user-profiles`, so those users will hit the new 404 unless someone edits the database out-of-band.
