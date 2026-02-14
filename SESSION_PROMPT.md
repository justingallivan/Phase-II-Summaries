# Session 55 Prompt: Dynamics Explorer Program Field Disambiguation + Search Heuristics

## Session 54 Summary

Implemented **Dynamics Explorer performance optimizations** — streaming, parallel execution, inline schemas, and frontend memoization. Also diagnosed a query accuracy bug caused by program lookup field confusion.

### What Was Completed

1. **Inline top 4 table schemas** — Embedded full field schemas for `akoya_request`, `account`, `contact`, `akoya_requestpayment` directly in the system prompt. Eliminates 1 Claude API round-trip (~1-3s) for ~80% of queries.
2. **Parallel DB queries** — `getUserRole()` and `getActiveRestrictions()` now run via `Promise.all()` (~10-50ms saved)
3. **Parallel tool execution** — Multiple `tool_use` blocks in one round execute via `Promise.allSettled()` instead of sequential loop (100-400ms saved on multi-tool rounds)
4. **Streaming final response** — Claude API calls use `stream: true`; text-only final responses forward `text_delta` SSE events to the client in real-time for near-zero perceived latency on final text rendering. Tool-use rounds are still buffered.
5. **Frontend memoization** — `React.memo` on `MessageBubble`, `useMemo` for `parseMarkdownTables`, `useCallback` for `copyMessage`, stable message keys via counter ref
6. **Diagnosed program field confusion** — Discovered the model confuses `_wmkf_grantprogram_value` (11 high-level areas like "Southern California") with `_akoya_programid_value` (24 GoApply types like "Precollegiate Education"), causing wrong query results
7. **Added `.env.local` keys** — `CLAUDE_API_KEY` and `AUTH_REQUIRED=false` for local dev

### Commits
- `6fa1ebf` - Optimize Dynamics Explorer performance with streaming, parallel execution, and inline schemas

## Primary Next Step: Disambiguate Program Lookup Fields

**ACTION REQUIRED: Talk to someone who knows the CRM database** to clarify the semantic difference between these two program fields on `akoya_request`:

**`_wmkf_grantprogram_value` → `wmkf_grantprogram` (11 values):**
Discretionary (DISC), Emeritus (EMER), Honorarium (HON), Law (LAW), Memorial (MEM), Other (MISC), Research (RES), Southern California (SOCAL), Strategic Fund (STRAT), Undergraduate Education (UE), Young Scholars (YS)

**`_akoya_programid_value` → `akoya_program` (24 values):**
Arts & Culture (AC), Bridge Funding (BR), Chair's Grants (CGP), Civic & Community (CC), Directors' Directed (DDGP), Directors' Matching (DMGP), Disaster Relief (DR), Early Childhood (EC), Emeritus (EGP), Employee Matching (EMGP), Health Care (HC), Law and Legal Administration (LW) x2, Medical Research (MR), Memorial (MGP), Miscellaneous (MS), Precollegiate Education (EP), Research Reviewer (RR), Science and Engineering Research (SE), Senior Staff Directed (SSDGP), Staff Directed (SDGP), Strategic Fund (SF), Undergraduate Education - Liberal Arts (LA), Undergraduate Education - Science & Engineering (UG)

**Example failure:** Request 1001159 (Two Bit Circus Foundation) has `_wmkf_grantprogram_value` = "Southern California" and `_akoya_programid_value` = "Precollegiate Education". The model searched `akoya_program` for "Southern California", found nothing, and reported 0 active requests.

**After clarification:** Update the inline schema annotations in `shared/config/prompts/dynamics-explorer.js` to list all values for both tables and explain when to use each field. This may also require updating the system prompt rules.

## Other Potential Next Steps

### 1. Search Heuristics & Query Optimization (from Session 52)
- Pre-query classification to route to the right tool
- Common field name aliases (server-side mapping of wrong → correct names)
- Smart describe_table injection on query failure
- Lookup table auto-resolution (GUID fields)

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
| `shared/config/prompts/dynamics-explorer.js` | System prompt + tools + TABLE_ANNOTATIONS (inline schemas here) |
| `pages/api/dynamics-explorer/chat.js` | Agentic chat API (streaming, parallel execution) |
| `pages/dynamics-explorer.js` | Chat frontend (memoized, text_delta streaming) |
| `lib/services/dynamics-service.js` | Dynamics CRM API service |
| `shared/config/appRegistry.js` | Single source of truth for all 13 app definitions |

## Testing

```bash
npm run dev                              # Run development server
npm run build                            # Verify build succeeds
```

Test Dynamics Explorer with:
- "How many proposals are there?" — should NOT call describe_table (inlined)
- "Show me 10 most recent proposals" — should query directly
- "Show me emails for Stanford" — multi-tool round, parallel execution
- Verify streaming text appears incrementally for the final response
- Verify tool-use rounds still work correctly (buffered, not streamed)
