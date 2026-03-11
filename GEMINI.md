# GEMINI.md - Project-Specific Mandates

This file takes absolute precedence over all other instructions for Gemini CLI within this project.

## Core Directives

1. **Evidence-First Protocol:** Never reconstruct code from summaries (`SECURITY_GEMINI_FIXES.md`, PR descriptions, etc.). You must use `read_file` or `grep_search` to verify every implementation detail.
2. **Strict Citation:** When discussing code logic, you must cite the specific filename and line numbers you have just read.
3. **Security Boundaries:**
    - **DynamicsService:** Must remain "Fail-Closed." Any new query methods must explicitly call `checkRestriction()` with the current `requestId`.
    - **GraphService:** Any new file operations must include path sanitization (blocking `..`) and remain read-only.
4. **No Hallucination of Snips:** If you cannot find a specific piece of logic in the files, state so. Never "simulate" what the code might look like based on a description.

## Architecture Context (Verified)

- **OData Parsing:** Uses a manual character-by-character depth-tracking parser (`splitExpandSegments` in `lib/services/dynamics-service.js`).
- **Restriction Scoping:** Uses a dual-layer enforcement (Chat-handler and Service-layer) with `requestId` tracking to detect state leakage.
- **Fail-Closed Identity:** The `signIn` callback in `[...nextauth].js` returns `false` on DB errors. Silent email-based auto-linking is disabled; users must explicitly confirm via the linking flow.
- **Instant Revocation:** `clearAppAccessCache(profileId)` is called immediately upon user deactivation in `user-profiles.js`.
- **Identity Sanitization:** User profile endpoints use `sanitizeProfile()` to strip sensitive Entra ID metadata (`azureId`, `azureEmail`) from public listings.
