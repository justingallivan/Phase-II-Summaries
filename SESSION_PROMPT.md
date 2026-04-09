# Session 96 Prompt

## Session 95 Summary

Integrated a colleague's expertise matching module as a full new app (#15) — "WMKF Expertise Finder." Also clarified SharePoint write permissions with Connor (Dynamics admin) and drafted an IT request.

### What Was Completed

1. **Expertise Finder App — Full Integration**
   - New page (`pages/expertise-finder.js`) with three tabs: Match Proposal, Roster, History
   - API endpoints: `/api/expertise-finder/match` (AI matching), `/api/expertise-finder/roster` (CRUD), `/api/expertise-finder/history`
   - Database tables: `expertise_roster` (38 members seeded from CSV), `expertise_matches` (AI match history)
   - Prompt template (`shared/config/prompts/expertise-finder.js`) with three-output matching logic:
     - **Staff Assignment** — primary and secondary PD recommendation
     - **Consultant Overlap** — flag consultants whose expertise overlaps (may be none)
     - **Board Interest** — flag proposals of personal interest to board members
   - App registry entry, Sonnet model config (admin-configurable), seed script
   - Source module at `modules/expertise_matching/` with colleague's CSV, docs, and React component (kept as reference)

2. **Planning Doc Updates**
   - `docs/BACKEND_AUTOMATION_PLAN.md` — Updated Phase 1 item #5 (staff-proposal matching now powered by Expertise Finder), added `expertise_roster` and `expertise_matches` to Phase 3 migration tables
   - `docs/GRANT_CYCLE_LIFECYCLE.md` — Updated PD assignment prompt status to "built," added Expertise Finder to human-initiated tools
   - `CLAUDE.md` — Added app, model config, DB tables, API endpoints, module docs references

3. **SharePoint Write Permissions Clarified**
   - Confirmed with Connor that `Sites.Selected` is already granted in Azure Portal with admin consent
   - Read access was granted by IT via a site-scoped Graph API call
   - Write access requires IT to run the same type of call with `"roles": ["write"]`
   - No Azure Portal changes needed — only the site-scoped write grant
   - Updated `docs/PENDING_ADMIN_REQUESTS.md` Section 3 to reflect confirmed current state
   - Drafted email to IT requesting the write grant (not yet sent)

### Commits
- `4a9bc8e` Add SharePoint Sites.ReadWrite.Selected IT request to pending admin requests
- `92e0c56` Add Expertise Finder app for matching proposals to internal staff, consultants, and board members
- `79742e6` Fix seed script to load env vars from .env.local
- `752adf3` Update SharePoint write access request with confirmed current state

## Deferred Items (Carried Forward)

- **Staged Pipeline Implementation** — plan saved at `docs/STAGED_PIPELINE_IMPLEMENTATION_PLAN.md`, not yet scheduled
- **CRM Email Send (Phase A)** — pending feedback on plan (docs/CRM_EMAIL_SEND_PLAN.md)
- **Send SharePoint write permission email to IT** — drafted but not yet sent
- Build Proposal Picker component for Dynamics integration
- next-auth v5 migration (still in beta)
- Re-enable coverage thresholds when test coverage reaches 70%/80%
- Code hardening: upload attribution, legacy upload-file.js cleanup

## Potential Next Steps

### 1. Test Expertise Finder End-to-End
Grant app access to users, upload a real proposal PDF, and verify:
- AI matching produces reasonable staff assignments, consultant overlaps, and board interest flags
- Roster CRUD works (add, edit, deactivate members)
- Match history displays correctly
- Iterate on prompt if matching quality needs improvement

### 2. Build Batch Evaluation Tool (Phase 1 Priority)
The primary development work remains prompt engineering at scale:
- New page + API endpoint for batch evaluation
- Query Dynamics for historical proposals, fetch PDFs from SharePoint
- Run prompt against each, generate CSV with AI assessment vs. actual outcome
- Start with compliance checking (earliest AI task in lifecycle, step 4)

### 3. Develop Compliance Screening Prompt
First prompt to develop — gates everything downstream in the lifecycle:
- Foundation criteria documents available as prompt context
- Test against historical Phase I proposals
- Iterate with staff feedback until accuracy is acceptable
- Hand proven prompt to Connor for PowerAutomate deployment

### 4. Test Devil's Advocate End-to-End (carried from Session 93)
Run several panel reviews with DA enabled and verify output quality, synthesis integration, and export rendering.

### 5. Send SharePoint Write Permission Email
Email to IT is drafted — just needs to be sent. Once granted, can begin writing AI outputs back to SharePoint alongside proposals.

### 6. Begin Data Migration Planning
Map Vercel Postgres operational tables to Dynamics entities (now includes `expertise_roster` and `expertise_matches`). Connor needs to create corresponding entities/fields.

## Key Files Reference

| File | Purpose |
|------|---------|
| `pages/expertise-finder.js` | Expertise Finder page (3 tabs: Match, Roster, History) |
| `pages/api/expertise-finder/match.js` | AI matching endpoint (PDF → pdf-parse → Claude) |
| `pages/api/expertise-finder/roster.js` | Roster CRUD endpoint |
| `pages/api/expertise-finder/history.js` | Match history endpoint |
| `shared/config/prompts/expertise-finder.js` | Matching prompt template (3-output: staff, consultant, board) |
| `lib/db/migrations/004_expertise_finder.sql` | Database migration SQL |
| `scripts/seed-expertise-roster.js` | CSV-to-database seed script (38 members) |
| `modules/expertise_matching/` | Source module from colleague (CSV, docs, React component) |
| `docs/PENDING_ADMIN_REQUESTS.md` | IT permission requests (Section 3 updated) |
| `docs/BACKEND_AUTOMATION_PLAN.md` | Updated with Expertise Finder references |
| `docs/GRANT_CYCLE_LIFECYCLE.md` | Updated PD assignment status |

## Testing

```bash
npm run dev                              # Start dev server
npm run build                            # Verify no build errors
npm test                                 # Run all tests
node scripts/setup-database.js           # Run database migrations
node scripts/seed-expertise-roster.js    # Seed roster from CSV (idempotent)
```
