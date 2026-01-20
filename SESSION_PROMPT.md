# Document Processing Suite - Session 32 Prompt

## Current State (as of January 19, 2026)

### App Suite Overview

The suite has **10 active apps** with multi-user support and optional Microsoft authentication:

| Category | Apps |
|----------|------|
| **Concepts** | Concept Evaluator |
| **Phase I** | Batch Phase I Summaries, Funding Analysis, Create Phase I Writeup Draft, Reviewer Finder |
| **Phase II** | Batch Phase II Summaries, Funding Analysis, Create Phase II Writeup Draft, Reviewer Finder, Summarize Peer Reviews |
| **Other Tools** | Expense Reporter, Literature Analyzer |

### Session 31 Summary (Completed)

**Manual Researcher Management:**

1. **Researcher Notes Field**
   - V12 migration added `notes` column to `researchers` table
   - Editable in researcher detail modal (yellow highlight for display)
   - Track conflicts, preferences, decline reasons, past interactions

2. **Add Researcher Button**
   - New "+ Add Researcher" in Database tab
   - Form with name, affiliation, contact info, metrics, keywords, notes
   - **Grant cycle → Proposal dropdown** for associating on creation

3. **Associate with Proposal**
   - New "+ Add to Proposal" link in researcher detail modal
   - Links existing researchers to proposals without discovery
   - Grant cycle selector → Proposal selector → Optional match reason

4. **Status Tracking**
   - "No Response" option for closing out non-responders
   - "Mark as Sent" button for retroactive tracking

**Bug Fixes:**
- Email generation modal cycling/double-generation issues (refs pattern)
- ApiSettingsPanel infinite loop (callback ref pattern)
- Proposal association bug (parseInt on string hash)

**API Changes:**
- `POST /api/reviewer-finder/researchers` - Now supports create (not just merge)
- `GET /api/reviewer-finder/my-candidates?mode=proposals` - Fetch proposals for dropdowns

### Database Schema

Current version: **V12**

Key tables:
- `researchers` - Expert profiles with notes field
- `reviewer_suggestions` - Proposal-researcher associations
- `grant_cycles` - Grant cycle management
- `user_profiles` - Multi-user support with optional Azure AD linking
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

Session 31 commits:
- `9553708` Add manual researcher management and fix email generation bugs

Pushed to origin/main.
