# Session 149 Prompt: Post-2026-05-13-sync execution + Sarah field inventory

## Heads up

Session 148 was a meeting-support session, not a build session. No code commits.
The session ran Track 1 of the 2026-05-13 Connor+Sarah sync (four decisions
closed) and captured the outputs in design doc + schema-changes catalog +
memory. Track 2 (Sarah field inventory) did not run; carry it forward.

**The most important deltas to be aware of**:
- **1C reversed**: reviewer-consumable artifact is now PA-built on `'Phase II Pending'` flip, not staff-rendered on demand. Connor owns the build. Reverses 2026-05-06 Item 2.
- **1D narrowed**: real child entities for pilot, but **only budget + roster**. Milestones and prior-support deferred to next cycle. Narrows 2026-05-06 Item 6.

Memory `project_intake_portal_pilot_decisions_2026-05-13.md` is the authority on those — the 2026-05-06 memory now has a banner pointing readers there.

## Session 148 summary

### What was completed

Meeting-support only — no commits beyond doc updates.

**Track 1 of 2026-05-13 Connor+Sarah sync — four decisions closed:**

| # | Decision | Status |
|---|---|---|
| 1A | `wmkf_portal_membership` shape | Approved as drafted. Institution-claim approval = **Option A** (portal-side `/apply/admin/memberships`, new `intake-admin` app key). Connor's plate unchanged on the approval workflow. |
| 1B | PA flows on `'Phase II Pending'` | Connor: origin-agnostic, works as-is. **No `wmkf_originatingsystem` field needed.** Verification = manual flip of a throwaway test request at 2026-05-26 dry-run. Flow-list email sent to Connor (target reply 2026-05-15). |
| 1C | Reviewer-consumable artifact | **REVERSAL**: PA-built review packet on `'Phase II Pending'` flip, dropped in `Reviewer_Downloads/` (Option 2). Connor owns the build. Cover-doc structured-data layout is now upstream of his packet build. |
| 1D | Structured-tables persistence | Real child entities (Option 1) — **scoped to budget + roster only**. Milestones → narrative field for pilot, prior-support → attached PDF. |

**Track 2 (Sarah's Phase II Research field inventory) was not reached** — meeting ran out of clock. Carry to next Sarah session.

**Doc updates landed (single commit, will land at session-end push)**:
- `docs/INTAKE_PORTAL_DESIGN.md` — Open questions/work section rewritten to strike resolved blockers with date + outcome.
- `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md` — new 2026-05-13 batch entry queuing `wmkf_portal_membership` + budget + roster entities for design review by 2026-05-15.
- New memory entry `project_intake_portal_pilot_decisions_2026-05-13.md`; `MEMORY.md` index updated; the 2026-05-06 memory's frontmatter now flags items 2 + 6 as superseded.

**Other session activity (non-committed):**
- Reviewer-portal demo for colleagues — minted a 14-day Stage 2a token for suggestion `489ecf2c-f144-f111-88b4-6045bd019e44` (request 1002379, Quantum Chimera, Aspuru-Guzik). Wrote a dev-only `EXTERNAL_LINK_SECRET` to `.env.local` (gitignored). Note: minting the token wrote the hash to **prod Dataverse** on that suggestion row — `wmkf_proposalfirstaccessed` and related fields will reflect the demo visit if colleagues clicked through.
- Drafted a follow-up email to Connor asking for the named list of `'Phase II Pending'` PA flows (target reply 2026-05-15). User sent it.

## Production state

- Working tree clean (no code commits this session).
- Dev server stopped.
- The 5 stage-2a candidates on request 1002379 (Quantum Chimera) still have `no-token` on rows the demo didn't touch — minting only consumed the one Aspuru-Guzik row.
- All CI gates still green from S147; nothing changed.

## Where to pick up — Session 149

Ordered by readiness:

### A. Sarah field inventory (Track 2 carryover) — PRIMARY blocker

Drives the form module + confirms whether budget + roster are the only repeating sections worth structuring for pilot. **Schedule before the 2026-05-19 checkpoint.** Per agenda §2B, 80% complete is enough to unblock; refinements can come in async passes.

Concrete deliverable: a working field-inventory table (field name, type, required?, notes) covering the current Phase II Research form, plus per-row column detail for the budget and roster sections (column-level fields, not just "there's a budget").

### B. Connor design review on child-entity shapes (2026-05-15)

Once Connor's flow-list reply lands, follow up with the two budget/roster JSON schema specs for design review:

- **Naming decision needed**: `wmkf_proposalbudgetline` vs. `wmkf_budgetline` (2026-05-06 suggestion); `wmkf_proposalroster` vs. `wmkf_personnel`. Resolve before writing the JSON files.
- **Category choice values** for `wmkf_proposalbudgetline.wmkf_category` — confirm WMKF Research conventions (current sketch: Personnel / Equipment / Supplies / Travel / Other Direct / Indirect).
- **Roster shape** — not yet sketched. Working assumption: 1:N parental from `akoya_request`; per-row `_wmkf_contact_value` + role choice + percent effort + optional biosketch attachment. Align with `wmkf_apprequestperson` junction's role taxonomy.
- **Cover-doc template structure** — Connor needs the row shape to design the Word template; we need the Word template to know whether `wmkf_name` synthesis is required.

Sketch outline for budget is captured in `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md` 2026-05-13 entry.

### C. `wmkf_portal_membership` schema apply

Shape was approved as drafted. Can ship under existing delegated authority anytime, doesn't need to wait on B. Send Connor the summary after creation (per summary-after model).

### D. `/apply/admin/memberships` build (Option A)

Once `wmkf_portal_membership` is live:
- Add `intake-admin` to `shared/config/appRegistry.js` (key, name, route, icon, category, description).
- `GET /api/intake/admin/memberships?status=requested` (list) + `POST /api/intake/admin/memberships/:id/approve|reject` (action).
- `/apply/admin/memberships` page with `requireAppAccess(req, res, 'intake-admin')`.
- Grant `intake-admin` to the staff who will run pilot triage (need name list from Sarah).

### E. Connor's flow-list reply (target 2026-05-15)

Watch for the reply to today's email asking him to name the `'Phase II Pending'` flows. If anything in his reply suggests GOapply-coupling in a flow he hadn't thought about, escalate to a quick sync rather than waiting for the 2026-05-26 dry-run.

### F. Carryover from S147 (low priority)

- COI policy body wording (Stage 2a reviewer engagement).
- Revert temp role elevations on prod app user (deferred through pilot iteration).
- Visual smoke of the Gemini refactor on `/phase-ii-writeup` (S147 carryover — Babel parse + 36 Jest tests + atlas/route gates passed but visual parity not yet verified).

## Calendar checkpoints

- **2026-05-15** — Connor flow-list reply target; budget+roster naming resolved; JSON specs drafted; `wmkf_portal_membership` summary sent.
- **2026-05-18** — Two child-entity schemas applied to prod.
- **2026-05-19** — Checkpoint: schema applied, form-module skeleton renders, end-to-end smoke (auth → form → save-draft → submit-mock → land-in-Dynamics) working on Vercel preview.
- **2026-05-26** — Dry-run: manually flip throwaway test request to `'Phase II Pending'` and watch PA flows fire.
- **2026-05-30** — Go/no-go review.
- **2026-06-01** — Pilot accepting submissions for mid-June Phase II Research cycle.

## Key files modified this session

| File | Status | Purpose |
|---|---|---|
| `docs/INTAKE_PORTAL_DESIGN.md` | EDITED | Open questions/work section restructured to reflect 4 closed Track-1 items; pilot-blocker list trimmed to Sarah inventory + naming alignment |
| `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md` | EDITED | New 2026-05-13 entry queues 3 entities for design review (membership shape approved; budget+roster shapes queued; milestone+priorsupport deferred) |
| `memory/project_intake_portal_pilot_decisions_2026-05-13.md` | NEW | Authoritative source for 2026-05-13 Track-1 decisions including 1C reversal + 1D narrowing |
| `memory/project_intake_portal_pilot_decisions_2026-05-06.md` | EDITED | Frontmatter + banner flag items 2 + 6 as superseded |
| `memory/MEMORY.md` | EDITED | Added 2026-05-13 index entry; annotated 2026-05-06 entry as partially superseded |
| `SESSION_PROMPT.md` | REWRITTEN | This file |

## Testing

```bash
# Sanity gates (should remain green — nothing in this session changed code)
npm run check:atlas
npm run check:atlas:self-test
npm run check:api-routes

# When picking up B/C/D in Session 149:
# Schema apply rerun is idempotent
node scripts/apply-dataverse-schema.js --target=prod --wave=2

# Reviewer-portal demo token (still valid through 2026-05-27 — same flow, swap suggestionId)
node scripts/find-stage2a-candidates.js list 15
node scripts/find-stage2a-candidates.js mint <suggestionId>
```

## Gotchas to remember

- **Dataverse `EntityCustomization` 429s** between metadata writes — wrap multi-attribute deploys in 30s-backoff retry per `project_dataverse_schema_deploy_gotchas`.
- **`@odata.bind` keys are PascalCase nav-property names**, not lowercase logical names. The portal submit handler will hit this when posting budget/roster rows with `Request@odata.bind` (or whatever name the lookup gets at creation time — confirm during schema apply).
- **Demo-token mint wrote to prod Dataverse** on suggestion `489ecf2c-...` (Aspuru-Guzik). If any colleague accessed the URL during/after the demo, that suggestion has live `wmkf_proposalfirstaccessed` data. Not a problem, just be aware if you query that row.
- **`EXTERNAL_LINK_SECRET`** in `.env.local` is a dev-only random secret, gitignored. Different from prod. Re-mint dev tokens against the same `.env.local` value or generate a new one.
