# Session 62 Prompt: Next Steps

## Session 61 Summary

Created comprehensive user-facing documentation and an in-app guide page.

### What Was Completed

1. **Standalone Markdown Guides** — 6 guides in `docs/guides/`:
   - `GETTING_STARTED.md` — signing in, navigation, default access, getting help
   - `REVIEWER_FINDER.md` — 3-tab workflow, finding reviewers, emails, settings
   - `REVIEW_MANAGER.md` — status pipeline, materials/reminders/thanks, uploading reviews
   - `INTEGRITY_SCREENER.md` — data sources, confidence levels, dismissals, caveats
   - `DYNAMICS_EXPLORER.md` — natural language queries, multi-turn chat, tips
   - `ADMIN_GUIDE.md` — dashboard, user access, model config, health monitoring

2. **In-App Guide Page** (`pages/guide.js`) — Sidebar TOC on desktop, floating TOC button on mobile, hash-based anchor navigation (`/guide#reviewer-finder`), sections filtered by user's app access, admin section only for superusers, "Open App" links on each section.

3. **Guide Content Config** (`shared/config/guideContent.js`) — Structured content source for the guide page, decoupled from rendering.

4. **HelpButton Component** (`shared/components/HelpButton.js`) — Small `?` icon linking to `/guide#appKey`. Added to Reviewer Finder, Review Manager, Integrity Screener, and Dynamics Explorer page headers.

5. **Navigation Integration**:
   - Added `/guide` to `ALWAYS_ACCESSIBLE` in `appRegistry.js`
   - Added "Guide" link with book icon to nav ribbon in `Layout.js`
   - Added "Guide" link to Layout footer and home page footer
   - Added "User Guide" link to home page header
   - Added guide reference to `WelcomeModal.js` welcome text

6. **Doc accuracy fix** — Corrected claim about new users automatically getting Dynamics Explorer access (doesn't reliably happen in practice).

### Commits
- `ac4fb5a` Add user guide documentation and in-app /guide page
- `b7a8289` Fix guide docs: don't claim new users get automatic app access
- `68deeb0` Add Guide link to nav ribbon and home page

## Deferred Items

- SharePoint document access (blocked on Azure AD admin consent — see `docs/SHAREPOINT_DOCUMENT_ACCESS.md`)
- Disambiguate CRM program lookup fields (needs domain expert)
- Dynamics Explorer search heuristics & query optimization
- Deferred email notifications (`docs/TODO_EMAIL_NOTIFICATIONS.md`)
- Investigate why `DEFAULT_APP_GRANTS` may not work reliably for new users

## Key Files Reference

| File | Purpose |
|------|---------|
| `docs/guides/*.md` | 6 standalone user-facing Markdown guides |
| `pages/guide.js` | In-app guide page with TOC and anchor nav |
| `shared/config/guideContent.js` | Structured guide content for the page |
| `shared/components/HelpButton.js` | `?` icon linking to guide sections |
| `shared/config/appRegistry.js` | App definitions + ALWAYS_ACCESSIBLE paths |
| `shared/components/Layout.js` | Nav ribbon + footer with Guide link |
| `shared/components/WelcomeModal.js` | New user modal with guide reference |
