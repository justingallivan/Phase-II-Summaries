# Document Processing Suite - Session 30 Prompt

## Current State (as of January 19, 2026)

### App Suite Overview

The suite has **10 active apps** with multi-user support:

| Category | Apps |
|----------|------|
| **Concepts** | Concept Evaluator |
| **Phase I** | Batch Phase I Summaries, Funding Analysis, Create Phase I Writeup Draft, Reviewer Finder |
| **Phase II** | Batch Phase II Summaries, Funding Analysis, Create Phase II Writeup Draft, Reviewer Finder, Summarize Peer Reviews |
| **Other Tools** | Expense Reporter, Literature Analyzer |

### Session 29 Summary (Completed)

**User Profiles Phase 1 - Full Implementation:**

1. **Database Schema (V10 Migration)**
   - `user_profiles` table with avatar colors, default flags
   - `user_preferences` table with AES-256-GCM encryption for API keys
   - Added `user_profile_id` FK to `proposal_searches` and `reviewer_suggestions`

2. **Profile Selection**
   - Profile dropdown in header (all pages)
   - Profile Settings page at `/profile-settings`
   - Create, edit, archive profiles with colored avatars

3. **API Key Isolation**
   - Each profile has its own encrypted API keys (Claude, ORCID, NCBI, SerpAPI)
   - Keys stored in database, NOT in localStorage
   - Switching profiles loads only that profile's keys

4. **User-Scoped Data**
   - My Candidates filtered by current profile
   - New proposals saved with user_profile_id
   - Legacy data (NULL) visible to all until migrated

5. **Migration Tools**
   - `export-proposals-for-migration.js` - Export proposals to CSV
   - `import-user-assignments.js` - Assign proposals to users
   - `manage-preferences.js` - View/delete API keys by profile

6. **Bug Fixes**
   - Fixed SSR compatibility (ProfileProvider in _app.js)
   - Fixed infinite re-render loop on profile switch
   - Fixed localStorage keys showing across all profiles

### Current Users

| ID | Name | Proposals |
|----|------|-----------|
| 1 | Test User | 1 |
| 2 | Justin | 6 |
| 3 | Kevin Moses | 6 |
| 4 | Jean Kim | 5 |
| 5 | Beth Pruitt | 5 |
| 6 | Tom Rieker | 0 |

## Future Enhancements (Low Priority)

### 1. User Authentication (If Trust Model Changes)
Currently profiles are honor-based (no login required). If security between users becomes necessary:
- Add login system (password, SSO, or OAuth)
- Per-user encryption keys derived from credentials
- Session management and logout
- Note: Current model assumes trusted internal team

### 2. User Profiles Phase 2 (If Needed)
- Per-user model preferences (override default Claude model)
- Email template settings per user
- Sender info (name, email, signature) stored in profile

### 3. Email Integration
- Dynamics 365 integration for email tracking
- Automated reminder system for non-responders
- Open/click tracking via webhooks

### 4. Data Management
- Archive old proposals
- Bulk operations across grant cycles

## Key Files Reference

**User Profiles:**
- `shared/context/ProfileContext.js` - React context for profile state
- `shared/components/ProfileSelector.js` - Header dropdown
- `pages/profile-settings.js` - Profile management page
- `pages/api/user-profiles.js` - Profile CRUD API
- `pages/api/user-preferences.js` - Encrypted preferences API
- `lib/utils/encryption.js` - AES-256-GCM encryption

**Migration Scripts:**
- `scripts/export-proposals-for-migration.js`
- `scripts/import-user-assignments.js`
- `scripts/manage-preferences.js`

**Reviewer Finder:**
- `pages/reviewer-finder.js` - Main app with My Candidates, Database tabs
- `pages/api/reviewer-finder/my-candidates.js` - User-scoped queries
- `pages/api/reviewer-finder/save-candidates.js` - Saves with user_profile_id

## Environment Variables

```
CLAUDE_API_KEY=        # Required
POSTGRES_URL=          # Auto-set by Vercel Postgres
SERP_API_KEY=          # Google/Scholar search (optional)
NCBI_API_KEY=          # Higher PubMed rate limits (optional)

# User Profiles (optional - uses dev fallback)
USER_PREFS_ENCRYPTION_KEY=  # 32-byte hex key for API key encryption

# Per-app model overrides (optional)
CLAUDE_MODEL_CONCEPT_EVALUATOR=claude-sonnet-4-20250514
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

Session 29 commits:
- `943cb65` Implement User Profiles Phase 1 for multi-user support
- `de60c03` Fix ProfileProvider and setPreferences naming conflict
- `8277c1b` Fix profile switching loop in API key components
- `f94ceb5` Isolate API keys per profile - do not show localStorage fallback
- `f088353` Add migration CSV to gitignore

52 commits ahead of origin/main (not pushed).
