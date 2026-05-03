# Session 126 Prompt: Carryover — pick from queued items, or wait on Entra

## Heads up

Session 125 was supposed to be "wait on Entra/Connor or pivot to carryover."
Entra and Connor were both still pending at session start, so the bulk
of the work was carryover — and a chunk of it surfaced live-state bugs
that memory had claimed were already done. Net result: 4 commits, prod
Wave 1 flag rollout actually live for the first time, legacy Blob path
retired, and a Codex review fully closed.

Reference docs:
- `docs/INTAKE_PORTAL_DESIGN.md` — design v3, async-jobs + virus scanning locked in
- `docs/CONNOR_INTAKE_PORTAL_SYNC.md` — pre-read for Connor sync; 6 decisions sought (item 6 added this session)
- `docs/WAVE1_VERCEL_FLAG_ROLLOUT.md` — trailing-newline gotcha now documented inline
- `docs/WAVE1_REVERT_TEMP_ELEVATIONS.md` — held until intake portal schema lands
- `docs/EXTERNAL_REVIEWER_INTAKE_PLAN.md` — Migration/Cutover section updated to "completed 2026-05-03"

## Session 125 summary

Multi-thread session: closed Codex review on the intake portal, locked
in async-submit + virus scanning architecture, fixed the silently-broken
Wave 1 prod flag rollout, shipped event-driven token expiry, and retired
the legacy Vercel Blob review download path.

### What was completed

1. **Codex review on intake portal — all 5 findings closed** (`9711bf1`).
   - **P1 mapper bug:** `pi_name` lookup leaked raw string into the
     PATCH body. Mapper now gates on `mapping.needsConnor` rather
     than the `TODO_ASK_CONNOR_` prefix sniff. Smoke asserts the
     leak is plugged.
   - **P1 validator gap:** strict mode now requires `blob_url`,
     64-char hex `sha256`, `scanned_at`, and `scan_result === 'clean'`
     on every file. Partial mode (autosave) tolerates pre-scan
     staging. 5 new smoke checks.
   - **P2 GC bug:** `IntakeDraftService.deleteExpired` returns
     `{ count, attachments }` via `RETURNING` so the cleanup cron can
     purge orphaned Blob objects.
   - **P2 design:** explicit pilot decision documented that submitter
     authority is institution-wide, with Phase-1 follow-up noted.
   - **P1 architecture:** new decision #6 in Connor sync asking him to
     pick a structured-tables persistence contract (recommend JSON
     columns on `akoya_request` for pilot).

2. **Intake portal architecture lock-ins** (`9711bf1`).
   Driven by a long capacity-planning conversation about expected
   submission load.
   - **Async submission lifecycle:** `submission_jobs` table + drain
     cron replaces synchronous submit. Idempotency-key contract
     handles deadline retry storms. Per-`request_id` advisory lock
     prevents interleaved Dynamics writes.
   - **Direct browser-to-Blob upload pattern documented:** function
     never sees file bytes, sidesteps the 4.5 MB Vercel Functions
     limit that bit prior apps. 25 MB end-to-end round-trip
     verified by `scripts/smoke-blob-upload.js` against the real
     Blob endpoint (8/8 pass).
   - **Virus scanning:** Cloudmersive, fail-closed, scan at upload
     completion. EICAR smoke planned. New env var
     `CLOUDMERSIVE_API_KEY`.
   - **Pre-launch verification checklist** added to design doc with 7
     real-URL test items that must run against deployed previews
     before pilot opens (browser uploads, CORS, EICAR end-to-end,
     concurrent submit rehearsal, Entra sign-in).
   - Three former launch blockers (scanning, submit pattern, upload
     capacity) moved to "Resolved" with strikethroughs.

3. **Wave 1 flag rollout — actually live for the first time** (`f6262d0`).
   Discovered that the three `WAVE1_BACKEND_*` env vars in prod were
   set to `"dataverse\n"` (trailing newline from
   `echo "dataverse" | vercel env add`). All three dispatch sites do
   `=== 'dataverse'` strict equality, so they silently fell back to
   Postgres for **6 days** while looking rolled over.
   - User cleared and re-added the three vars cleanly via dashboard
     (the Sensitive flag has a UI gotcha — Edit doesn't persist value
     changes for sensitive vars; had to delete and re-add as
     non-sensitive).
   - Resync confirmed zero divergence (0 inserts across all 3 tables;
     145 rows already aligned from the original cutover).
   - Trailing-newline gotcha documented inline in
     `docs/WAVE1_VERCEL_FLAG_ROLLOUT.md`.
   - **14-day stability clock starts 2026-05-03; earliest dispatch-code
     retirement 2026-05-17.**

4. **Per-submission token expiry — 7-day modify window** (`212b231`).
   The original "per-cycle expiry" carryover became event-driven
   instead, after Justin pointed out reviewers' tasks end long before
   the board meeting. Mint-time 90-day ceiling stays as the
   "reviewer ghosted us" timeout. After a successful upload, expiry
   tightens to `now + 7 days`. Each subsequent upload re-bumps to
   `now + 7 days`, so a reviewer fixing a typo at day 6 gets a fresh
   week. `mark-received-no-file` deliberately untouched (staff
   explicitly closing out shouldn't grant fresh time).
   - New `extendForPostSubmissionWindow(suggestionId, { days = 7 })`
     in `lib/external/token-lifecycle.js`.
   - Wired into `writeReviewFiles` after successful Dataverse PATCH.
     Failure is non-fatal (review already committed; unshortened
     token is less bad than rolling back upload).
   - Both upload paths covered for free via shared core.
   - 5 new test cases; 17 pass on token-lifecycle, 24 on review-upload.

5. **Legacy Vercel Blob review download path retired** (`2277d23`).
   Memory said "Blob → SharePoint migration" was open work. Live
   audit found prod had only **2 rows** with a Blob URL set — one
   dual-set (real Tim Newhouse review, SharePoint canonical, Blob
   URL redundant) and one `test-review.txt` artifact from 2026-02-19.
   - Both PATCHed in prod (real review: clear `wmkf_reviewbloburl`;
     test row: option-b clear of `wmkf_reviewbloburl` +
     `wmkf_reviewreceivedat` + `wmkf_reviewfilename`).
   - Code stripped: `download-review.js` is SharePoint-only and
     returns 404 when `wmkf_reviewsharepointfolder` unset; adapter
     drops `wmkf_reviewbloburl` from select list and updateLifecycle
     map; `/api/review-manager/reviewers` no longer surfaces
     `reviewBlobUrl`; UI gates off `reviewSharePointFolder` only;
     backfill script explicitly skips `review_blob_url` so re-runs
     can't resurrect the field.
   - Connor can drop `wmkf_reviewbloburl` from the CRM schema when
     convenient; code stopped reading it 2026-05-03.

### Live-state corrections this session

Stale memory caught **four** times — worth flagging for next session:

1. Memory claimed Wave 1 elevations stripped 2026-04-28; live check
   showed both `WMKF AI Elevated TEMP` and `System Customizer` still
   on the app user. (Actually we want to leave them on now — see
   below.)
2. Memory said Wave 1 flag rollout "still pending"; the flags WERE set
   ~2026-04-27, but with broken trailing-newline values that silently
   failed the dispatch.
3. Memory said Reviewer Finder Dataverse-native entry path was open
   work; both the picker UI and save-candidates Dataverse cutover
   are already shipped.
4. Memory listed Vercel Blob → SharePoint migration as a mid-size
   work item; prod actually had zero real reviews left in Blob.

Memory files updated to reflect live state. Habit for future-me:
**verify live before trusting memory**, especially for "X is done"
claims.

### Wave 1 elevations revert — deliberately held

The original plan was to ask Connor to remove the temp roles after
the flag rollout stabilized. Justin caught that the intake portal
schema work needs `prvCreateEntity` / `prvCreateAttribute` (for
`wmkf_portal_membership`, `wmkf_portal_oid`, etc.) — which live in
`WMKF AI Elevated TEMP` and `System Customizer`. So the right
sequence is: Entra unblock → Connor design sync → schema script
lands new entities → THEN ask Connor for the revert. Draft message
to Connor is in conversation history; reuse with one tweak when
the time comes.

### Commits (Session 125)

- `9711bf1` — Intake portal: address Codex review + lock in async-jobs/scanning architecture
- `f6262d0` — WAVE1 rollout doc: trailing-newline gotcha
- `212b231` — External reviewer tokens: 7-day post-submission modify window
- `2277d23` — Retire legacy Vercel Blob review download path

### Verified end-to-end

- 25 MB Vercel Blob round-trip via `@vercel/blob` (`scripts/smoke-blob-upload.js`) — 8 pass.
- Form module smoke trio (`scripts/smoke-form-{schema,validate,map}.js`) — 38 + 24 + 20 pass.
- `tests/unit/token-lifecycle.test.js` — 17 pass (5 new).
- `tests/unit/review-upload.test.js` — 24 pass.
- `tests/unit/verify-suggestion-token.test.js` — unchanged, still passing.
- Prod Dataverse: zero rows with `wmkf_reviewbloburl` set after PATCHes.
- Prod Vercel: three `WAVE1_BACKEND_*` env vars verified clean
  (`"dataverse"`, no `\n`, no empty strings) via `vercel env pull`.
- Wave 1 sync dry-run against prod: 0 inserts, 145 rows aligned —
  confirmed Postgres ↔ Dataverse byte-for-byte alignment intact.

## Where to pick up — Session 126

### If Entra is provisioned
1. Create `wmkf_portal_membership` table (after Connor blesses the
   shape from `CONNOR_INTAKE_PORTAL_SYNC.md` § 1).
2. Add fields: `wmkf_portal_oid` on `contact`,
   `wmkf_phaseiisubmittedat` + `wmkf_phaseiisubmittedby` on
   `akoya_request`. Plus whatever Connor picks for structured-tables
   persistence (decision #6 — recommended JSON columns).
3. Add the V27 migration for `submission_jobs` table.
4. Build `/apply` skeleton — auth flow → dashboard → form.

### If Connor sync happened (Entra still pending)
1. Update `map-to-dynamics.js` with confirmed fields and child-entity
   entitySets. Replace `TODO_ASK_CONNOR_*` placeholders.
2. Re-run `scripts/smoke-form-map.js` and add positive assertions for
   the new mappings.
3. Update design doc with resolved decisions.

### If neither — pivot to non-portal carryover
1. **Dynamics identity reconciliation** — `user_profiles.azure_email`
   → `systemuser` bridge generalized into a shared service. Picker
   already does this lookup at runtime via `program-director-resolver.js`;
   this would make it shared infrastructure for any write path that
   needs attribution. Memory:
   `project_dynamics_identity_reconciliation.md`. Probably 2-3 hours.
2. **Interim grant report auto-evaluation** — was blocked on
   Dynamics write access, now resolved. Memory:
   `project_interim_report_automation.md`. Needs design conversation
   first; bigger session-opener piece.
3. **Drop dormant Postgres reviewer tables** — `researchers`,
   `publications`, `reviewer_suggestions`, `proposal_searches`,
   `grant_cycles`. Inert and scheduled for archival. Low urgency;
   wait at least until Wave 1 stability window passes (2026-05-17)
   before doing anything that touches the Wave 1 retirement plan.
4. **Wave 1 retirement** — earliest 2026-05-17. Drop the dispatch
   wrappers, retire the env vars, archive
   `docs/WAVE1_VERCEL_FLAG_ROLLOUT.md`. See its "Retirement criterion"
   section.

### Open questions tracked but non-blocking

Same five from Session 124, all still relevant. Plus updates this session:
- Reviewer-consumable artifact still pending Connor (option 1 vs 2).
- Structured-tables persistence (new decision #6) pending Connor.
- IT email re: Entra External ID tenant goes Monday 2026-05-04 (the
  day after this session). Watch inbox.

## Key files added/modified this session

| File | Purpose |
|---|---|
| `scripts/smoke-blob-upload.js` | NEW. 25 MB direct Blob upload smoke + reminder list for browser-side verification at deploy time. |
| `lib/external/token-lifecycle.js` | New `extendForPostSubmissionWindow()` helper. |
| `lib/services/review-upload.js` | Calls token-shorten after successful Dataverse PATCH. |
| `tests/unit/token-lifecycle.test.js` | 5 new test cases for the helper. |
| `pages/api/review-manager/download-review.js` | Legacy Blob fallback removed. |
| `lib/dataverse/adapters/reviewer-suggestion.js` | `wmkf_reviewbloburl` removed from select + lifecycle map. |
| `pages/api/review-manager/reviewers.js` | `reviewBlobUrl` no longer surfaced in row payload. |
| `pages/review-manager.js` | UI gates off `reviewSharePointFolder` only. |
| `pages/api/review-manager/upload-review.js` | Header comment cleaned of fallback note. |
| `scripts/backfill-postgres-to-dataverse.js` | Explicit guard against re-resurrecting the dead field. |
| `docs/INTAKE_PORTAL_DESIGN.md` | New "Submission lifecycle" section + virus scanning subsection + pre-launch verification checklist + Codex P1#1 fix. |
| `docs/CONNOR_INTAKE_PORTAL_SYNC.md` | Decision #6 added (structured-tables persistence). |
| `docs/WAVE1_VERCEL_FLAG_ROLLOUT.md` | Trailing-newline gotcha documented inline. |
| `docs/EXTERNAL_REVIEWER_INTAKE_PLAN.md` | Migration/Cutover section updated to "completed 2026-05-03". |
| `docs/DATAVERSE_SHAREPOINT_FILE_MODEL.md` | Vercel Blob row updated to reflect retirement. |
| `shared/forms/phase-ii-research-2026-06/{validate,map-to-dynamics}.js` | Codex P1 fixes. |
| `lib/services/intake-draft-service.js` | `deleteExpired` returns `{ count, attachments }`. |
| `CLAUDE.md` | Updates to reflect new helper, retired Blob path, intake-draft-service signature. |

## Production state (sanity)

- External Reviewer Intake: live. Token expiry now event-driven (90-day
  mint ceiling, 7-day post-submission modify window).
- Reviewer pipeline: production-tested. Picker + save-candidates both
  Dataverse-only. Blob fallback retired.
- Wave 1 (Postgres → Dataverse for `system_settings`,
  `user_preferences`, `user_app_access`): **rollout actually live**
  for the first time as of 2026-05-03. 14-day stability clock running.
- Intake portal: foundation work + design only. Still gated on Entra
  + Connor sync.
- Wave 1 elevations on prod app user: still attached
  (`WMKF AI Elevated TEMP`, `System Customizer`). Deliberately held
  until intake portal schema script needs them.

## Testing

```bash
# Form module — pure JS, no DB required
node scripts/smoke-form-schema.js
node scripts/smoke-form-validate.js
node scripts/smoke-form-map.js

# Blob endpoint capacity — needs BLOB_READ_WRITE_TOKEN
node scripts/smoke-blob-upload.js

# Services — local Postgres required (.env.local)
node scripts/smoke-intake-draft.js

# Token + review-upload Jest suites
npx jest tests/unit/token-lifecycle.test.js tests/unit/review-upload.test.js tests/unit/verify-suggestion-token.test.js

# Wave 1 alignment check (no writes)
node scripts/sync-wave1-postgres-to-dataverse.js --target=prod

# Full migration (idempotent — safe to re-run)
node scripts/setup-database.js

# Full test suite
npm test -- --runInBand
```
