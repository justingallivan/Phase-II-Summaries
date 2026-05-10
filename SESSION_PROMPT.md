# Session 145 Prompt: Admin UX — Claude model selector + Dynamics-field editor

## Heads up — read before doing anything

S145's headline is two admin-app changes Justin called out at the end of S144:

1. **Easier Claude model selection** in the admin app. Today per-app model overrides go through a generic key-value form against `system_settings`; selecting a model means typing/pasting a model id. Goal: a proper picker so non-technical staff can change which model an app uses without knowing the id format.

2. **Staff-editable Dynamics fields interface.** Today some staff-editable content lives in Dynamics rows with no friendly UI — the most concrete case is the `wmkf_policyversion` body for the reviewer COI policy (the `[PLACEHOLDER]` row sitting in production right now blocking Stage 2a slice 1 ship). Goal: a staff-facing form that exposes those fields, lets approved staff edit them, and writes back to Dynamics correctly (immutability rules apply for policy versions — see point 2 in the Stage 2a leftovers).

These are linked: the COI policy body in (2) is the highest-priority editable field, and shipping (2) unblocks the long-running pre-production blocker on the reviewer Stage 2a flow.

## Session 144 summary

Seven commits across three threads — Stage 2a smoke + bug fixes, Tier-1 prompt caching, and Executor multi-output coalescing. Browser smoke against a real Stage 2a engagement passed every Session C self-check item after two bugs were caught and fixed.

### What was completed

1. **Stage 2a slice 1 — browser smoke (Session D per the build plan)**
   - Built `scripts/find-stage2a-candidates.js` to mint a fresh JWT against any pre-materials suggestion row + print the local URL (no emails to real reviewers). Token hash written to prod Dataverse but JWT only exists locally; safe smoke without engaging the real-reviewer email path.
   - Built `scripts/inspect-stage2a-state.js` for post-smoke state inspection and `scripts/reset-stage2a-state.js` to clear engagement fields between runs while preserving the token.
   - Ran the full Session C self-check matrix in a browser against suggestion `13c4f33e-…` on req 1002279 (and `771fbc90-…` on req `f14b0ea2-…` for the co-PI test). Every checkpoint passed.
   - **Bug 1 (`43c3741`):** clicking re-accept from the declined confirmation view rendered Stage2aView with empty contact fields. Root cause: the dispatcher's `stage2a` override re-uses the cached `/context` payload, but `/context` only built the Stage 2a prefill block when `view === 'stage2a'`. Fixed by widening the gate to also include `view === 'declined' && canFlipState`.
   - **Bug 2 (`c016e32`):** the proposal card's co-PI line read from the legacy `_wmkf_copi1..5_value` slot fields. For any request where co-PIs were entered via a flow that didn't dual-write the slot, the card showed zero co-PIs. Switched to junction-only read (`wmkf_apprequestperson` role=Co-PI), per `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md` line 60 ("co-PI slots are obsolete read-only legacy"). UNION applies only to PI; co-PI is junction-only.

2. **Expertise Finder Anthropic prompt caching (`5a5d4ec`)**
   - Refactored `shared/config/prompts/expertise-finder.js` into a large cacheable system block (task + rules + roster + output schema) plus a small variable user message (proposal + notes). Both `match.js` and `batch-match.js` pass the system as a content array with `cache_control: ephemeral`.
   - ROI: every batch-match proposal after the first hits the cache. Roster edits naturally invalidate the cache by changing the string hash.
   - VRP `_callClaude` analyzed and deferred — each Claude call within a panel run uses a different system prompt (extraction, collation, per-provider review, devil's advocate, synthesis). No intra-run reuse pattern; cross-run reuse only helps if a panel is re-run within 5 min.

3. **Executor multi-output PATCH coalescing (`7fb9186`)**
   - `lib/services/execute-prompt.js` `persistOutputs` rewritten per `docs/EXECUTOR_EXTENSIONS_PLAN.md` §1. Sequential PATCHes 412'd on every output after the first (stale ETag); now coalesces all `akoya_request` writes into a single PATCH per row.
   - Bucket direct vs jsonPath writes; for each jsonPath field, GET current memo and merge `$.path` writes in declaration order; single union PATCH with the captured ETag.
   - Schema validation: two direct outputs writing the same field throws at preflight.
   - Today's single-output `phase-i.summary` is the degenerate case (unaffected). Unblocks any future multi-output prompt.
   - Six unit tests at `tests/unit/execute-prompt-multi-output.test.js`. `docs/EXECUTOR_CONTRACT.md` step-8 narrative updated.

4. **Codex review remediation (`11e7e25`)**
   - Codex returned 8 findings on the five session commits — no BLOCKERs, all POLISH or SOUND.
   - Landed: gated `fetchCoPIs` to views that render the proposal card (saves one Dataverse roundtrip on non-Stage 2a loads), added `top: 50` cap on the junction query, fixed a stale comment in `execute-prompt.js`, removed the dead `createMatchingPrompt` export (114 lines net removal), updated `scripts/audit-system-prompt-sizes.js` to measure the real cached Expertise Finder prompt via `buildCacheableSystemPrompt(synthRoster)` instead of the short `SYSTEM_PROMPT` constant.
   - Not addressed (SOUND only): accepted-pre-materials path verification, preflight duplicate-check ordering, reset-script field preservation.

### Memory updates

None this session.

### Commits

- `43c3741` — Stage 2a slice 1 — fix re-accept prefill loss after decline (+ smoke scripts)
- `f2ddb22` — Add reset-stage2a-state.js for repeatable smoke runs
- `c016e32` — Stage 2a — read co-PIs from wmkf_apprequestperson junction
- `5a5d4ec` — Expertise Finder — enable Anthropic prompt caching
- `7fb9186` — Executor — coalesce multi-output akoya_request writes into one PATCH
- `11e7e25` — S144 — address Codex review findings (B, C, E, F, comment fix)

## Production state

- Five CI gates green: `check:atlas` (28 PG / 26 DV), `check:atlas:self-test` (11/11), `check:api-routes` (78 routes), `check:doc-currency`, `check:doc-currency:self-test`. Build green.
- Stage 2a slice 1: code is feature-complete AND smoke-verified end-to-end. Three external blockers still standing (COI body, security role, no production engagement run yet against a real reviewer cycle).
- Wave 1 stability clock: ticking until 2026-05-17 (7 days as of S144 close).
- The pre-materials suggestion row used for smoke (`13c4f33e-…` on req 1002279) is left in clean Stage 2a state with a smoke token valid until 2026-05-24. The 5-co-PI suggestion (`771fbc90-…`) is left in stage2a state too. If those rows show up in real-cycle review work, run `scripts/reset-stage2a-state.js <id>` or just let the token expire.

## Where to pick up — Session 145

### A. Easier Claude model selection in `/admin`

Today per-app model overrides are configured via a generic settings form against `system_settings`. To change which model an app uses, you have to know the exact model id string (e.g., `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`). For non-technical staff this is brittle.

Probable shape of the fix:
- Surface a dropdown / picker keyed off a known model registry (the same source `getModelForApp` uses today — see `shared/config/baseConfig.js` `MODELS` or equivalent).
- Show friendly display names + the underlying id for clarity.
- Probably want a "use default" option that clears the override rather than picking a model.
- Verify the per-app override + fallback chain still works (`baseConfig.js` `getModelForApp` + `getFallbackModelForApp` + `model-override-loader.js`).

Before coding: read `shared/config/baseConfig.js`, `lib/services/model-override-loader.js`, and whichever admin page hosts the current override UI (probably `pages/admin/*.js` and `pages/api/admin/*.js`). Confirm where overrides are stored — `system_settings` Postgres table OR Dataverse equivalent (Wave 1 flag-dependent).

### B. Staff-editable Dynamics field interface

The most concrete need: `wmkf_policyversion.wmkf_policybody` for the reviewer COI policy. The current row is a placeholder; staff have a meeting to land the real wording but no UI to enter it short of the Dynamics admin web app.

Decisions to make at the start of the session:
1. **Scope** — start with policy bodies only (concrete, immediate need)? Or build a generic framework that can host other editable fields (e.g., default email templates, reviewer-facing form copy)?
2. **Immutability** — `wmkf_policyversion` rows MUST be immutable once referenced by an ack lookup (immutability rules per `docs/REVIEWER_STAGE_2A_BUILD_PLAN.md` §4a). The UI must support "create new version + flip `wmkf_activeversion` lookup" instead of "edit existing body" for active versions. Prior versions stay around for audit.
3. **Access control** — superuser-only? A new role? Reuse the existing `requireSuperuser` pattern unless there's a reason not to.
4. **Audit** — Dataverse native auditing is already enabled on `wmkf_appreviewersuggestion`; verify `wmkf_policy` and `wmkf_policyversion` have audit enabled too (or enable them).

Before coding: read `docs/REVIEWER_STAGE_2A_BUILD_PLAN.md` §4a (immutability rules), `docs/atlas/dataverse-wmkf-policy-and-policy-version.md` (entity shape), `scripts/seed-stage2a-policies.mjs` (write patterns for `wmkf_policyversion` rows + `wmkf_activeversion` flip).

### C. Other carryover (not S145 focus but valid alternatives)

- **Proposal Context Extraction field-set extension** — S (~1-2 hrs). Design-only. Extend `docs/DYNAMICS_AI_FIELDS_SPEC_v3_cn.md` with the 21 proposed AI fields. Plan at `docs/PROPOSAL_CONTEXT_EXTRACTION_PLAN.md`.
- **Retrospective Analysis Gap 1 — historical-request picker** — M (~4-6 hrs). Build the cycle/program/status filter UI with SharePoint folder auto-resolve. Plan at `docs/RETROSPECTIVE_ANALYSIS_PLAN.md`.

### D. Pre-production blockers for Stage 2a slice 1

Still outstanding from S143/S144:

1. **End-to-end production engagement** — the S144 smoke ran against test suggestion rows, not a real reviewer-cycle invitation flow. Need to invite a real reviewer through Review Manager and exercise the Stage 2a path in production.
2. **COI policy body wording** — addressed by S145 (B) above, IF the staff meeting has happened. Otherwise still blocked on the meeting.
3. **Dataverse security role** — restrict delete privilege on `wmkf_policy` and `wmkf_policyversion` to a small admin role. Referential `Restrict` cascade catches the worst case at the DB level; role config is the second layer.

### E. Externally gated

- **Wave 1 retirement** — earliest 2026-05-17 (7 days). Flip `WAVE1_BACKEND_*` flags to `dataverse`, retire Postgres `system_settings` / `user_app_access` / `user_preferences`. Plans: `docs/WAVE1_VERCEL_FLAG_ROLLOUT.md`, `docs/WAVE1_REVERT_TEMP_ELEVATIONS.md`. Do not start before stability clock expires.
- **Connor's PA-side `ExecutePrompt` build** — when it lands, run the parity oracle from both sides.

## Key files modified or added

| File | Status | Purpose |
|---|---|---|
| `pages/api/external/review/[token]/context.js` | MODIFIED | Re-accept prefill fix + co-PI junction read + gated fetch + `top: 50` cap |
| `lib/external/verify-suggestion-token.js` | MODIFIED | Dropped legacy `_wmkf_copi1..5_value` from REQUEST_SELECT |
| `lib/services/execute-prompt.js` | MODIFIED | `persistOutputs` rewritten for single-PATCH coalescing |
| `pages/api/expertise-finder/match.js` | MODIFIED | Cache-control system block split |
| `pages/api/expertise-finder/batch-match.js` | MODIFIED | Cache-control system block split |
| `shared/config/prompts/expertise-finder.js` | MODIFIED | Added `buildCacheableSystemPrompt` + `buildUserPrompt`; removed dead `createMatchingPrompt` |
| `scripts/find-stage2a-candidates.js` | NEW | Mint a fresh JWT on a pre-materials suggestion; print local URL |
| `scripts/inspect-stage2a-state.js` | NEW | Dump Stage 2a-relevant fields on a suggestion row |
| `scripts/reset-stage2a-state.js` | NEW | Clear engagement fields to land back at view='stage2a' |
| `scripts/inspect-request-copis.js` | NEW | Compare slot vs junction co-PI sources on any request |
| `scripts/audit-system-prompt-sizes.js` | MODIFIED | Measure Expertise Finder's real cached prompt size |
| `tests/unit/execute-prompt-multi-output.test.js` | NEW | 6 cases covering the coalescing logic |
| `docs/EXECUTOR_CONTRACT.md` | MODIFIED | Step-8 narrative rewritten for coalesced PATCH |
| `docs/atlas/dataverse-wmkf-apprequestperson.md` | MODIFIED | New `/context` read-path entry |

## Testing

```bash
# CI gates — all should be green
npm run check:atlas
npm run check:atlas:self-test
npm run check:api-routes
npm run check:doc-currency
npm run check:doc-currency:self-test

# Build
npm run build

# Executor unit tests
npx jest tests/unit/execute-prompt-multi-output.test.js

# Stage 2a smoke (only if needed — last smoke confirmed all paths)
node scripts/find-stage2a-candidates.js list 10
node scripts/find-stage2a-candidates.js mint <suggestionId>  # prints localhost URL
node scripts/inspect-stage2a-state.js <suggestionId>          # post-smoke state
node scripts/reset-stage2a-state.js <suggestionId>            # back to clean stage2a
```

## Carryover hygiene

No destructive carryover items. The two S145 headline tasks are additive (new admin UI + new editor surface). Pre-production blockers (smoke against real cycle, COI body, security role) are forward work.
