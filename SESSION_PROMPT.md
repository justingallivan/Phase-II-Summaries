# Session 54 Prompt: Dynamics Explorer Performance + Search Heuristics

## Session 53 Summary

Implemented **app-level access control and new user onboarding** — a full feature allowing superusers to control which of the 13 apps each user can see. New users only get Dynamics Explorer by default with a welcome modal directing them to request additional access.

### What Was Completed

1. **Database migration (V16)** — `user_app_access` table with `(user_profile_id, app_key)` unique constraint
2. **App registry** — `shared/config/appRegistry.js` as single source of truth for all 13 app definitions (replaces duplicate arrays in Layout.js and index.js)
3. **App access API** — `pages/api/app-access.js` with GET/POST/DELETE; superuser-only mutations, auth-disabled mode returns all apps
4. **Client-side context** — `AppAccessContext.js` fetches allowed apps on mount, exposes `hasAccess(appKey)` and `isSuperuser`
5. **Nav + home page filtering** — Layout.js and index.js now only show accessible apps; Admin link restricted to superusers
6. **Page-level access guard** — `RequireAppAccess.js` wraps all 13 app pages; blocks direct URL access with "Access Not Available" message
7. **New user auto-provisioning** — NextAuth signIn callback grants `dynamics-explorer` by default; `WelcomeModal.js` shown on first login
8. **Admin dashboard UI** — Checkbox grid (users x apps) with local edit tracking, amber highlights for changes, Save/Discard buttons
9. **Backfill** — Script and execution: all 7 existing users granted all 13 apps (91 grants)
10. **Documentation** — Updated CLAUDE.md and MEMORY.md; created `docs/TODO_EMAIL_NOTIFICATIONS.md` for deferred email feature

### Commits
- `c0da0a8` - Add V16 migration for user_app_access table and app registry
- `f7e26b7` - Add app access API endpoint for managing per-user app grants
- `0b80823` - Add AppAccessContext and filter nav/home page by app access
- `d1bb554` - Add page-level access guard and wrap all 13 app pages
- `55a5ced` - Auto-provision default apps for new users and add welcome modal
- `dfdfed6` - Add app access management section to admin dashboard
- `094913b` - Add backfill script for existing users and email notification TODO doc
- `71c80b4` - Redesign app access management as checkbox grid with save button
- `6ff617f` - Update CLAUDE.md with app access control schema, components, and API docs

## Primary Next Step: Dynamics Explorer Performance

The Dynamics Explorer app needs performance investigation and optimization. Profile the app to identify bottlenecks (initial load time, query latency, SSE streaming overhead, token usage). Consider:
- Is the initial page load slow due to component size or API calls?
- Are agentic tool rounds taking too long?
- Is conversation compaction working effectively?
- Could caching help (schema metadata, common queries)?

## Other Potential Next Steps

### 1. Search Heuristics & Query Optimization (from Session 52)
- Pre-query classification to route to the right tool
- Common field name aliases (server-side mapping of wrong → correct names)
- Smart describe_table injection on query failure
- Lookup table auto-resolution (GUID fields)
- See SESSION 53's detailed ideas list

### 2. Deferred Email Notifications
- Automated admin notification when new users sign up
- Requires Azure AD Mail.Send permission — see `docs/TODO_EMAIL_NOTIFICATIONS.md`

### 3. Multi-Perspective Evaluator Refinements
- Test eligibility screening more thoroughly
- PDF export for Batch Summaries apps

### 4. Integrity Screener Enhancements
- Complete dismissal functionality
- Add History tab
- PDF export for formal reports

## Key Files Reference

| File | Purpose |
|------|---------|
| `shared/config/appRegistry.js` | Single source of truth for all 13 app definitions |
| `shared/context/AppAccessContext.js` | React context for client-side access checking |
| `shared/components/RequireAppAccess.js` | Page-level access guard |
| `shared/components/WelcomeModal.js` | First-login welcome modal |
| `pages/api/app-access.js` | CRUD API for app grants |
| `pages/admin.js` | Admin dashboard (health, usage, roles, app access) |
| `pages/api/auth/[...nextauth].js` | NextAuth with auto-provisioning |
| `scripts/backfill-app-access.js` | One-time backfill for existing users |
| `pages/api/dynamics-explorer/chat.js` | Dynamics Explorer agentic chat API |
| `shared/config/prompts/dynamics-explorer.js` | Dynamics Explorer system prompt + tools |
| `lib/services/dynamics-service.js` | Dynamics CRM API service |

## Testing

```bash
npm run dev                              # Run development server
npm run build                            # Verify build succeeds
node scripts/setup-database.js           # Run all migrations (idempotent)
node scripts/backfill-app-access.js      # Grant all apps to existing users
```

Verification steps:
- As superuser: all apps visible, admin dashboard shows checkbox grid, can grant/revoke
- As new user: only Dynamics Explorer in nav/home, welcome modal appears, other URLs show "Access Not Available"
- Dev mode (`AUTH_REQUIRED=false`): all apps accessible, no access control enforced
