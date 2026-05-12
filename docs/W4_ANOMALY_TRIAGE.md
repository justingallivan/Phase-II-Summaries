# W4 Anomaly Triage — `reviewer_suggestions` PG↔DV

**Day 1 deliverable. Date:** 2026-05-12.
**Parity script:** `scripts/backfill-reviewer-suggestions-parity.js`
**Rerun timestamp:** 2026-05-12T22:02:01Z (this session)

## Summary

| Class | Count | Disposition |
|---|---|---|
| A — already in Dataverse | 329 | no action |
| B — active cycle, would backfill | 0 | n/a |
| C2 — closed + engaged, backfill | 0 | n/a |
| C1 — closed + no engagement, discard | 0 | n/a |
| **Anomaly** | **8** | **all accept-loss; see per-row table** |

Live total: 337 PG rows. All 8 anomalies are J26 + `selected=true`. Two of these 8 are the source of the W3 acceptance gate 6/7/8 J26 PG=331 vs DV=329 informational drift.

## Why all 8 are accept-loss

The parity script can't classify these because:
- **Missing email (4 rows):** `potentialreviewer` lookup needs email as canonical key. Without email, the row can't be reliably matched to (nor written into) a Dataverse `wmkf_potentialreviewer` row.
- **Missing request_number (4 rows):** request lookup needs `akoya_requestnum`. Without it, there's no way to determine which `akoya_request` the suggestion attaches to.

Both classes pre-date the current `save-candidates.js` writer contract, which enforces both fields on insert. The rows represent abandoned discovery-flow saves; none have engagement signals beyond the `selected` checkbox flip.

Recovering these to Dataverse would require manual per-row data entry (look up email by name, or guess at the request from proposal title). Justin's call: **not worth the manual work for 8 historical rows; accept loss, document each, do not block W4 on a recovery pass.**

## Per-row dispositions

| PG id | request_number | cycle | email | name | engagement | disposition |
|---|---|---|---|---|---|---|
| 532 | 1002181 | J26 | NULL | Majid Basharat | selected only | accept-loss (no email; cannot upsert potentialreviewer) |
| 561 | 1002305 | J26 | NULL | Marian Kupczynski | selected only | accept-loss (no email) |
| 611 | 1002185 | J26 | NULL | Kuan-Lin Chen | selected only | accept-loss (no email) |
| 801 | 1002365 | J26 | NULL | Dr. Karine Gibbs | selected only | accept-loss (no email) |
| 915 | NULL | J26 | ccoley@mit.edu | Dr. Connor Coley | selected only | accept-loss (no request anchor; row pre-dates request_number column) |
| 916 | NULL | J26 | gisbert.schneider@pharma.ethz.ch | Gisbert Schneider | selected only | accept-loss (no request anchor) |
| 918 | NULL | J26 | aube-office@medchemlett.acs.org | Werngard Czechtizky | selected only | accept-loss (no request anchor) |
| 921 | NULL | J26 | glorius@uni-muenster.de | Frank Glorius | selected only | accept-loss (no request anchor) |

## Operational implication for W4

- `scripts/backfill-reviewer-suggestions-to-dataverse.js` (Day 2 build) ships as a **no-op-by-default** for this dataset — the dry-run output reports 0 candidates for recovery. The script's value is the safety contract (idempotent, dry-run-first, alt-key idempotency) for any future row that fails the writer enforcement; today there are no rows to write.
- `scripts/reconcile-reviewer-migration.js` (Day 2 build) must report 8 "unmatchable" PG rows when run against active-cycle data. Drift of 2 selected-J26 rows is expected and explained by this accept-loss set; the reconcile contract treats unmatchable rows as a separate bucket from active-cycle drift, so the cutover gate (`0 active-cycle drift` after exclusion) stays clean.
- W4 acceptance does **not** block on closing these 8. They're historical PG-only rows that lose their context when the Postgres table is decommissioned — the loss is documented, time-bound to the 14-day post-cutover read-only window, and recoverable from the Postgres backup if anyone cares to later.

## Cross-reference

- Plan §"Reviewer suggestions backfill" → "Identity contract" — the lookup chain that makes these rows unrecoverable
- Plan §"Acceptance tests + reconciliation reports" → first row — uses `request_number` join (NOT `proposal_id`), which is why these rows fail classification
- W3 acceptance gate 6/7/8 (commit 80f19a0) — surfaces the J26 +2 drift these explain
