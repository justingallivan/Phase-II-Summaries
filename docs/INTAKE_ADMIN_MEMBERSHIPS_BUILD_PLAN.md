# Intake Admin — Membership Approval Build Plan

**Status:** Draft v2 (2026-05-13). Revised against Codex review `docs/INTAKE_ADMIN_MEMBERSHIPS_BUILD_PLAN_CODEX_REVIEW.md` — folds in 2 HIGH + 5 MODERATE + 4 LOW + 1 NIT. Unblocked. Ready to build once `wmkf_portal_membership` entity exists in Dataverse (schema-deploy step, separate from this plan).

**Predecessor:** `docs/INTAKE_PORTAL_DESIGN.md` (schema + Option A approval-workflow decision at line 557, captured 2026-05-13).

**Memory:** `project_intake_portal_pilot_decisions_2026-05-13.md` — Item 1A locks Option A: institution-claim approval lives at `/apply/admin/memberships` under a new `intake-admin` app key.

---

## 1. Scope of this slice

The staff-facing surface that approves or rejects pending **`wmkf_portal_membership`** rows produced by the applicant-side institution-claim flow. This slice covers:

- New app key `intake-admin` registered in `shared/config/appRegistry.js`.
- Route `/apply/admin/memberships` — list of pending membership requests with approve / reject actions.
- API endpoints `/api/apply/admin/memberships*` — GET list, POST approve, POST reject.
- Middleware carve-out so staff sessions can reach `/apply/admin/*` paths (currently `/apply/*` is applicant-only).
- Audit hooks via `IntakeAuditService.log` for every state-changing call (parity with the rest of the portal).

**Not in this slice:**
- Applicant-side institution-search / claim UX that creates the pending rows (separate slice; see `INTAKE_PORTAL_DESIGN.md` § "Entry path: self-serve sign-in" → "EIN reconciliation"). The cross-slice contract that applicant flow must honor is documented in § 9 below.
- Admin views for submitted requests, opportunity status, or any other intake-admin function — separate slices once Sarah's field inventory lands.
- `wmkf_portal_membership` entity creation in Dataverse — that's a one-time schema-deploy step under existing delegated authority (`project_dataverse_creator_privileges`), cataloged in `INTAKE_PORTAL_SCHEMA_CHANGES.md` after the fact. It is a **hard prerequisite**, not optional background work; the admin slice cannot exercise real GET/approve/reject without entity, relationship names, alternate key, and choice values existing.
- Email notifications on approve / reject — deferred to a PA trigger (Connor) once the row update pattern is stable.

**Why this slice first:** the entire applicant entry path depends on staff being able to act on pending membership rows. Without it, applicants who don't already have an approved membership are stuck. Building admin before applicant UX also lets us validate the row-state machine (`requested` → `approved` / `rejected` / `revoked`) before any user-facing flow writes rows.

---

## 2. Schema (no new fields — entity must exist)

This slice assumes `wmkf_portal_membership` already exists in Dataverse with the shape locked at `INTAKE_PORTAL_DESIGN.md` line 100 (Field table). Deploy steps follow the gotcha checklist at `project_dataverse_schema_deploy_gotchas.md` (30s-backoff between metadata writes; PascalCase `@odata.bind` keys).

### Semantic contract for disposition fields

The Codex review flagged that reusing `_wmkf_approvedby_value` / `wmkf_approvedat` to carry rejection state changes the schema semantics. We adopt the **"decided by / decided at"** semantic contract for the pilot:

| Field | Display name (Dataverse) | Pilot semantic | Phase 1+ |
|---|---|---|---|
| `_wmkf_approvedby_value` | "Staff approver" | **Decided by** — populated on both approve and reject; never null after either action | Rename to "Decided by" at Phase 1+ schema review, or split into separate `decidedby` field |
| `wmkf_approvedat` | "Approved at" | **Decided at** — UTC timestamp of either disposition | Same rename or split |
| `wmkf_rejectionreason` | "Rejection reason" | Populated **only** when `wmkf_approvalstatus='rejected'`; null otherwise | Unchanged |

Any future PA flow or report that reads these fields must filter on `wmkf_approvalstatus` to interpret correctly — e.g., "approvals last week" is `wmkf_approvalstatus='approved' AND wmkf_approvedat >= last_week`, not "wmkf_approvedat IS NOT NULL." Document this in the Atlas page for `wmkf_portal_membership` when slice 0 lands.

### Fields touched by this slice

| Field | Read | Write (approve) | Write (reject) |
|---|---|---|---|
| `wmkf_portal_membershipid` | ✓ | — | — |
| `_wmkf_contact_value` | ✓ | — | — |
| `_wmkf_account_value` | ✓ | — | — |
| `wmkf_role` | ✓ | — | — |
| `wmkf_approvalstatus` | ✓ (filter on `'requested'`) | set `'approved'` | set `'rejected'` |
| `_wmkf_requestedby_value` | ✓ | — | — |
| `wmkf_requestedat` | ✓ | — | — |
| `_wmkf_approvedby_value` | — | set to staff `systemuserid` (Decided by) | set to staff `systemuserid` (Decided by) |
| `wmkf_approvedat` | — | set `utcNow()` (Decided at) | set `utcNow()` (Decided at) |
| `wmkf_rejectionreason` | — | set to `null` (clear if re-approving previously-rejected) | set to body reason |
| `statecode` | ✓ | — (stays active) | — (stays active; `approvalstatus` carries the rejection state) |
| `@odata.etag` | ✓ (returned in GET; required by approve/reject `If-Match`) | (consumed; new etag returned) | (consumed; new etag returned) |

Note: `wmkf_approvalstatus='rejected'` keeps `statecode='active'` so the row is still queryable and the alternate key `(contact, account)` prevents a duplicate on re-application. Setting `statecode='inactive'` is reserved for `wmkf_approvalstatus='revoked'` (staff cuts off a previously-approved member; out of slice scope).

### Lookup writes — `@odata.bind` syntax

The read-side lookup shadow field is `_wmkf_approvedby_value`, but **writes use the navigation-property `@odata.bind`** in PascalCase per `project_dataverse_schema_deploy_gotchas.md`. The exact bind key (e.g., `wmkf_ApprovedBy@odata.bind` or whatever the relationship name lands at) is determined at slice 0 schema deploy and recorded on the Atlas page for `wmkf_portal_membership`. Do not hard-code the bind key in this plan until that name exists.

---

## 3. App registry + permissions

Add to `shared/config/appRegistry.js` (which is an **array** of objects, not a keyed map):

```js
{
  key: 'intake-admin',
  name: 'Intake Admin',
  href: '/apply/admin',                    // Layout reads app.href
  icon: '🛂',
  categories: ['admin'],                    // array, not singular `category`
  description: 'Approve institution memberships and review submitted requests from the applicant portal.',
}
```

Confirm exact field names against the live registry before editing — earlier draft used `route` / `category` (keyed-object shape) which Codex flagged as not matching Layout's reader.

**Not in `DEFAULT_APP_GRANTS`.** Granted manually via `/admin` to staff who run pilot triage. Pilot grants list (post-decision 2026-05-13): Justin + one other Foundation staff TBD. Sarah opt-in if she wants visibility during pilot.

Layout nav: the icon appears in the app menu for granted staff, filtered the same way every other app is.

---

## 4. Middleware carve-out

Today, `middleware.js` line 100 routes any `/apply/*` request as applicant-only:

```js
const isApplicantSurface = pathname?.startsWith('/apply') || pathname?.startsWith('/api/apply');
```

Add a staff-admin exception **before** that check, with **exact-or-slash** prefix matching (Codex LOW #8 — `startsWith('/apply/admin')` alone would also match `/apply/administrator`):

```js
const isStaffAdminSurface =
  pathname === '/apply/admin' ||
  pathname?.startsWith('/apply/admin/') ||
  pathname === '/api/apply/admin' ||
  pathname?.startsWith('/api/apply/admin/');

if (isStaffAdminSurface) {
  // Staff admin paths inside /apply/* — accept only staff sessions; reject
  // applicant sessions. App-level access enforced at the route via
  // requireAppAccess(req, res, 'intake-admin').
  if (token?.userType === 'applicant') return false;
  return !!token?.azureId;
}
```

This **must precede** the existing `/apply` applicant check, since `/apply/admin/*` would otherwise be matched as applicant-surface first.

CSP headers continue to apply unchanged — the carve-out is inside the same `authorized` callback.

### Verification matrix

`withAuth`'s `authorized` callback returning `false` produces a **`/auth/signin` redirect** (NextAuth's `pages.signIn` default), not an HTTP 403 response. The plan distinguishes:

| Caller | Path | Outcome |
|---|---|---|
| Anonymous (no token) | `/apply/admin/memberships` | Middleware → redirect to `/auth/signin` (staff branch) |
| Applicant session | `/apply/admin/memberships` | Middleware returns false → redirect to `/auth/signin` (not 403) |
| Applicant session | `/api/apply/admin/memberships` | Middleware returns false → 401/redirect, before handler runs |
| Staff session, no `intake-admin` grant | `/apply/admin/memberships` (page) | Middleware passes (has `azureId`) → page renders `RequireAppAccess` denial UI ("Access Not Available"); **not** HTTP 403 |
| Staff session, no `intake-admin` grant | `/api/apply/admin/memberships` (API) | Middleware passes → `requireAppAccess` returns **HTTP 403** |
| Staff session, with grant | `/apply/admin/memberships` | Renders page |
| Staff session, with grant | `/api/apply/admin/memberships` | Returns 200 |

Codex MODERATE #3 / LOW #9 fixes: page-route denial for ungranted staff is a client-side guard, not a 403. If a true server-side 403 for the page is desired, add a `getServerSideProps` guard that calls `requireAppAccess` server-side and returns `{ notFound: true }` or a 403 page on failure. Pilot: **client-side guard is sufficient** — matches every other gated page in the app.

---

## 5. API endpoints

All endpoints under `pages/api/apply/admin/memberships/`. The directory `pages/api/apply/` does not currently exist; create it during slice 1. Match conventions from `pages/api/cron/` and `requireAppAccess`-protected routes elsewhere in the app.

### Common contract

- **Method gating:** each route rejects unsupported methods with HTTP 405 (`Allow` header set) before doing any Dataverse work. Matches the convention used by existing API routes.
- **Auth + CSRF:** every route calls `requireAppAccess(req, res, 'intake-admin')` as the first line. `requireAppAccess` runs `validateOrigin` for POST/PUT/PATCH/DELETE before returning access, which provides CSRF protection (same Origin/Referer cookie-bound check used elsewhere). No additional CSRF tokens needed.
- **Impersonation fail-closed:** every write path derives the actor's `systemuserid` via `dataverse-identity-map.js`. If the resolver returns null (no `dynamics_systemuser_id` mapping on the staff profile), the endpoint **fails closed with HTTP 503** and a message ("Staff identity not linked to Dynamics — contact admin"), rather than letting `dynamics-service` silently omit `MSCRMCallerID` and write under the integration service account. Codex MODERATE #7 fix.
- **Optimistic locking:** every write path requires the caller to pass the row's current `@odata.etag` (transported as `If-Match` header or `ifMatch` body field — pick one and document; recommend `If-Match` header for HTTP-native semantics). `dynamics-service.updateRecord` propagates it to Dataverse. On 412 Precondition Failed, the endpoint returns **HTTP 409 Conflict** with a payload like `{ error: 'conflict', currentState: {...} }` so the UI can refresh + re-prompt. Codex HIGH #1 fix.
- **Audit log:** every state-changing call writes a non-blocking `IntakeAuditService.log(eventType, { actorAzureId, targetEntity: 'wmkf_portal_membership', targetId, payloadDigest, ... })` row with `eventType` in `['membership.approve', 'membership.reject']`. Failures swallowed and warned so audit unavailability never blocks an approval. Codex MODERATE #4 fix.

### `GET /api/apply/admin/memberships`

Lists memberships filtered by status. Query: `?status=requested` (default), `?status=rejected`, `?status=all`. Pagination via `?top=50&continuationToken=...` (use `queryAllRecords` for simplicity at pilot scale — ~25 rows expected).

Response shape:

```json
{
  "memberships": [
    {
      "id": "guid",
      "etag": "W/\"123456\"",
      "contact": { "id": "guid", "name": "Erika Espinosa-Ortiz", "email": "..." },
      "account": { "id": "guid", "name": "Utah State University" },
      "role": "submitter",
      "approvalStatus": "requested",
      "requestedBy": { "id": "guid", "name": "Erika Espinosa-Ortiz" },
      "requestedAt": "2026-05-12T14:22:00Z",
      "decidedBy": null,
      "decidedAt": null,
      "rejectionReason": null
    }
  ]
}
```

`etag` is **required** in the response — the UI passes it back on subsequent approve/reject calls. Dataverse returns ETags via the `Prefer: return=representation` header plus `@odata.etag` projection; verify `dynamics-service.queryRecords` propagates it. If not, add the projection.

Performance: Dataverse `$expand=` on `_wmkf_contact_value` and `_wmkf_account_value` to avoid N+1 lookups. Cache nothing — admin staff want fresh state.

### `POST /api/apply/admin/memberships/[id]/approve`

Headers: `If-Match: <etag from GET>` (required). Body: `{}`.

Validations (in order):
- 405 if not POST.
- 403 from `requireAppAccess` if no grant.
- 503 if caller doesn't resolve to a Dynamics systemuser.
- 400 if `If-Match` header missing.
- Read row, current `wmkf_approvalstatus` must be `'requested'` or `'rejected'` (re-approving a previously rejected row is a legitimate undo path). 409 if `'approved'` (idempotent — return current state with 200 instead). 422 if `'revoked'` (separate flow).

Side effects (single Dataverse PATCH with `If-Match` header):
- `wmkf_approvalstatus` → `'approved'`
- `wmkf_ApprovedBy@odata.bind` → `/systemusers(<caller-systemuserid>)` (actual bind key name set at slice 0; this is illustrative)
- `wmkf_approvedat` → `new Date().toISOString()`
- `wmkf_rejectionreason` → `null` (clear if re-approving previously-rejected row)

On 412 Precondition Failed from Dataverse: return HTTP 409 `{ error: 'conflict', currentState: <re-fetched row> }`.

Audit log: `IntakeAuditService.log('membership.approve', { actorAzureId: session.azureId, targetEntity: 'wmkf_portal_membership', targetId: id, priorStatus, payloadDigest })`.

Response: `{ id, etag: <new>, approvalStatus: 'approved', decidedBy: { id, name }, decidedAt }`.

### `POST /api/apply/admin/memberships/[id]/reject`

Headers: `If-Match: <etag>` (required). Body: `{ reason: string }` — required, 1–500 chars, trimmed. Reject empty / missing with 400.

Validations (in order): same auth/impersonation/etag chain as approve, plus body-shape validation.

State transitions:
- Current `'requested'` → `'rejected'` (normal path).
- Current `'rejected'` → idempotent 200 with current state, no PATCH issued unless reason differs (in which case PATCH the new reason and re-stamp Decided at).
- Current `'approved'` → 422 (revoke is a separate flow).
- Current `'revoked'` → 422.

Side effects (single Dataverse PATCH with `If-Match` header):
- `wmkf_approvalstatus` → `'rejected'`
- `wmkf_ApprovedBy@odata.bind` → caller's systemuser (Decided by)
- `wmkf_approvedat` → `new Date().toISOString()` (Decided at)
- `wmkf_rejectionreason` → trimmed body `reason`
- `statecode` stays `active`.

Audit log: `IntakeAuditService.log('membership.reject', { ..., payloadDigest including hash of reason })`.

Response: `{ id, etag: <new>, approvalStatus: 'rejected', decidedBy: { id, name }, decidedAt, rejectionReason }`.

---

## 6. UI

Single page at `pages/apply/admin/memberships.js`. Page-level guard via `RequireAppAccess` with `appKey="intake-admin"`. The page renders inside the standard `Layout` since staff are signed in.

### Page structure

```
┌─ Layout (staff nav) ───────────────────────────────────┐
│ 🛂 Membership Approval                                 │
│                                                        │
│  Tabs: [Pending (N)] [Rejected] [All]                  │
│                                                        │
│  ┌─ Table ─────────────────────────────────────────┐   │
│  │ Applicant    │ Institution   │ Role  │ Requested│   │
│  │ Erika E-O    │ Utah State U  │ Sub.. │ 2026-…   │   │
│  │                                                  │   │
│  │  [Approve]   [Reject…]                          │   │
│  └────────────────────────────────────────────────┘   │
│                                                        │
│  Empty state: "No pending memberships." (when list==0) │
└────────────────────────────────────────────────────────┘
```

Reject opens a modal with a textarea (1–500 chars, counted) + Cancel / Confirm Reject buttons. On confirm: POST `/reject` with `{ reason }` and `If-Match: <etag>`, optimistically remove from pending list, toast on success.

Approve fires inline (no modal) with the same etag propagation. Optimistic remove + undo affordance (re-POST `/approve` on undo is idempotent against re-approval). On 409 Conflict from either action: show "Another staff member acted on this row — refreshing" toast, refetch list, and re-prompt.

### State management

Plain React. Fetch list on mount via `useEffect`, refetch on tab change. Don't add SWR or react-query for one page; the app convention is plain `fetch` + local state (mirrors `/admin` page).

### Error handling

- 401 / 403 from API → redirect to `/admin` with an error toast ("You don't have intake-admin access").
- 503 (identity unresolved) → inline banner: "Your staff profile isn't linked to Dynamics — contact admin to reconcile."
- 409 (conflict) → toast + auto-refetch.
- 500 → inline error banner with retry button.
- Approve / reject failure → restore the row to the list, show toast.

---

## 7. Build slices (work breakdown)

Per-commit gates are folded into the slices that introduce the underlying code (Codex LOW #11 fix), not deferred to later slices.

| # | Slice | CI gates landing same commit | Risk |
|---|---|---|---|
| 0 | **Pre-req — `wmkf_portal_membership` entity creation** in Dataverse via the metadata API. Connor design-reviews shape before deploy. Catalog in `INTAKE_PORTAL_SCHEMA_CHANGES.md` + add Atlas page `docs/atlas/dataverse-wmkf-portal-membership.md` (includes bind-key names + Decided-by/at semantic contract). Update `MEMORY.md` slice 0 note. | `check:atlas` | Low — straight schema deploy, summary-after model |
| 1 | App key + middleware carve-out (with exact-or-slash matching) + skeleton page that renders "no memberships" empty state. No API yet. Verifies routing + access control work end-to-end. | none yet | Low |
| 2 | `GET /api/apply/admin/memberships` + table rendering of real rows. Read-only verifies the Dataverse query + `$expand` + ETag projection. | `check:api-routes` row added in same commit | Low |
| 3 | `POST /approve` endpoint + UI button. End-to-end approve flow including `If-Match` propagation, 412→409 mapping, impersonation fail-closed, and audit-log write. | `check:api-routes` row added | Medium — first write path; verify impersonation fires |
| 4 | `POST /reject` endpoint + reject modal. Mirrors slice 3 plus reason validation + audit log with reason-digest. | `check:api-routes` row added | Low |
| 5 | Tabs (Rejected, All), empty states, error toasts, 409 auto-refetch UX polish. | none | Low |

Every slice in 2–4 must update `docs/API_ROUTE_SECURITY_MATRIX.md` in the same commit that introduces the new `pages/api/**/*.js` file — `check:api-routes` will block the commit otherwise.

---

## 8. Verification

Per slice landing:

- **Slice 0:** Atlas page renders, `npm run check:atlas` green, schema introspection script confirms entity, alt-key, choice values present in Dataverse.
- **Slice 1:** `npm run build` clean. Manual matrix from § 4: each row of the verification matrix passes (anonymous redirect, applicant redirect, staff-no-grant client-guard denial, staff-with-grant page render). `/apply/administrator` (and any other near-match) routes correctly per applicant-surface rules — confirm the exact-or-slash check isn't catching siblings.
- **Slice 2:** create one `wmkf_approvalstatus='requested'` row in Dataverse directly via a probe script. Confirm row appears in list with contact + account expanded; `etag` present in response and propagates to the UI.
- **Slice 3:** approve the test row from UI. Verify in Dataverse: `wmkf_approvalstatus='approved'`, `_wmkf_approvedby_value` points to caller's systemuser, `wmkf_approvedat` set, `wmkf_rejectionreason` null. Verify Dataverse audit log shows the **caller** (not the integration service account) — proves `MSCRMCallerID` fired. Verify `intake_audit` Postgres row written with `membership.approve` event_type. Force a stale-etag approve (cached etag from a refetched-but-not-refreshed UI) → confirm 409 + refetch UX. Force an unmapped staff profile → confirm 503 fail-closed.
- **Slice 4:** reject another test row with reason "test rejection." Verify reason persists, `intake_audit` row has reason digest (not the cleartext reason). Force a 412 race → 409 UX.
- **Slice 5:** smoke all three tabs + empty states + the concurrent-action recovery path (two browser windows, both pending, approve in one then approve in the other → 409 UX).

End-to-end smoke target: create a `requested` row → approve it → create another `requested` row → reject it → applicant re-applies (mocked via direct PATCH to set status back to `requested`) → re-approve from "Rejected" tab. Confirm all end states in Dataverse and matching `intake_audit` rows.

---

## 9. Cross-slice contract — applicant-side re-application

This slice is built **before** the applicant institution-claim slice, so the row-state contract that the applicant slice must honor is documented here:

**Rule:** when an applicant attempts to claim membership at an institution where they already have a `wmkf_portal_membership` row (any disposition), the applicant slice does an **upsert by alternate key** `(contact, account)`. It must:

1. **Update the existing row in place**, not create a new one (alt-key prevents duplicate but a naive POST will 409).
2. Set `wmkf_approvalstatus` → `'requested'`.
3. Set `_wmkf_requestedby_value` to the applicant's `contactid`.
4. Set `wmkf_requestedat` to `new Date().toISOString()`.
5. Set `wmkf_rejectionreason` → `null`.
6. **Leave `_wmkf_approvedby_value` and `wmkf_approvedat` populated with the prior decision** (audit trail — last decision stays visible until a new one supersedes). The admin slice's GET should display "Last decision: rejected by X on Y" alongside the new request when re-applying a rejected row, so staff have context.
7. `statecode` stays `active` throughout.

**Disposition table for re-application:**

| Prior `approvalStatus` | After re-apply | Notes |
|---|---|---|
| `requested` | `requested` (no change, idempotent — refresh `requestedat` only) | Applicant re-submitted before staff acted. |
| `rejected` | `requested` (full reset per rules 2–5 above) | Standard re-apply path. Staff sees prior-decision context. |
| `approved` | `approved` (no-op, return current row) | Already in. Don't reset. |
| `revoked` | `requested` (with audit-flag in `intake_audit` payload noting "re-apply after revocation") | Same as rejected, but flag the audit row so staff can spot it. |

The applicant slice owner is the one who implements this; the admin slice's contract is just to **display prior-decision context** in the "Pending" tab when the row's `wmkf_approvedat` is non-null and the current status is `requested`. UI affordance: collapsed "Previously rejected on YYYY-MM-DD: <reason>" detail under the row.

---

## 10. Out of scope (followups for tracking)

- **Bulk approve / reject** — pilot scale (~25 rows total) doesn't justify it. Add if a single staff member ends up handling > 10/day.
- **Email notifications** — PA-trigger on `wmkf_approvalstatus` change; Connor's plate. Don't build into the endpoint.
- **Revocation flow** (`'approved'` → `'revoked'`) — separate slice when a real revocation case comes up.
- **Audit log UI** — `intake_audit` rows are queryable directly from Postgres for now. Build a UI when there's a second consumer of intake-audit data.
- **Submitted-requests admin view** — separate slice, blocked on Sarah's field inventory landing.
- **Rename `_wmkf_approvedby_value` / `wmkf_approvedat` to `decidedby` / `decidedat`** at Phase 1+ schema review — pilot keeps the original names with the semantic contract documented in § 2.

---

## 11. Open questions

None as of 2026-05-13 (post-Codex review). The Option A decision locks the location (`/apply/admin/memberships`), the auth path (`intake-admin` app key), the actor-attribution path (`MSCRMCallerID` impersonation with fail-closed unmapped-staff handling), and the concurrency model (ETag `If-Match` propagation with 412→409 mapping). Schema shape is approved; lookup-bind key names land at slice 0 deploy.

If anything shifts during build, log it inline under `## 11. Open questions` and surface in the next session prompt.
