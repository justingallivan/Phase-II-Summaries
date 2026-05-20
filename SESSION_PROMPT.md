# Session 168 Prompt: drift-prevention gates shipped (S167); slice-0 still open; consider follow-ups not lit reactive audits

## Session 167 Summary

Built two structural CI gates that mechanically prevent the two recurring doc-drift families this codebase keeps re-discovering. Net: `check:fact-consistency` got two follow-up companions (`check:canonical-pointers` + `docs/CANONICAL_COUNTS.md` generator); `check:drain-table-mentions` closes reviewer-domain Postgres-vs-Dataverse drift; `check:prompt-storage-mentions` closes the `wmkf_prompt_template` rename drift. Both new gates have constrained file-purpose markers, narrow allowlists, and binding self-tests. Codex independently verified each gate as SOUND and the final content sweep as `clean`. Seventeen commits.

The shape lesson (recorded after multiple iterations): the user explicitly said "I can't have this mess propagating. No excuses" — and the prior approach of audit-then-fix kept failing because each audit found a new sub-cluster in the same drift family. The lever is structural gates with mechanical fan-in, not vigilance. Codex review of every gate-introduction commit catches both detection-regex holes and exemption-keyword over-permissiveness; my self-assessment alone consistently misses both.

### What Was Completed

1. **G normalization arc.** `docs/CANONICAL_COUNTS.md` generated single source of truth for code-derived scalars (`app-definition-count=17`, `requireappaccess-endpoint-count=52`, `api-route-file-count=84`). `check:canonical-pointers` validates `[N](docs/CANONICAL_COUNTS.md#<fact-id>)` pointer targets against registry + on-disk anchor. Pointer-form regex escape fixed (number-followed-by-`]` was bypassing fact-consistency). Multi-marker exemption support added (one ignore marker per fact id on a single line).

2. **`check:drain-table-mentions` gate.** Catches stale "data lives in PG" claims for 6 drained reviewer-domain Postgres tables (`researchers`, `publications`, `researcher_keywords`, `reviewer_suggestions`, `grant_cycles`, `proposal_searches`). 7-shape detection (backticked / single-quote / double-quote / `Postgres X` / dotted column / db-noun context / SQL-shape verbs). Same-line exemption keywords scoped to directional/historical markers only (Codex caught and tightened: dropped `Dataverse`, `planned`, `from Postgres`, bare `W[3-6]`, `wmkf_app*`, `spec'd`). Constrained file-purpose marker (only `atlas-state-page` tag, scoped to `docs/atlas/*.md` + `APPLICATION_STATE_ATLAS.md`). 12-file allowlist (migration plans, lessons-learned, migration-memory). Self-test 17 fixtures.

3. **`check:prompt-storage-mentions` gate.** Catches stale `wmkf_prompt_template` claims (proposed name; actual live entity is `wmkf_ai_prompt`). Same architectural shape as drain-table gate. Constrained file-marker (only `design-history` tag → `docs/PROMPT_STORAGE_DESIGN.md`). Narrow allowlist (only `DEVELOPMENT_LOG.md`). Self-test 22 fixtures. Field-name detection considered then deliberately scoped out (`wmkf_body` is a legit field on unrelated `wmkf_policyversion` — too generic to gate).

4. **Two Codex-verified ground-truth claims established.** (a) Reviewer-domain PG tables are drain-only at the application runtime layer — zero SQL across `pages/api/`, `lib/services/`, `lib/dataverse/`, `shared/`. (b) Live prompt-storage entity is `wmkf_ai_prompt`; `wmkf_prompt_template` was a proposed name that never materialized; `PromptResolver` is a legacy holdover used only by scripts, not by live API routes.

5. **Content sweeps.** ~50 docs/memory entries reconciled to current state across multiple commits. Major touches: `CLAUDE.md` (service catalogue + new gate paragraphs), `docs/APPLICATION_STATE_ATLAS.md` index, `docs/SECURITY_ARCHITECTURE.md` (schema overview L570 + appendix L1348 + Wave 1 in-place annotations), `docs/atlas/*` post-W3-W6 cutover state, `docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md`, `docs/REVIEWER_FINDER.md` Database tab retired, `docs/REVIEWER_FINDER_FUTURE_ARCHITECTURE.md` supersession banner, `docs/BACKEND_AUTOMATION_PLAN.md` Phase 2/3 residue, `shared/config/guideContent.js` in-app guide, `pages/phase-i-dynamics.js` UI copy.

### Commits (S167, `main`, pushed)

- `fec3f2e` G normalization: CANONICAL_COUNTS.md + canonical-pointers gate
- `32e4e90` Pointer-form regex escape fix
- `6b9166a` `api-route-file-count` third canonical fact
- `29b1481` Audit pass-1: Wave-1 Dataverse migration residue
- `52dc0b8` Audit pass-1: housekeeping (§G shipped, catalogue, memory)
- `3674bc8` Broaden app-definition-count patterns (app pages / in current registry / across N apps)
- `afe7244` Audit pass-2: reviewer-domain Postgres-to-Dataverse drift
- `1b81106` Mechanical sweep: reconcile reviewer-domain docs to verified ground truth
- `13c0392` Build `check:drain-table-mentions` gate (initial)
- `fe42885` Drain-table cleanup + Codex pass-4 fixes
- `3dbc13c` Tighten drain-table gate (Codex pass-5 holes — broaden regex, tighten keywords)
- `ff9d943` Pass-6 remediation: constrain file-marker, cron drift, self-docs
- `77052bf` Pass-7 P2: error-msg guidance + adjacent stub claim
- `b5537cd` Pass-8 P3: third stub straggler in BACKEND_AUTOMATION_PLAN
- `9f99868` Build `check:prompt-storage-mentions` gate + sweep `wmkf_prompt_template`
- `5033bcc` Post-verify tightening: gate scope + v2-fallback claims + field-name sweep
- `9f0013e` Drop `pre-shipped` keyword + sync header comment (final Codex confirm-pass P1)
- (this `/stop`) — Document Session 167 + Session 168 prompt + DEVELOPMENT_LOG milestone entry

## Potential Next Steps

### ⚠️ ENV-0. Memory propagation — UNCHANGED carryover from S166/S167
Two memory stores (`.claude-memory/` git-tracked vs `~/.claude/projects/<slug>/memory/` harness per-machine). Recommended consolidation: repo out of iCloud + reconverge on `.claude-memory/`. Until then: dual-write durable knowledge. Authoritative: `.claude-memory/project_memory_two_stores_propagation.md`.

### A. slice-0 / P1-Update — STILL OPEN, destructive carryover, not green-lit
Identical status to start of S167 — Connor verdict on the core-gate test was the awaited input and that wasn't actioned this session. Soft deploy target 2026-05-19 (today) NOT met; gate OPEN. When the verdict lands, be the **verdict-checker**: hold to Step 11 evidence + Step 12 criteria from `docs/INTAKE_PORTAL_ITEM_6_CONNOR_CORE_GATE.md`. Motivated-reasoning guard active: FAIL is cheap (Option B drain-side, zero schema rework). Canonical status doc: `docs/INTAKE_PORTAL_ITEM_6_STATUS.md`. No `--execute` without explicit approval.

### B. Consider scoped doc-drift gates for ADJACENT families (NOT a green-lit task)
S167 demonstrated the gate-style fan-in works for two families. Before building more, recognize what would qualify: a recurring drift family (≥2 prior audits found the same pattern in different docs) AND a clear bounded identifier set AND code as ground truth. Candidates to evaluate, NOT commit to:
- Atlas page row-count drift (numbers in atlas tables vs live probes). Would need a probe-vs-doc gate; possibly out-of-scope for static CI.
- Wave 1 PG-table mentions (similar pattern to drain-table but Wave 1 is finished and content was reconciled). Probably not worth a separate gate.
- Service-class catalogue drift in `CLAUDE.md` vs `lib/services/`. Pass-1 found 3 missing entries; not yet recurring.

### C. Track B Power Tools floor follow-ups (PARKED)
Unchanged from S166: PC final shape pending SME, name-normalized recount, donor Tier-2 fast-follow, NL→QuerySpec prototype.

### D. CANONICAL_COUNTS.md follow-ups (NOT urgent)
The fact-consistency + canonical-pointers pair is structurally complete. Worth considering when more code-derived scalars are found drifting: register them with new patterns + self-test fixtures. Don't pre-emptively register without an observed drift.

## Calendar Checkpoints (soft — report factually, not "overdue")
- **2026-05-19** slice-0 deploy *target* — today; not cleared (P1-Update gate). **2026-05-26** dry-run. **2026-05-30** go/no-go. **2026-06-01** pilot opens. **≥2026-07-01** post-pilot drain-table drop (needs "B" restore built first).

## Gotchas (current)

- 🟢 **TWO structural drift-prevention gates now live.** `check:drain-table-mentions` (for reviewer-domain PG drift) and `check:prompt-storage-mentions` (for `wmkf_prompt_template` drift). Both have constrained file-purpose markers (only specific tags + path patterns) — a marker on a non-matching path is a CONFIGURATION ERROR at gate startup, not a silent bypass. Allowlists are narrow and visible in script source. Self-tests bind every detection shape + every keyword.
- 🟢 **External fan-in is the lever, not vigilance.** S167 produced 9 Codex-driven tightening commits on the drain-table gate alone before it was SOUND. My self-assessment consistently missed both detection holes and over-permissive keywords. Treat every gate-introduction commit as inherently incomplete until Codex confirms.
- 🟢 **Code-anchored ground truth before any sweep.** S167's mechanical sweep across 9 reviewer-domain doc files only worked because Codex independently verified the ground-truth claim (7 sub-claims CONFIRMED, task-mpddqa8b) BEFORE the sweep. Don't sweep on self-asserted ground truth.
- 🔴 **Don't pretend "structurally done" without Codex confirm.** I claimed this twice mid-session and both times Codex found gate holes. The strict rule now: any gate-introduction commit gets a Codex verification pass; don't close the task until Codex returns SOUND.
- 🟢 **File-purpose marker mechanism (the visible-allowlist replacement).** New pattern: in-doc `<!-- drain-table:file-purpose=<tag> -->` or `<!-- prompt-storage:file-purpose=<tag> -->`. Tag must be in `FILE_MARKER_TAG_PATHS`; path must match one of the tag's allowed patterns. Visible to readers (unlike a script-side allowlist), constrained against abuse, still allows per-file content review. Used currently for atlas state pages and the PROMPT_STORAGE_DESIGN doc.
- 🟢 **Self-doc drift inside gate source IS still a coverage gap.** Gates don't scan their own comments. S167's `pre-shipped` keyword survived a commit that claimed to drop it. Mitigation: include a binding positive fixture in the self-test whenever you mention "intentionally NOT exempted X" in a comment.
- 🔴 **Codex CLI default `workspace-write` + `approval=never` per S166.** Unchanged. Relevant for any Codex invocation in any directory.
- 🟢 **Reviewer-domain ground truth (Codex-verified S167):** zero live SQL against the 6 PG tables in app code. Dataverse entities `wmkf_potentialreviewerses` / `wmkf_appresearchers` / `wmkf_appreviewersuggestions` / `wmkf_appgrantcycle` / `contacts` are live source of truth.
- 🟢 **Prompt-storage ground truth (Codex-verified S167):** live entity is `wmkf_ai_prompt` (entity set `wmkf_ai_prompts`); `wmkf_prompt_template` never shipped; `PromptResolver` is legacy holdover used only by scripts; live v2 API path uses `executePrompt()` against `wmkf_ai_prompts`.
- 🔴 **slice-0 destructive carryover; P1-Update single open gate.** UNCHANGED from S166/S167 start. Re-run both point-in-time probes at deploy. No `--execute` autonomously.
- 🔴 **TWO memory stores — see ENV-0.** UNCHANGED.
- 🟢 **`AGENTS.md` is a tracked symlink → `CLAUDE.md`.** Do NOT run `migrate-to-codex` skill.

## Key Files Reference

| File | Purpose |
|------|---------|
| **`scripts/check-drain-table-mentions.js` + `-self-test.js`** | NEW S167 — drain-table drift gate. 7-shape detection, constrained file-marker (`atlas-state-page`), narrow allowlist, 17 self-test fixtures |
| **`scripts/check-prompt-storage-mentions.js` + `-self-test.js`** | NEW S167 — prompt-storage drift gate. Same architectural shape, constrained file-marker (`design-history`), narrow allowlist, 22 self-test fixtures |
| **`scripts/check-canonical-pointers.js` + `-self-test.js`** | NEW S167 — canonical-pointer rot detection. Validates `[N](docs/CANONICAL_COUNTS.md#<fact-id>)` against registry + on-disk anchors |
| **`docs/CANONICAL_COUNTS.md`** | NEW S167 — auto-generated single source of truth for code-derived scalars (3 facts registered) |
| `scripts/lib/canonical-facts.js` + `canonical-counts-render.js` | Shared registry + doc renderer, consumed by all three S167 normalization gates |
| `scripts/check-fact-consistency.js` | S166 gate; S167 added pointer-form unwrap + multi-marker support |
| `docs/INTAKE_PORTAL_ITEM_6_STATUS.md` | Canonical Item 6 / slice-0 status (UNCHANGED) |
| `docs/INTAKE_PORTAL_ITEM_6_CONNOR_CORE_GATE.md` | Connor send-handout (Steps 1-12) |
| `lib/dataverse/schema/wave4*/` | slice-0 specs — READY, do NOT re-author |

## Testing

```bash
# 13 sequential gates (run in order, never parallel — fact-consistency + drain-table + prompt-storage all use docs/<gate>_selftest_tmp/ as fixture dirs):
npm run check:atlas && npm run check:atlas:self-test && \
npm run check:doc-currency && npm run check:doc-currency:self-test && \
npm run check:api-routes && \
npm run check:fact-consistency:self-test && npm run check:fact-consistency && \
npm run check:canonical-pointers:self-test && npm run check:canonical-pointers && \
npm run check:drain-table-mentions:self-test && npm run check:drain-table-mentions && \
npm run check:prompt-storage-mentions:self-test && npm run check:prompt-storage-mentions

# Quick invariants:
test -L AGENTS.md && readlink AGENTS.md     # must be: CLAUDE.md
git rev-parse HEAD && git status --porcelain # iCloud .git-corruption tripwire
grep -n "^sandbox_mode\|^approval_policy" ~/.codex/config.toml  # confirm Codex defaults

# At slice-0 deploy time:
node scripts/probe-apprequestperson-role-data.js && node scripts/probe-slice0-attr-collision.mjs

# Advisory (red by design):
npm run check:memory-drift:no-write
```
