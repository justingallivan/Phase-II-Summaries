# Grant Cycle Lifecycle

**Status:** Target state — flows are planned/in progress, not yet running in production.
**Created:** Session 94, 2026-04-08
**Stakeholders:** Justin (prompt development, Vercel app), Connor (PowerAutomate flows, Dynamics admin)

---

## Overview

This document maps the full lifecycle of a grant application from submission through funding decision. Each stage identifies the Dynamics status value, what triggers it, who acts, and whether AI automation is involved.

**Architecture:**
- Automated AI tasks run in PowerAutomate, calling the Claude API directly and writing results to Dynamics
- Human-initiated tasks (reviewer finding, review management, integrity screening) run in the Vercel app
- Dynamics is the source of truth for all operational data

---

## Phase I: Application

| # | Stage | Dynamics Status | Trigger | Actor | AI Task | Output |
|---|-------|----------------|---------|-------|---------|--------|
| 1 | Application submitted | `Phase I Status = Pending Committee Review` | Applicant submits in GOapply | Applicant | — | New request created in Dynamics |
| 2 | Documents stored | — | Request creation | GOapply/Dynamics | — | Application docs placed in akoyaGO SharePoint request folder |
| 3 | File organization | — | Step 2 complete | PA flow | — | Docs moved into Phase I subfolder |
| 4 | AI compliance check | — | Step 3 complete | PA flow → Claude API | **Compliance verification, keyword extraction, summary generation** | Results written to Dynamics fields on `akoya_request` |
| 5 | Staff version created | — | Step 4 passes compliance | PA flow | — | Formatted cover page + consolidated PDF saved to WMKF Research SharePoint |
| 6 | PD assignment | — | After application deadline | PA flow → Claude API | **PD assignment by specialty area** | PD assigned on `akoya_request` |
| 7 | PD review & scoring | `Not Scored` or `Scored` | PDs review applications | PDs (human) | — | Applications scored or eliminated |
| 8 | Staff recommendation | `Recommended Invite` or `Recommended Not Invite` | PD discussion complete | Staff (human) | — | Recommendations for program chairs |
| 9 | Integrity screening | — | Recommendations finalized | Staff via Vercel app (manual) | **Integrity screening** | Screen all `Recommended Invite` applicants |
| 10 | Chair approval | `Invited` or `Not Invited` | Program chairs review | Program chairs (human) | — | Final Phase I decisions |

---

## Phase II: Proposal

| # | Stage | Dynamics Status | Trigger | Actor | AI Task | Output |
|---|-------|----------------|---------|-------|---------|--------|
| 11 | Phase II proposal submitted | `Phase II Status = Phase II Pending Committee Review` | Invited applicant submits in GOapply | Applicant | — | Request updated in Dynamics |
| 12 | Documents stored | — | Proposal submission | GOapply/Dynamics | — | Proposal docs placed in akoyaGO SharePoint request folder |
| 13 | File organization | — | Step 12 complete | PA flow | — | Docs moved into Phase II subfolder |
| 14 | AI compliance check | — | Step 13 complete | PA flow → Claude API | **Compliance verification (+ additional tasks TBD)** | Results written to Dynamics fields |
| 15 | Staff version created | — | Step 14 passes compliance | PA flow | — | Formatted cover page + consolidated PDF saved to WMKF Research SharePoint |
| 16 | PD review & recommendation | `Recommended` or `Not Recommended` | PDs review proposals | PDs (human) | — | Staff funding recommendations |
| 17 | Board decision | `Approved` or `Phase II Declined` | Board meets | Board (human) | — | Final funding decisions |

---

## AI Task Summary

### Automated (PowerAutomate → Claude API)

| Task | Lifecycle Step | Input | Output | Prompt Status |
|------|---------------|-------|--------|---------------|
| Compliance check | 4, 14 | Application/proposal PDF text | Pass/fail + reasons | To be developed |
| Summary + keywords | 4 | Application PDF text | Summary text, keywords → Dynamics fields | To be developed |
| PD assignment | 6 | Application text + staff roster + specialty rules | Recommended PD | To be developed (rules need to be built) |

### Human-Initiated (Vercel App)

| Task | Lifecycle Step | Tool | Status |
|------|---------------|------|--------|
| Integrity screening | 9 | Integrity Screener app | Built and running |
| Reviewer finding | Post-approval | Reviewer Finder app | Built and running |
| Review management | Post-approval | Review Manager app | Built and running |
| Panel review | During PD review | Virtual Review Panel app | Built and running |
| Proposal summarization | Ad-hoc | Phase I/II Writeup apps | Built and running |

---

## Dynamics Fields for AI Output

Connor to create these custom fields on `akoya_request`:

| Field | Type | Purpose |
|-------|------|---------|
| `wmkf_ai_summary` | Multi-line text | AI-generated summary |
| `wmkf_ai_structured_data` | Multi-line text (JSON) | Keywords, PI, methods, etc. |
| `wmkf_ai_summary_generated_at` | DateTime | When AI processing ran |
| `wmkf_ai_summary_model` | Single-line text | Claude model used |
| `wmkf_ai_summary_version` | Integer | Prompt version used |

Additional fields may be needed for compliance check results and PD assignment output — to be defined as those prompts are developed.

---

## PowerAutomate Flow Inventory

| Flow | Trigger | Steps | Status |
|------|---------|-------|--------|
| Phase I file organization | Request created with `Phase I Status = Pending Committee Review` | Move docs to Phase I subfolder | Planned |
| Phase I AI check-in | File organization complete | Call Claude API for compliance + summary + keywords → write to Dynamics | Planned |
| Phase I staff version | AI check passes compliance | Generate cover page + consolidate PDF → save to WMKF Research SharePoint | Planned |
| PD assignment | After application deadline (batch) | Call Claude API with all pending apps → assign PDs in Dynamics | Planned |
| Phase II file organization | `Phase II Status = Phase II Pending Committee Review` | Move docs to Phase II subfolder | Planned |
| Phase II AI check-in | File organization complete | Call Claude API for compliance (+ TBD tasks) → write to Dynamics | Planned |
| Phase II staff version | AI check passes compliance | Generate cover page + consolidate PDF → save to WMKF Research SharePoint | Planned |

---

## Prompt Development Priority

Ordered by lifecycle position (earliest AI task first):

1. **Compliance check** (step 4) — first AI task in the lifecycle, gates everything downstream
2. **Summary + keyword extraction** (step 4) — runs alongside compliance check
3. **PD assignment** (step 6) — rules need to be built from scratch
4. **Phase II compliance** (step 14) — similar to Phase I but requirements may differ

Development approach: batch evaluation against historical proposals in Dynamics, iterate on prompts, hand proven prompts to Connor for PA flows.

---

## Data Migration (Future)

All operational data currently in Vercel Postgres will migrate to Dynamics:
- Reviewer data (researchers, publications, reviewer_suggestions, proposal_searches)
- Grant cycles
- Integrity screenings + dismissals
- Panel reviews

System/infrastructure data stays in Vercel Postgres:
- User profiles, preferences, app access
- System settings, usage logs, monitoring
- Retraction Watch reference data

Migration strategy (dual-write vs. bulk migration) TBD.
