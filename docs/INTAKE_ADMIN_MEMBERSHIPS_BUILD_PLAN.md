# Intake Admin — Membership Approval Build Plan

**Status:** Draft v3 (2026-05-13). Revised against two Codex review passes (`INTAKE_ADMIN_MEMBERSHIPS_BUILD_PLAN_CODEX_REVIEW.md` + `_V2.md`). v3 grounds every helper call in the live signatures of `lib/services/intake-audit-service.js`, `lib/services/dataverse-identity-map.js`, `lib/services/dynamics-service.js`, `lib/utils/auth.js`, and `pages/api/auth/[...nextauth].js`. Ready to build once `wmkf_portal_membership` exists in Dataverse (slice 0).

**Predecessor:** `docs/INTAKE_PORTAL_DESIGN.md` (schema + Option A decision near line 557, captured 2026-05-13).

**Memory:** `project_intake_portal_pilot_decisions_2026-05-13.md` — Item 1A locks `/apply/admin/memberships` under a new `intake-admin` app key.

---

## 1. Scope of this slice

Staff-facing surface that approves or rejects pending **`wmkf_portal_membership`** rows from the applicant-side institution-claim flow.

In scope:
- New app key `intake-admin` in `shared/config/appRegistry.js`.
- Page `/apply/admin/memberships`.
- API endpoints `/api/apply/admin/memberships*` — GET list, POST approve, POST reject.
- Middleware carve-out so staff sessions reach `/apply/admin/*`.
- Audit hooks via `IntakeAuditService.log` for every state-changing call.

Not in scope:
- Applicant-side claim UX (separate slice; the cross-slice contract it must honor lives in § 9).
- Submitted-requests admin, opportunity status (post-Sarah-inventory slices).
- `wmkf_portal_membership` entity creation in Dataverse — hard prerequisite (slice 0), not optional. The admin slice cannot exercise real GET/approve/reject without entity, alternate key, navigation-property names, and choice values existing.
- Email notifications on approve/reject — PA-trigger, Connor's plate.

**Why this slice first:** the applicant entry path depends on staff acting on pending rows. Building admin before applicant UX also validates the row-state machine (`requested` → `approved`/`rejected`/`revoked`) before any user-facing flow writes rows.

---

## 2. Schema (no new fields — entity must exist)

This slice assumes `wmkf_portal_membership` already exists in Dataverse with the shape locked at `INTAKE_PORTAL_DESIGN.md` line 100. Deploy follows the gotcha checklist at `project_dataverse_schema_deploy_gotchas.md`.

### Semantic contract for disposition fields

Reusing `_wmkf_approvedby_value` / `wmkf_approvedat` to carry rejection state changes the schema semantics. v3 adopts the **"decided by / decided at"** contract:

| Field | Live Dataverse name | Pilot semantic | Phase 1+ |
|---|---|---|---|
| `_wmkf_approvedby_value` | "Staff approver" | **Decided by** — populated on both approve and reject | Rename to `decidedby` at Phase 1+ schema review |
| `wmkf_approvedat` | "Approved at" | **Decided at** — UTC timestamp of either disposition | Same rename |
| `wmkf_rejectionreason` | "Rejection reason" | Populated only when `wmkf_approvalstatus='rejected'`; null otherwise | Unchanged |

Any downstream PA flow or report reading these fields **must filter on `wmkf_approvalstatus`** — "approvals last week" is `approvalstatus='approved' AND approvedat >= last_week`, not `approvedat IS NOT NULL`. Document this in `docs/atlas/dataverse-wmkf-portal-membership.md` at slice 0.

### Fields touched

| Field | Read (GET) | Write (approve) | Write (reject) |
|---|---|---|---|
| `wmkf_portal_membershipid` | ✓ | — | — |
| `_wmkf_contact_value` | ✓ (+ `$expand`) | — | — |
| `_wmkf_account_value` | ✓ (+ `$expand`) | — | — |
| `wmkf_role` | ✓ | — | — |
| `wmkf_approvalstatus` | ✓ | set `'approved'` | set `'rejected'` |
| `_wmkf_requestedby_value` | ✓ (+ `$expand` for name) | — | — |
| `wmkf_requestedat` | ✓ | — | — |
| `_wmkf_approvedby_value` | ✓ for prior-decision display | bind via `@odata.bind` to caller systemuser | bind via `@odata.bind` to caller systemuser |
| `wmkf_approvedat` | ✓ for prior-decision display | set `new Date().toISOString()` | set `new Date().toISOString()` |
| `wmkf_rejectionreason` | ✓ for prior-decision display | set `null` | set trimmed body `reason` |
| `statecode` | ✓ | (stays active) | (stays active; status carries rejection) |
| `@odata.etag` | ✓ | required as `If-Match`; new etag obtained by re-fetch (see § 5) | same |

`wmkf_approvalstatus='rejected'` keeps `statecode='active'` so the row is queryable and the alt-key `(contact, account)` prevents duplicates on re-application. `statecode='inactive'` is reserved for `wmkf_approvalstatus='revoked'` (out of slice scope).

### Lookup writes — `@odata.bind` syntax

Read-side projections use `_wmkf_approvedby_value` (read-only shadow). **Writes use the navigation-property `@odata.bind`** in PascalCase per `project_dataverse_schema_deploy_gotchas.md`. Exact bind keys (e.g., `wmkf_ApprovedBy@odata.bind`) are determined at slice 0 schema deploy and recorded on the Atlas page. Slice 0 must record:

- `wmkf_ApprovedBy@odata.bind` → for approve/reject write
- `wmkf_Contact@odata.bind` → for applicant-side upsert (cross-slice § 9)
- `wmkf_Account@odata.bind` → for applicant-side upsert
- `wmkf_RequestedBy@odata.bind` → for applicant-side write

Do **not** hard-code bind keys in this plan until slice 0 lands them; reference the Atlas page from code.

---

## 3. App registry + permissions

`shared/config/appRegistry.js` is an **array** of objects (not a keyed map). Layout reads `app.href`. Add:

```js
{
  key: 'intake-admin',
  name: 'Intake Admin',
  href: '/apply/admin',
  icon: '🛂',
  categories: ['admin'],
  description: 'Approve institution memberships and review submitted requests from the applicant portal.',
}
```

**Not in `DEFAULT_APP_GRANTS`.** Granted manually via `/admin`. Pilot grants: Justin + one Foundation staff TBD. Sarah opt-in for visibility.

---

## 4. Middleware carve-out

Today `middleware.js` line 100 routes `/apply/*` as applicant-only. Add a staff-admin exception **before** that check, with exact-or-slash matching:

```js
const isStaffAdminSurface =
  pathname === '/apply/admin' ||
  pathname?.startsWith('/apply/admin/') ||
  pathname === '/api/apply/admin' ||
  pathname?.startsWith('/api/apply/admin/');

if (isStaffAdminSurface) {
  if (token?.userType === 'applicant') return false;
  return !!token?.azureId;
}
```

Narrow matching keeps `/apply/administrator` (and any other near-prefix) flowing through the existing applicant rule.

### Verification matrix

`withAuth`'s `authorized` returning `false` produces a `/auth/signin` redirect (NextAuth's `pages.signIn`), not HTTP 403.

| Caller | Path | Outcome |
|---|---|---|
| Anonymous | `/apply/admin/memberships` | Middleware → redirect to `/auth/signin` |
| Applicant session | `/apply/admin/memberships` | Middleware → redirect to `/auth/signin` (not 403) |
| Applicant session | `/api/apply/admin/memberships` | Middleware → 401-style redirect, handler never runs |
| Staff session, no `intake-admin` grant | `/apply/admin/memberships` (page) | Middleware passes → page renders `RequireAppAccess` denial UI; **not HTTP 403** |
| Staff session, no `intake-admin` grant | `/api/apply/admin/memberships` (API) | Middleware passes → `requireAppAccess` returns **HTTP 403** |
| Staff session, with grant | both | Page renders / API returns 200 |

Pilot uses the client-side `RequireAppAccess` guard for the page (matches every other gated page). If a true server-side 403 for the page is ever required, add `getServerSideProps` that calls `requireAuthWithProfile` server-side.

---

## 5. API endpoints

All under `pages/api/apply/admin/memberships/`. The directory `pages/api/apply/` does not currently exist; create it in slice 1. Follow conventions from `pages/api/cron/` and other `requireAppAccess`-protected routes.

### Common contract

Per-route order (single, consistent — Codex NF-06):

1. **Method gate** — `if (req.method !== 'GET'/'POST') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }`.
2. **Auth + CSRF** — `const access = await requireAppAccess(req, res, 'intake-admin')`. Returns `{ profileId, session }` (see `lib/utils/auth.js:302`). `requireAppAccess` invokes `validateOrigin` for POST/PUT/PATCH/DELETE before returning; no extra CSRF needed.
3. **Body / param validation** (writes only).
4. **Impersonation gate** (writes only — see below).
5. **Dataverse work** with ETag plumbing.
6. **Audit log** (writes only — non-blocking, after Dataverse success).

### Impersonation gate (writes only)

Codex NF-02 surfaced two holes beyond an unmapped staff profile:

- `lib/services/dynamics-service.js:166-170`: `_withCallerId` only sets `MSCRMCallerID` when `process.env.DYNAMICS_IMPERSONATION_ENABLED === 'true'`. Otherwise the header is silently omitted.
- `lib/services/dynamics-service.js:188-200`: `_writeFetch` retries once **without** `MSCRMCallerID` on a 403 from the impersonated attempt. Attribution falls back to the service principal for that call (a console.warn fires but the request still succeeds).

Both must be addressed for attribution to be a hard guarantee:

```js
// In approve / reject handler, after requireAppAccess:
if (process.env.DYNAMICS_IMPERSONATION_ENABLED !== 'true') {
  return res.status(503).json({
    error: 'impersonation_disabled',
    message: 'Server is not configured to attribute writes to the acting staff member. Set DYNAMICS_IMPERSONATION_ENABLED=true.',
  });
}

const mapping = await resolveProfileToSystemUser(access.profileId);
// resolveProfileToSystemUser returns null when no entry OR when entry has skip flag
if (!mapping || !mapping.systemuserid) {
  return res.status(503).json({
    error: 'staff_identity_unmapped',
    message: 'Your staff profile is not linked to a Dynamics systemuser — contact admin to reconcile.',
  });
}

const actingUserSystemId = mapping.systemuserid;
```

The 403-fallback hole is harder. Two ways to neutralize it for these routes:

**Option A (preferred — minimal code change to `dynamics-service.js`):** extend `updateRecord` (and `_writeFetch`) with `{ noFallback: true }` so a 403 on the impersonated attempt throws without the retry, and have approve/reject pass `noFallback: true`. Map the thrown 403 to HTTP 403 in the route with a clear "Dataverse rejected impersonation — verify Delegate role on app user."

**Option B (no helper change — post-write verification):** after `updateRecord` returns, re-fetch the row and verify `_modifiedby_value === actingUserSystemId`. If not, treat as failure and audit-log the mismatch. Pilot fallback if Option A slips, but doubles round-trips and races concurrent edits.

Pilot ships Option A — `dynamics-service.js` change is small and benefits any future caller needing strict attribution. Track it as a slice-3 sub-task.

### ETag plumbing (writes only)

`updateRecord` signature (`lib/services/dynamics-service.js:814`): `updateRecord(entitySet, recordId, data, { ifMatch, actingUserSystemId })`. Returns **`Promise<void>`** on success (Dataverse 204). Throws `Error` with `err.status` on failure. **No new ETag is returned** — Codex NF-03.

Strategy:

- GET projects `@odata.etag` for each row in the response (set `Prefer: odata.include-annotations="*"` on `queryRecords` or read the per-row `@odata.etag` from Dataverse's payload — verify in slice 2 which is needed).
- UI sends the etag back as the `If-Match` header on POST.
- After successful `updateRecord` (returns void), the route **re-fetches the row by id** to get the new ETag + a fresh projection. Returns it in the response.
- 412 from Dataverse (concurrent edit) is thrown by `updateRecord` with `err.status === 412`. Catch and return HTTP **409 Conflict** with `{ error: 'conflict', currentState: <re-fetched row> }`.

The `updateIfEmpty` pattern at `lib/services/dynamics-service.js:836+` is prior-art for ETag-driven discriminated outcomes — model the route handlers on it for shape parity.

(Stretch: extend `updateRecord` to accept `{ returnRepresentation: true }` so the post-write re-fetch becomes a single round-trip. Out of scope for v3; tracked as a follow-up.)

### Audit log call shape

`lib/services/intake-audit-service.js:32` signature:

```js
static async log({
  actorOid = null,
  actorType,           // required; must be in ACTOR_TYPES = ['applicant', 'staff', 'system']
  action,              // required; free-form string
  targetEntity = null,
  targetId = null,
  payload = null,      // service hashes this to sha256 internally; do NOT precompute payloadDigest
  metadata = null,
  ipAddress = null,
  userAgent = null,
})
```

For approve / reject:

```js
await IntakeAuditService.log({
  actorOid: access.session.user.azureId,    // session shape per [...nextauth].js:284
  actorType: 'staff',
  action: 'membership.approve',             // or 'membership.reject'
  targetEntity: 'wmkf_portal_membership',
  targetId: membershipId,
  payload: { priorStatus, newStatus, rejectionReason },  // service sha256-hashes
  metadata: { actingUserSystemId },
  ipAddress: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress,
  userAgent: req.headers['user-agent'],
});
```

Wrap in `try/catch`, log a warning on failure, never let audit-write failure block the response.

### `GET /api/apply/admin/memberships`

Query: `?status=requested` (default) | `rejected` | `all`.

Implementation uses `DynamicsService.queryRecords(entitySet, { filter, expand, top, orderby })` per `dynamics-service.js:445`. Pilot scale (~25 rows) fits comfortably under the 100-row cap (`queryRecords` enforces `Math.min(top || 25, 100)`). **Do not use `queryAllRecords`** — it doesn't support `expand` per `dynamics-service.js:616` and the pilot row count doesn't need export-mode unfiltered scanning.

If row count grows past 100, the slice-5 followup is to add `?after=<id>` keyset pagination (filter on `wmkf_requestedat lt <last>`), not a continuation token — Dataverse via this helper doesn't expose continuation tokens.

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
      "priorDecision": null
    }
  ]
}
```

`priorDecision` is populated **for `approvalStatus='requested'` rows where `wmkf_approvedat` is non-null** (Codex NF-05 — the cross-slice re-application contract requires staff to see why this applicant was previously rejected/revoked):

```json
"priorDecision": {
  "status": "rejected",          // last terminal status before re-request — inferred or persisted (see § 9 design note)
  "decidedBy": { "id": "guid", "name": "Staff Lead" },
  "decidedAt": "2026-05-01T10:00:00Z",
  "rejectionReason": "Out of geographic scope"
}
```

For `rejected` and `approved` rows, `priorDecision` is `null` (the row's own status carries that info via `approvalStatus`, `decidedBy`, `decidedAt`).

**Design caveat for slice 0:** the Dataverse row doesn't natively distinguish "this approvedat is for the current rejection" vs. "this approvedat is for a prior rejection before re-application." The applicant-side upsert (§ 9) **preserves** `_wmkf_approvedby_value` / `wmkf_approvedat` / `wmkf_rejectionreason` when flipping status back to `'requested'`. The admin route reads those fields and interprets "status=requested + approvedat non-null" as "this is a re-application; show prior decision." The `priorDecision.status` field is **inferred** from `rejectionReason !== null` (→ rejected) vs. `rejectionReason === null` (→ revoked or approved-then-re-requested). If the inference proves fragile in practice, slice 0 can add `wmkf_priordecisionstatus` (choice) to make it explicit.

### `POST /api/apply/admin/memberships/[id]/approve`

Headers: `If-Match: <etag>` (required, 400 if missing). Body: `{}`.

Validations (in order, per Common contract):
1. 405 if not POST.
2. `requireAppAccess(..., 'intake-admin')` → 403 if no grant.
3. 400 if `If-Match` header missing.
4. Impersonation gate (env flag + identity-map resolution) → 503 on either failure.
5. Read row (single `retrieveRecord`); current `wmkf_approvalstatus` must be `'requested'` or `'rejected'`. 200 idempotent return on already-`'approved'` (refetch + return). 422 on `'revoked'`.

Side effects (single `updateRecord` with `ifMatch` + `actingUserSystemId` + `noFallback: true`):
- `wmkf_approvalstatus: 'approved'`
- `wmkf_ApprovedBy@odata.bind: '/systemusers(<actingUserSystemId>)'` (bind key from Atlas)
- `wmkf_approvedat: new Date().toISOString()`
- `wmkf_rejectionreason: null` (clear if re-approving previously-rejected)

On 412 (caught from `err.status === 412`): return 409 `{ error: 'conflict', currentState: <refetched row> }`.
On 403 with `noFallback` (Dataverse rejected impersonation): return 403 `{ error: 'impersonation_rejected', message: 'Verify Delegate role on app user.' }`.

After PATCH success: re-fetch row to obtain new etag, write audit row, return:
```json
{ "id", "etag", "approvalStatus": "approved", "decidedBy": { "id", "name" }, "decidedAt" }
```

### `POST /api/apply/admin/memberships/[id]/reject`

Headers: `If-Match: <etag>` (required). Body: `{ reason: string }` — required, 1–500 chars trimmed. 400 on empty/missing.

Validations chain mirrors approve, plus body-shape validation step 3.5.

State transitions:
- Current `'requested'` → `'rejected'` (normal).
- Current `'rejected'` → if `reason` differs from stored, PATCH the new reason + re-stamp `decidedAt`. Otherwise idempotent 200.
- Current `'approved'` → 422 (revoke is a separate flow).
- Current `'revoked'` → 422.

Side effects (single `updateRecord` with `ifMatch` + `actingUserSystemId` + `noFallback: true`):
- `wmkf_approvalstatus: 'rejected'`
- `wmkf_ApprovedBy@odata.bind: '/systemusers(<actingUserSystemId>)'`
- `wmkf_approvedat: new Date().toISOString()`
- `wmkf_rejectionreason: <trimmed body reason>`

After PATCH success: re-fetch + audit + return `{ id, etag, approvalStatus, decidedBy, decidedAt, rejectionReason }`.

---

## 6. UI

Single page at `pages/apply/admin/memberships.js`. Wrapped in `RequireAppAccess` with `appKey="intake-admin"`. Renders inside standard `Layout`.

### Structure

```
┌─ Layout (staff nav) ───────────────────────────────────┐
│ 🛂 Membership Approval                                 │
│                                                        │
│  Tabs: [Pending (N)] [Rejected] [All]                  │
│                                                        │
│  ┌─ Table ─────────────────────────────────────────┐   │
│  │ Applicant │ Institution │ Role │ Requested │ … │   │
│  │ Erika E-O │ Utah State  │ Sub. │ 2026-…    │   │   │
│  │   ▸ Previously rejected 2026-05-01: "..."     │   │
│  │   [Approve]   [Reject…]                        │   │
│  └────────────────────────────────────────────────┘   │
│                                                        │
│  Empty: "No pending memberships."                      │
└────────────────────────────────────────────────────────┘
```

Rows with `priorDecision !== null` render a collapsed disclosure showing prior status + reason. Approve/reject use the row's `etag` as `If-Match`.

Reject opens a modal: textarea (1–500 char counter) + Cancel / Confirm. On submit, POST with `If-Match`; optimistic remove.

On 409 (conflict): toast "Another staff member acted — refreshing", auto-refetch list.
On 503 (impersonation off or unmapped): inline banner with the exact error message.
On 403 (impersonation rejected): inline banner pointing to Delegate-role check.

Plain React + `fetch` (mirrors `/admin`).

---

## 7. Build slices

CI gates fold into the slices that introduce them — no deferred "gate" slices.

| # | Slice | CI gate landing same commit | Risk |
|---|---|---|---|
| 0 | **Pre-req — `wmkf_portal_membership` entity creation** in Dataverse. Connor design-reviews shape. Catalog in `INTAKE_PORTAL_SCHEMA_CHANGES.md` + new Atlas page `docs/atlas/dataverse-wmkf-portal-membership.md` (records bind keys, semantic contract, alt-key, choice values). Update `MEMORY.md` note. | `check:atlas` | Low |
| 1 | App key + middleware carve-out (exact-or-slash) + skeleton `/apply/admin/memberships` page (empty state). No API yet. | none | Low |
| 2 | `GET /api/apply/admin/memberships` + table render. Verifies `queryRecords` shape, `$expand`, etag projection. Includes `priorDecision` inference for re-applied rows. | `check:api-routes` row added | Low |
| 3 | `dynamics-service` `updateRecord` `{ noFallback }` extension. `POST /approve` endpoint + UI button. End-to-end with `If-Match`, 412→409, 503 impersonation gate, 403 impersonation-rejected, audit log. | `check:api-routes` row added | Medium |
| 4 | `POST /reject` endpoint + reject modal. | `check:api-routes` row added | Low |
| 5 | Tabs (Rejected, All), priorDecision disclosure UI, error toasts, 409 auto-refetch UX. | none | Low |

Each slice in 2–4 updates `docs/API_ROUTE_SECURITY_MATRIX.md` in the same commit — `check:api-routes` blocks the commit otherwise.

---

## 8. Verification

- **Slice 0:** Atlas page renders all bind keys + alt-key + choice values. `npm run check:atlas` green. `scripts/audit-dataverse-state.js` shows entity present.
- **Slice 1:** verification matrix from § 4 — exercise every row. `/apply/administrator` and other near-prefix paths flow through applicant rules (not staff-admin).
- **Slice 2:** seed one `requested` row directly via Dataverse PATCH script. Confirm GET returns row with `$expand`'d contact + account, `etag` present, `priorDecision: null`. Then PATCH the row to set `wmkf_approvedat` + a `rejectionreason` while leaving status as `requested` (simulates re-application). Confirm GET surfaces `priorDecision`.
- **Slice 3:** approve test row from UI. Verify Dataverse: `approvalstatus='approved'`, `_modifiedby_value === acting staff systemuser` (proves `MSCRMCallerID` fired AND `noFallback` prevented service-principal attribution). Verify `intake_audit` Postgres row with `action='membership.approve'`, `actor_oid=<staff azureId>`, `payload_digest` populated. Force stale etag → 409 + refetch UX. Force `DYNAMICS_IMPERSONATION_ENABLED=false` → 503. Force unmapped staff profile → 503. Revoke Delegate role temporarily → 403 from `noFallback` path.
- **Slice 4:** reject with reason "test rejection." Verify reason persists; `intake_audit` payload includes `rejectionReason`; service hashes to `payload_digest`. Force a 412 race → 409.
- **Slice 5:** all three tabs + empty states + priorDecision disclosure + concurrent-action recovery (two windows).

End-to-end target: seed `requested` → approve → seed another `requested` → reject → simulate applicant re-apply (PATCH back to `requested` preserving prior-decision fields) → confirm priorDecision surfaces in admin GET → re-approve from "Pending" tab.

---

## 9. Cross-slice contract — applicant-side re-application

Built before applicant-side claim slice. The applicant slice must honor this row-state contract:

**Rule:** when an applicant claims membership at an institution where they already have a `wmkf_portal_membership` row (any disposition), the applicant slice **upserts by alternate key** `(contact, account)`:

1. Update existing row in place (alt-key forces this — naive POST would 409 from Dataverse).
2. Set `wmkf_approvalstatus: 'requested'`.
3. Set `wmkf_RequestedBy@odata.bind: '/contacts(<applicant-contactid>)'` (navigation-property `@odata.bind`, **not** the read-only `_wmkf_requestedby_value` shadow field — Codex NF-08).
4. Set `wmkf_requestedat: new Date().toISOString()`.
5. **Preserve** `_wmkf_approvedby_value`, `wmkf_approvedat`, `wmkf_rejectionreason` from the prior decision (the admin route reads these as `priorDecision` context).
6. `statecode` stays active throughout.

### Re-application disposition table

| Prior `approvalStatus` | After re-apply | Notes |
|---|---|---|
| `requested` | `requested` (no-op, just refresh `requestedat`) | Applicant re-submitted before staff acted |
| `rejected` | `requested` (preserve prior-decision fields) | Standard re-apply; admin sees `priorDecision` |
| `approved` | `approved` (no-op) | Already in. Don't reset |
| `revoked` | `requested` (preserve prior-decision fields, audit-flag the row) | Same as rejected, flag in audit payload |

### What the admin slice needs from the applicant slice

- Applicant slice **must preserve** `_wmkf_approvedby_value` / `wmkf_approvedat` / `wmkf_rejectionreason` when flipping `rejected → requested`. Without this, the admin route can't surface prior-decision context.
- Applicant slice writes its own `intake_audit` row with `action='membership.request'` so staff can trace.

### What the admin slice provides to the applicant slice

- The `priorDecision` rendering convention is stable: admin GET surfaces it whenever `status='requested' AND approvedat IS NOT NULL`. Applicant slice should mirror this if it ever surfaces history to applicants.

---

## 10. Out of scope (followups)

- Bulk approve/reject — pilot scale doesn't justify.
- Email notifications — PA-trigger, Connor.
- Revocation flow (`approved → revoked`) — separate slice.
- Audit log UI — `intake_audit` queryable from Postgres directly.
- Submitted-requests admin view — blocked on Sarah's field inventory.
- Field rename `_wmkf_approvedby_value` → `decidedby` — Phase 1+ schema review.
- `updateRecord` `{ returnRepresentation: true }` — single-round-trip alternative to post-write refetch; tracked as nice-to-have.
- Explicit `wmkf_priordecisionstatus` field on the entity if the `rejectionReason !== null` inference proves fragile.

---

## 11. Open questions

None as of v3 (2026-05-13). All HIGH/MODERATE/LOW Codex findings from both review passes are folded in or have explicit followups documented. Live helper signatures verified at:

- `lib/services/intake-audit-service.js:32`
- `lib/services/dataverse-identity-map.js:70`
- `lib/services/dynamics-service.js:166, 188, 445, 616, 814`
- `lib/utils/auth.js:245, 302`
- `pages/api/auth/[...nextauth].js:284-286`

If anything shifts during build, log it inline here.
