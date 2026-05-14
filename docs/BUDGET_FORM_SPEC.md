# WMKF Research Phase II — Budget Form: UI/UX & Data Spec

**Status:** v2 draft (2026-05-13, S148). Owned by the Claude Code session. v1 attempted a fresh externalized shape but missed the pre-existing `wmkf_proposalbudgetline` sketch already recorded in `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md` line 22 (committed 2026-05-13 from Justin's meeting decisions). v2 reconciles the externalized layer to that catalog's row-per-year denormalization, moves Other Sources to a separate `wmkf_proposalcostshare` entity (the catalog's WMKF-spend category enum has no home for institutional cost-share semantics), fixes the drain-attribution contradiction (`MSCRMCallerID` requires a real Dynamics systemuser GUID — the "WMK: Research Review App Suite" app user, not the service principal), adds `intake_audit` write events the design contract requires, and surfaces three portal-wide infrastructure gaps that aren't budget-scope (`$batch` not in `dynamics-service.js`, `submission_jobs` not in migration 005, AkoyaGO inline-edit hardening for cached aggregates). All seven schema-design Q&A answers from earlier today still apply except Q1 (Other Sources home), which is overturned with rationale below. User-facing sections (Page Structure, Sections 1–6, Validation Rules, React, UX) are unchanged from v1. Companion build plan: `docs/INTAKE_ADMIN_MEMBERSHIPS_BUILD_PLAN.md` (different slice — membership approval).

---

## Overview

A multi-section budget form for grant applicants. Built as a single page (or wizard step) within the existing app suite. Drafts persist to Postgres `intake_drafts.draft_json`; externalized to Dataverse asynchronously via the `submission_jobs` drain cron on submit. The form replaces a free-form Excel spreadsheet that applicants were filling out incorrectly.

---

## Page Structure

```
[Header: Application context — org name, project title (read-only, pulled from earlier form step)]

[Section 1: Grant Duration]
[Section 2: Personnel Costs]
[Section 3: Equipment Costs]
[Section 4: Operations Costs]
[Section 5: Other Sources of Funding]
[Section 6: Budget Summary (live, read-only)]

[Actions: Save Draft | Submit]
```

---

## Section 1: Grant Duration

A single dropdown at the top of the form. Its value controls which year columns are revealed throughout the rest of the form.

| Field | Type | Options | Default |
|---|---|---|---|
| Number of project years | Dropdown | 1, 2, 3 | 3 |

**Conditional logic:** When value = 1, show only "Year 1" columns. When value = 2, show "Year 1" and "Year 2" columns. When value = 3, show all three year columns.

---

## Section 2: Personnel

### 2a. Header concept

Each personnel row has:
- **Role label** (fixed or user-specified)
- **Headcount** (integer, ≥ 0)
- **% Effort / FTE** (see § 2e below)
- **WMKF funding** per active year (currency, ≥ 0)

### 2b. Fixed personnel rows (always shown)

> **Label change from spreadsheet:** The section previously read "Salary + Fringe Benefits" — use **"Salaries & Fringe Benefits"** as the section sub-label to make clear that entered amounts must include fringe.

| Row label | Headcount field? |
|---|---|
| Principal Investigators | Yes |
| Co-Investigators | Yes |
| Postdoctoral Fellows | Yes |
| Graduate Student Stipends | Yes |
| Graduate Student Tuition/Fees | Yes |

### 2c. "Other Personnel" — dynamic rows

- A button: **"+ Add Personnel Role"**
- Each added row has: a free-text label input + headcount + WMKF per year
- Minimum: 0 additional rows. Maximum: suggest 10 (configurable).
- Rows can be removed with a trash icon.

### 2d. Column structure per row (repeated for each active year)

| Field | Type | Validation |
|---|---|---|
| WMKF Amount (Year N) | Currency input | ≥ 0, numeric only |

(Headcount is a single field, not repeated per year — it's a descriptor, not summed.)

### 2e. Effort / FTE field (per personnel row)

Each personnel row includes a single **% Effort** field (not repeated per year).

| Field | Type | Validation | Notes |
|---|---|---|---|
| % Effort | Numeric, 0–100 | Must be > 0 if any WMKF amount > 0 | Whole numbers sufficient |

**Policy decision captured:** Applicants enter the **total WMKF dollar request** (salary + fringe already included) and note what effort percentage is being applied. The form does not calculate salary from effort. The % Effort field is for reviewer context only.

ℹ️ **Info icon tooltip for % Effort:**
> *"Enter the percentage of this person's time that will be devoted to the project. The dollar amount you enter should already reflect this effort (e.g., if a PI earns $200K and will spend 20% effort, enter $40,000 plus applicable fringe benefits)."*

ℹ️ **Info icon tooltip for Salaries & Fringe Benefits (section level):**
> *"Include both salary and fringe benefits (benefits, payroll taxes, etc.) in each dollar amount. Do not list salary and fringe separately."*

### 2f. Subtotals

Auto-calculated, read-only:
- WMKF subtotal per year (Year 1, Year 2, Year 3)
- WMKF cumulative (sum of all active years)

---

## Section 3: Equipment

### 3a. Structure

Equipment is entirely dynamic (no fixed rows). All rows are user-specified.

- A button: **"+ Add Equipment Item"**
- Each row: free-text description + WMKF amount per active year
- The section can be empty (no equipment in budget).

| Field | Type | Validation |
|---|---|---|
| Description | Text input | Required if row exists |
| WMKF Amount (Year N) | Currency input | ≥ 0 |

### 3b. Subtotals

Auto-calculated, read-only:
- WMKF subtotal per year
- WMKF cumulative

---

## Section 4: Operations

### 4a. Fixed operation rows (always shown, but amount can be $0)

| Row label | WMKF input | Notes |
|---|---|---|
| Consumable Supplies | Enabled | |
| Animal Costs | Enabled | |
| Travel / Symposia | Enabled | |
| Contracted Services | Enabled | |
| Renovations | Enabled | |
| Facilities / Overhead | **Disabled** | See policy note below |

**Facilities / Overhead — WMKF policy note:** The WMKF amount fields for Facilities/Overhead must be rendered as **disabled (locked) inputs** with a tooltip:

> *"WMKF funding for Facilities & Overhead is not currently permitted."*

Do not hide the field — keep it visible so applicants understand the row exists but is restricted. When policy changes, this becomes a single feature-flag toggle with no form restructuring required. The Facilities/Overhead amount is instead captured under Other Sources (see Section 5).

### 4b. Dynamic "Other Operations" rows

- Button: **"+ Add Operations Item"**
- Each row: free-text description + WMKF per active year

### 4c. Subtotals

Auto-calculated, read-only:
- WMKF subtotal per year
- WMKF cumulative

---

## Section 5: Other Sources of Funding

**Background context for developers:** In the prior Excel-based process, the only "Other Sources" field applicants reliably filled in was Facilities/Overhead (an institutional overhead calculation). These three structured categories replace that single opaque field, giving the foundation visibility into the *nature* of each institutional contribution.

### 5a. Section-level helper text (display to applicant)

> *"Most cost-sharing takes the form of waived indirect or tuition costs. If your institution is contributing direct costs (e.g., renovations, equipment, salary support), use 'Other Cost Share / In-Kind' and describe the contribution."*

### 5b. Three fixed categories (always shown)

| Row label | Notes |
|---|---|
| Waived Indirect Costs | Indirect costs the institution is waiving on behalf of the project |
| Waived Tuition Costs | Tuition costs the institution is waiving |
| Other Cost Share / In-Kind | Requires a free-text description if any amount > 0 |

### 5c. Column structure

| Field | Type | Validation |
|---|---|---|
| Amount (Year N) | Currency input | ≥ 0 |
| Description (Other row only) | Text input | Required if any Other amount > 0 |

### 5d. Subtotals

- Other Sources subtotal per year
- Other Sources cumulative

---

## Section 6: Budget Summary (read-only)

A live-updating panel, always visible (sticky or at-a-glance).

| Row | Year 1 | Year 2 | Year 3 | Cumulative |
|---|---|---|---|---|
| Personnel (WMKF) | auto | auto | auto | auto |
| Equipment (WMKF) | auto | auto | auto | auto |
| Operations (WMKF) | auto | auto | auto | auto |
| **Total WMKF** | **auto** | **auto** | **auto** | **auto** |
| Other Sources | auto | auto | auto | auto |
| **Total Project Cost** | **auto** | **auto** | **auto** | **auto** |

### Validation banner

> ✅ *"Cumulative WMKF total: $400,000 — valid (multiple of $100,000)"*

> ❌ *"Cumulative WMKF total: $342,500 — not a multiple of $100,000. Add $57,500 to reach $400,000, or remove $42,500 to reach $300,000."*

Both round-up and round-down targets are always shown. In practice, the difference is typically absorbed by adjusting Consumable Supplies. Runs live and blocks form submission.

---

## Validation Rules

| Rule | Trigger | Message |
|---|---|---|
| All currency fields numeric | On blur | "Please enter a dollar amount (numbers only)" |
| All currency fields ≥ 0 | On blur | "Amount cannot be negative" |
| Dynamic row description required | On submit | "Please enter a description for each custom line item" |
| "Other Cost Share" description required if amount > 0 | On blur / submit | "Please describe the nature of this cost share" |
| Cumulative WMKF must be a multiple of $100,000 | Live + on submit | "Total WMKF request must be a multiple of $100,000" |
| At least one budget line item must have a value > 0 | On submit | "Budget cannot be empty" |
| Headcount must be a whole number ≥ 0 | On blur | "Enter a whole number (0 or more)" |
| % Effort must be > 0 if any WMKF amount > 0 | On blur | "Enter the effort percentage for this role" |

---

## Data wiring

The budget form is **one section** of the larger Phase II Research intake form. It follows the same Postgres-first / async-drain pattern as the rest of the intake portal (see `docs/INTAKE_PORTAL_DESIGN.md` § "Draft staging" and § "Submission lifecycle"). There is no standalone "budget submission" entity — `akoya_request` is the parent.

### Editing layer — Postgres `intake_drafts.draft_json`

While the applicant edits, budget data lives as a sub-object inside the existing `intake_drafts.draft_json` JSONB column. No separate FK, no per-budget status field. The intake draft row IS the in-progress budget. Browser autosaves debounced to `/api/intake/draft` (30s of inactivity or field blur).

Proposed JSONB shape:

```jsonc
draft_json = {
  // ... other form sections ...
  budget: {
    projectYears: 3,                              // 1 | 2 | 3 — drives column visibility
    personnel: [
      {
        kind: "fixed",                             // "fixed" | "dynamic"
        roleCode: "principal-investigators",       // stable enum for fixed; null for dynamic
        label: "Principal Investigators",          // user-editable for dynamic; static for fixed
        headcount: 2,
        effortPct: 25,
        year1: 80000, year2: 80000, year3: 80000
      },
      // ... 4 more fixed personnel rows ...
      {
        kind: "dynamic",
        roleCode: null,
        label: "Research Technician",
        headcount: 1,
        effortPct: 100,
        year1: 65000, year2: 67000, year3: 0
      }
    ],
    equipment: [
      { description: "Confocal microscope upgrade", year1: 120000, year2: 0, year3: 0 }
    ],
    operations: [
      { kind: "fixed", code: "consumable-supplies", label: "Consumable Supplies",
        year1: 15000, year2: 15000, year3: 15000 },
      // ... 4 more enabled fixed operations rows ...
      { kind: "fixed", code: "facilities-overhead", label: "Facilities / Overhead",
        year1: 0, year2: 0, year3: 0, locked: true },    // always 0; policy-locked
      { kind: "dynamic", code: null, label: "Cloud compute time",
        year1: 8000, year2: 8000, year3: 8000 }
    ],
    otherSources: [
      { sourceType: "waived-indirect-costs", description: null,
        year1: 150000, year2: 150000, year3: 150000 },
      { sourceType: "waived-tuition-costs", description: null,
        year1: 30000, year2: 30000, year3: 30000 },
      { sourceType: "other-cost-share", description: "Lab renovation funded by institution",
        year1: 50000, year2: 0, year3: 0 }
    ]
  }
}
```

Notes on the shape:
- **No subtotals or cumulative totals stored.** They're derived client-side and recomputed during the drain cron's externalization step. Storing them invites drift between the line items and the totals.
- **`projectYears` clipping:** `year2` / `year3` fields can be present in JSONB regardless of `projectYears`, but UI must zero them when `projectYears` shrinks, and the externalization step must ignore them. Decision: clip on UI shrink (cleaner state).
- **`kind: "fixed"` vs `"dynamic"`** with a stable `roleCode` / `code` on fixed rows lets the drain step map cleanly to externalized field names without relying on label text matching. Facilities/Overhead is identified by `roleCode='facilities-overhead'` (not a separate `locked` flag — dropped per Codex v3 review; `wmkf_locked` was a mutable Boolean for a policy invariant).

**Audit-log events (per `INTAKE_PORTAL_DESIGN.md` § "intake_audit" contract — material financial data requires audit coverage):**

| Trigger | `action` | `payload` (service hashes to sha256) |
|---|---|---|
| Autosave upsert of `intake_drafts` row | `budget.draft.autosave` | `{ budgetCumulativeTotal, lineItemCount }` — full JSONB not in payload (too noisy for autosave cadence; the draft row itself is the canonical state) |
| Applicant clicks Submit | `budget.submit.enqueued` | `{ submissionJobId, budgetCumulativeTotal, lineItemCount, otherSourcesCumulativeTotal }` |
| Drain externalization succeeds | `budget.externalize.success` | `{ submissionJobId, rowCountWritten, aggregateTotals }` |
| Drain externalization fails (permanent) | `budget.externalize.failed` | `{ submissionJobId, attempts, lastError }` |
| $100K-multiple invariant violated at submit | `budget.validation.failed` | `{ submissionJobId, cumulativeTotal, expectedRoundUp, expectedRoundDown }` |

Calls go through `IntakeAuditService.log({ actorOid, actorType, action, targetEntity: 'wmkf_proposalbudgetline', payload, ... })` per the live signature at `lib/services/intake-audit-service.js:32`. Audit writes are non-blocking; failures warn but never block the response.

### Externalized layer — Dataverse (on submit, via drain cron)

When the submit endpoint queues a `submission_jobs` row, the drain cron's `dynamics_patched` step walks `payload.budget` and writes to Dataverse: child rows under two entities (`wmkf_proposalbudgetline` for WMKF spend lines, `wmkf_proposalcostshare` for institutional cost-share lines), plus four field updates on the parent `akoya_request`.

**Drain attribution.** Async drain writes are not user-initiated, so `MSCRMCallerID` doesn't impersonate the applicant. Two options were considered:

- **(A) Pass `actingUserSystemId = <WMK app user systemuserid>`** — the "WMK: Research Review App Suite" app user already exists in Dynamics as a real `systemuser` row (per memory `project_dynamics_identity_reconciliation` § "Dynamics CRM Users"). `_withCallerId` accepts this and `modifiedby` reflects the app user. **Pilot path.**
- **(B) Pass `actingUserSystemId = null`** — `_withCallerId` omits the header per `lib/services/dynamics-service.js:166-170`; writes attribute to the OAuth service principal directly. Cleaner audit story ("this row was written by automation, not a user"), but every Dataverse audit row reads as "Application User" with no further differentiation.

**Decision: Option A.** Preserves consistency with the admin-slice attribution model (impersonation everywhere makes the audit trail uniform). Slice 0 records the app-user systemuserid in the Atlas page so the drain implementation reads it from one place.

**Row-per-(line, year) shape (reconciled with `INTAKE_PORTAL_SCHEMA_CHANGES.md` line 22).** A 3-year personnel line in the JSONB becomes **3 child rows** in Dataverse — one per active year. This matches the pre-committed catalog shape and matches Connor's PA template grouping (his cover-doc PA reads `(year, category, description, amount)` rows and assembles a grouped Word document).

| Source JSONB | Target | Per-year unroll |
|---|---|---|
| `budget.personnel[i]` with `year1=80000, year2=80000, year3=80000` (projectYears=3) | 3 rows in `wmkf_proposalbudgetline`, `wmkf_category='Personnel'` | Y1, Y2, Y3 rows each carrying `wmkf_amount` for that year |
| `budget.equipment[i]` | rows in `wmkf_proposalbudgetline`, `wmkf_category='Equipment'` | One per active year with `wmkf_amount > 0`; **empty arrays produce zero rows** (an applicant with no equipment writes no Equipment children) |
| `budget.operations[i]` for `code IN ('consumable-supplies', 'animal-costs', 'travel-symposia', 'contracted-services', 'renovations')` | rows in `wmkf_proposalbudgetline`, `wmkf_category` mapped to catalog enum (see mapping table below) | One per active year |
| `budget.operations[i]` for `code='facilities-overhead'` | rows in `wmkf_proposalbudgetline`, `wmkf_category='Indirect'`, `wmkf_amount=0` always | **Always written** per § Idempotency — preserves the audit semantic that the applicant saw the row |
| `budget.otherSources[i]` | rows in `wmkf_proposalcostshare`, `wmkf_sourcetype` per the discriminator | Per-year unroll. **Empty rows (all years 0) are not written**, except `other-cost-share` rows where description is non-empty (treated as intentional disclosure) |
| `budget.projectYears` | `akoya_request.wmkf_projectyears` (Whole Number) | One field write |
| Cumulative totals (derived) | `akoya_request.wmkf_totalwmkfrequested`, `wmkf_totalothersources`, `wmkf_totalprojectcost` | See § Aggregate fields |

**Category mapping from JSONB to catalog enum.** The catalog's `wmkf_category` enum is a fixed pilot set: `Personnel / Equipment / Supplies / Travel / Other Direct / Indirect`. The form's Operations section has six fixed sub-rows; they map as:

| Form row code | `wmkf_category` |
|---|---|
| `consumable-supplies` | `Supplies` |
| `animal-costs` | `Other Direct` |
| `travel-symposia` | `Travel` |
| `contracted-services` | `Other Direct` |
| `renovations` | `Other Direct` |
| `facilities-overhead` | `Indirect` (reserved category — WMKF doesn't pay; always 0) |

Dynamic "Other Operations" rows also map to `Other Direct`. The applicant-facing label collapses 4 categories into one "Other Direct" bucket on the Dataverse side — Connor's cover-doc PA can group by `wmkf_category` for reviewer display, and the applicant-facing `wmkf_description` carries the specific line identity.

The original spec proposed a parent `wmkf_budgetsubmission` table with its own `wmkf_status`. **That table is intentionally dropped** — `akoya_request` already serves as the parent, and the draft/submitted state machine is handled by `intake_drafts` (draft) → `submission_jobs` (in-flight) → externalization (terminal).

### `wmkf_proposalbudgetline` entity fields

Pre-committed catalog shape from `INTAKE_PORTAL_SCHEMA_CHANGES.md` line 22 + three v2-additions (`wmkf_rolecode`, `wmkf_headcount`, `wmkf_effortpct`) flagged for Connor at the 2026-05-15 review.

| Field | Type | Source | Notes |
|---|---|---|---|
| `wmkf_proposalbudgetlineid` | Unique Identifier (PK) | catalog | Auto |
| `wmkf_name` | Text(160) | catalog | Synthesized: `Y{year} — {category}: {description}` |
| `_wmkf_request_value` | Lookup → `akoya_request` | catalog | Parental, cascade delete. Bound via nav-property `@odata.bind` on write — exact bind key (likely `wmkf_Request@odata.bind`) recorded at slice 0 deploy |
| `wmkf_year` | Whole Number (1–10) | catalog | Forward-compatible across program lengths; pilot writes 1/2/3 |
| `wmkf_category` | Choice | catalog | Numeric option-set values per `lib/services/dynamics-service.js:930` convention. Values: `Personnel / Equipment / Supplies / Travel / Other Direct / Indirect`. Numeric mapping table recorded in Atlas at slice 0 |
| `wmkf_description` | Text(500) | catalog | Line-item description. For fixed rows: the static label ("Principal Investigators", "Consumable Supplies"). For dynamic rows: applicant-entered text |
| `wmkf_amount` | Money (USD) | catalog | Single value per row (this row IS one year) |
| `wmkf_lineorder` | Whole Number | catalog | Display order within `(request, year, category)` |
| `wmkf_rolecode` | Text(60) | **v2 addition** | Stable identifier for fixed rows (`principal-investigators`, `consumable-supplies`, `facilities-overhead`, etc.); null for dynamic rows. Drain uses this for idempotent identification of fixed rows; flagged for Connor 2026-05-15 |
| `wmkf_headcount` | Whole Number | **v2 addition** | Personnel rows only (null otherwise); flagged for Connor 2026-05-15. Lives here vs. `wmkf_proposalroster` because budget headcount is an aggregate descriptor ("we want funding for 2 PIs"), distinct from roster's per-person identity |
| `wmkf_effortpct` | Whole Number (Min 0, Max 100) | **v2 addition** | Personnel rows only (null otherwise); flagged for Connor 2026-05-15. Same distinction from roster — budget effort is the aggregate funded effort, roster effort is per-person |

Note: the per-year-row shape means `wmkf_headcount` and `wmkf_effortpct` repeat across Y1/Y2/Y3 rows for the same logical personnel line. The drain writes the same value to all year-rows for that line. Reports that want "headcount per personnel line" can `GROUP BY` `(request, category, rolecode, description, lineorder)`.

### `wmkf_proposalcostshare` entity fields (v2 addition)

The seven-question session today picked "unified" (Q1) — keeping Other Sources inside `wmkf_proposalbudgetline` with a `wmkf_category='other-source'` discriminator. **v2 overturns that.** Reasoning:

1. The catalog's `wmkf_category` enum (`Personnel / Equipment / Supplies / Travel / Other Direct / Indirect`) is implicitly **WMKF-spend categories** — the things the foundation is being asked to fund. Other Sources is conceptually different — institutional contributions WMKF does *not* fund.
2. Adding `WaivedIndirect / WaivedTuition / OtherCostShare` to that enum muddies its semantic contract.
3. Aggregates would have to negate Other Sources rows out of every "what is WMKF asked for" query (extra cognitive load forever).
4. Connor's cover-doc PA reads `wmkf_proposalbudgetline` grouped by category; mixing institutional cost-share rows in there changes his template assumptions.

A separate entity scoped to cost-share is cleaner:

| Field | Type | Notes |
|---|---|---|
| `wmkf_proposalcostshareid` | Unique Identifier (PK) | Auto |
| `wmkf_name` | Text(160) | Synthesized: `Y{year} — {sourcetype}: {description}` |
| `_wmkf_request_value` | Lookup → `akoya_request` | Parental, cascade delete |
| `wmkf_year` | Whole Number (1–10) | Pilot writes 1/2/3 |
| `wmkf_sourcetype` | Choice | `WaivedIndirect / WaivedTuition / OtherCostShare`. Numeric mapping in Atlas. |
| `wmkf_description` | Text(500) | Required when `wmkf_sourcetype = OtherCostShare` and amount > 0; otherwise optional |
| `wmkf_amount` | Money (USD) | |
| `wmkf_lineorder` | Whole Number | Display order within `(request, year, sourcetype)` |

This is a new pre-pilot entity, **flagged as an open question for Connor at the 2026-05-15 schema review** (memory `project_intake_portal_pilot_decisions_2026-05-13` Item 1D currently scopes pilot to budget + roster only — adding a third entity is a scope nudge that needs his sign-off).

### Aggregate fields on `akoya_request` (locked 2026-05-13)

The drain writes three cumulative totals to the parent request atomically with the child writes:

| Field | Type | Definition |
|---|---|---|
| `wmkf_totalwmkfrequested` | Currency | Sum of `wmkf_amount` across all `wmkf_proposalbudgetline` rows for this request (all years, all categories including `Indirect` which is always 0). The $100K-multiple invariant applies to this number. |
| `wmkf_totalothersources` | Currency | Sum of `wmkf_amount` across all `wmkf_proposalcostshare` rows for this request. |
| `wmkf_totalprojectcost` | Currency | `wmkf_totalwmkfrequested + wmkf_totalothersources` |

**Why cache:** Connor's PA flows fire on `akoya_request`, AkoyaGO grid views display headline numbers without drilling, and the $100K-multiple business rule is more discoverable as a named parent field than as a child-rollup.

**Per-year aggregates are intentionally skipped for pilot.** Non-breaking add later if a real consumer surfaces.

**Drift hardening:** the drain is the only normal-operation writer to budget children **assuming AkoyaGO does not expose inline child-row edits.** Verify this assumption with Connor at the 2026-05-15 review — if AkoyaGO does surface inline edits on `wmkf_proposalbudgetline` (e.g., a sub-grid on the request form that staff can edit), the cached aggregates will silently drift in production, not just under rare manual-edit scenarios. **If AkoyaGO does edit children:** Phase 1+ adds a Dataverse business rule or plug-in that recomputes the aggregates on any child write. Pilot mitigation: a daily reconcile cron that recomputes aggregates from children and corrects drift, plus a Dataverse audit query staff run weekly during pilot.

### Why not write to Dataverse during draft

Patching Dataverse on every autosave would burn Web API quota and hit throttling during peak submission windows. The intake portal explicitly chose Postgres staging to avoid this — see `INTAKE_PORTAL_DESIGN.md` § "Draft staging — Postgres, not Dynamics" for the full reasoning.

### Idempotency + drain step ordering (v2)

v1 stated delete-and-replace "inside a single Dataverse `$batch` request." **Codex review surfaced that `$batch` is not implemented in `dynamics-service.js`** (only individual `createRecord` / `updateRecord` / `deleteRecord` helpers). Until `$batch` lands as a parent-level intake-portal infrastructure investment, the budget drain runs as a sequence of individual Web API calls with **explicit progress markers in `submission_jobs.dynamics_patches`** so retries are safe.

**Per-attempt drain sequence inside the `dynamics_patched` step:**

1. **Recompute aggregates from the payload.** `cumulativeWMKF = sum(personnel + equipment + operations)`, `cumulativeOther = sum(otherSources)`. Server-side hard gate: if `cumulativeWMKF % 100_000 !== 0`, mark the job `status='failed'` (permanent — not a transient retry), audit-log `budget.validation.failed`, notify staff. The client-side $100K-multiple validation is a UX optimization; this is the trust boundary. Codex MOD #5 fix.
2. **Query existing children for this `request_id`** in `wmkf_proposalbudgetline` and `wmkf_proposalcostshare` via `queryRecords` filtered on `_wmkf_request_value`. Returns the GUID set to delete.
3. **Delete existing children one-by-one** via `deleteRecord`. After each successful delete, append the GUID to `submission_jobs.dynamics_patches.deletedChildIds`. If the cron tick times out mid-delete, the next tick reads the marker, skips already-deleted GUIDs, and resumes.
4. **Insert new children one-by-one** via `createRecord` with `MSCRMCallerID` = WMK app user systemuserid. After each successful insert, append `{ guid, year, category, rolecode }` to `submission_jobs.dynamics_patches.insertedChildren`. Resumable across cron ticks the same way.
5. **PATCH the three aggregate fields on `akoya_request`** via `updateRecord`. Set `submission_jobs.dynamics_patches.aggregatesUpdated=true` after success.
6. **Advance `submission_jobs.status` → `status_flipped` step.**

**Failure semantics:**

- Network 5xx / 429 → transient; existing `submission_jobs` backoff handles it. The progress markers from steps 3-5 mean the retry resumes mid-sequence, not from scratch.
- Permanent 4xx on a child write (e.g., 400 invalid field) → mark job `failed`, notify staff. The partial state in Dataverse (some children deleted, some inserted, aggregates stale) requires staff intervention via a "force re-drain" admin action.
- $100K-multiple violation → permanent fail per step 1.

**Per-`request_id` advisory lock scope (Codex MOD #2 fix):** the existing Postgres advisory lock from `INTAKE_PORTAL_DESIGN.md` § "Drain cron" is held for the duration of **the entire `dynamics_patched` step**, not per Web API call. This means while the drain is writing budget children for request X, no other cron tick can pick up another job for the same request X. Two requests get parallel writes; one request gets serial writes. Sufficient for pilot scale.

**The atomicity gap (Codex MOD #1 + CRITICAL).** Without `$batch`, there exists a window between "all children written" and "aggregates updated" where `akoya_request.wmkf_total*` fields are stale. This window is bounded by the drain step's wall-clock time (seconds, not minutes — pilot scale is ~30 rows max) and by the advisory lock (no second drain interferes). Consumers reading aggregates during this window get stale values; the next read after step 5 completes sees fresh values. **For pilot, accept the gap.** Phase 1+ items in `docs/INTAKE_PORTAL_DESIGN.md` should track adding `$batch` support to `dynamics-service.js` as a cross-cutting infrastructure investment that benefits all async drain consumers.

**Facilities/Overhead row is always written**, even when amount is 0, for symmetry with the other fixed Operations rows and to preserve audit / future-policy-change semantics. The drain asserts `wmkf_amount === 0` on the `wmkf_rolecode='facilities-overhead'` row before writing as defense-in-depth against a client-side bug.

**Conditional-null enforcement for `wmkf_sourcetype` and `wmkf_headcount` / `wmkf_effortpct`:** the drain asserts before each `createRecord`:
- `wmkf_proposalcostshare.wmkf_sourcetype` must be non-null on every row written to that entity.
- `wmkf_proposalbudgetline.wmkf_headcount` and `wmkf_effortpct` must be null unless `wmkf_category='Personnel'`. (Dataverse won't enforce this — Codex MOD #4 fix.)

Violations are payload bugs; treat as permanent failures and notify staff.

---

## React Component Architecture

```
<BudgetFormPage>
├── <BudgetHeader />                        // org name, project title (read-only)
├── <ProjectYearsSelector />                // dropdown, drives column visibility
├── <PersonnelSection activeYears={n} />
│   ├── <PersonnelRow /> (×5 fixed)
│   ├── <DynamicPersonnelRows />
│   └── <SectionSubtotal />
├── <EquipmentSection activeYears={n} />
│   ├── <DynamicEquipmentRows />
│   └── <SectionSubtotal />
├── <OperationsSection activeYears={n} />
│   ├── <OperationsRow /> (×6 fixed)
│   ├── <DynamicOperationsRows />
│   └── <SectionSubtotal />
├── <OtherSourcesSection activeYears={n} />
│   ├── <OtherSourceRow /> (×3 fixed)
│   └── <SectionSubtotal />
├── <BudgetSummaryPanel />                  // live totals + $100K banner
└── <FormActions />                         // Save Draft | Submit
```

State management: React Hook Form + Zod, or Formik. Summary panel derives from form state — no separate state needed. Currency inputs: `react-currency-input-field` for numeric-only formatted entry.

---

## UX Notes

- Year column headers should remain sticky as the applicant scrolls long sections.
- Empty sections are valid — at least one line item across the whole form must be > $0.
- **Save Draft bypasses all validation. Submit enforces all rules.**
- Show the live WMKF cumulative total prominently at all times with a green/red indicator.
- On mobile, use a single-year tab view instead of side-by-side columns.

### Info icon (?) pattern

Use a consistent ℹ️ / ? icon triggering a small popover (not a modal). Implement as a reusable `<InfoPopover text="..." />` component. Confirmed locations:

- **Section level — Salaries & Fringe Benefits:** fringe inclusion rule
- **Row level — % Effort:** how to calculate the dollar request
- **Row level — Facilities / Overhead:** WMKF restriction explanation
- **Section level — Other Sources:** waived costs vs. direct cost share

### "Copy Year 1 → All Years" shortcut

Offer per row (or per section). Copies Year 1 values to Year 2 and Year 3 as-is — no automatic percentage increase (auto-inflation makes hitting the $100K multiple harder). The validation banner will prompt any needed adjustments after copying. Client-side only; "did the applicant use this" state is not persisted.

---

## Decisions locked 2026-05-13 (v2-revised)

v1 had a 7-row table from Justin's morning session. v2 keeps 5 of those as-is, overturns Q1 (Other Sources home), and amends Q5 (idempotency strategy) after Codex review surfaced the `$batch` gap. Walk Connor through the entire table — particularly the v2-overturned rows — at the 2026-05-15 schema review.

| # | Question | v1 Decision | v2 Status |
|---|---|---|---|
| 1 | Other Sources entity | Unified under `wmkf_proposalbudgetline` | **OVERTURNED.** Separate `wmkf_proposalcostshare` entity. Pre-committed `wmkf_category` enum is implicitly WMKF-spend categories; institutional cost-share is conceptually different and adding it muddies every downstream aggregate query. |
| 2 | Budget line entity name | `wmkf_proposalbudgetline` | Unchanged — matches `INTAKE_PORTAL_SCHEMA_CHANGES.md` line 22 catalog name. |
| 3 | Aggregate fields on `akoya_request` | Three Currency fields cached | Unchanged. Drift-hardening question added: confirm with Connor whether AkoyaGO surfaces inline child edits. |
| 4 | `wmkf_projectyears` location | Field on `akoya_request` | Unchanged. |
| 5 | Idempotency | Delete-and-replace in one Dataverse `$batch` | **AMENDED.** `$batch` is not implemented in `dynamics-service.js`. Pilot path: sequential delete + insert with explicit progress markers in `submission_jobs.dynamics_patches` so retries are safe across the gap. Atomic `$batch` tracked as Phase 1+ portal-wide infrastructure investment. |
| 6 | Facilities/Overhead row | Always written, drain asserts amount=0 | Unchanged. Note: identification is by `wmkf_rolecode='facilities-overhead'` (the v1 `wmkf_locked` Boolean flag is dropped — mutable field for a policy invariant is weaker than role-code derivation). |
| 7 | `headcount` / `effortpct` types | Whole Number for both | Unchanged. Fields live on `wmkf_proposalbudgetline` (not on `wmkf_proposalroster`) because budget headcount/effort are aggregate descriptors per personnel line, distinct from the roster's per-person identity records. |

**v2-introduced decisions (not in the original 7):**

| # | Question | Decision |
|---|---|---|
| 8 | Drain attribution | `MSCRMCallerID` set to the **WMK app user systemuserid** (Option A), not null (Option B). Preserves consistency with admin-slice attribution; audit trail is uniform. |
| 9 | $100K-multiple invariant gate | Drain hard-validates the recomputed cumulative WMKF total at step 1 of `dynamics_patched`. Violation → permanent fail (not transient retry). Client-side validation is UX optimization; this is the trust boundary. |
| 10 | `intake_audit` coverage | Five action types: `budget.draft.autosave`, `budget.submit.enqueued`, `budget.externalize.success`, `budget.externalize.failed`, `budget.validation.failed`. Non-blocking. |
| 11 | Per-(line, year) row cardinality | A 3-year personnel line = 3 rows in Dataverse (one per year). Matches the catalog shape + Connor's PA template grouping by `(year, category)`. |
| 12 | Operations → category enum mapping | 6 form rows collapse to 4 catalog enum values (Supplies / Travel / Other Direct / Indirect). Applicant-specific identity lives in `wmkf_description` and the new `wmkf_rolecode` v2-addition. |
| 13 | `wmkf_rolecode` / `wmkf_headcount` / `wmkf_effortpct` field additions to catalog | Three v2-additions to `wmkf_proposalbudgetline`. **Flagged for Connor 2026-05-15** — extensions to the pre-committed catalog shape need his sign-off. |

Schema deploy (a separate slice) ships under the existing delegated authority, summary-after model. The Atlas pages `docs/atlas/dataverse-wmkf-proposalbudgetline.md` and `docs/atlas/dataverse-wmkf-proposalcostshare.md` are created at deploy and record:

- Exact `@odata.bind` keys (likely `wmkf_Request@odata.bind`)
- Numeric option-set values for `wmkf_category` and `wmkf_sourcetype` (Codex HIGH #3 — Dataverse Web API requires numeric values, not labels)
- The WMK app user systemuserid (Codex HIGH #4 + v2 Q8 — drain reads this from one canonical place)
- The category-mapping table from § Externalized layer

## Portal-wide infrastructure gaps surfaced by v2 (not budget-scope)

These are not blocking for the budget form's user-facing slice but **block production-grade externalization** and are tracked at the intake-portal level rather than this spec:

1. **`$batch` support in `dynamics-service.js`.** Currently absent; the drain falls back to sequential calls with progress markers. Cross-cutting because every async-drain consumer (budget, roster, attachments) wants atomic multi-write semantics.
2. **`submission_jobs` table not in migration `005_intake_portal.sql`.** Described in `INTAKE_PORTAL_DESIGN.md` § "Submission lifecycle" but not migrated. Must land before any drain-based externalization slice can ship.
3. **AkoyaGO inline child-row edit hardening.** Whether AkoyaGO surfaces inline edits on `wmkf_proposalbudgetline` rows directly determines if cached aggregates on `akoya_request` need a Dataverse business rule or plug-in to stay consistent. Confirm with Connor 2026-05-15.

Recommend logging these in `docs/INTAKE_PORTAL_DESIGN.md` § "Open questions / open work" so they're tracked at the right scope.
