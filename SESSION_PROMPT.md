# Session 107 Prompt

## Session 106 Summary

Two major threads. First half: diagnosed why v2 system-prompt caching never fires — Sonnet 4.6 silently doubled the cache floor from 1024 to 2048 tokens, which put three of our apps into a "dead zone" where `cache_control` is accepted but silently dropped. Second half, with Connor in the room: resolved the Open Questions in the PDF-input brief, designed the division of labor between PA backend automation and bespoke web-app retrospectives, and then built a full Postgres → Dataverse migration plan across 27 tables.

### What Was Completed

1. **Sonnet 4.6 cache floor diagnosis** (`48dec12`)
   - Confirmed by bisection: 2,019 tokens → no cache; 2,058 tokens → cache writes. Beta header `prompt-caching-2024-07-31` doesn't help; the marker is accepted, the write is just dropped.
   - Audited all app system prompts via `count_tokens`. **Three dead-zone apps:** `phase-i-dynamics-v2` (1,419 tok), `qa` with typical 10K-char proposal (1,868 tok), `phase-i-summaries v1 stable portion` (1,426 tok). The `qa` finding is notable — Session 103's "cache paid for itself" data must have been on Sonnet 4.5 or Phase II-sized proposals; on Sonnet 4.6 with a typical proposal, QA now quietly falls below the floor.
   - `scripts/audit-system-prompt-sizes.js` left in place for future re-checks.
   - `docs/PROMPT_CACHING_PLAN.md` and `docs/PDF_INPUT_FOR_BACKEND.md` updated with measured numbers and the 2048 finding.

2. **Connor sync on `docs/PDF_INPUT_FOR_BACKEND.md`** (`48dec12`)
   - **Q1** (Adobe PDF / Encodian) — licensed but **not needed**; Anthropic handles PDF rendering server-side.
   - **Q2** (PA HTTP body size) — tested to 75 MB, no tenant cap.
   - **Q3** (Files API beta header) — end-to-end verified via `scripts/test-files-api.js`. Three HTTP calls (upload → reference → delete) all return 200 with `anthropic-beta: files-api-2025-04-14`. PA replication is now a PA-config issue only.
   - **Q4** (multi-pass timing) — not a concern for Phase 1. Connor's backend automation processes single requests sequentially; one prompt per request. The future *batch retrospective* regime is where caching + Batch API matter — captured in a new "Future batch-analysis regime" doc section.
   - **Q5** (2048 floor) — informational only; retained for future non-PDF-anchored flows.
   - New `docs/RETROSPECTIVE_ANALYSIS_PLAN.md` captures the division of labor: PA owns recurring single-request workflows; web apps own ad hoc retrospective analyses across historical cycles. Four capability gaps identified for the retrospective side (historical-request picker, BYO-prompt batch app, Batch API integration, structured-results export) with recommended sequencing.

3. **Dataverse migration planning — 27 tables** (`93cbb74`)
   - Justin got System Customizer in prod + Administrator in the new WM Keck Sandbox. App Registration added as application user in the sandbox; full schema CRUD confirmed via `scripts/probe-sandbox-schema-perms.js` (create/delete test table, handles the Dataverse metadata-cache lag with backoff).
   - `scripts/discover-dynamics-envs.js` lists all envs the App Registration can reach — both prod and sandbox now visible.
   - `scripts/probe-fiscal-year-format.js` verified production data: `akoya_fiscalyear` uses **long format** (`"June 2026"`, `"December 2026"`), NOT short codes. 100% of sampled requests have populated `wmkf_meetingdate`; every fiscal-year code maps to exactly one meeting month.
   - **`docs/POSTGRES_TO_DATAVERSE_MIGRATION.md`** rewritten across multiple rounds of decisions:
     - **Naming**: `wmkf_app_<table>` (namespaces our work); `wmkf_<column>` on our own tables; existing `wmkf_ai_*` on vendor tables untouched.
     - **Person model** (key decision): `systemuser` for Keck staff; `contact` for external people; `wmkf_app_researcher` narrowed to bibliometric pool. No crossover.
     - **Match-on-promote**: ORCID on `contact.wmkf_orcid` (24% populated) + email + fuzzy name, with human confirmation for fuzzy matches. Retroactive reconciliation job for the ~10K researcher rows.
     - **Reviewer suggestion**: `wmkf_reviewer_contact` (required) + `wmkf_researcher_source` (optional, provenance). One person, one contact, N reviewer suggestions across cycles.
     - **Publications authorship**: new junction `wmkf_app_publication_author` (old 1:N FK was incorrect).
     - **Expertise roster**: single table, dual person-lookup (systemuser for staff, contact for consultant/board).
     - **Grant cycles**: net-new `wmkf_app_grant_cycle` table keyed to fiscal year via alternate key. No `akoya_grantcycle` table exists in Dynamics today — my earlier assumption was wrong.
     - **Ownership vs visibility**: orthogonal. All tables get org-level Read via security role (akoyaGO convention). `UserOwned` remains for provenance (who ran this match). **Exception**: `wmkf_app_user_preference` gets User-level Read because it holds encrypted secrets.
     - **Solution strategy (Plan B)**: named unmanaged solution from day 1, scripted creation via Dataverse Web API, managed export for prod. No `pac` dependency (Connor hasn't used it).
   - **27 tables categorized**: 16 migrate to new `wmkf_app_*` tables, 2 merge into existing (`user_profiles` → `systemuser`, `researcher_keywords` → researcher columns), 2 eliminate (`search_cache`, `dynamics_user_roles`), 7 stay in Postgres (high-volume ops/audit data).
   - **Wave 1 fully specified** (user + access foundation). **Wave 2 fully specified** (Reviewer Finder core). Wave 4 previewed (expertise roster dual-lookup). Waves 3 and 5 get detail passes at their turn.

### Commits

- `48dec12` — Sonnet 4.6 cache floor diagnosis + Connor sync outcomes (PROMPT_CACHING_PLAN, PDF_INPUT_FOR_BACKEND, RETROSPECTIVE_ANALYSIS_PLAN, audit-system-prompt-sizes, test-files-api)
- `93cbb74` — Dataverse migration planning: environment access + schema design (POSTGRES_TO_DATAVERSE_MIGRATION, discover-dynamics-envs, probe-sandbox-schema-perms, probe-fiscal-year-format)

## Deferred Items (Carried Forward)

From Session 105 — status updates:

- ~~**v2 cache diagnosis**~~ — **done**. Root cause identified (Sonnet 4.6 2048 floor). Fix not applied to v2 — path forward is summarize-v3 (native PDF + caching), where the PDF document block is always above the floor.
- **Summarize-v3 (native PDF + caching)** — still attractive. Would ship as a second toggle on `/phase-i-dynamics` for validation before backend handoff.
- **Multi-pass pipeline cost modeling** — redo staged-review-pipeline projections with cached-PDF numbers (from the M7 cache work).
- **Files API prototype** — partially validated via `scripts/test-files-api.js` end-to-end. Not yet integrated into any app code path.
- **Text-only vs native PDF A/B on a research proposal** — still unrun; would settle whether vision is worth the 3× per-call cost for figure-heavy proposals.

From Session 98 — still open:

- **Reusable no-clobber helper** — `DynamicsService.updateIfEmpty()` exists; not yet migrated into `summarize.js` (pre-flight-before-Claude still justified there).
- **Register `/phase-i-dynamics` in main nav** once validated across more requests.
- **Wire `wmkf_ai_dataextract`** (structured JSON capture) — deferred until capture shape is settled.
- **`prvCreateNote` on `annotation`** — still not granted.
- **Staged Pipeline Implementation** — plan at `docs/STAGED_PIPELINE_IMPLEMENTATION_PLAN.md`.
- **CRM Email Send (Phase A)** — pending feedback on plan.
- **Drop `Final Report Template.docx` into `public/templates/`**.
- **Stray file**: `shared/config/prompts/expertise-finder.js.zip`.

## Pending Connor Responses

- **Review `docs/POSTGRES_TO_DATAVERSE_MIGRATION.md`** — validate per-table verdicts, person model, Wave 1 and Wave 2 schemas, solution strategy. Primary input needed before we write any creation code.
- **Review `docs/RETROSPECTIVE_ANALYSIS_PLAN.md`** — confirm division of labor between PA and web apps.
- **`wmkf_prompt_template` table** — Connor was creating; not yet confirmed done.
- Original Q3–Q7 from `docs/CONNOR_QUESTIONS_2026-04-15.md` — Q3 (template variable syntax), Q5 (intermediate fields), Q6 (new `wmkf_ai_run` columns), Q7 (PD expertise on systemuser) still outstanding.

## Potential Next Steps

### 1. Get Connor's review of the migration plan
Primary dependency before any implementation work starts. Doc is detailed enough that Connor should be able to review without us walking through it live.

### 2. Start Wave 1 schema creation (scripted)
Once migration plan is blessed: build `scripts/apply-dataverse-schema.js` + `lib/dataverse/schema/*.{yaml,json}` per the Plan B approach. Start with the four Wave 1 tables (`systemuser` extensions, `wmkf_app_user_preference`, `wmkf_app_user_app_access`, `wmkf_app_system_setting`). Test in sandbox; don't touch prod.

### 3. Build summarize-v3 (native PDF input + caching)
Recommended path forward for backend Phase I. Summarize-v2 + `document` block + `cache_control` on document block. Ship as a second toggle on `/phase-i-dynamics` for validation. Unlocks the 90% cost + 3× latency reduction on warm calls that the PDF cache test measured.

### 4. Historical-request picker (first gap from retrospective analysis plan)
Unlocks every downstream capability for bespoke retrospective analyses. Select N requests by cycle/year/status, auto-pull SharePoint PDFs.

### 5. Phase I Dynamics validation against more requests
Run `/phase-i-dynamics` against 5–10 real requests to stress the SharePoint bucket walker + file loader path. Still open from prior sessions.

### 6. Field Set C Compliance writeback
Second user-initiated writeback surface. Fields are ready.

## Key Files Reference

| File | Purpose |
|------|---------|
| **`docs/POSTGRES_TO_DATAVERSE_MIGRATION.md`** | **New.** 27-table migration spec, Waves 1–2 detail, person model, solution strategy |
| **`docs/RETROSPECTIVE_ANALYSIS_PLAN.md`** | **New.** Division of labor: PA recurring vs. web-app bespoke; 4 capability gaps |
| `docs/PROMPT_CACHING_PLAN.md` | Updated: Session 106 audit table, exact 2048 bisection, QA-size-dependence note |
| `docs/PDF_INPUT_FOR_BACKEND.md` | Updated: Q1–Q4 resolved; Future batch-analysis regime section |
| `scripts/audit-system-prompt-sizes.js` | **New.** Re-run after any prompt change to re-check all apps against the 2048 floor |
| `scripts/test-files-api.js` | **New.** End-to-end Anthropic Files API verification + PA recipe |
| `scripts/discover-dynamics-envs.js` | **New.** Lists Dataverse envs the App Registration can reach |
| `scripts/probe-sandbox-schema-perms.js` | **New.** Verifies full schema CRUD in sandbox |
| `scripts/probe-fiscal-year-format.js` | **New.** Confirms long-form fiscal-year format against production data |

## Testing

```bash
# Re-check all app system prompts vs 2048 floor
node scripts/audit-system-prompt-sizes.js

# Verify sandbox schema permissions still work
node scripts/probe-sandbox-schema-perms.js

# Confirm Files API beta still works with our key
node scripts/test-files-api.js --keep   # --keep skips the delete
```

## Session hand-off notes

- Tree clean, 2 commits ahead of origin until pushed (will be caught by the session-end push).
- `DYNAMICS_SANDBOX_URL` added to `.env.local` — points to `https://orgd9e66399.crm.dynamics.com`.
- System Customizer on Justin's user in prod; Administrator on Justin's user in the sandbox.
- App Registration ("WMK: Research Review App Suite") is now registered as an application user in the sandbox with whatever role Justin assigned at setup time — full schema CRUD confirmed, but we haven't inspected the exact role it got. Worth knowing if future operations return 403.
- Dataverse metadata-cache lag after schema changes is real — `probe-sandbox-schema-perms.js` handles it with a retry-with-backoff pattern that we'll want to reuse in any future schema-manipulation script.
- Justin's original recollection of fiscal-year format (`J25` / `D26`) was wrong; real data uses `"June 2026"` / `"December 2026"`. Worth flagging if he references short codes in future conversations.
- The migration doc is long (500+ lines) but structured for skim-then-drill. Wave 1 and Wave 2 are the sections that need Connor review; later waves are preview-level.
- Today's date: 2026-04-22.
