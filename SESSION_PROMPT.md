# Session 144 Prompt: Stage 2a slice 1 — Session D smoke + pre-production blockers

## Heads up — read before doing anything

Session 143 shipped the full backend + UI for Reviewer Stage 2a slice 1 — schema deployed to prod, policy library seeded, `/respond` endpoint live, page composition rewritten with state-driven view dispatch, all Codex findings addressed across two review passes. Five commits, end-to-end coherent slice. **Code is feature-complete; not yet shipped to a real reviewer cycle.**

Three external blockers stand between the code and production use:
1. **COI policy body wording** — staff feedback meeting needs to land. The current `wmkf_policyversion` row for `reviewer-coi` carries an explicit `[PLACEHOLDER]` body. Once staff approves text, create a new `wmkf_policyversion` row in Dynamics and flip the `reviewer-coi` parent's `wmkf_activeversion` lookup. (Don't edit the existing row in place — immutability rules per build plan §4a.)
2. **Dataverse security role** restricting delete privilege on `wmkf_policy` and `wmkf_policyversion` to admin-only. Per build plan §4a immutability rules — referential `Restrict` cascade is in place at the DB level, but ordinary policy-body editors should also not be able to hard-delete used version rows via Dynamics UI.
3. **End-to-end smoke** against a real production engagement. The test suggestion row used during S143 smoke probes was already in `submitted` state, so we never exercised the actual Stage 2a invitation flow against a real proposal. Need to find or set up a fresh suggestion row in pre-materials state and run accept + decline + flip-back paths in a browser.

S144 is **Session D** of the Stage 2a build per the build plan: smoke + verification + final docs.

## Session 143 summary

### What was completed

Five commits, four sessions of work in one calendar session:

1. **Session A — schema deploy + seed (`d07e72a`)**
   - Wave 3 deployed to prod: 2 new Dataverse entities (`wmkf_policy`, `wmkf_policyversion`), 13 new fields on `wmkf_appreviewersuggestion` (engagement-scope contact corrections, decline capture, state stamps, policy ack lookups), `wmkf_responsetype` picklist extended with `withdrawn_sufficient=100000003`.
   - Native Dataverse entity audit enabled on `wmkf_appreviewersuggestion` via `scripts/enable-suggestion-audit.mjs` (PUT against `EntityDefinitions` endpoint with full body — PATCH not supported on `EntityMetadata`).
   - Two `wmkf_policy` parents seeded (`reviewer-coi`, `reviewer-ai-use`) with one Active `wmkf_policyversion` child each via `scripts/seed-stage2a-policies.mjs` (idempotent; entity set names are `wmkf_policies` / `wmkf_policyversions`, not the raw +s pluralization).
   - AI-use body lifts placeholder text aligned with existing review form footer; COI body uses an explicit `[PLACEHOLDER — pending staff wording]`. Both rows live; both must be replaced before slice 1 ships.
   - Atlas pages: `dataverse-wmkf-appreviewersuggestion.md` extended; new `dataverse-wmkf-policy-and-policy-version.md`; `INTAKE_PORTAL_SCHEMA_CHANGES.md` audit row.

2. **Session B — backend (`18c69ec`)**
   - New `lib/external/policy-fetcher.js` (5-min cache, parallel slot resolution, active-child sanity validation centralized).
   - Extended `lib/external/verify-suggestion-token.js` SUGGESTION_SELECT/REQUEST_SELECT/REVIEWER_SELECT for Stage 2a payload + proposal summary card data.
   - Widened `pages/api/external/review/[token]/context.js` payload: `engagementState` (view, canFlipState, etc.), prefill stack (engagement → snapshot → contact → empty), policy bodies, proposal summary including applicant institution + project leader + co-PIs.
   - New `pages/api/external/review/[token]/respond.js` — unified accept/decline endpoint discriminated by `body.action`. State-machine guard, idempotency (repeat-of-current-action returns 200 without re-stamp), policy-ack validation + active-child sanity at accept time, optimistic locking via `If-Match`, decline structured capture.
   - Adapter additions: `applyStage2aResponse` method, FIELD_SELECT extension, `RESPONSE_TYPE_MAP.withdrawn_sufficient`, `DECLINE_REASON_MAP`.

3. **Plan reconciliation (`42340e1`)**
   - Codex flagged plan-doc staleness post-Session-A/B. Reconciled §1 "not in slice", §8 open questions (1/3/4 marked shipped), §10 reorganized into "Sessions A/B status (shipped)" + "Session C self-check".
   - Locked UX decisions: decline = dedicated page in dispatcher (asymmetric-cost analysis: ~30-40% decline rate, thinner referrals = real downstream staff cost); policy ack = modal per policy with scroll-to-bottom enables (auto-enable for short policies); form-factor target = desktop/laptop/iPad (mobile graceful but not optimized).

4. **Session C — UI dispatcher + view components (`13f3397`)**
   - `pages/external/review/[token].js` rewritten as state-driven view dispatcher. `engagementState.view` from `/context` drives which view component renders.
   - Six new components in `shared/components/external/`: `Stage2aView`, `PolicyAckModal`, `DeclineFormView`, `AcceptedConfirmationView`, `DeclinedConfirmationView`, `MaterialsView` (Stage 2b extraction; behavior preserved verbatim).
   - Browser back/forward integrated via `window.history.pushState`. Refresh on any view lands deterministically from server state. Decline-form (transient UI step) doesn't survive refresh — that's intentional.
   - Modal scroll-to-bottom detection with auto-enable for short policies that don't overflow. Re-checks on viewport resize, ResizeObserver-watched font/content reflows, and a 100ms settle timer for first-paint markdown layout shifts.

5. **Codex fixes (`efc5890`)**
   - Codex returned 9 findings on `13f3397`: 1 BLOCKER, 5 POLISH, 3 SOUND, 1 product-call.
   - **BLOCKER #6** — decline-to-accept flip wired to no-op; fixed by generalizing the dispatcher to support multiple view overrides (`decline-form`, `stage2a`) and routing `DeclinedConfirmationView.onRequestFlipToAccept` to `pushOverrideView('stage2a')`.
   - **POLISH #1** — double-accept race; fixed by making `onResponseSubmitted` async + Stage2aView awaits it before re-enabling submit.
   - **POLISH #5** — missing "Submit without explanation" affordance; added secondary text-link button. Re-review caught that the secondary button still submitted user-typed text — fixed by refactoring to `submitDeclineWith(decline)` with separate primary (sends typed) and secondary (sends empty) handlers.
   - **POLISH #7a** — modal close doesn't restore focus to trigger button; fixed via per-slot `policyTriggerRefs` Map + `requestAnimationFrame` focus restoration. Codex verified the edge case where the button changes from "Read policy" to "View again" on acknowledge (callback ref updates before RAF fires).
   - **POLISH #7b** — Stage2a/Materials lack heading focus on view entry; both views now render a focusable `sr-only` h2 with `tabIndex=-1`.
   - **POLISH #9** — modal footer mobile compression; footer + button group now stack vertically on narrow screens via `flex-col-reverse sm:flex-row`.
   - **Whitespace trimming** (user-requested product call) — Stage2aView's contactEdits diff now trims both sides before comparing and writes the trimmed value. Prevents whitespace-only audit rows.

### Memory updates

One new feedback entry: `feedback_surface_full_review_findings.md` — when an external reviewer (Codex, code-reviewer agent, ultrareview, etc.) returns findings, list ALL of them using the reviewer's own labels. My recommendations come after the full set, not instead of it. Documented after Justin called out that I had filtered Codex's first-pass review by surfacing only the strongest items. Rule applies broadly to any review surface, not just Codex.

### Commits

- `d07e72a` — Reviewer Stage 2a slice 1 — schema deploy + policy library seed
- `18c69ec` — Reviewer Stage 2a slice 1 — backend (extend /context, add /respond)
- `42340e1` — Stage 2a build plan — reconcile post-Sessions-A/B + lock UX decisions
- `13f3397` — Reviewer Stage 2a slice 1 — UI dispatcher + view components
- `efc5890` — Stage 2a slice 1 — address all Codex findings on Session C UI

## Production state

- Five CI gates green throughout: `check:atlas` (28 PG / 26 DV), `check:atlas:self-test` (11/11), `check:api-routes` (78 routes), `check:doc-currency` (8 patterns), `check:doc-currency:self-test` (12/12).
- All five Stage 2a commits pushed and deployed; `npm run build` succeeds end-to-end.
- Wave 1 stability clock: ticking until 2026-05-17 (8 days as of S143 close).
- Notification email path live (S142 carryover); recipient roster = active superusers.

## Where to pick up — Session 144

### A. Pre-production blockers for Stage 2a slice 1 (in order of dependency)

1. **Browser smoke** — find a suggestion row in pre-materials state (or create one via Reviewer Finder save-candidates → Review Manager send-emails to mint a token, then *stop* before staff manually flips the accepted bool). Hit `/external/review/{token}` in a browser and exercise: (a) Stage 2a renders correctly with policies fetched; (b) accept after both modal-acks works; (c) decline page captures referral correctly; (d) browser back from decline-form returns to Stage 2a; (e) flip-back from declined view re-renders Stage 2a; (f) flip-back from accepted view goes to decline form. **Most important verification still pending** — only schema/backend smoke ran in S143.

2. **COI policy body** — staff meeting on wording needs to happen. Once the text exists:
   ```
   # In Dynamics admin UI:
   # 1. Create new wmkf_policyversion row under wmkf_policy 'reviewer-coi'.
   #    wmkf_versionlabel: e.g., '2026-05-15' (today's date when staff approves)
   #    wmkf_policytitle: 'Confidentiality and Conflict of Interest'
   #    wmkf_policybody: <approved text>
   #    wmkf_effectivedate: today
   #    statuscode: Active
   # 2. On the wmkf_policy 'reviewer-coi' parent, set wmkf_activeversion lookup to the new row.
   # 3. Optionally set the prior placeholder version's statuscode to Retired (informational; the live ack lookup stays pinned regardless).
   ```
   Per immutability rules in build plan §4a, do NOT edit the existing placeholder row's body — create a new version row.

3. **Dataverse security role** — restrict delete privilege on `wmkf_policy` and `wmkf_policyversion` to a small admin role. Ordinary policy-body editors who can create new versions should NOT be able to hard-delete used version rows. The referential `Restrict` cascade on the lookup catches the most catastrophic case at the DB level, but role configuration is the second layer the plan specifies.

4. **AI-use policy body** — current row uses placeholder text adapted from the existing review form footer. May want a quick staff review to confirm it matches what the review-form footer actually says today, in case wording has drifted.

### B. Session D self-check (per build plan §10)

After the smoke runs, verify each item in the Session C self-check list (browser back-button, refresh determinism, focus management on view changes, modal scroll-detection edge cases, etc.). The self-check items in the build plan §10 are the test matrix for this session.

### C. After slice 1 ships — what's still ahead

- **Slice 3 — Stage 3 calendar invites (ICS) on accept.** Per design doc: two ICS attachments (materials-delivery date, due date), magic link in description/location, UID tracking on the engagement row for reschedule REQUESTs. Schema additions: `wmkf_ics_uid_materials`, `wmkf_ics_uid_due` on `wmkf_appreviewersuggestion`. New service module for ICS generation.
- **Decline-acknowledgment + referral-handoff emails.** PA-side trigger lives on the `/respond` endpoint's decline path. Email body templates pending design. Could also be a Vercel-side cron + Dynamics-transport pattern (mirroring the S142 system-alert email build).
- **Stage 4 — reminder cadence.** Cron job; per-staff preference; T-7/T-2/T+0 default; individually disable-able by PD; per-PD opt-out entirely.
- **"We're full" cancellation.** PD-initiated action in Review Manager UI that flips pending invitations to `wmkf_responsetype=withdrawn_sufficient`, sends polite "no longer needed" email to all pending invitees.

### D. Other punch-list items (independent of Stage 2a)

Per S142 prompt — the original S143 punch list still has untouched items:

1. **Prompt caching in Expertise Finder + Virtual Review Panel** — Tier 1 quick wins shipped on Dynamics Explorer; expertise-finder's `match.js` and multi-llm-service's `_callClaude` haven't been wired with `cache_control` markers. Highest token-cost ROI; pure code, no external deps. **Size: S–M (~2-3 hrs).**
2. **Retrospective Analysis Gap 1 — historical-request picker** (`docs/RETROSPECTIVE_ANALYSIS_PLAN.md`). Plan exists, no code. Build the cycle/program/status filter UI that auto-resolves SharePoint folders. **Size: M (~4-6 hrs).**
3. **Executor extensions — multi-output PATCH coalescing** (`docs/EXECUTOR_EXTENSIONS_PLAN.md`). Correctness fix; blocks Grant Reporting + Integrity Screener PA flows but not urgent. **Size: M (~4-6 hrs).**
4. **Proposal Context Extraction field-set extension** (`docs/PROPOSAL_CONTEXT_EXTRACTION_PLAN.md`). Design-only; extend `DYNAMICS_AI_FIELDS_SPEC_v3_cn.md` with the 21 proposed AI fields. **Size: S (~1-2 hrs).**

### E. Externally gated (don't pursue without signal)

- **Wave 1 retirement** — earliest 2026-05-17. Flip `WAVE1_BACKEND_*` flags to `dataverse`, retire Postgres `system_settings` / `user_app_access` / `user_preferences`. Plans: `docs/WAVE1_VERCEL_FLAG_ROLLOUT.md`, `docs/WAVE1_REVERT_TEMP_ELEVATIONS.md`. Do not start before stability clock expires.
- **Connor's PA-side `ExecutePrompt` build** — when it lands, run the parity oracle from both sides.
- **Cycle-redesign signal from Sarah/Connor** — unlocks `STAGED_REVIEW_PIPELINE.md` build.

## Key files modified or added

| File | Status | Purpose |
|---|---|---|
| `lib/dataverse/schema/wave3/01_wmkf_policy.json` | NEW | wmkf_policy entity create manifest |
| `lib/dataverse/schema/wave3/02_wmkf_policyversion.json` | NEW | wmkf_policyversion entity create + parent lookup |
| `lib/dataverse/schema/wave3/03_wmkf_policy_activeversion.json` | NEW | wmkf_policy → wmkf_policyversion active_version lookup (split out to break cyclic dependency) |
| `lib/dataverse/schema/wave3/04_wmkf_appreviewersuggestion_stage2a.json` | NEW | 13 new attrs + 2 policy-version lookups on suggestion |
| `scripts/enable-suggestion-audit.mjs` | NEW | One-off: enable IsAuditEnabled on wmkf_appreviewersuggestion |
| `scripts/extend-responsetype-picklist.mjs` | NEW | One-off: add withdrawn_sufficient option |
| `scripts/seed-stage2a-policies.mjs` | NEW | Seed reviewer-coi + reviewer-ai-use parents + active children. Idempotent. |
| `lib/external/policy-fetcher.js` | NEW | Slot-code → active wmkf_policyversion. 5-min cache. Active-child sanity. |
| `lib/external/verify-suggestion-token.js` | EXTENDED | SUGGESTION_SELECT / REQUEST_SELECT / REVIEWER_SELECT widened for Stage 2a |
| `lib/dataverse/adapters/reviewer-suggestion.js` | EXTENDED | applyStage2aResponse method, FIELD_SELECT additions, picklist maps |
| `pages/api/external/review/[token]/context.js` | REWRITTEN | engagementState computation, policy fetch, prefill stack, proposal summary |
| `pages/api/external/review/[token]/respond.js` | NEW | Unified accept/decline endpoint with state machine + idempotency |
| `pages/external/review/[token].js` | REWRITTEN | State-driven view dispatcher with browser-history integration |
| `shared/components/external/Stage2aView.js` | NEW | Stage 2a card stack |
| `shared/components/external/PolicyAckModal.js` | NEW | Scroll-to-bottom-enables modal with focus return |
| `shared/components/external/DeclineFormView.js` | NEW | Dedicated decline page with primary + secondary submit |
| `shared/components/external/AcceptedConfirmationView.js` | NEW | Post-accept confirmation w/ flip-to-decline |
| `shared/components/external/DeclinedConfirmationView.js` | NEW | Post-decline confirmation w/ flip-to-accept |
| `shared/components/external/MaterialsView.js` | NEW | Stage 2b extraction (behavior-preserving) |
| `docs/REVIEWER_STAGE_2A_BUILD_PLAN.md` | UPDATED | Plan-doc reconciliation + locked UX decisions |
| `docs/atlas/dataverse-wmkf-appreviewersuggestion.md` | EXTENDED | Stage 2a additions + native audit note |
| `docs/atlas/dataverse-wmkf-policy-and-policy-version.md` | NEW | Policy entity-pair atlas |
| `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md` | EXTENDED | S143 wave 3 audit row |
| `docs/API_ROUTE_SECURITY_MATRIX.md` | EXTENDED | New /respond route |
| `.claude-memory/feedback_surface_full_review_findings.md` | NEW | Behavior memory: relay all reviewer findings, don't filter |

## Testing

```bash
# All five should be green at session start (and stay that way)
npm run check:atlas
npm run check:atlas:self-test
npm run check:api-routes
npm run check:doc-currency
npm run check:doc-currency:self-test

# Build sanity
npm run build

# Re-run idempotent seed (should report all entries already exist):
node scripts/seed-stage2a-policies.mjs

# Verify policy fetcher resolves cleanly:
node -e "
import('./lib/external/policy-fetcher.js').then(async ({getActivePolicies}) => {
  const fs=require('fs');
  const env=fs.readFileSync('.env.local','utf8');
  for (const line of env.split('\n')) {
    const m=line.match(/^([A-Z_][A-Z0-9_]*)=(.*)\$/);
    if (m) process.env[m[1]]=m[2].trim().replace(/^\"(.*)\"\$/,'\$1').replace(/^'(.*)'\$/,'\$1');
  }
  const policies = await getActivePolicies(['reviewer-coi','reviewer-ai-use']);
  for (const [code, p] of Object.entries(policies)) {
    console.log(code, '→', p.versionLabel, p.title.slice(0,40));
  }
});
"
```

## Carryover hygiene

No destructive carryover items. All S143 work is additive (new entities, new fields, new endpoints, new components). Pre-production blockers (COI body, security role, smoke) are forward work, not retire/drop/remove.

## How to know Session 144 went well

- Browser smoke against a real Stage 2a engagement passed end-to-end (accept, decline, both flip directions, modal scroll-to-ack, browser back/forward).
- COI body wording resolved with staff (or a clear next-step decision logged).
- Dataverse security role for `wmkf_policy*` configured (or punted with explicit reasoning).
- All five CI gates stayed green throughout.
- If smoke surfaced bugs, they were fixed and re-verified — slice 1 is genuinely ready to be sent to a real reviewer in the next cycle.
