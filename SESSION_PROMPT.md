# Session 99 Prompt

## Session 98 Summary

Write day. Connor granted Dynamics write access to the service principal mid-session (2026-04-14, scoped `prvCreate`/`prvUpdate` on `wmkf_ai_run`, `prvUpdate` on `akoya_request`). Unblocked the writeback work that had been paused for weeks — shipped two concrete pieces: (1) Grant Reporting now logs every Claude call to the `wmkf_ai_run` child table, and (2) a standalone `/phase-i-dynamics` test page runs Phase I summarization and patches the narrative into `akoya_request.wmkf_ai_summary`, with an overwrite-guard so user-initiated flows never silently clobber prior analyses.

### What Was Completed

1. **Dynamics writes unstubbed + AI run logging (`77b3b17`)**
   - Replaced stubbed `createRecord`/`updateRecord`/`deleteRecord` with real Web API calls in `lib/services/dynamics-service.js`.
   - Added `DynamicsService.logAiRun({ requestGuid, taskType, model, promptVersion, status, rawOutput, notes })` — handles Choice numeric mapping (Summary=682090000, etc.), the case-sensitive `wmkf_ai_Request` nav binding, and `_truncateForMemo` safety valve (caps at 1M for `rawOutput`, 2000 for `notes`).
   - Grant Reporting's `/api/grant-reporting/extract` now logs every Claude call (full extract, goals regen, per-field regen). Best-effort — warnings don't break the user flow.
   - Verified end-to-end against request 1002807 via `scripts/query-ai-runs.js`: 4 rows landed with full 9-11k char `rawOutput` payloads after Connor raised the field cap from the default 2000 to 1,000,000.
   - Also: retired v2 spec in favor of Connor's canonical v3 (`docs/DYNAMICS_AI_FIELDS_SPEC_v3_cn.md`), patched email test script's sender binding, added `scripts/inspect-ai-fields.js`, `scripts/query-ai-runs.js`, `scripts/test-log-ai-run.js`, `scripts/test-dynamics-write.js`.

2. **Phase I Dynamics test page (`9d53901`)**
   - First end-to-end flat-field writeback for a user-initiated flow. New page `/phase-i-dynamics` + endpoint `/api/phase-i-dynamics/summarize`.
   - Takes a request number → calls `/api/grant-reporting/lookup-grant` (widened to accept the `batch-phase-i-summaries` app key) to fetch Dynamics header + SharePoint docs → picks proposal file → runs existing Phase I summarization prompt → PATCHes narrative into `akoya_request.wmkf_ai_summary` → logs audit row to `wmkf_ai_run` (`taskType=summary`, `promptVersion=1`).
   - **Pre-flight overwrite guard**: GET `wmkf_ai_summary` before calling Claude. If non-empty, return HTTP 409 with `{ existingLength, existingContent, recordModifiedOn }`. UI surfaces a confirm-overwrite card showing the full existing text; staff retry with `overwrite: true`. Saves the Claude call when user cancels.
   - Extracted shared FileRef loader into `lib/utils/file-loader.js` so Grant Reporting and Phase I Dynamics both use it.
   - Added `PHASE_I_PROMPT_VERSION = 1` export.
   - Gated on existing `batch-phase-i-summaries` app access grant; not yet registered in nav (direct URL only while we validate).

### Commits

- `77b3b17` Unstub Dynamics writes and wire AI run logging into Grant Reporting
- `9d53901` Add Phase I Dynamics test page with wmkf_ai_summary writeback

## Deferred Items (Carried Forward)

- **Reusable no-clobber helper**: once a second user-initiated writeback ships (Field Set C Compliance, Grant Reporting flat fields when Set B unblocks, etc.), lift the inline pre-flight read into `DynamicsService.updateIfEmpty(entitySet, guid, fieldName, value, { overwrite })`. Server-side 409-on-conflict is the contract.
- **Surface existing writeback state in lookup** — include target flat fields (`wmkf_ai_summary`, etc.) in `/api/grant-reporting/lookup-grant`'s select so the frontend can warn "will overwrite existing from YYYY-MM-DD" upfront instead of paying a round-trip on submit. Low priority until multiple apps hit this pattern.
- **Register `/phase-i-dynamics` in main nav** once validated across a handful of requests.
- **Wire `wmkf_ai_dataextract`** (structured JSON capture) — deferred until the capture shape is settled.
- **Dynamics Identity Reconciliation** (Steps 1–4) — ~½ day, plan at `docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md`. Unblocks attributed writes via `MSCRMCallerID` impersonation.
- **`prvCreateNote` on `annotation`** still not granted — don't design flows that drop notes on records.
- **SharePoint `Sites.ReadWrite.Selected`** email drafted but not sent. Blocks outputs-back-to-SharePoint.
- **Staged Pipeline Implementation** — plan at `docs/STAGED_PIPELINE_IMPLEMENTATION_PLAN.md`.
- **CRM Email Send (Phase A)** — pending feedback on plan.
- **Drop `Final Report Template.docx` into `public/templates/`** — visual parity check pending.
- **`wmkf_ai_run` exclusion from Dynamics Explorer** — operational log, shouldn't surface in NL queries about grants.
- **Stray file: `shared/config/prompts/expertise-finder.js.zip`** — untracked binary in the prompts dir. Decide whether to gitignore or remove.

## Potential Next Steps

### 1. Validate Phase I Dynamics against more requests
Run `/phase-i-dynamics` against 5–10 real requests — mix active (`akoya_request` library) and migrated (archive libraries with subfolders). Verify writeback lands on each and the audit rows look right. Good stress test for the SharePoint bucket walker + file loader path.

### 2. Ship Field Set C Compliance writeback
Second user-initiated writeback surface. Would immediately justify lifting the no-clobber check into `updateIfEmpty`. Fields are ready (`akoya_submissionaccepted` existing, `wmkf_ai_complianceissues` Memo JSON, `wmkf_ai_compliancesummary` Memo).

### 3. Dynamics Identity Reconciliation (Steps 1–4)
Creates the `user_profiles ↔ systemuser` bridge via email match. No new permissions needed. Unblocks attribution on writes and joined reporting. Plan at `docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md`.

### 4. Backend/PowerAutomate Phase I trigger
With user-initiated writeback proven, wire the equivalent flow as a backend job (skip the no-clobber check — authoritative rerun). Would be the first non-interactive AI call in the system.

### 5. Continue testing Grant Reporting
Session 97 left off mid-testing. `jsonrepair` is in place; now `wmkf_ai_run` logging is in place too. Good chance to iterate prompts with full audit visibility.

### 6. Batch Evaluation Tool (Phase 1 Priority)
Same carryover from 95/96/97/98 — historical-data prompt engineering at scale.

## Key Files Reference

| File | Purpose |
|------|---------|
| `lib/services/dynamics-service.js` | Real writes + `logAiRun` helper |
| `lib/utils/file-loader.js` | Shared FileRef → text loader (upload/SharePoint, PDF/DOCX) |
| `pages/api/phase-i-dynamics/summarize.js` | Single-request Phase I + `wmkf_ai_summary` writeback with overwrite guard |
| `pages/phase-i-dynamics.js` | Test UI (request lookup → file picker → summarize) |
| `pages/api/grant-reporting/lookup-grant.js` | Widened to accept `batch-phase-i-summaries` app key |
| `pages/api/grant-reporting/extract.js` | Logs to `wmkf_ai_run` on every Claude call |
| `shared/config/prompts/phase-i-summaries.js` | Exports `PHASE_I_PROMPT_VERSION` |
| `scripts/query-ai-runs.js` | Query-back diagnostic for `wmkf_ai_run` |
| `scripts/test-log-ai-run.js` | CRUD smoke test for `logAiRun` |
| `scripts/inspect-ai-fields.js` | Dumps actual `wmkf_*ai*` attribute names |
| `docs/DYNAMICS_AI_FIELDS_SPEC_v3_cn.md` | Canonical field spec (supersedes v2) |

## Testing

```bash
npm run dev                                            # Start dev server

# Query back what's in wmkf_ai_run for a given request:
node scripts/query-ai-runs.js 1002807
node scripts/query-ai-runs.js 1002807 --show-raw

# Phase I Dynamics test: open http://localhost:3000/phase-i-dynamics
#   1. Enter request number (e.g. 1002807 — already has wmkf_ai_summary populated,
#      so you'll get the overwrite confirmation card)
#   2. Pick a proposal file from the SharePoint dropdown (or upload one)
#   3. Click "Run summary + write to Dynamics"
```

## Session hand-off notes

- Two commits (`77b3b17`, `9d53901`) pushed. Working tree clean at session start.
- Dev server was running on port 3000 during the session.
- Connor granted write access mid-session; test flows against request 992629 and 1002807 are the ones with rows in `wmkf_ai_run` — ask him to purge periodically (filter `wmkf_ai_model eq 'claude-sonnet-4-TEST'` catches the CRUD smoke-test rows).
