# Session 80 Prompt: Dynamics Integration — Proposal Picker & Reviewer Finder

## Session 79 Summary

Fixed the Azure AD (SSO) health check that was failing every 15 minutes and dragging system uptime to ~48%.

### What Was Completed

1. **Azure AD Health Check Fix**
   - The check was using `client_credentials` grant to request a Graph API token from the SSO app registration
   - The SSO app only supports authorization code flow (user login), so client credentials always failed
   - Replaced with a simple GET to the tenant's OpenID Connect discovery endpoint (`/.well-known/openid-configuration`)
   - No credentials needed — just validates Azure AD is reachable and the tenant is configured correctly

### Commits
- `d4cf40b` - Fix Azure AD health check to use OpenID discovery instead of client credentials

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
- Health check fix (Azure AD now uses OpenID discovery)
- Email test client functional
- Health check includes Microsoft Graph
- Dynamics email sending working

## Key Files Reference

| File | Purpose |
|------|---------|
| `lib/utils/health-checker.js` | Health check logic (7 services) |
| `docs/STRATEGY.md` | Strategic direction for app suite evolution |
| `docs/WISHLIST.md` | Brainstorming ideas and future directions |
| `lib/services/dynamics-service.js` | Dynamics API + email methods + `resolveSystemUser()` |
| `lib/services/graph-service.js` | Microsoft Graph API service (SharePoint access) |
| `pages/reviewer-finder.js` | Reviewer Finder (first app for Dynamics integration) |

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
