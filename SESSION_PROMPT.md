# Session 89 Prompt: CRM Email Send Implementation

## Session 88 Summary

No-op session — synced repo (pulled 12 commits from Sessions 85-87) and reviewed context, but no work was done.

### Commits
- No commits this session

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
