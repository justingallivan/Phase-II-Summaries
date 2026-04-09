# Session 95 Prompt

## Session 94 Summary

Revised the backend automation architecture with Connor (Dynamics/PowerAutomate admin). Major shift: PowerAutomate calls Claude API directly instead of routing through our Vercel app. Created a grant cycle lifecycle document and rewrote the automation plan.

### What Was Completed

1. **Architecture Decision: PA Calls Claude Directly**
   - Original plan assumed PowerAutomate → Vercel API → Claude → PA → Dynamics
   - New architecture: PowerAutomate → Claude API directly → Dynamics
   - Removes need for service auth layer (old Phase 0) and service processing endpoints (old Phase 2)
   - Our Vercel app role: human-initiated tools + prompt development/testing

2. **Grant Cycle Lifecycle Document** (`docs/GRANT_CYCLE_LIFECYCLE.md`)
   - 17-stage proposal lifecycle from application submission through board decision
   - Each stage mapped to Dynamics status values, triggers, actors, and AI tasks
   - AI task summary: automated (PA → Claude) vs. human-initiated (Vercel app)
   - PowerAutomate flow inventory with trigger conditions
   - Prompt development priority order
   - Data migration scope (operational data → Dynamics, system data stays in Vercel)

3. **Backend Automation Plan Rewrite** (`docs/BACKEND_AUTOMATION_PLAN.md`)
   - Restructured around: Phase 1 (prompt development & batch evaluation), Phase 2 (Dynamics write-back for human tools), Phase 3 (data migration), Phase 4 (PA flow configuration), Phase 5 (operational maturity)
   - All external blockers resolved: Connor can create Dynamics fields and grant permissions
   - Documented Connor's parallel work items

4. **Stakeholder Answers Captured**
   - Connor can create custom fields on `akoya_request` (no vendor dependency)
   - Connor can grant write permissions (no IT dependency)
   - SharePoint folder pattern `{RequestNumber}_{GUIDNoHyphens}` confirmed
   - PA trigger conditions TBD during flow construction (process is evolving)
   - Premium connectors available (no licensing blocker)
   - Staff-proposal matching rules need to be built from scratch
   - Foundation criteria documents already digitized for compliance prompts

5. **Off-Session Research (from home, no code changes)**
   - `Sites.ReadWrite.Selected` confirmed as right approach for SharePoint write access
   - IT request drafted for akoyaGO site (app registration: `d2e73696-537a-483b-bb63-4a4de6aa5d45`)
   - Dynamics CRM write permissions are self-service via Power Platform Admin Center

### Commits
- `b952951` Revise backend automation plan and add grant cycle lifecycle doc

## Deferred Items (Carried Forward)

- **Staged Pipeline Implementation** — plan saved at `docs/STAGED_PIPELINE_IMPLEMENTATION_PLAN.md`, not yet scheduled
- **CRM Email Send (Phase A)** — pending feedback on plan (docs/CRM_EMAIL_SEND_PLAN.md)
- Build Proposal Picker component for Dynamics integration
- next-auth v5 migration (still in beta)
- Re-enable coverage thresholds when test coverage reaches 70%/80%
- Code hardening: upload attribution, legacy upload-file.js cleanup

## Potential Next Steps

### 1. Build Batch Evaluation Tool (Phase 1 Priority)
The primary development work is now prompt engineering at scale:
- New page + API endpoint for batch evaluation
- Query Dynamics for historical proposals, fetch PDFs from SharePoint
- Run prompt against each, generate CSV with AI assessment vs. actual outcome
- Start with compliance checking (earliest AI task in lifecycle, step 4)

### 2. Develop Compliance Screening Prompt
First prompt to develop — gates everything downstream in the lifecycle:
- Foundation criteria documents available as prompt context
- Test against historical Phase I proposals
- Iterate with staff feedback until accuracy is acceptable
- Hand proven prompt to Connor for PowerAutomate deployment

### 3. Update PENDING_ADMIN_REQUESTS.md
Add the SharePoint `Sites.ReadWrite.Selected` IT request drafted in off-session research.

### 4. Test Devil's Advocate End-to-End (carried from Session 93)
Run several panel reviews with DA enabled and verify output quality, synthesis integration, and export rendering.

### 5. Begin Data Migration Planning
Map Vercel Postgres operational tables to Dynamics entities. Connor needs to create corresponding entities/fields. Strategy (dual-write vs. bulk migration) still TBD.

## Key Files Reference

| File | Purpose |
|------|---------|
| `docs/GRANT_CYCLE_LIFECYCLE.md` | Full 17-stage proposal lifecycle with AI task mapping |
| `docs/BACKEND_AUTOMATION_PLAN.md` | Revised automation plan (PA calls Claude directly) |
| `lib/services/dynamics-service.js` | Dynamics read access (working), write stubs (Phase 2) |
| `lib/services/graph-service.js` | SharePoint document access (working) |
| `shared/config/prompts/*.js` | Existing prompt patterns for new prompt development |
| `docs/PENDING_ADMIN_REQUESTS.md` | Permission requests tracker |

## Testing

```bash
npm run dev                              # Start dev server
npm run build                            # Verify no build errors
npm test                                 # Run all tests
```
