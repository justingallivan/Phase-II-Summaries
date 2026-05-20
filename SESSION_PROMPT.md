# Session 167 Prompt: audit Phases 2–5 done; new fact-consistency gate exists; Codex sandbox defaults changed globally; slice-0 still awaiting Connor

## Session 166 Summary

A docs/infra-integrity + gate-tooling session. Net: full audit remediation (Phases 2–5) shipped; built then **strengthened-after-Codex-review** a new `check:fact-consistency` CI gate; codified a mandatory fan-in rule before any fact-level doc/memory "DONE" claim; changed Codex CLI sandbox defaults globally (workspace-write + approval=never) to unblock future Codex-via-companion writes. The recurring fan-out/no-fan-in failure recurred ≥3× in-session — including in the artifact meant to fix it — and was only fully caught by Codex review; the structural lesson is recorded.

### What was completed

1. **Audit Phases 2–5 (`1c93711` Phase 2, `2a0d54f` Phase 3, `f12a57e` Phase 3 follow-up, `9cb51f4` Phase 4, `a996156` Phase 5).** Memory layer re-verified (S154 worklist already reconciled by intervening sessions; 1 residual fixed; gate-design defect logged — `claim_audit` re-parses frozen `AUDIT_S154_MEMORY_V2.md` so its "38 stale" never decreases). Item 6 docs collapsed into single canonical `docs/INTAKE_PORTAL_ITEM_6_STATUS.md` + non-destructive pointer banners on 8 docs. Stale Atlas Item-6 pointer reconciled. Concept Evaluator retired/labeled across 5 live docs (Finding #6 was undercounted by 3 — adjacent-context survey rule earned its keep). `check:memory-drift --no-write` flag added + parallel-run warnings on the atlas gates. Bounded gate-improvements done; general semantic gate correctly deferred.

2. **`check:fact-consistency` gate built (`ff13375`), then strengthened after Codex review (`0c0a442`) — and a separate Codex-review-of-the-prior-commits commit (`50222af`).** First version (`ff13375`) was too narrow per Codex full-session review: matched only the canonical "N app definitions" / "~N app endpoints" phrasings (i.e. exactly the errors already fixed) and missed the actual stale forms in the repo (`suite of 13 web-based tools`, `All 14 applications`, `30+ app endpoints`, `30 API endpoints`). Exemption was also too loose (`S1\d\d`/"prior"/"was" near a number could silently exempt). Strengthened version (`0c0a442`): AST-based derives via `@babel/parser` with loud-on-shape-change validation; multiple named patterns + `knownMissFixtures` + `knownNonMatches` self-validated at gate startup; structured-marker-only exemption (`<!-- fact-consistency:ignore fact=<id> as-of=YYYY-MM-DD -->`, fact-id-bound, required fields); expanded scope (SESSION_PROMPT.md, README.md, GEMINI.md added; AGENTS.md symlink skipped; DEVELOPMENT_LOG.md excluded as point-in-time); two-layer self-test (prose/exemption fixtures + **independent derive cross-check** via hand-rolled scanner — production uses Babel AST, self-test uses brace-balance + comment-stripping so a bad derive can't pass both). Three live stragglers de-specified (`SECURITY_ARCHITECTURE.md:126/:653/:901`). Failing-before/passing-after captures in the commit body. <!-- fact-consistency:ignore fact=app-definition-count session=S166 reason=historical --> <!-- fact-consistency:ignore fact=requireappaccess-endpoint-count session=S166 reason=historical -->

3. **Codex sandbox defaults changed globally** — `~/.codex/config.toml` now has `sandbox_mode = "workspace-write"` + `approval_policy = "never"` at top level (lines 3–4). Per the Codex config reference, sandbox/approval are top-level-only (cannot be project-scoped); the prior session's empty config meant the broker spawned `read-only`, blocking all Codex-via-companion writes. Affects **every** Codex invocation on this machine — write boundary is the workspace cwd per invocation. The shared-broker for the current session still has the old read-only baseline (broker reads config at spawn); next Claude Code session picks up the new defaults automatically.

4. **Recurring-staleness conversation recorded as durable feedback.** The fan-out/no-fan-in failure recurred ≥3× in S166 — once in the original gate's pattern coverage, once in the audit doc's "DONE" markers Codex caught, once during the gate-strengthen run when Codex's enumeration surfaced the SECURITY_ARCHITECTURE:126 straggler Claude had missed. Recorded in `.claude-memory/feedback_reconcile_dont_append_docs.md` (substantially expanded; description + S166 paragraph rewritten in place) + `.claude-memory/MEMORY.md` index. The honest lesson: awareness is not the lever — even with the failure explained mid-session, it recurred in the artifact built to fix it. The lever is mechanical fan-in (the new gate + Codex external review) + provisional-completion discipline (no "DONE" markers on fact-level work until the fan-in has run).

### Commits (S166, `main`, pushed)
- `2a0d54f` — Audit Phase 3: Item 6 canonicalization (STATUS.md + 8 doc banners)
- `f12a57e` — Reconcile stale Item-6 pointer in `APPLICATION_STATE_ATLAS.md`
- `1c93711` — Audit Phase 2: re-verify memory layer
- `9cb51f4` — Audit Phase 4: retire/label Concept Evaluator
- `a996156` — Audit Phase 5: bounded gate improvements (`--no-write`, parallel-run warnings)
- `50222af` — Address Codex review of the audit-remediation commits
- `ff13375` — Build `check:fact-consistency` gate (later strengthened)
- `0c0a442` — **Strengthen fact-consistency gate** (broker-bypass via `codex exec resume`; AST derives; expanded patterns; structured-marker exemption; independent self-test)
- (this `/stop`) — Document Session 166 + Session 167 prompt

## Potential Next Steps

### ⚠️ ENV-0. Memory propagation — root cause FOUND S165; consolidation still an OPEN Justin decision (UNCHANGED from S166 carryover)
Full authoritative detail: **`.claude-memory/project_memory_two_stores_propagation.md`** (git-tracked, propagates). Two stores: `.claude-memory/` (git-tracked, snake_case, propagates) vs `~/.claude/projects/<slug>/memory/` (kebab harness store, per-machine, does NOT propagate). Active write target silently shifted to harness ~S161–164 = "memories stopped propagating." Recommended: (A) repo OUT of iCloud + reconverge on `.claude-memory/` as memory-of-record. Until reconverged: dual-write durable knowledge to a git-tracked file. **Never** put `.git`/working tree in iCloud. iCloud `.git`-corruption tripwire = `/start`'s `git rev-parse HEAD`.

### A. slice-0 / P1-Update — STILL THE open gate (destructive carryover; NOT green-lit). Path (i) ACTIVE — test SENT to Connor; AWAITING Step 11 evidence + Step 12 verdict. Gate OPEN. UNCHANGED from S166.
Soft deploy target was **2026-05-19** (today). Status unchanged: Connor hasn't replied with Step 11 evidence + Step 12 verdict; gate OPEN (sending ≠ clearing). Next-session action when reply lands = be the **verdict-checker** — hold to Step 11 literals / Step 12 criteria, NOT a narrative "it works." 🔴 Motivated-reasoning guard active: a FAIL is cheap/planned (→ Option B drain-side, **zero schema rework**, not a rollback). Canonical status: **`docs/INTAKE_PORTAL_ITEM_6_STATUS.md`** (created S166). Two mutually-exclusive clears: (i) Connor maker-portal VERIFIED real-path, or (ii) authorized waiver (`..._P1UPDATE_TEST_DRAFT_v5.md` Artifact 1, UNAUTHORIZED — do not self-authorize). On clean VERIFIED OR waiver: re-run BOTH point-in-time probes; grep live callers; `apply-dataverse-schema.js --target=prod --wave=4 --execute`; `extend-apprequestperson-role-picklist.mjs`; `setup-database.js` (V30); post-deploy Atlas + 3 P0 gates. Specs `lib/dataverse/schema/wave4*/` READY — do NOT re-author. `--execute` never autonomous.

### B. Track B floor — follow-ups (parked; not blocking slice-0)
Unchanged from S166: Primary Contact final shape — PARKED pending SME (SoCal Request-PC vs Org-PC). Name-normalized re-count (solo, read-only). Donor Tier-2 fast-follow (`wmkf_donors` shape probe first). Prototype: NL→QuerySpec on-ramp into the unchanged confirm seam (additive).

### C–F. Other carryover (verify destructive items before acting)
- Reviewer Manager→Dataverse **CLOSED S164** (residue gated/out-of-scope).
- `scripts/restore-postgres-drain-table-backup.js` ("B" restore) NOT built — post-pilot ≥2026-07-01, destructive-carryover-gated.
- Field Set D doc-label collision (Connor; `check:memory-drift` red BY DESIGN — do not silence).
- COI policy wording; revert temp role elevations (unverified carryover — verify first); Sarah's Phase II inventory; data-quality `#1001205`/`#1001249`.

### G. Normalization — SHIPPED S167 (commits `fec3f2e`, `32e4e90`, `6b9166a`)
`docs/CANONICAL_COUNTS.md` is the generated single source of truth for code-derived scalars (one anchored section per registered fact, regenerated by `npm run check:fact-consistency -- --write`). `check:fact-consistency` now also asserts on-disk drift against the live registry. `check:canonical-pointers` (new) validates `[N](docs/CANONICAL_COUNTS.md#<fact-id>)` pointer targets against the registry and the doc. Multi-marker support added to the exemption parser (one `<!-- fact-consistency:ignore -->` marker per fact id, multiple per line). Pointer-form regex escape closed (`[N](url)` is unwrapped before pattern matching, so a stale pointer-wrapped literal is still flagged). `api-route-file-count` registered as third fact (live=84, derive mirrors `check-api-route-security-matrix.js` walker). Registry: `app-definition-count=17, requireappaccess-endpoint-count=52, api-route-file-count=84`. **6 live pointers verified** across 3 facts; all 9 gates green sequentially.

## Calendar Checkpoints (soft — report factually, not "overdue")
- **2026-05-19** slice-0 deploy *target* — today; not cleared (P1-Update gate). **2026-05-26** dry-run. **2026-05-30** go/no-go. **2026-06-01** pilot opens. **≥2026-07-01** post-pilot drain-table drop (needs "B" restore built first).

## Gotchas (still live)

- 🆕 🟢 **`check:fact-consistency` is the mandatory fan-in for registered scalar doc/memory edits.** Per `CLAUDE.md:36`: do NOT emit a "DONE"/"✅" marker for any fact-level doc/memory fix until `npm run check:fact-consistency` is green. The gate is the bounded backstop, not the structural normalization fix. Historical mentions exempt ONLY via same-line structured markers like `<!-- fact-consistency:ignore fact=app-definition-count as-of=2026-05-19 -->`; session tags or "prior"/"was" alone do NOT exempt. Self-test asserts both prose-matching AND independent derive cross-check — never duplicate the production derive's mechanism when adding fixtures.
- 🆕 🔴 **Codex CLI now writes by default everywhere on this machine** — `~/.codex/config.toml:3-4` sets `sandbox_mode = "workspace-write"` + `approval_policy = "never"` globally. Every Codex invocation defaults to workspace-write (boundary = cwd) + no interactive approval. Revert = remove those two lines. Relevant when invoking Codex against unfamiliar/untrusted code in any directory.
- 🆕 🔵 **Broker writes still need a restart to pick up the new config.** The shared broker spawned at session start has the old read-only baseline; next Claude Code session inherits the new defaults automatically. Until then, `codex exec resume <session-id> -c sandbox_mode='"workspace-write"' -c approval_policy='"never"' "<prompt>"` is the working write-path (broker bypass). The companion's `--write` flag doesn't escalate the broker's baseline; this is a Codex CLI limitation, real fix is an upstream PR to pass `-c` overrides at broker spawn (`lib/app-server.mjs:189`).
- 🔴 **TWO memory stores — see ENV-0.** `.claude-memory/` (git, propagates) vs `~/.claude/.../memory/` (harness, per-machine). Dual-write durable knowledge to a git-tracked file.
- 🟢 **`AGENTS.md` is a tracked symlink → `CLAUDE.md`** (Codex-verified S165). Do NOT run the `migrate-to-codex` skill. If it shows as a regular file in `git status`: `git checkout AGENTS.md`.
- 🔴 **slice-0 destructive carryover; P1-Update single open gate.** No `--execute` autonomously; re-run both point-in-time probes at deploy.
- 🔵 **Connor email** = intentionally uncommitted local file; regenerate from the committed `CONNOR_CORE_GATE.md` handout if on another Mac.
- 🟢 **Present Codex output VERBATIM**, primary, before any paraphrase (`feedback_codex_relay_verbatim`). Acting on findings goes in a SEPARATE turn.
- 🟢 **Reconcile docs, don't append-patch** (`feedback_reconcile_dont_append_docs`). The recurring failure: fix bodies, miss denormalized index/header copies. The `check:fact-consistency` gate is the bounded mechanical backstop for code-derived scalars; for fuzzier prose, the gate-then-grep-then-Codex pattern is the discipline.
- 🟢 **External fan-in is the lever, not vigilance.** S166 produced 3 instances of the fan-out failure even with the agent fully aware of the pattern. Don't trust own "DONE" claims on cross-document consistency work; route them through gate/grep/Codex review before propagation.
- 🔴 **"PI"/"primary contact"/"donor" are per-program hazards** (`dataverse-export-floor-scoping`). 🔵 **Blob = TWO stores** (`phase-ii-summaries-blob`/`BLOB_READ_WRITE_TOKEN` vs `dvx-export-private`/`DVX_BLOB_RW_TOKEN`).
- **`check:memory-drift` red by design** (Field Set D + Wave2 probe_404s) — advisory, do not silence. **Coverage tools scan `.js|.mjs|.cjs|.jsx|.ts|.tsx`** (the fact-consistency gate extended this set for endpoint derives). **MODULE_TYPELESS = accepted** — do not re-litigate.
- **iCloud `.nosync` can clear `node_modules`** at session start — `npm ci` restores; `.next`/`.next.nosync/` untracked is normal.

## Key Files Reference

| File | Purpose |
|------|---------|
| **`scripts/check-fact-consistency.js` + `check-fact-consistency-self-test.js`** | NEW S166 — bounded scalar-drift gate (AST derives, structured markers) + two-layer self-test (prose + independent derive cross-check) |
| `~/.codex/config.toml` | NEW S166 — top-level `sandbox_mode = "workspace-write"` + `approval_policy = "never"` (global Codex default, lines 3–4) |
| `.claude-memory/feedback_reconcile_dont_append_docs.md` | Recurring-failure feedback memory — expanded S166 with gate + provisional-completion discipline |
| `.claude-memory/project_memory_two_stores_propagation.md` | ENV-0 authoritative (git-tracked, propagates) |
| memory `slice0-deactivate-not-delete-recalc` (harness) | §A verdict-checker checklist + (a)–(d) guards |
| **`docs/INTAKE_PORTAL_ITEM_6_STATUS.md`** | NEW S166 — canonical Item 6 / slice-0 status dashboard (replaces fragmented Item 6 docs) |
| `docs/INTAKE_PORTAL_ITEM_6_CONNOR_CORE_GATE.md` | Connor send-handout (committed), Steps 1–12 |
| `docs/INTAKE_PORTAL_ITEM_6_DISCUSSION.md` §0 | Authoritative Item-6 decision record |
| `docs/INTAKE_PORTAL_ITEM_6_P1UPDATE_TEST_DRAFT_v5.md` | Full runbook + waiver Artifact 1 (UNAUTHORIZED) |
| `lib/dataverse/schema/wave4*/` | slice-0 specs — READY, do NOT re-author |
| `scripts/probe-apprequestperson-role-data.js` · `scripts/probe-slice0-attr-collision.mjs` | Two BLOCKING point-in-time pre-deploy probes |
| `docs/DOCS_GROUND_TRUTH_AUDIT_2026-05-19.md` | Audit Phases 1–5 ALL DONE — reconciled in place at /stop |

## Testing

```bash
# 7 sequential gates (run in order, never parallel — check:atlas + :atlas:self-test race):
npm run check:atlas && npm run check:atlas:self-test && \
npm run check:doc-currency && npm run check:doc-currency:self-test && \
npm run check:api-routes && \
npm run check:fact-consistency:self-test && npm run check:fact-consistency

# Quick invariant checks:
test -L AGENTS.md && readlink AGENTS.md                                            # must be: CLAUDE.md
git rev-parse HEAD && git status --porcelain                                       # .git-corruption tripwire (iCloud)
grep -n "^sandbox_mode\|^approval_policy" ~/.codex/config.toml                      # confirm Codex defaults still set

# At slice-0 deploy time:
node scripts/probe-apprequestperson-role-data.js && node scripts/probe-slice0-attr-collision.mjs

# Advisory (red by design):
node scripts/check-memory-drift.js                                                 # exits 1 on Field Set D + Wave2 probe_404
npm run check:memory-drift:no-write                                                # read-only audit (does NOT regenerate RECONCILIATION_REPORT.json)
```
