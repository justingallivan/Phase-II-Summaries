# Session 113 Prompt: Cycle ride-along + post-cycle work begins

## Session 112 Summary

A two-day session (2026-04-26 → 2026-04-27) that landed three substantive things: a Codex-driven security pass (7 of 11 P1/P2 findings closed), the Wave 1 Postgres → Dataverse production cutover, and Plan-A prompt seeding for Phase II Writeup. Plus a parity drift caught + fixed during the Wave 1 flip, a raw-SQL audit with fail-closed guards on three admin scripts, and a queued direct-email-send next-session item.

### What was completed

1. **Security pass — 2026-04-26.** Codex shipped the CSP / CSRF / security-header baseline earlier in the day; this session closed seven additional findings:
   - **Auth fail-closed** in production (was: silent bypass when config incomplete). `EMERGENCY_AUTH_BYPASS=true` is the only escape hatch. 6 regression tests added.
   - **Decrypted-credentials-to-browser path eliminated.** Deleted dead `ApiKeyManager.js` (+ CSS module) and `ApiSettingsPanel.js`. Removed `getDecryptedApiKey` from `ProfileContext`. Removed the `includeDecrypted=true` branch from `/api/user-preferences`. Added `/api/api-capabilities` for boolean ORCID/NCBI/SerpAPI availability. `enrich-contacts.js` no longer accepts browser-passed credentials.
   - **Rate limiter no longer trusts `x-api-key` header / `req.body.apiKey`** — keyed strictly by IP.
   - **`extract-summary` IDOR fixed** via ownership join through `proposal_searches.user_profile_id`.
   - **`npm audit fix`** dropped production vulns from 13 (7 high) to 5 (0 high). Remaining 5 moderates blocked behind Next.js / next-auth majors → queued post-cycle.
   - **Multipart uploads** now stream-aborted at 50MB via Busboy `limits.fileSize` + `'limit'` event in all 3 upload routes.
   - **Log-analysis cron** redacts auth headers, API keys, connection strings, blob URLs, emails, and password fields before sending to Claude (10-test redactor at `lib/utils/log-redactor.js`).
   - 4 deferred items (public blob privatization, proposal password masking, Dynamics restrictions concurrency, remaining 5 moderate vulns) tracked in §8.

2. **CI lock-file fix.** `npm audit fix --legacy-peer-deps` over-pruned dev-tree entries; `npm ci` rejected the result. Regenerated the lock file in strict mode (no `--legacy-peer-deps`) — works for both `npm install` and `npm ci`.

3. **Wave 1 flag flip — 2026-04-27.** All three `WAVE1_BACKEND_*` env vars set to `dataverse` on Vercel production; prod redeployed and verified Ready. Live read/write for `user_app_access`, `user_preferences`, `system_settings` now goes to Dataverse. Postgres is the failsafe.

4. **Parity drift caught + fixed.** Post-flip, `scripts/test-wave1-flag-dispatch.js` surfaced pg=16 / dv=17 for Justin's app grants. Cause: my own Session 111 cleanup script ran raw SQL against Postgres before the dispatch wrappers existed. Rewrote the script to use `lib/services/app-access-service.js`, ran against Dataverse, parity restored to 35/35.

5. **Raw-SQL audit + fail-closed guards.** Documented the audit grep in §8, then ran it. 14 hits across 6 scripts: 3 intentionally Postgres-only (verify / sync / setup tools), 3 real hazards. Added `[wave1-guard]` blocks to `rotate-encryption-key.js`, `backfill-app-access.js`, `manage-preferences.js` — each hard-exits if the relevant `WAVE1_BACKEND_*` flag is `dataverse` unless `--allow-postgres-only` is passed.

6. **Phase II Writeup prompt seed (Plan A).** Four prompt rows on prod Dynamics covering both `phase-ii-writeup` and `batch-proposal-summaries`:
   - `phase-ii.summarize` → `5af67f40-9642-f111-88b4-6045bd019e44`
   - `phase-ii.extract-structured` → `65f67f40-9642-f111-88b4-6045bd019e44`
   - `phase-ii.qa` → `2040443d-9642-f111-88b4-000d3a306da2`
   - `phase-ii.refine` → `a6fff63d-9642-f111-88b5-000d3a306d45`

   Templates at `shared/config/prompts/phase-ii-dynamics.js`; seed at `scripts/seed-phase-ii-prompts.js`. Live routes (`process.js`, `qa.js`, `refine.js`) still use legacy generators until post-cycle refactor. Naming uses `phase-ii.<purpose>` since the prompts are shared by two app keys.

7. **Direct email send queued for next session** (§5 below) — Justin flagged the `.eml` download workflow in Review Manager and Reviewer Finder as the next major UX win, now that auth is enforced and Dynamics email activities are verified working.

### Commits (Session 112, all on origin/main)

- `36a8ab6` Security pass 2026-04-26
- `10bb5ef` SESSION_PROMPT: add post-cycle security follow-up queue
- `a8e8147` Fix package-lock.json for npm ci compatibility
- `dd58730` Cleanup script: route via dispatch wrapper, clean Dataverse
- `9bb4875` SESSION_PROMPT: document Wave 1 dispatch-wrapper hazard
- `fb36ecb` Wave 1 raw-SQL audit: fail-closed guards on three admin scripts
- `b53ba0e` Seed phase-ii.* prompt rows (Plan A pattern)
- `91fd758` SESSION_PROMPT: queue Reviewer/Review Manager direct email send

## Key state facts

- **Cycle is in 4 days (2026-05-01).** Production is fully ready. `phase-i.summary` Executor path live since Session 110 and verified through CI/build today.
- **Wave 1 cutover is live.** Three flags `dataverse` on prod Vercel. Retirement criterion: 14 days clean → drop dispatch wrappers + Postgres tables → Wave 2. Currently day 0.
- **Nine `wmkf_ai_prompts` rows on prod Dynamics:** `phase-i.summary` (live caller), and dormant prompts for reviewer-finder (×2), peer-review-summarizer (×2), phase-ii (×4). Plan A seeding is now done for all major Claude-using apps that aren't being deprecated.
- **Security posture materially improved.** Auth fails closed in prod; no decrypted credentials reach the browser; npm audit clean of all high-severity findings.
- **Parity test (`scripts/test-wave1-flag-dispatch.js`) is the canary.** Run after any change in dispatch-wrapper area; expect 35/35.

## Potential next steps

### 1. Cycle ride-along (May 1 → mid-May)
No code work expected. Watch for:
- `executePrompt` 500s in Vercel runtime logs
- Wave 1 anomalies — `requireAppAccess` 403s beyond baseline, user reports of "my settings disappeared," etc.
- Any spike in Dataverse rate-limiting / latency during peak proposal flow
- Existing crons handle spend monitoring + log analysis

### 2. Send the Connor brief
Send `docs/CONNOR_BRIEF_PHASE0.md` after ~5 working days of clean cycle runs. Pre-send checklist is in the doc.

### 3. Post-cycle Executor extensions (`docs/EXECUTOR_EXTENSIONS_PLAN.md`)
Sequenced order:
1. **Multi-PATCH coalescing** (~2 hrs) — correctness fix; unblocks any multi-output prompt.
2. **Picklist target type + `scripts/probe-picklist.js`** (~2 hrs) — needed for `phase-i.intake-check`.
3. **Native PDF input** (`preprocess: pdf_native`) (~half day to day) — biggest; budget compliance needs it.

After all three: author `phase-i.intake-check` (clerical + keywords + priority-fit), test, hand the prompt-row + parent flow to Connor for PA-trigger build.

### 4. Reviewer Finder route refactor (post-cycle, top user-facing priority)
Prompts already seeded; this is now pure wiring. Plan in `docs/REVIEWER_FINDER_FUTURE_ARCHITECTURE.md`.

### 5. Reviewer/Review Manager: direct email send via Dynamics
Both `/api/review-manager/send-emails` and `/api/reviewer-finder/generate-emails` currently produce `.eml` files for manual download/edit/send. With auth enforced (caller's `session.user.email` is trustable) and Dynamics email activities verified working (Session 77), this should become direct send.

**What's already in place:**
- `lib/services/dynamics-service.js`: `resolveSystemUser(email)`, `createEmailActivity`, `addEmailAttachment`, `sendEmail`, `createAndSendEmail` — all working in prod.
- `/api/test-email` + `scripts/test-dynamics-email.js` are the existing reference call sites.

**Migration shape:**
1. **`/api/review-manager/send-emails`** — replace `.eml` builder with `createAndSendEmail` per recipient; attachments via `addEmailAttachment`. Preserve SSE progress + `markAsSent` DB write.
2. **`/api/reviewer-finder/generate-emails`** — same pattern, bigger surface (Claude personalization + multi-proposal lookup).
3. **UI** — replace "download .eml" with "send" + confirmation modal. Preserve template editing UX. Per-recipient send status from SSE.
4. **Edge cases** — partial failures, retries, dry-run/preview. Worth designing before implementing.

**Sequencing:** `send-emails` first (smaller, fewer code paths, more obvious UX win). `generate-emails` second.

**Pointers:** `memory/project_reviewer_lifecycle.md` (Phase A: CRM send), the `Dynamics Email Activities` block in `MEMORY.md`. CRM tracking token (`CRM:0309001`-style) is set by Server-Side Sync.

### 6. Peer Review Summarizer route refactor
Prompts seeded; route is `pages/api/process-peer-reviews.js`. Two `executePrompt` calls, one conditional on the first's parse output. Smaller migration than Reviewer Finder.

### 7. Lighter migrations
- Phase II Writeup / Q&A — prompts seeded today. Three call sites (`process.js`, `qa.js`, `refine.js`). Multi-call but mechanical.
- Anything else with prompts in `shared/config/prompts/*.js` follows the same recipe.

### 8. Post-cycle security follow-ups (from 2026-04-26 pass)
The 2026-04-26 security pass closed all P1 findings that didn't require touching active upload paths or major dependency bumps. Remaining queue:

- **Public blob → private + auth proxy** (P1 in original Codex findings, downgraded after Justin assessed leak risk as low). Affects `pages/api/upload-file.js`, `pages/api/upload-handler.js`, `pages/api/reviewer-finder/extract-summary.js`, `pages/api/review-manager/upload-review.js`. Switch blob `access` from `'public'` to `'private'`, add a `/api/blob-proxy?url=…` route that does `requireAppAccess` + signs/streams, update callers. Manual smoke test of every upload path is mandatory.
- **Proposal password masking** (P2). `pages/api/review-manager/reviewers.js` returns `proposalPassword` in standard GET payload. Mask by default; narrowly scoped reveal endpoint.
- **Dynamics restrictions module-global state** (P2). `lib/services/dynamics-service.js` `activeRestrictions` is process-global. Real concurrency hazard for Dynamics Explorer. Fix: explicit request-context arg or AsyncLocalStorage.
- **Remaining 5 moderate npm vulns**. Blocked behind Next.js / next-auth majors. Bundle with the next planned framework upgrade.

If a future Codex re-scan flags anything new, treat `docs/SECURITY_FINDINGS_2026-04-26.md` as the canonical baseline — flag deltas only.

### 9. Stretch / housekeeping
- **Wave 1 retirement** (when 14 days clean): drop `lib/services/{app-access,user-preferences,settings}-service.js` dispatch wrappers, archive `docs/WAVE1_VERCEL_FLAG_ROLLOUT.md`, drop the three Postgres tables. See the doc's "Retirement criterion" section.
- `docs/STAGED_PIPELINE_IMPLEMENTATION_PLAN.md` re-resolve pipeline-state storage (recommend `akoya_request` fields + `wmkf_ai_run` JSON).
- `docs/ARCHITECTURE_SPINE.md` — write as canonical link target so future design docs stop drifting.
- Optional: echo-prompt test oracle row (mentioned in Connor brief) — small `wmkf_ai_prompt` row that just echoes inputs as outputs, for cross-implementation parity verification.

## Key files reference

| File | Purpose |
|---|---|
| `lib/services/execute-prompt.js` | **The Executor.** 10-step Phase 0 implementation. |
| `docs/EXECUTOR_CONTRACT.md` | Shared spec; Connor builds PA-side `ExecutePrompt` against this. |
| `docs/EXECUTOR_EXTENSIONS_PLAN.md` | **Read first when starting post-cycle Executor work.** |
| `docs/REVIEWER_FINDER_FUTURE_ARCHITECTURE.md` | **Read first when starting Reviewer Finder route refactor.** |
| `docs/CONNOR_BRIEF_PHASE0.md` | **Pre-drafted handoff message.** Send after cycle runs cleanly for ~5 working days. |
| `docs/WAVE1_VERCEL_FLAG_ROLLOUT.md` | **Live rollback playbook.** Rollback = `vercel env rm WAVE1_BACKEND_<NAME>` + redeploy. |
| `docs/SECURITY_FINDINGS_2026-04-26.md` | Canonical security baseline. |
| `docs/SECURITY_CODE_CHANGES_2026-04-26.md` | Security pass change log. |
| `pages/api/phase-i-dynamics/summarize-v2.js` | Reference call site for `executePrompt()` (~145 lines). |
| `pages/api/api-capabilities.js` | Boolean availability endpoint (replaces user-stored API keys). |
| `lib/utils/log-redactor.js` | Deterministic log redaction (10 unit tests). |
| `lib/utils/auth.js` | Production fail-closed; `EMERGENCY_AUTH_BYPASS=true` is the only escape. |
| `shared/config/prompts/phase-i-dynamics.js` | `phase-i.summary` template (live). |
| `shared/config/prompts/reviewer-finder-dynamics.js` | `reviewer-finder.*` templates (dormant). |
| `shared/config/prompts/peer-reviewer-dynamics.js` | `peer-review-summarizer.*` templates (dormant). |
| `shared/config/prompts/phase-ii-dynamics.js` | `phase-ii.*` templates (dormant). |
| `scripts/test-wave1-flag-dispatch.js` | **Wave 1 canary.** Expect 35/35. |
| `scripts/seed-phase-ii-prompts.js` | Most recent Plan A seed; pattern reference. |
| `scripts/cleanup-concept-evaluator-grants.js` | Now backend-aware via dispatch (see Session 112 commits). |
| `DEVELOPMENT_LOG.md` | Milestone log. Session 112 added two entries: Wave 1 cutover + Security pass. |

## Testing

```bash
# Reproduce the cycle path locally
npm run dev
# → http://localhost:3000/phase-i-dynamics

# Re-run the executor smoke test
node scripts/test-execute-prompt.js                  # block-or-write
node scripts/test-execute-prompt.js --force-overwrite # force, expect cacheHit on rerun
node scripts/test-execute-prompt.js --restore ""      # reset wmkf_ai_summary

# Wave 1 dispatch parity (canary)
node scripts/test-wave1-flag-dispatch.js              # expect 35/35

# Re-seed any prompt row if it drifts (all idempotent)
node scripts/seed-phase-i-summary-prompt.js --execute
node scripts/seed-reviewer-finder-prompts.js --execute
node scripts/seed-peer-review-summarizer-prompts.js --execute
node scripts/seed-phase-ii-prompts.js --execute

# CI suite
npm run test:ci   # 173 tests (including security headers + log redactor + auth fail-closed)

# Vercel deployment status
vercel ls --prod   # latest should be wmkfresearchapps-54h9tcpup-... or newer
```

## Session hand-off notes

- **Cycle is 4 days out.** Stick to ride-along mode. Don't start route refactors, Executor extensions, or any item from §3-§7 until cycle is settled.
- **Wave 1 dispatch wrappers are mandatory now.** Any new script or API route that touches `user_app_access`, `user_preferences`, or `system_settings` MUST go through `lib/services/{app-access,user-preferences,settings}-service.js`. Raw `sql\`…\`` against those tables lands in the now-secondary Postgres store and is invisible to the running app. Canary: `scripts/test-wave1-flag-dispatch.js` (expect 35/35).
- **Plan A pattern is now standard** for any new Claude-using app. Three apps' prompts seeded over Sessions 111-112 (reviewer-finder, peer-review-summarizer, phase-ii); `phase-i.summary` is the live reference. Recipe is mechanical.
- **Don't seed dead-code prompts.** `proposal-summarizer.js` exports `createRefinementPrompt` and `createQAPrompt` that are dead — refine.js has its own inline `REFINEMENT_PROMPT` and qa.js uses `createQASystemPrompt` instead. Confirmed via grep before seeding.
- **`wmkf_ai_systemprompt`** has no underscore between "system" and "prompt". Easy to fat-finger.
- **Resist `executeAgent()` design** until a second concrete caller wants the same shape (Reviewer Finder doesn't need it; Dynamics Explorer chat could be a future migration if the abstraction proves clean).
- **Two milestone entries in DEVELOPMENT_LOG.md this session** (Wave 1 cutover + Security pass). Both are real production events.
