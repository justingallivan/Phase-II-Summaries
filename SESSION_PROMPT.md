# Session 98 Prompt

## Session 97 Summary

A short, mostly-docs session. Fixed a JSON-parsing regression that was blocking the Grant Reporting app during user testing, then scoped the Dynamics write-back plan with Connor's review feedback and spun a related identity-reconciliation plan out of the PD-assignment discussion.

### What Was Completed

1. **Grant Reporting JSON robustness (`df37530`)**
   - Users were hitting `ERR-…-0VF / Failed to parse JSON response from Claude: Expected ',' or '}' after property value` on extraction runs — classic LLM failure where an unescaped quote / control character inside a long narrative string (abstract, project impacts) breaks `JSON.parse`.
   - Added `jsonrepair` as a fallback in `parseJsonResponse` (`pages/api/grant-reporting/extract.js`). On parse failure it repairs and retries; logs a warning when a repair was needed so we can see which runs required rescue. If repair also fails, the original error is still surfaced.
   - Installed via `npm install jsonrepair --cache /tmp/npm-cache` (the default npm cache had a stale permission issue).
   - Build verified.

2. **Dynamics AI Fields Spec — v1 drafted, reviewed by Connor, revised to v2 (`1e111ac`, `4cd5e19`, `b9687a2`)**
   - **v1** (`docs/DYNAMICS_AI_FIELDS_SPEC.md`) — comprehensive list of custom fields on `akoya_request` for AI output across four apps (Proposal Summary, Grant Report, Compliance, PD Assignment). ~25 fields proposed. Used `wmkf_ai_*` naming convention, with 4 metadata fields per task (generated_at, model, version, status).
   - **Connor's review** (`docs/DYNAMICS_AI_FIELDS_SPEC_cn-notes.md`, committed as historical reference) proposed major simplifications:
     - Use Dynamics Audit History instead of per-task metadata fields
     - Reuse existing `akoya_submissionaccepted` for compliance pass/fail
     - Drop compliance phase field (single-stage submissions are coming)
     - Write PD assignment directly to existing `wmkf_programdirector` lookup
     - Drop PD confidence / rationale / alternates (Excel export from PowerAutomate covers audit)
     - Hybrid child-entity + flat-fields approach
   - **v2** (`4cd5e19`) — all agreed. Net: ~25 proposed fields down to 18 new fields on `akoya_request` + 1 new `wmkf_ai_run` child table (7 fields) for provenance/audit.
     - Child table `wmkf_ai_run` logs every AI run (task type, timestamp, model, prompt version, status, raw payload). Must be excluded from Dynamics Explorer search.
     - Set A shrinks to 2 fields, Set B keeps data fields only, Set C shrinks to 2 new + reuse one existing, Set D has zero new fields on request.

3. **Dynamics Identity Reconciliation Plan (`88b49d3`)**
   - Surfaced while discussing Connor's PD-assignment feedback (point 7): PowerAutomate currently hardcodes PD systemuser GUIDs in the system prompt; staff changes break this silently. Bigger architectural issue: the Vercel apps authenticate users via Azure AD / `user_profiles.id`, Dynamics uses `systemuser.systemuserid`. No bridge.
   - All 16 licensed staff use `@wmkeck.org` emails that match `internalemailaddress` on systemuser — mapping is deterministic, just not stored.
   - Scoped `docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md`: V26 migration adding `dynamics_systemuser_id UUID` + `dynamics_reconciled_at TIMESTAMP` to `user_profiles`, one-shot resolver script, NextAuth sign-in hook, weekly maintenance cron, admin dashboard indicator, and an impersonation-on-writes helper (uses `MSCRMCallerID` header).
   - ~½ day of work. Steps 1–4 (bridge + reconciler + cron + admin visibility) need no new Dynamics permissions. Step 5 (impersonation on writes) waits on the pending write-permission grant.
   - Memory entry added: `project_dynamics_identity_reconciliation.md`.

### Commits

- `df37530` Add jsonrepair fallback for Grant Reporting extraction
- `1e111ac` Draft Dynamics AI fields spec for Connor (v1)
- `88b49d3` Scope Dynamics identity reconciliation plan
- `4cd5e19` Revise Dynamics AI fields spec to v2 after Connor review
- `b9687a2` Record Connor review notes on AI fields spec

## Deferred Items (Carried Forward)

- **Dynamics write-permission grant** on app registration `d2e73696-537a-483b-bb63-4a4de6aa5d45` — blocker for any writeback work. Connor is leading this.
- **Interim grant report auto-evaluation** — saved to memory (`project_interim_report_automation.md`); still blocked on Dynamics write access.
- **Staged Pipeline Implementation** — plan at `docs/STAGED_PIPELINE_IMPLEMENTATION_PLAN.md`, not yet scheduled.
- **CRM Email Send (Phase A)** — pending feedback on plan (`docs/CRM_EMAIL_SEND_PLAN.md`).
- **SharePoint write permission email to IT** — drafted but not yet sent.
- **Drop `Final Report Template.docx` into `public/templates/`** — Grant Reporting Word export built without template on hand; visual parity needs to be checked.
- Publication fields shape (Set B) — ask Connor: one JSON field per publication, or three flat fields per publication?
- Build Proposal Picker component for Dynamics integration
- next-auth v5 migration (still in beta)
- Re-enable coverage thresholds when test coverage reaches 70%/80%
- Code hardening: upload attribution, legacy upload-file.js cleanup

## Potential Next Steps

### 1. Continue Testing Grant Reporting Against Real Reports
User was actively test-driving when the JSON-parse error hit. With `jsonrepair` in place, pick the workflow back up — run a few more historical grants through, compare outputs to real staff-written reports, and iterate prompts if the counts/narratives/goals-assessment are off.

### 2. Implement Dynamics Identity Reconciliation (Steps 1–4)
~½ day. Steps 1–4 need no external permissions. Creates the systemuser bridge, which unblocks attributed writes once Connor's write-permission grant lands. See `docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md`.

### 3. Build Batch Evaluation Tool (Phase 1 Priority)
Same as Session 95/96/97 — prompt engineering at scale against historical data, starting with compliance screening.

### 4. Send SharePoint Write Permission Email
Drafted but not sent. Once granted, unblocks the interim report auto-evaluation TODO.

### 5. Test Expertise Finder End-to-End (carried from Session 95)
Grant access, upload a real proposal, verify staff/consultant/board outputs, iterate prompt.

### 6. Test Devil's Advocate End-to-End (carried from Session 93)
Run several panel reviews with DA enabled, verify output and exports.

## Key Files Reference

| File | Purpose |
|------|---------|
| `pages/api/grant-reporting/extract.js` | Extraction endpoint — `parseJsonResponse` now has `jsonrepair` fallback |
| `docs/DYNAMICS_AI_FIELDS_SPEC.md` | v2 spec for Connor — 18 new fields on `akoya_request` + `wmkf_ai_run` child table |
| `docs/DYNAMICS_AI_FIELDS_SPEC_cn-notes.md` | Connor's annotated v1 (historical) |
| `docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md` | Plan to bridge `user_profiles` ↔ Dynamics `systemuser` |
| `package.json` / `package-lock.json` | Adds `jsonrepair ^3.13.3` |

## Testing

```bash
npm run dev                              # Start dev server (dev already running on 3000 in this session)

# Trigger Grant Reporting extraction that previously failed
#  — watch for "JSON required repair" warning in server logs;
#    output should succeed even when Claude's raw JSON is malformed
```

## Session hand-off notes

- Four commits (`df37530`, `1e111ac`, `88b49d3`, `4cd5e19`, `b9687a2`) are local; they'll get pushed at `/stop`.
- No open uncommitted changes.
- Dev server was running on port 3000 (PID 43870 at session start) — still running if you didn't shut it down.
