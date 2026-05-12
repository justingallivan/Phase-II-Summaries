# WMKF Grant Intake Portal — Design Document

**Status:** Design v2 (2026-05-02), status banner refreshed 2026-05-12. **Entra External ID foundation SHIPPED S129** (tenant provisioned, `entra-external` NextAuth provider, `/apply` route round-trip verified) — no longer the external blocker. Sarah is back from conference travel. Remaining work is iterative pilot build: form field inventory with Sarah, structured-tables persistence pattern (defer or implement), `wmkf_portal_membership` entity creation under delegated authority (`project_dataverse_creator_privileges`, summary-after model), virus scanning wiring, PA trigger confirmation. See "Open questions / open work" for full list.

**Related:**
- `docs/EXTERNAL_REVIEWER_INTAKE_PLAN.md` — reference implementation pattern for token-authenticated public surface
- `docs/REVIEWER_MATERIALS_FOLDER_SPEC.md` — Connor-shareable folder convention
- `docs/POSTGRES_TO_DATAVERSE_MIGRATION.md` — strategic context on Wave 1+ migration
- `docs/EXECUTOR_CONTRACT.md` — AI prompt execution shared spec
- `docs/STAGED_REVIEW_PIPELINE.md` — downstream of submission

---

## Goals

1. **Long-term target:** full GOapply replacement across all funding lines, on a 12-18 month horizon.
2. **Pilot:** the **mid-June 2026 Phase II Research submission** (~25 proposals vs. typical 300). Lower volume + a known applicant cohort = forgiving first cut.
3. Eliminate the GOapply mapping/translation layer entirely. Portal writes directly to Dynamics with WMKF's own schema.
4. Hand off cleanly to the existing reviewer pipeline (Reviewer Finder → Review Manager → External Reviewer Intake) at Phase II Pending status.
5. Capture **machine-legible structured data** wherever possible (budgets, rosters, milestones as structured fields), not narrative text or PDFs that downstream AI tools have to re-extract.

## Scope discipline: skinny pilot, not parallel GOapply

The pilot is sized like the **external reviewer intake portal**, not like a GOapply rewrite. Long-term goal is replacement, but every pilot decision should anchor on "external reviewer intake but for applicants" rather than "GOapply but better." Specifics:

- **One funding line, one phase.** Phase II Research, mid-June 2026. Hard cap ~25 proposals.
- **Forms-as-code.** No form builder UI. Each cycle = a new versioned form module + deploy. Acceptable for ~6 cycles/year.
- **No submission PDF generator for pilot — but the reviewer-consumable artifact still has to be defined.** The external reviewer flow today exposes curated SharePoint files under `Reviewer_Downloads/`. If applicant content lives only as Dynamics fields + uploaded attachments, reviewers won't see the structured body of the proposal. Pilot decision needed before launch — options, in rough order of effort:
  1. **Staff-rendered Word/PDF on demand.** Admin clicks "generate review packet" in `/apply/admin/*`; portal renders the form (read-only HTML → Word via existing pattern, or print-to-PDF) and drops it in `Reviewer_Downloads/`. Cheapest; keeps the "no auto-generator" stance.
  2. **PA-built review packet.** Connor's PA flow assembles a SharePoint folder of the applicant's attachments + a templated cover doc on `'Phase II Pending'` flip. Heavier coordination but matches existing PA boundary.
  3. **Structured portal view exported by staff.** Read-only `/apply/admin/request/:id` page that staff can save-as-PDF. Same effort as option 1 but no automation.
  4. **Auto-generated submission PDF.** What we deferred. Cleanest reviewer experience, most build cost.
  Default assumption is option 1 unless Connor wants option 2. Tracked as a launch blocker in "Open questions."
- **Minimal admin UI.** Collaborator approval, list of submitted requests, opportunity status. Anything else can be a script or out-of-band staff action for pilot.
- **Schema-light.** Pilot uses fields on existing entities + one new table (`wmkf_portal_membership`). The four-new-table model is for Phase 1+ expansion, not pilot.
- **GOapply runs in parallel** for at least 12 months. The win is "no new applications enter GOapply" first; "GOapply turned off" comes only after all programs have migrated AND in-flight apps complete.

## Non-goals (explicit)

- Replacing GOapply functionality WMKF doesn't use: scholarship automatch, multi-site, donor management, third-party contributor, payment processing, Canada charity database. Out of scope permanently.
- Rebuilding GOmanager / Form Editor / Form Definition strings as a UI. Forms-as-code; if we ever need a builder, it's after 3+ funding lines have shipped and the patterns are obvious.
- Migrating in-flight GOapply applications. Pilot cycle starts in the new portal; everything in flight at cutover stays in GOapply through completion.
- Cross-phase revision in pilot (e.g., editing Phase I content from the Phase II form). SoCal program may need this in the future; tagged as "nice to have."

---

## Architecture overview

```
Applicant browser
      │
      │ Entra External ID OTP auth (separate tenant: wmkeckapply.onmicrosoft.com)
      ▼
Next.js portal (this repo, new pages under /apply/*)
      │
      ├─ Vercel Postgres ── DRAFT STAGING ONLY
      │  (autosaves + in-progress form state + attachment metadata
      │   before submission; cleared on submit)
      │
      ▼ (only on phase submission)
DynamicsService.createRecord / updateRecord
      │
      ├─ akoya_request                 (canonical Request row; new fields)
      ├─ account                       (Constituent / institution; existing)
      ├─ contact                       (named individuals; new wmkf_portal_oid field)
      └─ wmkf_portal_membership (NEW)  (person ↔ institution join, with role)
      │
      ▼
GraphService.uploadFile → SharePoint akoya_request library
      │
      ▼ (Dynamics field flips trigger)
Power Automate (Connor) — fans out:
      │
      ├─ Notify program staff
      ├─ SharePoint folder structure (existing pattern from external reviewer work)
      ├─ Phase advancement (status → next phase available)
      └─ Reviewer pipeline kickoff at "Phase II Pending"
```

**The split:** portal owns all writes that originate from applicants. PA owns all writes that fan out from applicant-originated state changes. Never both writing to the same field.

---

## Schema (pilot — minimal)

The original planning doc proposed four new entities. We deferred three of them; the pilot adds fields to existing entities plus one new table.

### Fields added to existing entities

**On `contact`:**
- `wmkf_portal_oid` (string, indexed) — Entra External ID object ID. Bridge between auth and Dynamics. Looked up first when an applicant authenticates.

**On `akoya_request`:**
- `wmkf_phaseiisubmittedat` (datetime) — when Phase II form was submitted via portal
- `wmkf_phaseiisubmittedby` (lookup → contact) — most recent submitter; audit only
- (Plus the form fields themselves, named per agreement with Connor + Sarah; see "Form contents" below)

### One new entity

**`wmkf_portal_membership`** — contact ↔ account join

| Field | Type | Notes |
|---|---|---|
| `wmkf_portal_membershipid` | PK | |
| `_wmkf_contact_value` | lookup → contact | |
| `_wmkf_account_value` | lookup → account | |
| `wmkf_role` | choice | `'submitter'` \| `'contributor'` (see permissions matrix below) |
| `wmkf_isprimary` | bit | flags official communications contact |
| `wmkf_approvalstatus` | choice | `'requested'` \| `'approved'` \| `'rejected'` \| `'revoked'` |
| `_wmkf_requestedby_value` | lookup → contact | who initiated (self-service, or staff) |
| `wmkf_requestedat` | datetime | |
| `_wmkf_approvedby_value` | lookup → systemuser | staff approver |
| `wmkf_approvedat` | datetime | |
| `wmkf_rejectionreason` | string | optional, surfaced to applicant on rejection |
| `statecode` | active/inactive | hard kill switch; approved + active = live |

Alternate key: (`_wmkf_contact_value`, `_wmkf_account_value`) — one row per (person, institution) pair, regardless of approval state. Re-applying after rejection updates the existing row, doesn't create a duplicate.

**Pending vs. revoked vs. rejected** are distinct. `statecode='inactive'` alone can't tell them apart, which matters for the admin UI ("show me requests waiting on approval" vs. "show me users I cut off"). The dedicated `wmkf_approvalstatus` field carries that distinction.

#### Role permissions (pilot)

| Capability | submitter | contributor |
|---|---|---|
| View institution dashboard + drafts | ✓ | ✓ |
| Edit a draft | ✓ | ✓ |
| **Submit** the form (final write to Dynamics) | ✓ | ✗ |
| Invite another collaborator | ✓ | ✗ |
| Withdraw an unsubmitted draft | ✓ | ✗ |
| Receive submission confirmation email | ✓ | cc'd if `wmkf_isprimary` |

Contributor is "co-author with comment access," not a peer of submitter. Promotion contributor → submitter is a staff action through the admin UI.

##### Submitter scope: institution-wide, intentionally (pilot)

A submitter is authorized at the **institution** level, not the **request** level. One approved submitter at "University X" can submit any `akoya_request` whose `_wmkf_account_value` resolves to University X — including requests led by other PIs at the same institution. This is an explicit pilot simplification, not an oversight.

Reasoning at pilot scale (~25 applicants, mostly one PI per institution):
- Universities with multiple in-flight proposals already trust their sponsored-research office to gate submissions; the portal mirrors that trust model.
- Adding request-level allowed-submitters now means designing an invite/assignment surface, persisting it on `wmkf_portal_membership` or a sibling table, and threading it through `/api/intake/submit` — all before we know whether the multi-proposal-per-institution case is common enough to warrant it.
- The request ownership guard (above) still prevents cross-institution writes; this only widens authority *within* one institution.

**Phase 1 follow-up:** when we see real institutions with concurrent submitters from different labs, add request-level allowed-submitters (likely a many-to-many on `wmkf_portal_membership` × `akoya_request`, or a `wmkf_request_collaborator` child entity). Until then, the submitter role grants institution-wide submit authority and the design doc says so plainly.

### Schema deferred to Phase 1+ expansion

These are real but not pilot-required. We add them when the second phase or second funding line forces the issue, with Connor reviewing the shape before creation.

- `wmkf_opportunity` — funding program / cycle. Hardcoded for pilot (one opportunity).
- `wmkf_phase` — sequential stage within an opportunity. Hardcoded for pilot (one phase, Phase II Research).
- `wmkf_status_tracking` — per-request, per-phase audit. Pilot uses fields on `akoya_request` directly because there's only one phase.

### Schema ownership

We own the pilot schema work directly (same pattern we used for the reviewer-suggestion fields shipped 2026-04-29). Connor is looped in for design review on `wmkf_portal_membership` before creation, since it's the one new entity and the shape will persist beyond pilot. Anything beyond pilot — `wmkf_opportunity`, `wmkf_phase`, `wmkf_status_tracking` — gets full Connor design review before creation, even though we may still do the actual creation work.

---

## Authentication

### Applicants — Entra External ID, OTP

Separate external tenant `wmkeckapply.onmicrosoft.com`, OTP-only, isolated from the organizational tenant. Justin + Connor as Global Admin guests. Detail in `docs/archive/IT_ENTRA_EXTERNAL_TENANT_REQUEST_2026-05-04.md`.

**Why Entra and not HMAC magic links** (which would be cheaper to build and match the external reviewer portal pattern): the real unit of identity for grant applications is the **institution**, not the individual. Magic links are person-centric and bake in the wrong abstraction. The institution-as-identity model needs:

- Multiple named collaborators per institution, each with their own login
- Primary contact role transferable by Foundation staff without the old contact's involvement
- New people able to request access to an existing institution account without needing prior credentials

OTP-only (no passwords) keeps the auth surface small while giving each person a persistent, individual session.

**Bridge to Dynamics:** Portal validates the External ID JWT, extracts email + OID, looks up `contact` by `wmkf_portal_oid` first, then by `emailaddress1`, then creates a new contact if neither matches. The membership join controls which institutions the contact can act on.

**Email change handling.** `emailaddress1` is the bootstrap key only. Once a contact has `wmkf_portal_oid` populated, OID wins permanently — even if the applicant updates their email at the institution, in Entra, or in Dynamics, the OID-keyed lookup keeps the same `contact` row. Email-fallback matching is intentionally first-link-only to avoid an applicant changing their email and silently capturing a different person's `contact` record. If OID-keyed lookup misses but email-keyed lookup hits a contact that already has a *different* OID set, treat that as a conflict and route to staff (do not auto-link).

### Staff — existing Azure AD (no change)

Foundation staff use the existing NextAuth + organizational Azure AD pattern. The intake admin interface lives at `/apply/admin/*` and uses `requireAppAccess(req, res, 'intake-admin')`.

**Pre-launch checklist for `intake-admin`:** add `'intake-admin'` to `shared/config/appRegistry.js` (key, name, route, icon, category, description) so the admin UI is gateable like every other app, and grant it to the staff who will run pilot triage. Same pattern used for `'review-manager'`, `'reviewer-finder'`, etc.

---

## Entry path: self-serve sign-in

Applicant arrives at `/apply`, enters email → receives OTP → enters code → session established. Then:

1. Portal queries Dynamics for `account` rows the authenticated `contact` has membership on.
2. **No memberships:** applicant is taken to an institution-search flow (search by name or EIN, pick from candidates, or "create new" → routes to staff approval, not auto-creation).
3. **One or more memberships:** applicant lands on a dashboard showing their institution's active requests (and the in-progress drafts for them).

**Magic-link from staff** (the simpler external-reviewer pattern) was considered but rejected because it would force the wrong abstraction (person-centric identity) for the long-term institution model. Staff can still send a "your Phase II is ready, log in here" email — the link just lands the applicant on the standard sign-in flow rather than auto-authenticating them.

### EIN reconciliation (when applicant doesn't yet have a membership)

EIN is not a clean key. To prevent duplicate `account` creation:

1. Applicant enters institution name AND EIN (EIN optional for international).
2. Portal queries Dynamics: exact EIN match → exact name match → fuzzy name match (Dataverse Search).
3. Portal returns 0..N candidate accounts to the applicant.
4. Applicant picks "yes, that's us" → creates a `wmkf_portal_membership` request → routes to staff approval.
5. Or "none of these — create new" → also routes to staff approval; on approval, `account` is created and membership granted.

For pilot (~25 applicants), strict staff approval on every new account is fine. We can relax this later with confidence thresholds once we see real data.

### Request ownership guard

Even with a valid membership, applicants must not be able to submit against arbitrary `akoya_request` rows. Server-side rule on every `/api/intake/submit` and `/api/intake/draft` call:

> The target `akoya_request._wmkf_account_value` must equal an `account_id` for which the authenticated `contact` has an **approved + active** `wmkf_portal_membership`.

This is a server-side authorization check, not a UI affordance. Applies to both draft writes and final submission. Without it, a contact with one valid institution membership could enumerate `akoya_request` GUIDs and overwrite another institution's request.

---

## Draft staging — Postgres, not Dynamics

Drafts are autosaved to **Vercel Postgres**, not Dynamics. Patching Dynamics every 30 seconds per active applicant would hit Web API throttling during peak submission windows and burn API quota on worthless intermediate state.

```sql
intake_drafts                    -- Vercel Postgres
  id              SERIAL PK
  contact_oid     TEXT NOT NULL  -- Entra External ID OID
  account_id      TEXT NOT NULL  -- GUID → Dynamics account
  request_id      TEXT           -- GUID → existing akoya_request (Phase II pilot)
  form_key        TEXT NOT NULL  -- e.g., 'phase-ii-research-2026-06'
  draft_json      JSONB NOT NULL -- current form state
  attachments     JSONB NOT NULL -- list of {filename, blob_url, sha256, uploaded_at, size, scanned_at}
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  UNIQUE (account_id, request_id, form_key)
```

The uniqueness key is **(account_id, request_id, form_key)** — an institution can have multiple in-flight Phase II drafts (large universities frequently submit several proposals per cycle), so the per-request scope is required. `request_id` is non-null for the pilot since Phase II always updates an existing `akoya_request`.

- Browser autosaves to `/api/intake/draft` debounced (every 30s of inactivity, or on field blur).
- Endpoint upserts the row. No Dynamics traffic from autosave.
- On phase submission: portal reads the draft, validates, calls `DynamicsService.updateRecord` to write final fields to `akoya_request`, **moves** attachments from staging into SharePoint via `GraphService.uploadFile`, then **deletes** the draft row.
- On submission failure: draft is preserved; partial Dynamics writes get rolled back via the same pattern as `lib/services/review-upload.js`.

### Attachment lifecycle during draft

Files uploaded mid-draft (before submit) are a meaningfully different risk class than files written during submission. Pilot rules:

- **Staging location:** Vercel Blob, **not** SharePoint. Drafts never touch the akoyaGO SharePoint site. Dedicated `intake-draft-attachments` Blob store with private access; pre-signed URLs scoped to the authenticated applicant only.
- **Why not SharePoint:** keeps unsubmitted (and potentially never-submitted) content out of the canonical document library, sidesteps Graph permission churn, and keeps the eventual SharePoint write a single staff-visible event tied to submission.
- **Virus scanning happens at upload**, not at submission, so unscanned files never sit in staging. See "Cross-cutting concerns → File handling."
- **Access isolation:** download URL must verify (a) authenticated session, (b) draft owned by an `account_id` in the caller's approved memberships, (c) blob path matches `attachments[].blob_url` in that draft. No anonymous Blob URLs.
- **Move on submit:** the move from Blob to SharePoint is **asynchronous**, not part of the submit HTTP request. See "Submission lifecycle" below.
- **Cleanup:** a daily cron job deletes Blob objects orphaned from any draft row plus draft rows past expiry (and their Blob attachments). Reuses the existing maintenance-job pattern.

**Draft expiry:** 90 days past last edit OR cycle close, whichever comes first. Same cron handles draft + attachment GC.

---

## Submission lifecycle — async jobs, not synchronous Dynamics writes

Submission externalization (file move to SharePoint, Dynamics PATCH, child-entity writes, status flip) does **not** happen inside the `/api/intake/submit` HTTP request. The submit endpoint validates strictly, persists a `submission_jobs` row in Postgres, and returns immediately. A background drain cron walks the queue and performs the externalization steps at whatever rate Dynamics + Graph tolerate.

### Why async

Three reasons, in order of importance:

1. **Throttling becomes self-solving.** Dynamics Web API enforces ~6,000 requests / 5 min / user and ~60K / hour / app. Graph API has stricter per-tenant limits. A synchronous submit doing 8-15 writes per applicant × 30 simultaneous submits at 4:55 PM puts us a single rate-limit response away from partial-state catastrophe (some writes landed, some didn't, and the applicant got a 500). Async drains the queue at any rate the upstream APIs accept; 429s become "wait and retry next tick," not "applicant sees an error."
2. **Partial failures become recoverable, not catastrophic.** A submission stuck at "files moved, Dynamics PATCH failed" gets retried automatically by the drain. Without async, the same condition leaves the system inconsistent and requires staff to clean up by hand.
3. **There is no business need for synchronous landing.** Reviewer pipeline kickoff is hours-to-days downstream of submission. An hour of latency between "applicant clicks submit" and "akoya_request reflects the change" is invisible at our scale.

### `submission_jobs` table

Postgres table, drained by a cron worker. Schema:

```sql
submission_jobs                          -- Vercel Postgres
  id                  SERIAL PK
  idempotency_key     TEXT NOT NULL UNIQUE  -- client-generated UUID per submit click
  draft_id            INTEGER NOT NULL FK   -> intake_drafts.id
  contact_oid         TEXT NOT NULL
  account_id          TEXT NOT NULL
  request_id          TEXT NOT NULL         -- akoya_request GUID
  form_key            TEXT NOT NULL
  status              TEXT NOT NULL         -- see state machine below
  payload             JSONB NOT NULL        -- frozen snapshot of validated draft
  sharepoint_paths    JSONB                 -- written paths so retry doesn't duplicate
  dynamics_patches    JSONB                 -- which writes have already landed
  attempts            INTEGER NOT NULL DEFAULT 0
  last_error          TEXT
  next_attempt_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
  completed_at        TIMESTAMPTZ
```

State machine:

```
queued
  → scanning              (verify all attachments have scan_result='clean')
  → files_moved           (Blob → SharePoint, all files written)
  → dynamics_patched      (akoya_request PATCH + child entity writes)
  → status_flipped        (akoya_requeststatus = 'Phase II Pending')
  → completed
```

Two terminal failure states: `failed` (after N attempts the drain gives up; staff intervention required) and `cancelled` (staff explicitly stopped the job).

### Idempotency contract

The client (browser) generates a UUID per submit attempt and includes it in the request body. The submit endpoint's first action is:

```sql
INSERT INTO submission_jobs (idempotency_key, ...) VALUES (...)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING *;
```

If the insert was a no-op (UUID already seen), the endpoint returns the existing job's status instead of re-queuing. This makes double-clicks, browser refreshes, network retries, and "did it submit?" panic-clicks all safe — every variant collapses to the same job row.

### Drain cron

`/api/cron/drain-submissions`, runs every 1-2 minutes via Vercel Cron, authenticated via `CRON_SECRET` (existing pattern). Each tick:

1. Pick up to N jobs where `status NOT IN ('completed', 'failed', 'cancelled')` and `next_attempt_at <= now()`, ordered by `created_at`.
2. For each job, advance the state machine by **one step** — never more, even if the next step would also succeed. This bounds latency between failure and visibility.
3. On success: update `status` and `completed_at` (or schedule next tick).
4. On transient failure (5xx, 429, network): increment `attempts`, set `next_attempt_at = now() + backoff(attempts)`, persist `last_error`. Backoff: 1m, 5m, 15m, 1h, 4h.
5. On permanent failure (e.g., file deleted from Blob, Dynamics request returns 400): mark `status = 'failed'` and notify staff via `notification-service.js`.
6. Cap attempts at ~10. After cap, mark `failed`.

Per-`request_id` serialization: the drain holds an advisory lock keyed on `request_id` for the duration of one job step, so two jobs targeting the same `akoya_request` (rare, but possible if a withdrawal-then-resubmit happens fast) cannot interleave writes.

### Applicant UX

Submit returns immediately with `{ jobId, idempotencyKey, status: 'queued' }`. The post-submit screen polls `GET /api/intake/submission/:jobId` every 5-10 seconds until `status='completed' | 'failed'`. Status messages map to plain English:

- `queued` → "received, in queue"
- `scanning` → "verifying file scans"
- `files_moved` → "writing to system"
- `dynamics_patched` / `status_flipped` → "almost done"
- `completed` → "submitted successfully"
- `failed` → "submission stalled, our staff have been notified"

The applicant can close the tab and come back; their dashboard will show the job's current status whenever they reload.

### Staff visibility

Admin endpoint `/apply/admin/jobs` (or extension to existing admin dashboard) lists active + recent jobs with status, attempts, last error. Staff can:

- Force a retry (`next_attempt_at = now()`, reset attempts).
- Cancel a stuck job and roll back any partial writes.
- View the frozen payload to see exactly what was submitted.

Failures notify staff via existing `notification-service.js`. After-hours deadline submissions stalling at 5 AM should not require human pager response — the drain will keep retrying through transient backoffs, and staff see results when they're online.

### Migration note

`submission_jobs` is the second new Postgres table after `intake_drafts` and `intake_audit`. Add to V27 migration. The same pattern (small staging table, drained async to canonical systems) is general-purpose enough that future portal expansions (Phase I in the portal, concept stage in the portal) can reuse the table verbatim — `form_key` already discriminates.

---

## Form strategy: forms-as-code, versioned per cycle

Each phase's form is a versioned React component module under `shared/forms/{form_key}/`:

```
shared/forms/
  phase-ii-research-2026-06/
    schema.js          -- field definitions (used by both renderer and validator)
    Form.js            -- React component that renders fields
    validate.js        -- server-side validator (schema → errors)
    map-to-dynamics.js -- maps validated form fields → akoya_request PATCH body
```

- `form_key` is permanent and cycle-specific. The next Research Phase II becomes `phase-ii-research-2026-12/` (new directory, new key, no in-place edits to a shipped form).
- Versioning enables: accurate rendering of historical submissions, mid-cycle field tweaks without migration, audit/replay.
- No `Pdf.js` for pilot (no submission PDF generator).
- Cost: each new cycle requires a deploy. Acceptable.

### Machine-legible capture as a design principle

When designing each form with Sarah and Connor, the question to ask isn't "what fields does GOapply have here?" — it's "what's the most structured representation we can extract from the applicant without making the form annoying?" Examples:

- Budget — structured table (year × category × amount), not narrative prose or an XLSX upload
- Co-PI roster — structured rows (name, affiliation, role, % effort), not a free-text "Personnel" field
- Milestones / timeline — structured rows (date, deliverable), not a prose timeline
- Prior support — structured rows (funder, amount, dates, role), not a free-text "Other support" section

Attachments stay as files when they're naturally documents (CV/biosketch, letters of support, full budget justification narrative). Structured content that's currently inside narrative or spreadsheets becomes real fields.

This compounds with downstream AI tools: every reviewer-matching, integrity-screening, intelligence-brief, retrospective-analysis tool we've built ends up re-extracting structure from PDFs today. If the portal captures it as structured rows from day one, every downstream tool gets it free.

### Form contents — Phase II Research mid-June 2026 (rough scope)

To be detailed with Connor and Sarah. Rough envelope:

- **~10 free-text fields**, each roughly paragraph-length
- **~8 attachments** (mix of PDF, DOCX, XLSX), up to 20 in edge cases (biosketches add up)
- **Some structured tables** (likely budget + co-PI roster — exact fields TBD with Sarah)
- **No conditional fields** (no "if international, also fill in X" branching in pilot)
- **No unusual widgets** (no signature blocks, no IRB/IACUC checkboxes that need special handling)

### Phase I provenance

Phase II in pilot is **purely additive**. Phase I content (title, abstract, PI, budget summary) is displayed read-only as context but not editable in the Phase II form. PI requests for mid-stream changes (e.g., title revision) handled by staff out-of-band.

Cross-phase revision capability is tagged as a future enhancement for the SoCal program; the Research program is moving to single-phase soon, so this won't be needed for Research.

---

## Power Automate boundary

Portal owns **every write that originates from an applicant action.** PA owns **every write that fans out from a state change.** They never write the same field.

| Portal owns | PA owns |
|---|---|
| Create `account` (Constituent) when staff approves new institution | Notify program staff of submission |
| Create / update `contact` rows | SharePoint subfolder structure on first submission |
| Create / update `wmkf_portal_membership` | Phase advancement (next phase becomes available) |
| Update `akoya_request` form fields on submission | Reviewer pipeline kickoff at Phase II Pending |
| Set `akoya_requeststatus` to `'Phase II Pending'` on submission | Move `akoya_requeststatus` forward after staff decision |
| Upload attachments to SharePoint | Notification emails for phase advancement / denial |
| Send submission confirmation email to applicant (synchronous) | (async fan-out only) |

**Critical invariant: PA never creates Dynamics records on portal submission.** A submission that needs new rows → portal creates them directly. PA reads them and fans out. This avoids race conditions and dual-write bugs.

---

## Pilot plan: Phase II Research mid-June 2026

### Why this is a good pilot
- Low volume (~25 proposals) — survivable failure mode
- Known applicants — Foundation staff already in regular contact, can hand-hold
- Single phase only (Phase II) — Phase I happens in GOapply for this cycle; portal accepts the Phase II submission for applicants who already cleared Phase I
- Downstream pipeline (Reviewer Finder → Review Manager → External Reviewer Intake) just shipped and is production-tested
- Underlying `akoya_request` rows already exist in Dynamics from Phase I — pilot updates them rather than creating from scratch

### What ships for the pilot
- `/apply` landing page + Entra External ID OTP auth
- Self-serve sign-in → institution dashboard → Phase II form
- Account search / claim / new-account-with-staff-approval flow
- One versioned form: `phase-ii-research-2026-06`
- Draft autosave to Postgres
- Submission writes form fields to existing `akoya_request` rows (looked up by request number / institution membership)
- Attachments uploaded to SharePoint at the existing folder convention
- `akoya_requeststatus` flipped to `'Phase II Pending'` on submission → triggers Connor's PA flows → triggers existing reviewer pipeline
- Minimal admin UI: collaborator approval, opportunity setup (could be a config file for pilot), list of submitted requests
- **Falls back to GOapply gracefully** — if portal breaks during the cycle, applicants can complete Phase II in GOapply as before. Communicate this to applicants up front: "this is a new system; here's the GOapply backup link if anything goes wrong."

### What does NOT ship for the pilot
- Phase I in the portal (Phase I happens in GOapply for this cycle)
- Concept stage in the portal
- New funding lines beyond Research
- Cross-phase revision capability (SoCal future)
- Submission PDF generator
- Form builder UI
- Reviewer pipeline integration changes (it Just Works because we're flipping the same status field)

### Pilot exit criteria
- All 25 proposals submitted via portal (or GOapply fallback) without data loss
- All Phase II submissions land correctly in Dynamics + SharePoint
- Reviewer pipeline kickoff fires correctly on status change
- Sarah and Connor sign off on the captured-data quality (i.e., structured data made it into Dynamics in a form downstream tools can use)

---

## Phased delivery (pilot → full replacement)

Each phase is roughly a quarter of work; numbers are illustrative not committed.

| Phase | Scope | Outcome |
|---|---|---|
| **0. Foundation** (now → June 2026) | Entra tenant provisioning, schema (fields + `wmkf_portal_membership`), `/apply` skeleton, auth flow, EIN reconciliation, Phase II Research 2026-06 form, draft staging, admin UI minimum | Pilot ships |
| **1. Research expansion** (Q3 2026) | Add Phase I Research form. Concept Research form (if concepts still exist post-redesign). Multi-phase navigation. Migration of next Research cycle entirely off GOapply. Add `wmkf_status_tracking` table. | Research program fully on portal |
| **2. Second funding line** (Q4 2026) | Whichever program is next-easiest. Patterns start to surface. Add `wmkf_opportunity` + `wmkf_phase` tables (the per-cycle config moves out of code). | Second program migrated |
| **3. Remaining programs** (2027) | Migrate remaining funding lines one at a time | All new applications enter portal, GOapply still running for in-flight |
| **4. Decommission** (when last GOapply app completes) | Turn off GOapply | Done |

---

## Cross-cutting concerns

### File handling

**Bytes never traverse a Vercel Function.** The Vercel Functions request-body limit is 4.5 MB; routing applicant uploads through a function body would cap files at that ceiling regardless of what Blob accepts. The intake portal uses Vercel Blob's client-upload pattern: the function mints a signed token, the browser PUTs bytes directly to Blob via the `@vercel/blob/client` SDK, and only metadata (`{ filename, blob_url, sha256, size, mime }`) ever crosses our function. End-to-end smoke (`scripts/smoke-blob-upload.js`) verifies a 25 MB round-trip against the actual Blob endpoint with byte-identity sha256 verification — proving the underlying capability before we wire the UI. Real per-file caps are set per field in `shared/forms/<cycle>/schema.js` (current Phase II Research draft: 20 MB for the project narrative, 5 MB for everything else, subject to Sarah/Connor refinement).

- Allowed file types per phase: PDF, DOCX, XLSX, plain text. Hard-block executable extensions.
- Magic-byte validation, not just extension check (existing pattern in `lib/services/review-upload.js`).
- Per-phase attachment quota set per-field via `maxFiles` on file fields plus a phase-level total (e.g., max 20 files / 150 MB total package).

#### Virus scanning — Cloudmersive, fail-closed

Public applicant uploads are a different risk class than staff/reviewer uploads, so the existing reviewer-intake flow does not transfer. Decisions:

| Question | Answer |
|---|---|
| **Where does scanning happen?** | While bytes are in Blob staging, **before** any move to SharePoint. Infected files never reach the canonical document library. |
| **When does it fire?** | Immediately on upload completion, triggered by the metadata POST that follows the browser's direct-to-Blob PUT. Synchronous for pilot (1-3s per file is acceptable latency); switch to a `scan_jobs` queue if cycle-end bursts overwhelm the scanner. |
| **What scanner?** | **Cloudmersive Virus Scan API.** ClamAV + commercial engines under the hood. ~$0.001/scan. Free tier (800 scans/month) covers pilot at 25 × 8 = 200 scans/cycle. TOS specifies no file retention. Privacy concerns rule out VirusTotal (file shared with 60+ AV vendors); Microsoft Defender via Graph isn't exposed for arbitrary file scanning. |
| **Where does the result live?** | On the draft's `attachments[].scan_result` JSON column. Submit-strict validator (already wired) requires `scan_result === 'clean'` on every file before allowing submission. |
| **How does the scan job in the submission lifecycle relate?** | The `scanning` state in the submission state machine re-verifies that all attachments are `'clean'` before files move. This is a defense-in-depth check, not the primary scan — primary scan happened at upload. |

Failure modes — fail closed:

| Scenario | Behavior |
|---|---|
| Scanner returns "infected" | Mark `scan_result='infected'`. UI surfaces: "we detected a virus in `filename`. Please run a local scan and re-upload." Submit blocked. |
| Scanner 5xx / network error | Retry 3× with backoff. If still failing, mark `scan_result='error'` and notify staff. Submit blocked. |
| Scanner timeout (>30s on a single file) | Treat as 5xx. |
| Cloudmersive false positive | Staff admin endpoint marks the specific blob `scan_result='clean_override'` with a justification and audit trail. Validator accepts overrides; applicant sees "verified by WMKF staff" in UI. |
| Scanner rate limit | Async scan queue (deferred to Phase 1 if pilot stays synchronous). |

EICAR test file (the standardized harmless malware-detection probe) included in `scripts/smoke-virus-scan.js` to verify the scanner is wired and fails closed correctly.

New env var: `CLOUDMERSIVE_API_KEY`. Pilot uses the free tier; production cycle cost ceiling ~$5.

### Withdrawal / staff cancellation
- Applicants can withdraw an unsubmitted draft (deletes Postgres row).
- Applicants can request withdrawal of a submitted application — staff action, sets `akoya_requeststatus` to a withdrawn value, triggers PA cleanup.
- Staff can cancel an application (e.g., ineligibility discovered post-submission). Same status-flip pattern.

### Eligibility gating
- Pilot is invite-driven (applicants invited by staff to complete Phase II), so explicit eligibility gating is unnecessary for pilot.
- Future funding lines may need pre-form eligibility quizzes (geography, EIN type, mission fit). Defer to whichever funding line first surfaces the need.

### Accessibility
- Public-facing portal must clear WCAG 2.1 AA at minimum. Audit before each new funding line goes live, not just at pilot launch.

### Internationalization
- Pilot is US-only. International applicants come in for some funding lines — defer to whichever phase migrates a program with international applicants.

### Audit / observability
- Every state-changing portal action logs to a new `intake_audit` Postgres table (actor OID, action, target entity + ID, payload digest, timestamp).
- Submission events log to `wmkf_ai_run` if any AI processing fires (e.g., automated eligibility check), per the existing pattern.

---

## Stakeholder engagement plan

| Person | Role | Timing |
|---|---|---|
| **Justin** | Build, design decisions, schema work | Continuous |
| **Connor** | PA flows, schema review, AkoyaGO context, form requirements | Engaged now; reviews `wmkf_portal_membership` shape before creation; reviews any Phase 1+ schema work in full |
| **Sarah** | Form field requirements, UI wishlist, machine-legible capture priorities | Engaged on return from conference; circle back once Connor has rough field inventory |
| **DFT (IT)** | Entra tenant provisioning | Email sent 2026-05-04; everything blocks on response |
| **Foundation staff (broader)** | Pilot dry-run, applicant communication for cycle | Engage 2-3 weeks before pilot launch (mid-May) |

---

## Open questions / open work

**Launch blockers** (must resolve before the portal goes live):

1. **Reviewer-consumable artifact.** Default plan is staff-rendered Word/PDF dropped into `Reviewer_Downloads/` (option 1 above). Confirm with Connor; alternative is PA-built review packet on `'Phase II Pending'` flip.
2. **`wmkf_portal_membership` shape sign-off** with Connor — including the new approval-state fields.
3. **Phase II Research field inventory** with Sarah + Connor — drives the form module.
4. **PA trigger confirmation** — which existing `'Phase II Pending'` flows fire for portal-originated submissions vs. which need updating.
5. **Structured-tables persistence contract** with Connor — pick one storage pattern (real child entities, JSON columns on `akoya_request`, or defer) so submit endpoints can be wired. See `docs/archive/CONNOR_INTAKE_PORTAL_SYNC.md` § 6.

**Resolved (decisions made, build remaining):**

- ~~Virus scanning approach~~ — **Cloudmersive, fail-closed, scan at upload completion.** See "Cross-cutting → File handling → Virus scanning."
- ~~Submit-time vs. async externalization to Dynamics/SharePoint~~ — **async via `submission_jobs` queue + drain cron.** See "Submission lifecycle."
- ~~Upload path capacity~~ — **direct browser-to-Blob client uploads, function never sees bytes.** 25 MB round-trip verified by `scripts/smoke-blob-upload.js` (server-side `put()` against the real Blob endpoint).

### Pre-launch verification checklist — must run against real URLs before pilot opens

The smokes shipped this session exercise primitives in isolation. Before opening the portal to applicants, repeat the following against the **actual deployed `/apply` URLs** on Vercel preview, not localhost:

- [ ] **20 MB upload from a real browser** through `/apply/upload` (or whatever the live page is) against a deployed preview. Confirm bytes do not traverse our function — check Vercel function logs: `/api/intake/upload-token` (or chosen name) should record a signed-token mint of ~50 ms with no large payload. If the function shows multi-MB request bodies, the wiring is wrong.
- [ ] **CORS + signed-URL behavior** under production runtime: confirm the signed PUT URL works from the browser origin, that token expiry is enforced, and that revoking the draft revokes future uploads.
- [ ] **Flaky-network simulation** (DevTools → Slow 3G): confirm `@vercel/blob/client` upload SDK exposes progress and error handling correctly; confirm the UI's retry path works without duplicating the staging row.
- [ ] **EICAR test file** uploaded through the live path — confirm Cloudmersive flags it, confirm the draft surfaces `scan_result='infected'`, confirm the submit endpoint refuses the draft.
- [ ] **Idempotent submit replay**: hit `/api/intake/submit` twice with the same idempotency key (DevTools → repeat last fetch). Confirm second call returns the existing job row, not a duplicate.
- [ ] **End-to-end deadline rehearsal**: 5-10 concurrent submits at the staging URL with the actual `submission_jobs` drain running. Watch logs for 429s from Dynamics/Graph; confirm the queue drains cleanly and partial failures retry.
- [ ] **Real Entra External ID sign-in flow** end-to-end (only possible once the IT request lands).

This list lives here, not in `scripts/`, because passing the smokes is necessary but not sufficient — production has CORS, auth headers, real network jitter, and Vercel's function runtime that local Node cannot replicate.

**Open questions, not pilot-blocking:**

6. **Draft expiry policy** — 90 days past last edit OR cycle close is the working default; confirm with Sarah/Connor.
7. **Submission confirmation email** content + sender identity. Probably `DynamicsService.createAndSendEmail` so it appears in CRM history.
8. **Staff approval UI for new account requests** — table of pending requests + approve/reject; design after schema is created.
9. **Cycle close behavior** — read-only after deadline? Hard cutoff or grace period?

---

## Immediate next steps (in order)

1. **Wait for IT response on Entra tenant.** Nothing portal-side ships without it.
2. **Connor sync** — review `wmkf_portal_membership` shape; rough field inventory for Phase II Research form; confirm PA flow boundary; identify which "Phase II Pending" PA flows need updating to handle portal-originated submissions vs. GOapply-originated.
3. **Sarah engagement** (on return from conference) — form wishlist, structured-vs-narrative tradeoffs per field, UI must-haves.
4. **Schema work** — once Entra is ready and shape is reviewed, create the `wmkf_portal_membership` table and add the fields to `contact` and `akoya_request`.
5. **`/apply` skeleton** — auth flow + dashboard + first form (`phase-ii-research-2026-06`) iteratively. Aim for end-to-end click-through (auth → dashboard → form → submit → land in Dynamics) before polishing any single screen.

Hard target: pilot accepting submissions by **2026-06-01** for the mid-June Phase II Research cycle. The IT timeline is the largest external slip risk; the launch-blocker list above (reviewer artifact, virus scanning, schema sign-off, field inventory, PA triggers) is the largest internal slip risk and is in our control.
