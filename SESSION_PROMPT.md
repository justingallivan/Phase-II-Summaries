# Session 121 Prompt: New direction — clean slate

## Heads up

User is bringing a substantive new direction to discuss. They explicitly chose a fresh session for clean context and clear thinking, not because Session 120 left anything blocked. Lead with their question; the rest of this prompt is background only.

The whole Wave 2 architectural arc shipped in Session 120. There is no carryover work from the Codex review that requires action. If the new direction intersects with anything below, fine — otherwise treat it as independent.

## Session 120 Summary

A long, productive session. Started with verifying Connor's `AppendTo` grant (worked), then ran the full Wave 2 architectural arc (#5/#6/#7), then did the deferred housekeeping that Wave 1 left behind, plus a D26 readiness check the day Phase I opened.

### What was completed

1. **Section 4 (Contact AppendTo) verified live.** Connor granted `AppendTo` on Contact at BU level on 2026-05-01. Test send to `justingallivan@me.com` populated `_wmkf_contact_value` correctly on the matching `wmkf_potentialreviewer` row. `docs/PENDING_ADMIN_REQUESTS.md` §4 now marked Done. Memory note `project_contact_promotion_permission.md` rewritten from "blocked" to "verified working."

2. **Wave 2 #5 — Dynamics restrictions via AsyncLocalStorage** (`2140e86`). New `lib/services/dynamics-context.js` with `withDynamicsContext` / `bypassDynamicsRestrictions` / `getDynamicsContext`. `DynamicsService.checkRestriction` reads from ALS first, falls back to module globals (kept temporarily as a script-callable shim with a one-shot deprecation warning). Migrated 13 API entry points + 2 library callers (`prompt-resolver`, `execute-prompt` use nested bypass for system-data reads). The `dynamics-explorer/chat` non-empty-restriction path is wrapped at the `setRestrictions` site. 6 smoke scripts migrated as exemplars; the remaining ~27 one-off scripts left on the deprecated path with a follow-up sweep noted. Regression test in `tests/unit/dynamics-context.test.js` exercises two interleaved tasks with different restrictions to pin the fix.

3. **Wave 2 #6 — canonical LLMClient wrapper** (`9f6844a`). New `lib/services/llm-client.js` with `complete()` / `stream()` methods. `safeFetch` (SSRF allowlist) + real `AbortController`-bound timeout + retry on 429/529 (retry-after honoured) + single fallback-model swap on 529 + structured `logUsage` on success and failure (cache tokens preserved) + API-key redaction in thrown errors + normalized response shape. Streaming preserves the dynamics-explorer/chat semantic: text deltas forward to `onTextDelta` only when no tool_use is being streamed. `onEvent` hook exposes raw SSE events for cases like qa.js's web_search citation collection.

   Migrations: 3 ClaudeClient callers (`refine`, `process-expenses`, `analyze-funding-gap`); 11 ad-hoc unary routes (`process`, `process-phase-i*`, `process-legacy`, `process-peer-reviews`, `analyze-literature`, `evaluate-multi-perspective`, `grant-reporting/extract`, `expertise-finder/{match,batch-match}`, `reviewer-finder/generate-emails`, `cron/log-analysis`); `integrity-service.js` (CommonJS — uses dynamic `import()` to bridge ESM); `qa.js` streaming + web_search citations; `dynamics-explorer/chat` (both `callClaude` and `callClaudeBatch`). `shared/api/handlers/claudeClient.js` deleted. **Side-effect:** structured-data extraction calls in process.js and process-phase-i* were silently un-logged before; now logged via the wrapper's `appName` plumbing — closed an observability gap. Skipped per Connor de-risking analysis: phase-i-dynamics/summarize (winddown), claude-reviewer-service (agent-loop rewrite coming), contact-enrichment (niche tool-use), multi-llm-service (multi-provider, separate refactor). 11 new tests in `tests/unit/llm-client.test.js`.

4. **Wave 2 #7 — shared auth-policy module** (`3a1d463`). Closed a real fail-open gap: `middleware.js` used `process.env.AUTH_REQUIRED !== 'true'` (fails OPEN if missing/wrong in prod), while `lib/utils/auth.js` already failed CLOSED in the same scenario. New `lib/utils/auth-policy.js` (Edge-compatible — `process.env` only, no Node-only imports) holds the single `isAuthRequired()`. Both runtimes import it. Misconfig warnings memoized once per process so middleware doesn't spam logs. 10 new tests in `tests/unit/utils/auth-policy.test.js`, including the regression: "fails closed when AUTH_REQUIRED is missing (the bug middleware used to have)."

5. **Deferred Wave 1 housekeeping** (`adbffe7`). Removed two Postgres-only legacy code paths from `pages/reviewer-finder.js` that escaped Wave 1: the "Organize Your Candidates" onboarding modal (~156 lines — only fired when a user had zero cycles AND unassigned Postgres candidates AND hadn't dismissed; with save-candidates Dataverse-only, no path to land in that state), and `AddResearcherModal` (~437 lines — Postgres-only researcher-create form generating dead-end orphan rows). 5908 → 5295 lines (−613).

6. **D26 readiness check** (read-only, the day Phase I opened). 378 D26 proposals in Dataverse, all currently `'Phase I Pending'` or `'Concept Pending'`. **Zero D26 rows at `'Phase II Pending'`** — confirmed by direct filter. Reviewer Finder picker correctly empty for D26 in default `?status=actionable` mode; will start populating when staff advance Phase I → Phase II. SESSION_PROMPT 120's hypothesis ("confirm `akoya_requeststatus = 'Phase II Pending'` is the value on real D26 rows") was just stage-mismatched — that state happens later in the cycle. New memory note `project_grant_lifecycle_states_confirmed.md` documents the actual state machine so future sessions don't re-derive it.

### Commits

- `82d0bfa` — Mark Section 4 (Contact AppendTo) Done after Connor's grant
- `2140e86` — Wave 2 #5: Dynamics restrictions via AsyncLocalStorage
- `9f6844a` — Wave 2 #6: canonical LLMClient wrapper
- `3a1d463` — Wave 2 #7: shared auth-policy module closes middleware fail-open gap
- `adbffe7` — Remove dead onboarding flow + AddResearcherModal from reviewer-finder

All pushed to `origin/main`.

### Net code change

~−500 lines despite migrating 22 LLM call sites + 15 restriction sites + adding 3 new modules and 26 new tests.

## Background — pending work, in case it touches the new direction

These were on the table before today and remain available; nothing in Session 120 created new urgency:

### 1. Postgres reviewer-table archival
Snapshot `reviewer_suggestions`, `researchers`, `grant_cycles`, `proposal_searches`, `researcher_keywords`, `researcher_publications` to a backup; drop the originals; remove or guard scripts that reference them. Wants its own session — don't combine with other work.

### 2. Remove deprecated `setRestrictions` / `bypassRestrictions` static methods entirely
Currently kept as deprecated shims with one-shot warnings so the ~27 unmigrated scripts keep working. Once those are migrated (or determined unused), delete the static methods + module globals + `_warnedLegacyApi` set + the legacy-fallback branch in `checkRestriction`. ~30 min when ready.

### 3. (External, blocked) External reviewer file access — Connor consult
Proposal share URLs throw expired-link errors; review uploads still go to Vercel Blob. Needs a design conversation with Connor on a SharePoint staging/library permission model for unauthenticated external party access. Memory: `project_external_reviewer_file_access.md`.

### 4. (External, blocked) `Sites.ReadWrite.Selected` on akoyaGO
Not yet requested. Currently we have `Sites.Selected` (read-only via the Graph API call IT already ran). Needed for any SharePoint write-back work.

### 5. Codex Wave 3 / deferred items
- `claude-reviewer-service.js` deletion or rewrite (waiting on Reviewer Finder agent-loop architecture decision)
- `contact-enrichment-service.js` migration through LLMClient (tool-use; niche)
- `multi-llm-service.js` migration (multi-provider, needs broader design)
- Browser smoke suite (Playwright on highest-leverage flows)
- Distributed rate limiting (only worth it once a concrete spike scenario or second instance lands)

## Memory updates from Session 120

- `project_contact_promotion_permission.md` (rewritten) — "verified working" as of 2026-05-01
- `project_grant_lifecycle_states_confirmed.md` (new) — `akoya_requeststatus` is a string, not optionset; lifecycle is `'Concept Pending'` → `'Phase I Pending'` → `'Phase II Pending'`; picker filters to the third only

## Key files added this session

| File | Purpose |
|------|---------|
| `lib/services/dynamics-context.js` | AsyncLocalStorage-backed restriction context for DynamicsService |
| `lib/services/llm-client.js` | Canonical Anthropic API wrapper — complete() + stream() with safeFetch / abort / retry / fallback / logUsage / redaction |
| `lib/utils/auth-policy.js` | Edge-compatible `isAuthRequired()` shared between middleware.js and lib/utils/auth.js |
| `tests/unit/dynamics-context.test.js` | Interleaved-tasks regression test — pins the ALS fix |
| `tests/unit/llm-client.test.js` | 11 cases covering the wrapper contract |
| `tests/unit/utils/auth-policy.test.js` | 10 cases including the middleware fail-open regression |

## Testing

```bash
npm test -- --runInBand          # 189/190, 1 pre-existing skip
npx next build                   # build check
node scripts/smoke-my-candidates.js jgallivan@wmkeck.org J26
node scripts/smoke-review-manager.js jgallivan@wmkeck.org J26

# Full picker flow against real auth (verifies restriction context wraps end-to-end + LLMClient streaming):
npm run dev
# Sign in → /reviewer-finder → pick a J26 proposal → analyze → save candidates →
# verify they appear in /review-manager → render-emails → send to test address
```
