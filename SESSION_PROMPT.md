# Session 153 Prompt: Resume project work (Connor's Item 6 tests + schema slice 0)

## Heads up

Session 152 was infrastructure-only again — two memory/tooling bugs found and fixed during `/start`. No project feature work happened. The S151/S152 project items carry forward unchanged.

**Memory symlink is now correctly wired** for the new iCloud path. The `/start` skill will load memory properly from here on.

---

## Session 152 Summary

### What happened

Two bugs surfaced and were fixed during the `/start` startup sequence:

1. **Memory symlink was missing for the new iCloud path** — Claude Code created a real empty directory at the new project slug instead of a symlink to `.claude-memory/`. Fixed by removing the empty dir and symlinking it to the project's `.claude-memory/`. Memory is now live.

2. **`HOME_MAC_MEMORY_SYNC_FIX.md` had a wrong `sed` command** — the slug-derivation command only replaced `/` with hyphens, but Claude Code also encodes spaces (`Mobile Documents`), tildes (`com~apple~CloudDocs`), and underscores (`Claude_Projects`, `WMKF_Apps`) as hyphens. Fixed both occurrences in the doc and committed.

### Commits
- `38b8738` — Fix project-slug encoding in HOME_MAC_MEMORY_SYNC_FIX — spaces/tildes/underscores are hyphens

---

## Project work — carry forward from S151/S152 (unchanged)

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
- **Memory symlink uses `sed 's|[/ ~_]|-|g'`** — Claude Code encodes /, spaces, tildes, and underscores all as hyphens in the project slug. The fix doc (`docs/HOME_MAC_MEMORY_SYNC_FIX.md`) is now correct.
