# Code Review Findings

Date: March 10, 2026

## Finding 1

**File:** `pages/api/review-manager/send-emails.js:118`

**Severity:** P1

**Title:** Attachment fetching is an SSRF primitive

The API accepts arbitrary `attachmentUrls` from the client and fetches each one server-side with no origin allowlist, scheme validation, or blob-only restriction. A user with `review-manager` access can make the server request internal endpoints or cloud metadata services and receive the fetched content back inside the generated EML payload. Restrict this to trusted blob hosts or stored attachment records before fetching.

## Finding 2

**File:** `pages/api/auth/link-profile.js:62`

**Severity:** P0

**Title:** Arbitrary profile linking enables account takeover

Any authenticated Azure user can bind their session to any active profile by ID. This handler only checks that the submitted `azureId` matches the caller’s session, then updates the target row without verifying ownership, email match, or that the profile was explicitly reserved for this user. In the current UI, first-time users can enumerate unlinked profiles and choose one, so a new login can claim another person’s profile and inherit its app grants and stored data.

## Finding 3

**File:** `pages/api/review-manager/send-emails.js:79`

**Severity:** P1

**Title:** Review email generation reads and mutates other users' reviewer records

`send-emails` loads reviewer suggestions solely by caller-supplied IDs and later updates those same rows, but never scopes either query to `access.profileId`. Any user with `review-manager` access can request EML content for another user’s suggestions, exposing proposal URLs/passwords and reviewer contact details, and can also mark those foreign rows as sent. The adjacent `reviewers.js` endpoint does scope by `user_profile_id`, so this looks like an accidental omission rather than intended shared access.
