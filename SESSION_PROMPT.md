# Document Processing Suite - Session 27 Prompt

## Current State (as of January 18, 2026)

### App Suite Overview

The suite has 9 active apps (Literature Analyzer is planned but not yet implemented):

| Category | Apps |
|----------|------|
| **Concepts** | Concept Evaluator |
| **Phase I** | Batch Phase I Summaries, Funding Analysis, Create Phase I Writeup Draft, Reviewer Finder |
| **Phase II** | Batch Phase II Summaries, Funding Analysis, Create Phase II Writeup Draft, Reviewer Finder, Summarize Peer Reviews |
| **Other Tools** | Expense Reporter |

### Session 26 Summary

**1. Per-App Model Configuration (Completed)**

Implemented centralized model configuration in `shared/config/baseConfig.js`:

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
| Contact Enrichment | Haiku 3.5 | Low |
| Email Personalization | Haiku 3.5 | Low |

**2. Model Indicator Added to All Apps (Completed)**

Each app now displays its current model beneath the API key:
```
🔑 API Key: sk-•••••ijk [👁] [Edit] [Clear]
─────────────────────────────────────────
🤖 Model: Opus 4
```

**Key files:**
- `shared/utils/modelNames.js` - Converts model IDs to friendly names
- `shared/components/ApiKeyManager.js` - Extended with `appKey` prop

**3. Navigation Cleanup**
- Removed Literature Analyzer from navigation ribbon (commented out until implemented)

**4. Future Work Documented: User Profiles & Preferences**

Planned system for per-user settings (API keys, model preferences):
- Simple profile selector (no auth for trusted team)
- Database storage for preferences
- Per-user API keys to prevent rate limit conflicts
- See detailed plan in SESSION_PROMPT.md from Session 26

## Priority Tasks for Session 27

### 1. Database Tab Phase 3 - Researcher Management
- Edit researcher info directly in Database tab
- Delete researchers (with confirmation)
- Merge duplicate researchers
- Bulk export to CSV

### 2. Email Tracking
- Mark candidates as "email sent"
- Track response status (accepted, declined, no response)
- Use existing `email_sent_at`, `response_type` database columns

### 3. Literature Analyzer App
- Currently placeholder, hidden from navigation
- Paper synthesis and citation analysis
- Consider integration with existing literature search services

### 4. User Profiles (When Ready)
Phase 1 implementation:
- Create `user_profiles` and `user_preferences` tables
- Add profile selector component
- Move API key storage from localStorage to database

## Key Files Reference

**Model Configuration:**
- `shared/config/baseConfig.js` - APP_MODELS config and getModelForApp()
- `shared/utils/modelNames.js` - Model ID to friendly name mapping

**API Key & Model Display:**
- `shared/components/ApiKeyManager.js` - Manages API key with model indicator
- `shared/components/ApiKeyManager.module.css` - Styling

**Navigation:**
- `shared/components/Layout.js` - Navigation items array (line 14)

**Concept Evaluator:**
- `pages/concept-evaluator.js` - Frontend
- `pages/api/evaluate-concepts.js` - API (uses Opus 4)

**Reviewer Finder:**
- `pages/reviewer-finder.js` - Main page with 3 tabs
- `lib/services/claude-reviewer-service.js` - Uses getModelForApp()

## Environment Variables

```
CLAUDE_API_KEY=        # Required
POSTGRES_URL=          # Auto-set by Vercel Postgres
SERP_API_KEY=          # Google/Scholar search (optional)
NCBI_API_KEY=          # Higher PubMed rate limits (optional)

# Per-app model overrides (optional)
CLAUDE_MODEL_CONCEPT_EVALUATOR=claude-sonnet-4-20250514   # Downgrade Opus if needed
CLAUDE_MODEL_EXPENSE_REPORTER=claude-sonnet-4-20250514    # Upgrade Haiku if needed
```

## Running the App

```bash
npm run dev
# Access at http://localhost:3000
```

## Git Status

Branch: main

Session 26 commits:
- Add per-app model configuration for optimized cost/performance
- Update documentation for Session 26 and prepare Session 27 prompt
- Add model indicator to all apps showing current Claude model
- Remove Literature Analyzer from navigation until implemented
