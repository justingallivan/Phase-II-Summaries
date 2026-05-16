# Session 157 Prompt: slice-0 deploy is the calendar-critical path (UNTOUCHED in S156); Dataverse Power Tools scoped + probed

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

## ⏰ READ THIS FIRST — slice-0 was NOT advanced in S156

Session 156 pivoted entirely into a **new** workstream (Dataverse Power Tools — design/scoping/probes) at the user's direction. **The slice-0 intake-portal deploy — the calendar-critical pilot path — was not touched.** It remains exactly where S155 left it. Today is 2026-05-15; the **2026-05-19 slice-0 deploy target is 4 days out** and still gated on Connor's Item 6. If the pilot timeline matters, slice-0 is the priority next session, not Power Tools.

## Session 156 Summary

Two unrelated things happened:

1. **`check:doc-currency` red gate fixed** (`a1a298c`, pushed). False positive: `docs/AUDIT_S154_MEMORY_CODEX.md` quotes a stale "publications still load-bearing" memory claim *in order to mark it STALE*. Added the basename to the pattern's `allow` list (same category as the already-listed `DOC_TRIAGE_2026-05-07.md`); doc unchanged; `check:doc-currency:self-test` 12/12.
2. **Dataverse Power Tools — scoped, Codex-reviewed (×3), probed, analyzed.** New two-app concept for gaps Dynamics Explorer can't fill (Track A = staff find-a-record + edit-a-field; Track B = high-volume filtered Excel export). Full design `docs/DATAVERSE_POWER_TOOLS_DESIGN.md`; memory `project_dataverse_power_tools.md`.

### What was completed (Power Tools)

- **Design converged** via a long interview: two separate apps, shared "AI proposes / deterministic code performs / human-confirm gate" spine; Track B = plain-English structured filter builder + mandatory composition/era disclosure (AI demoted to phase-2 on-ramp), refine-in-Excel; threat model = optimize against the *plausible* wrong answer.
- **Three Codex reviews folded in** (factual corrections; `$count` truncation reframed; attribution/restriction/dangerous-scalar promoted to explicit Track A write decisions).
- **Probes executed (read-only):**
  - `probe-dataverse-audit-capability.js` — aggregate `/audits` blocked (app SP lacks `ReadAuditSummary`); per-record `RetrieveRecordChangeHistory` works.
  - `probe-akoya-request-discriminators.js` — **true `akoya_request` count ~25,561; OData `/$count` caps at 5,000** (silent ~80% undercount — the trigger). Discriminator is a composite (`wmkf_request_type` × `wmkf_grantprogram` × `akoya_requesttype`); all user-described slices confirmed w/ volume; 4,634 null-program rows; `createdon` 2023-dominated = bulk migration import.
  - `analyze-akoya-request-change-of-state.js` → `analyze-akoya-request-staff-edits.js` — 800 Akoya-native records, 800/800, no throttle. Raw frequency disconfirmed; **staff-attributed + content-field-shaped** signal usable; empirical WMKF maintenance-staff roster produced.

### Commits (S156)
- `a1a298c` — Allowlist AUDIT_S154_MEMORY_CODEX.md on doc-currency pattern (pushed)
- `5b2de82` — Scope Dataverse Power Tools (pushed)
- `ccdbbd3` — Consolidated design + audit-probe finding, Codex-reviewed (pushed)
- `3da5b36` — Gemini-authored architecture diagrams (pushed)
- `eb352b4` — Fold discriminator/era probe into doc + Atlas + memory (pushed at /stop)
- `d5f7984` — Track A change-of-state analysis executed, 800 records (pushed at /stop)
- (`/stop` doc commit) — this prompt

## Carry Forward

### A. slice-0 deploy — PRIMARY, calendar-critical, UNTOUCHED in S156
Connor's Item 6 maker-portal Tests 1+2 are the hard blocker (`docs/INTAKE_PORTAL_ITEM_6_DISCUSSION.md` / `INTAKE_PORTAL_DESIGN.md:440`). Branch A+B-hybrid vs Option-B-alone on the outcome. **Specs are READY — do NOT re-author** (`lib/dataverse/schema/wave4*/`). Deploy procedure when A clears: (1) re-run BLOCKING probe `node scripts/probe-apprequestperson-role-data.js` (must exit 0; point-in-time, was clear 2026-05-15); (2) Connor review of `wmkf_proposalbudgetline` name / cost-share label form / `wmkf_portal_membership` shape; (3) `node scripts/apply-dataverse-schema.js --target=prod --wave=4 --execute` then `node scripts/extend-apprequestperson-role-picklist.mjs`; (4) `node scripts/setup-database.js` (V30 `009_submission_jobs.sql`, prod Postgres); (5) post-deploy: confirm entity-set pluralization, move both entities out of Atlas "Known gaps", re-run `check:atlas` + `:api-routes`.

### B. Dataverse Power Tools — gated, no v1 build yet
Track B blocked on two non-solo evidence tasks: **AkoyaGo excavation** (trusted-view *operational filters* + exact Akoya-native migration cutover date) and **Connor session** (recent-era taxonomy + remap history). Track A write path blocked on 3 explicit decisions (attribution / restriction / dangerous-scalar — see doc). Solo-actionable residual: tighten the `overriddencreatedon` / true-cutover question with a corrected query. **Do not start v1 build — design only, evidence-gated.**

### Doc-vs-catalog gap (needs Connor — do NOT auto-absorb)
`contact.wmkf_portal_oid` + `akoya_request.wmkf_phaseiisubmittedat`/`wmkf_phaseiisubmittedby` in `INTAKE_PORTAL_DESIGN.md:621` next-steps but absent from the 2026-05-14 catalog. Reconcile with Connor: slice-0, deferred, or dropped.

### F. Low priority
COI policy body wording (Stage 2a); revert temp role elevations on prod app user (deferred until pilot settles per `project_wave1_pending.md`); Sarah's Phase II Research field inventory (Track 2).

## Open Items (unchanged, still pending Connor)

- **Field Set D doc-label collision** — `dataverse-akoya-request.md` vs `DYNAMICS_AI_FIELDS_SPEC_v3_cn.md:107`. `check:memory-drift` red by design until resolved. Ask Connor; do NOT silence the collision.
- **`incompatible_shape` drift bucket** — unbuilt in `reconcile-memory-claims.js`. Follow-up only if memory-drift tooling is invested in further.
- **Memory audit item 7** — frontmatter shape inconsistent (system-prompt spec wants nested `metadata.type`; corpus uses top-level `type:`). Deferred; not urgent.

## Calendar Checkpoints (S156 closed 2026-05-15)

- **2026-05-15** — Connor flow-list reply target (OVERDUE).
- **2026-05-19** — Slice-0 deploy target (4 days out; slice-0 untouched in S156). Specs READY; gated on A (Connor Item 6) + re-probe + Connor name/shape review.
- **2026-05-26** — Dry-run: flip throwaway test request to `'Phase II Pending'`, watch PA flows fire.
- **2026-05-30** — Go/no-go review.
- **2026-06-01** — Pilot accepting submissions for mid-June Phase II Research cycle.

## Gotchas

- **slice-0 specs already exist (`lib/dataverse/schema/wave4*/`).** Do NOT re-author. Pre-deploy probe is `scripts/probe-apprequestperson-role-data.js` (the old `dynamics-schema-diff.js` instruction is dead).
- **slice-0 scope is 4 items, not 3** (`project_slice0_scope.md`); trust the 2026-05-14 `INTAKE_PORTAL_SCHEMA_CHANGES.md` catalog.
- **`check:doc-currency` red was a false positive — fixed this session** (`a1a298c`); allowlist is the sanctioned remedy for historical/teaching docs that quote stale claims to refute them.
- **`check:memory-drift` is red by design** (Field Set D). Advisory, NOT a P0 blocker. Don't silence it.
- **OData `/$count` caps at 5,000 in Dataverse** — never trust it for totals; use FetchXML aggregate / RetrieveTotalRecordCount (now a hard Track B invariant in the design doc).
- **Power Tools change-history canonical method:** classify changing users via `systemuser` metadata (`applicationid` ⇒ app user, definitive) + explicit vendor name exclusion (`Bromelkamp` = AkoyaGO vendor, `# ` app users); name-regex alone missed `Bromelkamp Admin`.
- **W6 Postgres table-drop** (`project_w6_table_drop_pending.md`) triggers ≥ 2026-07-01 — not yet due. Grep-verify the 4 drain-only tables have no live readers before any DROP. **Unverified-until-checked destructive carryover.**
- **iCloud sync can silently mutate the working tree** — `git restore` usually right. Gemini may also drop `docs/DIAGRAM_*.md` into the tree (vouched/tracked S156). Home-Mac copy: `~/Documents/Programming/Claude_Projects/WMKF_Apps/`.
- **Codex relay rule** (`feedback_codex_relay_verbatim.md`): a Codex response is delivered verbatim as the entire message — no commentary before/after; decisions in a separate turn.
- **Codex background-subagent caveat:** backgrounded `codex:codex-rescue` can't surface the Bash-permission prompt and fails; run Codex reviews in the **foreground**. `Bash(node:*)` is already allowlisted yet didn't help backgrounded subagents — a settings allowlist entry is NOT the fix.

## Key Files Reference

| File | Purpose |
|------|---------|
| `lib/dataverse/schema/wave4/` + `wave4-existing/` | slice-0 specs (READY; not deployed) |
| `scripts/probe-apprequestperson-role-data.js` | BLOCKING slice-0 pre-deploy probe (re-run at deploy) |
| `scripts/extend-apprequestperson-role-picklist.mjs` | `wmkf_role` 2→5 expansion (after wave apply) |
| `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md` | Authoritative slice-0 catalog (2026-05-14) |
| `docs/INTAKE_PORTAL_ITEM_6_DISCUSSION.md` | Item 6 decision record (drives slice-0 A) |
| `docs/DATAVERSE_POWER_TOOLS_DESIGN.md` | Power Tools full design (Codex-reviewed; evidence-gated) |
| `scripts/probe-akoya-request-discriminators.js` | Power Tools: discriminator/era probe (done) |
| `scripts/analyze-akoya-request-staff-edits.js` | Power Tools: staff-edit analysis (canonical method) |
| `.claude-memory/project_dataverse_power_tools.md` | Power Tools state + canonical method |

## Testing

```bash
npm run check:atlas && npm run check:atlas:self-test && npm run check:api-routes  # P0 gates (green at S156 close)
npm run check:doc-currency && npm run check:doc-currency:self-test                # green at S156 close (a1a298c)
node scripts/check-memory-drift.js   # advisory; exits 1 on Field Set D by design
# slice-0 spec sanity (network-free): JSON.parse wave4 specs + node -c schema-apply.js
```
