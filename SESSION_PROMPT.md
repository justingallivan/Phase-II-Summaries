# Session 57 Prompt: Dynamics Explorer Continued

## Session 56 Summary

Implemented **round-efficiency optimizations** for Dynamics Explorer (hardcoded GUIDs, expanded `get_entity` select, vocabulary glossary) and created a **round-efficiency test suite** to verify the optimizations work.

### What Was Completed

1. **Vocabulary glossary in system prompt** (`dd2f9b8`) — Added a glossary mapping common user terms (PI, award, grant amount, Phase I status, etc.) to the correct CRM fields. Prevents the model from needing extra tool calls to discover field names.

2. **Round-count optimizations** (`fe76a2a`) — Three changes to reduce tool-call rounds:
   - **Hardcoded program GUIDs**: MR, S&E, SoCal, NorCal GUIDs embedded in system prompt so the model can filter by `_wmkf_grantprogram_value` directly without first querying `wmkf_grantprograms`
   - **Expanded `get_entity` select for requests**: Added `_wmkf_projectleader_value`, `akoya_grant`, `wmkf_phaseistatus`, and many other fields so single-request lookups return all needed data in one call
   - **Inline `wmkf_grantprogram` schema**: Added to TABLE_ANNOTATIONS so the model doesn't need `describe_table` to learn about program lookup tables

3. **Round-efficiency test suite** (`719e452`, `98c7099`) — New `scripts/test-dynamics-rounds.js` CLI script:
   - Sends 6 test queries to the chat endpoint via SSE
   - Parses streaming response to count tool-call rounds
   - Compares against per-query max-round thresholds
   - All 6 tests passed (most queries resolved in 2 rounds, within 3-round budgets)
   - Supports `--base-url`, `--query <n>`, `--verbose` flags

### Commits
- `dd2f9b8` - Add vocabulary glossary to Dynamics Explorer system prompt
- `fe76a2a` - Optimize Dynamics Explorer for fewer tool-call rounds
- `719e452` - Add round-efficiency test suite for Dynamics Explorer
- `98c7099` - Relax health check in round-efficiency test to accept any response

### Test Results (all passed)

| # | Query | Rounds | Max | Time |
|---|-------|--------|-----|------|
| 1 | Who is the PI on request 1001481? | 2 | 2 | 4.1s |
| 2 | How much did we award for request 1001481? | 2 | 2 | 3.1s |
| 3 | What's the Phase I status of request 1002108? | 2 | 2 | 3.3s |
| 4 | Show me all MR proposals from 2025 | 2 | 3 | 9.3s |
| 5 | Show me active SoCal grants | 2 | 3 | 9.9s |
| 6 | How many S&E proposals were submitted in 2024? | 3 | 3 | 7.5s |

## Potential Next Steps

### 1. Disambiguate Program Lookup Fields (from Session 54)
**ACTION REQUIRED: Talk to someone who knows the CRM database** to clarify the semantic difference between `_wmkf_grantprogram_value` (11 values like "Southern California") and `_akoya_programid_value` (24 values like "Precollegiate Education"). Once clarified, annotate both fields in TABLE_ANNOTATIONS.

### 2. Search Heuristics & Query Optimization (from Session 52)
- Pre-query classification to route to the right tool
- Common field name aliases (server-side mapping of wrong to correct names)
- Smart describe_table injection on query failure
- Lookup table auto-resolution (GUID fields)

### 3. Expand Test Suite
- Add queries testing `get_related` (account→requests, request→payments)
- Add queries testing Dataverse Search
- Add queries testing edge cases (ambiguous accounts, multi-step lookups)

### 4. AI Export Enhancements
- Test with larger datasets (1000+ records) to verify batch processing stability
- Consider adding a "cancel" button for long-running AI exports

### 5. Deferred Email Notifications
- Automated admin notification when new users sign up
- Requires Azure AD Mail.Send permission — see `docs/TODO_EMAIL_NOTIFICATIONS.md`

## Key Files Reference

| File | Purpose |
|------|---------|
| `shared/config/prompts/dynamics-explorer.js` | System prompt + tools + TABLE_ANNOTATIONS + vocabulary glossary + hardcoded GUIDs |
| `pages/api/dynamics-explorer/chat.js` | Agentic chat API (streaming, AI export, batch processing) |
| `pages/dynamics-explorer.js` | Chat frontend (memoized, text_delta streaming) |
| `scripts/test-dynamics-rounds.js` | Round-efficiency integration test suite (6 queries) |
| `lib/services/dynamics-service.js` | Dynamics CRM API service |

## Testing

```bash
npm run dev                                          # Run development server
node scripts/test-dynamics-rounds.js                 # Run round-efficiency tests (all 6)
node scripts/test-dynamics-rounds.js --query 1 --verbose  # Single query with detail
npm run build                                        # Verify build succeeds
```
