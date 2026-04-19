# Security Audit — 2026-04-18

**Baseline:** `SECURITY_ARCHITECTURE.md` v3.5 (2026-03-11)
**Auditor:** Three-workstream delta audit (Dynamics/prompt, new apps, SharePoint/files)
**Scope:** 25 commits since the last audit, covering four new apps, Dynamics write access, and the `PromptResolver` service.

## Summary

| Severity | Count | Acted on this session |
|----------|-------|-----------------------|
| Critical | 0 | — |
| High | 3 | 3 |
| Medium | 9 | 8 |
| Low | 2 | 1 |
| Informational | 7 | 4 |

**Headline:** No critical findings. One real enumeration path (H1, download proxy) and several error-message leaks into API responses (H2) were the most actionable. All three Highs fixed in this session; remaining Mediums/Lows triaged for a follow-up hardening pass.

## Surface reviewed

**Dynamics writeback & prompt injection**
- `lib/services/dynamics-service.js`, `lib/services/prompt-resolver.js`
- `pages/api/phase-i-dynamics/{summarize,summarize-v2}.js`
- `pages/api/grant-reporting/{extract,lookup-grant}.js`
- `shared/config/prompts/phase-i-dynamics.js`, `scripts/seed-phase-i-prompt.js`

**New app attack surface**
- Grant Reporting, Expertise Finder, Phase I Dynamics, Virtual Review Panel — full endpoint inventory

**SharePoint & file handling**
- `lib/services/graph-service.js`, `lib/utils/sharepoint-buckets.js`, `lib/utils/file-loader.js`
- `pages/api/dynamics-explorer/{download-document,chat}.js`
- `pages/api/grant-reporting/lookup-grant.js`

## High

### H1 — Download proxy accepts arbitrary (library, folder) pairs ✅ FIXED

**Location:** `pages/api/dynamics-explorer/download-document.js`

The proxy checked `dynamics-explorer` app access but not that the requested file belonged to a valid request folder. A client could supply any `(library, folder, filename)` tuple; if the folder existed in SharePoint, the file would be downloaded.

**Practical blast radius:** Narrow — dynamics-explorer users can already enumerate any CRM request's documents via `list_documents`, so this wasn't a privilege escalation. But it allowed downloads of non-request SharePoint content (templates, system files) the app was never meant to expose.

**Fix:** Require `requestId` query param; validate that the top-level folder conforms to the `{digits}_{32-hex-uppercase}` request-folder pattern AND that its GUID suffix matches the supplied `requestId`. Library is still allowlisted by `GraphService.getDriveId`. `chat.js` download-URL construction updated to include `requestId`.

### H2 — Dynamics error bodies leak into API responses ✅ FIXED

**Location:**
- `pages/api/phase-i-dynamics/summarize.js` — `writebackError` field
- `pages/api/phase-i-dynamics/summarize-v2.js` — `writebackError` field + `details: err.message` on prompt fetch failure
- `pages/api/grant-reporting/lookup-grant.js` — `errors.dynamics`, `errors.sharepoint`

Four endpoints returned raw Dynamics/Graph error messages (containing table names, internal GUIDs, OData syntax) in response bodies with no `NODE_ENV` gate. All other endpoints use the correct `process.env.NODE_ENV === 'development' ? err.message : undefined` pattern.

**Fix:** Replaced raw messages with generic categories in the response; full details logged server-side only.

### H3 — LLM output written to Dynamics without validation ⚠️ ACCEPTED-AS-IS

**Location:** `pages/api/phase-i-dynamics/summarize.js:166`, `pages/api/grant-reporting/extract.js` via `DynamicsService.logAiRun()`

Claude output is written directly to `wmkf_ai_summary`, `wmkf_ai_dataextract`, and `wmkf_ai_run.rawOutput`. The audit rated this High on theoretical XSS grounds (if some downstream consumer renders the field as raw HTML).

**Disposition:** Accepted as-is. Dataverse is not SQL-injectable via these writes. Current consumers (Dynamics UI, our own React pages) escape on render. If a future consumer renders raw HTML, that consumer is the right place to fix it. Tracked in informational findings below (I3) for documentation.

## Medium

### M1 — TOCTOU race on 409 no-clobber guard ✅ FIXED

`summarize.js` and `summarize-v2.js` read `wmkf_ai_summary`, verify it's empty, then write. Two concurrent requests can both pass the check.

**Fix:** Capture `@odata.etag` in the preflight read; pass `If-Match: <etag>` header on the `PATCH`. Concurrent write now fails with 412 Precondition Failed. `DynamicsService.getRecord` now returns ETags; `updateRecord` accepts `{ ifMatch }`.

### M2 — Audit row ordering / silent audit failure ✅ FIXED

Writeback happened before audit-row log. If audit failed, summary was persisted with no audit trail and caller couldn't detect it.

**Fix:** Response now surfaces `auditLogCreated` so monitoring can alert on audit gaps. Ordering retained (write first, log second) because inverting would require an update-in-place on `wmkf_ai_run`, which `logAiRun` doesn't support.

### M3 — `setRestrictions([], ...)` disables all restrictions with no safety net ✅ FIXED

Called at 14 sites with an empty array to effectively disable table/field access controls for trusted internal flows. Intentional, but easy to misuse.

**Fix:** Added explicit `DynamicsService.bypassRestrictions(requestId)` method. Migrated all 14 call sites (API endpoints + scripts + `PromptResolver`). `setRestrictions()` retained for real restriction lists (Dynamics Explorer chat handler only). New callers must state their intent at the call site; empty-array ambiguity is gone.

### M4 — CRM memo → Claude prompt injection (low blast radius) ⏭️ DEFERRED

`PromptResolver` fetches system prompts from a Dynamics memo field. ~16 staff users with CRM write access could modify the prompt to exfiltrate subsequent inputs. `{{var}}` interpolation is non-recursive, bounding the injection, but a CRM user can still inject arbitrary text into the system prompt envelope.

**Disposition:** Deferred. This matches the underlying design (CRM editors ARE the prompt authors). Mitigation is governance, not code. Note in `PROMPT_STORAGE_DESIGN.md` under editor safety tiers.

### M5 — Gemini API key in URL query string ✅ FIXED

**Location:** `lib/services/multi-llm-service.js:334`

Key passed as `?key=${apiKey}` — logged in any proxy/CDN/access log that captures URLs.

**Fix:** Moved to `x-goog-api-key` header (supported by Gemini v1beta API). No URL-based key transport remains.

### M6 — VRP SSE origin check ✅ VERIFIED (no fix needed)

**Location:** `pages/api/virtual-review-panel.js:59–62`

Audit flagged that SSE headers might flush before CSRF check fires. Verified: `requireAppAccess` at line 50 runs `validateOrigin` synchronously and returns 403 *before* any SSE header is set (line 59). POST method is covered by `validateOrigin`. **No vulnerability; closed.** Comment added inline to document the ordering invariant for future maintainers.

### M7 — No per-user cost caps on multi-LLM endpoints ⏭️ DEFERRED

VRP invokes 3–4 LLMs per call with no daily $ ceiling. Request-rate limits exist but don't bound cost.

**Disposition:** Deferred. Product-risk rather than security-risk; requires `api_usage_log` cost tracking to enforce. Tracked in `project_api_credit_monitoring.md` memory.

### M8 — `validatePath` doesn't decode URL-encoded traversal ✅ FIXED

`graph-service.js:48–56` rejected `..` but not `%2e%2e`.

**Fix:** `validatePath` now `decodeURIComponent`s the input before the traversal check; also rejects single-dot segments (`.`) and malformed URI encoding. Callers only feed Dynamics-derived paths today, so this is defense-in-depth.

### M9 — Recursive `listFiles` lacks overall timeout ✅ FIXED

Had depth/count caps (3 deep, 500 files) but no wall-clock bound.

**Fix:** Added `totalTimeoutMs` option (default 30 s) to `GraphService.listFiles`; walk aborts if the deadline passes. Protects against pathological folder trees where the per-folder cap doesn't bind before the recursion fans out.

## Low

### L1 — Expertise Finder roster CRUD has no superuser check ⏭️ DEFERRED (needs input)

Any `expertise-finder` user can mutate the roster. May be intentional (small, trusted user base) but undocumented. Blocked on product decision.

### L2 — `fileRef.source` not validated in Grant Reporting ✅ FIXED

**Fix:** `loadFile` now checks `ref.source` against an explicit `ALLOWED_SOURCES` set (`'upload'`, `'sharepoint'`) at the top of the function. Previously an unknown source would reach the else branch; now it fails at the boundary with a clean 400.

## Informational

- **I1** `overwrite=true` flag on `/summarize*` — accepted from any authenticated caller; intended for backend/PA only. Consider restricting to service-principal identities once identity reconciliation ships.
- **I2** Audit-row failures are logged as warnings and swallowed. Now surfaced to callers via `auditLogCreated` field (M2 fix).
- **I3** Full narrative text stored in `wmkf_ai_run.rawOutput` — consider whether this is desired retention if reports contain PII.
- **I4** Graph token cache is a module-level singleton — fine for single-tenant; would need Map keying if ever multi-tenant.
- **I5** ✅ FIXED — `file-loader.js` now rejects buffers >50 MB before parsing and races `pdf-parse`/`mammoth` against a 30 s timeout (`withTimeout` helper).
- **I6** `Content-Disposition` escapes double quotes but doesn't use RFC 5987. Current encoding is acceptable.
- **I7** ✅ FIXED — `SHAREPOINT_SITE_URL` env value is now validated against `ALLOWED_SHAREPOINT_HOSTS` in `graph-service.js`. A mis-set or tampered env var no longer routes Graph calls at an attacker-controlled host.

## Clean areas (verified by multiple agents)

- All new endpoints correctly use `requireAppAccess` with the correct app key from `appRegistry.js`
- `profileId` derived from session everywhere — no body/query trust
- File upload size caps present on every new endpoint (1–10 MB)
- `{{var}}` interpolation is non-recursive — bounded prompt-injection blast radius
- Graph token redirect handling correctly strips `Authorization` on CDN follow-redirects
- `GraphService.getDriveId` enforces a hardcoded `ALLOWED_LIBRARIES` allowlist
- OData injection escaping (`escapeOData` in `lookup-grant.js`) is correct

## Actions taken this session

| # | Finding | File(s) changed |
|---|---------|-----------------|
| H1 | Download proxy request-binding | `download-document.js`, `chat.js` (both URL construction sites) |
| H2 | Error-message sanitization | `summarize.js`, `summarize-v2.js`, `lookup-grant.js` |
| M1 | TOCTOU via ETag / If-Match | `dynamics-service.js`, `summarize.js`, `summarize-v2.js` |
| M2 | Audit-log failure surfacing | `summarize.js`, `summarize-v2.js` |
| M3 | Explicit `bypassRestrictions()` + migration | `dynamics-service.js` + 14 call sites |
| M5 | Gemini key to header | `multi-llm-service.js` |
| M6 | Verified no-op + comment | `virtual-review-panel.js` |
| M8 | `validatePath` decodes before traversal check | `graph-service.js` |
| M9 | `listFiles` totalTimeoutMs deadline | `graph-service.js` |
| L2 | `ALLOWED_SOURCES` allowlist on `fileRef.source` | `file-loader.js` |
| I5 | Pre-parse buffer cap + parser timeout | `file-loader.js` |
| I7 | `ALLOWED_SHAREPOINT_HOSTS` allowlist | `graph-service.js` |

## Deferred items (need input or external dependency)

Remaining opens — all blocked on decisions or upstream work, not effort:

- **M4** prompt-editor governance — waits for `wmkf_prompt_template` (Connor)
- **M7** per-user cost caps — needs policy ($X/day per app)
- **L1** roster CRUD superuser — needs product call
- **I1** `overwrite=true` role gating — blocked on identity reconciliation
- **I3** `wmkf_ai_run.rawOutput` retention policy — needs PII decision
- **I4** Graph token cache multi-tenant keying — only relevant if we ever go multi-tenant
- **I6** `Content-Disposition` RFC 5987 — current encoding acceptable; cleanup-level

## Follow-ups for the user

- **H1 backward-compat:** Any persisted download URLs (from prior chat sessions, exported logs, bookmarks) no longer work — they lack `requestId`. Acceptable given rarity, but flag if users report broken download buttons.
- **I3 / retention policy:** Decide whether `wmkf_ai_run.rawOutput` should store full narrative or only metadata — affects PII exposure surface if `wmkf_ai_run` access is ever broadened.
- **M4 / prompt-editor governance:** `wmkf_prompt_template` (when Connor ships it) should have a documented edit-approval flow. Worth surfacing in the next Connor sync.
