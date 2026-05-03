---
name: Reviewer accept/decline magic links — partly subsumed by external-reviewer landing
description: HMAC magic-link primitive shipped, but as the broader external-reviewer landing page rather than dedicated accept/decline buttons. Accept/decline-specific click flow is unbuilt.
type: project
originSessionId: 223c47bb-55ef-4adb-bab2-c2616bfa5311
---
**Audit 2026-05-03: this entry was rewritten.** The original plan was a small "click Accept / click Decline" flow in invitation emails. What actually shipped is broader: the External Reviewer Intake (`/external/review/[token]`) landing page, where reviewers see proposal info, download materials, and upload completed reviews — all token-authenticated.

**What shipped (don't rebuild):**
- HMAC-signed JWT primitive: `lib/services/external-token.js` (`mintToken`, `verifyToken`, `hashToken`).
- Token lifecycle: `lib/external/token-lifecycle.js` (`mintAndStore`, `revoke`, `ensureToken`, `extendForPostSubmissionWindow`, `buildExternalUrl`).
- Public endpoints: `pages/external/review/[token].js` + `pages/api/external/review/[token]/{context,proposal,upload}.js`.
- Hash-only storage in Dataverse so revoke is a single PATCH.
- 7-day post-submission modify window via `extendForPostSubmissionWindow` (Session 125).

**What is NOT yet built (the original ask):**
- Dedicated Accept / Decline buttons in invitation email bodies.
- `pages/review-response.js` and `pages/api/review-response/confirm.js` were never created (the original plan named these files; they don't exist).
- Auto-fill of `response_received_at` / `accepted` / `declined` from a click action.
- Two-click confirm page to defeat email-scanner prefetch.

**How to apply:**
- If accept/decline buttons come up again, build them on top of the existing token primitive — don't add a separate `REVIEWER_RESPONSE_SECRET` (use `EXTERNAL_LINK_SECRET`). Add `ops: ['accept']` / `ops: ['decline']` to the JWT payload, and a `/api/external/review/[token]/respond` endpoint.
- Two-click confirm is still mandatory (Microsoft Defender Safe Links, Gmail prefetch, antivirus crawlers GET every link).
- The lifecycle gap this would close: `response_received_at` is still manual today; staff sets it via Review Manager.
