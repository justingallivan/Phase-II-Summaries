# Code Review Findings Follow-Up

Date: March 10, 2026

## Finding 1

**File:** `pages/api/reviewer-finder/generate-emails.js:45`

**Severity:** P1

**Title:** Reviewer-finder email generation still trusts foreign suggestion IDs

The same authorization pattern you fixed in `review-manager/send-emails` is still present here. Proposal info is loaded for arbitrary `suggestionIds` without scoping by the caller’s profile, and `markAsSent` updates those rows by ID only. A user with `reviewer-finder` access can still read another user’s proposal metadata and flip `email_sent_at/invited` on foreign suggestions by supplying those IDs.

## Finding 2

**File:** `pages/api/auth/link-profile.js:64`

**Severity:** P1

**Title:** Email-match check breaks the intended manual profile-linking flow

This change closes the takeover path, but it also makes the fallback linking flow unusable for the legacy records it was built for. `signIn` already auto-links profiles whose `azure_email` matches the Azure login, so the manual `/api/auth/link-profile` path is only needed for existing unlinked profiles that do not already have a matching `azure_email`. Requiring `azure_email = ${azureEmail}` here means those profiles now return 404 and can never be linked through the UI.
