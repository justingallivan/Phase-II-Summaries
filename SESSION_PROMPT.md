# Session 152 Prompt: Resume S151 project work (first session from iCloud directory)

## Heads up

Session 151 was entirely tooling/infrastructure — no project feature work happened. The S151 project items (Connor's Item 6 tests, pre-deploy probe, schema slice 0) carry forward unchanged.

**Before starting project work**, verify the iCloud migration completed cleanly and the home Mac is set up correctly (see § Home Mac Setup below).

## Session 151 summary

### What happened

A memory system audit surfaced several compounding problems with the Claude Code memory sync between the work Mac and home Mac. The entire session was spent diagnosing and fixing them.

### Root causes found

1. **Home Mac memory was never wired into git** — the `~/.claude/projects/.../memory/` directory on the home Mac was likely a real directory, not a symlink to `.claude-memory/` in the repo. Memories written at home were local-only; memories committed at work never reached Claude Code at home.
2. **MEMORY.md was acting as a document, not an index** — 161 lines with large inline content blocks approaching the 200-line truncation limit. Inline facts were invisible to individual file reads.
3. **`/start` skill wasn't running CI gates** — `feedback_red_gates_are_p0.md` claimed the skill did this; it didn't.
4. **`/stop` skill wasn't committing `.claude-memory/`** — session memory writes were being orphaned at session end.
5. **Stale `commands/` duplicates** of the start/stop skills existed alongside the `skills/` versions.
6. **`MULTI_MAC_SETUP.md` had a hardcoded path** in its symlink command that assumed the same directory structure on both Macs — causing the symlink to be created at the wrong slug on machines with different paths.

### Fixes applied

- **`/start` skill** — added Step 2: run `check:atlas` + `check:api-routes` before loading context; updated `allowed-tools` frontmatter
- **`/stop` skill** — added `.claude-memory/` to the `git add` in Step 4
- **`feedback_red_gates_are_p0.md`** — corrected twice: first to remove the false "skill does this" claim, then updated again after the skill was actually fixed
- **MEMORY.md** — 8 inline sections extracted into individual files; index reduced from 161 → 98 lines
- **`commands/` duplicates** — deleted; `skills/` versions are authoritative
- **`MULTI_MAC_SETUP.md`** — deleted (caused more problems than it fixed)
- **`docs/HOME_MAC_MEMORY_SYNC_FIX.md`** — created, then rewritten twice: first to handle different path structures (slug derived from `pwd`), then again as a full iCloud migration procedure

### iCloud migration plan (execute at end of S151 work session)

The project is being moved to iCloud Drive so `.env.local`, memory, and project files sync automatically between Macs. Full procedure in `docs/HOME_MAC_MEMORY_SYNC_FIX.md`.

Work Mac steps (done at end of session):
1. Git push
2. Move project to iCloud Drive
3. `.nosync` symlinks for `node_modules` and `.next`
4. Update memory symlink to new path
5. Close Claude Code

### Repo rename (deferred)

Only one functional code reference to "Phase-II-Summaries": `shared/components/Layout.js:292` (GitHub URL). `.claude/settings.local.json` has two hardcoded paths (not in git). Deferred until after iCloud migration is stable on both machines.

### Commits this session

- `0b7cda9` — Add home-Mac memory sync fix doc
- `c4acfa0` — Fix two memory-system gaps found in audit
- `bd82974` — Remove stale commands/ duplicates of start and stop skills
- `73ae447` — MEMORY.md bloat cleanup — move inline content to individual files
- `7ff02ba` — Add CI gate check to /start skill
- `45532e2` — Fix HOME_MAC_MEMORY_SYNC_FIX — handle different project paths across machines
- `9c2febe` — Delete MULTI_MAC_SETUP.md — caused more problems than it fixed
- `84db6ab` — Update red-gates memory — /start skill now runs CI gates automatically
- `5dae529` — Rewrite HOME_MAC_MEMORY_SYNC_FIX — full iCloud migration procedure
- `(final)` — Commit stop skill fix missed in earlier staging

---

## Home Mac Setup (do this before starting project work)

Follow `docs/HOME_MAC_MEMORY_SYNC_FIX.md`. Key steps:

```bash
# From inside the iCloud project directory
cd ~/Library/Mobile\ Documents/com\~apple\~CloudDocs/Programming/WMKF_Apps/Phase-II-Summaries

# Fresh node install (don't trust iCloud-synced node_modules)
rm -rf node_modules.nosync && mkdir node_modules.nosync
npm install

# Memory symlink
PROJECT_PATH=$(pwd)
PROJECT_SLUG=$(echo "$PROJECT_PATH" | sed 's|/|-|g')
mkdir -p ~/.claude/projects/$PROJECT_SLUG
rm -rf ~/.claude/projects/$PROJECT_SLUG/memory
ln -s "$(pwd)/.claude-memory" ~/.claude/projects/$PROJECT_SLUG/memory

# Verify
ls -la ~/.claude/projects/$PROJECT_SLUG/memory

# Handle old local clone (check for uncommitted work first)
# git -C ~/old/path/to/clone status
# rm -rf ~/old/path/to/clone
```

---

## Project work — carry forward from S151 (unchanged)

### A. Connor's Item 6 test results (PRIMARY)

| Test outcome | Path |
|---|---|
| Both pass cleanly | **A+B hybrid confirmed.** Write schema slice JSON specs + plan Option B follow-up. |
| Test 1 passes, Test 2 fails | A handles Create/Update; design huddle for Delete fallback. |
| Test 1 fails on any event | A is dead. **Option B alone** — build `$batch` first; slips schema slice past 2026-05-19. |

### B. Pre-deploy live probe (BLOCKING — do before any schema deploy)

```bash
node scripts/dynamics-schema-diff.js
```

Confirm no existing live values occupy `100000002`–`100000004` on `wmkf_apprequestperson.wmkf_role`. If occupants found, re-number before deploy.

### C. Write schema slice JSON specs (when A clears)

Targets in `lib/dataverse/schema/wave2/` (or `intake/` subdir):
- `wmkf_proposalbudgetline.json` — new entity, 9-value `wmkf_category` enum
- `wmkf_apprequestperson` extension — add `wmkf_effortpct` / `wmkf_biosketchurl` / `wmkf_lineorder`; expand `wmkf_role` to 5 values
- `akoya_request.wmkf_totalothersources` (Money, net-new aggregate field)
- `wmkf_portal_membership.wmkf_priordecisionstatus` (Choice, 3 values, nullable)

### D. Atlas pages for new entities (alongside C)

- NEW: `docs/atlas/dataverse-wmkf-proposalbudgetline.md`
- AMEND: `docs/atlas/dataverse-wmkf-apprequestperson.md` (three new fields)
- NEW or AMEND: `wmkf_portal_membership` / `wmkf_priordecisionstatus`

### E. Apply `submission_jobs` to prod Postgres

```bash
node scripts/setup-database.js  # runs V30 idempotently
```

### F. Carryover (low priority)

- COI policy body wording (Stage 2a reviewer engagement)
- Revert temp role elevations on prod app user
- Sarah's Phase II Research field inventory (Track 2)

---

## Calendar checkpoints

- **2026-05-15** — Connor's flow-list reply target (overdue if unanswered)
- **2026-05-19** — Schema slice 0 deploy target. Blocked on Connor's Item 6 tests + live probe.
- **2026-05-26** — Dry-run: manually flip throwaway test request to `'Phase II Pending'` and watch PA flows fire.
- **2026-05-30** — Go/no-go review.
- **2026-06-01** — Pilot accepting submissions for mid-June Phase II Research cycle.

## Gotchas

- **Pre-deploy live probe on `wmkf_role` is non-negotiable** before schema slice 0.
- **`submission_jobs.draft_id` is nullable + ON DELETE SET NULL** — intentional, frozen `payload` JSONB carries traceability.
- **Partial unique index `idx_submission_jobs_one_active_per_request`** — at most one non-terminal job per `(account_id, request_id, form_key)`. Tab-refresh-resubmit safe by construction.
- **PA-boundary exception is narrow and non-extensible** — future aggregate fields need a new explicit decision.
