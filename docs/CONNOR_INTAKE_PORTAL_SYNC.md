# Connor sync — Intake portal pilot

**Audience:** Connor
**Status:** Draft pre-read for the next portal-focused sync. Intake portal pilot targets the **mid-June 2026 Phase II Research cycle** (~25 proposals). IT email for the Entra External ID tenant goes Monday 2026-05-04; the items below are everything that needs Connor input *independently of* the IT timeline.
**Read first:** `docs/INTAKE_PORTAL_DESIGN.md` (design v2, scope locked).

---

## What I need from this sync

Concrete decisions on six things, in priority order:

1. **`wmkf_portal_membership` schema sign-off** (blocker — needed before I can create the entity)
2. **Reviewer-consumable artifact** — pick option 1 vs option 2 (blocker — affects whether portal needs a renderer or PA needs a new flow)
3. **Phase II Research form field inventory — first pass** (rough list; Sarah will refine on return, but I want your view of the must-haves)
4. **PA flow boundary** at `'Phase II Pending'` — what fires today vs. what needs updating for portal-originated submissions
5. **Account creation policy** — when an applicant claims an institution that does not exist in Dynamics yet
6. **Structured-tables persistence contract** — pick one storage pattern for budget / Co-Is / milestones / prior-support before submit endpoints are wired

Estimate: 30-45 min. I will send the actual meeting invite once we agree on a slot.

---

## 1. `wmkf_portal_membership` schema

The applicant portal needs a person ↔ institution join, with state. Pilot adds **one** new entity (deferred the other three planned tables to Phase 1+ expansion). Proposed shape:

| Field | Type | Notes |
|---|---|---|
| `wmkf_portal_membershipid` | PK | |
| `_wmkf_contact_value` | lookup → `contact` | |
| `_wmkf_account_value` | lookup → `account` | |
| `wmkf_role` | choice | `submitter` \| `contributor` |
| `wmkf_isprimary` | bit | flags primary communications contact for the institution |
| `wmkf_approvalstatus` | choice | `requested` \| `approved` \| `rejected` \| `revoked` |
| `_wmkf_requestedby_value` | lookup → `contact` | who initiated (applicant self-service, or staff) |
| `wmkf_requestedat` | datetime | |
| `_wmkf_approvedby_value` | lookup → `systemuser` | staff approver |
| `wmkf_approvedat` | datetime | |
| `wmkf_rejectionreason` | string | optional, surfaced to applicant on rejection |
| `statecode` | active/inactive | hard kill switch; `approved + active` = live |

Alternate key: (`_wmkf_contact_value`, `_wmkf_account_value`) — one row per (person, institution) pair, regardless of approval state. Re-applying after rejection updates the existing row, no duplicate.

**Why both `wmkf_approvalstatus` and `statecode`:**
- `requested` / `rejected` / `revoked` need to be distinguishable in the admin UI (pending approval vs. user we cut off). `statecode` alone collapses them.
- `statecode = inactive` is the kill switch — stays for hard suspension, GDPR, etc.

**Decisions sought:**
- Are these the right field names by your conventions? (e.g., do you prefer `wmkf_approvalstate` over `wmkf_approvalstatus`?)
- Anything missing? (e.g., `wmkf_lastloginat`, `_wmkf_invitedby_value`?)
- Any reason to use `account` differently than I have it (e.g., a parent/child relationship rather than a join via this entity)?

Once we agree, I'll create the table in dev and we can iterate.

---

## 2. Reviewer-consumable artifact

We removed the auto-PDF generator from pilot scope, but reviewers still need a coherent submission body to read. The external reviewer flow currently exposes curated SharePoint files under `Reviewer_Downloads/` — if applicant content lives only as Dynamics fields + uploaded attachments, reviewers will not see the structured body.

Four options, in rough effort order:

1. **Staff-rendered Word/PDF on demand.** Admin clicks "generate review packet" in `/apply/admin/*`; portal renders the form (read-only HTML → Word via existing pattern, or print-to-PDF) and drops it in `Reviewer_Downloads/`. Lightest build; preserves the "no auto-generator" stance. *(Default if you do not push back.)*
2. **PA-built review packet.** Your PA flow assembles a SharePoint folder of the applicant's attachments + a templated cover doc on `'Phase II Pending'` flip. Heavier coordination, but matches existing PA boundary and means staff don't have to click anything.
3. **Structured portal view exported by staff.** Read-only `/apply/admin/request/:id` that staff save-as-PDF. Same effort as #1, no automation.
4. **Auto-generated submission PDF.** What we deferred. Cleanest reviewer experience, most build cost. Defer further unless reviewers complain post-pilot.

**Decision sought:** option 1 vs option 2. (3 and 4 are pilot-deferrable.)

If option 2 — I'd like to know whether you'd prefer the cover doc to be assembled in PA from a Word template, or whether the portal should generate the cover and PA just does the file moves.

---

## 3. Phase II Research form — first-pass field inventory

Sarah will own the final list when she's back from her conference; this is a starting point so we have something concrete for her to react to rather than a blank canvas.

**My understanding of the rough envelope** (correct me where I am wrong):

- ~10 free-text narrative fields, each roughly paragraph-length
- ~8 attachments typical, up to ~20 in edge cases (CVs, biosketches, letters of support add up)
- Some structured tables — best candidates for "machine-legible from day one":
  - **Budget** — year × category × amount
  - **Co-PI / personnel roster** — name, affiliation, role, % effort
  - Anything else? (Milestones / timeline? Prior support?)
- No conditional / branching fields in pilot
- No unusual widgets (no signature blocks, no IRB / IACUC checkboxes that need special handling)

**Decisions sought:**
- Is the structured-vs-narrative split right? Anything currently buried in narrative or XLSX that should be promoted to a structured table for downstream tools?
- Any GOapply fields that you would *not* migrate as-is? (i.e., fields that exist in GOapply because GOapply has them, not because WMKF actually uses them.)
- Any fields that need to move *from* applicant *to* staff (i.e., things applicants fill in today that staff really should be calculating)?

### 3a. Concrete unmapped-field punch list

The schema sketch in `shared/forms/phase-ii-research-2026-06/schema.js` is wired through a mapper (`map-to-dynamics.js`) that auto-detects which fields lack a confirmed Dynamics target. Generated by `scripts/smoke-form-map.js`:

**Confirmed mappings already in place:**
- `project_title` → `akoya_title`
- `project_abstract` → `wmkf_abstract`
- `project_start_date` → `akoya_begindate`

**Decisions needed — direct akoya_request fields:**

| Schema key | Question for Connor |
|---|---|
| `project_duration_months` | New numeric field, or derive `akoya_enddate = begindate + N months`? |
| `specific_aims`, `significance`, `innovation`, `approach`, `risks_alternatives`, `broader_impact` | Six narrative fields. Dedicated `wmkf_*` longtext columns on `akoya_request` (recommended — downstream AI tools see the text without re-parsing PDFs), or a child entity, or attachment-only? |
| `total_request_usd` | New field, or overwrite an existing Phase I "amount requested"? |
| `pi_name` / `pi_email` / `pi_orcid` | All three probably belong on `contact`, not `akoya_request`. Confirm. |
| `human_subjects`, `vertebrate_animals`, `biohazards`, `compliance_note` | Four compliance fields. New `wmkf_*` columns or a child compliance entity? |

**Decisions needed — structured child entities:**

| Schema key | Question for Connor |
|---|---|
| `co_investigators` (table: name, affiliation, role, % effort) | New child entity, or reuse the existing `wmkf_copi1..5` lookup slots? Latter is simpler but caps at 5 Co-Is. |
| `budget_lines` (year × category × amount) | Dedicated child entity (clean), or JSON blob on `akoya_request` (minimal schema churn for pilot)? |
| `milestones` (date + deliverable) | Same shape question as budget_lines. |
| `prior_support_rows` (per-person grant inventory) | Almost certainly its own entity since rows reference Co-Is. Confirm. |

---

## 4. PA flow boundary at `'Phase II Pending'`

Submission flips `akoya_request.akoya_requeststatus = 'Phase II Pending'`. That same flip already happens today via GOapply for the current cycle. Portal just becomes a second source of that flip.

**My assumptions, please confirm or correct:**

- Existing PA flows that fire on `'Phase II Pending'` are source-agnostic — they will fire correctly when the portal sets the field, no changes required.
- Reviewer pipeline kickoff (Reviewer Finder enrichment, etc.) is one of those flows — should Just Work.
- Notification email to program staff on submission — Just Works.
- SharePoint subfolder structure (`Reviewer_Downloads/`, `Reviewer_Uploads/`, etc.) — your existing flow that creates these on request creation continues to handle this.

**What might need updating:**
- Any flow that *reads* GOapply-specific fields (e.g., a GOapply submission ID, a GOapply form payload reference) will fail for portal-originated submissions because those fields will be null. Are there any I should know about?
- Submission confirmation email to the applicant — pilot plan is for the portal to send this synchronously via Dynamics email so it appears in CRM history. If you'd rather PA own this, I'll skip it portal-side.

**Decisions sought:**
- Submission confirmation email — portal-owned (synchronous Dynamics email) or PA-owned (async on status flip)?
- Anything in the existing flow set that will break or behave oddly with a non-GOapply source of `'Phase II Pending'`?

---

## 5. Account creation policy

When an applicant signs in and their institution doesn't exist as an `account` in Dynamics yet:

**Pilot plan:**
1. Applicant enters institution name + EIN.
2. Portal queries Dynamics for exact-EIN → exact-name → fuzzy-name matches.
3. Returns 0..N candidates to the applicant.
4. Applicant picks "yes, that's us" *or* "create new."
5. Either way, the resulting `wmkf_portal_membership` is in `requested` state and routes to staff approval.
6. On approval: if "create new" was chosen, staff approval triggers `account` creation; then `wmkf_portal_membership` flips to `approved`.

For ~25 pilot applicants, strict staff approval on every new account is fine. We can relax this later.

**Decisions sought:**
- Are you OK with the portal creating `account` rows directly on staff approval (i.e., portal does the write, not PA)? My default is yes — keeps the "portal owns applicant-originated writes" boundary clean.
- Any fields on `account` that *must* be populated at creation time that the applicant won't have? (e.g., parent account, owner, region tagging — anything we can't infer from EIN + name.)
- Any institutions you'd expect the portal to *block* even on staff approval (e.g., a denylist for entities WMKF cannot fund)?

---

## 6. Structured-tables persistence contract

The pilot's value proposition over GOapply is **machine-legible capture** — budgets, Co-Is, milestones, and prior support arrive as structured rows, not freeform PDFs. Section 3a frames each table individually, but it's worth picking one storage pattern up front rather than mixing four different answers; otherwise we bake in a heterogeneous shape that we'll pay to clean up later.

Three viable pilot contracts:

1. **Real child entities for each table** — `wmkf_budgetline`, `wmkf_milestone`, `wmkf_priorsupport`, plus either `wmkf_coinvestigator` or reusing `wmkf_copi1..5`. Cleanest long-term, fully queryable in Dataverse on day one. Cost: 3-4 new entities Connor designs and creates before submit can ship.
2. **JSON columns on `akoya_request`** — one `wmkf_*budgetjson`, `wmkf_*coisjson`, `wmkf_*milestonesjson`, `wmkf_*priorsupportjson` longtext per table, holding the JSON array. Pilot-fast, queryable via OData `contains()` (not joinable), trivially migratable to real entities in Phase 1. Schema-light promise stays intact.
3. **Defer to Phase 1** — accept structured tables as draft/UI conveniences only; submit drops them. Honest, but undermines the "machine-legible from day one" pitch.

**My recommendation:** option 2 for pilot. JSON columns let us ship without 3-4 new entities, keep the data structured (downstream tools can `JSON.parse` and operate on rows), and an explicit Phase-1 migration to real entities once Sarah and the program team confirm the table shapes hold up across multiple cycles. Option 1 is correct long-term but pays the cost up front. Option 3 cedes the main reason to build a portal at all.

**Decisions sought:**
- Pick one of 1/2/3 as the pilot's structured-tables contract.
- If option 2 — confirm you're OK with `akoya_request` accumulating four `wmkf_*json` longtext columns for the pilot, with a documented Phase-1 migration plan.
- If option 1 — please scope which 3-4 entities you'd want to design first, since that becomes a hard prerequisite for the submit endpoint.

The per-table questions in Section 3a become much simpler once this top-level pattern is locked in (e.g., option 2 collapses all four "child entity vs JSON" questions into "yes, JSON, what column names").

---

## What I am NOT asking about today

These are scoped out of pilot and don't need decisions yet — listed so we don't accidentally drift into them:

- Phase I in the portal (Phase I stays in GOapply for this cycle)
- Concept stage in the portal (deferred until concept stage redesign settles)
- Cross-phase revision (SoCal future enhancement)
- Form builder UI (forms-as-code per cycle is the pilot stance)
- Auto-generated submission PDF (option 4 above)
- New funding lines beyond Research

---

## Pre-send checklist (Justin)

- [ ] Re-read design doc latest edits since 2026-05-03 patch (Codex review fixes)
- [ ] Confirm IT email actually sent Monday before sending this — otherwise update the timing language
- [ ] Pick a sync slot before sending (don't ask Connor to pick from nothing)
- [ ] If anything Connor flagged in earlier conversations contradicts what I've assumed above, fix here before sending
