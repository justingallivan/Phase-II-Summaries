# Document Processing Suite - Session 27 Prompt

## Current State (as of January 17, 2026)

### App Suite Overview

The suite has 10 apps organized into categories:

| Category | Apps |
|----------|------|
| **Concepts** | Concept Evaluator |
| **Phase I** | Batch Phase I Summaries, Funding Analysis, Create Phase I Writeup Draft, Reviewer Finder |
| **Phase II** | Batch Phase II Summaries, Funding Analysis, Create Phase II Writeup Draft, Reviewer Finder, Summarize Peer Reviews |
| **Other Tools** | Expense Reporter, Literature Analyzer (coming soon) |

### Session 26 Summary

**Per-App Model Configuration (Completed)**

Implemented centralized per-app model configuration in `shared/config/baseConfig.js`:

| App | Model | Complexity |
|-----|-------|------------|
| Concept Evaluator | Opus 4 | High (Vision + Analysis) |
| Batch Phase I/II Summaries | Sonnet 4 | High |
| Phase I/II Writeup | Sonnet 4 | High |
| Reviewer Finder | Sonnet 4 | High |
| Peer Review Summarizer | Sonnet 4 | High |
| Funding Analysis | Sonnet 4 | Medium |
| Q&A, Refine | Sonnet 4 | Medium |
| Expense Reporter | Haiku 3.5 | Low |
| Contact Enrichment | Haiku 3.5 | Low (unchanged) |
| Email Personalization | Haiku 3.5 | Low (unchanged) |

## Current Session Tasks

### 1. Add Model Indicator to All Apps
Display the current Claude model beneath the API key indicator:

```
🔑 API Key: sk-•••••ijk [👁] [Edit] [Clear]
🤖 Model: Opus 4
```

**Implementation:**
- Extend `ApiKeyManager` component with optional `appKey` prop
- Create model name mapping (technical ID → friendly name)
- Update 10 app pages to pass their `appKey`

### 2. Test Concept Evaluator with Opus 4
- Run evaluations on sample concepts
- Compare quality vs. Sonnet 4 evaluations
- Document findings and cost implications

## Future Work: User Profiles & Preferences

### Context
- Small trusted team (handful of users)
- Each user has their own Claude API key (team subscription)
- Search service API keys (SERP, NCBI, ORCID) should be per-user to prevent rate limit lockouts during concurrent usage
- Growing configuration needs: API keys, model preferences, grant cycle settings, email templates

### Recommended Approach: Simple Profile Selector (No Auth)

For a small trusted team, implement profile selection without authentication:

```
┌─────────────────────────────────────────┐
│ 👤 Profile: [Sarah ▾]                   │
│              Sarah                       │
│              Michael                     │
│              Jennifer                    │
│              + Add profile...            │
└─────────────────────────────────────────┘
```

**Benefits:**
- Per-user preferences without login friction
- Works across devices (just select your name)
- Foundation for adding auth later if needed
- Prevents API rate limit conflicts between users

### Database Schema

```sql
-- User profiles (no auth initially, can add password_hash later)
CREATE TABLE user_profiles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  last_active_at TIMESTAMP
);

-- Flexible key-value preferences
CREATE TABLE user_preferences (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER REFERENCES user_profiles(id) ON DELETE CASCADE,
  preference_key VARCHAR(100) NOT NULL,
  preference_value TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(profile_id, preference_key)
);

-- Index for fast lookups
CREATE INDEX idx_user_preferences_profile_key
ON user_preferences(profile_id, preference_key);
```

### Preference Keys to Support

| Key | Description | Example Value |
|-----|-------------|---------------|
| `api_key.claude` | Claude API key | `sk-ant-...` |
| `api_key.serp` | SerpAPI key for Google Scholar | `abc123...` |
| `api_key.ncbi` | NCBI API key for PubMed | `def456...` |
| `api_key.orcid_id` | ORCID client ID | `APP-XXX` |
| `api_key.orcid_secret` | ORCID client secret | `xxx-yyy` |
| `model.concept-evaluator` | Model override | `claude-sonnet-4-20250514` |
| `model.expense-reporter` | Model override | `claude-3-5-haiku-20241022` |
| `ui.theme` | UI preference | `light` / `dark` |

### Implementation Phases

**Phase 1: Profile Selector + API Keys**
- Create database tables
- Add profile selector component (stored in localStorage which profile is active)
- Move API key storage from localStorage to database
- Add `/api/profiles` endpoints (CRUD)
- Add `/api/preferences` endpoints (get/set)

**Phase 2: Model Selection UI**
- Add model dropdown to ApiKeyManager
- Store preference in database
- API endpoints check user preference before falling back to defaults

**Phase 3: Full Settings Page**
- Create `/settings` page
- Manage all API keys in one place
- Configure model preferences for all apps
- Export/import settings

**Phase 4 (Optional): Authentication**
- Add password_hash to user_profiles
- Implement login/logout flow with NextAuth.js
- Session management

### API Endpoint Design

```
GET  /api/profiles              - List all profiles
POST /api/profiles              - Create profile
GET  /api/profiles/:id          - Get profile details
PUT  /api/profiles/:id          - Update profile
DELETE /api/profiles/:id        - Delete profile

GET  /api/preferences           - Get current user's preferences
PUT  /api/preferences/:key      - Set a preference
DELETE /api/preferences/:key    - Clear a preference
```

## Deferred Tasks

### Database Tab Phase 3 - Management
- Edit researcher info directly in Database tab
- Delete researchers (with confirmation)
- Merge duplicate researchers
- Bulk export to CSV

### Email Tracking
- Mark candidates as "email sent"
- Track response status (accepted, declined, no response)
- Use existing `email_sent_at`, `response_type` columns

### Literature Analyzer App
- Currently "coming soon" placeholder
- Paper synthesis and citation analysis

## Key Files Reference

**Model Configuration:**
- `shared/config/baseConfig.js` - Central config with APP_MODELS and getModelForApp()
- `shared/config/index.js` - Exports getModelForApp, getFallbackModelForApp

**API Key Management:**
- `shared/components/ApiKeyManager.js` - Current localStorage-based key management
- `shared/components/ApiKeyManager.module.css` - Styles

**Concept Evaluator:**
- `pages/concept-evaluator.js` - Frontend with file upload and results display
- `pages/api/evaluate-concepts.js` - API with Vision + text calls

**Reviewer Finder Core:**
- `pages/reviewer-finder.js` - Main page with 3 tabs
- `lib/services/claude-reviewer-service.js` - Uses getModelForApp('reviewer-finder')

## Environment Variables

```
CLAUDE_API_KEY=        # Required (will become per-user)
POSTGRES_URL=          # Auto-set by Vercel Postgres
SERP_API_KEY=          # Google/Scholar search (will become per-user)
NCBI_API_KEY=          # Higher PubMed rate limits (will become per-user)

# Per-app model overrides (optional, will become per-user preferences)
CLAUDE_MODEL_CONCEPT_EVALUATOR=   # Override Opus → Sonnet if needed
CLAUDE_MODEL_EXPENSE_REPORTER=    # Upgrade Haiku → Sonnet if needed
```

## Running the App

```bash
npm run dev
# Access at http://localhost:3000
```
