# Session 169 Prompt: cleanup pass landed; institution-match primitive now design-recorded; slice-0 still open

## Session 168 Summary

Three threads, four commits, all pushed. (1) Fixed a dead UI affordance in Reviewer Finder's My Candidates header — "+ Add institution" never did anything because the GET hardcoded `proposalInstitution: null`, the PATCH rejected the field by design, and the client swallowed the 400. Mapped institution from the applicant account's `akoya_aka` (the human-friendly common name, e.g. "Stanford University" vs the legal "The Board of Trustees of the Leland Stanford Junior University"). (2) The fix surfaced a forward-work cluster: the **shared institution-match primitive** needed for both intake portal account-creation and reviewer pipeline contact-promotion. Recorded as two memory entries with the same fuzzy-match shape (`accounts.{name, akoya_aka, wmkf_legalname, wmkf_abbreviation}`). (3) Retired the manual Proposal URL/Password feature on Review Manager's Proposal Detail tab — superseded by the system-generated external-reviewer magic link that shipped 2026-05-03. Survey confirmed 32 J26 rows had the legacy fields populated but J26 is reviewer-closed, so no fallback needed.

Process notes worth remembering: a sparsely-populated Dataverse attribute (`akoya_aka`) was filtered out by `scripts/dynamics-schema-diff.js` and required a live-record probe to confirm the field name — same hazard documented in [[project-dynamics-explorer-schema-diff]]. The "memories don't propagate" hazard from S165 turned out to be already resolved on this Mac via a symlink (`~/.claude/projects/<slug>/memory` → `.claude-memory/`); the other-Mac status is still unverified.

### What Was Completed

1. **Reviewer Finder AKA institution mapping (commit `e3a2c0f`).**
   - `lib/dataverse/adapters/reviewer-suggestion.js` — `findByPD` projection now also exposes `applicantId: r._akoya_applicantid_value` (additive; no caller breakage).
   - `pages/api/reviewer-finder/my-candidates.js` — new `fetchApplicantAkas` batch helper joined in parallel with the existing person/researcher hydrators; `proposalInstitution: akoya_aka || applicant || null` with fallback to formal `name` when AKA is blank.
   - `pages/reviewer-finder.js` — `ProposalMetadataRow` simplified to plain-text rendering; inline-edit state and `handleUpdateProposalMetadata` deleted.

2. **Institution-match design memories (commits `720eaf0`, `2d27dc0`).**
   - `.claude-memory/project_intake_portal_institution_match.md` — match-first / create-as-last-resort against `accounts.{name, akoya_aka, wmkf_legalname, wmkf_abbreviation}` whenever an applicant institution string enters Dataverse.
   - `.claude-memory/project_reviewer_institution_match.md` — same primitive applied to reviewer pipeline at three touch points: save-candidates affiliation, send-emails contact promotion (load-bearing for `contact.parentcustomerid`), and any future reviewer self-edit.
   - `.claude-memory/project_memory_two_stores_propagation.md` — added S168 discovery: harness `memory/` is symlinked to `.claude-memory/` on this Mac (confirmed by `readlink` + same inode). Other-Mac verification still pending.

3. **Review Manager Proposal URL/Password retirement (commit `d35a4e5`).**
   - `pages/review-manager.js` — UI inputs + Save handler removed; local state and `onSettingsChange` prop wire-through dropped; default `followup` template migrated from `{{proposalUrl}}` to `{{externalLink}}` ("Your secure reviewer link"); placeholder picker scrubbed.
   - `pages/api/review-manager/reviewers.js` — fields dropped from GET projections (closes the archived 2026-04-26 finding about `proposalPassword` exposure) and the PATCH-by-`proposalId` write branch; route docstring updated.
   - `pages/api/review-manager/render-emails.js` + `lib/utils/email-generator.js` — `proposalUrl`/`proposalPassword` no longer populated in `templateSettings`; user-customized templates still referencing the placeholders will render empty strings.
   - `lib/dataverse/adapters/reviewer-suggestion.js` — `wmkf_proposalurl` / `wmkf_proposalpassword` dropped from `FIELD_SELECT` and the writeable `FIELD_MAP`. Dataverse columns themselves left in place for the J26 audit trail.

4. **Surveys before destructive work (no commits — operational discipline).**
   - `accounts` schema probe via live record fetch confirmed `akoya_aka` as the AKA field (after schema-diff dropped it as "uninteresting").
   - `wmkf_appreviewersuggestion` survey: 32 rows with proposalUrl/Password populated, all J26, all url+password paired, created 2026-04 / early 2026-05 (pre-magic-link cohort). User confirmed J26 reviewer-side is closed → no fallback retention needed.

### Commits (S168, `main`, pushed)

- `e3a2c0f` Reviewer Finder: surface applicant AKA as institution; drop dead inline-edit
- `720eaf0` Memory: intake-portal institution-match design constraint; symlink discovery on two-stores entry
- `2d27dc0` Memory: reviewer-side institution match — parallel constraint to intake portal
- `d35a4e5` Review Manager: retire manual Proposal URL/Password — superseded by external magic links
- (this `/stop`) — Document Session 168 + Session 169 prompt

## Potential Next Steps

### ⚠️ ENV-0. Memory propagation — verification still owed on the other Mac
S168 confirmed the harness `memory/` dir is symlinked to `.claude-memory/` on this Mac (same inode via `readlink`). The other Mac is presumed still divergent (the symlink is filesystem-local, not a repo artifact). When working from the other Mac, run the verification + recreate-as-symlink snippet in `.claude-memory/project_memory_two_stores_propagation.md`. The iCloud-removal recommendation is still open separately.

### A. slice-0 / P1-Update — STILL OPEN, destructive carryover, not green-lit
Unchanged from S167/S168 start. Awaiting Connor's verdict on the core-gate test. Soft deploy target 2026-05-19 missed; 2026-05-26 dry-run is the next checkpoint. When the verdict lands, role is **verdict-checker** against Steps 11–12 of `docs/INTAKE_PORTAL_ITEM_6_CONNOR_CORE_GATE.md`; FAIL is cheap (Option B drain-side, zero schema rework). Canonical status doc: `docs/INTAKE_PORTAL_ITEM_6_STATUS.md`. No `--execute` without explicit approval. The local untracked `docs/INTAKE_PORTAL_ITEM_6_CONNOR_EMAIL.md` is a Connor send-handout draft — review with Justin before committing or sending.

### B. Shared institution-match primitive — NEW, design-recorded only
S168 surfaced the cluster but did not implement. Natural next step when intake-portal slice work resumes: a `/api/institution-match` endpoint wrapping Dataverse Search across `accounts.{name, akoya_aka, wmkf_legalname, wmkf_abbreviation}`, returning ranked candidates with a confidence score. No schema change required. Two consumers waiting (intake portal account-create form; reviewer pipeline at save-candidates + contact promotion). Build once, reuse. Memory entries: [[project-intake-portal-institution-match]] + [[project-reviewer-institution-match]].

### C. Proposal URL/Password hard-retire (post-J26-archive fast-follow)
S168 soft-retired the surface (UI + API + email substitution + adapter SELECT/MAP); Dataverse columns `wmkf_proposalurl` / `wmkf_proposalpassword` on `wmkf_appreviewersuggestion` are still defined for the J26 audit trail. Future work: drop the columns (needs Connor coordination per [[project-dataverse-creator-privileges]] and the `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md` audit catalog). No urgency; trigger is "when J26 archives and there's a Connor schema-touch session anyway."

### D. Adjacent doc-drift gates — UNCHANGED from S167
Don't pre-emptively build. The S167 rubric is **≥2 prior audits found the same pattern AND a clear bounded identifier set AND code as ground truth**. Wave 1 PG-table drift could fold into the existing drain-table gate cheaply if one recurrence is observed; service-class catalogue drift currently has only 1 audit; atlas row-count drift doesn't fit the static-CI shape.

### E. Track B Power Tools floor follow-ups (PARKED)
Unchanged from S166/S167.

### F. CANONICAL_COUNTS.md follow-ups (NOT urgent)
Unchanged. Register new scalars only when drift is observed.

## Calendar Checkpoints (soft — report factually, not "overdue")
- **2026-05-19** slice-0 deploy target — missed; P1-Update gate open. **2026-05-26** dry-run. **2026-05-30** go/no-go. **2026-06-01** pilot opens. **≥2026-07-01** post-pilot drain-table drop. **Post-J26-archive** (no fixed date) — optional `wmkf_proposalurl`/`wmkf_proposalpassword` column drop.

## Gotchas (current)

- 🟢 **`akoya_aka` is the institution AKA field on `account`** — not `akoya_sortby`, not `wmkf_abbreviation`. Verified by live record fetch on UO + Stanford. `dynamics-schema-diff.js` filters it out as "uninteresting" because of low population; rely on a live-record probe when a specific field hasn't surfaced. Same lesson as [[project-dynamics-explorer-schema-diff]].
- 🟢 **Review Manager templates live in localStorage**, not Dataverse `wmkf_appuserpreferences`. Means no server-side audit is possible for user-customized templates; default-template migrations only affect users who haven't customized. Anyone whose saved template still references `{{proposalUrl}}` / `{{proposalPassword}}` will see those render as empty strings post-S168.
- 🟢 **Two structural drift-prevention gates remain live** (S167): `check:drain-table-mentions`, `check:prompt-storage-mentions`. Both with constrained file-purpose markers, narrow allowlists, binding self-tests. Plus the fact-consistency + canonical-pointers pair.
- 🟢 **Codex external fan-in is the lever, not vigilance** (S167). Don't close gate-introduction commits without Codex SOUND verification.
- 🟢 **Code-anchored ground truth before any sweep** (S167). Don't sweep on self-asserted ground truth; have Codex confirm first.
- 🔴 **Codex CLI default `workspace-write` + `approval=never`** per S166. Unchanged. Relevant for any Codex invocation in any directory.
- 🟢 **Reviewer-domain ground truth** (Codex-verified S167): zero live SQL against the 6 drained PG tables; live source is Dataverse `wmkf_potentialreviewerses` / `wmkf_appresearchers` / `wmkf_appreviewersuggestions` / `wmkf_appgrantcycle` / `contacts`.
- 🟢 **Prompt-storage ground truth** (Codex-verified S167): live entity is `wmkf_ai_prompt` (entity set `wmkf_ai_prompts`); `wmkf_prompt_template` never shipped; `PromptResolver` is legacy.
- 🔴 **slice-0 destructive carryover; P1-Update single open gate.** UNCHANGED. Re-run both point-in-time probes at deploy. No `--execute` autonomously.
- 🟢 **Memory two-stores hazard is resolved on THIS Mac via symlink.** Other-Mac status unverified — see ENV-0.
- 🟢 **`AGENTS.md` is a tracked symlink → `CLAUDE.md`.** Do NOT run `migrate-to-codex` skill.

## Key Files Reference

| File | Purpose |
|------|---------|
| `pages/reviewer-finder.js` | My Candidates header now plain-text PI + institution (from applicant account's `akoya_aka`); dead inline-edit removed S168 |
| `pages/api/reviewer-finder/my-candidates.js` | `fetchApplicantAkas` batch helper joined to existing person/researcher hydrators; `proposalInstitution` derived from AKA with formal-name fallback |
| `lib/dataverse/adapters/reviewer-suggestion.js` | `findByPD` projection exposes `applicantId`; `wmkf_proposalurl`/`wmkf_proposalpassword` dropped from `FIELD_SELECT` + `FIELD_MAP` S168 |
| `pages/review-manager.js` | Proposal Detail tab — no more URL/Password inputs; default `followup` template uses `{{externalLink}}` S168 |
| `pages/api/review-manager/reviewers.js` | URL/Password dropped from GET projections + PATCH-by-`proposalId` write branch S168 |
| `pages/api/review-manager/render-emails.js` + `lib/utils/email-generator.js` | `proposalUrl`/`proposalPassword` no longer substituted in `templateSettings` |
| `.claude-memory/project_intake_portal_institution_match.md` | NEW S168 — design constraint for intake-portal account-creation institution match |
| `.claude-memory/project_reviewer_institution_match.md` | NEW S168 — same primitive for reviewer-pipeline affiliation + contact promotion |
| `.claude-memory/project_memory_two_stores_propagation.md` | Updated S168 with symlink discovery on this Mac |
| `docs/INTAKE_PORTAL_ITEM_6_STATUS.md` | Canonical slice-0 status (UNCHANGED) |
| `docs/INTAKE_PORTAL_ITEM_6_CONNOR_CORE_GATE.md` | Connor send-handout (Steps 1-12) |
| `lib/dataverse/schema/wave4*/` | slice-0 specs — READY, do NOT re-author |

## Testing

```bash
# 13 sequential gates (run in order, never parallel):
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

# Memory symlink check (S168 discovery — on each Mac):
readlink "$HOME/.claude/projects/-Users-gallivan-Library-Mobile-Documents-com-apple-CloudDocs-Documents-Programming-Claude-Projects-WMKF-Apps/memory"
# Expect: <repo>/.claude-memory ; if empty → recreate per memory entry.

# At slice-0 deploy time:
node scripts/probe-apprequestperson-role-data.js && node scripts/probe-slice0-attr-collision.mjs

# Reviewer Finder smoke (visual; the AKA mapping is read-only):
# 1. Open /reviewer-finder, My Candidates tab.
# 2. For a J26 proposal w/ Stanford applicant, header should read "PI: <name> · Stanford University"
#    (not the legal "Board of Trustees…" name and not "+ Add institution").

# Review Manager smoke (visual):
# 1. Open /review-manager, pick a proposal, Proposal Detail tab.
# 2. Proposal info card shows title / PI / institution / cycle only — no URL/Password inputs.
# 3. Email modal: placeholder picker no longer includes proposalUrl/proposalPassword.

# Advisory (red by design):
npm run check:memory-drift:no-write
```
