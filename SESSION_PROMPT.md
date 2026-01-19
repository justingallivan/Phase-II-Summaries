# Document Processing Suite - Session 31 Prompt

## Current State (as of January 18, 2026)

### App Suite Overview

The suite has **10 active apps** with multi-user support and optional Microsoft authentication:

| Category | Apps |
|----------|------|
| **Concepts** | Concept Evaluator |
| **Phase I** | Batch Phase I Summaries, Funding Analysis, Create Phase I Writeup Draft, Reviewer Finder |
| **Phase II** | Batch Phase II Summaries, Funding Analysis, Create Phase II Writeup Draft, Reviewer Finder, Summarize Peer Reviews |
| **Other Tools** | Expense Reporter, Literature Analyzer |

### Session 30 Summary (Completed)

**Microsoft Azure AD Authentication (Optional):**

Implemented conditional authentication that only activates when Azure credentials are configured.

1. **How It Works:**
   - Without Azure credentials → App works as before (ProfileSelector, no login)
   - With Azure credentials → Microsoft login required, user menu in header

2. **Database Schema (V11 Migration)**
   - Added `azure_id`, `azure_email`, `last_login_at`, `needs_linking` to `user_profiles`
   - Indexes for fast Azure lookups

3. **First-Login Flow**
   - User logs in with Microsoft
   - ProfileLinkingDialog lets them choose existing profile or create new
   - Future logins auto-select linked profile

4. **Key Files Created:**
   - `pages/api/auth/[...nextauth].js` - NextAuth with Azure AD provider
   - `pages/api/auth/link-profile.js` - Profile linking API
   - `pages/api/auth/status.js` - Returns if auth is enabled
   - `pages/auth/signin.js` - Custom signin page
   - `pages/auth/error.js` - Custom error page
   - `shared/components/RequireAuth.js` - Auth guard (passes through if disabled)
   - `shared/components/ProfileLinkingDialog.js` - First-login profile selection
   - `lib/utils/auth.js` - Server-side auth utilities

5. **To Enable Authentication:**
   ```env
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=<generate: openssl rand -base64 32>
   AZURE_AD_CLIENT_ID=<from Azure Portal>
   AZURE_AD_CLIENT_SECRET=<from Azure Portal>
   AZURE_AD_TENANT_ID=<organization tenant ID>
   ```
   Then run: `node scripts/setup-database.js`

### Current Users

| ID | Name | Proposals |
|----|------|-----------|
| 1 | Test User | 1 |
| 2 | Justin | 6 |
| 3 | Kevin Moses | 6 |
| 4 | Jean Kim | 5 |
| 5 | Beth Pruitt | 5 |
| 6 | Tom Rieker | 0 |

## Pending Tasks

### 1. Azure AD App Registration Setup
When ready to enable authentication:
1. Go to Azure Portal → Azure Active Directory → App registrations
2. Create new registration for this app
3. Configure redirect URIs: `http://localhost:3000/api/auth/callback/azure-ad` (dev) and production URL
4. Generate client secret
5. Note: Tenant ID, Client ID, Client Secret
6. Add environment variables and run migration

### 2. Protect Remaining API Routes (Optional)
The auth utilities are ready but most API routes aren't protected yet:
```javascript
import { requireAuth, requireAuthWithProfile } from '../../lib/utils/auth';

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
- `lib/utils/auth.js` - `requireAuth`, `requireAuthWithProfile`

**User Profiles:**
- `shared/context/ProfileContext.js` - React context (integrated with session)
- `shared/components/ProfileSelector.js` - Header dropdown (when auth disabled)
- `pages/profile-settings.js` - Profile management page
- `pages/api/user-profiles.js` - Profile CRUD API
- `pages/api/user-preferences.js` - Encrypted preferences API
- `lib/utils/encryption.js` - AES-256-GCM encryption

**Reviewer Finder:**
- `pages/reviewer-finder.js` - Main app with My Candidates, Database tabs
- `pages/api/reviewer-finder/my-candidates.js` - User-scoped queries
- `pages/api/reviewer-finder/save-candidates.js` - Saves with user_profile_id

## Environment Variables

```env
# Required
CLAUDE_API_KEY=

# Database (auto-set by Vercel Postgres)
POSTGRES_URL=

# Authentication (optional - enables Microsoft login when all are set)
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

Session 30 commits:
- `7de98a5` Add Microsoft Azure AD authentication with NextAuth.js
- `933ccf6` Make authentication optional when Azure credentials not configured

56 commits ahead of origin/main (not pushed).
