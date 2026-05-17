# Session 160 Prompt: Track B build plan is Phase-1-ready (3 Codex rounds converged) — next is implementation, not more design

## ⚠️ WORK MAC FIRST-SESSION TODO (one-time — SKIP if already done at the office)

If this is the first launch on the work Mac and these steps have NOT been run yet, do them in order. If `git remote -v` already shows `wmkf-research-apps` and `/start` runs 3 gates + Step 5 carryover safety, this is already done — skip the block.

```bash
git remote set-url origin https://github.com/justingallivan/wmkf-research-apps.git
git remote -v   # verify
# Launch Claude Code; run /start; then:
rm -rf ~/.claude/skills/start ~/.claude/skills/stop
# Quit fully, relaunch, run /start. Verify 3 gates + Step 5 carryover safety. Then real work.
```

---

## Session 159 Summary

User direction: Power Tools (Track B), continued. One long arc, fully converged: **closed the last open Track B data gate, closed the column contract under live user authority + independent Codex audit, then wrote and hardened the Track B build plan to Phase-1-ready through three independent Codex cold rounds.** Still **no app code by intent** — S159 is design/evidence/plan. All read-only probes; dated evidence committed.

### What was completed

1. **Per-program decline segmentation — PROBE-RESOLVED** (`probe-akoya-decline-by-program.js`): closed the 🔴 open Track B gate. Native decline documentation is wildly program-heterogeneous (ANY-reason 36%→93%); **SoCal-area programs record native declines in a THIRD field `wmkf_socalreasonsfordecline2`** (research = 0%); new sub-hazard = native `(no program)` declines (9%) need a fail-loud bucket. Reconciliation exact both eras.
2. **Unknown-1 column contract — CLOSED, user-confirmed (WMKF authority) + Codex-audited.** Recognition-pass sized (only 36/116 reports request-bound; 152-col union; **121 distinct view shapes = the real non-v1-core cost**; 4 nested-filter RDLs). The 4 high-freq under-inclusion columns adjudicated: `akoya_primarycontactid`=**foundation liaison, NOT PI** (DEFAULT+caption), `address1_city`/`state`=DEFAULT, `akoya_payee`=OPT-IN, `akoya_purpose`=PRUNED. PI-field thread: **`wmkf_projectleader` = the PI, user-attested** → program-conditional (per-program `pi_bearing` annotation; research ~90–98% / non-research ~0% → `N/A — no PI` sentinel); `wmkf_researchleader` = institutional research officer (rejected). Self-caught + Codex-confirmed a whole-entity-pooled overclaim (the 16/32% projectleader figure was a process-pooled fiction).
3. **Org-disambiguation reality** (`probe-akoya-payee-reliability.js`): structural model is **empty** — `parentaccountid` 0%/4604 (census), `akoya_defaultpayee` ~0%. Institution rollup has **no structural backstop** → deterministic name-variant clustering on `akoya_aka`(94%)+`wmkf_legalname`(82%) + fail-loud; baked into the artifact (design hard requirement).
4. **Track B BUILD PLAN written + hardened** — `docs/DATAVERSE_POWER_TOOLS_TRACK_B_BUILD_PLAN.md`. v1→v3 across **three independent Codex cold rounds** (v1: 5 P0/10 P1; confirm: 3 gaps + 2 drifts; final: 1 textual residual). Converged, Phase-1-ready. Central engineering truth: dynamics-service has **no FetchXML** + OData `/$count` 5000-cap IS the trigger → the spine is a NEW backoff-hardened FetchXML primitive. Delivery resolved to the project-native **Vercel Blob** model (one SSE `/run` invocation pages+builds+writes Blob, terminal `{ready,downloadUrl}`).
5. **New memory:** `project_institution_foundation_liaison` — the WMKF **contact-role triad** (user-attested): `akoya_primarycontactid`=liaison/steward (NOT PI), `wmkf_projectleader`=PI, `wmkf_researchleader`=institutional research officer. Cross-cutting (Grant Reporting / contact enrichment / Reviewer Finder COI).

### Commits (S159, `main` — pushed at /stop)
`42ac7c3` decline-by-program · `2207f92` akoya_purpose prune · `88ae8ac` recognition sizing · `82850fb`+`190c487` under-inclusion-4 + USC/Caltech · `04ec611` column contract closed (reconcile) · `5e5666d` org-disambiguation · `2bff193` PI/payee probes · `5559bd0` projectleader-by-program (pooled-overclaim correction) · `53b22c9` #1002794 spot-check · `7653b1e` Codex-clean reconcile (projectleader=PI user-attested) · `e9d39e0` build plan written · `fffedd2` v2 (Codex P0/P1) · `c917284` v3 (3 gaps) · `a6bae5a` final residual → Phase-1-ready

## Carry Forward

### A. slice-0 deploy — STILL the pilot path; soft target 2026-05-19 is 2 days out, NO movement in 4 sessions (S156–S159), gated on Connor Item 6
Report factually (per the posture-correction memory): "gated on Connor's Item 6 maker-portal Tests 1+2" — **not** "overdue/at-risk" — but note plainly the soft 2026-05-19 target is imminent and slice-0 has not moved in 4 sessions (all Power Tools by user direction). Specs READY (`lib/dataverse/schema/wave4*/`, do NOT re-author). Deploy procedure when Item 6 clears: (1) re-run BLOCKING `node scripts/probe-apprequestperson-role-data.js` (exit 0; point-in-time); (2) Connor review `wmkf_proposalbudgetline` name / cost-share label / `wmkf_portal_membership` shape; (3) `node scripts/apply-dataverse-schema.js --target=prod --wave=4 --execute` then `node scripts/extend-apprequestperson-role-picklist.mjs`; (4) `node scripts/setup-database.js` (V30 `009_submission_jobs.sql`); (5) post-deploy: entity-set pluralization, move both entities out of Atlas "Known gaps", re-run `check:atlas` + `:api-routes`.

### B. Dataverse Power Tools — Track B build plan PHASE-1-READY; next is IMPLEMENTATION
**Single source of truth = `docs/DATAVERSE_POWER_TOOLS_DESIGN.md` "Residuals — AUTHORITATIVE LIST"; engineering = `docs/DATAVERSE_POWER_TOOLS_TRACK_B_BUILD_PLAN.md` (do NOT restate status divergently anywhere).** v1-core data/semantic gates all CLOSED (column contract user-confirmed+Codex-audited; decline segmentation probe-resolved; era/decided-state/program-type/operational/test-record/institution-input). The build plan is Phase-1-ready, Codex-converged. **Next = Phase 1 implementation** (`lib/services/dataverse-export/`): the backoff-hardened FetchXML primitive + QuerySpec→FetchXML compiler + semantic/disclosure engine + Excel writer — testable headless against fixture specs (probes are the oracle) before any UI. Then Phase 2 (builder + 3-route API + appRegistry/Dataverse access). **Non-v1-core, do NOT block on:** Phase-3 121-view preset library (gated on a per-program recognition working-session with user/Connor/Sarah), 4 embedded-nested RDL de-nests, AI on-ramp, async job model, bulk DOCX→text decline-rationale, Track A. Orthogonal-still-open: Puzzle 2c doc-resident-rationale dimension.

### C. Forwarded data-quality follow-up (user's action, tracked)
`#1001205` (Project Angel Food) + `#1001249` (The Harmony Project) — native `Active` grants with null `akoya_decisiondate`; user forwarding to Connor + Sarah. NOT a Track B blocker.

### D. Reviewer Manager → Dataverse (when that work starts)
Read `project_reviewer_identity_fragmentation` + `project_no_banking_pii_in_dataverse` first. Open verification: run-to-ground the bill.com "early-adopter abandoned local collection" assumption (only 8/87 have `wmkf_billcom*`).

### Doc-vs-catalog gap (needs Connor — do NOT auto-absorb)
`contact.wmkf_portal_oid` + `akoya_request.wmkf_phaseiisubmittedat`/`wmkf_phaseiisubmittedby` in `INTAKE_PORTAL_DESIGN.md:621` but absent from the 2026-05-14 catalog. Reconcile with Connor.

### F. Low priority
COI policy body wording (Stage 2a); revert temp role elevations on prod app user (deferred per `project_wave1_pending.md`); Sarah's Phase II Research field inventory (Track 2).

## Open Items (pending Connor / a working-session — unchanged unless noted)

- **Field Set D doc-label collision** — `dataverse-akoya-request.md` vs `DYNAMICS_AI_FIELDS_SPEC_v3_cn.md:107`. `check:memory-drift` red by design until resolved. Ask Connor; do NOT silence.
- **121-view recognition working-session (NEW, S159)** — gates the Phase-3 guided-preset library only (NOT v1-core). Per-program "canonical trusted slice" decision with user/Connor/Sarah. 139 views / 121 distinct shapes (`docs/atlas/evidence/akoya-recognition-sizing-2026-05-17.txt`).
- **`incompatible_shape` drift bucket** — unbuilt in `reconcile-memory-claims.js`. Follow-up only if memory-drift tooling invested in further.
- **Memory audit item 7** — frontmatter shape inconsistent. Deferred. (Note: S159 new memory uses the nested `metadata.type` spec shape.)

## Calendar Checkpoints (soft — slack built in, Connor good-faith; report factually)

- **2026-05-19** — Slice-0 deploy *target* (soft) — 2 days out as of S159 close (2026-05-17); no slice-0 movement in 4 sessions; gated on Connor Item 6.
- **2026-05-26** — Dry-run: flip throwaway test request to `'Phase II Pending'`, watch PA flows fire.
- **2026-05-30** — Go/no-go review.
- **2026-06-01** — Pilot accepting submissions for mid-June Phase II Research cycle.

## Gotchas

- **🔴 Reconcile, don't append-patch** (`feedback_reconcile_dont_append_docs`). Held throughout S159 (every status edit → full-surface grep, fix all in one pass; the final re-grep caught 2 stragglers — that is why it's mandatory). After ANY status edit to a long-lived doc: grep WHOLE doc + memory + MEMORY.md index, fix all together. Top-says-X / tail-says-not-X = P0.
- **Power Tools status owned SOLELY by the design-doc "Residuals — AUTHORITATIVE LIST"; engineering by the build plan.** Everywhere else points, never restates. Honest state: v1-core gates CLOSED, build plan Phase-1-ready; open = non-v1-core (121-view preset, 4-RDL de-nest, Puzzle 2c).
- **Codex relay rule** (`feedback_codex_relay_verbatim.md`): deliver Codex output verbatim as the entire response, no commentary. Run foreground. Use a **fresh cold thread** (`--fresh`) for independent review, never `--resume` (resumed threads tail-chase corrected text). The `codex:rescue` skill self-redirects to the `codex:codex-rescue` Agent — invoke that subagent directly with `--fresh`.
- **Know when to STOP re-reviewing.** S159 ran 3 Codex rounds; the loop converged. When Codex specifies a one-line fix verbatim and says "clear to start," apply it and stop — a 4th round on a dictated fix is diminishing returns, not diligence.
- **Whole-entity rates are a process-pooled fiction** (process-is-program-scoped). S159 self-caught the `wmkf_projectleader` 16/32% pooled overclaim — per-program it's research ~95% / non-research ~0%. Segment process-dependent fields by program BEFORE stating a rate.
- **Vercel Blob is the Track B file-delivery model** (decided S159, Codex-confirmed). One SSE `/run` invocation pages+builds+writes Blob → terminal `{ready,downloadUrl}`. NOT base64-over-SSE, NOT streamed-POST-body, NOT a 2nd GET (serverless has no shared state). Blob is already project file storage.
- **`createdon`-era ≠ business-era.** Time-slice history on `akoya_decisiondate` (1955→2023), never `createdon`. **Decided-state = `akoya_requeststatus` value→class map**, NOT decisiondate-presence.
- **OData `/$count` caps at 5,000** — FetchXML aggregate / RetrieveTotalRecordCount only (hard Track B invariant; the spine primitive must use it).
- **Don't re-run committed S159 probes to "re-verify"** — dated evidence in `docs/atlas/evidence/akoya-*-2026-05-17.txt`. Living-taxonomy: counts = dated evidence; re-run only with a NEW structural hypothesis.
- **W6 Postgres table-drop** (`project_w6_table_drop_pending.md`) triggers ≥ 2026-07-01 — not yet due. **Unverified-until-checked destructive carryover** — grep-verify the 4 drain-only tables have no live readers before any DROP.
- **slice-0 specs already exist (`lib/dataverse/schema/wave4*/`)** — do NOT re-author. Pre-deploy probe `scripts/probe-apprequestperson-role-data.js`. Scope = 4 items (`project_slice0_scope.md`).
- **`check:memory-drift` red by design** (Field Set D). Advisory, NOT a P0 blocker. Don't silence.
- **iCloud sync can silently mutate the working tree** — `git restore` usually right.

## Key Files Reference

| File | Purpose |
|------|---------|
| `docs/DATAVERSE_POWER_TOOLS_TRACK_B_BUILD_PLAN.md` | **Track B engineering plan — Phase-1-ready; the implementation entry point** |
| `docs/DATAVERSE_POWER_TOOLS_DESIGN.md` | Design; **"Residuals — AUTHORITATIVE LIST" is the single source of truth for status** |
| `docs/atlas/evidence/akoya-*-2026-05-17.txt` | S159 dated evidence (decline-by-program, recognition-sizing, under-inclusion-4, USC/Caltech, org-disambiguation, payee-reliability, pi-fields, projectleader-by-program, #1002794) |
| `.claude-memory/project_dataverse_power_tools.md` | Power Tools orientation (points to design doc + build plan) |
| `.claude-memory/project_institution_foundation_liaison.md` | WMKF contact-role triad (liaison / PI / research-officer), user-attested |
| `.claude-memory/feedback_reconcile_dont_append_docs.md` | The doc-hygiene P0 rule |
| `lib/dataverse/schema/wave4*/` | slice-0 specs (READY; not deployed) |
| `scripts/probe-apprequestperson-role-data.js` | BLOCKING slice-0 pre-deploy probe |

## Testing

```bash
npm run check:atlas && npm run check:atlas:self-test && npm run check:api-routes  # P0 gates (green at S159 close)
npm run check:doc-currency && npm run check:doc-currency:self-test                # green at S159 close
node scripts/check-memory-drift.js   # advisory; exits 1 on Field Set D by design
# Phase 1 build (next session): lib/services/dataverse-export/ — headless-testable vs fixture QuerySpec;
#   probes scripts/probe-akoya-*.js + docs/atlas/evidence/*2026-05-17.txt are the compiler/engine oracle.
# Power Tools probes are read-only committed dated evidence — re-run only with a NEW structural hypothesis.
```
