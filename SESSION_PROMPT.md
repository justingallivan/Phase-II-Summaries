# Session 137 Prompt: Application State Atlas (remediation Phase 1) + Reviewer migration plan corrections

## Heads up — read before doing anything

Session 136 surfaced a serious trust gap: the reviewer migration plan went through **three rounds of Codex stress-tests** because Claude was guessing about the codebase he authored instead of probing it. Each round produced corrections about *existing* state (not proposed work), which means the plan was being drafted from memory instead of ground truth.

Justin's response: *"I need to trust the work you're doing and I'm concerned that I can't."*

The remediation plan at **`docs/CLAUDE_REMEDIATION_PLAN.md`** is now the priority before any further migration execution work. **Phase 1 (Application State Atlas) is the primary task for Session 137.**

Three new self-rules effective immediately (codified in the remediation plan):
1. **Probe-before-plan**: every state claim labeled `[VERIFIED via X]` or `[ASSUMED — needs verification]`
2. **Memory hygiene**: at session start, read full memory entries that match the work, not just the index
3. **Adjacent-context survey**: when citing a file, `ls` its parent; when citing a doc, `ls docs/`; before claiming "X has no Y", grep for Y

## Session 136 summary

### What was completed

1. **§A — Prod impersonation flag flip** (commit `8f7eedb`).
   - `vercel env add DYNAMICS_IMPERSONATION_ENABLED production` → `true`
   - Prod redeploy `dpl_GrZbqYXQvtzzYWpgEwQWJy4TV2eE`
   - Verified Justin attribution on real prod write to req 1002379 via `scripts/verify-impersonation-attribution.js` (run num 2026-07-05-1326)
   - Closes the multi-session impersonation rollout arc.

2. **§B — Reviewer migration plan, drafted and stress-tested THREE times** (commits `6b5f9f2`, `3f83cce`, `e5250a8`, `6f3e1f0`, `09f593f`, `04e39db`).
   - `docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md` written, Codex-reviewed, corrected, re-reviewed, corrected, re-reviewed.
   - Live data probed via `scripts/audit-postgres-state.js` (1,700 total rows; publications=0 with dead writer; researchers=331; reviewer_suggestions=337 with 99% on Dataverse already per parity probe).
   - All 7 open Connor questions resolved: 14-day grace, retire researchers.js + replace with manual-add feature, add `wmkf_DeclineReason` + `wmkf_ResponseReceivedAt`, contact form Reviewer history view ask, `wmkf_apprequestperson` junction, is_archived non-issue.

3. **§C — Self-remediation plan** (commit `09f593f`, extended in `04e39db`).
   - `docs/CLAUDE_REMEDIATION_PLAN.md` — five-phase plan for closing the ground-truth gap.
   - Memory survey at end of session surfaced six fully-designed schema-as-code files in `lib/dataverse/schema/wave2/` Claude had never read; multiple "discoveries" were already-known per memory entries Claude had not opened beyond the index.

### Commits (Session 136)

- `8f7eedb` — Add impersonation attribution verification script (§A)
- `6b5f9f2` — Lock reviewer Postgres → Dataverse migration plan
- `3f83cce` — Address Codex stress-test + lock open questions
- `e5250a8` — Ground reviewer migration plan in live Postgres state
- `6f3e1f0` — Address Codex round-2 stress test
- `09f593f` — Add parity probe + plan corrections + self-remediation plan
- `04e39db` — Correct migration plan + extend remediation rules after memory survey

### Memory updates

**Updated:**
- `.claude-memory/MEMORY.md` (S136 lock pointer for migration entry)
- `.claude-memory/project_reviewer_postgres_to_dataverse_migration.md` (rewritten end-to-end with locked decisions, Codex-resolved findings, RR program code probe)
- `.claude-memory/project_dataverse_creator_privileges.md` (schema-changes audit list updated)

## Production state

- **Impersonation FULLY DEPLOYED**: prod flag on, attribution verified on a real prod write. Wave-1-impersonation arc is complete.
- **Wave 1 stability clock**: 2026-05-03 → ongoing.
- **Reviewer migration**: zero application code changed. Plan drafted, three rounds of Codex review, 8 anomalies identified for human triage. **Migration not started.**

## Where to pick up — Session 137

### A. **PRIMARY THREAD: Build the Application State Atlas (remediation Phase 1)**

**This blocks all further migration execution work.** Per `docs/CLAUDE_REMEDIATION_PLAN.md` Phase 1.

Output: `docs/APPLICATION_STATE_ATLAS.md` (index doc) + `docs/atlas/*.md` (per-entity pages).

Steps:
1. **Inventory matrix** — Postgres tables + Dataverse entities + adapters + endpoints + services. Cross-reference. List every artifact.
2. **Probe live state** — extend `scripts/audit-postgres-state.js` to all tables; build `scripts/audit-dataverse-state.js` for entity counts/schema/population. Run both, capture results.
3. **Per-entity pages** — for each significant table/entity: schema, source-of-truth, read paths (rg-cited), write paths (rg-cited), cross-system linkages, last-verified timestamp.
4. **Index doc** — `docs/APPLICATION_STATE_ATLAS.md` with links to all per-entity pages.
5. **CLAUDE.md update** (Phase 3) — add the "Ground-truth requirement" section pointing at the Atlas + the labeling rules.

Estimate: one long session, possibly two. **Do this before touching the migration plan.**

### B. Address Codex round-3 findings against migration plan (after Atlas)

Outstanding from the latest review (S136 evening, task `task-mov2trkh-h4qx4h`):

1. **`wmkf_appgrantcycle` schema-as-code is missing 4 fields** that the plan claims it will store. The committed `lib/dataverse/schema/wave2/wmkf_app_grant_cycle.json` has only `wmkf_FiscalYearCode` and `wmkf_ReviewReturnDeadline` — no `wmkf_ShortCode`, `wmkf_ProgramName`, `wmkf_ReviewDeadline`, `wmkf_CustomFields`. Either patch the schema-as-code or correct the plan's mapping.
2. **`WAVE2_BACKEND_*` flags are claimed-but-unimplemented**. Plan describes them as the rollback safety mechanism; no flag implementations exist in any endpoint. Either build them or remove the claim.
3. **`contact-enrichment-service.js` is an active Postgres writer** (calls `DatabaseService.createOrUpdateResearcher`); plan implied it was passthrough. Add to migration scope.
4. **Six scripts + two endpoints referenced in the plan don't exist**: `scripts/restore-from-cleanup-backup.js`, `repair-divergence-postflip.js`, `reconcile-reviewer-migration.js`, `backfill-reviewer-suggestions-to-dataverse.js`, `pages/api/reviewer-finder/contact-history.js`, `add-candidate-manual.js`. Only the dry-run `backfill-reviewer-suggestions-parity.js` is real. Plan must distinguish "spec'd" from "built."
5. **"Live deployed" framing**: schema-as-code in `wave2/` ≠ deployed entities. The live entities (`wmkf_appresearcher`, `wmkf_appreviewersuggestion`, `wmkf_potentialreviewer`) are demonstrably deployed (we wrote to them), but the `wave2/` files may diverge from what was actually deployed. Plan needs an explicit "as-built vs. as-designed" reconciliation.
6. **`DatabaseService.findResearcher` has 3 callers**, not 1 (`discovery-service.js`, `deduplication-service.js`, `contact-enrichment-service.js`). Plan's "discover.js cache lookup" framing was incomplete.
7. **`DatabaseService.getRecentPublications` reader** still untraced; plan's "publications skip-safe" claim rests on incomplete grep.

Once Atlas exists, addressing these becomes mechanical — most resolve by reading the relevant Atlas page.

### C. Two narrow Connor questions (Justin asking)

Both nested under junction implementation:
1. Existing PA flow on `akoya_request` create/update we can extend, or net-new?
2. Junction-table preference — does it extend to indexes against vendor data, or only net-new app tables?

These are independent of the Atlas work; can be asked in any sync.

### D. Tonight-at-home / non-blocking carryovers

- Connor email queue: `docs/CONNOR_BRIEF_PHASE0.md` (Phase 0 Executor handoff brief), `docs/CONNOR_QUESTIONS_2026-04-15.md` (Q4–Q7). Both send-ready, neither blocked by us.
- UI cleanup pass on Reviewer Finder + Review Manager (stale `.eml` references etc.) — its own session, not migration scope.

### Deliberately deferred

- Migration execution — blocked on Atlas (Phase 1 of remediation).
- Cleanup cron real-mode — post-pilot regardless.
- Wave 1 retirement — earliest 2026-05-17 (14-day stability clock).
- ⚠️ **Drop Postgres reviewer tables** — STILL would break Reviewer Finder. Don't drop.

## Key files added/modified

| File | Purpose |
|---|---|
| `scripts/verify-impersonation-attribution.js` | NEW — confirm Dataverse writes attributed to staff user, not app user |
| `scripts/audit-postgres-state.js` | NEW — comprehensive Postgres probe (row counts, per-column population, recency) |
| `scripts/db-row-counts.js` | NEW — quick row count check |
| `scripts/probe-rr-program-tagging.js` | NEW — confirms `akoya_program=RR` is registered but unused |
| `scripts/backfill-reviewer-suggestions-parity.js` | NEW — dry-run classification of all 337 Postgres rows |
| `docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md` | NEW — Wave 2 migration plan (post-three-rounds-of-Codex). Has known issues per §B above. |
| `docs/CLAUDE_REMEDIATION_PLAN.md` | NEW — self-correction plan; the load-bearing artifact for Session 137 |
| `.claude-memory/project_reviewer_postgres_to_dataverse_migration.md` | REWRITTEN |
| `.claude-memory/project_dataverse_creator_privileges.md` | EDITED |
| `.claude-memory/MEMORY.md` | EDITED |

## Testing

```bash
# Full suite
npm test -- --runInBand

# API route matrix CI gate
npm run check:api-routes

# Re-confirm impersonation prod flag still working (writes a real summary, costs Claude tokens)
# Skip unless something seems wrong.
node scripts/verify-impersonation-attribution.js 2026-07-05-1326

# Re-run reviewer-suggestions parity probe (dry, free)
node scripts/backfill-reviewer-suggestions-parity.js

# Re-run Postgres state audit (free)
node scripts/audit-postgres-state.js
```

## How to know Session 137 went well

The acceptance criterion from the remediation plan: **after Session 137, the next major plan goes through Codex review without producing corrections about the live state of existing code** — only about proposed work.

If Codex still surfaces ground-truth gaps in Session 137's outputs, the Atlas isn't comprehensive enough yet.
