# Session 147 Prompt: open

## Session 146 summary

Sixteen commits on main, all pushed to origin. The headline is **Wave 1 closeout** (Postgres tables dropped in prod 2026-05-12) plus a multi-stage doc-currency rebuild that ended with the Wave 2 plan re-verified against live code across nine Codex review rounds.

### What was completed

1. **Wave 1 prod retirement — DONE 2026-05-12** (`dc8e745`, `91dbe26`, `a612d00`)
   - Drop migration `lib/db/migrations/007_drop_wave1_tables.sql` executed against prod Postgres at 2026-05-12T01:30:41Z. All three Wave 1 tables (`system_settings`, `user_app_access`, `user_preferences`) gone.
   - Pre-flight: built `scripts/wave1-drop-preflight.js` (live catalog probes, FK/view/policy/trigger/grant checks, PG/DV count parity, recent-writes guard, risky-script git-log evidence). Codex-reviewed before execution.
   - Behavioral verification confirmed zero prod writes since 2026-05-03 flag flip (10 known dev writes from S145 admin model picker on localhost were reconciled to Dataverse 2026-05-11 via PG→DV sync).
   - Neon PITR bumped from 6h → 7 days (Launch plan via API PATCH) to make rollback viable.
   - Dispatcher defaults flipped from `postgres` to `dataverse` in `settings-service.js`, `app-access-service.js`, `database-service.js` — explicit `WAVE1_BACKEND_*=postgres` now fails loudly (table dropped, dead branch).
   - V22 rename in Dataverse verified clean (0 stale `proposal-summarizer` keys, 7 on `phase-ii-writeup`).
   - `setup-database.js` Wave 1 create blocks removed (V10 user_preferences, V16, V17, V22 runner + summary log lines).
   - Bypass scripts archived: `manage-preferences.js`, `rotate-encryption-key.js`, `backfill-app-access.js`, `verify-wave1-read-path.js`, `sync-wave1-postgres-to-dataverse.js` → `scripts/archive/` with README explaining rewrite status.
   - Typo fix: `wmkf_appuserappacces` → `wmkf_appuserappaccesses` in migration header + setup-database comment.

2. **Doc-currency sweep — five tiers** (`7e53c02`, `af40768`)
   - 32 files updated across plan docs, atlas pages, runbooks, inline code comments, memory entries.
   - Tier 1 plan-doc status banners: POSTGRES_TO_DATAVERSE_MIGRATION (Planning → Wave 1 COMPLETE), REVIEWER_STAGE_2A_BUILD_PLAN (Draft → Slice 1 SHIPPED), DYNAMICS_IDENTITY_RECONCILIATION_PLAN (TODO → SHIPPED + UNBLOCKED), EXTERNAL_REVIEWER_INTAKE_PLAN (Ready → SHIPPED 2026-05-03), INTAKE_PORTAL_DESIGN (Entra blocker → resolved S129).
   - Tier 2 Wave 1 drift: API_ROUTE_SECURITY_MATRIX, CREDENTIALS_RUNBOOK, ADMIN_GUIDE, STRATEGY, GRANT_CYCLE_LIFECYCLE, BACKEND_AUTOMATION_PLAN, REVIEWER_FINDER, REVIEWER_FINDER_FUTURE_ARCHITECTURE, REVIEWER_POSTGRES_TO_DATAVERSE_PLAN, PROMPT_STORAGE_DESIGN, SECURITY_ARCHITECTURE (87 KB doc got a top-of-doc banner + targeted §5.4/§5.6 column-name + scoping rewrites + Dynamics-stubbed false claim corrected + app-count drift 14→16 fixed).
   - Tier 3 inline source: secret-check cron header, maintenance-service header + getRetentionConfig, baseConfig model-resolver block + cache-clear docstring + resolution-order line, reviewerFinderPreferences file header.
   - Tier 4 archive bypass scripts (above).
   - Tier 5 memory: 6 entries updated (MEMORY.md index, project_wave1_pending rewritten, project_wave1_onboarding trigger note, project_dynamics_ai_writeback Set B status + SharePoint write-access status, project_external_reviewer_file_access description, project_dynamics_identity_reconciliation description).
   - Codex consistency review (19 findings, 4 CRITICAL + 11 MODERATE + 4 MINOR) addressed in `af40768`. Identified the dispatcher default-to-Postgres footgun (silent degradation in `database-service.js` prefs paths) — flipped defaults as part of that commit.

3. **Thoroughness rule encoded** (`af40768`)
   - New memory `feedback_thoroughness_default.md`: banner edits include body audit; description-line edits include body audit; antonym grep after status changes; cold re-read pattern; surface incompleteness explicitly.
   - Indexed in MEMORY.md Operational section. Self-test of the rule applied later in the same session — the rule catches things at edit-time that Codex used to catch at review-time.

4. **Wave 2 plan rebuild** (`9c99e65` through `4834c6c`, 10 commits)
   - Refreshed `docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md` against live code. The "drain-target endpoint inventory" was materially incomplete in the prior version — original list of 2 files (`render-emails.js`, `send-emails.js`); actual is 9 (`grant-cycles.js`, `generate-emails.js`, `my-proposals.js`, `extract-summary.js`, `researchers.js`, `database-service.js`, `maintenance-service.js`, plus the two originally cited).
   - Nine Codex review rounds → ~25 distinct findings closed end-to-end. Major fixes: spec-vs-built table accuracy (junction-backfill script was BUILT not spec'd; `wmkf_appgrantcycle` is PARTIALLY DEPLOYED not "designed not deployed"); WAVE2_BACKEND_* "probably don't need" claim reframed as Option A (flags) vs Option B (hard cutover) tradeoff, decision deferred; data-loss subsection reframed (projectleader path = PI history not reviewer history); reviewer-history source corrected to `wmkf_appreviewersuggestion` across 5+ passages; schedule rebalanced from overloaded weeks to one-theme-per-week (W3-W7) with slip-eligibles moved to Post-pilot; readiness checklist dates aligned to schedule.
   - Final Codex verdict: **READY FOR BUILD.**

5. **Memory + plan-doc IRS entry** (`03ae5c0`)
   - New `project_irs_exempt_verification.md`: design for tax-exempt verification via Postgres-resident reference data + PA→Vercel lookup endpoint + Dynamics writeback of the result. Reframes Postgres as durable reference-data layer, not Dynamics on-ramp.

### Memory updates

- NEW: `feedback_thoroughness_default.md` (thoroughness-is-default-not-optional rule)
- NEW: `project_irs_exempt_verification.md` (planned capability design)
- REWRITTEN: `project_wave1_pending.md` (closeout state)
- DESCRIPTIONS REFRESHED: `project_dynamics_ai_writeback`, `project_external_reviewer_file_access`, `project_dynamics_identity_reconciliation`, `project_wave1_onboarding`, `project_interim_report_automation`
- MEMORY.md index: Wave 1 section reframed CLOSED, Field Set B marked deployed, App-Level Access Control note updated, stale currentDate at bottom removed, dev-env note added about `.env.local` Wave 1 flags

### Commits (this session)

```
4834c6c Wave 2 plan — close N-11 body residual
d813d02 Wave 2 plan — close N-11 cardinality + N-12 cross-ref direction
169b5a9 Wave 2 plan — close N-7 residual + N-8/N-9/N-10
296eded Wave 2 plan — close 2 blockers from review #5 (N-6, N-7)
a546392 Wave 2 plan — close final residual + 3 data-model contradictions
6720f32 Wave 2 plan — close final 4 Codex findings
da0c8ea Wave 2 plan — close all PARTIAL findings from Codex re-review #2
977e1b3 Wave 2 plan — second corrective pass for Codex re-review findings
e58208a Wave 2 plan — fix all Codex consistency findings
9c99e65 Wave 2 plan — refresh status banner + spec-vs-built table
af40768 Address Codex consistency review (19 findings) + thoroughness rule
7e53c02 Doc currency sweep — five-tier pass for drift
a612d00 Wave 1 closeout — address Codex review findings
91dbe26 Remove Wave 1 create blocks from setup-database.js + atlas update
dc8e745 Wave 1 closeout — drop migration + preflight script
03ae5c0 Memory: planned IRS tax-exempt verification capability
```

## Production state

- **Wave 1 dropped.** Postgres tables gone; dispatcher defaults Dataverse; recovery window via Neon PITR until 2026-05-19T01:30Z.
- **Wave 2 plan green-lit by Codex** but no Wave 2 build work has started yet. The plan's W3 window (grant cycle migration) is the immediate critical path.
- CI gates: `check:atlas` 26 PG / 27 DV; `check:atlas:self-test` 11/11; `check:api-routes` 80 routes. All green.
- Single deferred Wave 1 item: revert temp role elevations on prod app user. Held through pilot iteration per Justin's 2026-05-11 policy call.

## Where to pick up — Session 147 (open)

Plausible threads, roughly ordered by readiness:

### A. Wave 2 build — start W3 (grant cycle migration)

Highest unlock value, pilot-gating. The plan is at `docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md` § "Revised pilot timing." W3 deliverables:

1. Patch `lib/dataverse/schema/wave2/wmkf_app_grant_cycle.json` to add 3 missing fields (`wmkf_ShortCode`, `wmkf_ProgramName`, `wmkf_CustomFields`); re-run `apply-dataverse-schema.js`.
2. Verify `wmkf_shortcode` alt-key uniqueness.
3. Decide `WAVE2_BACKEND_*` Option A (flags) vs Option B (hard cutover).
4. Rewrite `pages/api/reviewer-finder/grant-cycles.js` against `wmkf_appgrantcycle` (full scope: `grant_cycles` + the file's `proposal_searches` + `reviewer_suggestions` reads).
5. Rewrite `pages/api/review-manager/{render-emails,send-emails}.js` `loadCycleConfigs()` paths against Dataverse.
6. Backfill `grant_cycles` data into `wmkf_appgrantcycle`.

### B. Stage 2a real-cycle engagement (externally gated)

COI policy body wording (placeholder still in active row) + first production engagement against a real reviewer cycle. Editor is live at `/admin` Policies.

### C. Connor sync — Wave 2 + intake portal

Open items: `WAVE2_BACKEND_*` Option A vs B (Justin can decide alone but worth Connor input); intake-portal pilot decisions for the Sarah field-inventory session; revert temp role elevations timing.

### D. Wave 2 post-pilot enhancements

History badges UI, `add-candidate-manual` endpoint + UI, match-on-discovery wiring, contact form subgrid (Connor). Explicitly out of pilot critical path.

### E. Smaller carry-forward items

- IRS tax-exempt verification (memory entry; not yet scheduled).
- Dataverse rewrite of `rotate-encryption-key.js` (archived; CREDENTIALS_RUNBOOK references pending tooling).
- Atlas spot-check on `policy_publish_audit` index entry (Codex F15 — minor, deferred).

## Key files modified or added (S146)

| File | Status | Purpose |
|---|---|---|
| `lib/db/migrations/007_drop_wave1_tables.sql` | NEW | Drop migration with pre-flight DO-block guards anchored to 2026-05-12 reconciliation baseline + Neon recovery procedure in header |
| `scripts/wave1-drop-preflight.js` | NEW | Live catalog probes (FK/view/policy/trigger/grant), PG vs DV count parity, recent-writes anchor, git-log evidence for risky scripts |
| `scripts/archive/` | NEW DIR | 5 historical scripts + README explaining each |
| `scripts/setup-database.js` | MODIFIED | Wave 1 create blocks removed (V10 user_preferences, V16, V17, V22 runner) |
| `lib/services/{settings,app-access,database}-service.js` | MODIFIED | Dispatcher defaults flipped from postgres to dataverse |
| `docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md` | MODIFIED | Rebuilt against live code; 9-file drain-target inventory; Option A/B framing; W3-W7 schedule; Codex-verified |
| `docs/atlas/postgres-infra-tables.md` | MODIFIED | Wave 1 entries marked RETIRED 2026-05-12 |
| `docs/APPLICATION_STATE_ATLAS.md` | MODIFIED | Service inventory rows + Postgres-tables index |
| `docs/SECURITY_ARCHITECTURE.md` | MODIFIED | Top-of-doc Wave 1 banner + §5.4 column names + §5.6 scoping table rewrite + stubbed-Dynamics correction + 14→16 app count |
| `docs/CREDENTIALS_RUNBOOK.md` | MODIFIED | Wave 1 flag defaults + SQL example → service-module usage + rotation-tool pending-rewrite note |
| `docs/API_ROUTE_SECURITY_MATRIX.md` | MODIFIED | 6 rows updated for Dataverse persistence |
| `CLAUDE.md` | MODIFIED | Wave 1 retired in Schema table + service inventory + env-var description |
| `.claude-memory/feedback_thoroughness_default.md` | NEW | Workflow-default rule encoding |
| `.claude-memory/project_irs_exempt_verification.md` | NEW | Planned capability design |
| `.claude-memory/project_wave1_pending.md` | REWRITTEN | Closeout state |

## Testing

```bash
# CI gates — all should be green
npm run check:atlas
npm run check:atlas:self-test
npm run check:api-routes

# Build
npm run build

# Wave 1 preflight (idempotent, blocks if anything's regressed)
node scripts/wave1-drop-preflight.js

# Dispatcher behavior verification — set WAVE1_BACKEND_*=postgres in dev env
# and confirm settings-service / app-access-service throw "relation does not
# exist." This is the loud-failure behavior the dispatcher flip enables.
```

## Carryover hygiene

The single deferred item — **revert temp role elevations on prod app user** — is destructive in the sense that it changes Connor-granted privileges. Per Justin's 2026-05-11 policy call, **deferred through pilot iteration** so Connor doesn't need to re-add the role for every pilot schema batch. Don't act on it without re-confirming with Justin. See `project_wave1_pending.md` for the resequencing trigger (post-mid-June pilot, schema settling).
