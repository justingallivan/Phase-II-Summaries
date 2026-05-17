# Session 158 Prompt: Power Tools data fully substantiated (3-way sign-off); slice-0 still the gated pilot path

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

## Session 157 Summary

Continued Dataverse Power Tools. The entire session was **data substantiation + record consolidation**, ending at a deliberate three-way agreement point (Claude + user + Codex) that the Power Tools plan is **solid and data-backed**. No app code written — Power Tools is design/evidence only, by intent.

### What was completed

1. **All 4 data puzzles probe-resolved** (read-only `scripts/probe-akoya-*.js`): Puzzle 1 (B-structural = migration backfill artifact + request-type mix), Puzzle 2/2b/2c (decline structured→free-text relocation + institutional backstory + field-only blind spot), Puzzle 3 (`wmkf_grantprogram` null is dual-field artifact, not a gap), Puzzle 4 (ambiguous-status middle behaviorally classified).
2. **Codex holistic review (15 findings) — all accepted, consolidated** (`73cb0cc`). Central fix: the record had become stale/contradictory from incremental append-patching; wrong claims edited in place (not another correction layer), memory paragraph rewritten concise, residual lists made authoritative-single-source.
3. **Codex substance-validation pass → all 6 load-bearing claims substantiated** (`6956f6d`). New read-only `scripts/probe-akoya-codex-substantiation.js`; output committed as dated evidence `docs/atlas/evidence/akoya-codex-substantiation-2026-05-16.txt`. Notably: C3 found a real mis-cut (the blended "decided-terminal 38%" — corrected to in-flight 0% vs award-eligible-decided 96/100% vs non-award 11%; confound came out *stronger*); C5 confirmed a real hazard (168 native rows carry pre-2024 `akoya_decisiondate` — `createdon`-era is creation-provenance only, NOT business-era; "time-slice on `akoya_decisiondate`, never `createdon`" is now mandatory).
4. **Codex final sign-off: SOLID AND DATA-BACKED** — C1–C6 all CLOSED. Remaining work is operational ship-gating, not evidence.
5. **Posture correction (durable, see memory):** slice-0 dates are soft with slack built in; Connor acting in good faith. Report gating **factually**, not as "overdue / at-risk". Power Tools "Phase I" framing corrected — research is NOT dropping Phase I (single-submission / status-promotion model).

### Commits (S157, all on `main`, NOT pushed — push at next /stop or now)
- `5553157` `5560be5` `c158206` `cce9fb6` `56eb9b7` — Puzzle 2c backstory, Phase I correction, process-is-program-scoped invariant, SharePoint-reachability retraction, forward intent
- `eff3475` — Puzzles 3 & 4 resolved
- `73cb0cc` — Codex holistic-review consolidation (15 findings)
- `6956f6d` — Codex substantiation pass (6 claims, committed dated evidence)

> ⚠️ **Unpushed.** S157 closed with commits local-only (per session "commit locally, don't push unless asked"). If multi-Mac continuity matters, `git push origin main` early in S158.

## Carry Forward

### A. slice-0 deploy — the pilot path, gated on Connor (factual status, soft timeline)
Slice-0 was not advanced in S156 or S157 (both were Power Tools by user direction). It remains where S155 left it: specs READY (`lib/dataverse/schema/wave4*/`, do NOT re-author), gated on Connor's Item 6 maker-portal Tests 1+2 (`docs/INTAKE_PORTAL_ITEM_6_DISCUSSION.md` / `INTAKE_PORTAL_DESIGN.md:440`). Per the S157 posture correction: the deploy dates are soft with built-in slack and Connor is acting in good faith — **report this as "gated on Connor Item 6," not "overdue/at-risk."** Deploy procedure when Item 6 clears: (1) re-run BLOCKING probe `node scripts/probe-apprequestperson-role-data.js` (must exit 0; point-in-time); (2) Connor review of `wmkf_proposalbudgetline` name / cost-share label form / `wmkf_portal_membership` shape; (3) `node scripts/apply-dataverse-schema.js --target=prod --wave=4 --execute` then `node scripts/extend-apprequestperson-role-picklist.mjs`; (4) `node scripts/setup-database.js` (V30 `009_submission_jobs.sql`, prod Postgres); (5) post-deploy: confirm entity-set pluralization, move both entities out of Atlas "Known gaps", re-run `check:atlas` + `:api-routes`.

### B. Dataverse Power Tools — data DONE; now operational ship-gating, not evidence
Design + all data claims are substantiated and Codex-signed-off. **No longer evidence-gated.** Build plan now gated only on three operational items (authoritative list = `docs/DATAVERSE_POWER_TOOLS_DESIGN.md` "Residuals — AUTHORITATIVE LIST"):
  - **(i)** AkoyaGo export-column SET (user excavation — trusted-view operational filters/columns).
  - **(ii)** One small Connor semantic sign-off (ambiguous-middle status labels + operational-vs-grant bucket assignments — folds into the existing type-taxonomy session, not a new meeting).
  - **(iii) 🔴 Test-record exclusion predicate — explicit Track B ship gate** (`1000799` is a user-confirmed test row in prod; no general detector). Connor can likely enumerate, or accept a documented contamination risk.
Track A write path still gated on 3 explicit decisions (attribution / restriction / dangerous-scalar — see doc). **Do not start v1 build until (i)+(ii)+(iii) close.** Open analysis follow-up (non-blocking): per-program segmentation of the whole-entity decline numbers (Puzzle 2/2b).

### Doc-vs-catalog gap (needs Connor — do NOT auto-absorb)
`contact.wmkf_portal_oid` + `akoya_request.wmkf_phaseiisubmittedat`/`wmkf_phaseiisubmittedby` in `INTAKE_PORTAL_DESIGN.md:621` next-steps but absent from the 2026-05-14 catalog. Reconcile with Connor: slice-0, deferred, or dropped.

### F. Low priority
COI policy body wording (Stage 2a); revert temp role elevations on prod app user (deferred until pilot settles per `project_wave1_pending.md`); Sarah's Phase II Research field inventory (Track 2).

## Open Items (unchanged, still pending Connor)

- **Field Set D doc-label collision** — `dataverse-akoya-request.md` vs `DYNAMICS_AI_FIELDS_SPEC_v3_cn.md:107`. `check:memory-drift` red by design until resolved. Ask Connor; do NOT silence the collision.
- **`incompatible_shape` drift bucket** — unbuilt in `reconcile-memory-claims.js`. Follow-up only if memory-drift tooling is invested in further.
- **Memory audit item 7** — frontmatter shape inconsistent (spec wants nested `metadata.type`; corpus uses top-level `type:`). Deferred.

## Calendar Checkpoints (soft — slack built in, Connor good-faith; report factually)

- **2026-05-19** — Slice-0 deploy *target* (soft). Specs READY; gated on Connor Item 6 + re-probe + Connor name/shape review.
- **2026-05-26** — Dry-run: flip throwaway test request to `'Phase II Pending'`, watch PA flows fire.
- **2026-05-30** — Go/no-go review.
- **2026-06-01** — Pilot accepting submissions for mid-June Phase II Research cycle.

## Gotchas

- **Power Tools is data-DONE, not build-ready.** Don't re-run the substantiation probes to "re-verify" — they're committed dated evidence (`docs/atlas/evidence/akoya-codex-substantiation-2026-05-16.txt`). Living-taxonomy policy: counts = dated evidence, re-run only with a *new* structural hypothesis.
- **`createdon`-era ≠ business-era** (S157 C5): exact as creation-provenance only. ALWAYS time-slice history on `akoya_decisiondate`; treat migrated/native as provenance, not period; ~169-row business-era cross-contamination must be disclosed when both dims appear.
- **Decided-state = `akoya_requeststatus` value→class map**, NOT `akoya_decisiondate`-presence (that's an approval stamp). Never blend non-award terminal (declines) into the "decided" denominator — it's ~0% by design and muddies rates.
- **slice-0 specs already exist (`lib/dataverse/schema/wave4*/`).** Do NOT re-author. Pre-deploy probe is `scripts/probe-apprequestperson-role-data.js`. slice-0 scope is 4 items (`project_slice0_scope.md`); trust the 2026-05-14 catalog.
- **`check:memory-drift` is red by design** (Field Set D). Advisory, NOT a P0 blocker. Don't silence it.
- **OData `/$count` caps at 5,000 in Dataverse** — never trust it for totals; FetchXML aggregate / RetrieveTotalRecordCount only (hard Track B invariant).
- **Power Tools change-history canonical method:** classify changing users via `systemuser` metadata (`applicationid` ⇒ app user) + explicit vendor name exclusion (`Bromelkamp` = AkoyaGO vendor); name-regex alone missed `Bromelkamp Admin`.
- **W6 Postgres table-drop** (`project_w6_table_drop_pending.md`) triggers ≥ 2026-07-01 — not yet due. **Unverified-until-checked destructive carryover** — grep-verify the 4 drain-only tables have no live readers before any DROP.
- **iCloud sync can silently mutate the working tree** — `git restore` usually right. Home-Mac copy: `~/Documents/Programming/Claude_Projects/WMKF_Apps/`.
- **Codex relay rule** (`feedback_codex_relay_verbatim.md`): a Codex response is delivered verbatim. **Run Codex reviews in the foreground** — backgrounded `codex:codex-rescue` can't surface the Bash-permission prompt and fails.

## Key Files Reference

| File | Purpose |
|------|---------|
| `docs/DATAVERSE_POWER_TOOLS_DESIGN.md` | Power Tools full design; "Residuals — AUTHORITATIVE LIST" + "Codex substantiation pass" are the current-state anchors |
| `docs/atlas/evidence/akoya-codex-substantiation-2026-05-16.txt` | Committed dated evidence for the 6 substantiated claims |
| `scripts/probe-akoya-codex-substantiation.js` | The substantiation probe (re-runnable; output is the committed artifact) |
| `.claude-memory/project_dataverse_power_tools.md` | Power Tools current-state orientation (concise; points to design doc) |
| `lib/dataverse/schema/wave4/` + `wave4-existing/` | slice-0 specs (READY; not deployed) |
| `scripts/probe-apprequestperson-role-data.js` | BLOCKING slice-0 pre-deploy probe (re-run at deploy) |
| `docs/INTAKE_PORTAL_ITEM_6_DISCUSSION.md` | Item 6 decision record (drives slice-0 gate A) |

## Testing

```bash
npm run check:atlas && npm run check:atlas:self-test && npm run check:api-routes  # P0 gates (green at S157 close)
npm run check:doc-currency && npm run check:doc-currency:self-test                # green at S157 close
node scripts/check-memory-drift.js   # advisory; exits 1 on Field Set D by design
# slice-0 spec sanity (network-free): JSON.parse wave4 specs + node -c schema-apply.js
```
