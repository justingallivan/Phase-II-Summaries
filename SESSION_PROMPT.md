# Session 91 Prompt

## Session 90 Summary

Planning session — no code changes. Designed the long-term roadmap for evolving from a manual, user-initiated tool into an event-driven backend service triggered by PowerAutomate.

### What Was Produced

1. **Backend Automation Plan** (`docs/BACKEND_AUTOMATION_PLAN.md`)
   - Two automation tiers: Tier 1 (fully automatic, PowerAutomate-triggered, high volume) and Tier 2 (human-initiated, CRM-connected, selective)
   - Six implementation phases (0-6) plus two new AI capabilities
   - Phase 0: Service auth layer (Bearer token for PowerAutomate)
   - Phase 1: Configurable prompt system (DB-backed, admin-editable, versioned)
   - Phase 2: Service processing endpoints (`/api/service/process-document`)
   - Phase 3: Dynamics write-back (PowerAutomate interim → direct API later)
   - Phase 4: PowerAutomate flow configuration (with Connor)
   - Phase 5: Human-initiated flows write to Dynamics
   - Phase 6: Operational maturity (monitoring, retry, dashboard)

2. **New AI Capabilities** (in the same plan document)
   - **Compliance screening** — flag proposals that don't fit Foundation criteria
   - **Staff-proposal matching** — three-tier routing (staff lead, consultant flag, board expertise)
   - Both developed via batch evaluation against historical Phase I proposals
   - Batch endpoint processes proposals from Dynamics, fetches PDFs from SharePoint, outputs CSV for review
   - Iterate on prompts → deploy to PowerAutomate when accuracy is acceptable

3. **Key architectural decisions documented:**
   - All results write to Dynamics as source of truth
   - PowerAutomate handles CRM writes initially (no new permissions needed)
   - PDF processing: text-only for high-volume Tier 1, full PDF vision for selective Tier 2
   - Prompts configurable via admin dashboard for both manual and automated flows

### Status
- **Not ready for implementation** — requires input from multiple stakeholders (Connor for PowerAutomate, IT for permissions, potentially AkoyaGO vendor for schema)
- New custom fields needed on `akoya_request` entity — schema ownership TBD
- Write permissions for app registration not yet requested

### Commits
- No commits (planning session, docs saved but not yet committed)

## Deferred Items (Carried Forward)

- **CRM Email Send (Phase A)** — pending feedback on plan (docs/CRM_EMAIL_SEND_PLAN.md)
- **Backend Automation Plan** — requires multi-stakeholder input before implementation (docs/BACKEND_AUTOMATION_PLAN.md)
- Build Proposal Picker component for Dynamics integration
- next-auth v5 migration (still in beta)
- Re-enable coverage thresholds when test coverage reaches 70%/80%
- Code hardening: upload attribution, legacy upload-file.js cleanup

## Potential Next Steps

### 1. Discuss Backend Automation Plan with Stakeholders
Share `docs/BACKEND_AUTOMATION_PLAN.md` with Connor and leadership. Key questions to resolve:
- Who can create new custom fields on `akoya_request`? (vendor vs. internal)
- Connor's availability to collaborate on PowerAutomate flows
- IT timeline for write permissions on app registration

### 2. Implement CRM Email Send (Phase A)
Independent of the backend automation plan. See `docs/CRM_EMAIL_SEND_PLAN.md`.

### 3. Begin Phase 0 or Phase 1 (When Ready)
Phase 0 (service auth) and Phase 1 (configurable prompts) have no external dependencies and can start in parallel. These are foundational for everything else in the plan.

### 4. Prototype Compliance Screening Prompt
Even before building the batch infrastructure, could draft and test a compliance screening prompt using Dynamics Explorer for one-off testing against individual proposals.

## Key Files Reference

| File | Purpose |
|------|---------|
| `docs/BACKEND_AUTOMATION_PLAN.md` | Full backend automation roadmap (Phases 0-6 + new capabilities) |
| `docs/CRM_EMAIL_SEND_PLAN.md` | Phase A CRM email send plan |
| `docs/REVIEWER_LIFECYCLE_PROPOSAL.md` | Broader lifecycle automation vision |
| `docs/AI_PROMPTS_OVERVIEW.md` | Plain-language summary of all AI prompts |
| `docs/AI_PROMPTS_DETAILED.md` | Full prompt text reference |

## Testing

```bash
npm run dev                              # Start dev server
npm run build                            # Verify no build errors
npm test                                 # Run all tests
```
