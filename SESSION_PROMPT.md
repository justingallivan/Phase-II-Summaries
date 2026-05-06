# Session 135 Prompt: Reviewer interaction read-ahead + intake portal slice

## Heads up

Session 134 was an unplanned detour: the office Mac memory reconciliation procedure (`docs/OFFICE_MAC_MEMORY_SYNC.md`) failed because of a wrong project slug — the doc used `Programming-Phase-II-Summaries` but the repo lives under `WMKF_Apps/`, so the actual slug is `Programming-WMKF-Apps-Phase-II-Summaries`. The reconcile is now complete (both Macs symlinked), and the same bug was patched in `docs/MULTI_MAC_SETUP.md` so future-Mac onboarding won't trip on it.

The S133 carryover — reviewer interaction read-ahead/slides, intake portal, Connor email + impersonation re-smoke, Dynamics Explorer schema curation — is unchanged. None were touched. They remain on deck.

## Session 134 summary

### What was completed

1. **Office Mac memory reconciliation** (`6ea8f2e`).
   - Snapshotted office Mac's pre-symlink memory (2 files: `MEMORY.md`, `project_sharepoint_write_permissions.md`) to iCloud, then symlinked `~/.claude/projects/-Users-gallivan-Programming-WMKF-Apps-Phase-II-Summaries/memory` → repo's `.claude-memory/`.
   - Reconcile was effectively a no-op: the office snapshot's only unique memory entry (`project_sharepoint_write_permissions.md`) was already superseded by a richer inline SharePoint entry in the home `MEMORY.md`.
   - Cleaned up: pre-reconcile backup, iCloud snapshot dir, an unexpected macOS `memory 2` duplicate, the reconcile doc itself, the corresponding memory file, and the MEMORY.md index line.

2. **Slug-bug fix in `docs/MULTI_MAC_SETUP.md`** (same commit).
   - Step 1 clone path: `~/Programming/` → `~/Programming/WMKF_Apps/`.
   - Step 4 `PROJECT_SLUG`: `…-Programming-Phase-II-Summaries` → `…-Programming-WMKF-Apps-Phase-II-Summaries`.

3. **Skipped Step 4 of the reconcile doc** (carryover-hygiene rule append to `start` skill).
   - The doc claimed the `start` skill lives in user-global Claude config; it actually lives in the repo at `.claude/skills/start/SKILL.md`.
   - The proposed rule is also already present in `CLAUDE.md`'s "Carryover Hygiene" section, which loads into every session — adding it to the skill would be redundant.

### Commits (Session 134)

- `6ea8f2e` — Complete office Mac memory reconciliation; fix multi-Mac setup slug

### Memory updates this session

None. The reconcile doc's memory entry (`project_office_mac_memory_sync.md`) was deleted as planned.

## Production state

Unchanged from end of S132/S133.

- Vercel preview env: `DYNAMICS_IMPERSONATION_ENABLED=true`. BLOCKED on Connor granting Delegate role to `# WMK: Research Review App Suite` app user.
- Vercel production env: `DYNAMICS_IMPERSONATION_ENABLED` unchanged (off / unset).
- Request 1002379's `wmkf_ai_summary` still contains `(impersonation probe — ignore)` — restore on impersonation re-smoke.
- Wave 1 stability clock still running from 2026-05-03.

## Where to pick up — Session 135

### A. **Browser-session work (cheaper model): produce the colleague-shareable artifacts**

Brief is at `docs/REVIEWER_INTERACTION_DESIGN.md`. Take it to a browser session with Sonnet (or similar) and produce:

1. **PD-facing read-ahead** — tight (3-4 pages), narrative-first, less "design doc" tone than the brief. The reviewer-POV walkthrough ("you're a researcher, you receive an email...") is what colleagues will react to most usefully.
2. **Slide deck** — 8-12 slides, one per stage plus opening/closing context. Longer is fine for slides since they're skimmed.

Justin plans to ask colleagues to come to a meeting with both marked up for discussion.

### B. Intake portal — institution / membership flow (~1 day per slice)

Still the explicit primary thread per S132 alignment. Schema in `docs/INTAKE_PORTAL_DESIGN.md` lines 84–143. First-slice options:

- **(a) search/match endpoint:** EIN exact → name exact → fuzzy via Dataverse Search. Returns 0..N candidate institutions.
- **(b) membership-write flow:** applicant picks or selects "create new"; selection writes `wmkf_portal_membership`; "create new" routes to staff approval.

(a) is more contained. Pick whichever feels easier to scope cleanly into one session.

### C. Send the Connor email + re-smoke impersonation when unblocked

Email is at `docs/CONNOR_DELEGATE_ROLE_REQUEST.md`, ready to copy/paste. After Delegate is granted:
1. Re-run `/phase-i-dynamics` against request 1002379 with overwrite=true (restores summary text + re-smokes).
2. Confirm `_modifiedby_value` resolves to Justin's systemuserid (`29b0de0d-4ff7-ee11-a1fd-000d3a3621c7`).
3. Confirm `_createdby_value` on the latest `wmkf_ai_run` for that request — same.
4. Tail Vercel preview logs — zero `Impersonated write rejected` warnings.
5. Then ask Connor / kmoses to run a smoke as themselves.
6. If clean, flip prod flag, redeploy, smoke once.

### D. Palate cleanser: Dynamics Explorer schema curation

Walk `scripts/dynamics-schema-diff.js` output for priority tables (akoya_request, akoya_requestpayment, contact, account) and add 30-40 user-relevant fields to inline annotations. Tooling in place; only curation remains. Memory: `project_dynamics_explorer_schema_diff.md`.

### Externally gated (don't pursue without signal)

- Connor sync on intake portal Qs in `docs/CONNOR_INTAKE_PORTAL_SYNC.md` (send-ready).
- Phase 0 brief delivery — `docs/CONNOR_BRIEF_PHASE0.md` (send-ready).
- Interim grant report auto-evaluation — blocked on Connor input.

### Deliberately deferred (still don't do)

- 27-script `setRestrictions` / `bypassRestrictions` migration — cleanup, not blocking.
- Wave 1 retirement — earliest 2026-05-17 (14-day stability clock from 2026-05-03).
- ⚠️ **Drop Postgres reviewer tables** — would break the live Reviewer Finder app.

## Key files added/modified this session

| File | Purpose |
|---|---|
| `docs/MULTI_MAC_SETUP.md` | MODIFIED — corrected clone path + project slug to include `WMKF-Apps` segment |
| `docs/OFFICE_MAC_MEMORY_SYNC.md` | DELETED — one-shot procedure complete |
| `.claude-memory/project_office_mac_memory_sync.md` | DELETED — corresponding memory entry |
| `.claude-memory/MEMORY.md` | MODIFIED — removed reconcile-procedure index line |

## Home Mac follow-up

Once at home: `git pull` will sync today's changes. Optional sanity check: `ls ~/.claude/projects/-Users-gallivan-Programming-WMKF-Apps-Phase-II-Summaries/` — should show only `memory` (symlink) plus session `.jsonl` files. Anything else (e.g. `memory.bak`, `memory 2`) is leftover from the home Mac's own earlier symlink switch and can be deleted.

## Testing

```bash
# Full suite (should still be 407/407, 1 skipped)
npm test -- --runInBand

# API route matrix CI gate
npm run check:api-routes
```
