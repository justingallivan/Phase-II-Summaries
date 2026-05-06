---
name: Intake portal pilot — decisions locked 2026-05-06
description: Six-decision walkthrough of CONNOR_INTAKE_PORTAL_SYNC.md with Connor present; all six resolved plus several architectural meta-decisions. Most consequential: reviewer Postgres→Dataverse migration is now prerequisite for pilot.
type: project
---

Walked through `docs/CONNOR_INTAKE_PORTAL_SYNC.md` with Connor in the room on 2026-05-06. All six decisions resolved.

**Why this matters**: Several decisions diverged from the doc's defaults. Future sessions should treat the resolutions below as ground truth, not the doc's original recommendations.

**How to apply**: When implementing pilot features, follow the resolved decisions; when something's ambiguous, the architectural meta-decisions section is the tiebreaker (especially the reviewer-migration sequencing and the schema-creation delegation).

## Six decisions, resolved

| # | Resolution |
|---|---|
| 1. `wmkf_portal_membership` schema | Approved as drafted in CONNOR_INTAKE_PORTAL_SYNC.md. AO + Liaison live on `account` instead of membership — `wmkf_role` choice stays `submitter \| contributor`. `account` adds `wmkf_authorized_official_contactid` + `wmkf_liaison_contactid` lookups. |
| 2. Reviewer-consumable artifact | **Option 1** — staff-rendered Word/PDF on demand from `/apply/admin/*`, dropped into `Reviewer_Downloads/`. Not PA-built; not auto-generated. |
| 3a. Bucket 1 (structured promotions) | All approved: budget rows, biosketches per-roster-row (with optional CV file per row), Co-Is as roster table, prior support as per-person rows. |
| 3b. Bucket 2 (friction cuts) | All approved with revisions. T&C moved to post-acceptance with new lifecycle stage; Calendly scheduling step added; AO+Liaison institutional contacts on `account` (Liaison is institutional admin POC, role-based, person can change but role stays); govt-unit/group-exempt/Governing Board/Declaration of Status all institution-level on `account`; Bill.com post-acceptance only; EIN-match autofill confirmed. |
| 3c. Bucket 3 (additions) | Approved; milestones de-prioritized (still defined but optional); staff input expected to add similar-shape fields later. |
| 3-Q4. Reviewer suggestions | Keep at submission. New `wmkf_reviewerstate` choice on `wmkf_potentialreviewer`: `applicant_suggested \| staff_suggested \| advanced \| invited \| confirmed \| declined \| reviewing \| completed`. **Enrichment (Google Scholar / ORCID / publications) gated by `advanced` state — not on every applicant suggestion.** Dedup at portal write time against existing `wmkf_potentialreviewer` and `contact` rows by email. |
| 3-Q5. Required vs optional files | All required *except* Federal Agency Reviews (optional) and Capital Equipment Quotes (conditional on capital line items in budget). Required set: Project Narrative, Budget, Biosketches per-row, Bibliography, Graphical Abstract, Other Funding/Other Support, Recognition Statement, Collaborative Arrangements, Financial Narrative. |
| 4. PA flow boundary | Submission confirmation email is portal-owned (synchronous Dynamics email, appears in CRM history). Status flips to `'Phase II Pending'` — same status value as today, single-phase model keeps Phase II infrastructure. Nothing in existing PA flow set breaks. |
| 5. Account creation policy | Approved: portal writes `account` directly on staff approval (one-click magic link). Default account fields are inferable from EIN+name; no denylist for pilot. |
| 6. Structured-tables persistence | **Option 1 — real child entities.** No JSON-blob shortcut. Justin/Claude own design + creation (creator privileges retained — see `project_dataverse_creator_privileges.md`); Connor reviews summary post-hoc. Suggested entity set: `wmkf_budgetline`, `wmkf_personnel` (replaces `wmkf_copi1..5` slots), `wmkf_priorsupport`, `wmkf_milestone`. |

## Architectural meta-decisions

- **Reviewer Postgres → Dataverse migration is now prerequisite for pilot.** Connor: "let's pull the band-aid off." Aggressive timeline; mid-June pilot date does not slip. Top priority. Per-proposal lifecycle is already Dataverse-native (shipped); the org-wide enrichment pool (`researchers`, `publications`, `proposal_searches`, `grant_cycles`, `reviewer_suggestions` Postgres tables) is what migrates. See companion memory `project_reviewer_postgres_to_dataverse_migration.md`.
- **T&C signing pattern**: magic link (HMAC token primitive, not Entra External ID auth) sent to AO + Liaison on entry to `Awaiting T&C` state. Whichever clicks first sees the T&Cs, types name+title in a web form, clicks "I agree." Audit row + token-storage entry. Reuses `lib/external/token-lifecycle.js` with a new claim type. **Not** DocuSign / Adobe Sign.
- **Calendly** for the post-T&C scheduling call. New lifecycle state `Awaiting Scheduling Call` between T&C signed and Award Issued. PI is authenticated; Calendly link can land in their portal view, email is just a notification.
- **Staff approval emails are one-click magic links across the board** — membership approval, account creation, institutional document updates, AO/Liaison change. Approve = single click; Reject = link to a small form for rejection reason. Token scoped to specific record + specific staff azure_id, single-use, 24-48h TTL.
- **AO/Liaison are stored as `contact` rows on `account`, not authenticated portal users.** Earlier proposed Entra External ID registration for AO was rolled back in favor of magic-link-only T&C signing. AO/Liaison contacts updated at portal registration, confirmed each cycle.
- **Schema-creation authority delegated.** Connor approved Justin/Claude creating new Dataverse entities directly via creator privileges, with summary-after model. See `project_dataverse_creator_privileges.md`.

## Lifecycle stage additions on `akoya_request`

Beyond existing `Concept Pending → Phase I Pending → Phase II Pending`, post-acceptance flow gains:

```
Accepted → Awaiting T&C → T&C Signed → Awaiting Scheduling Call → Call Scheduled → Award Issued
```

(Exact label format should match Connor's existing `akoya_requeststatus` taxonomy; values to be confirmed when implementing.)

## Single-phase status taxonomy clarification

Single-phase cycle (2 cycles out) keeps `'Phase II Pending'` as the submitted status. Concept and Phase I stages disappear from the applicant flow but the downstream status name stays — same Phase II infrastructure, just no upstream gates. This was Connor's explicit call.

## Doc/file follow-ups owed

- Update `docs/INTAKE_PORTAL_DESIGN.md` to reflect resolved decisions (or mark CONNOR_INTAKE_PORTAL_SYNC.md as resolved).
- Draft `docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md` (next session — pre-pilot prerequisite).
- Draft `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md` — single audit-trail catalog for every Dataverse change in pilot, since Connor delegated.
