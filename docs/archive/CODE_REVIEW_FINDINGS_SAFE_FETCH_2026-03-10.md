# Code Review Findings

Date: March 10, 2026

## Finding 1

**[P1] Host allowlist is bypassable through redirects**

File: [lib/utils/safe-fetch.js](/Users/gallivan/Programming/Phase-II-Summaries/lib/utils/safe-fetch.js):50

`safeFetch()` validates only the initial URL, then calls `fetch()` with default redirect handling. An allowlisted URL that responds with a 30x to a non-allowlisted host will still be followed, so the wrapper does not actually enforce the hostname boundary it claims. Set `redirect: 'manual'` and revalidate `Location`, or inspect `response.url` after each hop. The current tests also miss this case.

## Finding 2

**[P2] reviewer-finder attachment path still bypasses the centralized fetch wrapper**

File: [pages/api/reviewer-finder/generate-emails.js](/Users/gallivan/Programming/Phase-II-Summaries/pages/api/reviewer-finder/generate-emails.js):222

The hardening summary says this route was migrated from raw `fetch()` to `safeFetch()`, but the shared attachment branch still performs direct `fetch(reviewTemplateBlobUrl)` and `fetch(attachment.blobUrl)`. Those calls keep their own ad hoc validation instead of inheriting future wrapper fixes such as redirect handling, and they make the summary materially overstated.
