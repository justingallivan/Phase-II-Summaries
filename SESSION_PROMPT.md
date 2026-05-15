# Session 155 Prompt: Connor's Item 6 tests + schema slice 0 (carried, now date-critical) — and post-audit follow-ups

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

## Session 154 Summary

**Planned work (Connor Item 6 + schema slice 0) did NOT happen.** The session was consumed entirely by a memory/Atlas reconciliation audit triggered by the user's concern about stale memories causing rough sessions. All S154-prompt carryover (B–F below) is forward intact, untouched.

### What was completed

1. **Three-pass memory audit** (`.claude-memory/`, 64 files):
   - `docs/AUDIT_S154_MEMORY.md` — Claude V1 (weak; missed several major stale items)
   - `docs/AUDIT_S154_MEMORY_CODEX.md` — Codex V1 (caught what V1 missed)
   - `docs/AUDIT_S154_MEMORY_V2.md` — Claude V2 (full-rigor pass; confirmed Codex + 3 more Atlas-vs-code drifts)
2. **18 memory files reconciled** against grep/probe-verified live state (commit `bbe3df3`): reviewer-finder W3–W6 completion, accept/decline `respond.js` shipped, IRS load complete (1.26M rows), 2026-05-13→05-14 intake supersession, archive-path fixes, app counts (15→16, ~30→48), strategy posture reaffirmed.
3. **3 Atlas pages corrected** (commit `c6430e9`): `postgres-grant-cycles` (Dataverse-primary post-W3, 10 rows live not 0), `postgres-other-reviewer-tables` (proposal_searches JOIN retired), `dataverse-akoya-request` (Field Set D collision flagged, not silently rewritten).
4. **Memory-drift tooling** (commit `077e44d`): `scripts/reconcile-memory-claims.js` (Codex-built) + `scripts/check-memory-drift.js` gate (fixed to fail honestly on doc collisions + probe errors) + `npm run check:memory-drift`.
5. **Two Codex-review follow-ups** (`776f7a7`, `f604b12`): fixed a skipped dangerous file (`project_grant_lifecycle_states_confirmed.md`) and fully reconciled cron-as-live contradictions across the migration memory.

### Commits (this session)

- `bbe3df3` — Reconcile memory with verified live state
- `c6430e9` — Correct Atlas drift vs live code/state
- `077e44d` — Add memory-drift reconciliation tooling + audit records
- `776f7a7` — Fix two memory issues Codex review caught
- `f604b12` — Fully reconcile cron-as-live lines (Codex 2nd-review catch)
- (`/stop` doc commit) — this prompt + CLAUDE.md memory-drift note

### Process note for continuity (honest)

The audit converged to correct only with a Codex verification loop wrapped around every step. The recurring failure was fixing *named instances* rather than the *class* — it took two Codex review rounds on a single follow-up commit to converge. When delegating audit/reconciliation work, wrap it in external verification; the output is sound but the path to it required iteration.

## Open Items From This Session

### Field Set D doc-label collision (needs Connor — NOT a code fix)
`docs/atlas/dataverse-akoya-request.md` labels `wmkf_ai_fitassessment` + `wmkf_ai_fitrationale` as "Field Set D"; `docs/DYNAMICS_AI_FIELDS_SPEC_v3_cn.md:107` says Field Set D is PD Assignment (writes existing `wmkf_programdirector`, no new fields). Both fit fields are deployed+populated live — the deployment is fine, the label is ambiguous. `check:memory-drift` exits non-zero by design until this resolves. **Ask Connor which label is authoritative; do NOT silence the collision to green the gate.**

### `incompatible_shape` drift bucket — unbuilt
Codex flagged this as the highest-value missing detector (type/option-value/max-length mismatches between specs and live). `reconcile-memory-claims.js` doesn't compute it yet. Follow-up if memory-drift tooling is invested in further.

## Project Work — Carry Forward (S151 → S155, still untouched)

### A. Connor's Item 6 test results (PRIMARY — now date-critical)
2026-05-15 was Connor's flow-list reply target (today/overdue). 2026-05-19 schema-slice-0 deploy target. Branch on Item 6 test outcome (A+B hybrid vs Option B alone) per `docs/INTAKE_PORTAL_ITEM_6_DISCUSSION.md`.

### B. Pre-deploy live probe (BLOCKING before any schema deploy)
`node scripts/dynamics-schema-diff.js` — confirm no live values occupy `100000002`–`100000004` on `wmkf_apprequestperson.wmkf_role` before slice 0. (Atlas + V2 audit both note this is the only unverifiable slice-0 claim.)

### C. Write schema slice 0 JSON specs (when A clears)
Per `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md` 2026-05-14 entry: NEW `wmkf_proposalbudgetline` entity (9-value `wmkf_category` enum); EXTEND `wmkf_apprequestperson` (3 nullable fields + role enum 2→5 values); `akoya_request.wmkf_totalothersources` (Money). Roster is NOT a new entity. Budget authoritative spec: `docs/BUDGET_FORM_SPEC.md`.

### D. Atlas pages for new entities (alongside C)
NEW `docs/atlas/dataverse-wmkf-proposalbudgetline.md`; AMEND `docs/atlas/dataverse-wmkf-apprequestperson.md`.

### E. Apply `submission_jobs` to prod Postgres
`node scripts/setup-database.js` (V30 idempotent). Migration `009_submission_jobs.sql` exists.

### F. Low priority
COI policy body wording (Stage 2a); revert temp role elevations on prod app user (deferred until pilot settles per `project_wave1_pending.md`); Sarah's Phase II Research field inventory (Track 2).

## Calendar Checkpoints (today is 2026-05-15)

- **2026-05-15 (today)** — Connor flow-list reply target (overdue if unanswered).
- **2026-05-19** — Schema slice 0 deploy target. Blocked on A + pre-deploy probe (B).
- **2026-05-26** — Dry-run: flip throwaway test request to `'Phase II Pending'`, watch PA flows fire.
- **2026-05-30** — Go/no-go review.
- **2026-06-01** — Pilot accepting submissions for mid-June Phase II Research cycle.

## Gotchas

- **`check:memory-drift` is red by design** (Field Set D). It is advisory, NOT a P0 blocker (per CLAUDE.md memory-drift note). Don't "fix" it by silencing the collision.
- **Pre-deploy live probe on `wmkf_role` is non-negotiable** before schema slice 0.
- **Carryover hygiene:** the W6 Postgres table-drop (`project_w6_table_drop_pending.md`) triggers ≥ 2026-07-01 — not yet due. When it is, grep-verify the four drain-only tables have no live readers before any DROP (the audit confirmed readers are gone as of 2026-05-14, but re-verify at drop time).
- **iCloud sync can silently mutate the working tree** — if `git status` shows unexpected deleted/modified files, `git restore` is usually right. Home-Mac working copy: `~/Documents/Programming/Claude_Projects/WMKF_Apps/`.

## Key Files Reference

| File | Purpose |
|------|---------|
| `docs/AUDIT_S154_MEMORY_V2.md` | Full-rigor memory audit — per-file evidence; the actionable source |
| `scripts/reconcile-memory-claims.js` | Memory/Atlas/spec/live reconciliation; emits `docs/RECONCILIATION_REPORT.json` |
| `scripts/check-memory-drift.js` | Advisory CI gate (red by design on Field Set D) |
| `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md` | Authoritative slice-0 schema decisions (2026-05-14) |
| `docs/BUDGET_FORM_SPEC.md` | Authoritative `wmkf_proposalbudgetline` spec |
| `docs/INTAKE_PORTAL_ITEM_6_DISCUSSION.md` | Item 6 decision record (drives A) |

## Testing

```bash
npm run check:atlas && npm run check:atlas:self-test && npm run check:api-routes  # P0 gates (all green at S154 close)
node scripts/check-memory-drift.js  # advisory; exits 1 on Field Set D by design
```
