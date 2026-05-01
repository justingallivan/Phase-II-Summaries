# Session 119 Prompt: Reviewer Finder cutover endgame — drop Postgres dual-write, then archive

## Session 118 Summary

Reviewer-lifecycle stack is now Dataverse-native end-to-end. 333 historical rows migrated. Review Manager rewritten across all four endpoints + UI. Five-phase real-auth validation passed; five drive-by bugs found and fixed along the way. Two external dependencies surfaced and tracked.

### What was completed

1. **Workstream 3 — historical backfill (`a4961db`).** `scripts/backfill-postgres-to-dataverse.js` — idempotent, dry-run-first. Reads each `reviewer_suggestions` row with a `request_number`, resolves `request_number` → `akoya_request` GUID and `grant_cycle_id` → `cycleCode`, then runs the three-adapter chain (`potentialReviewer.upsertByEmail` → `researcher.upsertByPotentialReviewer` → `reviewerSuggestion.upsert`) with lifecycle state preserved via `updateLifecycle`. 333/333 succeeded; 59 carried lifecycle. The 4 quantum-chimera test rows without `request_number` were skipped (already dual-written in Session 117).

   Adapter fixes uncovered live:
   - `wmkf_responsetype` and `wmkf_reviewstatus` are picklist optionsets (Edm.Int32), not strings. Added `RESPONSE_TYPE_MAP` / `REVIEW_STATUS_MAP` translation in `updateLifecycle` so callers can keep passing legacy string codes.
   - `reminderCount` → `wmkf_remindercount` added to lifecycle map.
   - `wmkf_areaofexpertise` capped at 100 chars (added to `FIELD_MAX` clamp map on `potential-reviewer`).
   - All three adapters: explicit `.js` extension on `dynamics-service` import (raw-Node ESM compatibility — Next handles both forms).

2. **Workstream 2 — full Review Manager Dataverse migration (`ef233a0`).** All four endpoints rewritten to read/write Dataverse; Postgres still serves cycle-level config (review template blob, additional attachments, deadline, custom fields) by `short_code` lookup, which remains ground-truth for cycle definitions.
   - `/api/review-manager/reviewers`: PD-scoped accepted suggestions via new `findAcceptedByPD` adapter method. `?cycleCode=Jxx` narrows; `?proposalId=` / `?requestNumber=` overrides PD filter for collaborator views. PATCH routes `reviewStatus` / `notes` / `proposalUrl` / `proposalPassword` through `updateLifecycle` or `bulkUpdateByRequest`. The `'complete'` branch fetches existing record to set `reviewReceivedAt` only if not already populated.
   - `/api/review-manager/send-emails`: recipients hydrated from Dataverse (suggestion → potentialReviewer + akoya_request); cycle-level attachments still from Postgres `grant_cycles` by `cycleCode`. Suggestion's `_wmkf_request_value` is the regarding link directly. After successful send: contact promotion via new `contact.js` adapter (find-or-create by email, setContactLink on the potentialReviewer). Lifecycle bumps logic checks current optionset value (100000000 = accepted, 100000001 = materials_sent, etc.) instead of legacy string codes.
   - `/api/review-manager/upload-review`: kept Vercel Blob upload path; lifecycle write through suggestion adapter. Blob folder keyed by request GUID.
   - `/api/review-manager/render-emails`: preview-only; recipient + proposal data from Dataverse so previews match send. `coInvestigators` dropped (Postgres-only, not migrated).
   - `pages/review-manager.js`: `selectedCycleId` → `selectedCycleCode`, drop `userProfileId` query param, GUID `suggestionId` flows through cleanly.

3. **Validation against real auth (`ada645d`).** Five phases ran clean against the J26 Quantum Chimera test set (request `54e2b88b…`, with the Justin Gallivan Test reviewer row used as the safe send target).
   - **Phase 1 (read)**: cycle filter + proposal detail render — 20 accepted suggestions across 99 historical PD requests.
   - **Phase 2 (PATCH)**: notes, status dropdown, bulk URL/password.
   - **Phase 3 (send-emails materials)**: email arrived, lifecycle bumped, contact promotion failed in a known-tracked way (see below).
   - **Phase 4 (upload-review)**: blob upload + status to `review_received`.
   - **Phase 5 (thank-you)**: email sent (no stray PDF), status to `complete`.

   Five drive-by bugs found and fixed during validation:
   - `saveProposalFields` was missing `onRefresh()` after PATCH — UI showed stale URL/password until full reload. Pre-existing bug.
   - Email modal attachments were shared across all template types via one localStorage bucket, causing the materials PDF to bleed into the thank-you send. Now per-template-type with backward-compat for legacy flat-array storage.
   - `formatReviewDeadline` parsed pure `YYYY-MM-DD` strings as UTC midnight; user-picked "April 30" rendered as "April 29" in any timezone west of UTC. Fixed by parsing pure-date strings as local-time calendar dates.
   - `proposal.institution` was hardcoded null in render-emails; now reads `akoya_request.wmkf_organizationname` (trimmed). Also threaded through reviewers GET so the proposal-detail header shows institution.
   - Trailing-space data quality issue on `wmkf_organizationname` masked by `.trim()` at projection time.

### External dependencies tracked, not blocking

- **Contact promotion AppendTo permission** (`docs/PENDING_ADMIN_REQUESTS.md` §4, `project_contact_promotion_permission.md`). The integration App User (`# WMK: Research Review App Suite`) can create a CRM contact but lacks `AppendTo` privilege on Contact at BusinessUnitLevel — so `setContactLink` 403s. Today: orphan contacts are created in CRM but the link from `wmkf_potentialreviewer` to contact stays null. Failure is wrapped in try/catch; emails ship and lifecycle updates fire normally. After admin grants the privilege, no code change needed — next send retries naturally and find-by-email reuses any orphan contacts created during the gap.
- **External reviewer file access** (`project_external_reviewer_file_access.md`). Proposal share URLs throw "expired link" errors for non-authenticated reviewers; review uploads still land in Vercel Blob instead of SharePoint. These are one architectural problem — how to expose Foundation-controlled documents to external parties without authentication. Needs Connor consult on a staging/library permission model before either piece of work proceeds.

### Commits

- `a4961db` — Workstream 3: backfill 333 Postgres reviewer_suggestions to Dataverse
- `ef233a0` — Workstream 2: full Review Manager Dataverse migration
- `ada645d` — Review Manager validation fixes

## Potential next steps

### 1. Drop Postgres dual-write from save-candidates.js (do first; small, unblocks #2)

`pages/api/reviewer-finder/save-candidates.js` still writes to Postgres (lines ~108-282) and then dual-writes to Dataverse (lines ~285-340). The Dataverse write is the source of truth now — Review Manager and My Candidates both read only from Dataverse. The Postgres write serves no consumer.

Steps:
1. Remove the entire Postgres block — keep only the `requestId`-gated Dataverse path.
2. Drop the `requireAppAccess` `userProfileId`-gated grant_cycle_id / user_profile_id fallback (those were Postgres-only).
3. Update `lib/services/database-service.js` calls (`addKeywordWithRelevance` for Postgres researcher_keywords) — keep or drop? Today they preserve expertise tags in Postgres for nothing. Drop.
4. Run a smoke save through the picker; verify save lands only in Dataverse and the UI flow stays clean.
5. Verify build, commit, push.

Effort: 30 min. Low risk — read paths are already proven Dataverse-only.

### 2. Drop legacy "create cycle and assign all unassigned" UI flow

`pages/reviewer-finder.js` has a flow that creates a Postgres `grant_cycles` row and bulk-assigns all unassigned `reviewer_suggestions` to it. With the picker baking cycle codes at save time, this is moot. Audit and remove.

Effort: 30-45 min depending on how entangled the UI is.

### 3. Archive Postgres reviewer tables (do this in a dedicated session)

After #1 and #2 land and a few days pass with no Postgres writes:
- Snapshot `reviewer_suggestions`, `researchers`, `grant_cycles`, `proposal_searches`, `researcher_keywords`, `researcher_publications` to a backup table or pg_dump file.
- Drop the original tables.
- Remove or guard scripts that reference them (`debug-reviewer-finder.js`, `cleanup-database.js`, etc.).

Don't combine with #1/#2 — needs its own dedicated context for safety.

### 4. (External) Wait for Contact AppendTo grant

Once `# WMK: Research Review App Suite` gets `AppendTo` on Contact at BU level, the next send-emails call will populate `_wmkf_contact_value` automatically. Verify with the snippet in `docs/PENDING_ADMIN_REQUESTS.md` §4.

### 5. (External) Connor consult — external reviewer file access

Needed before:
- Migrating `upload-review` from Vercel Blob to SharePoint
- Replacing the proposal-URL share mechanism

Out of scope until that conversation happens.

### 6. (Independent) Post-May-1 D26 readiness check

Phase I opens 2026-05-01. Once D26 starts moving:
- Confirm `akoya_requeststatus = 'Phase II Pending'` is the actual value on real new D26 rows.
- Confirm `wmkf_phaseiistatus IS NULL` correlates with "no reviews yet."
- Watch for proposals where the picker shows 0 invited even though staff assigned reviewers via the legacy 5-slot pattern.

## Key files reference

| File | Status | Purpose |
|---|---|---|
| `scripts/backfill-postgres-to-dataverse.js` | new (`a4961db`) | One-shot Postgres → Dataverse migration with dry-run mode |
| `lib/dataverse/adapters/contact.js` | new (`ef233a0`) | findByEmail / findOrCreateByEmail; used by send-emails for contact promotion |
| `lib/dataverse/adapters/reviewer-suggestion.js` | extended | `findAcceptedByPD`, picklist string→Edm.Int32 translation, `reminderCount` mapping, `wmkf_organizationname` projection |
| `lib/dataverse/adapters/potential-reviewer.js` | extended | `wmkf_areaofexpertise` 100-char clamp |
| `lib/dataverse/adapters/researcher.js` | unchanged this session | (touched only for `.js` import compat) |
| `pages/api/review-manager/reviewers.js` | rewrite (`ef233a0`) | Dataverse-backed GET + PATCH, picklist code → string translation on read |
| `pages/api/review-manager/send-emails.js` | rewrite (`ef233a0`) | Dataverse recipient pull + contact promotion + lifecycle via updateLifecycle |
| `pages/api/review-manager/upload-review.js` | rewrite (`ef233a0`) | Blob upload + Dataverse lifecycle write |
| `pages/api/review-manager/render-emails.js` | rewrite (`ef233a0`, `ada645d`) | Dataverse recipient + proposal data; institution from `wmkf_organizationname` |
| `pages/review-manager.js` | UI sweep (`ef233a0`, `ada645d`) | `selectedCycleCode`, GUID `suggestionId`, per-template attachments, onRefresh fix |
| `lib/utils/email-generator.js` | bug fix (`ada645d`) | YYYY-MM-DD parsed as local time, not UTC midnight |
| `docs/PENDING_ADMIN_REQUESTS.md` | extended | New §4 on Contact AppendTo |
| `scripts/smoke-review-manager.js` | new (`ef233a0`) | Direct-Dataverse smoke for findAcceptedByPD |

## Hand-off notes

- **Postgres is now genuinely stale** for reviewer_suggestions lifecycle. Today's PATCHes (status changes, notes, materials_sent, review_received, complete) only landed in Dataverse. The dual-write in save-candidates is the last tether and is dropping next session.
- **"Last action" timestamps are event-driven**, not state-driven. Manual status flips via the dropdown intentionally do NOT stamp `materialsSentAt` / `reviewReceivedAt` / etc. Only the actual workflow actions (send email, upload file, mark complete) touch those fields. Confirmed with Justin this is the correct behavior — preserves audit clarity over "we sent X at time T" vs "I clicked the dropdown at time T".
- **`bypassRestrictions('<endpoint>')` is mandatory** at handler entry on every Dataverse-touching endpoint — DynamicsService fails closed otherwise. Forgetting this returns "Restrictions not initialized" silently the first time, then accidentally works on subsequent calls within the same dev process.
- **Picklist optionset values** are now translated in two places: (1) `reviewer-suggestion` adapter `updateLifecycle` translates string → int on write; (2) `pages/api/review-manager/reviewers.js` translates int → string on read for the UI. Don't drift these maps.
- **Per-template email attachments** are stored as `{ materials: [...], followup: [...], thankyou: [...] }` in localStorage key `review_manager_attachments`. Legacy flat-array values load as the materials bucket (backward-compat). Defensive `Array.isArray` guard at the read site prevents the Turbopack-state-restoration bug we hit during validation.
- **Test request:** `54e2b88b-04b9-f011-bbd3-6045bd02b4cc` (Quantum Chimera, J26). The Justin Gallivan Test reviewer row on this proposal is the safe send target — email lands in justingallivan@me.com.
- **Restart dev server** (`pkill -f "next dev" && rm -rf .next && npm run dev`) when Turbopack hot-reload state preservation breaks weird useState shape changes — we hit this once during validation when changing `useState([])` to `useState({...})`.

## Memory updates this session

- `project_contact_promotion_permission.md` (new) — AppendTo permission gap, what it blocks, what it doesn't, no code change needed once granted
- `project_external_reviewer_file_access.md` (new) — proposal URL + review upload as one design problem; Connor consult required

## Testing

```bash
# Backend smoke (no auth):
node scripts/smoke-my-candidates.js jgallivan@wmkeck.org J26
node scripts/smoke-review-manager.js jgallivan@wmkeck.org J26
node scripts/smoke-suggestions-by-request.js 54e2b88b-04b9-f011-bbd3-6045bd02b4cc

# Backfill is idempotent — safe to re-run with --dry-run any time to spot-check
# parity, but DO NOT re-run live: today's PATCHes happened in Dataverse only,
# so a live re-run would push stale Postgres data over the new Dataverse state.
node scripts/backfill-postgres-to-dataverse.js --dry-run

# Browser (real auth) — full Review Manager flow:
npm run dev
# Sign in. /review-manager → pick J26 cycle → click into Quantum Chimera →
# verify reviewers list, edit a note, change a status. Open the email modal,
# pick Materials, render preview, send to Justin Gallivan Test row only.
# Then upload a small PDF as a review for the same row, then send Thank-you.

# Build check:
npx next build
```
