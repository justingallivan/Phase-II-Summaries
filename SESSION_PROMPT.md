# Session 125 Prompt: Intake portal — wait on Entra/Connor, or pivot to carryover

## Heads up

Session 124 was a focused prep session for the intake portal pilot.
Five internal launch blockers from the design doc now have concrete
artifacts ready to drive them to closure. The portal is still gated on
the Entra External ID tenant — IT email goes Monday 2026-05-04 (the
day after this session). No portal *client* code can ship until that
returns. Almost everything else portal-side that *can* be built before
Entra now exists.

Reference docs:
- `docs/INTAKE_PORTAL_DESIGN.md` — design v2, post-Codex-review patches
- `docs/CONNOR_INTAKE_PORTAL_SYNC.md` — pre-read for Connor sync; 5 decisions sought
- `docs/IT_ENTRA_EXTERNAL_TENANT_REQUEST_2026-05-04.md` — IT email + tracking
- `docs/EXTERNAL_REVIEWER_INTAKE_PLAN.md` — reference pattern

## Session 124 summary

Single-track session: intake portal foundation. Started by patching
Codex review feedback into the design doc, then built down the stack —
schema, services, smoke tests, agenda, form module — until everything
that doesn't require Entra or Connor input was in place.

### What was completed

1. **Codex review patches into `INTAKE_PORTAL_DESIGN.md`.** Five
   P1/P2 issues plus smaller suggestions: reviewer-consumable artifact
   options (4-way decision, default = staff-rendered Word/PDF into
   `Reviewer_Downloads/`); draft uniqueness scoped per request
   (`(account_id, request_id, form_key)` so universities can run
   multiple proposals per cycle); membership approval state
   (`wmkf_approvalstatus` with requested/approved/rejected/revoked +
   audit fields); attachment lifecycle (Vercel Blob staging not
   SharePoint, virus scan at upload); status line softened to
   "largest external blocker" + explicit launch-blocker list; intake-
   admin app-registry checklist; request ownership guard rule; role
   permissions matrix (submitter vs contributor); OID-wins email change
   rule; virus scanning promoted to launch blocker.

2. **V26 migration — `intake_drafts` + `intake_audit`.**
   `lib/db/migrations/005_intake_portal.sql` + `setup-database.js` v26
   block. `intake_drafts` uses two partial unique indexes (one for
   `request_id IS NOT NULL` (pilot), one for `request_id IS NULL`
   (future concept-stage)). `intake_audit` is append-only with
   sha256-hashed payloads — bytes never stored. Applied to local DB
   cleanly (12 statements).

3. **`IntakeDraftService` + `IntakeAuditService`.**
   `lib/services/intake-draft-service.js` provides upsert/get/list/
   delete + atomic JSONB `appendAttachment` / `removeAttachment` ops
   (avoids read-modify-write races during concurrent uploads). The
   upsert switches between the two ON CONFLICT targets based on
   request-bound vs. request-less. `lib/services/intake-audit-service.js`
   is general-purpose — audit failures are swallowed so they cannot
   fail an applicant submit. `scripts/smoke-intake-draft.js` (18
   checks) green against local Postgres.

4. **Connor sync agenda doc.** `docs/CONNOR_INTAKE_PORTAL_SYNC.md` —
   five decision items in priority order: `wmkf_portal_membership`
   schema sign-off, reviewer-artifact pick (option 1 vs 2), Phase II
   Research field inventory first pass, PA flow boundary at
   `'Phase II Pending'`, account creation policy. Each section ends
   with explicit "decisions sought" closers. Section 3a was
   auto-generated from the mapper's punch list (next item).

5. **Form module: schema + validator + mapper.**
   - `shared/forms/phase-ii-research-2026-06/schema.js` — 8 sections,
     28 fields, 4 structured tables (budget_lines, co_investigators,
     milestones, prior_support_rows), 6 file fields, 8 narrative
     longtext fields. `previewOnly: true` gates submission until
     Sarah/Connor sign off.
   - `shared/forms/phase-ii-research-2026-06/validate.js` — schema-
     driven, two-mode (strict for submit, partial for autosave). Stable
     error codes (`required`, `type`, `maxChars`, `min`, `max`,
     `precision`, `choice`, `mime`, `maxSize`, etc.) with dot/bracket
     paths the UI can map back to fields.
   - `shared/forms/phase-ii-research-2026-06/map-to-dynamics.js` —
     produces a 4-part write plan (`akoyaRequestPatch`,
     `sharepointUploads`, `relatedEntityWrites`, `unmapped`). 3 fields
     confirmed against existing API routes (`akoya_title`,
     `wmkf_abstract`, `akoya_begindate`); 18 placeholders surface in
     `unmapped` for the Connor sync. `TODO_ASK_CONNOR_*` placeholders
     never leak into the PATCH body.
   - Three smoke scripts: `smoke-form-schema.js` (38 checks),
     `smoke-form-validate.js` (19 checks), `smoke-form-map.js` (18
     checks). All green.

### Commits (Session 124)

- `a090a6a` — Intake portal design: address Codex review feedback
- `aed1d5f` — Intake portal: V26 migration — intake_drafts + intake_audit
- `c0e3c45` — Intake portal: IntakeDraftService + IntakeAuditService
- `9e2ebc9` — Intake portal: Connor sync agenda doc
- `4ddb583` — Intake portal: Phase II Research 2026-06 form schema sketch
- `7fbeea5` — Intake portal: schema-driven validator for Phase II Research 2026-06
- `ccc50ad` — Intake portal: map-to-dynamics stub + Connor punch list integration

### Verified end-to-end

- V26 schema applied to local Postgres.
- Service smoke test (18 checks): upsert insert/update conflict
  switching, atomic JSONB attachment ops, sibling drafts on same
  account with different `request_id`, audit hashing, invalid actorType
  handling, listByContact / listByAccount.
- Form schema smoke test (38 checks): unique field/section keys, type
  vocabulary, table column shapes, file accept+maxSizeMb, choice
  options, envelope sanity matches design-doc rough envelope, no
  conditional fields.
- Validator smoke test (19 checks): valid fixture passes, missing
  required caught, partial mode tolerates missing, partial mode still
  enforces type/length, number bounds + precision, ISO date enforced,
  choice validated inside table columns, table minRows, file
  mime/size/multiple, unknown top-level rejection in strict, unknown
  tolerated in partial.
- Mapper smoke test (18 checks): 4-part plan shape, confirmed mappings
  in patch, TODO placeholders excluded, unmapped surfaces narrative
  fields and child entities, files routed to SharePoint with
  reviewerVisible flags, tables routed with parentRequestId, empty
  optional tables produce no writes.

## Where to pick up — Session 125

Today is Sunday 2026-05-03. The IT email goes tomorrow. Most likely
state at Session 125 start: Entra still pending, Connor sync not yet
booked.

### If Entra is provisioned
1. Create `wmkf_portal_membership` table (after Connor blesses the
   shape from `CONNOR_INTAKE_PORTAL_SYNC.md` § 1).
2. Add fields: `wmkf_portal_oid` on `contact`,
   `wmkf_phaseiisubmittedat` + `wmkf_phaseiisubmittedby` on
   `akoya_request`.
3. Build `/apply` skeleton — auth flow → dashboard → form
   (`phase-ii-research-2026-06`) iteratively. Aim for end-to-end
   click-through (auth → dashboard → form → submit → land in Dynamics)
   before polishing any single screen. The service + form module
   layers from Session 124 plug straight in.

### If Connor sync happened (Entra still pending)
1. Update `map-to-dynamics.js` with the confirmed `akoya_request`
   fields and child-entity entitySets. Replace `TODO_ASK_CONNOR_*`
   placeholders. Re-run `scripts/smoke-form-map.js` and add positive
   assertions for the new mappings.
2. Update the design doc with the resolved decisions (reviewer-artifact
   choice, account creation policy, etc.).
3. Sarah field-inventory review when she's back from conference.

### If neither — pivot to non-portal carryover
1. **Wave 1 follow-ups** — `docs/WAVE1_VERCEL_FLAG_ROLLOUT.md`,
   `docs/WAVE1_REVERT_TEMP_ELEVATIONS.md`. Both already documented;
   small focused work.
2. **Reviewer Finder Dataverse-native entry path** — replace PDF
   upload with PD-filtered cycle picker. Top post-cycle priority per
   memory; foundation for save-candidates Dataverse cutover.
3. **Vercel Blob → SharePoint migration** for legacy review uploads.
4. **Per-cycle expiry** for external-reviewer links (vs. hard-coded
   90 days).

### Open questions tracked but non-blocking

Same five from end of Session 123, all still relevant. Plus four new
Session-124-surfaced items, all listed in `INTAKE_PORTAL_DESIGN.md` §
"Open questions / open work" (split into "Launch blockers" and "Open,
not pilot-blocking").

## Key files added/modified this session

| File | Purpose |
|---|---|
| `docs/INTAKE_PORTAL_DESIGN.md` | Codex review patches integrated |
| `docs/CONNOR_INTAKE_PORTAL_SYNC.md` | Pre-read for Connor sync; 5 decisions sought |
| `lib/db/migrations/005_intake_portal.sql` | V26 schema |
| `scripts/setup-database.js` | V26 block wired in |
| `lib/services/intake-draft-service.js` | CRUD + atomic JSONB ops |
| `lib/services/intake-audit-service.js` | sha256-hashed audit log |
| `shared/forms/README.md` | Forms-as-code per-cycle convention |
| `shared/forms/phase-ii-research-2026-06/schema.js` | 28 fields, 4 tables |
| `shared/forms/phase-ii-research-2026-06/validate.js` | strict + partial |
| `shared/forms/phase-ii-research-2026-06/map-to-dynamics.js` | 4-part plan + punch list |
| `scripts/smoke-intake-draft.js` | 18 checks |
| `scripts/smoke-form-schema.js` | 38 checks |
| `scripts/smoke-form-validate.js` | 19 checks |
| `scripts/smoke-form-map.js` | 18 checks |
| `CLAUDE.md` | V26 tables + 2 new services documented |

## Production state (sanity)

- External Reviewer Intake: live in prod (Session 123).
- Reviewer pipeline: production-tested, ready for upcoming cycle.
- Intake portal: foundation work only, no client-facing code, no
  Dynamics writes. Still gated on Entra tenant + Connor sync.

## Testing

```bash
# Form module — pure JS, no DB required
node scripts/smoke-form-schema.js
node scripts/smoke-form-validate.js
node scripts/smoke-form-map.js

# Services — local Postgres required (.env.local)
node scripts/smoke-intake-draft.js

# Full migration (idempotent — safe to re-run)
node scripts/setup-database.js

# Full test suite
npm test -- --runInBand
```
