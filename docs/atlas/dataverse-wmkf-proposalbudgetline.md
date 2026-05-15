# Atlas: `wmkf_proposalbudgetline` (Dataverse, WMKF child entity)

**Last verified:** 2026-05-15 (S155) — **spec'd, NOT yet deployed.** Slice-0 entity; deploy target 2026-05-19.
**Live row count:** 0 (entity not yet created in Dataverse)
**Entity set:** `wmkf_proposalbudgetlines`
**Schema spec:** `lib/dataverse/schema/wave4/wmkf_proposalbudgetline.json`
**Naming:** working name (`wmkf_proposalbudgetline` vs `wmkf_budgetline`) pending Connor review per `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md`.

## Source of truth

**Per-year, per-category budget rows for an intake-portal proposal.** Child of `akoya_request` (parental, cascade delete). Drained from the applicant intake portal at submit; the status-gated PA recompute (Item 6 A+B hybrid) keeps the `akoya_request` aggregates in sync on post-submit edits. Authoritative spec: `docs/BUDGET_FORM_SPEC.md` v3 + `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md` 2026-05-14 entry.

**Cost-share lives here too** (no separate `wmkf_proposalcostshare` entity — withdrawn). The forever-filter cost: WMKF-spend aggregate queries MUST filter `wmkf_category NOT IN (100000006, 100000007, 100000008)`; the cost-share aggregate (`akoya_request.wmkf_totalothersources`) uses the inverse `IN` set.

## Fields

Identity:
- `wmkf_proposalbudgetlineid` (PK)
- `wmkf_name` (String 160, ApplicationRequired) — primary name; synthesized `Y{year} — {category}: {description}` for picker/grid display only.

Lookup (PascalCase nav-property for `@odata.bind`; lowercase logical for plain reads):
- `wmkf_Request` / `_wmkf_request_value` → `akoya_request` (ApplicationRequired). **Parental — `CascadeConfiguration.Delete = Cascade`**: deleting the request deletes its budget lines.

Data:
- `wmkf_year` (Integer 1..10, ApplicationRequired) — program year; Integer not Choice (forward-compatible across program lengths).
- `wmkf_category` (Picklist, ApplicationRequired) — 9 values, integers **reserved S150, do not renumber**:
  - `100000000=Personnel`, `100000001=Equipment`, `100000002=Supplies`, `100000003=Travel`, `100000004=Other Direct`, `100000005=Indirect` (WMKF-spend; Indirect reserved, always $0)
  - `100000006=WaivedIndirect`, `100000007=WaivedTuition`, `100000008=OtherCostShare` (cost-share). Labels verbatim from `INTAKE_PORTAL_SCHEMA_CHANGES.md:79-81`; the camelCase-vs-spaced inconsistency with WMKF-spend labels is a Connor review item (integers authoritative regardless).
- `wmkf_description` (String 500) — free-text line-item description.
- `wmkf_amount` (Money, USD; MinValue 0) — amount for this line. Negative rejected by the drain server-side before `createRecord` (Dataverse Money won't enforce; drain is the authoritative guard).
- `wmkf_lineorder` (Integer 0..100000) — display order within `(request, year, category)`.
- `wmkf_rolecode` (String 60) — fixed-row discriminator (`principal-investigators`, `consumable-supplies`, `facilities-overhead`); null for dynamic rows.
- `wmkf_headcount` (Integer 0..100000) — Personnel-only (`wmkf_category = 100000000`); null otherwise.
- `wmkf_effortpct` (Integer 0..100) — Personnel-only; null otherwise.

## Read paths

- **(Future)** PA cover-doc builder — reads rows grouped by year + category to populate a Word template (drives whether `wmkf_name` synthesis is consumed or PA assembles its own strings — open Connor item).
- **(Future)** Aggregate consumers — sum `wmkf_amount` with the WMKF-spend / cost-share category filter for `akoya_request` / `akoya_expenses` / `wmkf_totalothersources`.

## Write paths

- **(Future)** Intake drain at submit — creates 5–30 child rows in one pass, then PATCHes parent aggregates (`docs/BUDGET_FORM_SPEC.md` § "Idempotency + drain step ordering").
- **(Future)** Connor's status-gated PA recompute flow (Item 6 A+B hybrid) on Create/Update/Delete — recomputes parent aggregates post-submit.

## Cross-system

| Target | Mapping |
|---|---|
| `akoya_request` (`Money`, "Requested Amount") | Sum of WMKF-spend `wmkf_amount` (categories NOT IN 100000006–8), all years. |
| `akoya_request.wmkf_totalothersources` (`Money`) | Sum of cost-share `wmkf_amount` (categories IN 100000006–8). |
| `akoya_expenses` (`Money`, "Total Project Budget") | `akoya_request + wmkf_totalothersources`. |

## Migration disposition

Net-new entity (slice 0). No backfill — all population is forward-only via the intake drain + PA recompute. No legacy data.

## Open questions / gotchas

- **Entity-set name confirmed at deploy.** `wmkf_proposalbudgetlines` is the expected Dataverse pluralization; verify via metadata after deploy and correct here if Dataverse pluralized differently.
- **Working name pending Connor.** `wmkf_proposalbudgetline` vs `wmkf_budgetline` — and category labels vs WMKF Research conventions — are Connor review items; renaming a deployed entity is painful, so confirm before `--execute`.
- **`@odata.bind` keys are PascalCase** (`wmkf_Request@odata.bind`); lowercase produces `0x80048d19`.
- **Forever-filter discipline.** Every "what is WMKF asked to fund?" query must carry the cost-share exclusion filter; missing it silently inflates totals.
