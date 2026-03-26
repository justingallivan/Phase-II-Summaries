# Session 90 Prompt

## Session 89 Summary

Created plain-language documentation of all AI prompts for sharing with non-technical team members. Two new docs added to `docs/`:

### What Was Completed

1. **AI Prompts Overview** (`docs/AI_PROMPTS_OVERVIEW.md`)
   - High-level summary of what each of the 12 apps asks Claude to do
   - Written for non-technical colleagues
   - Includes shared rules, per-app descriptions, and a prompt-to-app reference table

2. **AI Prompts Detailed Reference** (`docs/AI_PROMPTS_DETAILED.md`)
   - Full prompt text for all 14 prompt files across 12 apps, with code stripped out
   - Shows the actual questions asked, instructions given, and rules enforced
   - Dynamic values (document text, database results) described in brackets
   - Includes the Dynamics Explorer vocabulary/lexicon mappings

### Commits
- `8dc0742` - Add plain-language AI prompt documentation for non-technical staff

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
| `docs/AI_PROMPTS_OVERVIEW.md` | Plain-language summary of all AI prompts |
| `docs/AI_PROMPTS_DETAILED.md` | Full prompt text reference (code-free) |
| `docs/CRM_EMAIL_SEND_PLAN.md` | Full plan for Phase A CRM email send |
| `docs/REVIEWER_LIFECYCLE_PROPOSAL.md` | Broader lifecycle automation vision (Phases A-F) |
| `shared/config/prompts/` | Source prompt files (14 files) |

## Testing

```bash
npm run dev                              # Start dev server
npm run build                            # Verify no build errors
npm test                                 # Run all tests
```
