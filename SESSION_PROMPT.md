# Session 149 Prompt: Connor schema review + execute the unblocked slices

## Session 148 summary

Nine commits on `main`. Three workstreams:

1. **Visual smoke of the Gemini refactor** (carryover from S147). Playwright MCP added to local Claude Code config; `/phase-ii-writeup` exercised end-to-end against a real Phase II PDF. Q&A modal (SSE streaming + markdown + 18 source links with `target=_blank rel=noopener noreferrer`), Refine modal (mount verified), Word export modal (`.docx` 41.6KB downloaded). All three pass. Gemini refactor is visually green; one commit (`75cfe67`) added `.playwright-mcp/` to `.gitignore`.

2. **Intake-admin memberships build plan** (`/apply/admin/memberships`). Four versions through three Codex review passes:
   - v1 (`ffb966d`): initial draft — 12 findings (2H, 5M, 4L, 1N).
   - v2 (`ed9e05c`): folded v1 findings — 8 ADDRESSED, 3 PARTIAL, 1 NEW ISSUE; introduced 8 new findings (helper-contract guesses).
   - v3 (`1632453`): grounded every helper call in live signatures from `intake-audit-service.js`, `dataverse-identity-map.js`, `dynamics-service.js`, `auth.js`, `[...nextauth].js`. 7 of 8 v2 NF findings ADDRESSED; 5 new findings (2M, 2L, 1N).
   - v4 (`f6e33c5`): closed all 5 v3 findings — `wmkf_priordecisionstatus` field promoted to slice 0 (no more inference), §9 disposition table promoted to entry point, `noFallback` threading specified end-to-end, 403 vs 503 status-code split, `getRecord` named consistently.
   Plan is at `docs/INTAKE_ADMIN_MEMBERSHIPS_BUILD_PLAN.md` (440 lines) with companion reviews in `_CODEX_REVIEW.md`, `_V2.md`, `_V3.md`.

3. **Budget form spec** — three commits:
   - **`52409ac`** — `docs/BUDGET_FORM_SPEC.md` (originated as a parallel claude.ai browser-session paste, scoped to user-facing UX) brought under this session's ownership. Reflowed from a single 10K-char line into proper markdown. Replaced the wrong direct-to-Dataverse Data Schema section with a Postgres-first / async-drain wiring model matching `INTAKE_PORTAL_DESIGN.md`. Added the file to git.
   - **`567cf83`** — locked seven schema-design decisions with Justin: unified entity (Q1), name `wmkf_proposalbudgetline` (Q2), three Currency aggregates on `akoya_request` (Q3), `wmkf_projectyears` location (Q4), delete-and-replace in `$batch` (Q5), Facilities/Overhead always written (Q6), Whole Number for `headcount`/`effortpct` (Q7).
   - **`5f437dc`** — v2 reconcile after Codex flagged 17 findings (1C, 4H, 7M, 5L). Material change: v1 missed the pre-existing `wmkf_proposalbudgetline` sketch already in `INTAKE_PORTAL_SCHEMA_CHANGES.md` line 22 (committed earlier 2026-05-13 from morning meeting decisions). v2 reconciles to the catalog's **row-per-year** shape, moves Other Sources to a separate `wmkf_proposalcostshare` entity (the catalog's category enum has no home for institutional cost-share), fixes the drain-attribution contradiction (uses WMK app user systemuserid via `MSCRMCallerID`, not the OAuth service principal), adds `intake_audit` write events, and surfaces three portal-wide infrastructure gaps (`$batch` not in `dynamics-service.js`, `submission_jobs` not in migration 005, AkoyaGO inline-edit hardening). Codex v2 review pass: 9 of 17 v1 findings ADDRESSED, 7 PARTIAL, 1 NOT ADDRESSED, 0 new issues introduced; 9 new findings (2H, 4M, 2L, 1N), mostly procedural tightening rather than structural bugs.

4. **Schema review agenda for Connor** (`52ced07`). `docs/INTAKE_PORTAL_SCHEMA_REVIEW_2026-05-14.md` — 362-line walkthrough doc covering 8 schema items needing his sign-off + 2 FYI items. Each item structured as context / options / recommendation / rationale. Anchored against what was already settled this morning (Items 1A/1B/1C/1D plus the seven Q&A) so we don't re-litigate.

### Commits (this session)

```
52ced07 Schema review agenda for 2026-05-14 walkthrough w/ Connor
5f437dc BUDGET_FORM_SPEC v2 — reconcile with catalog + Codex review
567cf83 BUDGET_FORM_SPEC — lock 7 schema decisions 2026-05-13
52409ac Track BUDGET_FORM_SPEC + rewrite wiring section
f6e33c5 Intake-admin plan v4 — close 5 Codex v3 findings
1632453 Intake-admin plan v3 — fold in 8 Codex v2 findings
ed9e05c Intake-admin plan v2 — fold in 12 Codex findings
ffb966d Draft intake-admin memberships build plan
75cfe67 Gitignore Playwright MCP snapshot dir
```

## Production state

- **No production deploys this session.** All work is design/plan/spec.
- **Gemini refactor visually green** via Playwright MCP smoke; no follow-up needed.
- **Three pre-deploy specs ready for Connor 2026-05-14 review**: `wmkf_proposalbudgetline` v2-additions, new `wmkf_proposalcostshare` entity, `wmkf_priordecisionstatus` on `wmkf_portal_membership`.
- **CI gates** (`check:atlas`, `check:atlas:self-test`, `check:api-routes`) all green; no data-layer code touched.

## Where to pick up — Session 149

Ordered by readiness:

### A. Walk through the schema review with Connor (TOMORROW, 2026-05-14 morning)

Doc: `docs/INTAKE_PORTAL_SCHEMA_REVIEW_2026-05-14.md`. 8 ask items + 2 FYI. Time budget 20–30 min. The one item where his answer materially changes the plan is **Item 6** (does AkoyaGO surface inline-edit on `wmkf_proposalbudgetline`?). Everything else is recommendations he can rubber-stamp or push back on.

Outputs to capture after the meeting:
- Sign-offs on Items 1–4 + 8 (architecture + naming) → unblock schema deploy
- Confirmations on Items 5 (live field-collision check) + 6 (AkoyaGO behavior) + 7 (PA cover-doc grouping)
- Any pushback gets folded into v3 of `BUDGET_FORM_SPEC.md` and v5 of `INTAKE_ADMIN_MEMBERSHIPS_BUILD_PLAN.md`
- Memory entry for the seven+v2 budget decisions can be locked in after the meeting (Justin said earlier "we can lock in the memory later" — that's now)

### B. Schema deploy slice (target 2026-05-19)

After Connor sign-off, deploy under existing delegated authority + summary-after model:
- `wmkf_proposalbudgetline` (with v2-additions if approved)
- `wmkf_proposalcostshare` (if Item 1 approved)
- `wmkf_proposalroster` (with shape from Item 3)
- `wmkf_priordecisionstatus` field on `wmkf_portal_membership`
- Four fields on `akoya_request` (`wmkf_projectyears`, three aggregates) — after Item 5 live-verify
- Atlas pages: `dataverse-wmkf-proposalbudgetline.md`, `dataverse-wmkf-proposalcostshare.md`, `dataverse-wmkf-proposalroster.md`, `dataverse-wmkf-portal-membership.md`
- Update `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md` to record final names + the three v2-additions

Per the gotcha checklist in `project_dataverse_schema_deploy_gotchas.md` — 30s-backoff between metadata writes; PascalCase `@odata.bind` keys.

### C. Membership approval slice build (after schema deploys)

Build plan: `docs/INTAKE_ADMIN_MEMBERSHIPS_BUILD_PLAN.md` v4. Six slices:
- Slice 0: schema deploy (covered in B above).
- Slice 1: app key + middleware carve-out + skeleton page.
- Slice 2: `GET /api/apply/admin/memberships` + table render with `priorDecision`.
- Slice 3: `dynamics-service.updateRecord { noFallback }` extension + `POST /approve`.
- Slice 4: `POST /reject` + reject modal.
- Slice 5: tabs + toasts + 409 auto-refetch.

### D. Budget-form skeleton build (after schema deploys)

Spec: `docs/BUDGET_FORM_SPEC.md` v2. UI sections 1–6 ready; React Component Architecture sketched. Needs:
- React Hook Form + Zod scaffolding (or Formik — pick one)
- JSONB persistence to `intake_drafts.draft_json` under `budget` key
- Per-row Copy-Year-1 shortcut
- `<InfoPopover />` component
- Mobile single-year tab view
- `$100K`-multiple live validation banner
- Validation rules per the spec's Validation Rules table

Submission externalization (the drain step) is gated on `submission_jobs` migration + `$batch` helper landing — see § E.

### E. Portal-wide infrastructure gaps surfaced this session

Three items surfaced by Codex during budget-spec review. Not budget-scope; tracked at the intake-portal level. **All three block production-grade externalization but not the skeleton UI builds in C and D.**

1. **`$batch` not implemented in `dynamics-service.js`.** Drain falls back to sequential calls with progress markers. Cross-cutting infra — every async-drain consumer (budget, roster, attachments) needs it eventually.
2. **`submission_jobs` Postgres table** described in `INTAKE_PORTAL_DESIGN.md` § "Submission lifecycle" but not in migration `005_intake_portal.sql`. Add to V30 migration before drain slice ships.
3. **AkoyaGO inline-edit hardening for cached `akoya_request` aggregates.** Item 6 of the Connor agenda resolves this — depending on his answer, we either rely on daily reconcile cron (pilot fine) or add a Dataverse business rule / plug-in.

Recommend logging these in `INTAKE_PORTAL_DESIGN.md` § "Open questions / open work" after the Connor meeting so they're tracked at the right scope.

### F. Track 2 — Sarah field inventory (still carryover from S147)

Never ran in S148. The pilot Phase II Research form's full field list still needs a Sarah session before form-module skeleton goes beyond budget + roster. Schedule before the 2026-05-19 schema-deploy checkpoint.

### G. Lock in the 2026-05-13 budget-spec memory

User said earlier in S148 "we can lock in the memory later." After Connor's meeting + any v3 revisions, write `project_budget_form_decisions_2026-05-14.md` capturing:
- 7 Justin-locked decisions from morning + 6 v2 additions from Codex-driven revision
- Whatever Connor signs off on / pushes back on at the 2026-05-14 review
- Index under "Intake Portal" in `MEMORY.md`

### H. Smaller carry-forward items

- **W6 step 2 trigger** (`project_w6_table_drop_pending.md`) fires ≥ 2026-07-01.
- **Meeting agenda cleanup trigger** (`project_intake_meeting_agenda_cleanup.md`) fires ≥ 2026-05-27 — delete `docs/INTAKE_PORTAL_MEETING_AGENDA_2026-05-13.md` (and now `docs/INTAKE_PORTAL_SCHEMA_REVIEW_2026-05-14.md` similarly post-meeting).
- **IRS PA wiring** (Connor's plate from S147) — `IRS_VERIFY_SECRET` already in prod; awaiting his flow build.
- **Revert temp role elevations on prod app user** (deferred through pilot per S146 carryover).
- **COI policy body wording** (Stage 2a reviewer engagement).
- **9 follow-up SSE cutovers** from the Gemini refactor (`pages/dynamics-explorer.js` regex markdown + 9 other pages with hand-rolled SSE loops — low priority).

## Carryover hygiene

- All destructive carryover items must be grep-verified per `feedback_verify_before_destructive_carryover` rule before action.
- The two meeting-doc cleanup triggers above are routine housekeeping — verify the file exists, verify decisions made it into the relevant docs, then archive/delete.

## Key files added/modified (S148)

| File | Status | Purpose |
|---|---|---|
| `.gitignore` | MODIFIED | Add `.playwright-mcp/` |
| `docs/INTAKE_ADMIN_MEMBERSHIPS_BUILD_PLAN.md` | NEW | v1 → v4 — six-slice build plan for `/apply/admin/memberships` |
| `docs/INTAKE_ADMIN_MEMBERSHIPS_BUILD_PLAN_CODEX_REVIEW.md` | NEW | v1 Codex review (12 findings) |
| `docs/INTAKE_ADMIN_MEMBERSHIPS_BUILD_PLAN_CODEX_REVIEW_V2.md` | NEW | v2 Codex review (8 new findings) |
| `docs/INTAKE_ADMIN_MEMBERSHIPS_BUILD_PLAN_CODEX_REVIEW_V3.md` | NEW | v3 Codex review (5 new findings) |
| `docs/BUDGET_FORM_SPEC.md` | NEW (tracked) + REWRITTEN v2 | Budget-form UI/UX + Postgres-first wiring + 13 locked decisions |
| `docs/BUDGET_FORM_SPEC_CODEX_REVIEW.md` | NEW | v1 Codex review (17 findings) |
| `docs/BUDGET_FORM_SPEC_CODEX_REVIEW_V2.md` | NEW | v2 Codex review (9 new findings) |
| `docs/INTAKE_PORTAL_SCHEMA_REVIEW_2026-05-14.md` | NEW | 8-item walkthrough agenda for Connor meeting |

## Testing

```bash
npm run check:atlas
npm run check:atlas:self-test
npm run check:api-routes
```

All green at session end. No new code; no test additions.

For the next session, Playwright MCP is now configured locally (`claude mcp add playwright npx @playwright/mcp@latest`). It loads on session start. Use for any UI verification work.
