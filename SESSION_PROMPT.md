# Session 49 Prompt: Dynamics Explorer Schema Annotation

## Session 48 Summary

Built and iteratively debugged the **Dynamics Explorer** — a natural-language chatbot for querying the Keck Foundation's Dynamics 365 CRM. After initial implementation in Session 47, this session focused on reliability, model selection, and expanding the schema.

### What Was Completed

1. **Email body text access** — `find_emails_for_request` now returns the `description` field (email body), HTML-stripped and truncated to 800 chars per email, with `activityid` for fetching full text via `get_record`

2. **Model selection** — Tested Sonnet 4 (works but hits 30k token/min rate limit), Haiku 3.5 (can't handle tool-use), settled on **Haiku 4.5** as the sweet spot

3. **Fiscal year search fix** — Users asking for requests "in 2025" now get both fiscal-year-labeled AND calendar-year-submitted results via OR filter

4. **Reviewer fields** — Added `_wmkf_potentialreviewer1_value` through `5` and `wmkf_excludedreviewers` to the request schema, plus cross-table lookup guidance

5. **Anti-hallucination rule** — Added "NEVER fabricate or guess data" to system prompt after Haiku 3.5 made up reviewer matches

### Commits
- `4d3f695` - Add email body text to find_emails_for_request tool
- `2b5b32d` - Switch to Haiku 4.5, add reviewer fields and fiscal year guidance

## Primary Next Step: Schema Annotation Session

**See `docs/DYNAMICS_SCHEMA_ANNOTATION.md` for the full plan.**

Many CRM field names are cryptic (e.g., `akoya_loireceived`, `wmkf_bmf509`, `wmkf_typeforrollup`). The plan is to go through each table's fields with a domain expert and add brief parenthetical annotations so Claude can correctly map natural-language questions to the right fields.

### How to run this session:
1. Read `docs/DYNAMICS_SCHEMA_ANNOTATION.md` for the full field list with `?` markers
2. Go through each table with the user, asking them to clarify ambiguous fields
3. Update annotations in `shared/config/prompts/dynamics-explorer.js`
4. Test with queries that exercise the newly-annotated fields
5. Stay within ~200 extra tokens for all annotations

## Other Potential Next Steps

### 1. Additional Composite Tools
Based on usage patterns, consider adding more server-side composite tools for common multi-step queries (similar to `find_emails_for_account` and `find_emails_for_request`).

### 2. Missing Fields Discovery
During the annotation session, also ask: are there important fields NOT currently in the schema that users would want to query? The schema mapping script (`scripts/dynamics-schema-map.js`) can identify populated fields.

### 3. Multi-Perspective Evaluator Refinements
- Test eligibility screening more thoroughly
- PDF export for Batch Summaries apps
- Refine perspective prompts

### 4. Integrity Screener Enhancements
- Complete dismissal functionality
- Add History tab
- PDF export for formal reports

## Key Files Reference

| File | Purpose |
|------|---------|
| `shared/config/prompts/dynamics-explorer.js` | System prompt + schema + tool definitions |
| `pages/api/dynamics-explorer/chat.js` | Chat API with agentic loop + composite tools |
| `lib/services/dynamics-service.js` | Dynamics API service with entity set resolution |
| `shared/config/baseConfig.js` | Model config (currently Haiku 4.5) |
| `docs/DYNAMICS_SCHEMA_ANNOTATION.md` | Schema annotation plan with field list |
| `scripts/dynamics-schema-map.js` | Schema introspection utility |

## Architecture Notes

- **Agentic loop**: User question → Claude picks tools → server executes against Dynamics → results fed back → Claude responds or calls more tools
- **Composite tools**: Complex multi-step queries are handled server-side (`find_emails_for_account`, `find_emails_for_request`) rather than relying on Claude to chain multiple OData queries
- **Token budget**: System prompt ~2,800 tokens. 30k input tokens/min rate limit. Results compacted (stripped nulls, text summaries, conversation compaction between rounds)
- **Model**: Haiku 4.5 primary, Haiku 3.5 fallback

## Testing

```bash
npm run dev              # Run development server
npm run build            # Verify build succeeds
```

App accessible at `/dynamics-explorer`
