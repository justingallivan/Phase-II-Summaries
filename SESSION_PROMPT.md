# Session 134 Prompt: Reviewer interaction design — colleague feedback loop

## Heads up

Session 133 was a pure design conversation. No code, no schema, no endpoints — one artifact: `docs/REVIEWER_INTERACTION_DESIGN.md`. The brief is the seed for a PD-facing read-ahead and slide deck (intended to be drafted in a browser session with a cheaper model rather than here, since the iterative writing benefits from cheap iteration and the brief carries the substance).

The S132 carryover — intake portal, Connor email + impersonation re-smoke, Dynamics Explorer schema curation — is unchanged. None of those were touched. They remain on deck.

## Session 133 summary

### What was completed

1. **Reviewer interaction design brief** (`eb4c538`).
   - Walked through the full reviewer journey across six stages: invitation email, pre-materials landing page (2a), accept/decline events, working window (2b after materials drop), submission form, post-submit.
   - Locked in design rails: binary adoption per PD (no comparative dashboards), defaults work without configuration, no jargon in UI, AkoyaGO is the implicit competitor, reviewer history is automatic (no opt-in profiling).
   - Designed a same-URL flow with state changes between 2a (no materials) and 2b (materials available, review form). Magic link works the whole journey; calendar invites embed the same URL.
   - Settled on click-to-acknowledge for COI + AI policy (replacing signed forms), with a flexible 1..N policy framework for future additions (honorarium acknowledgment foreseen). Storage in new Dataverse entities `wmkf_policy` and `wmkf_reviewer_acknowledgment` — same editable-by-staff pattern as `wmkf_ai_prompt`.
   - Contact-info confirmation step added to Stage 2a — pre-fill from Dynamics, reviewer confirms/edits, direct write back to contact record with audit trail. Solves form-prefill quality and database hygiene in one step.
   - Two single-event calendar invites (materials-delivery date + due date) sent at accept, with embedded magic link; ICS `UID`s tracked for reschedule messages.
   - Decline page captures referral first (single freeform textbox), reason second (optional structured + free text). Referrals trigger automated PD email with deep link to "add reviewer" page; never auto-invite.
   - Submission form: structured ratings always on page (radio buttons, single-select enforced by UI — solves the multi-check problem in the current Word form). Narratives via reviewer choice between inline textboxes or Word upload. AI extraction with HITL confirmation at submit time documented as Phase 2 future work, not built at MVP.
   - Reminder cadence per-staff-preference, default = nudge all, T-7/T-2/T+0. PD-initiated "we're full" cancellation added as a new lifecycle state (`Withdrawn-Sufficient`).
   - Post-submit: brief read-only window (existing `extendForPostSubmissionWindow` primitive), no outcome notification (portfolio balance considerations), no reciprocal "review again?" prompt — history emerges automatically.
   - "Fundable elsewhere" question retained.
   - Open items deliberately left for staff feedback: whether existing 8 narrative questions still pull weight, read-only window length, additional policy texts, PD-specific workflow needs.

### Commits (Session 133)

- `eb4c538` — Add reviewer interaction design brief

### Memory updates this session

None. Design conversation — substance lives in the brief.

## Production state

Unchanged from end of S132.

- Vercel preview env: `DYNAMICS_IMPERSONATION_ENABLED=true`. BLOCKED on Connor granting Delegate role to `# WMK: Research Review App Suite` app user.
- Vercel production env: `DYNAMICS_IMPERSONATION_ENABLED` unchanged (off / unset).
- Request 1002379's `wmkf_ai_summary` still contains `(impersonation probe — ignore)` — restore on impersonation re-smoke.
- Wave 1 stability clock still running from 2026-05-03.

## Where to pick up — Session 134

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
| `docs/REVIEWER_INTERACTION_DESIGN.md` | NEW — full reviewer journey design brief, six stages, ~7 pages, seed for read-ahead + slides |

## Testing

```bash
# Full suite (should still be 407/407, 1 skipped)
npm test -- --runInBand

# API route matrix CI gate
npm run check:api-routes
```
