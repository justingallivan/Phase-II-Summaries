# Session 163 Prompt: slice-0 (Connor unblocked the design) — then Track B floor follow-ups

## Session 162 Summary

A working-session, not a build session. Two threads: (1) a long, user-driven design conversation scoping the **Track B AI on-ramp "filter floor"** (what an NL→QuerySpec layer can honestly promise), grounded by **four new read-only probes**; (2) at close, **Connor's email resolving the slice-0 Item-6 block** — captured as the designated priority for S163.

### What was completed

1. **Track B floor scoping — design conversation + 4 probes (committed `e720c1a`).** The user's headline vision is confirmed as the **NL AI on-ramp** (Dynamics-Explorer-style prompt → hardened QuerySpec into the existing stable `/preview`→`/run` confirm seam); the builder UI demotes to a confirmation/inspection surface. Probes (dated evidence in `docs/atlas/evidence/`, atlas refined):
   - `probe-akoya-meetingdate-by-type` — `wmkf_meetingdate` ~100% across every named process **incl. Discretionary** (disproves the "discretionary lacks a meeting date" worry); residue = untyped/`Pending` tail. PART 2: `wmkf_donorname` is a **Lookup → `wmkf_donors`** = the WMKF board/staff member who *directed* the gift (NOT an external donor).
   - `probe-akoya-person-role-by-program` — per-program lead-person mapping: **Research** = `wmkf_projectleader` (+ `wmkf_apprequestperson` junction for co-PIs), **SoCal** = Primary Contact / `wmkf_ceo` (no PI), **Discretionary** = none. "PI" is research vocabulary, not entity-global. `DESIGN.md:196` 98/90% is a fine `akoya_programid` cut; coarse `wmkf_grantprogram=Research` is 61% native (segmentation-sensitive — Connor flag candidate).
   - `probe-akoya-socal-contacts` — Rosetta on #1001159: Request PC = `akoya_primarycontactid`; **Org PC = `account.primarycontactid`** (on the applicant account, not the request); Org Leader = `wmkf_ceo`. Native SoCal both-present 84%, same-person ~68%.
   - `probe-akoya-socal-contact-divergence` — SoCal-2025 divergent examples; surfaced **duplicate `contact` records** inflating GUID-divergence (name-match ≠ GUID-match — an AI footgun).
2. **Ratified v1 floor** (user-approved as "a good start, refine later via prototype stress-test"):
   - **Tier 1 (cheap scalars):** Request # (`akoya_requestnum`), Title (`akoya_title` contains), Meeting date (`wmkf_meetingdate`), Phase I status (`wmkf_phaseistatus`).
   - **Tier 3:** Grant cycle — bonded to meeting date, fiscal year folded in, **mandatory off-cycle `UNCLASSIFIED cycle` fail-loud sentinel** (the cycle code is a June/Dec *convention*, not an invariant; off-month meetings silently drop today — see memory).
   - **Tier 2:** Payee (cheapest — institution-pattern reuse), Program director (lead `wmkf_programdirector` only; carries a discretionary-exclusion disclosure like PI, milder), PI as an **explicitly research-scoped "Project Leader (research)" axis** with mandatory scope disclosure (NOT a generic "PI" axis — proven wrong).
3. **Connor's slice-0 ruling received + captured** (memory `slice0-deactivate-not-delete-recalc`). See §A below.

### Commits (S162, `main`, pushed)
- `e720c1a` — Track B floor-scoping probes + evidence + atlas refinement (S162)
- (this doc commit)

Memory written this session (harness store, not repo): `dataverse-export-floor-scoping`, `akoya-temporal-axis-encodings`, `slice0-deactivate-not-delete-recalc` (+ `MEMORY.md` index). Read these before resuming either thread.

## Potential Next Steps

### A. slice-0 — THE DESIGNATED PRIORITY (Connor unblocked the *design*; still a destructive carryover)

🔴 **Unverified-until-checked destructive carryover — do NOT treat as green-lit.** Connor's email (S162, full text in memory `slice0-deactivate-not-delete-recalc`) resolved the Item-6 design block:

> Option A (delete-driven parent recalculation) is a **no-go** — Dynamics gives no parent record ID on child delete. **Defunct children must be DEACTIVATED, not deleted**; the flow triggers on child *update* (deactivation) and recalculates the parent over **active children only**.

This resolves the *design* question only. It does **NOT** assert maker-portal Tests 1+2 pass under the deactivation pattern, nor that the destructive deploy is safe. Before any destructive step, per the carryover-hygiene rule: (1) re-read Connor's email + the memory entry; (2) rework any slice-0 spec/flow that assumed hard-delete of roster children to deactivate + active-only recalc; (3) re-run BLOCKING `scripts/probe-apprequestperson-role-data.js`; (4) grep live callers of the gated tables; (5) Connor field review; (6) `apply-dataverse-schema.js --wave=4`; (7) `setup-database.js` V30; (8) post-deploy Atlas + 3 P0 gates. Specs at `lib/dataverse/schema/wave4*/` (do NOT re-author). Slice-0 design context: prior S161 prompt §C + `docs/POSTGRES_TO_DATAVERSE_MIGRATION.md`.

### B. Track B floor — follow-ups (parked; not blocking slice-0)
- **Primary Contact final shape — PARKED pending the user's SME reply** on what the SoCal Request-PC vs Org-PC divergence *means* (org-grants-staff vs request-driver-exec). Provisional: forced-choice Request-PC vs Org-PC (both Tier-2 links) with the duplicate-contact caveat. Do not ratify until the SME answers.
- **Name-normalized re-count** — quantify *true* person-divergence vs the inflated ~31% GUID rate (cheap follow-up `probe-akoya-socal-contact-divergence`-style with name normalization).
- **Donor** = Tier-2 fast-follow — needs a non-misleading "directed-by sponsor" axis label + a `wmkf_donors` entity-shape probe before build.
- **Prototype** — the user's stated path: get a prototype NL→QuerySpec on-ramp running and stress-test against unanticipated use cases. The QuerySpec→FetchXML seam is unchanged (4× Codex-reviewed); the prototype emits into the same confirm gate (additive, not a rewrite).

### C–F. Unchanged from S161/S162
Field Set D doc-label collision (Connor; `check:memory-drift` red BY DESIGN — do not silence); Reviewer Manager→Dataverse (read `project_reviewer_identity_fragmentation` first); COI policy wording; revert temp role elevations; Sarah's Phase II Research field inventory; data-quality `#1001205`/`#1001249`.

## Calendar Checkpoints (soft — Connor good-faith; report factually, not "overdue")
- **2026-05-19** — slice-0 deploy *target* (soft); Connor has now responded on the design block (S163 can act, with re-verification).
- **2026-05-26** — dry-run: flip a throwaway test request to `'Phase II Pending'`, watch PA flows fire.
- **2026-05-30** — go/no-go review. **2026-06-01** — pilot accepts submissions (mid-June Phase II Research cycle).

## Gotchas (still live — carried forward)
- 🔴 **slice-0 is destructive carryover.** Connor unblocked the *design*, not the deploy. Re-verify before any schema apply / table drop. "Connor responded" ≠ "safe to run."
- 🔴 **"PI" / "primary contact" / "donor" are per-program / disambiguation hazards** — the field dictionary must be per-program, not entity-global; this is the AI on-ramp's correctness ceiling. Detail in memory `dataverse-export-floor-scoping`.
- 🔵 **Blob = TWO stores, never conflate** — shared public `phase-ii-summaries-blob` (`BLOB_READ_WRITE_TOKEN`) vs Dataverse-export private `dvx-export-private` (`DVX_BLOB_RW_TOKEN`). (CLAUDE.md env section.)
- 🔴 **Living-taxonomy lesson** — `lib/services/dataverse-export/{constants,live-taxonomy,compiler}.js` constants/field/label names must be verified against a live probe, not the fixtures (tests mock the taxonomy — green ≠ live-correct).
- **`check:memory-drift` red by design** (Field Set D). Advisory, NOT a P0 blocker. Do not silence.
- **dataverse-export tests use `@jest-environment node`**; live repro = standalone env-loaded `.mjs` (no `fetch` in the jest env). Probe pattern: `scripts/probe-akoya-*.js` — env-load `.env.local`, client_credentials token, FetchXML aggregate (NEVER OData `/$count`).
- **iCloud `.nosync` can clear `node_modules`** at session start — `npm ci` restores; `git restore` for silent working-tree mutations. `.next`/`.next.nosync/` untracked is normal.

## Key Files Reference

| File | Purpose |
|------|---------|
| memory `slice0-deactivate-not-delete-recalc` | Connor's verbatim ruling + how to apply + the destructive-carryover caveat — READ FIRST for §A |
| memory `dataverse-export-floor-scoping` | Ratified v1 floor, per-program field hazards, parked items — READ FIRST for §B |
| memory `akoya-temporal-axis-encodings` | Meeting date canonical; cycle is a convention not an invariant (fail-loud) |
| `lib/dataverse/schema/wave4*/` | slice-0 specs — READY, do NOT re-author |
| `scripts/probe-apprequestperson-role-data.js` | BLOCKING slice-0 pre-deploy probe (re-run) |
| `scripts/probe-akoya-{meetingdate-by-type,person-role-by-program,socal-contacts,socal-contact-divergence}.js` | S162 floor-scoping probes (committed oracle) |
| `pages/dataverse-bulk-export.js` · `pages/api/dataverse-export/*` · `lib/services/dataverse-export/*` | Track B app + stable QuerySpec→FetchXML seam (the AI on-ramp emits into this) |

## Testing

```bash
npm run check:atlas && npm run check:atlas:self-test && npm run check:api-routes   # 3 P0 gates (green; api-routes=84)
node node_modules/jest/bin/jest.js tests/unit/dataverse-export.test.js tests/unit/dataverse-export-routes.test.js  # 74/74
node scripts/check-memory-drift.js   # advisory; exits 1 on Field Set D BY DESIGN
# Live probe pattern: standalone scripts/probe-akoya-*.js — .env.local, client_credentials, FetchXML aggregate (NOT /$count)
```
