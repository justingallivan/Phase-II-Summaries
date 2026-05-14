# Intake Admin — Membership Approval Build Plan

**Status:** Draft 2026-05-13. Unblocked. Ready to build once `wmkf_portal_membership` entity exists in Dataverse (schema-deploy step, separate from this plan).

**Predecessor:** `docs/INTAKE_PORTAL_DESIGN.md` (schema + Option A approval-workflow decision at line 557, captured 2026-05-13).

**Memory:** `project_intake_portal_pilot_decisions_2026-05-13.md` — Item 1A locks Option A: institution-claim approval lives at `/apply/admin/memberships` under a new `intake-admin` app key.

---

## 1. Scope of this slice

The staff-facing surface that approves or rejects pending **`wmkf_portal_membership`** rows produced by the applicant-side institution-claim flow. This slice covers:

- New app key `intake-admin` registered in `shared/config/appRegistry.js`.
- Route `/apply/admin/memberships` — list of pending membership requests with approve / reject actions.
- API endpoints `/api/apply/admin/memberships*` — GET list, POST approve, POST reject.
- Middleware carve-out so staff sessions can reach `/apply/admin/*` paths (currently `/apply/*` is applicant-only).

**Not in this slice:**
- Applicant-side institution-search / claim UX that creates the pending rows (separate slice; see `INTAKE_PORTAL_DESIGN.md` § "Entry path: self-serve sign-in" → "EIN reconciliation").
- Admin views for submitted requests, opportunity status, or any other intake-admin function — those are separate slices once Sarah's field inventory lands.
- `wmkf_portal_membership` entity creation in Dataverse — that's a one-time schema-deploy step under existing delegated authority (`project_dataverse_creator_privileges`), cataloged in `INTAKE_PORTAL_SCHEMA_CHANGES.md` after the fact.
- Email notifications on approve / reject — deferred to a PA trigger (Connor) once the row update pattern is stable.

**Why this slice first:** the entire applicant entry path depends on staff being able to act on pending membership rows. Without it, applicants who don't already have an approved membership are stuck. Building admin before applicant UX also lets us validate the row-state machine (`requested` → `approved` / `rejected` / `revoked`) before any user-facing flow writes rows.

---

## 2. Schema (no new fields — entity must exist)

This slice assumes `wmkf_portal_membership` already exists in Dataverse with the shape locked at `INTAKE_PORTAL_DESIGN.md` line 100 (Field table). If it doesn't yet, the schema deploy is a **pre-requisite** to this slice, not part of it. Deploy steps follow the gotcha checklist at `project_dataverse_schema_deploy_gotchas.md` (30s-backoff between metadata writes; PascalCase `@odata.bind` keys).

Fields touched by this slice (all read or write — no schema additions):

| Field | Read | Write (approve) | Write (reject) |
|---|---|---|---|
| `wmkf_portal_membershipid` | ✓ | — | — |
| `_wmkf_contact_value` | ✓ | — | — |
| `_wmkf_account_value` | ✓ | — | — |
| `wmkf_role` | ✓ | — | — |
| `wmkf_approvalstatus` | ✓ (filter on `'requested'`) | set `'approved'` | set `'rejected'` |
| `_wmkf_requestedby_value` | ✓ | — | — |
| `wmkf_requestedat` | ✓ | — | — |
| `_wmkf_approvedby_value` | — | set to staff `systemuserid` | set to staff `systemuserid` |
| `wmkf_approvedat` | — | set `utcNow()` | set `utcNow()` |
| `wmkf_rejectionreason` | — | — | set (required) |
| `statecode` | ✓ | — (stays active) | — (stays active; the approvalstatus carries the rejection state) |

Note: `wmkf_approvalstatus='rejected'` keeps `statecode='active'` so the row is still queryable and the alternate key (contact, account) prevents a duplicate on re-application. Setting `statecode='inactive'` is reserved for `wmkf_approvalstatus='revoked'` (staff cuts off a previously-approved member; out of slice scope).

---

## 3. App registry + permissions

Add to `shared/config/appRegistry.js`:

```js
'intake-admin': {
  key: 'intake-admin',
  name: 'Intake Admin',
  route: '/apply/admin',
  icon: '🛂',
  category: 'admin',
  description: 'Approve institution memberships and review submitted requests from the applicant portal.',
}
```

**Not in `DEFAULT_APP_GRANTS`.** Granted manually via `/admin` to staff who run pilot triage. Pilot grants list (post-decision 2026-05-13): Justin + one other Foundation staff TBD. Sarah opt-in if she wants visibility during pilot.

Layout nav: the icon appears in `Layout.js`'s app menu for granted staff, filtered the same way every other app is.

---

## 4. Middleware carve-out

Today, `middleware.js` line 100 routes any `/apply/*` request as applicant-only:

```js
const isApplicantSurface = pathname?.startsWith('/apply') || pathname?.startsWith('/api/apply');
```

Add a staff-admin exception **before** that check:

```js
const isStaffAdminSurface =
  pathname?.startsWith('/apply/admin') || pathname?.startsWith('/api/apply/admin');

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

**Verification:** add a unit-style test or a manual probe noting:
- Applicant session hitting `/apply/admin/memberships` → 403/redirect.
- Staff session hitting `/apply/admin/memberships` without `intake-admin` access → 403 from `requireAppAccess`, not from middleware.
- Staff session with `intake-admin` access → 200.
- Anonymous → redirect to `/auth/signin` (staff sign-in branch).

---

## 5. API endpoints

All endpoints under `pages/api/apply/admin/memberships/`. All require `requireAppAccess(req, res, 'intake-admin')`. All write paths use the actor's `systemuserid` derived via `dataverse-identity-map.js` (existing service) and pass `actingUserSystemId` to dynamics-service so `MSCRMCallerID` impersonation fires (per `DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md`).

### `GET /api/apply/admin/memberships`

Lists pending memberships. Query: `?status=requested` (default), `?status=rejected`, `?status=all`. Pagination via `?top=50&continuationToken=...` (use `queryAllRecords` for simplicity at pilot scale — ~25 rows expected).

Response shape:

```json
{
  "memberships": [
    {
      "id": "guid",
      "contact": { "id": "guid", "name": "Erika Espinosa-Ortiz", "email": "..." },
      "account": { "id": "guid", "name": "Utah State University" },
      "role": "submitter",
      "approvalStatus": "requested",
      "requestedBy": { "id": "guid", "name": "Erika Espinosa-Ortiz" },
      "requestedAt": "2026-05-12T14:22:00Z",
      "rejectionReason": null
    }
  ]
}
```

Performance: Dataverse `$expand=` on `_wmkf_contact_value` and `_wmkf_account_value` to avoid N+1 lookups. Cache nothing — admin staff want fresh state.

### `POST /api/apply/admin/memberships/[id]/approve`

Body: `{}` (no input; approver derived from session). Validations:
- Membership row exists, `wmkf_approvalstatus === 'requested'`. Idempotency: if already `'approved'`, return 200 with the current state (don't error — staff may double-click).
- 403 if not `'requested'` or `'rejected'` (don't allow approving a revoked row; that's a separate flow).

Side effects (single Dataverse PATCH):
- `wmkf_approvalstatus` → `'approved'`
- `_wmkf_approvedby_value` → caller's `systemuserid`
- `wmkf_approvedat` → `new Date().toISOString()`
- Clear `wmkf_rejectionreason` (set to `null`) if re-approving a previously-rejected row.

Response: `{ id, approvalStatus: 'approved', approvedAt }`.

### `POST /api/apply/admin/memberships/[id]/reject`

Body: `{ reason: string }` — required, 1–500 chars, trimmed. Reject empty / missing with 400.

Validations:
- Membership row exists, `wmkf_approvalstatus === 'requested'`. Idempotent on `'rejected'`.
- 403 if `'approved'` (rejection of an approved row is "revoke" — separate flow).

Side effects (single Dataverse PATCH):
- `wmkf_approvalstatus` → `'rejected'`
- `_wmkf_approvedby_value` → caller's `systemuserid` (re-used as "rejected by" — the field carries either disposition)
- `wmkf_approvedat` → `new Date().toISOString()` (re-used as "decided at")
- `wmkf_rejectionreason` → `reason`
- `statecode` stays `active` — the alternate key (contact, account) prevents duplicate on re-application; the next applicant action updates this same row.

Response: `{ id, approvalStatus: 'rejected', rejectionReason }`.

---

## 6. UI

Single page at `pages/apply/admin/memberships.js`. Page-level guard via `RequireAppAccess` with `appKey="intake-admin"`. The page renders inside the standard `Layout` since staff are signed in.

### Page structure

```
┌─ Layout (staff nav) ───────────────────────────────────┐
│ 🛂 Membership Approval                                 │
│                                                        │
│  Tabs: [Pending (N)] [Rejected] [All]                 │
│                                                        │
│  ┌─ Table ─────────────────────────────────────────┐  │
│  │ Applicant    │ Institution   │ Role  │ Requested│  │
│  │ Erika E-O    │ Utah State U  │ Sub.. │ 2026-…   │  │
│  │              │                                   │  │
│  │  [Approve]   [Reject…]                          │  │
│  └────────────────────────────────────────────────┘  │
│                                                        │
│  Empty state: "No pending memberships." (when list==0) │
└────────────────────────────────────────────────────────┘
```

Reject opens a modal with a textarea (1–500 chars, counted) + Cancel / Confirm Reject buttons. On confirm: POST `/reject` with `{ reason }`, optimistically remove from pending list, toast on success.

Approve fires inline (no modal) with an optimistic remove + undo affordance (re-POST `/approve` on undo is fine — endpoint is idempotent against re-approval).

### State management

Plain React. Fetch list on mount via `useEffect`, refetch on tab change. Don't add SWR or react-query for one page; the app convention is plain `fetch` + local state (mirrors `/admin` page).

### Error handling

- 401 / 403 from API → redirect to `/admin` with an error toast ("You don't have intake-admin access").
- 500 → inline error banner with retry button.
- Approve / reject failure → restore the row to the list, show toast.

---

## 7. Build slices (work breakdown)

Ordered for safe incremental landing. Each slice is one PR-sized commit.

| # | Slice | Risk |
|---|---|---|
| 0 | **Pre-req — `wmkf_portal_membership` entity creation** in Dataverse via the metadata API, cataloged in `INTAKE_PORTAL_SCHEMA_CHANGES.md`. Connor design-reviews shape before deploy. Out of this build plan; tracked separately. | Low — straight schema deploy, summary-after model |
| 1 | App key + middleware carve-out + skeleton page that renders "no memberships" empty state. No API yet. Verifies routing + access control work end-to-end. | Low — touches `appRegistry.js`, `middleware.js`, one new page file |
| 2 | `GET /api/apply/admin/memberships` + table rendering of real rows. No actions yet. Read-only verifies the Dataverse query + `$expand` shape. | Low — read-only |
| 3 | `POST /approve` endpoint + UI button. End-to-end approve flow, including impersonation through `MSCRMCallerID`. | Medium — first write path; verify impersonation fires |
| 4 | `POST /reject` endpoint + reject modal. Includes reason validation. | Low — mirrors slice 3 |
| 5 | Tabs (Rejected, All) + empty states + error toasts polish. | Low — UI only |
| 6 | Atlas page update — add `wmkf_portal_membership` to `docs/atlas/` so `check:atlas` stays green. | Low — doc only |
| 7 | API route security matrix update — add the three new routes to `API_ROUTE_SECURITY_MATRIX.md` so `check:api-routes` stays green. | Low — doc only |

Slices 6 and 7 are **gates** — `check:atlas` and `check:api-routes` will fail without them. Land them in the same commit as the underlying code, not after.

---

## 8. Verification

Per slice landing:

- **Slice 1:** `npm run build` clean. Manual: navigate `/apply/admin/memberships` as staff with grant → 200 empty state; as staff without grant → 403; as applicant session → middleware rejects.
- **Slice 2:** create one `wmkf_approvalstatus='requested'` row in Dataverse directly via `scripts/probe-impersonation-resmoke.js`-style script. Confirm row appears in list with contact + account expanded.
- **Slice 3:** approve the test row from UI. Verify in Dataverse: `wmkf_approvalstatus='approved'`, `_wmkf_approvedby_value` points to caller's systemuser, `wmkf_approvedat` set. Verify audit log on Dataverse side shows the caller (not the integration service account) — proves `MSCRMCallerID` fired.
- **Slice 4:** reject another test row with reason "test rejection." Verify the reason persists.
- **Slice 5:** smoke all three tabs + empty states.
- **Slices 6 + 7:** `npm run check:atlas && npm run check:api-routes` green.

End-to-end smoke target (after all slices): create a `requested` row → approve it → re-create a different `requested` row → reject it. Confirm both end states in Dataverse.

---

## 9. Out of scope (followups for tracking)

- **Bulk approve / reject** — pilot scale (~25 rows total) doesn't justify it. Add if a single staff member ends up handling > 10/day.
- **Email notifications** — PA-trigger on `wmkf_approvalstatus` change; Connor's plate. Don't build into the endpoint.
- **Revocation flow** (`'approved'` → `'revoked'`) — separate slice when a real revocation case comes up.
- **Audit log surfacing** — Dataverse already audits the row; staff can dig into Dataverse directly if needed. No portal-side audit view for pilot.
- **Submitted-requests admin view** — separate slice, blocked on Sarah's field inventory landing.

---

## 10. Open questions

None as of 2026-05-13. The Option A decision locks the location (`/apply/admin/memberships`), the auth path (`intake-admin` app key), and the actor-attribution path (`MSCRMCallerID` impersonation). Schema shape is approved.

If anything shifts during build, log it inline under `## 10. Open questions` and surface in the next session prompt.
