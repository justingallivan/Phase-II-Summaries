# Session 124 Prompt: Intake portal foundation work (or whatever IT response unblocks)

## Heads up

Session 123 closed two things: **External Reviewer Intake Phase 7 cutover**
(production deploy + folder rename, end of an arc that started Session 121)
and a **substantial design pass on the new applicant intake portal**, which
will be the next major build. The portal is gated on IT provisioning a new
Entra External ID tenant — the request email goes to DFT on Monday
2026-05-04. Until that's back, no portal code can ship.

Reference docs:
- `docs/INTAKE_PORTAL_DESIGN.md` — pilot scope locked, design v2
- `docs/IT_ENTRA_EXTERNAL_TENANT_REQUEST_2026-05-04.md` — IT email + tracking
- `docs/EXTERNAL_REVIEWER_INTAKE_PLAN.md` — reference pattern for token-authenticated public surface

## Session 123 summary

Mixed session — short execution at the front (cutover), substantial design
at the back.

### What was completed

1. **External Reviewer Intake Phase 7 cutover.**
   - `EXTERNAL_LINK_SECRET` added to Vercel **production** and **preview**
     environments (separate 64-char hex values per env). `vercel env add`
     for "all preview branches" non-interactively requires passing `''` as
     the git-branch positional — both v52 and v53 of the CLI bug out
     without it, even with `--yes`.
   - Production deploy via `vercel --prod` — `dpl_6GubU5ja8rgfsRXtYgA3PEosxGGs`,
     status READY.
   - Dev SharePoint folder migrated for test request 1002379:
     `Reviewer_Materials` → `Reviewer_Downloads`. (The session 122 prompt
     mentioned a typo'd `Reviwer_Materials` — that was wrong; the actual
     dev folder didn't have the typo, only the env override did.)
   - `REVIEWER_MATERIALS_FOLDERS` env override removed from `.env.local`
     since the folder name now matches the default.
   - Restart `npm run dev` to pick up the env change.

2. **Intake portal design v2.** Built on the artifact handed in from the
   other session (`wmkf-intake-portal-context.md`, not in repo). Wrote
   `docs/INTAKE_PORTAL_DESIGN.md` from scratch with corrections and
   strategic pivots:
   - Scope discipline: **skinny pilot, not parallel GOapply.** Pilot is
     sized like the external reviewer intake (the reference build), not
     like a GOapply rewrite. Long-term goal stays "full GOapply
     replacement" but every pilot decision anchors on "external reviewer
     intake but for applicants."
   - **Schema collapsed:** pilot adds fields to `contact` and
     `akoya_request` plus one new entity (`wmkf_portal_membership`). The
     other three planned tables (`wmkf_opportunity`, `wmkf_phase`,
     `wmkf_status_tracking`) deferred to Phase 1+ expansion with full
     Connor design review before creation.
   - **Auth: Entra External ID with OTP (separate tenant
     `wmkeckapply.onmicrosoft.com`).** HMAC magic links explicitly
     considered and rejected — Justin's institution-as-identity argument
     means person-centric magic links bake in the wrong abstraction.
   - **Entry path: self-serve sign-in**, not magic link. Once
     authenticated, portal queries Dynamics for the contact's
     memberships and lands them on a dashboard.
   - **Drafts in Postgres**, not Dynamics (autosave throttling concern).
   - **No submission PDF generator for pilot** — reviewer pipeline
     consumes structured fields + attachments fine. Add later only if
     downstream tools demand one.
   - **Forms-as-code, versioned per cycle** (e.g.,
     `phase-ii-research-2026-06/`). Each cycle = new directory.
   - **Machine-legible capture as design principle** — split structured
     content (budgets, rosters, milestones) into real fields, don't stuff
     it in narrative or ZIP'd Excel.
   - **Phase I additive only** for pilot; SoCal cross-phase revision
     tagged as future enhancement.

3. **IT email drafted** — `docs/IT_ENTRA_EXTERNAL_TENANT_REQUEST_2026-05-04.md`.
   Justin sends Monday 2026-05-04. Until the tenant exists, no portal
   code ships.

### Commits (Session 123)

- (this commit) — Document Session 123 + new design + IT request

### Verified end-to-end

- External Reviewer Intake live in production. Smoke-test path: open the
  Review Manager in prod, regenerate a token for an accepted reviewer
  on request 1002379, click the link in incognito, see the file in
  `Reviewer_Downloads/`, upload back.

## Pilot timing and dependencies

Hard target: portal accepting submissions by **2026-06-01** for the mid-
June 2026 Phase II Research cycle (~25 proposals).

| Dependency | Owner | Gating |
|---|---|---|
| Entra External ID tenant | DFT (IT) | **Blocks all portal code.** Email Monday 2026-05-04 |
| `wmkf_portal_membership` shape review | Connor | Justin can create the table once shape is OK'd |
| Field inventory for Phase II Research form | Connor + Sarah | Sarah back from conference; Connor first |
| PA flow updates for portal-originated `'Phase II Pending'` | Connor | Once portal is past initial integration test |

## Where to pick up — Session 124

If IT has responded → schema work + `/apply` skeleton. If not → design
prep, Connor sync, or unrelated work.

### If Entra is provisioned
1. Create `wmkf_portal_membership` table (after Connor blesses the shape)
2. Add fields: `wmkf_portal_oid` on `contact`, `wmkf_phaseiisubmittedat`
   + `wmkf_phaseiisubmittedby` on `akoya_request`
3. Build `/apply` skeleton — auth flow first, then dashboard, then form
4. Aim for end-to-end click-through (auth → dashboard → form → submit
   → land in Dynamics) before polishing any single screen

### If Entra is NOT yet provisioned
1. **Connor sync** — review `wmkf_portal_membership` shape, rough field
   inventory for Phase II Research form, confirm PA flow boundary,
   identify which existing PA flows fire on `'Phase II Pending'` vs.
   which need updating to handle portal-originated submissions
2. **Design prep** — Postgres schema for `intake_drafts` and
   `intake_audit`. Sketch the EIN reconciliation flow as a wireframe.
3. **Carryover work** unrelated to the portal:
   - Wave 1 prod migration follow-ups (`docs/WAVE1_VERCEL_FLAG_ROLLOUT.md`,
     `docs/WAVE1_REVERT_TEMP_ELEVATIONS.md`)
   - Reviewer Finder Dataverse-native entry path
     (`project_reviewer_finder_dataverse_entry_path.md`)
   - Vercel Blob → SharePoint migration script for legacy review uploads
   - Per-cycle expiry instead of hard-coded 90 days for external links

### Open questions tracked but non-blocking
1. Virus scanning approach for uploaded attachments
2. Draft expiry policy (likely 90d past last edit OR cycle close)
3. Submission confirmation email content + sender identity
4. Staff approval UI for new account requests
5. Which `'Phase II Pending'` PA flows need updating
6. Cycle close behavior (read-only after deadline?)

## Key files added this session

| File | Purpose |
|---|---|
| `docs/INTAKE_PORTAL_DESIGN.md` | Pilot design v2; locked scope |
| `docs/IT_ENTRA_EXTERNAL_TENANT_REQUEST_2026-05-04.md` | IT email + tracking |

No code added or modified this session — design + cutover only.

## Production state (sanity)

- External Reviewer Intake: **live in prod**. `EXTERNAL_LINK_SECRET` set
  in both prod and preview. Connor's PA flow for auto-creating
  `Reviewer_Downloads/` + `Reviewer_Uploads/` at new request creation
  remains the only operational dependency for new requests to be
  reviewer-ready out of the box.
- Reviewer pipeline (Reviewer Finder → Review Manager → External
  Reviewer Intake): production-tested, ready for the upcoming cycle.

## Testing

```bash
npm test -- --runInBand          # 295 pass, 1 pre-existing skip
node scripts/probe-external-files.js <requestNumber>
```
