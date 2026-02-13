# Session 53 Prompt: Dynamics Explorer — Search Heuristics & Query Optimization

## Session 52 Summary

Completed the **Dynamics Explorer architecture redesign** (planned in Session 51) and then iteratively fixed account name resolution issues discovered through live testing with real queries.

### What Was Completed

1. **Architecture redesign: search-first tools** (from Session 51 plan)
   - Replaced 9 tools with 7: `search`, `get_entity`, `get_related`, `describe_table`, `query_records`, `count_records`, `find_reports_due`
   - Rewrote system prompt from ~3,000 tokens to ~800 tokens — field descriptions moved to on-demand `describe_table`
   - Built `TABLE_ANNOTATIONS` with 17 annotated tables
   - Built `get_entity` with per-type lookup configs and GUID detection
   - Built `get_related` with 11 relationship paths (account→requests/emails/payments/reports, request→payments/reports/emails/annotations/reviewers, contact→requests, reviewer→requests)
   - Ran 26 automated tests against live API — 25 passed

2. **Account name resolution fixes** (discovered through testing)
   - **akoya_aka (common name)**: Added as alternate search field so "Stanford University" finds "The Board of Trustees of the Leland Stanford Junior University" (akoya_aka = "Stanford University")
   - **wmkf_dc_aka (abbreviation)**: Added as third search field so "UCLA" finds "Regents of the University of California at Los Angeles" (wmkf_dc_aka = "UCLA")
   - **Dataverse Search fallback**: For accounts, runs Dataverse Search in parallel with OData to catch abbreviations not stored in any name field (e.g. "USC" → "University of Southern California")
   - **Ambiguity handling**: When exact match isn't the most-active account, returns most-active with disambiguation note (handles "USC" matching both Southern California and South Carolina)
   - **Tiebreaker logic**: Multiple exact matches resolved by `akoya_countofrequests` (most active wins)

3. **Bridge Funding / lookup table fix**
   - Added missing `_akoya_programid_value` lookup field to request annotations
   - Enriched `akoya_program` table annotations with 2-step lookup pattern
   - Added explicit system prompt rule: "ALWAYS call describe_table BEFORE first query_records"
   - Increased MAX_TOOL_ROUNDS from 10 → 15

4. **Search entity filter fix**
   - Fixed Dataverse Search entity filter format: `entities.map(name => ({ name }))` → `entities` (simple string array)

### Commits
- `60b7ba2` - Redesign Dynamics Explorer: search-first tools with server-side relationship traversal
- `7d9543b` - Fix account lookup to search both legal name and common name (akoya_aka)
- `51519b2` - Fix search entity filter format and improve get_related routing in prompts
- `40c910a` - Add wmkf_dc_aka (abbreviation) to account name lookups
- `4d59b8c` - Add Dataverse Search fallback for account lookups + ambiguity handling
- `10fe262` - Add _akoya_programid_value lookup to request schema and annotations
- `809b457` - Increase max rounds to 15 and strengthen describe_table-first rule

## Primary Next Step: Search Heuristics & Query Optimization

**Discuss and implement heuristics that help the chatbot avoid wasting rounds on trial-and-error.** The model (Haiku 4.5) struggles with unfamiliar query patterns and burns rounds guessing field names and wrong tables. We can encode domain knowledge to shortcut common patterns.

### Observations from Testing

The model consistently fails in predictable ways:
1. **Guesses wrong field names** — `akoya_requestnumber` instead of `akoya_requestnum`, `akoya_name` instead of `akoya_program`
2. **Tries wrong tables** — searched `wmkf_supporttype` for "Bridge Funding" instead of `akoya_program`
3. **Doesn't call describe_table first** — despite the rule, the model often guesses before asking
4. **Doesn't know lookup patterns** — doesn't understand that filtering by program name requires a 2-step GUID lookup

### Ideas to Discuss

1. **Pre-query classification** — Before the agentic loop starts, classify the user's question and inject a routing hint into the first message:
   - "Find X awards/grants/requests" → suggest `query_records` with relevant table
   - "Show me X for Y" → suggest `get_related`
   - "Tell me about X" → suggest `get_entity`
   - "Find [program name] awards" → suggest the 2-step lookup pattern

2. **Common field name aliases** — Server-side mapping of common field name mistakes to correct names (e.g. `akoya_requestnumber` → `akoya_requestnum`). Could be done in the `sanitizeSelect` function or as a pre-filter on query_records input.

3. **Smart describe_table injection** — When `query_records` fails with "Could not find a property named X", automatically return the `describe_table` output for that table alongside the error message, so the model gets the correct field names without burning an extra round.

4. **Lookup table auto-resolution** — When `query_records` filter contains `contains(lookup_field, 'text')` and the lookup field is a GUID field, automatically resolve the text to a GUID and rewrite the filter. This handles the "Bridge Funding" pattern without the model needing to know the 2-step pattern.

5. **Search-first routing** — For vague queries where the model might struggle to find the right table/field, automatically run a Dataverse Search first and use the results to guide the model toward the right tables.

6. **Tool result enrichment** — When a tool returns 0 results, add suggestions like "Did you mean table X?" or "Try searching for this term instead."

## Other Potential Next Steps

### 1. Multi-Perspective Evaluator Refinements
- Test eligibility screening more thoroughly
- PDF export for Batch Summaries apps

### 2. Integrity Screener Enhancements
- Complete dismissal functionality
- Add History tab
- PDF export for formal reports

## Key Files Reference

| File | Purpose |
|------|---------|
| `shared/config/prompts/dynamics-explorer.js` | System prompt + TABLE_ANNOTATIONS + 7 tool definitions |
| `pages/api/dynamics-explorer/chat.js` | Chat API: agentic loop, get_entity, get_related, describe_table handlers |
| `lib/services/dynamics-service.js` | Dynamics API service (OData + Dataverse Search) |
| `shared/config/baseConfig.js` | Model config (Haiku 4.5 primary) |

## Architecture Notes

- **7 tools**: search, get_entity, get_related, describe_table, query_records, count_records, find_reports_due
- **System prompt**: ~800-1000 tokens (down from ~3000). Field details served on-demand via describe_table.
- **Account resolution**: OData `contains()` on name + akoya_aka + wmkf_dc_aka, PLUS Dataverse Search in parallel, with exact-match tiebreaker by request count
- **get_related**: 11 relationship paths, server-side multi-step traversal (account→emails requires account→requests→emails)
- **Conversation compaction**: Old tool rounds summarized to one-liners to save tokens
- **MAX_TOOL_ROUNDS**: 15 (increased from 10)

## Testing

```bash
npm run dev                              # Run development server
npm run build                            # Verify build succeeds
node scripts/test-dataverse-search.js    # Test Dataverse Search API
```

Test queries in the chat UI at `/dynamics-explorer`:
- "Tell me about request 1001585" → get_entity (1 round)
- "Show me requests from Stanford in 2021-2026" → get_entity + get_related (2 rounds)
- "Show me requests from UCLA in 2023" → get_entity + get_related (2 rounds)
- "Show me requests from USC in 2024" → get_entity + get_related (2-3 rounds, disambiguation)
- "Find all Bridge Funding awards" → describe_table + query_records + query_records (3-4 rounds)
- "Find grants about CRISPR" → search (1 round)
