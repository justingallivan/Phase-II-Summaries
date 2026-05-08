# Session 142 Prompt: Address S141 carryover (entra-external gate fix), plus open threads

## Heads up — read before doing anything

S141 closed the entire S138/S140 doc-triage carryover stack in 7 commits. Next session opens with one concrete code task carried forward from the Codex review of S141, plus a few externally-gated threads waiting on signal.

The mechanical carryover is **task #6**: a real (small) auth gate fix flagged by Codex during the S141 review. Details below.

## Session 141 summary

### What was completed

S141 closed the doc-triage cleanup that started in S138 and was carried forward through S139/S140. Five sub-threads, each landed as a discrete commit:

1. **"Other" archive batch** (commit `9751b17`)
   - 6 superseded specs / shipped-feature plans archived to `docs/archive/` via `git mv`: `DYNAMICS_AI_FIELDS_SPEC_v2.md`, `DYNAMICS_AI_FIELDS_SPEC_cn-notes.md`, `DYNAMICS_EXPLORER_DOCUMENT_LISTING_PLAN.md`, `CRM_EMAIL_SEND_PLAN.md`, `ENTRA_ID_INTEGRATION_SUMMARY.md`, `SHAREPOINT_DOCUMENT_ACCESS.md`.
   - Pre-flight grep-verify identified 3 live citers (`docs/DYNAMICS_AI_FIELDS_SPEC_v3_cn.md`, `docs/BACKEND_AUTOMATION_PLAN.md`, `.claude-memory/project_dynamics_ai_writeback.md`); each rewritten to `docs/archive/` paths.

2. **Bucket A refresh** (commit `d1169ea`)
   - `AUTHENTICATION_SETUP.md` rewritten around the 3-layer defense-in-depth model, dual-provider NextAuth, `EMERGENCY_AUTH_BYPASS` production-fail-closed semantics, and current guard surface (`requireAppAccess`/`requireAuthWithProfile`/`requireSuperuser` etc.).
   - `CREDENTIALS_RUNBOOK.md` env-var inventory cross-checked against `process.env.*` reads in `lib/`, `pages/`, `middleware.js`. Added Production-Required (`CRON_SECRET`, `EXTERNAL_LINK_SECRET`, `VRP_ALLOWED_PROVIDERS`), Entra External, multi-LLM keys, Wave 1 backend flags, operational flags, notification/spend alert vars, Per-App Model Overrides, and the `EMERGENCY_AUTH_BYPASS` row.

3. **API_ROUTE_SECURITY_MATRIX Persistence column** (commit `30c94c2`)
   - Closes the Atlas v1 known-gap. All 77 routes annotated with what they write (Postgres tables, Dataverse entities, SharePoint paths, Vercel Blob), or flagged as "Read-only" / "AI pass-through" where they don't persist business data.
   - Per-route inventory delegated to a research subagent that read each handler + service-class call chain. Two notable findings folded in: `/api/external/review/[token]/context` writes a first-view timestamp on GET (so it's not actually read-only), `/api/cron/maintenance` is the broadest deleter (5 PG tables + Vercel Blob), and `/api/reviewer-finder/save-candidates` is now Dataverse-only after the cutover.

4. **Bucket B refresh** (commit `8c6736f`)
   - Status banners + targeted edits on `STRATEGY.md` (write access live, IT deps current, app count 14 → 17, Wave 1/2 framing), `GRANT_CYCLE_LIFECYCLE.md` (Field Sets A–D deployed, `wmkf_ai_run` audit live, cycle-redesign banner, Wave 1/2 migration current), `REVIEWER_LIFECYCLE_PROPOSAL.md` (Phase A/C/D shipped status table at top), `STAGED_REVIEW_PIPELINE.md` + `STAGED_PIPELINE_IMPLEMENTATION_PLAN.md` (not-yet-built, dormant pending cycle redesign), `DYNAMICS_SCHEMA_ANNOTATION.md` (scope clarification — Atlas authoritative for live state, AI fields out of scope, schema-diff vs schema-map gotcha).

5. **Bucket D per-app guides** (commit `e7f698f`)
   - Spot-refreshed 6 user-facing guides. `GETTING_STARTED.md` (Concept Evaluator retirement, current category list), `ADMIN_GUIDE.md` (spend monitoring, alerts, secret expiration, full env-var pointer, Microsoft Graph health), `REVIEWER_FINDER.md` + `REVIEW_MANAGER.md` (status banners — Dataverse-direct save-candidates, magic-link reviewer portal, CRM-direct email), `DYNAMICS_EXPLORER.md` (multi-library SharePoint walk, Excel export). `INTEGRITY_SCREENER.md` left as-is (already current).

6. **`check:doc-currency` promoted to CI gate** (commit `d3b7d53`)
   - Closes Step 4 of the doc-triage plan. Three structural fixes were required first: (a) directory-skip bug — `'docs/archive'.startsWith('docs/archive/')` returns false, so archived docs were being scanned; replaced with explicit `isSkippedDir(path)` helper; (b) table-liveness false positives — `\bShort-lived\b` was matching `live`; tightened to word-boundary descriptors; (c) directionally-wrong `sot-prompt-resolver-reads-prompt-table` regex; replaced with positive-claim regex requiring `wmkf_ai_run` scratch-row mention nearby.
   - Wired into `.github/workflows/test.yml` between `check:atlas:self-test` and `test:ci`. `npm run check:doc-currency` exits 0 cleanly today across 8 patterns; verified exit 1 via negative test with synthetic drift doc.
   - Allowlist expanded for legitimate historical / teaching references (Atlas pages naming both bad and good forms; migration plans referencing snake-case schema *file* names).

7. **Codex review response** (commit `a2b0887`)
   - Codex review of the S141 commit range surfaced 6 findings; 5 confirmed and fixed, 1 declined per documented convention.
   - **P1.1 (fixed in docs)**: Doc claim "entra-external provider registers when all three EXTERNAL_AZURE_AD_* vars are set" — actual code gates only on `EXTERNAL_WELL_KNOWN && EXTERNAL_AZURE_AD_CLIENT_ID`. Docs updated to describe the actual two-var gate. **The code itself is the next-session task** (see below).
   - **P1.2 (fixed)**: `/api/integrity-screener/history` PATCH writes via `IntegrityService.updateScreeningStatus`; matrix said read-only. Persistence cell updated.
   - **P1.3 (fixed)**: `STRATEGY.md` "Keep everything in Dynamics" Principle paragraph still said "We don't yet have write access to Dataverse" — contradicted the refreshed status table in the same doc. Rewrote around current state.
   - **P2.1 (fixed)**: `CLAUDE_MODEL_<APP>` env-var family missing from runbook. Added a Per-App Model Overrides section.
   - **P2.2 (declined)**: DEVELOPMENT_LOG.md cites pre-archive paths. Per S138 protocol, historical/snapshot files keep point-in-time references by convention.
   - **P2.3 (fixed)**: Negation-guard hole in `sot-prompt-resolver-reads-prompt-table` regex would still match `"prompt-resolver does not read wmkf_ai_prompt"`. Added a `(?:does not|doesn't|never|no longer)` lookahead before the verb.

### Commits

- `9751b17` — Archive 6 'Other' batch docs from S138 doc-triage carryover
- `d1169ea` — Refresh Bucket A: AUTHENTICATION_SETUP + CREDENTIALS_RUNBOOK
- `30c94c2` — Annotate API_ROUTE_SECURITY_MATRIX with Persistence column (77 routes)
- `8c6736f` — Refresh Bucket B: status pass on 6 living plans
- `e7f698f` — Refresh Bucket D: 6 per-app user guides
- `d3b7d53` — Promote check-doc-currency to CI gate
- `a2b0887` — Address Codex review of S141 doc-triage commits

### Memory updates

None this session — all changes were durable in commits + CI.

## Production state

- Four CI gates green: `check:atlas` (28 PG tables, 25 DV entities), `check:atlas:self-test` (11/11 patterns), `check:api-routes` (77 routes), and the new `check:doc-currency` (8 patterns).
- No production code changes shipped this session — doc-only + one CI script + one workflow file.
- Wave 1 stability clock: still ticking until 2026-05-17.
- The S141 doc-triage carryover stack (S138 → S139 → S140 → S141) is now fully closed. `docs/DOC_TRIAGE_2026-05-07.md` "Open follow-ups" section is all struck through.

## Where to pick up — Session 142

### A. **Carryover from S141 Codex review (task #6) — concrete code fix**

`pages/api/auth/[...nextauth].js:56` gates the `entra-external` NextAuth provider on `EXTERNAL_WELL_KNOWN && EXTERNAL_AZURE_AD_CLIENT_ID` only. The `EXTERNAL_AZURE_AD_CLIENT_SECRET` is consumed downstream but isn't part of the registration guard. Result: a partial-config deployment with tenant_id + client_id but no secret will register the provider and fail at sign-in time instead of cleanly skipping registration.

**Fix scope:**
1. Tighten the gate at `pages/api/auth/[...nextauth].js:56` to also require `process.env.EXTERNAL_AZURE_AD_CLIENT_SECRET`. Verify any other env var the OAuth flow actually needs to succeed and add it to the gate.
2. Smoke: confirm a staff-only deployment shape (all three `EXTERNAL_AZURE_AD_*` unset) does not register the provider and `/apply/*` traffic fails cleanly.
3. Once the code matches the original intent, **revert the doc wording** in `docs/AUTHENTICATION_SETUP.md` and `docs/CREDENTIALS_RUNBOOK.md` from "tenant_id + client_id" back to "all three EXTERNAL_AZURE_AD_* vars". The S141 docs intentionally describe the actual two-var gate as documented behavior; that phrasing should not survive the code fix.

CLAUDE.md (project), `STRATEGY.md`, and `INTAKE_PORTAL_DESIGN.md` may also reference the "all three" wording — sweep after the code fix.

### B. **Doc-triage Step 5 (optional follow-up)**

The doc-currency CI gate is in place but does NOT yet have a self-test fixture (parallel to `scripts/check-coverage-self-test.js`). The S141 commit deliberately deferred this — patterns are simple regexes that humans can reason about. Worth picking up when the gate starts catching real regressions and patterns get hairier.

### C. **Externally gated** (don't pursue without signal)

- **Wave 1 retirement** — earliest 2026-05-17. Flip `WAVE1_BACKEND_*` flags to `dataverse`, retire Postgres `system_settings` / `user_app_access` / `user_preferences`. Plan: `docs/WAVE1_VERCEL_FLAG_ROLLOUT.md`, `docs/WAVE1_REVERT_TEMP_ELEVATIONS.md`. Do not start before stability clock expires.
- **Connor's PA-side `ExecutePrompt` build** — when it lands, run the parity oracle from both sides and verify byte-identical `wmkf_ai_rawoutput`. Vercel side is ready (`scripts/test-echo-parity.js`).
- **Connor's `akoya_request` create/update PA flows** — when they ship, the contact-history endpoint's per-row `sources` array stops showing single-source `[junction]` for newly-PI-touched data.
- **Cycle-redesign signal from Sarah/Connor** — unlocks `STAGED_REVIEW_PIPELINE.md` build (V25 migration + Fit Screener + Pipeline orchestration app). Don't start the V25 migration until the redesigned cycle's shape locks.
- **Wave 2 reviewer migration completion** — partial Wave 2 build set landed S139; remaining work cycle-gated to Connor cadence.

### D. **Reviewer Finder agent-loop support** (carryover from S140)

Per memory `project_app_roadmap_2026-04-25.md`: Reviewer Finder is the top post-cycle priority and may need agent-loop support outside the Executor contract. No deadline; pick up when reviewer-discovery quality becomes the binding constraint.

## Key files modified or added

| File | Status | Purpose |
|---|---|---|
| `docs/archive/*` | NEW (×6) | "Other" batch archived from `docs/` |
| `docs/AUTHENTICATION_SETUP.md` | EDITED | 3-layer defense, dual-provider, EMERGENCY_AUTH_BYPASS, current guards (S141 + Codex P1.1 fix) |
| `docs/CREDENTIALS_RUNBOOK.md` | EDITED | Full env-var inventory, External tenant gate phrasing, Per-App Model Overrides (S141 + Codex P2.1 fix) |
| `docs/API_ROUTE_SECURITY_MATRIX.md` | EDITED | Persistence column on all 77 routes (closes Atlas v1 gap) |
| `docs/STRATEGY.md` | EDITED | Status table updated, IT deps current, contradictory paragraph rewritten (S141 + Codex P1.3 fix) |
| `docs/GRANT_CYCLE_LIFECYCLE.md` | EDITED | What's-live-now header, Field Sets A–D deployed, Wave 1/2 framing |
| `docs/REVIEWER_LIFECYCLE_PROPOSAL.md` | EDITED | Phase A/C/D shipped status table |
| `docs/STAGED_REVIEW_PIPELINE.md` | EDITED | Status banner: not yet built, dormant |
| `docs/STAGED_PIPELINE_IMPLEMENTATION_PLAN.md` | EDITED | Status banner: dormant pending cycle redesign |
| `docs/DYNAMICS_SCHEMA_ANNOTATION.md` | EDITED | Scope banner; Atlas as authoritative; schema-diff vs schema-map gotcha |
| `docs/guides/*.md` | EDITED (×5) | Spot-refresh per current app behavior |
| `docs/APPLICATION_STATE_ATLAS.md` | EDITED | v1 known-gap (endpoint persistence) marked closed |
| `docs/DOC_TRIAGE_2026-05-07.md` | EDITED | All Open follow-ups closed |
| `scripts/check-doc-currency.js` | EDITED | Promoted to gate (exit 1), bug fixes, allowlists, negation-guard fix |
| `package.json` | EDITED | Added `check:doc-currency` script |
| `.github/workflows/test.yml` | EDITED | Added `check:doc-currency` to CI |

## Testing

```bash
# All four should be green at session start (and stay that way)
npm run check:atlas
npm run check:atlas:self-test
npm run check:api-routes
npm run check:doc-currency

# For the S142 P1.1 fix on entra-external gate:
# 1. Read pages/api/auth/[...nextauth].js around line 56 (the register guard)
# 2. After the fix, smoke locally with EXTERNAL_AZURE_AD_CLIENT_SECRET unset:
#    confirm /apply route does not 200; confirm provider not in /api/auth/providers list
```

## How to know Session 142 went well

- Task #6 (entra-external gate) is closed: code change shipped, smoke passed, doc wording reverted to "all three" in AUTHENTICATION_SETUP + CREDENTIALS_RUNBOOK + any other refs.
- All four CI gates stayed green throughout.
- No new entity / table / endpoint shipped without an Atlas update in the same commit (ground-truth rule).
- If session goes long, externally-gated threads (Wave 1 retirement, Connor's PA work) remain untouched unless a signal landed.
