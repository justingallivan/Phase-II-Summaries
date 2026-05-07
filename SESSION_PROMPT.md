# Session 138 Prompt: Pick up after the 5-phase remediation completion

## Heads up — read before doing anything

Session 137 was almost entirely about closing the ground-truth gap that S136 surfaced. **All 5 phases of `docs/CLAUDE_REMEDIATION_PLAN.md` are now complete**, plus an additional self-test mechanism that makes coverage tools regression-resistant. The migration plan (`docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md`) is corrected against ground truth. The Wave 1 doc (`docs/POSTGRES_TO_DATAVERSE_MIGRATION.md`) is reconciled.

Per the remediation acceptance criterion, **the next major plan should pass Codex review without producing corrections about live state of existing code** — only about proposed work. 12 Codex passes on the Atlas were needed to reach a clean signal; the migration plan corrections passed in 1 pass; the Wave 1 reconciliation passed with one cat-1 finding (gate holes in `check:atlas` itself, since closed and self-tested).

**Important new artifact:** `docs/CLAUDE_COVERAGE_LESSONS.md` + `scripts/check-coverage-self-test.js`. When you build or modify a coverage tool (`scripts/check-*.js`), the self-test must pass; when external review catches a new structural pattern an existing gate missed, the order is mandatory: lesson → fixture → fix → commit together. CLAUDE.md "Ground-truth requirement" section now codifies this.

## Session 137 summary

### What was completed (in chronological order)

1. **Phase 1 — Application State Atlas** (`b2b0af1`).
   - 12 per-entity pages in `docs/atlas/` covering reviewer-finder Postgres tables, custom Dataverse entities, vendor entities with extensions, and infrastructure tables.
   - `docs/APPLICATION_STATE_ATLAS.md` index with entity catalog, adapter inventory, service-layer matrix, cross-system join keys, as-built/as-designed reconciliation.
   - New probe script: `scripts/audit-dataverse-state.js` (read-only, idempotent).
   - 11 rounds of Codex stress-testing before clean signal — caught 38+ structural findings across rounds (mix of misattributed read/write paths, schema gaps, internal contradictions, file-citation errors). Each round informed subsequent fixes.

2. **Round-3 migration plan corrections** (`43818b6`).
   - Patched `docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md` against the 7 outstanding Codex round-3 findings. All 7 PASS per Codex follow-up review.
   - Added "Read this first" pointer + "Spec'd vs. built" table at top.

3. **Phase 2 — Atlas CI gate** (`e332de5`).
   - `scripts/check-application-state-atlas.js` enforces Postgres-table + Dataverse-entity coverage in source vs. Atlas pages.
   - Wired to `npm run check:atlas`; CLAUDE.md updated.
   - Surfaced 3 vendor-side Dataverse entities the Atlas v1 missed (`akoya_programs`, `akoya_requestpayments`, `annotations`); documented in the index.

4. **Phase 4 — Wave 1 doc reconciliation + CI gate hole closed** (`5705bd3`).
   - Patched `docs/POSTGRES_TO_DATAVERSE_MIGRATION.md` with as-built corrections (naming convention, person model, Wave 1 status, Wave 2 entity list).
   - Closed CI gate hole: original gate only matched `DynamicsService.*`; extended to catch raw `client.<verb>('/<entitySet>'` calls + `/api/data/v9.X/<entitySet>` URL fragments. Added platform-entity allowlist.

5. **Wave 1 verification + CI wiring** (`40440d6`).
   - Live-probed Wave 1 entity sets via `audit-dataverse-state.js`: `wmkf_appsystemsettings` (45 rows, exact match to Postgres), `wmkf_appuserpreferences` (20 vs Postgres 25 — DELETE drift post-flip), `wmkf_appuserappaccesses` (84 vs Postgres 80 — INSERT drift post-flip).
   - Wired `check:atlas` into `.github/workflows/test.yml`.

6. **Codex flagged 3 more CI gate holes** (`adbf4ae`).
   - `client.delete_` (reserved-word alias missed)
   - `DynamicsService.{count,aggregate,search}Records` (helper methods missed)
   - `<NAME>_ENTITY` constants (parallel naming convention to `ENTITY_SET`)
   - All three regression-tested.

7. **Coverage self-test mechanism — the binding artifact** (`f9befb9`).
   - `docs/CLAUDE_COVERAGE_LESSONS.md` catalogs every pattern the gate detects, with example call sites + why each was originally missed.
   - `scripts/check-coverage-self-test.js` exercises every pattern via runtime-generated synthetic fixtures — fails CI if the gate stops detecting any. Verified by deliberately removing `countRecords|aggregateRecords` from the gate and confirming the self-test catches it.
   - `npm run check:atlas:self-test` wired into CI alongside `check:atlas`.
   - CLAUDE.md mandate: when external review catches a new pattern, lesson → fixture → fix → commit together.

### Commits

- `b2b0af1` — Build Application State Atlas (Phase 1 of remediation plan)
- `43818b6` — Address Codex round-3 findings on reviewer migration plan
- `e332de5` — Add Atlas CI gate (Phase 2 of remediation plan)
- `5705bd3` — Reconcile Wave 1 doc against Atlas + close CI gate hole
- `40440d6` — Verify Wave 1 entity sets live + wire check:atlas into CI
- `adbf4ae` — Close additional CI gate holes flagged by Codex review
- `f9befb9` — Bind coverage lessons to a CI self-test

### Memory updates this session

None. Memory was *consulted* (per the new session-start protocol from S136); no new memories were written. Domain memories that informed this session:

- `project_reviewer_postgres_to_dataverse_migration.md` (locked decisions, cleanup-cron predicate)
- `project_reviewer_finder_dataverse_entry_path.md` (what's shipped vs. open)
- `project_external_reviewer_file_access.md` (token lifecycle, SharePoint folder pattern)
- `project_reviewer_history_data_quality.md` (pre-J26 caveat)
- `project_dynamics_identity_reconciliation.md` (impersonation contract)
- `project_dynamics_ai_writeback.md` (v3 spec, field-set status)
- `project_wave1_pending.md` (flag-flip date, elevation revert held)

## Production state

- **Atlas + CI gate live and self-tested.** Any future schema or call-site change that breaks coverage triggers `npm run check:atlas` (or `:self-test`) on PR.
- **Wave 1 in steady state.** Flag flipped 2026-05-03; 14-day stability clock ends 2026-05-17 (Postgres tables can drop after).
- **Wave 2 migration plan is corrected and Codex-verified.** Ready for execution; `WAVE2_BACKEND_*` flags still need to be built (spec'd in plan, modeled on Wave 1).
- **Impersonation rollout still complete from S136** (prod flag on, Justin attribution verified end-to-end).

## Where to pick up — Session 138

### A. **Wave 2 migration execution kickoff** (PRIMARY candidate)

The plan is now correct. Codex has signed off. The blocking question is **what to build first.** Per the migration plan's build order:

1. Backfill commit-mode (`scripts/backfill-reviewer-suggestions-to-dataverse.js`) — replays the ~2.4% delta the parity probe identified.
2. Patch `wmkf_appgrantcycle` schema-as-code with `wmkf_ShortCode` / `wmkf_ProgramName` / `wmkf_CustomFields`, redeploy via `apply-dataverse-schema.js`.
3. Build `pages/api/reviewer-finder/contact-history.js` + `lib/services/contact-history-service.js`.
4. Build `WAVE2_BACKEND_*` flag dispatch in service layer (modeled on Wave 1).

Post-cutover artifacts (don't write yet): `restore-from-cleanup-backup.js`, `repair-divergence-postflip.js`, `reconcile-reviewer-migration.js`.

### B. **Two narrow Connor questions** (still pending from S137)

Both nested under junction implementation:
1. Existing PA flow on `akoya_request` create/update we can extend, or net-new?
2. Junction-table preference — extends to indexes against vendor data, or only net-new app tables?

Independent of Wave 2 execution start. Can be asked in any sync.

### C. **Connor email queue** (send-ready, not blocked)

- `docs/CONNOR_BRIEF_PHASE0.md` — Phase 0 Executor handoff brief
- `docs/CONNOR_QUESTIONS_2026-04-15.md` — Q4–Q7 (Field Set B timeline, etc.)

### D. Atlas v1 known gaps (promote-on-touch)

Listed at the bottom of `docs/APPLICATION_STATE_ATLAS.md`:
- Endpoint persistence annotation in `API_ROUTE_SECURITY_MATRIX.md` not yet merged.
- Vendor `contact` / `account` extension fields not enumerated yet (needed for intake portal pilot).
- `wmkf_apprequestperson` junction not yet deployed (locked S136).
- Intake portal entities not yet created.

### Externally gated (don't pursue without signal)

- Migration EXECUTION (vs planning) — start with §A above.
- Cleanup cron real-mode — post-pilot regardless.
- Wave 1 retirement — earliest 2026-05-17.

## Key files added/modified this session

| File | Status | Purpose |
|---|---|---|
| `docs/APPLICATION_STATE_ATLAS.md` | NEW | Atlas index — entity catalog, adapter inventory, service matrix, cross-system join keys |
| `docs/atlas/*.md` (12 files) | NEW | Per-entity pages |
| `docs/CLAUDE_COVERAGE_LESSONS.md` | NEW | Pattern catalog for coverage tools — binding via self-test |
| `scripts/audit-dataverse-state.js` | NEW | Read-only Dataverse state probe |
| `scripts/check-application-state-atlas.js` | NEW | CI gate: Postgres tables + Dataverse entities must be in Atlas |
| `scripts/check-coverage-self-test.js` | NEW | CI gate: regression-test the gate's pattern detection |
| `docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md` | EDITED | Round-3 corrections + ground-truth pointer |
| `docs/POSTGRES_TO_DATAVERSE_MIGRATION.md` | EDITED | Wave 1 reconciliation — naming convention, person model, status, Wave 2 entity list |
| `CLAUDE.md` | EDITED | Atlas pointer + coverage self-test mandate |
| `package.json` | EDITED | Added `check:atlas` + `check:atlas:self-test` scripts |
| `.github/workflows/test.yml` | EDITED | Wired both Atlas gates into CI |

## Testing

```bash
# Run the gates in the order CI runs them
npm run check:api-routes
npm run check:atlas
npm run check:atlas:self-test
npm run test:ci

# Re-probe live state when working on data-layer changes
node scripts/audit-postgres-state.js
node scripts/audit-dataverse-state.js
```

## How to know Session 138 went well

If §A (Wave 2 execution kickoff): the plan goes through Codex review without corrections about *existing* code state — only about the proposed work. That's the remediation acceptance criterion.

If §B/§C/§D: smaller scope; success is just landing the discrete chunk.
