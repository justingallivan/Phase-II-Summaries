# Session 78 Prompt: Dynamics Integration — Proposal Picker & Reviewer Finder

## Session 77 Summary

Fixed Dynamics email sending (end-to-end working), addressed IT security concerns about the Azure app registration, and established the strategic direction for evolving the app suite into a workflow engine on the Dynamics data layer.

### What Was Completed

1. **Dynamics Email Sending — Fixed and Working**
   - `SendEmail` action must be called as a bound action: `emails({id})/Microsoft.Dynamics.CRM.SendEmail`
   - Sender party requires `partyid_systemuser@odata.bind` linking to a resolved system user (not just an email string)
   - Added `resolveSystemUser()` helper to look up `systemuserid` by email address
   - Test client at `/test-email` confirms draft creation and sending both work
   - CRM tracking token (`CRM:0309001`) is appended to subjects by Dynamics Server-Side Sync (org-wide setting)

2. **Email Test Client**
   - Page: `pages/test-email.js` — simple form with from/to/subject/body and draft/send toggle
   - API: `pages/api/test-email.js` — protected by `requireAppAccess('dynamics-explorer')`
   - Dev mode: editable sender field (no session); prod: locked to authenticated email
   - Not in app registry — standalone test page at `/test-email`

3. **IT Security Response (`docs/IT_SECURITY_RESPONSE.md`)**
   - Explains two-flow token architecture (user SSO vs. server-side client credentials)
   - Proposes `Sites.Selected` instead of `Sites.Read.All` (scoped to single SharePoint site)
   - Drops `Mail.Send` entirely (email handled via Dynamics CRM activities)
   - Proposes audit log sharing (periodic export, API endpoint, or DB read replica)
   - IT flagged conditional access licensing issue (their side to resolve)

4. **Strategic Direction Document (`docs/STRATEGY.md`)**
   - Vision: app suite evolves from standalone tools to integrated workflow engine
   - Dynamics remains the data substrate; AkoyaGO is gradually replaced
   - Key principle: read from Dynamics, process with AI, write back to Dynamics
   - Phased approach: connect input → connect output → workflow automation → full independence
   - Design principles: modular, co-evolve with grant cycle redesign, replace AkoyaGO incrementally

### Key Findings

- Dynamics has 16 licensed Read-Write staff users + ~180 Microsoft service accounts
- All proposal metadata needed by the app suite exists in Dynamics (`akoya_request` fields: title, abstract, PI contact, institution, program, status, request number)
- AkoyaGO is a third-party UI layer on Dynamics — all data is accessible via the Dynamics/Graph APIs we already built
- The grant cycle is being significantly redesigned (concepts changing, Phase I may be eliminated)

### Commits
- `53dd397` - Fix Dynamics email sending, add test client and IT security response
- `61bc4d2` - Add strategic direction document for app suite evolution

## Deferred Items (Carried Forward)

- SharePoint document access (blocked on IT granting `Sites.Selected` + site-specific authorization)
- SharePoint write access (not yet requested — will need `Sites.ReadWrite.Selected` for Phase 2)
- Integrate email sending into Reviewer Finder / Review Manager (ready — email works)
- next-auth v5 migration (still in beta)

## Potential Next Steps

### 1. Verify SharePoint Access (When Permission Granted)
Once IT grants `Sites.Selected` and authorizes the akoyaGO site:
- Run `node scripts/test-graph-service.js` to verify end-to-end
- Test `list_documents` tool in Dynamics Explorer chat

### 2. Build Proposal Picker Component
Shared component for browsing/searching Dynamics proposals, usable across apps:
- API endpoint: query `akoya_request` with filters (grant cycle, status, PI, keyword)
- Resolve related data: PI contact info, institution, program director
- UI component: search/filter interface, proposal cards with key metadata
- Returns: request ID, request number, title, abstract, PI, institution, status

### 3. Wire Proposal Picker into Reviewer Finder
First app to use the integrated Dynamics flow:
- Add "Import from Dynamics" option alongside PDF upload
- Auto-populate proposal metadata from CRM fields
- Pull proposal PDF from SharePoint for Claude analysis (if available)
- Add `dynamics_request_id` / `dynamics_request_number` to `proposal_searches` schema
- Link generated emails to CRM request via `regardingobjectid`

### 4. Integrate Email Sending into Reviewer Finder
Replace .eml download with direct CRM email sending:
- Add `sendMode` toggle to `EmailGeneratorModal.js` ("Send directly" vs "Download .eml")
- Emails created as Dynamics activities linked to the request record
- Sender resolved from authenticated user's session email

### 5. Production Deployment
Push current changes to Vercel:
- Email test client functional
- Health check includes Microsoft Graph
- Dynamics email sending working

## Key Files Reference

| File | Purpose |
|------|---------|
| `docs/STRATEGY.md` | Strategic direction for app suite evolution |
| `docs/IT_SECURITY_RESPONSE.md` | IT security review response (token architecture, permissions) |
| `docs/PENDING_ADMIN_REQUESTS.md` | Admin permission request instructions |
| `lib/services/dynamics-service.js` | Dynamics API + email methods + `resolveSystemUser()` |
| `lib/services/graph-service.js` | Microsoft Graph API service (SharePoint access) |
| `pages/test-email.js` | Email test client page |
| `pages/api/test-email.js` | Email test API endpoint |
| `pages/reviewer-finder.js` | Reviewer Finder (first app for Dynamics integration) |
| `pages/api/reviewer-finder/analyze.js` | Proposal analysis endpoint |
| `scripts/test-graph-service.js` | Graph API / SharePoint test script |
| `scripts/test-dynamics-email.js` | Dynamics email activity test script |

## Testing

```bash
npm run dev                              # Start dev server
npm run build                            # Verify no build errors

# Email (working)
# Visit http://localhost:3000/test-email

# SharePoint (after IT grants Sites.Selected)
node scripts/test-graph-service.js       # Test Graph API document listing
node scripts/test-graph-service.js 1001289  # Test with specific request
```
