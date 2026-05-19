# Session 165 Prompt: slice-0 P1-Update still THE open gate (Track B / W5-W6 solo work cleared S164)

## Session 164 Summary

Colleague-blocked on the headline threads (Connor for slice-0 §A, SME for Track B Primary-Contact, Sarah for Phase II inventory), so this was a **solo-runway session** on the Reviewer-domain Postgres→Dataverse area. Net: a stale carryover was corrected against ground truth, the spec'd hard-prereq restore script was built + twice Codex-reviewed, and a latent P0-gate blind spot was fixed via the mandated coverage-lessons protocol. **slice-0 §A is UNCHANGED and remains the single open destructive-carryover gate** (no Connor test sent, no waiver authorized — untouched this session).

### What was completed (all in commit `b5d3f48`)

1. **"Reviewer Manager→Dataverse" carryover was STALE — corrected.** The engineering migration is **DONE** (W5/W6, 2026-05-12), re-verified S164: zero `lib/services/**` or `pages/api/**` runtime code touches Postgres `reviewer_suggestions`/`researchers`; it's script-only/drain-only. Wrote the missing phantom memory `project-reviewer-identity-fragmentation` (referenced by `DATAVERSE_POWER_TOOLS_DESIGN.md:344` + old SESSION_PROMPT, never written). Corrected stale atlas claims (`postgres-reviewer-suggestions.md` — re-derived the read/write path lists from a full codebase grep; `postgres-researchers.md` findResearcher open-Q resolved; `dataverse-wmkf-appreviewersuggestion.md` grant_cycles dep resolved).
2. **Built `scripts/restore-reviewer-suggestion-cleanup-backup.js`** — the plan's spec'd hard-prerequisite for the post-pilot one-shot cleanup (Rollback §3 / dependency step 15). Defines backup-blob contract v1 (cleanup script doesn't exist yet). Dry-run verified **live read-only** (WOULD-CREATE/WOULD-UPDATE branches). **NOT** wired to a real cleanup; `--commit` not run (no backup artifact exists until the cleanup script is built — post-pilot).
3. **Two Codex reviews (verbatim-shared, per memory).** Fixed a **BLOCKER** (`selected` silently defaulted to `true` → misclassified unengaged rows; now REQUIRED-boolean hard-SKIP gate) + idempotency-wording CONCERN (find-then-update/create, not a true alt-key PATCH). Resolved the plan's **restore-script filename double-booking** per Codex (distinct names — `restore-reviewer-suggestion-cleanup-backup.js` (A, built) vs `restore-postgres-drain-table-backup.js` (B, NOT built)); corrected 3 stale "Idempotent via alt key" plan phrases.
4. **Atlas-gate blind spot fixed via the mandated coverage-lessons protocol.** Codex caught `check-application-state-atlas.js` scanning `.js` only (6 `.mjs` already reference real entities — latent, not a live incident). Order followed: `CLAUDE_COVERAGE_LESSONS.md` pattern E → self-test `.mjs` fixture (fail-before `1/12` → pass-after `12/12`) → gate widened to `.js|.mjs|.cjs` → all 3 P0 gates green. Committed together.
5. **W5/W6 scope confirmed: nothing overdue.** W5 + W6-step-1 shipped 2026-05-12; everything remaining is post-pilot / ≥2026-07-01 / destructive-carryover-gated.

### Commits (S164, `main`)
- `b5d3f48` — restore script + Atlas-gate .mjs fix + Reviewer Manager ground-truth + double-booking resolution (9 files, +317/−25)
- (this /stop) — Document Session 164 and create Session 165 prompt

Memory (harness store, NOT repo — won't sync via git): NEW `project-reviewer-identity-fragmentation`, NEW `decision-module-typeless-warning-accept`; `MEMORY.md` index updated.

## Potential Next Steps

### A. slice-0 / P1-Update — STILL THE open gate (destructive carryover; NOT green-lit; UNCHANGED since S163)

🔴 Untouched S164. Connor resolved the S162 *design*; the P1-Update *binding* (does the parent-status trigger filter bind/fire on a `statecode`-only deactivation Update) is unverified. Two mutually-exclusive paths, **neither done**:
1. **Send Connor the test.** Email draft is the **local uncommitted** `docs/INTAKE_PORTAL_ITEM_6_CONNOR_EMAIL.md` (see gotcha — not on the other Mac). Attach committed `INTAKE_PORTAL_ITEM_6_CONNOR_CORE_GATE.md`. Await Step 11 evidence + Step 12 verdict.
2. **Authorize the waiver.** Drafted UNAUTHORIZED in `INTAKE_PORTAL_ITEM_6_P1UPDATE_TEST_DRAFT_v5.md` Artifact 1. Justin's signature line blank by design; do not self-authorize.

On a clean Connor result OR authorized waiver, deploy sequence (re-verify destructive state at the moment): re-run BOTH point-in-time probes; grep live callers; `apply-dataverse-schema.js --target=prod --wave=4 --execute`; `scripts/extend-apprequestperson-role-picklist.mjs`; `node scripts/setup-database.js` (V30); post-deploy Atlas amendments + 3 P0 gates. Specs at `lib/dataverse/schema/wave4*/` — do NOT re-author. Optional tidiness: land v5/handout as the real §5 in `docs/INTAKE_PORTAL_ITEM_6_MAKER_PORTAL_TESTS.md`.

### B. Track B floor — follow-ups (parked; untouched S163/S164; not blocking slice-0)
- **Primary Contact final shape — PARKED pending the SME reply** (SoCal Request-PC vs Org-PC). Provisional: forced-choice Request-PC vs Org-PC (both Tier-2) + duplicate-contact caveat. Do not ratify until SME answers.
- **Name-normalized re-count** — quantify *true* person-divergence vs the inflated ~31% GUID rate (solo, read-only; pre-loads the parked PC decision).
- **Donor** = Tier-2 fast-follow — non-misleading "directed-by sponsor" label + `wmkf_donors` entity-shape probe before build.
- **Prototype** — user's stated path: NL→QuerySpec on-ramp into the unchanged confirm seam (additive, not a rewrite).

### C–F.
- ~~Reviewer Manager→Dataverse~~ **CLOSED S164** — migration done W5/W6; only residue is (i) the gated destructive Postgres-table retirement (post-pilot ≥2026-07-01, carryover-hygiene) and (ii) the explicitly out-of-scope fragmentation census. Neither is live build work. Memory `project-reviewer-identity-fragmentation` is authoritative.
- **`scripts/restore-postgres-drain-table-backup.js` (the "B" restore) — NOT built.** Spec'd at plan line 801; ~30-line JSONL→INSERT for the dropped Postgres drain tables. Post-pilot, ≥2026-07-01, destructive-carryover-gated — NOT now; write it "with the actual row format in front of you" (Codex's W6 note).
- Field Set D doc-label collision (Connor; `check:memory-drift` red BY DESIGN — do not silence); COI policy wording; revert temp role elevations (treat as unverified carryover — verify before acting); Sarah's Phase II Research field inventory; data-quality `#1001205`/`#1001249`.

## Calendar Checkpoints (soft — Connor good-faith; report factually, not "overdue")
- **2026-05-19** — slice-0 deploy *target* (soft). Still gated on P1-Update. Not "missed" — gated by an honest open question.
- **2026-05-26** — dry-run: flip a throwaway test request to `'Phase II Pending'`, watch PA flows fire.
- **2026-05-30** — go/no-go. **2026-06-01** — pilot accepts submissions (mid-June Phase II Research).
- **≥2026-07-01** — post-pilot drain-only Postgres table drop (needs the "B" restore script built first).

## Gotchas (still live — carried forward)
- 🔴 **slice-0 is destructive carryover; P1-Update is the single open gate.** Design resolved S162; binding unverified. No `--execute` autonomously; re-run both point-in-time probes at deploy.
- 🔵 **Connor email = intentionally uncommitted local working file** (`docs/INTAKE_PORTAL_ITEM_6_CONNOR_EMAIL.md`). NOT on the other Mac — regenerate from the committed handout if resuming elsewhere.
- 🟢 **Present Codex output VERBATIM**, primary, immediately, before any paraphrase (memory `feedback-share-codex-verbatim`). Run codex-rescue **synchronously**, not background.
- 🟡 **Phantom-memory pattern** — this repo's docs cite memories that were never written (`project_reviewer_identity_fragmentation` [now written S164], `project_reviewer_postgres_to_dataverse_migration`, `project_w6_table_drop_pending` [still phantom]). Verify a cited memory exists before trusting "see memory X"; don't fabricate its contents.
- 🟢 **Coverage tools must scan `.js`, `.mjs`, `.cjs`** — `CLAUDE_COVERAGE_LESSONS.md` pattern E (added S164). Any new/edited `scripts/check-*.js` needs the matching self-test fixture; `check:atlas:self-test` now 12/12.
- 🟢 **MODULE_TYPELESS warning = ACCEPTED (Option E)** — memory `decision-module-typeless-warning-accept`. Never do a broad `.js`→`.mjs` rename (D); F (gradual CJS) only if ever revisited. Do not re-litigate.
- 🔴 **"PI" / "primary contact" / "donor" are per-program disambiguation hazards** — field dictionary per-program, not entity-global (memory `dataverse-export-floor-scoping`).
- 🔵 **Blob = TWO stores, never conflate** — public `phase-ii-summaries-blob` (`BLOB_READ_WRITE_TOKEN`) vs Dataverse-export private `dvx-export-private` (`DVX_BLOB_RW_TOKEN`).
- 🔴 **Living-taxonomy lesson** — `lib/services/dataverse-export/{constants,live-taxonomy,compiler}.js` names verified against a live probe, not fixtures.
- **`check:memory-drift` red by design** (Field Set D). Advisory, NOT a P0 blocker. Do not silence.
- **dataverse-export tests use `@jest-environment node`**; live repro = standalone env-loaded `.mjs` (.env.local, client_credentials, FetchXML aggregate, NEVER OData `/$count`).
- **iCloud `.nosync` can clear `node_modules`** at session start — `npm ci` restores; `.next`/`.next.nosync/` + `AGENTS.md`/`.agents/` (Codex artifacts) untracked is normal — do NOT commit the latter.

## Key Files Reference

| File | Purpose |
|------|---------|
| memory `slice0-deactivate-not-delete-recalc` | P1-Update is the open gate; deactivate-not-delete — READ FIRST for §A |
| memory `feedback-share-codex-verbatim` | Codex output verbatim, primary, immediately — READ before any Codex run |
| memory `project-reviewer-identity-fragmentation` | Reviewer Manager→Dataverse DONE; residue gated/out-of-scope — READ for C–F |
| memory `decision-module-typeless-warning-accept` | Accept E, never broad D — do not re-litigate |
| memory `dataverse-export-floor-scoping` / `akoya-temporal-axis-encodings` | Track B floor + per-program hazards / meeting-date canonical — READ for §B |
| `docs/INTAKE_PORTAL_ITEM_6_CONNOR_CORE_GATE.md` | Connor send-handout (committed) — Steps 1–12 |
| `docs/INTAKE_PORTAL_ITEM_6_CONNOR_EMAIL.md` | Connor email — LOCAL working file, uncommitted |
| `docs/INTAKE_PORTAL_ITEM_6_P1UPDATE_TEST_DRAFT_v5.md` | Full runbook + waiver (Artifact 1, UNAUTHORIZED) |
| `docs/INTAKE_PORTAL_ITEM_6_DISCUSSION.md` §0 | Authoritative Item-6 decision record |
| `lib/dataverse/schema/wave4*/` | slice-0 specs — READY, do NOT re-author |
| `scripts/probe-apprequestperson-role-data.js` · `scripts/probe-slice0-attr-collision.mjs` | The two BLOCKING point-in-time pre-deploy probes |
| `scripts/restore-reviewer-suggestion-cleanup-backup.js` | S164 — the "A" Dataverse-suggestion restore (built; post-pilot use) |
| `docs/CLAUDE_COVERAGE_LESSONS.md` | Pattern E (`.mjs`/`.cjs` traversal) — READ before editing any `check-*` gate |

## Testing

```bash
npm run check:atlas && npm run check:atlas:self-test && npm run check:api-routes   # 3 P0 gates (green; self-test 12/12; api-routes=84)
node scripts/probe-apprequestperson-role-data.js     # exit 0=CLEAR; re-run at slice-0 deploy
node scripts/probe-slice0-attr-collision.mjs         # exit 0=CLEAR; re-run at slice-0 deploy
node scripts/check-memory-drift.js                   # advisory; exits 1 on Field Set D BY DESIGN
# restore script dry-run (read-only, safe): node scripts/restore-reviewer-suggestion-cleanup-backup.js --file <backup.json>
# Live probe pattern: standalone scripts/probe-*.mjs/.js — .env.local, client_credentials, FetchXML aggregate (NOT /$count)
```
