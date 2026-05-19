# Session 166 Prompt: memory-architecture root cause corrected; slice-0 awaiting Connor; AGENTS.md→symlink resolved

## Session 165 Summary

A docs/infra-integrity session. Net: Atlas Phase-1 canonical reconciliation shipped; the auto-generated `AGENTS.md` corruption was chased to root and resolved as a tracked symlink (Codex-verified end-to-end); slice-0 §A moved (Connor test SENT); and a **mid-session ground-truth error was caught and corrected** — the "memory doesn't propagate / iCloud" conclusion was wrong because it missed the git-tracked `.claude-memory/` store.

### What was completed

1. **Atlas Phase 1 (`984bae8`).** Reconciled `docs/atlas/postgres-grant-cycles.md` (was Dataverse-primary at top, "Review Manager reads Postgres" at tail — code-disproven: `render-emails.js:27`/`send-emails.js:43` import only `grant-cycles-dataverse`), `APPLICATION_STATE_ATLAS.md` index rows (grant_cycles drain-only; `wmkf_appgrantcycle` 10 rows not "empty"; `proposal_searches.grant_cycle_id` historical), and added a loud Field Set D blocker banner to `dataverse-akoya-request.md`. From `docs/DOCS_GROUND_TRUTH_AUDIT_2026-05-19.md` Findings #1/#2/#3. 5 gates green (sequential).
2. **AGENTS.md corruption → tracked symlink (`34e673c`, `5047d5e`, `bd93e6b`).** `AGENTS.md`/`.agents/` were a blind `s/Claude/Codex/` derivative of `CLAUDE.md` (false stack; **unsafe `VRP_ALLOWED_PROVIDERS=Codex`** vs real `claude`; nonexistent file refs). Codex-verified (synchronous rescue): Codex ingests literal `AGENTS.md` bytes as session `user_instructions` (a thin pointer = context-blind), no hook auto-regenerates it, only the manual `migrate-to-codex` skill writes it (unlink+recreate → severs a symlink visibly, never silent CLAUDE.md mutation). Resolution: `AGENTS.md` = tracked relative **symlink → CLAUDE.md** (mode 120000); `.agents/` gitignored; `CLAUDE.md` top note added. **Verified end-to-end**: a fresh Codex session's `user_instructions` = current CLAUDE.md via the symlink (incl. the just-added note; corrupted value gone).
3. **slice-0 §A moved — path (i) ACTIVE.** Justin emailed Connor the P1-Update core-gate test. Awaiting Step 11 evidence + Step 12 verdict. Gate still OPEN.
4. **Memory-architecture root cause (CORRECTED same session).** "Memories stopped propagating" → caused by the active write target silently shifting from git-tracked `.claude-memory/` to the per-machine `~/.claude/.../memory/` harness store ~S161–164. iCloud move can't fix it (harness store isn't in the repo) and adds git risk. The multi-session "phantom memory" belief was the same store-divergence artifact (the named memories DO exist in `.claude-memory/`). Authoritative: `.claude-memory/project_memory_two_stores_propagation.md`.

### Commits (S165, `main`, pushed)
- `984bae8` — Atlas Phase 1 reconciliation (+ audit doc)
- `34e673c` — gitignore Codex `AGENTS.md`/`.agents/`
- `5047d5e` — AGENTS.md thin pointer (intermediate, superseded)
- `bd93e6b` — **AGENTS.md → tracked symlink to CLAUDE.md** (final)
- (this `/stop`) — Document Session 165 + Session 166 prompt + corrected memory note

## Potential Next Steps

### ⚠️ ENV-0. Memory propagation — root cause FOUND; consolidation is an OPEN Justin decision (READ FIRST)
Full authoritative detail: **`.claude-memory/project_memory_two_stores_propagation.md`** (git-tracked, propagates).
- **TWO stores.** `.claude-memory/` = git-tracked, snake_case, ~73 files, **propagates via push/pull**, `/stop` commits it. `~/.claude/projects/<slug>/memory/` = kebab harness store the current build writes to, **per-machine, does NOT propagate**.
- **Decision (do not reconfigure env unilaterally — surface & propose):** (A, recommended) **repo OUT of iCloud** + reconverge on `.claude-memory/` as memory-of-record; harness store = scratch. (B) mirror harness→`.claude-memory/` at `/stop`, or sync only the harness dir. **Never** put `.git`/working tree in iCloud.
- **Until reconverged: dual-write** — anything that must reach the other Mac goes in a git-tracked file (`.claude-memory/`, `SESSION_PROMPT.md`, `docs/`), not only the harness store.
- iCloud state point-in-time S165 (this Mac, NOT durable): symlink + `.git` + `main==origin/main` intact, no `.icloud`/conflict-copies. `/start`'s `git rev-parse HEAD` is the early `.git`-corruption tripwire.

### A. slice-0 / P1-Update — STILL THE open gate (destructive carryover; NOT green-lit). Path (i) ACTIVE — test SENT to Connor; AWAITING Step 11 evidence + Step 12 verdict. Gate OPEN (sending ≠ clearing).
**Next-session action = be the verdict-checker** when Connor replies. Hold the verdict to Step 11 literals / Step 12 criteria, NOT a narrative "it works". 🔴 Motivated-reasoning guard: Justin told Connor "Plan B = lots of extra work" + Connor "thinking about how to make Plan A viable" — a FAIL is cheap/planned (→ Option B drain-side, **zero schema rework**, not a rollback). Full line-by-line acceptance checklist + the (a)–(d) guards: memory `slice0-deactivate-not-delete-recalc` S165 status block (kebab harness store — **also mirror its essence to `.claude-memory/` so it propagates**). Connor email = local-uncommitted `docs/INTAKE_PORTAL_ITEM_6_CONNOR_EMAIL.md`. Two mutually-exclusive clears: (i) Connor maker-portal VERIFIED on the deactivation-Update path, or (ii) authorized waiver (`..._P1UPDATE_TEST_DRAFT_v5.md` Artifact 1, UNAUTHORIZED — do not self-authorize). On clean VERIFIED (real path) OR waiver: re-run BOTH point-in-time probes; grep live callers; `apply-dataverse-schema.js --target=prod --wave=4 --execute`; `extend-apprequestperson-role-picklist.mjs`; `setup-database.js` (V30); post-deploy Atlas + 3 P0 gates. Specs `lib/dataverse/schema/wave4*/` — do NOT re-author. `--execute` never autonomous.

### B. Track B floor — follow-ups (parked; not blocking slice-0)
- Primary Contact final shape — PARKED pending SME (SoCal Request-PC vs Org-PC). - Name-normalized re-count (solo, read-only). - Donor Tier-2 fast-follow (`wmkf_donors` shape probe first). - Prototype: NL→QuerySpec on-ramp into the unchanged confirm seam (additive).

### C–F.
- Reviewer Manager→Dataverse **CLOSED S164** (residue gated/out-of-scope; memory `project-reviewer-identity-fragmentation`). - `scripts/restore-postgres-drain-table-backup.js` ("B" restore) NOT built — post-pilot ≥2026-07-01, destructive-carryover-gated. - Field Set D doc-label collision (Connor; `check:memory-drift` red BY DESIGN — do not silence). - COI policy wording; revert temp role elevations (unverified carryover — verify first); Sarah's Phase II inventory; data-quality `#1001205`/`#1001249`.

## Calendar Checkpoints (soft — report factually, not "overdue")
- **2026-05-19** slice-0 deploy *target* (soft) — gated on P1-Update, not "missed". **2026-05-26** dry-run. **2026-05-30** go/no-go. **2026-06-01** pilot opens. **≥2026-07-01** post-pilot drain-table drop (needs "B" restore built first).

## Gotchas (still live)
- 🔴 **TWO memory stores — see ENV-0.** `.claude-memory/` (git, propagates) vs `~/.claude/.../memory/` (harness, per-machine). Dual-write durable knowledge to a git-tracked file. **"Phantom memory" was a store-divergence artifact** — `project_w6_table_drop_pending` & `project_reviewer_postgres_to_dataverse_migration` DO exist in `.claude-memory/`; check BOTH stores before calling a memory phantom.
- 🟢 **`AGENTS.md` is a tracked symlink → `CLAUDE.md`** (Codex-verified it reads through it). Do NOT run the `migrate-to-codex` skill here (severs it). If `AGENTS.md` shows as a regular file in `git status`: `git checkout AGENTS.md`. `.agents/` gitignored. Do not re-litigate.
- 🔴 **slice-0 destructive carryover; P1-Update single open gate.** No `--execute` autonomously; re-run both point-in-time probes at deploy.
- 🔵 **Connor email** = intentionally uncommitted local file; regenerate from the committed `CONNOR_CORE_GATE.md` handout if on another Mac.
- 🟢 **Present Codex output VERBATIM**, primary, before any paraphrase (`feedback_codex_relay_verbatim`). Run codex-rescue **synchronously** (`--wait`) — background wedged on a DNS-blocked curl S165; cancel+resume+`--wait`+no-network is the recovery.
- 🟢 **Reconcile docs, don't append-patch**; surface ALL external-review findings verbatim; **probe before concluding** (S165 ENV-0 error = concluded before probing `.claude-memory/`).
- 🔴 **"PI"/"primary contact"/"donor" are per-program hazards** (`dataverse-export-floor-scoping`). 🔵 **Blob = TWO stores** (`phase-ii-summaries-blob`/`BLOB_READ_WRITE_TOKEN` vs `dvx-export-private`/`DVX_BLOB_RW_TOKEN`).
- **`check:memory-drift` red by design** (Field Set D) — advisory, do not silence. **Coverage tools scan `.js|.mjs|.cjs`** (pattern E). **MODULE_TYPELESS = accepted (E)** — do not re-litigate.
- **iCloud `.nosync` can clear `node_modules`** at session start — `npm ci` restores; `.next`/`.next.nosync/` untracked is normal.

## Key Files Reference

| File | Purpose |
|------|---------|
| `.claude-memory/project_memory_two_stores_propagation.md` | ENV-0 authoritative (git-tracked, propagates) — READ FIRST |
| memory `slice0-deactivate-not-delete-recalc` (harness) | §A verdict-checker checklist + (a)–(d) guards — READ for §A |
| `docs/INTAKE_PORTAL_ITEM_6_CONNOR_CORE_GATE.md` | Connor send-handout (committed), Steps 1–12 |
| `docs/INTAKE_PORTAL_ITEM_6_DISCUSSION.md` §0 | Authoritative Item-6 decision record (P1-Update gate) |
| `docs/INTAKE_PORTAL_ITEM_6_P1UPDATE_TEST_DRAFT_v5.md` | Full runbook + waiver Artifact 1 (UNAUTHORIZED) |
| `lib/dataverse/schema/wave4*/` | slice-0 specs — READY, do NOT re-author |
| `scripts/probe-apprequestperson-role-data.js` · `scripts/probe-slice0-attr-collision.mjs` | Two BLOCKING point-in-time pre-deploy probes |
| `docs/DOCS_GROUND_TRUTH_AUDIT_2026-05-19.md` | S165 audit — Phase 2–5 worklist (memory cleanup, Item-6 canonicalization, gates) |
| `AGENTS.md` | Symlink → CLAUDE.md (do not edit directly; do not run migrate-to-codex) |

## Testing

```bash
npm run check:atlas && npm run check:atlas:self-test && npm run check:api-routes   # 3 P0 gates (green S165; self-test 12/12; api-routes=84)
test -L AGENTS.md && readlink AGENTS.md                                            # must be: CLAUDE.md (symlink intact)
git rev-parse HEAD && git status --porcelain                                       # .git-corruption tripwire (iCloud)
node scripts/probe-apprequestperson-role-data.js && node scripts/probe-slice0-attr-collision.mjs  # exit 0=CLEAR; re-run at slice-0 deploy
node scripts/check-memory-drift.js                                                 # advisory; exits 1 on Field Set D BY DESIGN
```
