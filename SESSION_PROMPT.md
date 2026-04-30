# Session 117 Prompt: save-candidates Dataverse cutover + post-May-1 D26 validation

## Session 116 Summary

Built the **Wave 2 adapter trio**, then pivoted (with Justin) to a much bigger architectural shift: the Reviewer Finder entry path is moving from PDF-upload to a Dataverse-native picker driven by program-director assignment. End-to-end: backend resolver, status filter, SharePoint fetch endpoint, picker UI in `NewSearchTab`. Browser-validated as Justin in real auth. The save-candidates Postgres → Dataverse cutover is queued for next session — adapters are ready, picker now provides the `akoya_requestid`, just need to thread it through.

### What was completed

1. **Wave 2 adapter trio (`2627a03`).** Three thin Dataverse adapters: `potential-reviewer.js` (upsert by email alt-key, fill-empty merge), `researcher.js` (1:1 bibliometric sidecar; metrics overwrite, other fields fill-empty), `reviewer-suggestion.js` (lifecycle ledger, upsert by potentialreviewer+request alt-key). All three use `DynamicsService.queryRecords/.createRecord/.updateRecord`. Latent bug fix: `queryRecords` returns `{ records, ... }` not a flat array — adapters were indexing `[0]` on the wrapper, caught before any wired calls.

2. **PD-filtered proposal picker — backend (`a83a240`).** Three new files form the foundation:
   - `lib/services/program-director-resolver.js` — `azureEmail → systemuser.systemuserid`, cached 10 min (1 min on miss).
   - `lib/utils/cycle-code.js` — meeting-date ↔ cycle code (`Jxx`/`Dxx`) helpers + OData filter-range builder. Validated: `2026-06-04 → J26`, etc.
   - `pages/api/reviewer-finder/my-proposals.js` — GET endpoint. No `cycleCode` → distinct cycle codes the PD has work in. With `cycleCode` → proposals in that cycle.
   - `scripts/smoke-my-proposals.js` — direct-Dynamics smoke (no auth). Validated: Justin → systemuser `29b0de0d-…`, 15 cycles in history, 99 J26 proposals, 49 D26 proposals.

3. **Actionable status filter (`800d92f`).** Default mode shows only proposals that need reviewers found: `akoya_requeststatus = 'Phase II Pending' AND wmkf_phaseiistatus IS NULL`. A Phase II picklist value (Recommended/Not Recommended) means reviews came back and the post-review disposition is set — reviewer-finding is done. `?status=all` widens to every Phase II Pending in the cycle (for revisiting prior work). Concepts and Phase I-declined always excluded. Validated against J26: actionable returned 0 (all 6 reviewed); all returned the 6 Phase II Pending.

4. **SharePoint → Blob proposal loader (`f955b21`).** `pages/api/reviewer-finder/load-proposal.js` takes an `akoya_requestid`, walks all plausible SharePoint buckets (active + 3 archives via `lib/utils/sharepoint-buckets.js`), classifies files using Grant Reporting's `classifyFile`, picks the proposal best-guess (Project Narrative > Phase II > anything classified proposal), downloads via `GraphService.downloadFileByPath`, uploads to Vercel Blob, returns the blob URL. Smoke-tested file listing against request 1002379: 22 files including the canonical `Phase II/Project Narrative.pdf`.

5. **Picker UI in NewSearchTab (`e90082d`).** Added `ProposalPickerCard` component to `pages/reviewer-finder.js`. Mode toggle "From My Proposals" (default) / "Upload PDF" (legacy) lives above the file uploader. Picker auto-selects newest cycle, has a "Show completed too" toggle, lists proposals with PI/applicant/program/meeting-date/reviewer-counts. On pick, calls `load-proposal`, then feeds the returned blob URL into the existing `handleFilesUploaded` so analyze/discover work unchanged. Confirmation banner shows loaded filename + request number; "Clear" lets the user pick another. Build clean.

6. **Picker label polish (`8d3d8c0`, `9333c86`).** Justin caught two issues live:
   - `5/5 slots filled` was misleading — we need 3 confirmed reviewers, not 5; the 5 slots are over-invite buffer for declines. Changed to `N invited`.
   - Better: surface accepted/declined counts from Postgres `reviewer_suggestions` (the existing source of truth from Reviewer Manager). Final display: `5 invited · 2 accepted · 1 declined · goal: 3` (parts elided when 0). Falls back to slot population if no Postgres rows exist (legacy proposals).

7. **Browser validation in real auth.** Hit a Next 16 + Turbopack issue: `pages/api/auth/[...nextauth].js` catch-all wasn't being served (every NextAuth route → 404). Fixed by stopping dev, removing `.next/`, restarting. Justin successfully signed in and clicked through the picker.

### Commits

- `2627a03` — Wave 2 adapters: potential-reviewer / researcher / reviewer-suggestion
- `a83a240` — PD-filtered proposal picker: resolver, cycle-code helpers, my-proposals API
- `800d92f` — my-proposals: actionable filter (Phase II Pending + no disposition)
- `f955b21` — Add /api/reviewer-finder/load-proposal — fetch proposal from SharePoint to Blob
- `e90082d` — Reviewer Finder UI: 'From My Proposals' picker as default entry path
- `8d3d8c0` — Picker: 'N invited' instead of 'N/5 slots filled'
- `9333c86` — Picker: show invited/accepted/declined counts (postgres-backed)

## Potential next steps

### 1. save-candidates Dataverse cutover (the original session 115 ask, still queued)

The picker now provides `sourceProposal.requestId` on the loaded file object. Thread it through:
- Pass `requestId` from `uploadedFiles[0].sourceProposal.requestId` into the save-candidates POST body.
- Update `pages/api/reviewer-finder/save-candidates.js` to use the wave-2 adapters when a `requestId` is present:
  1. `potentialReviewer = await upsertByEmail({ name, email, affiliation, expertise, whyChosen })`
  2. `researcher = await upsertByPotentialReviewer(potentialReviewer.id, { hIndex, totalCitations, orcid, ... })`
  3. `suggestion = await upsert({ potentialReviewerId, requestId, relevanceScore, matchReason, sources, programArea, suggestionLabel })`
- Decide on dual-write vs. cutover. Per Wave 2 policy memory: Dataverse-only writes; Postgres archives in place. But `my-candidates` (read) is still Postgres-backed, so until that flips, dual-writing keeps the Reviewer Manager UI working. Recommend: dual-write through this transition, repoint `my-candidates` next.
- Smoke test against a real D26 proposal once one reaches Phase II Pending (post May 1).

### 2. Post-May-1 D26 validation

Phase I submissions open May 1 (in 2 days from session 116). Once D26 starts moving:
- Confirm `akoya_requeststatus = 'Phase II Pending'` is the actual value (not "Phase II Submitted" or similar) on real new D26 rows.
- Confirm `wmkf_phaseiistatus IS NULL` is right for "no reviews yet" — that's a correlation observation from J26's done state, not a formal contract.
- Watch for proposals where the picker would show 0 invited even though staff has assigned reviewers via the 5-slot pattern (legacy users not using our tool yet).

### 3. my-candidates read-side migration

Once writes are flowing into Dataverse, repoint `pages/api/reviewer-finder/my-candidates.js` at the new tables. Joins via potentialreviewer for person info + researcher for bibliometrics. Postgres becomes archive-only.

### 4. Backfill Postgres → Dataverse (low priority)

333 rows in `reviewer_suggestions`. One-shot migration. Save-candidates already cuts new writes over so this is for historical visibility, not blocking.

### 5. Promotion path — potentialreviewer → contact

Per Connor: at first invitation, the potential-reviewer row should be promoted to a CRM `contact`. `setContactLink(potentialReviewerId, contactId)` is already in the adapter; needs to be hooked into Reviewer Manager's send-emails flow. Probably also wants a "find or create contact by email" step before the link.

## Key files reference

| File | Status | Purpose |
|---|---|---|
| `lib/dataverse/adapters/potential-reviewer.js` | new (`2627a03`) | Connor's lead/person table — upsert by email |
| `lib/dataverse/adapters/researcher.js` | new (`2627a03`) | Bibliometric sidecar, 1:1 with potentialreviewer |
| `lib/dataverse/adapters/reviewer-suggestion.js` | new (`2627a03`) | Lifecycle ledger, upsert by (potentialreviewer, request) |
| `lib/services/program-director-resolver.js` | new (`a83a240`) | azureEmail → systemuserid, cached |
| `lib/utils/cycle-code.js` | new (`a83a240`) | Meeting-date ↔ Jxx/Dxx + OData filter range |
| `pages/api/reviewer-finder/my-proposals.js` | new (`a83a240`, `800d92f`, `9333c86`) | GET cycles or proposals; default actionable filter; postgres counts |
| `pages/api/reviewer-finder/load-proposal.js` | new (`f955b21`) | SharePoint → Blob fetch by requestId |
| `pages/reviewer-finder.js` | modified (`e90082d`, `8d3d8c0`, `9333c86`) | ProposalPickerCard + entry-mode toggle in NewSearchTab |
| `scripts/smoke-my-proposals.js` | new (`a83a240`) | Direct-Dynamics smoke test (no auth) |

## Hand-off notes

- **Test reviewer state (still applies from session 114).** Suggestion 914 (`Justin Gallivan Test`, justingallivan@me.com) on request 1002379 has the full lifecycle populated. Don't be surprised by it.
- **`.env.local` is in real-auth mode.** Browser sign-in works. To go back to dev-bypass, set `AUTH_REQUIRED=false`.
- **Next 16 + Turbopack + NextAuth catch-all gotcha.** If `/api/auth/csrf` etc. start returning 404, stop dev, `rm -rf .next`, restart. The `[...nextauth].js` route occasionally fails to compile after extended dev sessions.
- **`fetchReviewerCounts` in my-proposals scopes by `selected = true` only, not by user.** Two PDs collaborating on the same request would see merged counts; acceptable today since each request has one lead PD per the schema.
- **Pre-J26 historical proposals will show partial data.** Picker falls back to slot population when no Postgres rows exist — see `project_reviewer_history_data_quality.md` memory.
- **Adapter wiring caveat:** the load-proposal endpoint passes `sourceProposal.requestId` through to the loaded file object on the client. The save-candidates handler needs an explicit code path to read it from the request body — UI doesn't currently include it. That's the first wiring step.

## Memory updates this session

- `project_reviewer_finder_dataverse_entry_path.md` (NEW) — strategic direction for replacing the PDF entry path.
- `project_akoya_request_pd_fields.md` (NEW) — `wmkf_programdirector` is the lead PD field; `ownerid` is the integration service account, not the PD.
- `project_grant_phasing_evolution.md` (NEW) — reviewer-finding only at Phase II; concepts going away; next cycle's one-package model with internal Phase I/II labels.
- `project_reviewer_count_invariant.md` (NEW) — 3 confirmed reviewers per proposal; the 5 slots are over-invite buffer.
- `project_reviewer_history_data_quality.md` (NEW) — pre-J26 proposals have no Postgres rows; zeros aren't "0 invited", they're "unknown."

## Testing

```bash
# Backend smoke (no auth):
node scripts/smoke-my-proposals.js                          # cycles list
node scripts/smoke-my-proposals.js jgallivan@wmkeck.org J26 # actionable in J26
node scripts/smoke-my-proposals.js jgallivan@wmkeck.org J26 all  # all in J26

# Browser (real auth):
npm run dev                              # auth on; if NextAuth 404s, rm -rf .next first
# Sign in as a Dynamics user, navigate to /reviewer-finder.
# Default tab "From My Proposals" should auto-select most recent cycle and
# show actionable proposals (or empty state). Toggle "Show completed too"
# to see all Phase II Pending. "Use this proposal" loads the Project
# Narrative from SharePoint via blob and feeds the existing analyze flow.

# Build check:
npx next build
```
