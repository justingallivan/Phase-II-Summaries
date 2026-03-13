# Session 87 Prompt: Proposal Data Model & Next Integration Steps

## Session 86 Summary

Strategy document revision session. Reconciled `docs/STRATEGY.md` with a draft from Connor (Foundation colleague who knows AkoyaGO/Dynamics best). The conversation established shared direction for the project's relationship to AkoyaGO and Dynamics.

### What Was Completed

1. **Strategy Document Overhaul (`docs/STRATEGY.md`)**
   - Adopted Connor's six-system taxonomy: Dataverse, Dynamics 365, AkoyaGO, GOapply, SharePoint, Vercel App Suite
   - Reframed from "replace AkoyaGO" to "minimize reliance" — build things that work if AkoyaGO goes away, but don't plan around removing it
   - Added vendor/licensing considerations section (AkoyaGO vendor provides Dynamics license; dependency on their workflows/business logic not fully understood)
   - Acknowledged PowerAutomate flows (built by vendor and Connor) as significant backend logic
   - Added "unified view of data and documents" as an explicit principle — something AkoyaGO can't do natively
   - Clarified Postgres role: development substrate + operational store until Dynamics write access is established; researcher/reviewer data belongs in CRM long-term
   - Updated all status tables: SharePoint read → Working, request linking → Done, added feedback logging and monitoring rows
   - Added future concept: freshness metadata on records to enable automated refresh of stale data
   - Described workflow inversion: backend triggers will initiate processing instead of user uploads

### Key Decisions Made

- **AkoyaGO**: Minimize reliance, don't plan to replace. Vendor/licensing dependency is unresolved.
- **Dynamics is ground truth**: All organizational data (proposals, researchers, reviewers) belongs there long-term.
- **Postgres stays for now**: No Dynamics write access yet. Postgres for app-operational data (logs, alerts) and as development staging.
- **Researcher data belongs in CRM**: Reviewer candidates represent paid API calls and reusable expertise — not just app-operational data.
- **Backend triggers are the future**: Same API calls, but initiated by status changes rather than user uploads. Requires collaboration with Connor on PowerAutomate flows.
- **Connor partnership**: Will flesh out backend vision together in coming weeks.

### Commits
- `8b36bcc` - Update strategy doc: incorporate Connor's systems taxonomy and revised direction

## Deferred Items (Carried Forward)

- Integrate email sending into Reviewer Finder / Review Manager
- Build Proposal Picker component for Dynamics integration
- next-auth v5 migration (still in beta)
- Re-enable coverage thresholds when test coverage reaches 70%/80%
- Code hardening: upload attribution, legacy upload-file.js cleanup

## Potential Next Steps

### 1. Architecture Discussion: Proposal Data Model
Still not resolved from Session 85. Plan the data flow where proposals come from Dynamics first. Key questions: sync strategy, `proposal_searches` as canonical join point, FK linkage from `reviewer_suggestions`. Now informed by the strategy discussion — Dynamics is ground truth, Postgres is staging.

### 2. Build Proposal Picker Component
Shared component for browsing/searching Dynamics proposals. First consumer: Reviewer Finder — replace manual PDF upload with "pick a proposal from CRM."

### 3. Populate `proposal_searches` Table
Create canonical proposal records from the 23 existing proposals in `reviewer_suggestions`. Add FK linkage. Stepping stone toward the new architecture.

### 4. Wire Request Numbers into Email Templates
Reviewer Finder and Review Manager email templates could include request numbers for staff reference.

### 5. Plan Researcher Data Migration to Dynamics
Now that the strategy says researcher/reviewer data belongs in the CRM, scope what Dataverse fields would be needed and how to sync. Blocked on write access but can plan the schema.

## Key Files Reference

| File | Purpose |
|------|---------|
| `docs/STRATEGY.md` | Project strategy — six systems, direction, principles, status |
| `lib/services/dynamics-service.js` | Dynamics 365 CRM API (OData queries, email, Dataverse Search) |
| `lib/services/graph-service.js` | Microsoft Graph API (SharePoint file listing, download, search) |
| `shared/config/appRegistry.js` | Single source of truth for all 14 app definitions |
| `scripts/setup-database.js` | All database migrations (V1–V23b) |

## Testing

```bash
npm run dev                              # Start dev server
npm run build                            # Verify no build errors
npm test                                 # Run all tests
```
