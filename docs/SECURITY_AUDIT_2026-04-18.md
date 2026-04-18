# Security Audit — 2026-04-18

**Baseline:** `SECURITY_ARCHITECTURE.md` v3.5 (2026-03-11)
**Auditor:** Three-workstream delta audit (Dynamics/prompt, new apps, SharePoint/files)
**Scope:** 25 commits since the last audit, covering four new apps, Dynamics write access, and the `PromptResolver` service.

## Summary

| Severity | Count | Acted on this session |
|----------|-------|-----------------------|
| Critical | 0 | — |
| High | 3 | 3 |
| Medium | 9 | 5 |
| Low | 2 | 0 (batched for later) |
| Informational | 7 | 2 |

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

### M3 — `setRestrictions([], ...)` disables all restrictions with no safety net ⏭️ DEFERRED

Called at 10+ sites with an empty array to effectively disable table/field access controls for trusted internal flows. Intentional, but easy to misuse.

**Disposition:** Deferred to hardening pass. Fix is cosmetic — rename the sentinel or add an explicit `bypassRestrictions: true` flag. No active exploit.

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

### M8 — `validatePath` doesn't decode URL-encoded traversal ⏭️ DEFERRED

`graph-service.js:48–56` rejects `..` but not `%2e%2e`. Today's callers only feed Dynamics-derived paths, so not exploitable.

**Disposition:** Deferred. Fix is a two-line `decodeURIComponent` + re-check. Tracked for hardening pass.

### M9 — Recursive `listFiles` lacks overall timeout ⏭️ DEFERRED

Has depth/count caps (3 deep, 500 files) but no wall-clock timeout or cycle detection. SharePoint shouldn't produce cycles, but pathological trees could still stall the walk.

**Disposition:** Deferred. Fix is an `AbortController` wrapping the recursive call.

## Low

### L1 — Expertise Finder roster CRUD has no superuser check ⏭️ DEFERRED

Any `expertise-finder` user can mutate the roster. May be intentional (small, trusted user base) but undocumented.

### L2 — `fileRef.source` not validated in Grant Reporting ⏭️ DEFERRED

Client can set arbitrary `source` values; `loadFile` handles unknowns safely but a source-allowlist would be tighter.

## Informational

- **I1** `overwrite=true` flag on `/summarize*` — accepted from any authenticated caller; intended for backend/PA only. Consider restricting to service-principal identities once identity reconciliation ships.
- **I2** Audit-row failures are logged as warnings and swallowed. Now surfaced to callers via `auditLogCreated` field (M2 fix).
- **I3** Full narrative text stored in `wmkf_ai_run.rawOutput` — consider whether this is desired retention if reports contain PII.
- **I4** Graph token cache is a module-level singleton — fine for single-tenant; would need Map keying if ever multi-tenant.
- **I5** `file-loader.js` does minimal size/MIME validation before feeding PDFs/DOCX to parsers. Zip-bomb / OOM risk is theoretical; 10MB upstream cap mitigates.
- **I6** `Content-Disposition` escapes double quotes but doesn't use RFC 5987. Current encoding is acceptable.
- **I7** SharePoint site URL is env-driven; if ever attacker-controlled would enable SSRF. Hardcoding to known tenant is worth doing as cleanup.

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
| M5 | Gemini key to header | `multi-llm-service.js` |
| M6 | Verified no-op + comment | `virtual-review-panel.js` |

## Deferred items (hardening pass)

M3, M4, M7, M8, M9, L1, L2 — none are actively exploitable; all are bounded by current app scope or user base. Revisit before:
- Opening `expertise-finder` access more broadly (L1)
- Routing any externally-controlled input through `validatePath` (M8)
- Adding any endpoint whose caller identity isn't a session user (I1)

## Follow-ups for the user

- **H1 backward-compat:** Any persisted download URLs (from prior chat sessions, exported logs, bookmarks) no longer work — they lack `requestId`. Acceptable given rarity, but flag if users report broken download buttons.
- **I3 / retention policy:** Decide whether `wmkf_ai_run.rawOutput` should store full narrative or only metadata — affects PII exposure surface if `wmkf_ai_run` access is ever broadened.
- **M4 / prompt-editor governance:** `wmkf_prompt_template` (when Connor ships it) should have a documented edit-approval flow. Worth surfacing in the next Connor sync.
