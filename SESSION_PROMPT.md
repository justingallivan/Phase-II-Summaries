# Session 86 Prompt: Database Architecture — Proposal Data Model & Ground Truth

## Session 85 Summary

Three areas of work: (1) built a feedback logging system for Dynamics Explorer, (2) fixed Dynamics Explorer query failures, and (3) started bridging the Postgres database to Dynamics by backfilling request numbers.

### What Was Completed

1. **Dynamics Explorer Feedback Logging System**
   - V23b migration: `dynamics_feedback` table with JSONB `conversation_context` (current turn + 3 previous)
   - `lib/services/feedback-service.js`: CRUD, summary counts, 180-day cleanup for resolved entries
   - `POST/GET/PATCH /api/dynamics-explorer/feedback`: submit (any user), admin review (superuser)
   - Thumbs up/down buttons on assistant messages; thumbs-down opens modal with category selection (wrong answer, no results, incomplete, other) + optional notes
   - Server-side auto-detection: `detectPossibleFailure()` checks response text for failure patterns; `suggestFeedback` flag in `complete` SSE event prompts "Was this helpful?"
   - Admin dashboard section: browse, filter by status/type, expand conversation context, mark reviewed/resolved
   - Maintenance cron: cleanup job #7 for resolved feedback >180 days

2. **Dynamics Explorer Query Fixes**
   - System prompt EXPORT rule: tells Claude to reuse exact `table_name`, `filter`, `select` from prior successful `query_records` instead of guessing new params
   - Error passthrough: tool errors now include actual error message (500 chars) instead of generic "Tool execution failed" — enables Claude to self-correct
   - STATUS FIELD DISAMBIGUATION: explicit rule that "Phase II Pending" → `akoya_requeststatus`, not `wmkf_phaseiistatus` (different values on each field)

3. **Request Number Backfill**
   - V23a migration: `request_number` column on `reviewer_suggestions` and `proposal_searches`
   - Backfill script: matched 23 proposals by title to Dynamics request numbers (22 June 2026 + 1 December 2025), updated all 332 candidate rows
   - Request numbers now visible in Reviewer Finder (My Candidates: `#1002365 · PI: Name · Institution`) and Review Manager (above proposal title in table)

### Commits
- `0cfcabf` - Add feedback logging system for Dynamics Explorer
- `0f6c2dd` - Fix export_csv failures: reuse prior query params, pass error details to Claude
- `bca16a9` - Disambiguate Phase II Pending status field in system prompt
- `449cdd3` - Add request_number to reviewer_suggestions, backfill 23 proposals
- `4a74f0a` - Show request numbers in Reviewer Finder and Review Manager

### Key Context for Next Session

The user wants to have a **dedicated architecture discussion** about the proposal data model. The core question: **what is ground truth?** Currently:
- Dynamics CRM is the source of truth for proposal data (request number, title, PI, institution, budget, status, SharePoint files)
- Postgres `reviewer_suggestions` duplicates proposal metadata on every candidate row (no canonical proposal record)
- `proposal_searches` table exists but is empty — was designed as the canonical record but never populated
- Request numbers are now in Postgres but were backfilled manually, not synced from Dynamics

The user's vision: proposals enter the system from Dynamics first, then staff use Reviewer Finder to find reviewers for those proposals. This inverts the current flow where proposals enter as PDF uploads during the reviewer search process.

Key tensions to resolve:
- Should Postgres store a copy of proposal data, or always read from Dynamics?
- If copied, how to keep it in sync (push from Dynamics? periodic sync? on-demand fetch?)
- Which apps need proposal data and how fast?
- The `proposal_searches` table has the right shape but needs to become the canonical join point
- `reviewer_suggestions.proposal_id` is currently a text slug — should become an FK to `proposal_searches.id`

## Deferred Items (Carried Forward)

- Integrate email sending into Reviewer Finder / Review Manager
- Build Proposal Picker component for Dynamics integration
- next-auth v5 migration (still in beta)
- Re-enable coverage thresholds when test coverage reaches 70%/80%
- Code hardening: upload attribution, legacy upload-file.js cleanup

## Potential Next Steps

### 1. Architecture Discussion: Proposal Data Model
Plan the new data flow where proposals come from Dynamics first. Decide on ground truth, sync strategy, and schema changes. This was explicitly requested as the next conversation topic.

### 2. Build Proposal Picker Component
Shared component for browsing/searching Dynamics proposals. First consumer would be Reviewer Finder — replace manual PDF upload with "pick a proposal from CRM."

### 3. Populate `proposal_searches` Table
Create canonical proposal records from the 23 existing proposals in `reviewer_suggestions`. Add FK linkage. This is a stepping stone toward the new architecture.

### 4. Wire Request Numbers into Email Templates
The Reviewer Finder and Review Manager email templates could include request numbers for staff reference.

## Key Files Reference

| File | Purpose |
|------|---------|
| `lib/services/feedback-service.js` | Feedback CRUD for dynamics_feedback table |
| `pages/api/dynamics-explorer/feedback.js` | Feedback submission + admin review API |
| `pages/api/dynamics-explorer/chat.js` | Agentic chat — auto-detection, error passthrough |
| `shared/config/prompts/dynamics-explorer.js` | System prompt with EXPORT rule, status disambiguation |
| `scripts/backfill-request-numbers.js` | One-time request number backfill (23 proposals) |
| `scripts/setup-database.js` | V23a (request_number) + V23b (dynamics_feedback) migrations |
| `pages/api/reviewer-finder/my-candidates.js` | Returns request_number in proposal data |
| `pages/api/review-manager/reviewers.js` | Returns request_number in proposal data |

## Testing

```bash
npm run dev                              # Start dev server
npm run build                            # Verify no build errors
npm test                                 # Run all tests
```

Manual testing:
- Dynamics Explorer: thumbs up/down on responses, check admin dashboard for feedback entries
- Dynamics Explorer: "Show me Phase II Pending requests" then "export as CSV" — should reuse params
- Reviewer Finder My Candidates: verify request numbers show as `#XXXXXXX`
- Review Manager: verify request numbers show above proposal titles
