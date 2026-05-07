# Dynamics Explorer Security Fixes (Gemini Assessment)

**Date:** March 2026
**Source:** Independent security review (Gemini) of the Dynamics Explorer restriction system
**Scope:** `lib/services/dynamics-service.js`, `pages/api/dynamics-explorer/chat.js`

---

## Architecture Background

The Dynamics Explorer restriction system has **dual-layer enforcement**:

1. **Chat-level** (`chat.js`) — `checkRestriction(toolName, input, restrictions)` runs before each tool call. Restrictions are passed as a parameter (request-scoped).
2. **Service-level** (`dynamics-service.js`) — `DynamicsService.checkRestriction(tableName, selectFields)` runs inside each query method. Uses module-level `activeRestrictions` variable (defense-in-depth).

---

## Finding 1: Module-Level Restriction State (Concurrency Risk)

**Severity:** Low (mitigated by architecture)
**Status:** Mitigated with detection

**Problem:** `activeRestrictions` is a module-level variable in `dynamics-service.js`. In theory, concurrent requests on a warm Vercel function instance could see each other's restrictions.

**Mitigating factors:**
- Vercel Node.js functions handle requests serially within a single instance (single-threaded event loop)
- The chat-level check already receives restrictions as a request-scoped parameter — this is the primary enforcement
- The service-level check is defense-in-depth

**Fix applied:** Added `_restrictionRequestId` alongside `activeRestrictions`. Each chat handler invocation generates a unique `requestId` (via `crypto.randomUUID()`). `setRestrictions(restrictions, requestId)` stores both. `checkRestriction()` logs a warning if the requestId doesn't match, providing observability into any state leakage without risk of false-positive blocking.

**Full AsyncLocalStorage was considered but rejected** — it would be overengineered for this codebase where the chat-level check is already request-scoped.

---

## Finding 2: $expand Sideloading Bypass

**Severity:** Medium
**Status:** Fixed

**Problem:** `checkRestriction()` validated the primary table and `$select` fields but ignored `$expand`. A crafted `$expand` could reference restricted tables/fields via navigation properties, bypassing both enforcement layers.

**Fix applied (both layers):**

- **Service-level:** `checkRestriction()` now accepts an optional third parameter `expandParam`. When present, it parses each navigation property from the expand string. For table-level restrictions, it checks if the navigation property name contains the restricted table name. For field-level restrictions, it checks if the nested `$select` inside a navigation property contains the restricted field.
- **Chat-level:** Same logic applied to `input.expand` in the chat-level `checkRestriction()`.
- **Callers:** `queryRecords()` and `getRecord()` now pass `expand` to `checkRestriction()`.

Parsing approach: splits on commas not inside parentheses to handle nested query options like `nav($select=a,b)`.

---

## Finding 3: Fail-Open on DB Error (Highest Priority)

**Severity:** High
**Status:** Fixed

**Problem:** `getActiveRestrictions()` in `chat.js` caught DB errors and returned `[]`, meaning if the database was down, all restrictions were silently bypassed. Additionally, `activeRestrictions` initialized as `[]` in `dynamics-service.js`, so if `setRestrictions()` was never called, the service layer was wide open.

**Fix applied (two changes):**

1. **`chat.js`:** Removed the `catch { return []; }` from `getActiveRestrictions()`. DB errors now propagate up to the handler's existing error handler, which sends an SSE error event and ends the request. If we can't load the security policy, we must not proceed.

2. **`dynamics-service.js`:** Changed `let activeRestrictions = [];` to `let activeRestrictions = null;`. Added a guard at the top of `checkRestriction()`: if `activeRestrictions` is null, it throws `"Restrictions not initialized"`. This makes the service layer fail-closed by default.

---

## Finding 4: Service Principal Permission Scope (Azure Admin Action)

**Severity:** Medium
**Status:** Requires Azure admin action (not a code change)

**Problem:** The Dynamics service principal may have broader CRM permissions than needed. The restriction system is an application-level control, but the underlying service principal could bypass it by accessing the API directly.

**Recommendation:** Configure the Dynamics application user with a minimal security role that only grants read access to the tables actually needed by the Explorer. This is an Azure AD / Dynamics admin action, not a code change.

**Already documented in:** `docs/PENDING_ADMIN_REQUESTS.md`

---

## Files Modified

| File | Changes |
|------|---------|
| `lib/services/dynamics-service.js` | Null init for activeRestrictions, requestId tracking, $expand validation in checkRestriction(), expand param passed from queryRecords/getRecord |
| `pages/api/dynamics-explorer/chat.js` | Removed catch-return-[] from getActiveRestrictions(), requestId generation, $expand validation in chat-level checkRestriction() |

## Verification

- `npm run build` — no syntax/import errors
- `npm test` — all existing tests pass
- Normal queries work: `setRestrictions([])` makes activeRestrictions an empty array, all queries pass
- Table-level restriction blocks direct query AND `$expand` navigation properties
- Field-level restriction blocks direct `$select` AND nested `$expand` `$select`
- DB failure in `getActiveRestrictions()` causes request to fail with error (not silent bypass)
- Service-level queries before `setRestrictions()` throw "Restrictions not initialized"
