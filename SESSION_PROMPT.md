# Session 156 Prompt: Connor's Item 6 (still blocking) → slice-0 deploy; specs are READY

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

## Session 155 Summary

Heavy session. Cleared the slice-0 prep critical path (B + C + D) and fully actioned the S155 memory audit. Slice 0 is now **specs-complete and deploy-ready**, gated only on Connor's Item 6 + his shape/name review.

### What was completed

1. **Item B — pre-deploy `wmkf_role` probe: CLEAR** (`cf5a53d`). Carryover named the wrong script (`dynamics-schema-diff.js` — a Dynamics-Explorer annotation diff that can't even target `wmkf_apprequestperson`). Wrote the correct tool `scripts/probe-apprequestperson-role-data.js` (definition + live row-data; exit 0/3/1). Result: 5,561 rows, **zero** in `100000002`–`100000004`. **Point-in-time — must re-run at deploy.** Corrected the originating doc + memory `project_slice0_role_probe.md`.
2. **Items C + D — slice-0 specs + Atlas + Money tooling** (`48eee84`, review fixes `58d9b68`). Scope was corrected **3 → 4 items** (Codex caught carryover C dropped `wmkf_portal_membership`; verified via `INTAKE_ADMIN_MEMBERSHIPS_BUILD_PLAN.md`). Added `case 'Money'` to `lib/dataverse/schema-apply.js` (was unsupported). Wrote `wave4/wmkf_proposalbudgetline.json`, `wave4/wmkf_portal_membership.json`, `wave4-existing/akoya_request-intake-aggregates.json`, `wave4-existing/wmkf_apprequestperson-roster-fields.json`, `scripts/extend-apprequestperson-role-picklist.mjs`; 2 new Atlas pages + amended apprequestperson + APPLICATION_STATE_ATLAS.md. Codex review (SHIP WITH CAUTION) → 3 risks fixed, incl. **eliminating** the approvalstatus/priordecisionstatus integer collision by aligning terminal-state integers.
3. **Memory audit fully actioned.** Items 1+6 (`f385776`): consolidated the duplicate Codex-verbatim memory (kept stricter S155 rule), fixed link-path prefixes. Items 2–5 (`21c060b`, Codex-executed + independently reviewed): reviewer-history-source correction, cron→post-pilot-one-shot reconciliation in the destructive `REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md` (8-signal predicate + ≥2026-07-01 gating preserved), interim-automation status, IRS `researchers` removal, reviewer-lifecycle forward-looking language. Item 7 (frontmatter normalization) **deliberately deferred**. Audit doc discarded (consumed).

### Commits (this session)

- `cf5a53d` — Verify slice-0 `wmkf_role` pre-deploy probe (item B): CLEAR
- `48eee84` — Write intake slice-0 schema specs + Atlas (C+D) + Money tooling
- `58d9b68` — Address Codex review of 48eee84 (slice-0 specs)
- `f385776` — Memory audit cleanup: items 1 + 6
- `21c060b` — Memory audit cleanup: items 2-5 (Codex-executed, reviewed)
- (`/stop` doc commit) — this prompt

### Process note (honest)

Two carryover items were materially wrong and only caught by verifying before acting: B named a tool that can't do the job; C under-counted slice-0 scope by an entire entity. Both corrected at source + memory. The Codex relay-verbatim rule was violated twice mid-session and corrected — consolidated memory now enforces "verbatim block is the entire response, nothing before/after."

## Carry Forward

### A. Connor's Item 6 test results (PRIMARY — overdue, hard blocker for deploy)
2026-05-15 was the flow-list reply target — now overdue. Slice-0 deploy is blocked on maker-portal Tests 1+2 (Connor) per `docs/INTAKE_PORTAL_ITEM_6_DISCUSSION.md` / `INTAKE_PORTAL_DESIGN.md:440`. Branch A+B-hybrid vs Option-B-alone on the outcome. **This is the only thing between specs and deploy.**

### Slice-0 deploy procedure (when A clears) — specs are READY, do NOT re-author
1. **Re-run the probe (BLOCKING, point-in-time):** `node scripts/probe-apprequestperson-role-data.js` — must exit 0 (CLEAR). Was clear 2026-05-15; data can change.
2. **Connor review before `--execute`:** (a) `wmkf_proposalbudgetline` vs `wmkf_budgetline` name; (b) cost-share label form — specs use the reserved camelCase `WaivedIndirect`/`WaivedTuition`/`OtherCostShare` which is inconsistent with spaced WMKF-spend labels (flagged in spec + atlas); (c) `wmkf_portal_membership` shape (his one-entity design review per `project_dataverse_creator_privileges`).
3. **Deploy = two commands:** `node scripts/apply-dataverse-schema.js --target=prod --wave=4 --execute` (idempotent; expect 429 backoff) **then** `node scripts/extend-apprequestperson-role-picklist.mjs` (the `wmkf_role` 2→5 expansion is NOT in the wave spec — schema-apply is creation-only).
4. **Apply `submission_jobs` to prod Postgres** (carryover E): `node scripts/setup-database.js` (V30 idempotent, `009_submission_jobs.sql`) — runs with the slice-0 deploy.
5. **Post-deploy:** confirm entity-set pluralization (`wmkf_proposalbudgetlines` / `wmkf_portal_memberships`) via metadata + correct the Atlas pages; move both entities from APPLICATION_STATE_ATLAS.md "Known gaps" into the main per-entity table; re-run `check:atlas` + `:api-routes`.

### Doc-vs-catalog gap (needs Connor — do NOT auto-absorb)
`contact.wmkf_portal_oid` + `akoya_request.wmkf_phaseiisubmittedat`/`wmkf_phaseiisubmittedby` appear in `docs/INTAKE_PORTAL_DESIGN.md:621` next-steps but are **absent** from the authoritative 2026-05-14 catalog. Not pulled into slice 0. Reconcile with Connor whether they're slice-0, deferred, or dropped.

### F. Low priority
COI policy body wording (Stage 2a); revert temp role elevations on prod app user (deferred until pilot settles per `project_wave1_pending.md`); Sarah's Phase II Research field inventory (Track 2).

## Open Items (unchanged from S154, still pending Connor)

- **Field Set D doc-label collision** — `dataverse-akoya-request.md` vs `DYNAMICS_AI_FIELDS_SPEC_v3_cn.md:107`. `check:memory-drift` red by design until resolved. Ask Connor; do NOT silence the collision.
- **`incompatible_shape` drift bucket** — unbuilt in `reconcile-memory-claims.js`. Follow-up only if memory-drift tooling is invested in further.
- **Memory audit item 7** — frontmatter shape inconsistent (system-prompt spec wants nested `metadata.type`; the `.claude-memory` corpus + new S155 files use top-level `type:`). Deliberate decision deferred: normalize one way or document both as accepted. Not urgent.

## Calendar Checkpoints (S155 closed 2026-05-15)

- **2026-05-15** — Connor flow-list reply target (OVERDUE).
- **2026-05-19** — Slice-0 deploy target. Specs READY; gated on A (Connor Item 6) + re-probe + Connor name/shape review.
- **2026-05-26** — Dry-run: flip throwaway test request to `'Phase II Pending'`, watch PA flows fire.
- **2026-05-30** — Go/no-go review.
- **2026-06-01** — Pilot accepting submissions for mid-June Phase II Research cycle.

## Gotchas

- **Slice-0 specs already exist (`lib/dataverse/schema/wave4*/`).** Do NOT re-author them next session — the deploy procedure above is the work. The old "node scripts/dynamics-schema-diff.js" probe instruction is dead — use `scripts/probe-apprequestperson-role-data.js`.
- **Slice-0 scope is 4 items, not 3** (`project_slice0_scope.md`). Trust the 2026-05-14 `INTAKE_PORTAL_SCHEMA_CHANGES.md` catalog over any carryover enumeration.
- **`check:memory-drift` is red by design** (Field Set D). Advisory, NOT a P0 blocker. Don't silence it.
- **W6 Postgres table-drop** (`project_w6_table_drop_pending.md`) triggers ≥ 2026-07-01 — not yet due. Grep-verify the 4 drain-only tables have no live readers before any DROP at that time.
- **iCloud sync can silently mutate the working tree** — if `git status` shows unexpected deleted/modified files, `git restore` is usually right. Home-Mac copy: `~/Documents/Programming/Claude_Projects/WMKF_Apps/`.
- **Codex relay rule** (`feedback_codex_relay_verbatim.md`): a Codex response is delivered verbatim as the entire message — no commentary before/after; decisions/fixes happen in a separate turn.

## Key Files Reference

| File | Purpose |
|------|---------|
| `lib/dataverse/schema/wave4/` + `wave4-existing/` | Slice-0 specs (ready; not deployed) |
| `scripts/probe-apprequestperson-role-data.js` | BLOCKING pre-deploy probe (re-run at deploy) |
| `scripts/extend-apprequestperson-role-picklist.mjs` | `wmkf_role` 2→5 expansion (run after wave apply) |
| `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md` | Authoritative slice-0 catalog (2026-05-14) |
| `docs/INTAKE_PORTAL_ITEM_6_DISCUSSION.md` | Item 6 decision record (drives A) |
| `docs/INTAKE_ADMIN_MEMBERSHIPS_BUILD_PLAN.md` | Membership entity scope (downstream admin slice) |
| `.claude-memory/project_slice0_scope.md` / `project_slice0_role_probe.md` | Corrected scope + probe-tool memory |

## Testing

```bash
npm run check:atlas && npm run check:atlas:self-test && npm run check:api-routes  # P0 gates (all green at S155 close)
node scripts/check-memory-drift.js  # advisory; exits 1 on Field Set D by design
# Slice-0 spec sanity (network-free): JSON.parse wave4 specs + node -c schema-apply.js
```
