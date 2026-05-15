# Session 154 Prompt: Resume project work (Connor's Item 6 tests + schema slice 0)

## ⚠️ WORK MAC FIRST-SESSION TODO (one-time, do before real work)

Three things must happen the first time Claude is launched at the office. The migrations from this session won't take effect at work until these steps run. Do them in order:

```bash
# 1. Update git remote to the new repo name (Phase-II-Summaries → wmkf-research-apps)
git remote set-url origin https://github.com/justingallivan/wmkf-research-apps.git
git remote -v   # verify

# 2. Launch Claude Code; run /start (old global version pulls new content from git)

# 3. After /start finishes, delete the stale global skills:
rm -rf ~/.claude/skills/start ~/.claude/skills/stop

# 4. (optional) /stop — belt-and-suspenders

# 5. Quit Claude Code completely

# 6. Launch Claude Code again, run /start
#    Verify the new /start runs 3 gates (atlas + atlas:self-test + api-routes)
#    AND includes Step 5 destructive-carryover safety
#    If yes: real work can begin.
```

**Why this is needed:** at home today we (a) renamed the GitHub repo to `wmkf-research-apps`, (b) consolidated `start`/`stop` skills to project-scope-only (the older global copies at work need manual deletion). Once these one-time steps complete, `git push`/`pull` keeps everything in sync going forward — no more per-Mac drift.

---

## Session 153 Summary

Infrastructure-heavy session focused on reconciling the home-Mac environment with the work-Mac iCloud-synced repo. No project feature work; carryover items from S151/S152 all forward intact.

### What was completed

1. **Home-Mac iCloud reconciliation**
   - Restored 7 missing tracked files (`CLAUDE.md`, `middleware.js`, `next.config.js`, `jest.config.js`, `jest.setup.js`, `DEVELOPMENT_LOG.md`, `GEMINI.md`) — iCloud sync had silently dropped them on disk
   - Verified iCloud sync misbehavior (sync conflicts, file reverts mid-session); accepted iCloud as working copy with hardened recovery via git
   - Cleaned up iCloud sync-conflict files (`.next 2`, `.next 3`, `next.config 2.js`, `node_modules 2`, the weird `Documents-com~apple~CloudDocs-...` artifact)
   - Documented `~/Documents/...` alternate iCloud path (some Macs surface iCloud Drive there instead of `~/Library/Mobile Documents/...`)

2. **Memory reconciliation with work-Mac restructure**
   - Work mac's S151-era `73ae447` extracted 8 inline sections from `MEMORY.md` into separate files (admin_dashboard, app_access_control, dev_environment, dynamics_crm_limitations, dynamics_crm_users, dynamics_email, dynamics_explorer_details, sharepoint_integration). HEAD memory went 53 → 64 files.
   - Content audit confirmed restructure was faithful — 51 of 53 shared files byte-identical, the 2 differing files (`MEMORY.md`, `feedback_red_gates_are_p0.md`) intentional newer revisions
   - Patched two trivial omissions: `project_app_access_control.md` got "15" restored (app count), `project_dynamics_explorer_details.md` got the `wmkf_abstract` historical phrasing restored

3. **`.env.local` reconciliation** — 8 keys appended from home-Mac local clone (gitignored, doesn't move via git): `EXTERNAL_AZURE_AD_CLIENT_ID/SECRET/TENANT_ID`, `NOTIFICATION_EMAIL_FROM`, `SERP_API_KEY`, and the three `WAVE1_BACKEND_*` flags. Shared keys untouched (iCloud values trusted as more recent).

4. **Skill consolidation** — project-scope `start`/`stop` are now the single source of truth. Global `~/.claude/skills/{start,stop}` on home mac deleted. Skill changes:
   - `start` now runs 3 gates (added `check:atlas:self-test`) and includes Step 5 destructive-carryover safety (added after the 2026-05-03 Reviewer Finder near-miss)
   - `stop` keeps the `.claude-memory/` git-add line; DEVELOPMENT_LOG.md guidance now milestone-only with format spec
   - Work mac still has the older global versions — see WORK MAC TODO above

5. **One-shot investigation scripts removed** — three SUNY-PDF scripts with hardcoded `/Users/gallivan/Programming/Phase-II-Summaries/...` and `/tmp/suny-stonybrook-phase-i.pdf` paths: `test-suny-pdf-native.js`, `test-suny-pdf-cache.js`, `inspect-suny-pdf.js`. Investigation campaign concluded; results captured in `docs/PDF_INPUT_FOR_BACKEND.md`. The doc table was updated.

6. **GitHub repo renamed** from `Phase-II-Summaries` to `wmkf-research-apps` (matches Vercel project name `wmkf_research_apps`). Vercel auto-detected via webhook (links by repo ID `1043484183`, immutable). Local remote on home Mac updated; in-repo GitHub URL refs updated in `shared/components/Layout.js`, `pages/index.js`, `scripts/setup-git-nosync.sh`. Work-Mac remote update is in the WORK MAC TODO above.

7. **`.claude/settings.local.json`** — cleaned 6 stale Bash allow-list entries referencing old paths (gitignored file, no commit).

### Commits (this session)

- `8b1db26` — Reconcile home-mac memory + doc with work-mac restructure
- `6ccdf96` — Consolidate start/stop skills to project scope as single source of truth
- `e75444f` — Remove one-shot test-suny-pdf-native investigation script
- `ee99524` — Remove two more one-shot SUNY-PDF investigation scripts
- `52a0772` — Update in-repo GitHub URL refs to wmkf-research-apps

### Project work — carry forward unchanged (S151 → S154)

Same items as S153 prompt; all still pending:

#### A. Connor's Item 6 test results (PRIMARY)

| Test outcome | Path |
|---|---|
| Both pass cleanly | **A+B hybrid confirmed.** Write schema slice JSON specs + plan Option B follow-up. |
| Test 1 passes, Test 2 fails | A handles Create/Update; design huddle for Delete fallback. |
| Test 1 fails on any event | A is dead. **Option B alone** — build `$batch` first; slips schema slice past 2026-05-19. |

#### B. Pre-deploy live probe (BLOCKING — before any schema deploy)

```bash
node scripts/dynamics-schema-diff.js
```

Confirm no existing live values occupy `100000002`–`100000004` on `wmkf_apprequestperson.wmkf_role`. If occupants found, re-number before deploy.

#### C. Write schema slice JSON specs (when A clears)

Targets in `lib/dataverse/schema/wave2/` (or `intake/` subdir):
- `wmkf_proposalbudgetline.json` — new entity, 9-value `wmkf_category` enum
- `wmkf_apprequestperson` extension — add `wmkf_effortpct` / `wmkf_biosketchurl` / `wmkf_lineorder`; expand `wmkf_role` to 5 values
- `akoya_request.wmkf_totalothersources` (Money, net-new aggregate field)
- `wmkf_portal_membership.wmkf_priordecisionstatus` (Choice, 3 values, nullable)

#### D. Atlas pages for new entities (alongside C)

- NEW: `docs/atlas/dataverse-wmkf-proposalbudgetline.md`
- AMEND: `docs/atlas/dataverse-wmkf-apprequestperson.md` (three new fields)
- NEW or AMEND: `wmkf_portal_membership` / `wmkf_priordecisionstatus`

#### E. Apply `submission_jobs` to prod Postgres

```bash
node scripts/setup-database.js  # runs V30 idempotently
```

#### F. Carryover (low priority)

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
- **iCloud sync can silently mutate the working tree** — files we edit may revert, and conflict-suffix dupes (`foo 2.js`) may appear during background sync. If `git status` shows unexpected deleted/modified files, `git restore` is usually the right move. The home-Mac working copy lives at `~/Documents/Programming/Claude_Projects/WMKF_Apps/` (iCloud surfaces it there via Desktop & Documents).
- **Memory symlink uses `sed 's|[/ ~_]|-|g'`** — Claude Code encodes /, spaces, tildes, and underscores all as hyphens in the project slug. The fix doc (`docs/HOME_MAC_MEMORY_SYNC_FIX.md`) is correct.
- **Stale local clone at `/Users/gallivan/Programming/Phase-II-Summaries/`** on home Mac is no longer authoritative — everything from it has been reconciled into the iCloud copy. Safe to delete after one more verification, but left for now.
