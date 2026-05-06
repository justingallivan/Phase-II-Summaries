# Session 136 Prompt: Reviewer migration plan + intake portal schema catalog

## Heads up

Session 135 unblocked the long-standing impersonation rollout (Connor granted the Delegate role) **and** consumed the rest of the morning in a six-decision walkthrough of `docs/CONNOR_INTAKE_PORTAL_SYNC.md` with Connor in the room. The biggest output is a strategic shift: **the Postgres → Dataverse reviewer migration is now top-priority, prerequisite for the mid-June 2026 portal pilot.** Connor preferred Option A ("pull the band-aid off") over decoupling the migration from pilot.

Memory has been thoroughly updated — see the three new entries listed below before doing anything reviewer- or portal-touching.

## Session 135 summary

### What was completed

1. **Delegate role grant verified + impersonation re-smoke (PASS)** (`8c7f159`, `d2634d8`).
   - `scripts/probe-app-user-roles.js` confirmed Delegate is on the `# WMK: Research Review App Suite` app user.
   - `scripts/probe-impersonation-resmoke.js` ran end-to-end as Justin: PATCH `akoya_request` 1002379 wmkf_ai_summary + POST wmkf_ai_run, both attributed to Justin's systemuserid via MSCRMCallerID.
   - `scripts/probe-impersonation-as-user.js` (variant taking email/systemuserid arg) ran as `cnoda@wmkeck.org`: same two writes, both attributed to Connor. Validates impersonation works for a different staff identity.
   - **Side effect**: `wmkf_ai_summary` on req 1002379 now holds two sentinel overwrites (one Justin-stamped, one Connor-stamped). Original summary still needs to be restored — see Carryover.

2. **Connor intake portal walkthrough** — six decisions resolved live, full meta-architectural decisions captured (`3f5b335`).
   - All six decisions in `docs/CONNOR_INTAKE_PORTAL_SYNC.md` are resolved. See `.claude-memory/project_intake_portal_pilot_decisions_2026-05-06.md` for the authoritative resolutions; **the doc's defaults are NOT what was decided in several places.**
   - **Big architectural meta-decisions** captured separately:
     - Reviewer Postgres → Dataverse migration is now active top-priority gating work (`project_reviewer_postgres_to_dataverse_migration.md`).
     - T&C signing pattern: magic link to AO + Liaison, web form captures name/title — NOT DocuSign, NOT Entra External ID for the AO (AO/Liaison are stored as `contact` rows on `account`).
     - Calendly for post-T&C scheduling step.
     - Staff approvals across the board are one-click magic links (membership, account creation, institutional doc updates, AO/Liaison change).
     - Schema-creation authority delegated to Justin/Claude; maintain `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md` as the audit catalog (`project_dataverse_creator_privileges.md`).

3. **Memory updates committed** (`3f5b335`).
   - Three new memory files (intake portal pilot decisions, reviewer migration, creator privileges).
   - Identity-reconciliation index line refreshed (Delegate granted, smoke PASS).
   - "Do not drop Postgres reviewer tables" softened with migration pointer.

### Commits (Session 135)

- `8c7f159` — Add impersonation re-smoke probes; verify Delegate role grant
- `d2634d8` — Add per-user impersonation smoke variant
- `3f5b335` — Memory: capture intake portal pilot decisions + migration priority shift

### Memory updates this session

**New:**
- `.claude-memory/project_intake_portal_pilot_decisions_2026-05-06.md`
- `.claude-memory/project_reviewer_postgres_to_dataverse_migration.md`
- `.claude-memory/project_dataverse_creator_privileges.md`

**Edited:**
- `.claude-memory/project_reviewer_finder_dataverse_entry_path.md` (UPDATE 2026-05-06 block)
- `.claude-memory/MEMORY.md` (3 new index pointers; identity-reconciliation line; reviewer-finder line softened)

## Production state

- **Impersonation rollout UNBLOCKED.** Delegate role granted on app user. Preview env still has `DYNAMICS_IMPERSONATION_ENABLED=true`. Re-smoke PASS for both Justin and cnoda staff identities.
- **Production env flag still off** — flip after the home-Mac UI smoke clears (see Carryover §A).
- **Request 1002379** `wmkf_ai_summary` still holds a sentinel ("(impersonation re-smoke 2026-05-06 as cnoda@wmkeck.org — please run /phase-i-dynamics with overwrite=true to restore the real summary)"). Real summary regeneration is in Carryover §A.
- **Two probe `wmkf_ai_run` audit rows** exist in Dataverse (`8472984d-…` Justin-stamped, `0a63764a-…` Connor-stamped). Marked with `wmkf_ai_model='impersonation-resmoke'`. Harmless; can leave or delete.
- **Wave 1** stability clock still running from 2026-05-03.

## Where to pick up — Session 136

### A. **Tonight-at-home (carried from S135)** — restore wmkf_ai_summary + flip prod flag

Justin queued these for home-Mac because the preview deployment alias is only configured there:

1. **Re-run `/phase-i-dynamics` against request 1002379 with `overwrite=true`** in preview, signed in as `jgallivan@wmkeck.org`. Restores the real summary AND exercises the full code path through `executePrompt` + `_writeFetch`.
2. **Tail Vercel preview logs** during that run — confirm zero `Impersonated write rejected` warnings.
3. *(Optional)* repeat as kmoses to surface any narrower table-level 403s. *(May be lower-value now since cnoda already passed; her role list is broader than kmoses's, but that probe is already a good signal.)*
4. If clean: `vercel env add DYNAMICS_IMPERSONATION_ENABLED production` → `true`, redeploy, smoke once.

If A is already done before this session starts, skip to B.

### B. **PRIMARY THREAD: Draft `docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md`**

This is now top priority — it gates the portal pilot. Same shape as `docs/POSTGRES_TO_DATAVERSE_MIGRATION.md` (Wave 1).

Sections needed:
- Entity design (the two open forks):
  - Researcher = extend `contact` (recommended) vs. new `wmkf_researcher` entity
  - Publications = child `wmkf_publication` entity vs. JSON longtext vs. retire-and-rescrape on advancement
- Endpoint rewrite list (5+ Reviewer Finder endpoints + 18+ UI call sites)
- Service-layer rewrite list (`discovery-service.js`, `contact-enrichment-service.js`, `deduplication-service.js`, `database-service.js`, enrichment jobs)
- Dependency order
- Data migration plan (researchers + publications row counts)
- Rollback strategy
- Mid-June pilot timing constraints

Get Connor sign-off on the two design forks before any code lands. He's good with the strategic direction — the forks are technical detail he should weigh in on.

### C. Draft `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md`

Single audit catalog for every Dataverse change in the pilot. Connor delegated creator authority (see `project_dataverse_creator_privileges.md`); this is the doc he'll reference post-hoc.

Initial known changes to catalog:
- New entity `wmkf_portal_membership` (Decision 1 schema)
- New `account` lookups: `wmkf_authorized_official_contactid`, `wmkf_liaison_contactid`
- New `account` fields: `wmkf_governingboardfile`, `wmkf_govtunit`, `wmkf_groupexempt`, `wmkf_declarationofstatusfile`
- New `wmkf_reviewerstate` choice on `wmkf_potentialreviewer`: `applicant_suggested | staff_suggested | advanced | invited | confirmed | declined | reviewing | completed`
- Lifecycle stages on `akoya_request`: `Awaiting T&C`, `T&C Signed`, `Awaiting Scheduling Call`, `Call Scheduled` (between Accepted and Award Issued)
- New child entities for structured tables (Decision 6): `wmkf_budgetline`, `wmkf_personnel` (replaces `wmkf_copi1..5` slots), `wmkf_priorsupport`, `wmkf_milestone`
- Plus the reviewer-migration entities (overlaps with B): possibly `wmkf_publication`, possibly `wmkf_researcher` (depends on B's design fork)

C can be written in parallel with B — they're related but independent docs.

### D. Reviewer interaction artifacts (was in another window during S135)

Justin was working on `docs/REVIEWER_INTERACTION_DESIGN.md` artifacts (PD-facing read-ahead + slide deck) in a separate session. If that's done, no follow-up needed. If not, it's still on deck per the original S135 carryover.

### E. Connor email queue (send-ready, not blocked by us)

These were ready before S135 and still are:
- `docs/CONNOR_BRIEF_PHASE0.md` — Phase 0 Executor handoff brief. Send anytime.
- `docs/CONNOR_QUESTIONS_2026-04-15.md` — Q4-Q7 (Field Set B timeline, intermediate `wmkf_ai_*` fields, two `wmkf_ai_run` columns, PD expertise field). All non-blocking, can ride a future sync.

`docs/CONNOR_DELEGATE_ROLE_REQUEST.md` is now resolved — can be archived to `docs/archive/` after the prod flag flip.

### Externally gated (don't pursue without signal)

- `docs/CONNOR_INTAKE_PORTAL_SYNC.md` — fully resolved 2026-05-06. Archive after S136 drafts are written.
- Interim grant report auto-evaluation — still blocked on Connor input.

### Deliberately deferred

- 27-script `setRestrictions` / `bypassRestrictions` migration — cleanup, not blocking.
- Wave 1 retirement — earliest 2026-05-17 (14-day stability clock from 2026-05-03).
- Dynamics Explorer schema curation — palate cleanser only, not on critical path.
- ⚠️ **Drop Postgres reviewer tables** — STILL would break the live Reviewer Finder app. Don't drop until the migration in §B ships.

## Key files added/modified this session

| File | Purpose |
|---|---|
| `scripts/probe-app-user-roles.js` | NEW — read-only role list for `# WMK: Research Review App Suite` app user; verified Delegate grant |
| `scripts/probe-impersonation-resmoke.js` | NEW — end-to-end impersonation smoke as Justin (PATCH + POST) |
| `scripts/probe-impersonation-as-user.js` | NEW — variant taking email/systemuserid CLI arg; smoked with cnoda |
| `.claude-memory/project_intake_portal_pilot_decisions_2026-05-06.md` | NEW — full six-decision resolutions + meta-decisions |
| `.claude-memory/project_reviewer_postgres_to_dataverse_migration.md` | NEW — migration is now top priority |
| `.claude-memory/project_dataverse_creator_privileges.md` | NEW — Connor's standing schema-creation authorization |
| `.claude-memory/project_reviewer_finder_dataverse_entry_path.md` | MODIFIED — added 2026-05-06 update pointer |
| `.claude-memory/MEMORY.md` | MODIFIED — index updates |

## Home Mac follow-up

`git pull` will sync today's three commits (`8c7f159`, `d2634d8`, `3f5b335`). After pull, the carryover §A items (real `/phase-i-dynamics` regeneration on req 1002379, log tail, prod flag flip) can proceed.

## Testing

```bash
# Full suite
npm test -- --runInBand

# API route matrix CI gate
npm run check:api-routes

# Verify impersonation still passes (read + smoke)
node scripts/probe-app-user-roles.js
node scripts/probe-impersonation-resmoke.js          # writes a sentinel to req 1002379
node scripts/probe-impersonation-as-user.js cnoda@wmkeck.org
```
