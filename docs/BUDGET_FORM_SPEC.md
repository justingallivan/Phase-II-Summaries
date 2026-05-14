# WMKF Research Phase II — Budget Form: UI/UX & Data Spec

**Status:** Owned by the Claude Code session as of 2026-05-13 (S148). Originally drafted in a parallel claude.ai browser session, scoped to user-facing UX. This rewrite reflows the doc into proper markdown, retains the UX content verbatim, and replaces the Data Schema section with a Postgres-first / async-drain wiring model that matches `docs/INTAKE_PORTAL_DESIGN.md`. **All seven schema-design questions were resolved 2026-05-13 by Justin** (see § Decisions locked); the externalized layer is implementation-ready, modulo a 15-min walkthrough with Connor at the 2026-05-15 schema design review to confirm no surprises. Companion build plan: `docs/INTAKE_ADMIN_MEMBERSHIPS_BUILD_PLAN.md` (different slice — membership approval, not budget).

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
- **`kind: "fixed"` vs `"dynamic"`** with a stable `roleCode` / `code` on fixed rows lets the drain step map cleanly to externalized field names without relying on label text matching.
- **`locked: true` on Facilities/Overhead** lets the drain assert the row stayed at 0 (defense-in-depth against a future client-side bug).

### Externalized layer — Dataverse (on submit, via drain cron)

When the submit endpoint queues a `submission_jobs` row, the drain cron's `dynamics_patched` step walks `payload.budget` and writes to Dataverse: child entity rows under one unified `wmkf_proposalbudgetline` entity, plus four field updates on the parent `akoya_request`. All writes go through `MSCRMCallerID` impersonation tied to the system service principal during async drain (this is server-driven externalization, not user-initiated — drain-cron attribution is distinct from the admin-slice attribution covered by `INTAKE_ADMIN_MEMBERSHIPS_BUILD_PLAN.md`).

**Externalized shape (decisions locked 2026-05-13):**

| Source JSONB | Target | Notes |
|---|---|---|
| `budget.personnel[]` | one `wmkf_proposalbudgetline` row per entry, `wmkf_category='personnel'` | Carries `wmkf_headcount`, `wmkf_effortpct`, per-year amounts, label / roleCode |
| `budget.equipment[]` | same entity, `wmkf_category='equipment'` | `wmkf_headcount` and `wmkf_effortpct` left null |
| `budget.operations[]` | same entity, `wmkf_category='operations'` | Facilities/overhead row **always written** (see § Idempotency note) |
| `budget.otherSources[]` | same entity, `wmkf_category='other-source'`, with `wmkf_sourcetype` discriminator (`waived-indirect-costs` / `waived-tuition-costs` / `other-cost-share`) | Decision: unified entity, not a separate `wmkf_othersourceline` table. Reduces table count and simplifies the drain step. |
| `budget.projectYears` | `akoya_request.wmkf_projectyears` | Single Whole-Number 1/2/3. Lives on the parent request, not on a cycle/opportunity entity (deferred to Phase 1+). |
| Cumulative totals (derived) | `akoya_request.wmkf_totalwmkfrequested`, `wmkf_totalothersources`, `wmkf_totalprojectcost` | See § Aggregate fields below. |

The original spec proposed a parent `wmkf_budgetsubmission` table with its own `wmkf_status` (Draft / Submitted / Approved / Rejected). **That table is intentionally dropped** — `akoya_request` already serves as the parent, and the draft/submitted state machine is handled by `intake_drafts` (draft) → `submission_jobs` (in-flight) → externalization (terminal). Re-introducing per-budget status would duplicate state already carried by those tables.

### `wmkf_proposalbudgetline` entity fields

| Field | Type | Notes |
|---|---|---|
| `wmkf_proposalbudgetlineid` | Unique Identifier (PK) | Auto |
| `_wmkf_akoyarequest_value` | Lookup → `akoya_request` | Parent request. Bound via nav-property `@odata.bind` on write per `project_dataverse_schema_deploy_gotchas.md`. Exact bind key recorded at slice 0 deploy. |
| `wmkf_category` | Option Set | `personnel` / `equipment` / `operations` / `other-source` |
| `wmkf_lineitemkind` | Option Set | `fixed` / `dynamic` — mirrors JSONB `kind` |
| `wmkf_rolecode` | String (100) | Stable code for fixed rows (`principal-investigators`, `consumable-supplies`, etc.); null for dynamic rows |
| `wmkf_sourcetype` | Option Set | Populated only when `wmkf_category='other-source'`: `waived-indirect-costs` / `waived-tuition-costs` / `other-cost-share`. Null otherwise. |
| `wmkf_label` | String (200) | User-editable for dynamic rows; static for fixed |
| `wmkf_description` | Memo (500) | Required when `wmkf_sourcetype='other-cost-share'` and any year > 0; otherwise optional |
| `wmkf_headcount` | Whole Number | Populated only when `wmkf_category='personnel'`; null otherwise |
| `wmkf_effortpct` | Whole Number (Min 0, Max 100) | Populated only when `wmkf_category='personnel'`; null otherwise |
| `wmkf_year1amount` | Currency | Always populated (may be 0) |
| `wmkf_year2amount` | Currency | Null when `akoya_request.wmkf_projectyears < 2` |
| `wmkf_year3amount` | Currency | Null when `akoya_request.wmkf_projectyears < 3` |
| `wmkf_sortorder` | Whole Number | Preserves display order from the JSONB array |
| `wmkf_locked` | Boolean | True for Facilities/Overhead row; informational |

Data-type choices (locked 2026-05-13): integer for `wmkf_headcount` and `wmkf_effortpct` (whole-numbers-sufficient policy stated in the validation table). If real applicants post-pilot need decimal effort (12.5%), upgrading to Decimal is a non-breaking schema change.

### Aggregate fields on `akoya_request` (locked 2026-05-13)

The drain writes three cumulative totals to the parent request atomically with the line-item batch:

| Field | Type | Definition |
|---|---|---|
| `wmkf_totalwmkfrequested` | Currency | Sum of all `wmkf_year{1,2,3}amount` across `wmkf_category IN ('personnel', 'equipment', 'operations')`. The $100K-multiple invariant applies to this number. |
| `wmkf_totalothersources` | Currency | Sum of all `wmkf_year{1,2,3}amount` across `wmkf_category='other-source'`. |
| `wmkf_totalprojectcost` | Currency | `wmkf_totalwmkfrequested + wmkf_totalothersources`. |

**Why cache:** Connor's PA flows fire on `akoya_request`, AkoyaGO grid views display headline numbers without drilling into children, and the $100K-multiple business rule is more discoverable as a named field on the parent than as a child-rollup. Matches the existing pattern of putting AI summary + status directly on `akoya_request`.

**Per-year aggregates are intentionally skipped for pilot** (9 more fields). If a real downstream consumer needs them, easy non-breaking add later.

**Drift:** the drain is the only normal-operation writer to budget children. If staff manually edits a child row in Dataverse, the aggregate goes stale — acceptable at pilot scale (rare; visibly off by an obvious amount). Phase 1+ can add a Dataverse business rule or plug-in to recompute on child write.

### Why not write to Dataverse during draft

Patching Dataverse on every autosave would burn Web API quota and hit throttling during peak submission windows. The intake portal explicitly chose Postgres staging to avoid this — see `INTAKE_PORTAL_DESIGN.md` § "Draft staging — Postgres, not Dynamics" for the full reasoning.

### Idempotency (locked 2026-05-13)

A submit re-run (drain retry or applicant double-click) must not produce duplicate budget child rows. **Approach: delete-and-replace inside a single Dataverse `$batch` request.** Each drain attempt deletes all existing `wmkf_proposalbudgetline` rows where `_wmkf_akoyarequest_value` matches this request, then inserts fresh rows from the JSONB payload, and updates the three `akoya_request` aggregate fields — all in one atomic batch.

Why delete-and-replace over upsert-by-stable-key:
- No current consumer holds budget-child GUIDs externally. PA flows fire on `akoya_request` status. Reviewer pipeline reads parent summary fields. AkoyaGO grid views render children but don't reference them externally.
- Simpler drain code, fewer edge cases (renamed dynamic rows, deleted line items, reordered rows all collapse to "delete then insert").
- The drain's existing per-`request_id` advisory lock (`INTAKE_PORTAL_DESIGN.md` § "Drain cron") prevents two concurrent jobs from interleaving writes on the same request.

If a future consumer needs stable child GUIDs, switching to upsert-by-stable-key is a drain-step-only change — the JSONB payload shape stays the same.

**Facilities/Overhead row is always written**, even when amounts are 0, for symmetry with the other fixed Operations rows and to preserve audit / future-policy-change semantics. The drain asserts `wmkf_year{1,2,3}amount === 0` on the locked row before writing as defense-in-depth against a client-side bug.

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

## Decisions locked 2026-05-13

Resolved with Justin during S148. Walk Connor through these at the 2026-05-15 schema review to confirm no surprises; the spec body above already reflects each decision.

| # | Question | Decision |
|---|---|---|
| 1 | Other Sources entity | **Unified** under `wmkf_proposalbudgetline` with `wmkf_category='other-source'` + `wmkf_sourcetype` discriminator. No separate `wmkf_othersourceline` table. |
| 2 | Budget line entity name | **`wmkf_proposalbudgetline`** (the 2026-05-13 sketch wins over the 2026-05-06 `wmkf_budgetline`). |
| 3 | Aggregate fields on `akoya_request` | **Three Currency fields** cached on the parent: `wmkf_totalwmkfrequested`, `wmkf_totalothersources`, `wmkf_totalprojectcost`. Per-year aggregates skipped for pilot. |
| 4 | `wmkf_projectyears` location | **Field on `akoya_request`.** Cycle/opportunity entity is deferred to Phase 1+. |
| 5 | Idempotency | **Delete-and-replace within one Dataverse `$batch`.** No external consumer holds child GUIDs; simplest drain code path. Switch to stable-key upsert is a drain-only change if needed later. |
| 6 | Facilities/Overhead row | **Always written**, even when 0, for symmetry / audit / future policy change. Drain asserts amounts === 0 on the locked row. |
| 7 | `headcount` / `effortpct` types | **Integer (Whole Number) for both.** Matches the whole-numbers-sufficient validation policy. Decimal upgrade post-pilot is non-breaking. |

Schema deploy (slice 0 in the drain implementation slice plan, separately) ships under the existing delegated authority, summary-after model. The Atlas page `docs/atlas/dataverse-wmkf-proposalbudgetline.md` is created with the entity + records the exact `@odata.bind` keys, alternate keys (none for pilot — the `_wmkf_akoyarequest_value + wmkf_category + wmkf_rolecode + wmkf_sortorder` tuple is sufficient via `$filter`), and choice values for both `wmkf_category` and `wmkf_sourcetype`.
