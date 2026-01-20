# Document Processing Suite - Session 33 Prompt

## Current State (as of January 20, 2026)

### App Suite Overview

The suite has **10 active apps** with multi-user support and Microsoft Azure AD authentication:

| Category | Apps |
|----------|------|
| **Concepts** | Concept Evaluator |
| **Phase I** | Batch Phase I Summaries, Funding Analysis, Create Phase I Writeup Draft, Reviewer Finder |
| **Phase II** | Batch Phase II Summaries, Funding Analysis, Create Phase II Writeup Draft, Reviewer Finder, Summarize Peer Reviews |
| **Other Tools** | Expense Reporter, Literature Analyzer |

### Session 32 Summary (Completed)

**Azure AD (Entra ID) Integration Finalization:**

IT team completed and refined the Microsoft Azure AD authentication integration:

1. **Auth Status Endpoint** (`pages/api/auth/status.js`)
   - New endpoint returning `{enabled: true|false}` based on Azure credentials
   - Used by RequireAuth to determine if login is required

2. **Enhanced Auth Utilities** (`lib/utils/auth.js`)
   - Added `getSession()` - Get session without error response
   - Added `optionalAuth()` - Return session if present, null otherwise
   - Refined `requireAuth()` and `requireAuthWithProfile()`

3. **RequireAuth Component Refinements**
   - Now fetches `/api/auth/status` on mount
   - Caches result in `window.__AUTH_ENABLED__`
   - Added `useRequireAuth()` hook

4. **ProfileLinkingDialog Improvements**
   - Cleaner implementation with proper loading states
   - Sign out option to switch accounts

5. **NextAuth Configuration Refinements**
   - Robust signIn callback with multiple profile lookup strategies
   - Error-tolerant: allows sign-in even if DB operations fail

**New Files from IT:**
- `.env.local.example` - Environment variable template
- `docs/ENTRA_ID_INTEGRATION_SUMMARY.md` - IT's integration documentation

### Database Schema

Current version: **V12**

Key tables:
- `researchers` - Expert profiles with notes field
- `reviewer_suggestions` - Proposal-researcher associations
- `grant_cycles` - Grant cycle management
- `user_profiles` - Multi-user support with Azure AD linking
- `user_preferences` - Encrypted API keys per user

### Current Users

| ID | Name | Proposals |
|----|------|-----------|
| 1 | Test User | 1 |
| 2 | Justin | 6 |
| 3 | Kevin Moses | 6 |
| 4 | Jean Kim | 5 |
| 5 | Beth Pruitt | 5 |
| 6 | Tom Rieker | 0 |

## Authentication Status

**Authentication is OPTIONAL.** The app works exactly as before until you configure Azure credentials.

- **Without credentials**: ProfileSelector dropdown in header, no login required
- **With credentials**: Microsoft sign-in required, profile auto-linked to Azure account

**To enable authentication (when ready):**

1. Register app in Azure Portal (see DEVELOPMENT_LOG.md Session 32 for walkthrough)
2. Set environment variables:
   ```env
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=<openssl rand -base64 32>
   AZURE_AD_CLIENT_ID=<from Azure Portal>
   AZURE_AD_CLIENT_SECRET=<from Azure Portal>
   AZURE_AD_TENANT_ID=<your tenant ID>
   ```
3. Ensure redirect URI is configured: `{NEXTAUTH_URL}/api/auth/callback/azure-ad`

**Testing Checklist:**
1. Visit `/api/auth/status` → should return `{"enabled":true}`
2. Visit any page → should show Microsoft sign-in
3. Complete OAuth → ProfileLinkingDialog appears (first login)
4. Link profile → Full access with session.user.profileId

## Pending Tasks

### 1. Test Azure AD Integration
Once credentials are configured:
- Verify sign-in flow works end-to-end
- Test profile linking for existing users
- Confirm session contains correct profileId and azureEmail

### 2. Protect Remaining API Routes (Optional)
Auth utilities are ready but most API routes aren't protected yet:
```javascript
import { requireAuth, requireAuthWithProfile, optionalAuth } from '../../lib/utils/auth';

export default async function handler(req, res) {
  const profileId = await requireAuthWithProfile(req, res);
  if (!profileId) return; // 401 or 403 already sent
  // ... rest of handler
}
```

## Future Enhancements (Low Priority)

### 1. Email Integration
- Dynamics 365 integration for email tracking
- Automated reminder system for non-responders
- Open/click tracking via webhooks

### 2. User Profiles Phase 2
- Per-user model preferences
- Email template settings per user
- Sender info stored in profile

### 3. Data Management
- Archive old proposals
- Bulk operations across grant cycles

## Key Files Reference

**Authentication:**
- `pages/api/auth/[...nextauth].js` - NextAuth configuration
- `pages/api/auth/link-profile.js` - Profile linking
- `pages/api/auth/status.js` - Auth enabled check
- `shared/components/RequireAuth.js` - Auth guard
- `shared/components/ProfileLinkingDialog.js` - First-login flow
- `lib/utils/auth.js` - `getSession`, `requireAuth`, `requireAuthWithProfile`, `optionalAuth`
- `.env.local.example` - Environment variable template
- `docs/ENTRA_ID_INTEGRATION_SUMMARY.md` - IT's documentation

**User Profiles:**
- `shared/context/ProfileContext.js` - React context (integrated with session)
- `shared/components/ProfileSelector.js` - Header dropdown (when auth disabled)
- `pages/profile-settings.js` - Profile management page
- `pages/api/user-profiles.js` - Profile CRUD API
- `pages/api/user-preferences.js` - Encrypted preferences API
- `lib/utils/encryption.js` - AES-256-GCM encryption

**Reviewer Finder:**
- `pages/reviewer-finder.js` - Main app with tabs, AddResearcherModal, ResearcherDetailModal
- `pages/api/reviewer-finder/researchers.js` - GET/POST(create/merge)/PATCH/DELETE
- `pages/api/reviewer-finder/my-candidates.js` - User-scoped queries, mode=proposals
- `pages/api/reviewer-finder/save-candidates.js` - Saves with user_profile_id
- `shared/components/EmailGeneratorModal.js` - Email generation with .eml download

**Email Generation:**
- Uses refs pattern to prevent re-render loops during SSE
- `generationTriggeredRef` prevents double generation
- `needsRefreshRef` defers parent callback until modal closes

## Environment Variables

```env
# Required
CLAUDE_API_KEY=

# Database (auto-set by Vercel Postgres)
POSTGRES_URL=

# Authentication (enables Microsoft login when all are set)
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=
AZURE_AD_CLIENT_ID=
AZURE_AD_CLIENT_SECRET=
AZURE_AD_TENANT_ID=

# Enhanced features (optional)
SERP_API_KEY=          # Google/Scholar search
NCBI_API_KEY=          # Higher PubMed rate limits

# User Profiles (optional - uses dev fallback)
USER_PREFS_ENCRYPTION_KEY=  # 32-byte hex key for API key encryption
```

## Running the App

```bash
npm run dev
# Access at http://localhost:3000

# Database setup (if needed)
node scripts/setup-database.js
```

## Git Status

Branch: main

Session 32 work:
- IT implemented Azure AD refinements (no commits from Claude Code this session)
- Documentation updated to reflect IT's changes
