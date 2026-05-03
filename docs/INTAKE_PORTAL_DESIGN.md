# WMKF Grant Intake Portal — Design Document

**Status:** Design v2 (2026-05-02). Pilot scope locked; pilot blocked only on Entra External ID tenant provisioning (IT request sent 2026-05-04 — see `docs/IT_ENTRA_EXTERNAL_TENANT_REQUEST_2026-05-04.md`).

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
- **No submission PDF generator for pilot.** The reviewer pipeline already consumes structured fields + uploaded attachments. We add a PDF generator only if/when downstream tools demand one.
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
| `wmkf_role` | choice | `'submitter'` \| `'contributor'` |
| `wmkf_isprimary` | bit | flags official communications contact |
| `statecode` | active/inactive | supports revocation |

Alternate key: (`_wmkf_contact_value`, `_wmkf_account_value`) — one row per (person, institution) pair.

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

Separate external tenant `wmkeckapply.onmicrosoft.com`, OTP-only, isolated from the organizational tenant. Justin + Connor as Global Admin guests. Detail in `docs/IT_ENTRA_EXTERNAL_TENANT_REQUEST_2026-05-04.md`.

**Why Entra and not HMAC magic links** (which would be cheaper to build and match the external reviewer portal pattern): the real unit of identity for grant applications is the **institution**, not the individual. Magic links are person-centric and bake in the wrong abstraction. The institution-as-identity model needs:

- Multiple named collaborators per institution, each with their own login
- Primary contact role transferable by Foundation staff without the old contact's involvement
- New people able to request access to an existing institution account without needing prior credentials

OTP-only (no passwords) keeps the auth surface small while giving each person a persistent, individual session.

**Bridge to Dynamics:** Portal validates the External ID JWT, extracts email + OID, looks up `contact` by `wmkf_portal_oid` first, then by `emailaddress1`, then creates a new contact if neither matches. The membership join controls which institutions the contact can act on.

### Staff — existing Azure AD (no change)

Foundation staff use the existing NextAuth + organizational Azure AD pattern. The intake admin interface lives at `/apply/admin/*` and uses `requireAppAccess(req, res, 'intake-admin')`.

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
  attachments     JSONB NOT NULL -- list of {filename, sp_uri, sha256, uploaded_at, size}
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  UNIQUE (account_id, form_key)
```

- Browser autosaves to `/api/intake/draft` debounced (every 30s of inactivity, or on field blur).
- Endpoint upserts the row. No Dynamics traffic from autosave.
- On phase submission: portal reads the draft, validates, calls `DynamicsService.updateRecord` to write final fields to `akoya_request`, calls `GraphService.uploadFile` to commit attachments, then **deletes** the draft row.
- On submission failure: draft is preserved; partial Dynamics writes get rolled back via the same pattern as `lib/services/review-upload.js`.

**Draft expiry:** to be determined, but reasonable defaults: 90 days past last edit OR cycle close, whichever comes first. Cleanup runs as a cron job (existing pattern).

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
- Vercel Function payload limit: 4.5MB default for serverless; Fluid Compute relaxes this. Pilot probably fine; quantify before second funding line.
- Allowed file types per phase: PDF, DOCX, XLSX, plain text. Hard-block executable extensions.
- Magic-byte validation, not just extension check (existing pattern in `lib/services/review-upload.js`).
- Virus scanning: GOapply does this; we should too. Likely Microsoft Defender for Cloud Apps or a Vercel-side scanner. **Open — needs pilot decision.**
- Per-phase attachment quota (e.g., max 20 files, 50 MB total).

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

Most pilot-blocking questions resolved. Remaining items, none gating immediate work:

1. **Virus scanning approach** for uploaded attachments — needs pilot decision before file upload endpoint goes live.
2. **Draft expiry policy** — recommend 90 days past last edit OR cycle close, but confirm with Sarah/Connor.
3. **Submission confirmation email content + sender identity** — portal sends synchronously on submission. Use existing `DynamicsService.createAndSendEmail` or send via a different transport? Probably Dynamics email so it appears in CRM history.
4. **Staff-side approval UI for new account requests** — we know we need it; needs minimal design (table of pending requests + approve/reject button per row).
5. **What "Phase II Pending" actually triggers** in Connor's PA flow set — coordinate with Connor on which existing flows fire vs. which need to be created/updated for the portal-originated source.
6. **Cycle close behavior** — does the form become read-only after the deadline? Hard cutoff or grace period?

---

## Immediate next steps (in order)

1. **Wait for IT response on Entra tenant.** Nothing portal-side ships without it.
2. **Connor sync** — review `wmkf_portal_membership` shape; rough field inventory for Phase II Research form; confirm PA flow boundary; identify which "Phase II Pending" PA flows need updating to handle portal-originated submissions vs. GOapply-originated.
3. **Sarah engagement** (on return from conference) — form wishlist, structured-vs-narrative tradeoffs per field, UI must-haves.
4. **Schema work** — once Entra is ready and shape is reviewed, create the `wmkf_portal_membership` table and add the fields to `contact` and `akoya_request`.
5. **`/apply` skeleton** — auth flow + dashboard + first form (`phase-ii-research-2026-06`) iteratively. Aim for end-to-end click-through (auth → dashboard → form → submit → land in Dynamics) before polishing any single screen.

Hard target: pilot accepting submissions by **2026-06-01** for the mid-June Phase II Research cycle. Slip risk concentrated entirely in the IT timeline; everything else is in our control.
