# Session 127 Prompt: Dynamics identity reconciliation

## Heads up

Session 126 was supposed to be a continuation of carryover work, but it pivoted hard. Justin flagged that memory felt stale and asked for an audit. The audit caught a near-miss — the Session 126 pivot list included "drop dormant Postgres reviewer tables" as a green-lit option, but the tables were actually load-bearing for the live Reviewer Finder app's browse/email/grant-cycle flows. Acting on it would have broken production.

That triggered a session-long infrastructure thread: memory got moved into the repo for multi-Mac sync, several stale memory entries were corrected, CLAUDE.md inventory drift was reconciled, and a new carryover-hygiene rule was added at three layers (CLAUDE.md section, feedback memory, `/start` skill Step 4) to break the propagation pattern.

Net result: 7 commits, no product features shipped, but the memory/process foundation is materially stronger and a production breakage was averted.

**🎯 Start Session 127 with: Dynamics identity reconciliation.** Memory entry `project_dynamics_identity_reconciliation.md` is flagged at the top with "START HERE." Real work, not blocked, ~½ day. Full plan at `docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md`.

Reference docs/files added or modified this session:
- `.claude-memory/` — NEW. Memory directory now lives in the repo; symlinked back to `~/.claude/projects/.../memory/` so Claude reads/writes it transparently.
- `docs/OFFICE_MAC_MEMORY_SYNC.md` — NEW. One-shot procedure for reconciling the office Mac next time you're there.
- `docs/MULTI_MAC_SETUP.md` — UPDATED. New Step 4 for symlinking memory on a fresh clone.
- `CLAUDE.md` — Carryover Hygiene section added; Apps table + service classes + endpoints reconciled against filesystem.

## Session 126 summary

Audit, memory architecture overhaul, and carryover-hygiene guardrail. No product features touched.

### What was completed

1. **Three-pass codebase/memory audit** (delegated to subagents).
   - **Memory reconciliation:** found several drift cases. Most serious: `project_reviewer_finder_dataverse_entry_path.md` claimed Postgres reviewer tables were "inert and scheduled for archival" — actually load-bearing for the live app. `project_phase_i_summary_app_winddown.md` said Phase I Dynamics was deprecated post-May-2026 — actually still actively iterated as a prompt-tuning surface. `project_reviewer_accept_decline_links.md` described work that shipped under a different shape (broader external-reviewer landing, not dedicated accept/decline buttons).
   - **CLAUDE.md inventory diff:** 2 wrong Apps-table endpoint mappings (Phase I Writeup, Peer Review Summarizer); Virtual Review Panel entirely missing from the table; 9 undocumented services (incl. the prominent `execute-prompt.js`) and 6 undocumented endpoints.
   - **Dead-code spot check:** confirmed Vercel Blob review path cleanly retired, `ApiKeyManager` cleanly removed, Wave 1 dispatch sites enumerated for the 2026-05-17 retirement.

2. **Memory moved into the repo** (`376a124`).
   Memory was per-machine at `~/.claude/projects/-Users-gallivan-Programming-Phase-II-Summaries/memory/` with no sync mechanism — silent divergence between home + office Macs for weeks. Moved to `.claude-memory/` in the repo, symlinked back to the original path. Claude reads/writes through the symlink transparently. `git pull/push` now syncs memory like any other repo file.

3. **Office Mac reconciliation procedure** (`450ef32`, `d6122ff`, `4b187ce`).
   The office Mac still has its own divergent memory dir. Built a one-shot procedure: snapshot to iCloud (Phase 1) → symlink (Phase 3) → reconcile (Phase 2). Preferred path is all three at the office in one ~45-min session, before any other work. Stored in two places: `.claude-memory/project_office_mac_memory_sync.md` (memory) and `docs/OFFICE_MAC_MEMORY_SYNC.md` (user-facing ops doc). Procedure also patches the `/start` skill on the office Mac with the Step 4 below.

4. **CLAUDE.md inventory reconciled** (`7f5de6d`).
   Fixed both Apps-table endpoint mappings; added Virtual Review Panel row + endpoint section; added 9 missing services to the Service Classes section (most notably `execute-prompt.js`, the Wave 1 dispatch services + Dataverse adapters, `multi-llm-service.js`, `panel-review-service.js`); added 6 missing endpoints; removed the dead Concept Evaluator endpoint.

5. **Carryover-hygiene rule, three layers** (`a7a8296`).
   The pattern that nearly broke Reviewer Finder: belief gets written into memory → propagates into SESSION_PROMPT.md "next steps" → inherited across sessions without re-verification → eventually executed because the carryover said to. Three artifacts to break the chain:
   - `CLAUDE.md` Carryover Hygiene section (human-visible).
   - `feedback_verify_before_destructive_carryover.md` (loaded into Claude context next session).
   - `/start` skill Step 4 — flags any drop/remove/retire/archive/delete/deprecate item from `SESSION_PROMPT.md` as **unverified-until-checked**, requires grep + verify before action.

6. **Stale memory entries corrected** (in `376a124`).
   Five memory files updated to match live state, plus MEMORY.md index entries:
   - `project_reviewer_finder_dataverse_entry_path.md` — Postgres tables NOT dormant.
   - `project_phase_i_summary_app_winddown.md` — strategic deprioritization, not a freeze.
   - `project_reviewer_accept_decline_links.md` — rewrote to match what shipped.
   - `project_external_reviewer_file_access.md` — added "SHIPPED 2026-05-03" status.
   - `project_dynamics_identity_reconciliation.md` — flagged as next session opener; corrected stale V26 migration target (V26 was used for intake portal, need to verify next free V).

### Commits (Session 126)

- `7f5de6d` — CLAUDE.md: reconcile inventory after audit drift
- `376a124` — Move Claude Code memory into the repo for multi-Mac sync
- `450ef32` — Memory: office Mac reconciliation procedure
- `a7a8296` — Carryover hygiene rule: verify before destructive work
- `d6122ff` — Memory: extend office sync procedure to patch the /start skill
- `4b187ce` — Save office Mac reconciliation procedure as ops doc
- `789536d` — Memory: flag Dynamics identity reconciliation as next session opener

### Live-state corrections this session

The audit caught 3 memory entries asserting things that didn't match reality, plus several CLAUDE.md inventory items. Concrete count of drift caught:
- Postgres reviewer tables: claimed dormant, actually load-bearing in 5 endpoints.
- Phase I Dynamics: claimed deprecated, actually still actively iterated.
- Reviewer accept/decline: described as future work, partly shipped under different shape.
- External reviewer file access: described as "Connor consult required", actually fully shipped.
- 2 Apps-table endpoints in CLAUDE.md pointing to wrong files; 1 entire app missing from table; 9 services + 6 endpoints undocumented.

The carryover-hygiene rule + the new feedback memory should prevent this kind of drift from converting to action in future sessions.

## Where to pick up — Session 127

### Primary: Dynamics identity reconciliation (~½ day)

Bridge `user_profiles` (Vercel) to `systemuser` (Dynamics) via email match. All 16 staff use `@wmkeck.org` emails matching `internalemailaddress` on `systemuser` — deterministic mapping, just not stored anywhere.

Plan: `docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md` (full scope).

Steps 1-4 (schema + resolver + sign-in hook + weekly cron) need no new permissions. Step 5 (impersonation header on writes) needs Dynamics write access — which was granted 2026-04-14, so unblocked.

Migration target: next available V-number on `user_profiles` — verify the next free V in `scripts/setup-database.js` before writing the migration. (Memory originally said V26, but V26 was used for the intake portal.)

### Secondary if Dynamics work blocks or finishes early

1. **Interim grant report auto-evaluation** — design conversation first; bigger session-opener. Memory: `project_interim_report_automation.md`.
2. **Office Mac reconciliation** — only doable from the office. If Justin happens to be there, run `docs/OFFICE_MAC_MEMORY_SYNC.md`.

### Deliberately deferred (do not do this session)

- **27-script `setRestrictions`/`bypassRestrictions` migration.** Cleanup, not blocking.
- **Wave 1 retirement.** Earliest 2026-05-17 (14-day stability clock running from 2026-05-03).
- **Drop Postgres reviewer tables.** ⚠️ DO NOT DO THIS — would break the live Reviewer Finder app. The "drop dormant tables" item that has appeared in prior pivot lists is wrong. See `project_reviewer_finder_dataverse_entry_path.md`.

### Externally gated

- **Entra External ID tenant** — IT email expected Monday 2026-05-04. Watch inbox.
- **Connor sync on intake portal decisions** — 6 decisions outstanding in `docs/CONNOR_INTAKE_PORTAL_SYNC.md`.

## Key files added/modified this session

| File | Purpose |
|---|---|
| `.claude-memory/` | NEW. Memory dir now in the repo. Symlinked from original location. |
| `.claude-memory/feedback_verify_before_destructive_carryover.md` | NEW. Carryover-hygiene rule for future sessions. |
| `.claude-memory/project_office_mac_memory_sync.md` | NEW. Procedure for reconciling office Mac memory. |
| `docs/OFFICE_MAC_MEMORY_SYNC.md` | NEW. User-facing ops doc — same procedure, findable via `ls docs/`. |
| `docs/MULTI_MAC_SETUP.md` | New Step 4 — symlink memory on a fresh clone. |
| `CLAUDE.md` | Carryover Hygiene section added. Apps table + service classes + endpoints reconciled. |
| `~/.claude/skills/start/skill.md` | NEW Step 4 — flag destructive carryover as unverified-until-checked. NOT in repo (per-user global). Office Mac copy needs the same edit (covered by office sync procedure). |
| 5 memory entries (see "Stale memory entries corrected" above) | Brought into alignment with live state. |

## Memory architecture (new this session)

- Memory lives at `Phase-II-Summaries/.claude-memory/` (in this repo).
- Original Claude path `~/.claude/projects/-Users-gallivan-Programming-Phase-II-Summaries/memory/` is a symlink → repo.
- Memory edits show up in `git status`. Commit + push them like code.
- Office Mac is NOT yet symlinked — see `docs/OFFICE_MAC_MEMORY_SYNC.md` for the one-shot reconciliation procedure when next at the office.

## Production state (sanity)

- External Reviewer Intake: live. Token expiry event-driven.
- Reviewer Finder: production-tested. Picker + save-candidates Dataverse-only. **Postgres reviewer tables still load-bearing for browse/email/grant-cycle flows — do not drop.**
- Wave 1 (Postgres → Dataverse for `system_settings`, `user_preferences`, `user_app_access`): rollout live since 2026-05-03. 14-day stability clock running.
- Intake portal: foundation work + design only. Still gated on Entra + Connor sync.
- Wave 1 elevations on prod app user: still attached. Held until intake portal schema script needs them.

## Testing

```bash
# No new code in Session 126 to test. Standard suites still apply.
npm test -- --runInBand

# Wave 1 alignment check (no writes)
node scripts/sync-wave1-postgres-to-dataverse.js --target=prod
```
