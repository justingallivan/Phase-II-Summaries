# Session 133 Prompt: Intake portal institution/membership flow

## Heads up

Session 132 cleared two of the three open threads from S131. **A. Impersonation rollout** is preview-flipped + smoke-tested, blocked on Connor granting a Dataverse role. **B. Security operating plan alignment** is fully ratified. **C. Intake portal** is the obvious next primary thread — that decision was made explicit during the alignment conversation.

Also shipped two small Dynamics Explorer improvements unrelated to those threads: active-only default filter, and the first cut of AI-field documentation on `akoya_request` (with a new schema-diff tool to make future curation easier).

## Session 132 summary

### What was completed

1. **Dynamics Explorer: exclude inactive records by default** (`9c8e456`).
   - OData query tools (`query_records`, `count_records`, `aggregate`, `find_reports_due`, `export_csv`) now auto-inject `statecode eq 0` so deactivated records are hidden unless the model passes `include_inactive: true`.
   - User-supplied `statecode` clauses honored verbatim (auto-injection skipped when the user filter mentions statecode).
   - `search` and `get_entity` deliberately unchanged — those are name/ID lookups where active-only filtering would surprise the user. Documented why in the conversation; if the model needs to filter Dataverse Search, it'd be a post-filter rather than a clause in the search query.
   - Tool descriptions + system-prompt rules updated so the model doesn't write `statecode eq 0` itself.

2. **Dynamics Explorer: document AI-generated fields on `akoya_request`** (`25d91e4`).
   - Five `wmkf_ai_*` Memo fields added to `TABLE_ANNOTATIONS` so the model surfaces them: `wmkf_ai_summary`, `wmkf_ai_fitrationale`, `wmkf_ai_dataextract`, `wmkf_ai_compliancesummary`, `wmkf_ai_complianceissues`.
   - Trigger: user noticed `wmkf_ai_summary` was missing despite being in Dataverse for weeks. Existing `dynamics-schema-map.js` couldn't catch it — sample-based, drops fields populated <20% of 25 sampled records, and sparsely-populated AI fields fall through.
   - **New tool:** `scripts/dynamics-schema-diff.js`. Definition-based via `EntityDefinitions(LogicalName='X')/Attributes` — enumerates every attribute regardless of population. Filters out `*_base` shadows, `AttributeOf` subordinates, infrastructure noise, TRASH-labeled fields. Output: console report grouped by attribute type + structured JSON (gitignored). Run: `node scripts/dynamics-schema-diff.js [tableName ...]`. No args = all annotated tables.
   - Surfaced ~250 custom-only missing fields on `akoya_request` alone (of 1213 across all six annotated tables). User explicitly chose minimal patch (option 3) — only the AI family added; broader curation deferred but tooling now exists.
   - Memory: `project_dynamics_explorer_schema_diff.md` records why to use the new tool over the old mapper.

3. **Impersonation rollout: preview flipped, smoke ran, blocker identified** (`df1591f`).
   - `DYNAMICS_IMPERSONATION_ENABLED=true` set on Vercel preview, deployment built, alias `wmkfresearchapps-preview.vercel.app` pointed at it.
   - Smoke: signed in as `jgallivan@wmkeck.org`, summarized request 1002379 via `/phase-i-dynamics`. Summary text wrote successfully but `_modifiedby_value` came back as the service principal, not Justin's systemuserid.
   - **Root cause via direct Dataverse probe:** the application user `# WMK: Research Review App Suite` lacks `prvActOnBehalfOfAnotherUser`. Every impersonation attempt 403s; `_writeFetch` 403 fallback strips `MSCRMCallerID` and retries, succeeds, but attribution lands on the app user.
   - Vercel logs corroborated: two `[DynamicsService] Impersonated write rejected` warnings, one for the `akoya_request` PATCH and one for the `wmkf_ai_run` POST, both with the same Dataverse error message.
   - **Important nuance:** the rollout doc anticipated *staff-role* privilege gaps (per-table writes). Actual gap is one layer above — the app user can't impersonate anyone at all. Until Delegate is granted, the staff-role smoke test (kmoses narrow / cnoda broad) is moot. Future rollouts in other Dataverse environments should verify Delegate is on the app user *first*.
   - **Side effect (resolved at re-smoke time):** request 1002379's `wmkf_ai_summary` was overwritten with placeholder text `(impersonation probe — ignore)` during the direct-API reproduction. Re-running summarize with `overwrite=true` after Connor unblocks both restores the field AND verifies impersonation in the same step. Two-for-one.
   - **Connor email drafted:** `docs/CONNOR_DELEGATE_ROLE_REQUEST.md` (email body up top, internal context below). Single-purpose ask — grant Delegate role to the app user. Not yet sent.
   - Memory updated: `project_dynamics_identity_reconciliation.md` flipped from "rollout gated on flag flip" to "BLOCKED on Connor granting Delegate role."

4. **Security operating plan: initial alignment ratified** (`9a95d5c`, `c11d2b7`, `f6682de`).
   - Drafted a one-page brief mapping each of the six § Initial Alignment Agenda decisions to a recommendation (`9a95d5c`, archived `c11d2b7`).
   - Justin ratified all six on the spot (1 ✓ 2 ✓ 3 ✓ 4 ✓ 5 ✓ 6 ✓).
   - Decisions folded into a new `## Decisions, 2026-05-05` block in `docs/SECURITY_OPERATING_PLAN.md`. Old § Initial Alignment Agenda section removed per the plan's own instruction.
   - Notable concrete change beyond ratification: **weekly cadence trigger switched from "first session of the week" to a recurring calendar reminder** (Mondays AM) — explicit recurrence guards against the cadence-drift failure mode that quietly slips after several weeks.
   - The wmkf_ai_run read-access question piggybacked onto the Connor email was self-answered same day (`f6682de`): in this Dataverse environment, staff have read access to all fields across all tables by design. Question dropped from the Connor email; assumption baked into the watch-item description so it doesn't get re-asked. Escalation threshold remains "non-staff role gains read access" (e.g. external-portal contact / applicant tenant user).

### Commits (Session 132)

- `9c8e456` — Dynamics Explorer: exclude inactive records by default
- `25d91e4` — Dynamics Explorer: document AI-generated fields on akoya_request
- `df1591f` — Connor request: Delegate role for Research Review App Suite app user
- `9a95d5c` — Security plan: draft initial alignment brief
- `c11d2b7` — Security plan: ratify initial alignment decisions
- `f6682de` — Security plan: resolve wmkf_ai_run read-access question

### Memory updates this session

- New: `project_dynamics_explorer_schema_diff.md` — when to use the new diff tool vs. the older sample-based mapper.
- Updated: `project_dynamics_identity_reconciliation.md` — status flipped to BLOCKED-on-Connor; diagnosis (`prvActOnBehalfOfAnotherUser` on the app user) recorded; rollout doc's anticipated layer noted as wrong (privilege gap is one layer above staff roles).
- MEMORY.md index entry for the schema-diff memory; impersonation rollout pointer line rewritten.

## Production state (sanity)

- Vercel preview env: `DYNAMICS_IMPERSONATION_ENABLED=true`. Safe to leave on — 403 fallback handles failures; retest will be cheap once Connor unblocks.
- Vercel production env: `DYNAMICS_IMPERSONATION_ENABLED` unchanged (off / unset). Don't flip prod until preview re-smokes clean post-Delegate.
- Request 1002379's `wmkf_ai_summary` currently contains `(impersonation probe — ignore)` — re-run summarize with overwrite to restore.
- Everything else as of end of S131. Wave 1 stability clock still running from 2026-05-03.

## Where to pick up — Session 133

### A. **PRIMARY: Intake portal — institution / membership flow** (~1 day per slice)

Per the alignment conversation in S132, this is the explicit next primary thread for sessions 133+. Schema in `docs/INTAKE_PORTAL_DESIGN.md` lines 84–143. Bite-sized first slice:

- **(a) search/match endpoint:** applicant types name + EIN; Dataverse query tries exact EIN → exact name → fuzzy via Dataverse Search. Returns 0..N candidate institutions.
- **(b) membership-write flow:** applicant picks a candidate or selects "create new"; selection writes a `wmkf_portal_membership` row; "create new" routes to staff approval queue.

Pick whichever feels easier to scope cleanly into one session. (a) is more contained and a useful standalone endpoint; (b) needs the staff-approval queue stub which is a bit more design.

### B. Send the Connor email + re-smoke impersonation when unblocked

Email is at `docs/CONNOR_DELEGATE_ROLE_REQUEST.md`, ready to copy/paste. After Connor confirms Delegate is granted:
1. Re-run `/phase-i-dynamics` against request 1002379 with overwrite=true (one-step: restores summary text + re-smokes).
2. Confirm `_modifiedby_value` on the request resolves to Justin's systemuserid (`29b0de0d-4ff7-ee11-a1fd-000d3a3621c7`).
3. Confirm `_createdby_value` on the latest `wmkf_ai_run` row for that request — same.
4. Tail Vercel preview logs — zero `Impersonated write rejected` warnings.
5. Then ask Connor / kmoses to run a smoke as themselves — that's the real privilege-intersection test the rollout doc anticipated.
6. If clean, flip `DYNAMICS_IMPERSONATION_ENABLED=true` in production, redeploy, smoke once.

### C. Palate cleanser: Dynamics Explorer schema curation

If you want a 1-2 hour task between bigger rocks: walk through `scripts/dynamics-schema-diff.js` output for the priority tables (akoya_request, akoya_requestpayment, contact, account) and add 30-40 user-relevant fields to inline annotations. Tooling is now in place; only the curation work remains. Memory: `project_dynamics_explorer_schema_diff.md`.

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
| `pages/api/dynamics-explorer/chat.js` | Added `applyActiveOnlyFilter` helper; wired into 5 OData tools |
| `shared/config/prompts/dynamics-explorer.js` | `include_inactive` opt-out param on tool defs; system-prompt rule; AI field annotations on akoya_request |
| `scripts/dynamics-schema-diff.js` | NEW — definition-based schema diff tool |
| `.gitignore` | Ignore `scripts/dynamics-schema-diff.json` artifact |
| `docs/CONNOR_DELEGATE_ROLE_REQUEST.md` | NEW — email + internal diagnosis for the impersonation blocker |
| `docs/SECURITY_OPERATING_PLAN.md` | Decisions block; weekly cadence trigger updated; Initial Alignment Agenda section removed; wmkf_ai_run watch item annotated |
| `docs/archive/SECURITY_OPERATING_PLAN_ALIGNMENT_BRIEF.md` | Moved from `docs/` after ratification |
| `.claude-memory/project_dynamics_explorer_schema_diff.md` | NEW — when to use diff tool vs. mapper |
| `.claude-memory/project_dynamics_identity_reconciliation.md` | Status flipped to BLOCKED-on-Connor; diagnosis recorded |
| `.claude-memory/MEMORY.md` | Two index entries refreshed |

## Testing

```bash
# Full suite (should still be 407/407, 1 skipped)
npm test -- --runInBand

# API route matrix CI gate
npm run check:api-routes

# Run the new schema diff tool (any/all annotated tables)
node scripts/dynamics-schema-diff.js
node scripts/dynamics-schema-diff.js akoya_request

# Re-verify live phase-i.summary row in sync with seed
node scripts/diff-phase-i-summary-prompt.js
```
