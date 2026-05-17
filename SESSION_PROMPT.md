# Session 159 Prompt: Power Tools residuals honestly closed/advanced — Track B build-plan-ready (with named open items), not "all gates closed"

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

## Session 158 Summary

User direction: Power Tools (Track B). The session **closed/advanced all three Track B residuals via read-only probes + live user confirmations**, surfaced two forward Reviewer-Manager constraints, and — most durably — caught a **recurring doc-hygiene failure** and locked it into memory. **No app code written; Power Tools remains design/evidence by intent.** Honest framing matters here: a lot of the back half was doc-consistency remediation across 3 Codex rounds, not new findings.

### What was completed

1. **Residual (i) — export-column SET: reframed solo-actionable + SUBSTANTIALLY ADVANCED.** The "user excavation, not solo-actionable" label was wrong — AkoyaGO *is* the probed Dataverse env. Probes `probe-akoya-saved-views.js` (full surface, 0 privilege gaps; 139 program-segmented public views + ~60 reports; userquery=0 + doc-templates junk), `probe-akoya-report-defs.js` (20/116 trusted RDLs → FetchXML). Delivered a **candidate** column SET (Artifact 1) — *not* a finished contract; recognition pass + FetchXML filter de-nesting still pending.
2. **Residual (ii) — semantic sign-off: CLOSED by user authority** (user is WMKF-authoritative). Live-confirmed: status labels (`Active` = awarded-in-performance; `Proposal Not Invited` = terminal triage-decline; `Withdrawn` = terminal/no-award, **path-agnostic**), operational-vs-grant buckets (Miscellaneous = real 52/$3.35M; Research Reviewer ≡ Individual = GOapply $250 honoraria, exclude via `wmkf_grantprogram=Honorarium`), Option-B program roll-up (`wmkf_type=Program` only; Special Projects/Grants separate lines), program-axis model (b) (`wmkf_grantprogram` coarse category ≠ `akoya_programid` 24-program taxonomy; both live). **Provenance tagged** (probe-substantiated vs user-attested).
3. **Residual (iii) — test-record predicate: CLOSED.** `applicant account.name="W. M. Keck Foundation" ∧ AkoyaGO-native era` (from system view "Test Requests"); #993347 probe-confirmed real, #1002807 user-attested + structurally corroborated test clone. 22-row bounded blast radius; Medical Research $493M probe-shown test-clean.
4. **Reviewer-Manager forward findings (NOT Power Tools scope):** `project_reviewer_identity_fragmentation` (reviewer identity spans ≥4 disjoint stores — *5/87 sample + architecture, not a census*) and `project_no_banking_pii_in_dataverse` (firm management constraint; bill.com is SoR; "early-adopter abandoned local collection" is a working assumption to run to ground).
5. **Durable process lesson:** `feedback_reconcile_dont_append_docs` — append-patching a doc into self-contradiction recurred **3× this session** (S157 caught it, S158 reproduced it under explicit watch). Rule: after any status edit, full-surface grep ALL restatements; top-vs-elsewhere contradiction = P0.

### Commits (S158, `main` — pushed at /stop)
`c25ab33` (i) closed-solo+(iii) narrowed · `7872006` (iii) #1002807 · `eca063c` Active · `17ad3e7` Proposal Not Invited · `7f9d6c2` Withdrawn · `09e81fd` buckets+reviewer-identity · `75b9828`+`4103af7` reviewer payment model/no-PII · `747f06a`+`fa9df0d`+`412e822` roll-up Option B + program-axis (b) · `4f858ed` Codex follow-ups + doc-hygiene memory · `1d5ba6f`+`9280acc`+`101afdb`+`e2978e8` Codex remediation (3 rounds → honest reconciled state)

## Carry Forward

### A. slice-0 deploy — STILL the pilot path; soft target 2026-05-19 has effectively arrived (report factually)
Slice-0 was NOT advanced in S156/S157/S158 (all Power Tools by user direction). Unchanged from S155: specs READY (`lib/dataverse/schema/wave4*/`, do NOT re-author), gated on Connor's Item 6 maker-portal Tests 1+2 (`docs/INTAKE_PORTAL_ITEM_6_DISCUSSION.md` / `INTAKE_PORTAL_DESIGN.md:440`). Per the posture-correction memory: report as "gated on Connor Item 6," **not** "overdue/at-risk" — but note factually that the soft 2026-05-19 target is here and slice-0 has had no movement in 3 sessions. Deploy procedure when Item 6 clears: (1) re-run BLOCKING `node scripts/probe-apprequestperson-role-data.js` (exit 0; point-in-time); (2) Connor review `wmkf_proposalbudgetline` name / cost-share label / `wmkf_portal_membership` shape; (3) `node scripts/apply-dataverse-schema.js --target=prod --wave=4 --execute` then `node scripts/extend-apprequestperson-role-picklist.mjs`; (4) `node scripts/setup-database.js` (V30 `009_submission_jobs.sql`); (5) post-deploy: entity-set pluralization, move both entities out of Atlas "Known gaps", re-run `check:atlas` + `:api-routes`.

### B. Dataverse Power Tools — Track B build-plan-ready, NOT "all gates closed"
**Honest state (single source of truth = `docs/DATAVERSE_POWER_TOOLS_DESIGN.md` "Residuals — AUTHORITATIVE LIST" — do NOT restate divergently anywhere):** (i) substantially advanced — candidate column set; **recognition pass + FetchXML filter de-nesting are build-plan inputs**. (ii) closed by user authority, provenance-tagged. (iii) closed (probe-confirmed + attested). **🔴 Per-program decline segmentation (Puzzle 2/2b) is an OPEN gating item for any decline output** (process-is-program-scoped invariant) — whole-entity-only, unprobed. Track A *write path* separately gated on its 3 write-policy decisions. Next: either write the Track B build plan (carrying the recognition pass + decline segmentation as first-class items) or do the per-program decline segmentation probe.

### C. Forwarded data-quality follow-up (user's action, tracked)
`#1001205` (Project Angel Food) + `#1001249` (The Harmony Project) — native `Active` grants with null `akoya_decisiondate`, suspected genuine oversights; user forwarding to Connor + Sarah. Recorded in design doc + power-tools memory. NOT a Track B blocker.

### D. Reviewer Manager → Dataverse (when that work starts)
Read `project_reviewer_identity_fragmentation` + `project_no_banking_pii_in_dataverse` first. Open verification: run-to-ground the bill.com "early-adopter abandoned local collection" assumption (only 8/87 have `wmkf_billcom*`; the ~80 were likely paid without it).

### Doc-vs-catalog gap (needs Connor — do NOT auto-absorb)
`contact.wmkf_portal_oid` + `akoya_request.wmkf_phaseiisubmittedat`/`wmkf_phaseiisubmittedby` in `INTAKE_PORTAL_DESIGN.md:621` but absent from the 2026-05-14 catalog. Reconcile with Connor.

### F. Low priority
COI policy body wording (Stage 2a); revert temp role elevations on prod app user (deferred per `project_wave1_pending.md`); Sarah's Phase II Research field inventory (Track 2).

## Open Items (still pending Connor, unchanged)

- **Field Set D doc-label collision** — `dataverse-akoya-request.md` vs `DYNAMICS_AI_FIELDS_SPEC_v3_cn.md:107`. `check:memory-drift` red by design until resolved. Ask Connor; do NOT silence.
- **`incompatible_shape` drift bucket** — unbuilt in `reconcile-memory-claims.js`. Follow-up only if memory-drift tooling invested in further.
- **Memory audit item 7** — frontmatter shape inconsistent (spec wants nested `metadata.type`; corpus uses top-level `type:`). Deferred.

## Calendar Checkpoints (soft — slack built in, Connor good-faith; report factually)

- **2026-05-19** — Slice-0 deploy *target* (soft) — effectively arrived; no slice-0 movement in 3 sessions; gated on Connor Item 6.
- **2026-05-26** — Dry-run: flip throwaway test request to `'Phase II Pending'`, watch PA flows fire.
- **2026-05-30** — Go/no-go review.
- **2026-06-01** — Pilot accepting submissions for mid-June Phase II Research cycle.

## Gotchas

- **🔴 Reconcile, don't append-patch** (`feedback_reconcile_dont_append_docs`, new S158). Recurred 3× in S158. After ANY status/conclusion edit to a long-lived doc: grep the WHOLE doc + memory for every restatement and fix all in one pass. Top-says-X / tail-says-not-X = P0, same urgency as a red gate. Prefer rewriting a stale block over adding an "S159 update:" paragraph next to it.
- **Power Tools status is owned SOLELY by the design-doc "Residuals — AUTHORITATIVE LIST."** Everywhere else must point to it, not restate. The honest state is: (i) substantially advanced, (ii) user-authority-closed, (iii) closed, decline-segmentation OPEN — NOT "all gates closed / build-plan-ready with no gate."
- **Codex resume context tail-chases.** A resumed Codex thread will re-flag *corrected honest text* against the *overclaims it remembers* (happened twice in S158). For independent verification use a **fresh cold thread** (`--fresh`), not `--resume`.
- **Don't re-run S158 probes to "re-verify"** — committed dated evidence (`docs/atlas/evidence/akoya*-2026-05-16.txt`, `akoyago-saved-views-2026-05-16.txt`). Living-taxonomy: counts = dated evidence; re-run only with a *new* structural hypothesis (per-program decline segmentation IS such a hypothesis — legitimate to probe).
- **`createdon`-era ≠ business-era.** ALWAYS time-slice history on `akoya_decisiondate` (the true recoverable historical date, 1955→2023), never `createdon`. `overriddencreatedon`=null means only *system-origin* deep-history is lost, NOT business dates.
- **Decided-state = `akoya_requeststatus` value→class map**, NOT `akoya_decisiondate`-presence (approval stamp). Never blend non-award terminal into the "decided" denominator.
- **OData `/$count` caps at 5,000** — FetchXML aggregate / RetrieveTotalRecordCount only (hard Track B invariant).
- **Power Tools change-history canonical method:** classify users via `systemuser` metadata (`applicationid` ⇒ app user) + explicit vendor exclusion (`Bromelkamp` = AkoyaGO vendor).
- **W6 Postgres table-drop** (`project_w6_table_drop_pending.md`) triggers ≥ 2026-07-01 — not yet due. **Unverified-until-checked destructive carryover** — grep-verify the 4 drain-only tables have no live readers before any DROP.
- **slice-0 specs already exist (`lib/dataverse/schema/wave4*/`)** — do NOT re-author. Pre-deploy probe `scripts/probe-apprequestperson-role-data.js`. Scope = 4 items (`project_slice0_scope.md`); trust the 2026-05-14 catalog.
- **`check:memory-drift` red by design** (Field Set D). Advisory, NOT a P0 blocker. Don't silence.
- **iCloud sync can silently mutate the working tree** — `git restore` usually right.
- **Codex relay rule** (`feedback_codex_relay_verbatim.md`): deliver Codex output verbatim, as the entire response, no commentary. Run reviews foreground.

## Key Files Reference

| File | Purpose |
|------|---------|
| `docs/DATAVERSE_POWER_TOOLS_DESIGN.md` | Power Tools design; **"Residuals — AUTHORITATIVE LIST" is the single source of truth for status** |
| `docs/atlas/evidence/akoyago-saved-views-2026-05-16.txt` | Export-surface enumeration (residual i) |
| `docs/atlas/evidence/akoya-report-defs-2026-05-16.txt` | 20 trusted RDL definitions (residual i) |
| `docs/atlas/evidence/akoya-test-record-predicate-2026-05-16.txt` + `akoya-codex-followups-s158-2026-05-16.txt` | Residual (iii) predicate + #993347/#1002807 verification |
| `.claude-memory/project_dataverse_power_tools.md` | Power Tools orientation (points to design doc for status) |
| `.claude-memory/feedback_reconcile_dont_append_docs.md` | The S158 doc-hygiene P0 rule |
| `.claude-memory/project_reviewer_identity_fragmentation.md` / `project_no_banking_pii_in_dataverse.md` | Reviewer Manager → Dataverse forward constraints |
| `lib/dataverse/schema/wave4*/` | slice-0 specs (READY; not deployed) |
| `scripts/probe-apprequestperson-role-data.js` | BLOCKING slice-0 pre-deploy probe |

## Testing

```bash
npm run check:atlas && npm run check:atlas:self-test && npm run check:api-routes  # P0 gates (green at S158 close)
npm run check:doc-currency && npm run check:doc-currency:self-test                # green at S158 close
node scripts/check-memory-drift.js   # advisory; exits 1 on Field Set D by design
# Power Tools probes are read-only + committed dated evidence — re-run only with a NEW structural hypothesis
# slice-0 spec sanity (network-free): JSON.parse wave4 specs + node -c schema-apply.js
```
