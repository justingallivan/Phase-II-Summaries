# Session 88 Prompt: CRM Email Send Implementation

## Session 87 Summary

Light session focused on reviewing the CRM email send plan (`docs/CRM_EMAIL_SEND_PLAN.md`) and diagnosing a recurring Safari redirect loop.

### What Was Completed

1. **CRM Email Send Plan Review**
   - Reviewed the full implementation plan for Phase A of reviewer lifecycle automation
   - Read all affected files (generate-emails.js, send-emails.js, EmailGeneratorModal.js, review-manager.js EmailModal, dynamics-service.js, email-generator.js)
   - Confirmed `session.user.azureEmail` is the correct field for sender identity
   - Confirmed `DynamicsService.createAndSendEmail()` API shape and how `resolveSystemUser` works
   - Plan is awaiting feedback before implementation — tracked as a pending task

2. **Safari Redirect Loop Fix (Recurring)**
   - Same "too many redirects" issue from Session 86 (commit `fe1d588`) reappeared
   - Root cause: stale auth cookies in Safari's regular session (works in private browsing)
   - Fix: Safari Settings > Privacy > Manage Website Data > delete `wmkfresearch.vercel.app`
   - Note: Safari's "clear cache" does NOT clear cookies — must use domain-specific data deletion

### Commits
- No code commits this session (plan review only)

## Deferred Items (Carried Forward)

- **CRM Email Send (Phase A)** — pending feedback on plan (docs/CRM_EMAIL_SEND_PLAN.md)
- Build Proposal Picker component for Dynamics integration
- next-auth v5 migration (still in beta)
- Re-enable coverage thresholds when test coverage reaches 70%/80%
- Code hardening: upload attribution, legacy upload-file.js cleanup

## Potential Next Steps

### 1. Implement CRM Email Send (Phase A)
Once feedback is received on the plan, implement:
- Create `lib/utils/crm-email-helpers.js` (textToHtml, resolveRequestGuids, sendEmailViaCrm)
- Add `deliveryMethod` option to both generate-emails.js and send-emails.js APIs
- Add delivery method toggle + CRM results view to both EmailGeneratorModal and Review Manager EmailModal
- See `docs/CRM_EMAIL_SEND_PLAN.md` for full plan

### 2. Architecture Discussion: Proposal Data Model
Plan the data flow where proposals come from Dynamics first. Key questions: sync strategy, `proposal_searches` as canonical join point, FK linkage from `reviewer_suggestions`.

### 3. Build Proposal Picker Component
Shared component for browsing/searching Dynamics proposals. First consumer: Reviewer Finder.

### 4. Plan Researcher Data Migration to Dynamics
Scope Dataverse fields needed for researcher/reviewer data. Blocked on write access but can plan schema.

## Key Files Reference

| File | Purpose |
|------|---------|
| `docs/CRM_EMAIL_SEND_PLAN.md` | Full plan for Phase A CRM email send |
| `docs/REVIEWER_LIFECYCLE_PROPOSAL.md` | Broader lifecycle automation vision (Phases A-F) |
| `pages/api/reviewer-finder/generate-emails.js` | Reviewer invitation email generation (SSE) |
| `pages/api/review-manager/send-emails.js` | Review Manager email generation (SSE) |
| `shared/components/EmailGeneratorModal.js` | Reviewer Finder email modal |
| `pages/review-manager.js` | Review Manager page (includes EmailModal component) |
| `lib/services/dynamics-service.js` | CRM API — createAndSendEmail, resolveSystemUser |
| `lib/utils/email-generator.js` | Shared email utilities (templates, placeholders, EML) |

## Testing

```bash
npm run dev                              # Start dev server
npm run build                            # Verify no build errors
npm test                                 # Run all tests
```
