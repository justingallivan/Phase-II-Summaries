# Session 79 Prompt: Dynamics Integration — Proposal Picker & Reviewer Finder

## Session 78 Summary

Continued brainstorming for the wishlist document, adding the virtual review panel idea.

### What Was Completed

1. **Virtual Review Panel — Added to Wishlist**
   - Multiple LLMs (Claude, Gemini, ChatGPT) debating proposals in structured panel format
   - Assigned roles: Optimist (steelman), Skeptic (strawman), Neutral arbiter
   - Structured rounds with synthesis of agreements and tensions
   - Token-conscious design focused on big questions, not minor details

### Commits
- `2d8a205` - Add virtual review panel idea to wishlist

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
| `docs/WISHLIST.md` | Brainstorming ideas and future directions |
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
