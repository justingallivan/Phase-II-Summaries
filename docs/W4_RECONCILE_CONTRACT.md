# W4 Reconcile Contract — `scripts/reconcile-reviewer-migration.js`

**Day 1 deliverable. Date:** 2026-05-12.

Designed-on-paper before building (Codex S147 pre-W4 review Q1 BLOCKER: the
identity contract must be unambiguous before code lands).

## Purpose

Pre/post-cutover parity report for `reviewer_suggestions` PG ↔ DV. Run before:
- declaring any drain target retired
- dropping the Postgres `reviewer_suggestions` table

Gate semantic: **0 active-cycle drift** after excluding the documented unmatchable rows in `docs/W4_ANOMALY_TRIAGE.md`.

## Identity contract

**The join key is `akoya_requestnum` (a.k.a. `request_number` on PG side), NOT `proposal_id`** (which is a title-slug, NOT a request identifier — see plan §"Reviewer suggestions backfill" → "Identity contract").

**PG side:**
```sql
SELECT
  rs.request_number,
  COUNT(*) AS pg_count
FROM reviewer_suggestions rs
JOIN grant_cycles gc ON gc.id = rs.grant_cycle_id
WHERE gc.is_active = true
  AND rs.selected = true
  AND rs.request_number IS NOT NULL  -- excludes the 4 missing-request anomalies
  AND rs.researcher_id IN (SELECT id FROM researchers WHERE email IS NOT NULL)  -- excludes the 4 missing-email anomalies
GROUP BY rs.request_number;
```

**DV side:** for each active cycle code derived from `grant_cycles.short_code`:
```
GET /wmkf_appreviewersuggestions?$filter=wmkf_grantcyclecode eq '<CODE>' and wmkf_selected eq true&$expand=wmkf_Request($select=akoya_requestnum)&$select=_wmkf_request_value
```
Aggregate client-side by the expanded `akoya_requestnum`.

**Join key normalization:** both sides emit `request_number` as a string. PG returns `VARCHAR`; DV returns string from `akoya_requestnum`. No case-folding needed (both are numeric strings like `"1002365"`).

## Algorithm

1. Load active grant cycles from PG (`SELECT short_code FROM grant_cycles WHERE is_active = true`). Currently 10 cycles after W3 collapse: D23, D24, D25, D26, D27, J23, J24, J25, J26, J27.
2. Load active grant cycles from DV (`listCycles({ includeArchived: false })` via the W3 helper). Must equal the PG set; mismatch is a hard error (would mean W3 cutover desynced).
3. For each active cycle:
   - PG count by `request_number` (per query above)
   - DV count by `akoya_requestnum` (per query above)
   - Per-`request_number` delta
4. Surface the unmatchable bucket: count PG rows the parity script's classification marks as anomaly (currently 8). These do NOT contribute to "active-cycle drift" — they're already documented in `W4_ANOMALY_TRIAGE.md` as accept-loss.
5. Summary block:
   - Total active-cycle drift = sum of |delta| across all per-request deltas
   - Unmatchable count (informational)
   - Gate verdict: PASS if active-cycle drift == 0; FAIL otherwise

## Inputs (CLI flags)

| Flag | Effect |
|---|---|
| (default) | DRY-RUN — report only; never writes |
| `--include-inactive` | Also report inactive-cycle drift (informational; never gates) |
| `--threshold N` | Treat active-cycle drift ≤ N as WARN instead of FAIL (use for post-cutover-but-pre-drop windows where read drift is expected) |
| `--json` | Emit machine-readable JSON output for CI integration |

## Output

```
# Reviewer migration reconcile
Generated: <timestamp>

## Active cycle parity
| cycle | request_number | PG | DV | delta |
|---|---|---|---|---|
| J26 | 1002181 | 5 | 5 | 0 |
| J26 | 1002185 | 4 | 4 | 0 |
| ... | ... | ... | ... | ... |

## Unmatchable rows (excluded from active-cycle gate)
Count: 8 (per W4_ANOMALY_TRIAGE.md)

## Verdict
Active-cycle drift: 0 rows
PASS — cutover gate clean.
```

Exit code:
- `0` if active-cycle drift == 0
- `1` if drift > 0 (or > threshold if specified)
- `2` if a transport/integration error prevented the run

## What it does NOT do

- Per-field comparison (e.g., `email_sent_at` equality). The plan's acceptance table has separate rows for per-field comparison (Group A); this script is the cutover gate, not the field-by-field diff. Build a separate `reconcile-reviewer-fields.js` if/when needed.
- Junction parity (`wmkf_apprequestperson`). Junction is post-pilot scope.
- Suggestion-level mutation. Read-only by contract.

## Edge cases

- **A cycle exists in PG but not DV (or vice versa):** hard error. Means W3 cutover state is inconsistent; fix grant_cycles first.
- **A PG request_number doesn't resolve to an `akoya_request`:** logged as unmatchable. Should never happen for active-cycle data since `save-candidates.js` enforces request existence on write.
- **DV suggestion's `_wmkf_request_value` resolves to a deleted `akoya_request`:** treat as orphan; log informationally; does not affect gate.
- **`wmkf_grantcyclecode` mismatches the request's `akoya_fiscalyear`:** likely indicates a stale shortcode write. Log but don't gate — W3 §"Acceptance tests" → "Meeting-date → shortcode parity" already covers the request-side derivation.

## Build constraints (for the Day 2 implementer)

- Use the `lib/dataverse/client.js` helper (matches W3 grant-cycles pattern) rather than `DynamicsService` — keeps this script transport-agnostic and easy to run from CI.
- Token caching: not needed; single invocation per run.
- Throttling: defensive 429-retry per the W3 step-5 followup pattern (`TRANSIENT_RETRY_STATUSES`).
- Idempotency: trivially read-only.

## Cross-reference

- Plan §"Acceptance tests + reconciliation reports" → first row — this script's gate spec
- `docs/W4_ANOMALY_TRIAGE.md` — the 8 unmatchable rows excluded from the gate
- Plan §"Identity contract" — the canonical mapping this contract implements
