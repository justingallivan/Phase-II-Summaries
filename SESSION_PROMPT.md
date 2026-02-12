# Session 50 Prompt: Dynamics Explorer Database Architecture Discussion

## Session 49 Summary

Continued refining the **Dynamics Explorer** chatbot — completed schema annotations with the domain expert and then iteratively fixed query result handling issues.

### What Was Completed

1. **Schema annotations** — Went through all tables with the domain expert and added brief parenthetical hints to ambiguous field names (e.g., `akoya_loireceived (Phase I proposal received date)`, `akoya_folio (payment status)`, `wmkf_bmf509 (IRS 509(a) status)`). Dropped deprecated `akoya_concept` table and two unused fields (`wmkf_typeforrollup`, `wmkf_researchconceptemailsent`).

2. **Field type hints** — Added boolean/int option set markers to prevent the model from filtering with string values on integer fields (e.g., `akoya_requirementtype (int option set — interim or final; do NOT filter as string)`).

3. **Server-side `$select` sanitization** — The model frequently puts `_formatted` fields in `$select` despite system prompt rules. New `sanitizeSelect()` function silently strips them before sending to Dynamics. The `Prefer: odata.include-annotations="*"` header ensures `_formatted` values are still auto-returned.

4. **`$count=true` on all queries** — Dynamics now always returns `totalCount` alongside records, so the model knows the true total even when records are truncated.

5. **Record-aware truncation** — Replaced naive string-cutting with a function that trims the records array while preserving valid JSON and reporting `totalCount`. Model is instructed to present the `totalCount` to the user.

6. **Default `top` increased** — 10 → 50, `MAX_RESULT_CHARS` 4000 → 8000.

7. **`find_reports_due` composite tool** — New server-side tool that queries all reporting requirements in a date range with org names, request numbers, and types in compact text. Handles the common "what reports are due in [month]?" query in one tool call.

### Current State

The "What reports are due in February 2026?" query now correctly identifies **84 reports** (verified by direct API call). The model summarizes by date and shows details. Still needs testing to confirm the composite tool returns all 84 with full details in one round.

### Commits
- `1e0d1be` - Annotate Dynamics schema fields and drop deprecated concept table
- `06816b3` - Add field type hints for option sets and boolean fields
- `fa5790a` - Add find_reports_due composite tool and fix query result handling

## Primary Next Step: Database Architecture Discussion

**The user wants to discuss the Dynamics database architecture before further optimization.** The goal is to better define the problem space and determine the most efficient patterns for querying the CRM. Topics to cover:

1. **How the data is structured** — What are the key entity relationships? How do requests, payments, accounts, contacts, and emails connect? Are there patterns the current schema doesn't capture well?

2. **Common query patterns** — What questions do staff ask most often? Which queries require multi-step lookups that could be simplified with more composite tools?

3. **Performance bottlenecks** — The `$count` endpoint fails with complex filters (returns "Could not find property on Edm.Int32" error). Should we work around this or use `$count=true` exclusively?

4. **Field coverage** — Are there important fields NOT in the current schema? The `scripts/dynamics-schema-map.js` utility can identify populated fields.

5. **Result volume** — Some queries return 84+ records. When should the model summarize vs. list everything? Should there be a pagination pattern?

## Other Potential Next Steps

### 1. Additional Composite Tools
Based on usage patterns, consider more server-side tools (similar to `find_reports_due`). Candidates: payments by org, request summaries, reviewer assignments.

### 2. Multi-Perspective Evaluator Refinements
- Test eligibility screening more thoroughly
- PDF export for Batch Summaries apps
- Refine perspective prompts

### 3. Integrity Screener Enhancements
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
| `docs/DYNAMICS_SCHEMA_ANNOTATION.md` | Schema annotation plan (mostly completed) |
| `scripts/dynamics-schema-map.js` | Schema introspection utility |

## Architecture Notes

- **Agentic loop**: User question → Claude picks tools → server executes against Dynamics → results fed back → Claude responds or calls more tools
- **Composite tools**: `find_emails_for_account`, `find_emails_for_request`, `find_reports_due` — handle multi-step queries server-side
- **Token budget**: System prompt ~3,000 tokens. 30k input tokens/min rate limit. Results compacted (stripped nulls, text summaries, conversation compaction between rounds)
- **Model**: Haiku 4.5 primary, Haiku 3.5 fallback
- **Query limits**: Default top=50, max 100 per query, 8K char limit per tool result (12K for composite tools)

## Testing

```bash
npm run dev              # Run development server
npm run build            # Verify build succeeds
```

App accessible at `/dynamics-explorer`
