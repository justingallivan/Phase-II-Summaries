# Session 120 Prompt: Resume after Connor feedback — Wave 2 architectural work

## Session 119 Summary

Codex landed a fragility review (`docs/CODE_REVIEW_FRAGILITY_FINDINGS_2026-04-30.md`). Independently verified each finding against the codebase, wrote a substantive response (`docs/CODE_REVIEW_RESPONSE_2026-04-30.md`), and executed Wave 1 housekeeping. Wave 2 architectural work (Dynamics restriction refactor, LLM client consolidation) is deferred pending Connor's feedback expected this week.

Original Session 119 plan (drop save-candidates Postgres dual-write, drop legacy UI flow, archive Postgres tables) was partially folded into Wave 1 — items #1 + #2 collapsed into a single change because of a coupling discovered mid-task.

### What was completed

1. **Independent codebase review of Codex findings.** Six of seven hold up; the seventh (transactional save-candidates) was obviated by Wave 1 #1. Both reported test failures reproduced exactly. Pushed back where Codex missed context: blast radius of restriction global state is narrower (only Dynamics Explorer chat sets non-empty restrictions, everything else is bypass-only); blob URLs use `addRandomSuffix` so they're capability tokens not enumerable; `multi-llm-service` has a bonus bug Codex didn't flag (its `Promise.race` timeout doesn't abort the underlying fetch); LLM call surface is broader than Codex described — 4 patterns, ~25 sites, including streaming + tool-use in `dynamics-explorer/chat`.

2. **Restriction refactor design decision (Addendum 1).** AsyncLocalStorage chosen over incremental shim or full parameter-threading cut-over. Closes module-state hazard fully, adapters change zero lines, no shim period. Deferred until Connor feedback — Wave 2 work.

3. **LLM call surface inventory (Addendum 2).** Four patterns: `ClaudeClient` class (10 routes, raw fetch, no SSRF allowlist, no abort), `claude-reviewer-service.js` (raw fetch with two duplicated sites within one wrapper), `multi-llm-service.js` (uses `safeFetch` but `Promise.race` doesn't abort), and ad-hoc raw fetches in handlers (phase-i-dynamics, grant-reporting/extract, dynamics-explorer/chat with 4+ sites including SSE streaming, expertise-finder/match, execute-prompt). Wrapper v1 must support unary + streaming + tool-use from day one or chat keeps its own raw-fetch path forever.

4. **Wave 1 shipped (`8710939`).**
   - **save-candidates Dataverse-only.** `requestId` now required; Postgres researcher-upsert / suggestion-upsert / `addKeywordWithRelevance` removed. Three-adapter Dataverse chain is the only write path. Coupling discovered: `handleAssociateWithProposal` in researcher-detail modal called save-candidates without `requestId` and would have 400'd — removed alongside (~70 lines). Read-only display of historical Postgres associations preserved.
   - **Stale tests fixed correctly.** `auth-routes.test.js` `DynamicsService` mock rewritten with the static-method shape it actually uses. `cross-user-isolation.test.js` send-emails test rewritten for the post-Session-118 isolation property: sender identity from session, not body. Docblock updated to document the architectural shift. Full suite 163/164 (1 pre-existing skip).
   - **Superuser uncached.** `requireAppAccess` now runs `dynamics_user_roles` query on every gated request. App grants and `is_active` stay on the 2-min cache. Removes the privilege-escalation-after-revoke window.
   - **Internal blobs private.** `extract-summary.js` and `analyze.js` upload with `access: 'private'`. Three other public-blob writers (`upload-file`, `upload-review`, `load-proposal`) intentionally not touched — those are blocked on the Connor consult on external file access.

### Commits

- `8710939` — Wave 1 housekeeping in response to Codex fragility review

## Potential next steps

### 1. (Blocked) Wait for Connor feedback, then start Wave 2 #5 — Dynamics restrictions via AsyncLocalStorage

Decision is recorded (Addendum 1). Plan when unblocked:
1. Add `lib/services/dynamics-context.js` with `AsyncLocalStorage` instance + `withDynamicsContext({ restrictions, requestId }, fn)` helper.
2. Rewrite `DynamicsService.checkRestriction` to read `als.getStore()?.restrictions ?? null` (kept fail-closed when no store).
3. Migrate the 13 API route entry points + 2 library callers — wrap handler bodies in `dynamicsContext.run(...)`.
4. Update ~30 scripts to use the helper (one-line wrap each).
5. Delete `setRestrictions` / `bypassRestrictions` static methods and the module-level `activeRestrictions` / `_restrictionRequestId` globals.
6. Add a regression test that demonstrates the fix: two interleaved tasks with different restrictions don't leak.

Effort: 2-3 hours when unblocked.

### 2. Wave 2 #6 — Canonical LLM client (do after #1, inherits the request-context shape)

Surface inventory done (Addendum 2). v1 must support unary + streaming + tool-use. Migrate Pattern 1 (10 routes via `ClaudeClient`) first — single-method swap. Then Pattern 4 ad-hoc fetches. Pattern 2 (`claude-reviewer-service.js`) can probably be deleted entirely. Pin contract with the tests Codex outlined: timeout-aborts, retryable-statuses, usage logging on success and failure, redacted errors, normalized provider responses.

Effort: full day or two for v1 + migration.

### 3. Wave 2 #7 — Edge-compatible auth-policy module

Three constants + a function. Imported by both `middleware.js` (Edge Runtime) and `lib/utils/auth.js` (Node). Closes the divergence where middleware's `AUTH_REQUIRED !== 'true'` check can fail open in misconfigured prod while the API path fails closed. Small cleanup once the bigger refactors settle.

Effort: 30 min.

### 4. Deferred housekeeping items surfaced this session

- Onboarding "create cycle and assign all unassigned" flow at ~line 3859 of `pages/reviewer-finder.js` — dead in practice (only fires when user has zero cycles + unassigned candidates). ~50 lines to remove. Worth a sweep next time we touch the file.
- `AddResearcherModal` in `pages/reviewer-finder.js` — Postgres-only legacy researcher-create flow with optional proposal_searches association. Architecturally obsolete; not actively broken. Remove when the Postgres reviewer tables are archived.

### 5. Postgres reviewer-table archival (was Session 119 #3 — still in dedicated session)

After Wave 1 #1 lands and a few days pass with no Postgres writes:
- Snapshot `reviewer_suggestions`, `researchers`, `grant_cycles`, `proposal_searches`, `researcher_keywords`, `researcher_publications` to a backup table or pg_dump file.
- Drop the original tables.
- Remove or guard scripts that reference them.
- Remove `AddResearcherModal` and the onboarding flow above as part of the same cleanup.

Don't combine with Wave 2 work — needs its own dedicated context.

### 6. (External, still blocked) Contact AppendTo grant + Connor consult on external reviewer file access

Both unchanged from Session 118 hand-off.

### 7. (Independent) Post-May-1 D26 readiness check

Phase I opens 2026-05-01. Confirm `akoya_requeststatus = 'Phase II Pending'` is the actual value on real new D26 rows; confirm `wmkf_phaseiistatus IS NULL` correlates with "no reviews yet"; watch for proposals where the picker shows 0 invited even though staff assigned reviewers via the legacy 5-slot pattern.

## Key files reference

| File | Status | Purpose |
|---|---|---|
| `docs/CODE_REVIEW_FRAGILITY_FINDINGS_2026-04-30.md` | new | Codex's review (input) |
| `docs/CODE_REVIEW_RESPONSE_2026-04-30.md` | new | Independent verification + waves plan + 3 addenda (restriction design decision, LLM surface inventory, Wave 1 execution log) |
| `pages/api/reviewer-finder/save-candidates.js` | rewrite | Dataverse-only; `requestId` required |
| `pages/reviewer-finder.js` | trimmed | `handleAssociateWithProposal` flow + supporting state/effects/JSX removed |
| `tests/integration/auth-routes.test.js` | mock fix | `DynamicsService` static-method shape |
| `tests/integration/cross-user-isolation.test.js` | rewrite | Dataverse-era isolation property (sender from session) |
| `lib/utils/auth.js` | small fix | Superuser role uncached every request |
| `pages/api/reviewer-finder/extract-summary.js` | one-line | `access: 'private'` |
| `pages/api/reviewer-finder/analyze.js` | one-line | `access: 'private'` |

## Hand-off notes

- **Wave sequencing decision is in `CODE_REVIEW_RESPONSE_2026-04-30.md`.** Do not re-derive — read the doc, especially the addenda. The full waves plan + per-finding analysis lives there.
- **Codex is now a recurring sanity-check input.** Memory updated (`project_codex_recurring_review.md`). When the next review lands, mirror the response shape used here: independently verify each finding, push back where Codex missed context, propose sequencing, save addenda as decisions land.
- **Two of three "ad-hoc Claude fetch" sites in chat handlers do non-trivial things** the v1 LLM wrapper has to handle: `dynamics-explorer/chat` does multi-turn streaming with mid-stream 529 retry, and tool-use. Don't ship a unary-only v1 — chat will keep its own path and the consolidation rots.
- **`@vercel/blob` v2.3 supports `access: 'private'`** with server-side `get()` for reads. Used in Wave 1 #4. Anywhere else that needs this pattern, the `get()` SDK call replaces raw `fetch(blobUrl)`.
- **Onboarding flow (`pages/reviewer-finder.js` ~3859) and `AddResearcherModal` are both Postgres-only legacy code paths that escaped Wave 1.** Not actively broken (Onboarding effectively dead, AddResearcher creates dead Postgres rows). Sweep when next touching the file or when archiving Postgres tables.

## Memory updates this session

- `project_codex_recurring_review.md` (new) — Justin runs Codex periodically; treat findings as input not to-do list, mirror the 2026-04-30 response doc shape

## Testing

```bash
# Tests:
npm test -- --runInBand   # 163/164, 1 pre-existing skip

# Build:
npx next build

# Smoke (no auth):
node scripts/smoke-my-candidates.js jgallivan@wmkeck.org J26
node scripts/smoke-review-manager.js jgallivan@wmkeck.org J26

# Browser (real auth) — verify save-candidates from picker still works end-to-end:
npm run dev
# Sign in → /reviewer-finder → pick a J26 proposal via the picker →
# run analyze → save selected candidates → verify they appear in My Candidates
# AND in /review-manager (proves Dataverse-only path is whole).
```
