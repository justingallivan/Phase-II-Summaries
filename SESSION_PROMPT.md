# Session 143 Prompt: pick from the design-doc punch list (no carryover)

## Heads up — read before doing anything

S142 closed the only mechanical carryover (the entra-external gate fix from the S141 Codex review) plus the deferred B-task (doc-currency self-test), then opportunistically retired the entire `PENDING_ADMIN_REQUESTS.md` ask stack by routing system-alert emails through the Dynamics transport instead of the never-granted Microsoft Graph `Mail.Send` permission. Notification email is now live in production with a self-healing recipient list.

**No carryover.** S143 is free to pick from the design-doc punch list (below), or to use a low-key session if there's no fresh signal.

## Session 142 summary

### What was completed

Three commits, escalating in scope:

1. **Entra-external provider registration gate** (commit `571b80c`)
   - Tightened the gate at `pages/api/auth/[...nextauth].js:54-58` to require **all three** `EXTERNAL_AZURE_AD_*` vars (tenant_id, client_id, client_secret). Previously only the first two were checked, so a partial-config deployment would register the provider and fail at sign-in time.
   - Reverted the S141 "two-var" doc wording in `AUTHENTICATION_SETUP.md` and `CREDENTIALS_RUNBOOK.md` back to "all three". `CLAUDE.md` already said "all three" (untouched). `STRATEGY.md` and `INTAKE_PORTAL_DESIGN.md` had no two-var phrasing to revert.
   - Smoke: simulated env-shape probe confirmed all-three→register, partial→skip, unset→skip.

2. **Doc-currency binding self-test** (commit `d72f4c1`)
   - Closes the deferred Step 5 from the S141 doc-triage plan. New `scripts/check-doc-currency-self-test.js` exercises 12 fixtures (one positive per `DRIFT_PATTERNS` entry plus 4 negative fixtures pinning the SOT negation guard, the `_author` exception, and the canonical Reviewer_Uploads/Downloads suffixes).
   - Wired into `package.json` (`check:doc-currency:self-test`) and `.github/workflows/test.yml` after `check:doc-currency`.
   - Sabotage verified: removing the SOT negation guard fails the self-test as expected.
   - `CLAUDE.md` "Coverage tools have a binding self-test" rule updated to reference both Atlas and doc-currency self-tests.

3. **System-alert email routed through Dynamics with self-healing roster** (commit `ff0f9f0`)
   - Investigation chain that started as "should we close the `PENDING_ADMIN_REQUESTS.md` doc?" and ended as a working feature.
   - **Verified ground truth**: decoded the Graph token's `roles` claim — the only Microsoft Graph application permission ever granted on `d2e73696-...` is `Sites.Selected`. `Mail.Send` was never granted, so the existing `notification-service.sendEmail` Graph path was unreachable in production for ~6 months.
   - **Two-failure-mode design problem worth understanding**: (1) hard-coded `NOTIFICATION_EMAIL_TO` env var couples recipient list to a person who can leave; (2) tribal-knowledge-only "where to look" for the admin roster.
   - **Fix**: rewrote `lib/services/notification-service.js` to use `DynamicsService.createAndSendEmail` for transport (already-granted privilege) and to query the active-superuser roster at send time (`dynamics_user_roles` JOIN `user_profiles` WHERE role='superuser' AND is_active=true). When admins change in `/admin`, recipients self-heal — no env-var update.
   - Added `emailAdmins: true` opt-in on `notify()` so `notifyNewUser` forces email at info severity (admins need proactive visibility for app-access grants beyond the dynamics-explorer default).
   - One durable env var: `NOTIFICATION_EMAIL_FROM` (sender mailbox; must be a Dynamics systemuser with SSS enabled). `NOTIFICATION_EMAIL_TO` retired entirely.
   - **Activated in production**: set `NOTIFICATION_EMAIL_FROM=jgallivan@wmkeck.org` for Production/Preview/Development on Vercel + appended to local `.env.local`. Today's recipient roster: `cnoda@wmkeck.org`, `jgallivan@wmkeck.org` (Connor was already a superuser — happy surprise).
   - **Fixed adjacent prod gap**: `NEXTAUTH_URL` was missing on Production (only set on Preview). The `health-checker` was warning about this, and the consequences went beyond cosmetic — `lib/utils/auth.js:52` was silently skipping CSRF Origin validation on every state-changing request, and `lib/external/token-lifecycle.js:173` would have produced malformed magic-link URLs. Set `NEXTAUTH_URL=https://wmkfresearch.vercel.app` on Production.
   - **Doc updates**: `PENDING_ADMIN_REQUESTS.md` archived (all four sections resolved or retired); `TODO_EMAIL_NOTIFICATIONS.md` rewritten around the Dynamics transport; `CREDENTIALS_RUNBOOK.md` and `SECURITY_ARCHITECTURE.md` describe the sender-mailbox requirements and drop `NOTIFICATION_EMAIL_TO`; `STRATEGY.md`, `BACKEND_AUTOMATION_PLAN.md`, `DYNAMICS_AI_FIELDS_SPEC_v3_cn.md`, and `scripts/probe-sharepoint-write.js` updated for the archive path move.
   - **End-to-end smoke**: synthetic alert through the new path verified — email landed in Justin's inbox from `jgallivan@wmkeck.org` to both admins via Dynamics SSS transport.

### Commits

- `571b80c` — Gate entra-external provider on full EXTERNAL_AZURE_AD_* triple
- `d72f4c1` — Add binding self-test for check-doc-currency gate
- `ff0f9f0` — Route system-alert emails through Dynamics with self-healing roster

### Memory updates

None this session — the operational state changes are durable in commits + docs (`TODO_EMAIL_NOTIFICATIONS.md`, `CREDENTIALS_RUNBOOK.md`). Future-me reading `notification-service.js` plus those two docs gets the full picture without needing memory.

## Production state

- Five CI gates green: `check:atlas` (28 PG / 25 DV), `check:atlas:self-test` (11/11), `check:api-routes` (77 routes), `check:doc-currency` (8 patterns), `check:doc-currency:self-test` (12 fixtures).
- All three S142 commits pushed and deployed; production deploy succeeded (`https://wmkfresearch.vercel.app`).
- Wave 1 stability clock: still ticking until 2026-05-17 (9 days as of session end).
- Notification email path live; recipient roster = active superusers (today: Justin + Connor).
- `PENDING_ADMIN_REQUESTS.md` retired entirely. No outstanding IT asks as of 2026-05-08.

## Where to pick up — Session 143

### A. Design-doc punch list (no carryover; pick by appetite)

Per the S142 design-doc survey (research-summary; verify before committing):

1. **Prompt caching in Expertise Finder + Virtual Review Panel** (`docs/PROMPT_CACHING_PLAN.md`). Tier 1 quick wins shipped on Dynamics Explorer; expertise-finder's `match.js` and multi-llm-service's `_callClaude` haven't been wired with `cache_control` markers. Highest token-cost ROI; pure Justin code, no IT or Connor dependency. **Size: S–M (~2-3 hrs).**

2. **Retrospective Analysis Gap 1 — historical-request picker** (`docs/RETROSPECTIVE_ANALYSIS_PLAN.md`). Plan exists, no code. Build the cycle/program/status filter UI that auto-resolves SharePoint folders; reusable across all batch apps and unblocks Gaps 2-4. **Size: M (~4-6 hrs).**

3. **Reviewer Interaction Stage 2a landing page** (`docs/REVIEWER_INTERACTION_DESIGN.md`). Token primitive + magic-link auth already shipped. Build the proposal-summary card, inline contact edit, honorarium opt-out, policy ack, accept/decline UI. PA-side workflows for sending are post-May-1 Connor work, but the UI itself is unblocked. **Size: M (~6-8 hrs).**

4. **Executor extensions — multi-output PATCH coalescing** (`docs/EXECUTOR_EXTENSIONS_PLAN.md`). Correctness fix, not feature. Blocks Grant Reporting + Integrity Screener PA flows but not urgent. **Size: M (~4-6 hrs).**

5. **Proposal Context Extraction field-set extension** (`docs/PROPOSAL_CONTEXT_EXTRACTION_PLAN.md`). Design-only; extend `DYNAMICS_AI_FIELDS_SPEC_v3_cn.md` with the 21 proposed AI fields. Implementation path is cycle-gated. **Size: S (~1-2 hrs).**

My read: **#1 is the highest leverage smallest task** — pure cost win on existing volume, no UX risk, owns end-to-end. **#3 is most strategically valuable** but a multi-session arc.

### B. Externally gated (don't pursue without signal)

- **Wave 1 retirement** — earliest 2026-05-17. Flip `WAVE1_BACKEND_*` flags to `dataverse`, retire Postgres `system_settings` / `user_app_access` / `user_preferences`. Plan: `docs/WAVE1_VERCEL_FLAG_ROLLOUT.md`, `docs/WAVE1_REVERT_TEMP_ELEVATIONS.md`. Do not start before stability clock expires.
- **Connor's PA-side `ExecutePrompt` build** — when it lands, run the parity oracle from both sides and verify byte-identical `wmkf_ai_rawoutput`. Vercel side is ready (`scripts/test-echo-parity.js`).
- **Connor's `akoya_request` create/update PA flows** — when they ship, the contact-history endpoint's per-row `sources` array stops showing single-source `[junction]` for newly-PI-touched data.
- **Cycle-redesign signal from Sarah/Connor** — unlocks `STAGED_REVIEW_PIPELINE.md` build (V25 migration + Fit Screener + Pipeline orchestration app). Don't start the V25 migration until the redesigned cycle's shape locks.
- **Wave 2 reviewer migration completion** — partial Wave 2 build set landed S139; remaining work cycle-gated to Connor cadence.

### C. Reviewer Finder agent-loop support (long-running carryover)

Per memory `project_app_roadmap_2026-04-25.md`: Reviewer Finder is the top post-cycle priority and may need agent-loop support outside the Executor contract. No deadline; pick up when reviewer-discovery quality becomes the binding constraint.

## Key files modified or added

| File | Status | Purpose |
|---|---|---|
| `pages/api/auth/[...nextauth].js` | EDITED | entra-external gate now requires all three EXTERNAL_AZURE_AD_* vars |
| `docs/AUTHENTICATION_SETUP.md` | EDITED | Two-var → "all three" wording reverted |
| `docs/CREDENTIALS_RUNBOOK.md` | EDITED | "All three" wording reverted; NOTIFICATION_EMAIL_FROM rewritten as sole notification var |
| `docs/SECURITY_ARCHITECTURE.md` | EDITED | NOTIFICATION_EMAIL_TO row dropped; NOTIFICATION_EMAIL_FROM description updated |
| `scripts/check-doc-currency-self-test.js` | NEW | 12-fixture binding self-test for the doc-currency gate |
| `package.json` | EDITED | Added `check:doc-currency:self-test` script |
| `.github/workflows/test.yml` | EDITED | Added `check:doc-currency:self-test` to CI |
| `CLAUDE.md` | EDITED | Coverage-tools rule updated to reference both self-tests |
| `lib/services/notification-service.js` | REWRITTEN | Dynamics transport + active-superuser recipient query; emailAdmins opt-in |
| `docs/TODO_EMAIL_NOTIFICATIONS.md` | REWRITTEN | Reflects Dynamics-transport reality and self-healing roster |
| `docs/STRATEGY.md` | EDITED | "No outstanding admin asks" status row |
| `docs/BACKEND_AUTOMATION_PLAN.md` | EDITED | Archive-path link updates; "all asks resolved" note |
| `docs/DYNAMICS_AI_FIELDS_SPEC_v3_cn.md` | EDITED | Archive-path link update |
| `docs/PENDING_ADMIN_REQUESTS.md` → `docs/archive/` | RENAMED | All four sections resolved or retired |
| `scripts/probe-sharepoint-write.js` | EDITED | Archive-path link update |

## Testing

```bash
# All five should be green at session start (and stay that way)
npm run check:atlas
npm run check:atlas:self-test
npm run check:api-routes
npm run check:doc-currency
npm run check:doc-currency:self-test

# Notification path smoke test (won't be needed unless something looks off):
node -e "
const fs=require('fs');
const env=fs.readFileSync('.env.local','utf8');
for (const line of env.split('\n')) {
  const m=line.match(/^([A-Z_][A-Z0-9_]*)=(.*)\$/);
  if (m) process.env[m[1]]=m[2].trim().replace(/^\"(.*)\"\$/,'\$1').replace(/^'(.*)'\$/,'\$1');
}
(async()=>{
  const N=require('./lib/services/notification-service');
  console.log('isEmailEnabled:', N.isEmailEnabled());
  console.log('Recipients:', await N.getAdminRecipients());
})().catch(e=>{console.error(e);process.exit(1)});
"
```

## Carryover hygiene

No destructive carryover items in this session prompt. The `PENDING_ADMIN_REQUESTS.md` archive happened *this* session after grep-verifying every section's status against live state; no further action needed in S143.

## How to know Session 143 went well

- Picked one item from the punch list and shipped meaningful progress on it (or correctly chose a low-key session).
- All five CI gates stayed green throughout.
- No new entity / table / endpoint shipped without an Atlas update in the same commit (ground-truth rule).
- Externally-gated threads remain untouched unless a signal landed.
