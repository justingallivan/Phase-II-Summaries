# Session 118 Prompt: Reviewer Finder Dataverse cutover — Workstream 3 (backfill) → 2 (Review Manager)

## Session 117 Summary

Two big surfaces of Reviewer Finder are now Dataverse-backed end-to-end. **Save-candidates dual-writes** to all three Wave 2 tables; **My Candidates** reads, edits, and soft-deletes go through Dataverse only. Postgres still receives saves (dual-write) but is functionally archive-only for the Reviewer Finder UI. Validated against real auth in browser using request `54e2b88b…` (Quantum Chimera, J26).

### What was completed

1. **save-candidates dual-write (`b440173`).** Postgres save unchanged; appended a per-candidate Dataverse write block that runs after `savedCount++`. Each candidate flows through `potentialReviewer.upsertByEmail` → `researcher.upsertByPotentialReviewer` → `reviewerSuggestion.upsert`. Per-candidate try/catch — Dataverse failures log to console and surface under `response.dataverse.errors` but never fail the Postgres-backed save. UI now passes `requestId` + `grantCycleCode` from `uploadedFiles[0].sourceProposal` so the Dataverse write knows which request to link.

2. **Validation fixes (`9215d03`).** Three issues uncovered while exercising the dual-write end-to-end:
   - `claude-reviewer-service.js` had `const { logUsage } = require('../utils/usage-logger')`. Under Next 16 + Turbopack, that interop returns `undefined` for ESM modules with only named exports (no default). Converted the whole file to ESM (`import`/`export`); updated the two callers (`analyze.js`, `discover.js`) to import at the top instead of inline `require()`.
   - `DynamicsService` fails closed when `activeRestrictions === null`. Earlier saves accidentally worked because some other call had set state on the same dev process. Added explicit `DynamicsService.bypassRestrictions('save-candidates')` at handler entry.
   - `wmkf_potentialreviewers.wmkf_organizationname` is capped at 100 chars by Dynamics. Czechtizky's full affiliation exceeded it. Added a defensive clamp in the `potential-reviewer` adapter (researcher's `wmkf_primaryaffiliation` is uncapped, so the full string still lands there).

3. **my-candidates full Dataverse cutover (`f66cdad`).** GET, PATCH, DELETE all rewritten. Default scope: suggestions on requests where the authenticated user is lead PD (resolved via `program-director-resolver` from `session.user.azureEmail`). Overrides: `?requestId=<guid>` / `?requestNumber=<num>` for collaborator lookup (bypasses PD filter — matches the "all org-visible, dashboards filter" pattern), `?cycleCode=Jxx` to narrow within scope. `mode=proposals` returns the distinct request list for picker modals. PATCH routes to suggestion / potentialreviewer / researcher adapters depending on field; PI / institution edits intentionally rejected with 400 (those belong on `akoya_request`). DELETE soft-flips `wmkf_selected = false`.
   - Adapter extensions: `reviewer-suggestion.{findById, findByRequest, findByPD, updateLifecycle, softDelete, bulkUpdateByRequest}`; `potential-reviewer.update`; `researcher.updateById` (auto-touches `wmkf_lastchecked`; advances `wmkf_metricsupdatedat` only when a metric field is in the payload).
   - Cycle helper added: `cycleCodeToLabel('J26') → 'June 2026'`.
   - Field correction: proposal title is `akoya_title`, not the assumed `akoya_name`.
   - `summaryBlobUrl` dropped from response — that was a Postgres-only save-time artifact; SharePoint is the source of truth for proposal PDFs in the Dataverse world.

4. **Pagination fix (`992126c`).** Initial my-candidates UI was empty in real auth despite smoke success. Cause: `findByPD`'s `akoya_request` query used `queryRecords` with implicit 500-row cap; an active PD has hundreds of historical requests, the test request fell outside the first 500. Switched to `queryAllRecords` (paginated). After the fix: 4 candidates appear; PATCH (notes/invited) and DELETE both confirmed end-to-end against Dataverse.

5. **Architecture doc for Connor (`b440173`).** `docs/REVIEWER_ARCHITECTURE.md` — three-table mental model (potentialreviewer / appresearcher / appreviewersuggestion), keys, lifecycle, slot-vs-suggestion duality.

6. **Cutover plan for remaining work (`cc5f710`).** `docs/REVIEWER_FINDER_DATAVERSE_CUTOVER_PLAN.md` — three workstreams left (contact promotion, full Review Manager migration, historical backfill) with implementation outlines, recommended order, and hand-off context.

### Commits

- `b440173` — save-candidates: dual-write to Dataverse via Wave 2 adapters (+ docs/REVIEWER_ARCHITECTURE.md)
- `9215d03` — save-candidates dual-write: ESM conversion, bypassRestrictions, org-name clamp + smoke scripts
- `f66cdad` — my-candidates: full Dataverse cutover (GET/PATCH/DELETE)
- `992126c` — my-candidates: paginate PD-scope query
- `cc5f710` — Document remaining Reviewer Finder Dataverse cutover work

## Potential next steps

Work order is defined in `docs/REVIEWER_FINDER_DATAVERSE_CUTOVER_PLAN.md`. Justin confirmed at session end: **3 → 2 → (1 folded into 2b)**.

### 1. Workstream 3 — Postgres → Dataverse historical backfill (do first)

333 rows in `reviewer_suggestions` from pre-picker usage. Build `scripts/backfill-postgres-to-dataverse.js` that runs each row through the same three-adapter chain `save-candidates` uses, with `request_number` → `akoya_request` GUID resolution and `grant_cycle_id` → `cycleCode` mapping. Idempotent (the `(potentialreviewer, request)` upsert handles re-runs). Dry-run mode first; report rows that can't be migrated (no request_number, etc.). Lifecycle state on the Postgres rows (`materials_sent_at`, `review_status`) preserved via `updateLifecycle` after upsert.

Why first: Workstream 2 flips Review Manager to Dataverse-only reads. Without the backfill, in-flight pre-picker reviews vanish from the UI.

Effort: half a session.

### 2. Workstream 2 — Full Review Manager Dataverse migration

Three endpoints + UI sweep. Expected ~1.5–2× the my-candidates work.

- **2a `/api/review-manager/reviewers`** (read + status PATCH): same shape as my-candidates, scoped to suggestions where `wmkf_accepted = true`. Adapter addition: `findAcceptedByPD`. PATCH writes through `updateLifecycle` (most fields already mapped — verify parity for `proposal_password`, `proposal_url`, `review_blob_url`, `review_filename`).
- **2b `/api/review-manager/send-emails`**: pull recipient data from Dataverse, lifecycle timestamps via `updateLifecycle`. **Fold contact promotion in here** (Workstream 1) — after a successful send, find-or-create `contact` by email, then `potentialReviewer.setContactLink`. Need new `lib/dataverse/adapters/contact.js`. Type guard at line 90 (`typeof d.suggestionId !== 'number'`) needs relaxing — IDs are GUIDs now.
- **2c `/api/review-manager/upload-review`**: Vercel Blob upload unchanged; status fields go through `updateLifecycle`.
- **2d `/api/review-manager/render-emails`**: preview-only, pull templates from Dataverse for parity with send.
- **2e UI sweep** in `pages/review-manager.js`: `suggestionId` becomes a GUID; remove any int-coerce logic; replace `grant_cycle_id` (numeric FK) with `grantCycleCode` (string).

Effort: 1.5–2 sessions.

### 3. Cleanup once 2 + 3 are done

- Drop the dual-write block from `save-candidates.js` — write Dataverse only.
- Drop `cycleId` (numeric) and `userProfileId` query params from UI calls.
- Archive or drop Postgres tables: `reviewer_suggestions`, `researchers`, `grant_cycles`, `proposal_searches`, `researcher_keywords`, `researcher_publications`. Keep a snapshot.
- Remove the legacy "create cycle and assign all unassigned" UI flow (moot — picker bakes cycles at save time).

### 4. Post-May-1 D26 readiness check (independent)

Phase I opens 2026-05-01. Once D26 starts moving:
- Confirm `akoya_requeststatus = 'Phase II Pending'` is the actual value on real new D26 rows.
- Confirm `wmkf_phaseiistatus IS NULL` correlates with "no reviews yet."
- Watch for proposals where the picker shows 0 invited even though staff assigned reviewers via the legacy 5-slot pattern.

## Key files reference

| File | Status | Purpose |
|---|---|---|
| `pages/api/reviewer-finder/save-candidates.js` | modified (`b440173`, `9215d03`) | Dual-write Postgres + Dataverse on save |
| `pages/api/reviewer-finder/my-candidates.js` | rewrite (`f66cdad`, `992126c`) | Dataverse-backed GET/PATCH/DELETE; PD-scope default + collaborator overrides |
| `lib/dataverse/adapters/reviewer-suggestion.js` | extended (`f66cdad`, `992126c`) | Find/update/softDelete/bulk + paginated PD scope |
| `lib/dataverse/adapters/potential-reviewer.js` | extended (`9215d03`, `f66cdad`) | `update` for staff edits + 100-char org-name clamp |
| `lib/dataverse/adapters/researcher.js` | extended (`f66cdad`) | `updateById` with metric-aware timestamp logic |
| `lib/utils/cycle-code.js` | extended (`f66cdad`) | `cycleCodeToLabel('J26') → 'June 2026'` |
| `lib/services/claude-reviewer-service.js` | ESM-converted (`9215d03`) | All `require()` → `import` to fix Turbopack interop |
| `pages/api/reviewer-finder/{analyze,discover}.js` | modified (`9215d03`) | Top-level import of ClaudeReviewerService |
| `docs/REVIEWER_ARCHITECTURE.md` | new (`b440173`) | 3-table mental model for Connor |
| `docs/REVIEWER_FINDER_DATAVERSE_CUTOVER_PLAN.md` | new (`cc5f710`) | Workstreams 1/2/3 with implementation outlines + hand-off context |
| `scripts/smoke-{recent-suggestions,suggestions-by-request,find-by-name,my-candidates}.js` | new (`9215d03`, `f66cdad`) | Direct-Dataverse smoke helpers (no auth) |

## Hand-off notes

- **`bypassRestrictions('<endpoint>')` is mandatory** at handler entry whenever the handler will hit Dataverse. Forgetting this returns "Restrictions not initialized — cannot execute query" silently the first time, then accidentally works on subsequent calls within the same dev process. High-value gotcha.
- **Field name corrections** baked in this session: proposal title is `akoya_title` (not `akoya_name`); request number is `akoya_requestnum` (not `akoya_requestnumber`).
- **`wmkf_organizationname` cap = 100 chars**, server-enforced. The `clamp` helper in `potential-reviewer.js` truncates with ellipsis. Add other field caps to that map only as we hit them; don't speculate.
- **`access.session?.user?.azureEmail`** is the canonical email accessor (NOT `access.session?.user?.email`). NextAuth populates both in some shapes but the codebase standardizes on `azureEmail`.
- **`findByPD` always uses `queryAllRecords`**, not `queryRecords` with `top:`. Active PDs exceed 500 historical requests; the cap drops requests silently and surfaces as empty-UI bugs that look like auth or session issues.
- **Test request:** `54e2b88b-04b9-f011-bbd3-6045bd02b4cc` (Quantum Chimera, J26) has 4 saved suggestions with full bibliometric chain. Use this for any future smoke before broadening to D26.
- **`.env.local` is in real-auth mode.** If NextAuth catch-all 404s, stop dev → `rm -rf .next` → restart. Same fix applies to "weird minified errors" caused by running `npx next build` against an active dev server (corrupts `.next/`).
- **Next 16 + Turbopack CJS-requires-ESM is unreliable.** Whenever you see `<x> is not a function` for a known-good import, suspect this. Conversion to top-level ESM `import` is the durable fix.

## Memory updates this session

No new memory files. Existing memories about the Reviewer Finder Dataverse entry path, akoya_request PD fields, reviewer count invariant, and reviewer history data quality continue to apply.

## Testing

```bash
# Backend smoke (no auth):
node scripts/smoke-my-candidates.js jgallivan@wmkeck.org J26      # PD-scoped J26
node scripts/smoke-suggestions-by-request.js 54e2b88b-04b9-f011-bbd3-6045bd02b4cc
node scripts/smoke-find-by-name.js Coley                          # name lookup across 3 tables
node scripts/smoke-recent-suggestions.js 5                        # most recent saves

# Browser (real auth) — picker → analyze → save → My Candidates → edit → delete:
npm run dev                    # if NextAuth 404s, rm -rf .next first
# Sign in. /reviewer-finder → "From My Proposals" → pick J26 proposal →
# analyze → discover → save 2-3 candidates. Switch to My Candidates tab.
# Edit a note, toggle invited, delete one. Refresh. Verify persisted state.

# Build check:
npx next build
```
