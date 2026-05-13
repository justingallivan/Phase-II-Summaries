# Session 148 Prompt: open

## Session 147 summary

Twenty-four commits on main. Three independent workstreams shipped:
**Wave 2 W5 reader cutover closed + W6 step 1 (researchers.js retirement)**,
**IRS tax-exempt verification capability** (PA-callable, quarterly cron),
and **Gemini-suggestions refactor** of `pages/phase-ii-writeup.js`
(executed by Claude after Codex dispatch failed twice). Plus an
intake-portal meeting agenda for the 2026-05-13 Sarah+Connor sync.

### What was completed

1. **Wave 2 W5 closeout** (`29ae474`, `04d891c`, `52c1aa2`, `0dfcf73`)
   - W5 step 3 followup: Co-PI derivation + summary-URL writer gap fixes.
   - W5 step 4: `my-proposals.js` cut from Postgres `reviewer_suggestions`
     aggregation to Dataverse via `queryAllRecords` (not `queryRecords` —
     silent 100-row cap). Adapter exports `RESPONSE_TYPE_MAP` to single-
     source picklist values.
   - W5 step 5: Deleted `pages/api/reviewer-finder/extract-summary.js`
     (Dataverse-side already does this).
   - W5 step 6: `maintenance-service.cleanupBlobs` reads from Dataverse
     (`wmkf_appgrantcycles`, `wmkf_appreviewersuggestions`) +
     `intake_drafts.attachments[*].blob_url`. Fails closed on `capped`.

2. **Wave 2 W6 step 1 — researchers.js retirement** (`27931b9`)
   - Deleted `pages/api/reviewer-finder/researchers.js` (1061 lines).
   - Excised 4 functions from `pages/reviewer-finder.js`
     (ResearcherDetailModal, DatabaseTab, DuplicatesModal,
     ResearcherRow), navigation state, tabs entry. ~1500 lines removed.
   - Total drop across step 1: ~2,692 lines.
   - Step 2 (cleanup cron + restore script) **deferred to post-pilot**
     per Codex's Wave 1 same-day DROP precedent argument (`cea4c27`).
     Trigger memory: `project_w6_table_drop_pending.md` (fires ≥ 2026-07-01).

3. **IRS BMF tax-exempt verification** (`2ad2528`, `f5d421f`, `2bb1820`,
   `b192087`, `7d45418`, `9573ff9`, `3b2450e`)
   - New Postgres table `irs_exempt_orgs` (V29) keyed on EIN. 1.26M rows
     live from 4 regional BMF CSVs (NE/MA/SO/IN).
   - New `lib/services/irs-bmf-service.js`: atomic-swap quarterly refresh
     (stage → COPY FROM STDIN → dedupe via ROW_NUMBER over PARTITION BY
     ein ORDER BY region, ctid → ADD PK → rename). `verifyEin()` returns
     `{found, name, subsection, status, deductibility, foundation,
     rulingDate, state, is501c3PublicCharity, asOfRefreshDate}`.
   - New `/api/cron/refresh-irs-bmf` (quarterly `0 6 15 1,4,7,10 *`,
     `maxDuration: 300`).
   - New `/api/irs/verify-ein` (PA-callable, shared-secret
     `IRS_VERIFY_SECRET` via `crypto.timingSafeEqual` wrapper).
   - CLI runner `scripts/import-irs-bmf.js` (`--commit`, `--strict`).
   - Atlas page `docs/atlas/postgres-irs-exempt-orgs.md` —
     reference-data, NOT Wave 2 eligible.
   - Codex review applied: NAME validation, deterministic region
     dedupe, full stats on errors, plausibility threshold rebased to
     1M (actual ~1.26M; old anchor 1.95M was stale IRS-page figure).
   - **Pending**: PA wiring (Connor) — `account` writeback target +
     `IRS_VERIFY_SECRET` secret share + flow design.

4. **Gemini-suggestions refactor** (`fd07318`, `ec87253`, `680c9a5`,
   `6e6204c`, `efeaceb`, `49d9905`) — Claude-executed after two
   Codex dispatch failures (dirty tree, then sandbox bash issue).
   - Phase 1: `shared/utils/app-markdown.js` (marked v12 + DOMPurify
     with `uponSanitizeAttribute` hook enforcing http(s)/mailto on
     href + Tailwind class allowlist). 23 Jest cases.
   - Phase 2: `shared/utils/sse-stream.js` (async-iterator parser
     with AbortSignal; CRLF-aware; per-line comment skip; `[DONE]`
     sentinel). 13 Jest cases. `phase-ii-writeup` QA stream cut over.
   - Phase 3: Extracted `Phase2{QA,Feedback,WordExport}Modal.js`.
     `phase-ii-writeup.js` 879 → 597 lines.
   - Phase 4: `database-service.js` top docstring rewrite + tightened
     removed-methods block (comments only, no SQL).
   - Codex post-pass review: 8 MODERATE, 6 fixed (URL-scheme widening,
     class injection vector, trust-model docs, SSE CRLF + comment edge
     cases, DatabaseService docstring completeness, QA source-link
     scheme validation). 2 documented (Phase 2 consumer-throw contract,
     handoff-report overclaims).
   - **Known gap**: dev-server visual smoke not performed — Babel parse
     + 36 Jest tests + CI gates green, but parity not visually verified.

5. **Intake portal meeting agenda** (`23e3fd9`)
   - `docs/INTAKE_PORTAL_MEETING_AGENDA_2026-05-13.md` — 60-90 min,
     3 tracks (Connor: Wave 2/intake schema; Sarah: form wishlist;
     joint: pilot scope). Tracked to git for cross-machine access;
     cleanup trigger memory `project_intake_meeting_agenda_cleanup.md`
     (fires ≥ 2026-05-27).

6. **Memory housekeeping** (`61a5648`)
   - New: `project_w6_table_drop_pending.md`,
     `project_intake_meeting_agenda_cleanup.md`,
     `project_dataverse_schema_deploy_gotchas.md` (added gotcha #3).
   - Updated: `project_irs_exempt_verification.md` (planned → SHIPPED).

### Commits (this session)

```
49d9905 Gemini-plan review fixes — close 6 MODERATEs from Codex pass
efeaceb Handoff report — Gemini action plan, Claude-executed pass
6e6204c Phase 4 — DatabaseService comment cleanup
680c9a5 Phase 3 — extract Phase II modals
ec87253 Phase 2 — shared SSE stream parser + QA cutover
fd07318 Phase 1 — shared app-markdown renderer
3b2450e IRS BMF — address Codex review (2 MODERATE + 3 MINOR)
c181e9f Preserve Codex artifacts before relaunch
9573ff9 Loosen IRS BMF plausibility threshold + stats-on-error
7d45418 Add --strict / ?strict=1 to IRS BMF refresh
b192087 Dedupe IRS BMF cross-region duplicate EINs
2bb1820 Tolerate malformed rows in IRS BMF CSVs
f5d421f Bootstrap irs_exempt_orgs table inside refresh()
2ad2528 Add IRS tax-exempt verification (BMF reference data + verify endpoint)
61a5648 S147 memory housekeeping — index + new trigger entries
23e3fd9 Add intake portal meeting agenda for 2026-05-13
f35387f Revise Codex action plan — Gemini suggestions triage
cea4c27 W6 step 2 deferred — record decision + post-pilot checklist
27931b9 W6 step 1 — retire researchers.js + Database tab UI
0dfcf73 W5 step 6 — maintenance blob-scanner → Dataverse
52c1aa2 W5 step 5 — retire extract-summary.js
6a64f9a W5/W6 plan note — researchers.js Postgres reads are W6 scope
04d891c W5 step 4 — my-proposals reviewer-count reader → Dataverse
29ae474 W5 step 3 followup — Co-PI derivation + summary URL writer gap
```

## Production state

- **W5 reader cutover complete.** All Postgres `reviewer_suggestions`
  readers retired or migrated. `extract-summary.js` deleted.
  `researchers.js` deleted (W6 step 1). Database tab UI excised.
- **W6 step 2 (cleanup cron + restore) deferred to post-pilot.**
  Drain-only table drop checklist tracked in
  `REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md`. Trigger memory fires
  ≥ 2026-07-01.
- **IRS BMF table live in prod Postgres**, 1.26M rows. Verify endpoint
  + cron deployed. PA wiring pending Connor.
- **Gemini refactor merged** but not visually smoke-tested.
- CI gates: `check:atlas`, `check:atlas:self-test`,
  `check:api-routes` — all green. 80 API routes catalogued (post
  IRS additions and extract-summary removal).
- Route count in CLAUDE.md: 80.

## Where to pick up — Session 148 (open)

Ordered by readiness:

### A. Visual smoke of the Gemini refactor (~15 min, blocking)

`npm run dev`, click through on `/phase-ii-writeup`:
- Upload + process streaming (untouched but imports new modules).
- QA streaming: open Q&A modal → ask question → confirm markdown
  renders + sources show with target=_blank → close cancels cleanly.
- Feedback modal: open → submit → close.
- Word export modal: open → export → close.
Babel parse + 36 Jest tests + atlas/route gates passed — wiring is
intact, visual parity expected but not verified. See
`docs/CODEX_HANDOFF_REPORT_2026-05-12.md` §5 checklist.

### B. Post-meeting intake portal work

After the 2026-05-13 Sarah+Connor meeting, fold decisions into
`docs/INTAKE_PORTAL_DESIGN.md` + create build slices. Agenda at
`docs/INTAKE_PORTAL_MEETING_AGENDA_2026-05-13.md` (delete after
meeting per cleanup trigger memory; commit removal).

### C. Wave 2 W7 (reviewer history badges) or pause

W3–W6 of `REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md` are shipped.
W7 (history badges UI, match-on-discovery wiring) is post-pilot
critical-path-optional. Pause is acceptable until intake portal
direction settles.

### D. IRS verification PA wiring (Connor)

- Share `IRS_VERIFY_SECRET` with Connor (already in Vercel prod env).
- Connor builds PA flow: trigger on `account` create/update, call
  `GET /api/irs/verify-ein?ein={ein}` with header
  `x-irs-verify-secret: ...`, write result back to `account` fields.
- Verify endpoint API contract documented in
  `pages/api/irs/verify-ein.js` header.

### E. Gemini refactor follow-ups (low priority)

From `docs/CODEX_HANDOFF_REPORT_2026-05-12.md` §6:
1. `pages/dynamics-explorer.js:95` has its own regex `renderMarkdownText`
   — clean follow-up cutover to `shared/utils/app-markdown.js`.
2. Nine other pages with hand-rolled `reader.read()` SSE loops —
   candidates for the same SSE-parser cutover.
3. `useAIStream` hook design (parser proved out, hook deferred).
4. `useDataversePrefs()` dead-Postgres branch (out of Phase 4 scope).

### F. Smaller carry-forward items

- COI policy body wording (Stage 2a Reviewer engagement).
- Revert temp role elevations on prod app user (deferred through
  pilot iteration — see S146 carryover).

## Carryover hygiene

- **W6 step 2 trigger** (`project_w6_table_drop_pending.md`) fires
  ≥ 2026-07-01. When fired, run the 6-item checklist in
  `REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md` § "W6 step 2 (deferred)".
- **Meeting agenda cleanup** (`project_intake_meeting_agenda_cleanup.md`)
  fires ≥ 2026-05-27. Delete `docs/INTAKE_PORTAL_MEETING_AGENDA_*.md`
  + fold any persistent decisions into `INTAKE_PORTAL_DESIGN.md`.
- All destructive carryover items must be grep-verified per
  `feedback_verify_before_destructive_carryover` rule.

## Key files added/modified (S147)

| File | Status | Purpose |
|---|---|---|
| `lib/db/migrations/008_irs_exempt_orgs.sql` | NEW | IRS BMF reference table (V29) |
| `lib/services/irs-bmf-service.js` | NEW | Atomic-swap refresh + verifyEin |
| `pages/api/cron/refresh-irs-bmf.js` | NEW | Quarterly cron |
| `pages/api/irs/verify-ein.js` | NEW | PA-callable verify endpoint |
| `scripts/import-irs-bmf.js` | NEW | CLI runner |
| `shared/utils/app-markdown.js` | NEW | Marked v12 + DOMPurify shared renderer |
| `shared/utils/sse-stream.js` | NEW | Shared SSE parser w/ AbortSignal |
| `shared/components/Phase2{QA,Feedback,WordExport}Modal.js` | NEW | Extracted Phase II modals |
| `tests/unit/app-markdown.test.js` + `sse-stream.test.js` | NEW | 36 Jest cases |
| `pages/api/reviewer-finder/researchers.js` | DELETED | W6 step 1 |
| `pages/api/reviewer-finder/extract-summary.js` | DELETED | W5 step 5 |
| `pages/reviewer-finder.js` | MODIFIED | Database tab + 4 functions excised |
| `pages/phase-ii-writeup.js` | MODIFIED | 879 → 597 lines (modal extraction + SSE cutover) |
| `pages/api/reviewer-finder/my-proposals.js` | MODIFIED | Postgres → Dataverse via queryAllRecords |
| `lib/services/maintenance-service.js` | MODIFIED | cleanupBlobs → Dataverse |
| `lib/services/database-service.js` | MODIFIED | Phase 4 docstring cleanup |
| `middleware.js`, `vercel.json`, `CLAUDE.md` | MODIFIED | IRS endpoint allowlist + cron + env-var docs |
| `docs/atlas/postgres-irs-exempt-orgs.md` | NEW | Atlas reference-data page |
| `docs/CODEX_HANDOFF_REPORT_2026-05-12.md` | NEW | Gemini refactor handoff |
| `docs/INTAKE_PORTAL_MEETING_AGENDA_2026-05-13.md` | NEW | 60-90 min meeting agenda (delete post-meeting) |

## Testing

```bash
npm run check:atlas
npm run check:atlas:self-test
npm run check:api-routes
npx jest tests/unit/app-markdown.test.js tests/unit/sse-stream.test.js

# IRS refresh (dry run)
node scripts/import-irs-bmf.js --strict

# IRS verify (dev — no secret required)
curl 'http://localhost:3000/api/irs/verify-ein?ein=521693387'

# Gemini refactor — visual smoke (NOT yet performed)
npm run dev
# → /phase-ii-writeup → Q&A modal → feedback modal → Word export modal
```
