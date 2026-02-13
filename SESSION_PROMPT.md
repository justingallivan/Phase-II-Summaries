# Session 51 Prompt: Dynamics Explorer Architecture Planning — New Tools from Dataverse Search

## Session 50 Summary

Discussed **Dynamics database architecture** and discovered that **Dataverse Search** (full-text search powered by Azure AI Search) is enabled on the CRM instance. Integrated it as a new `search_records` tool, and fixed a pagination issue.

### What Was Completed

1. **Database architecture mapping** — Mapped the full entity relationship model centered on `akoya_request` as the hub entity, with connections to accounts, contacts, payments/reports, emails, annotations, reviewers, and lookup tables.

2. **Discovered Dataverse Search API** — Tested `{DYNAMICS_URL}/api/search/v1.0/query` and confirmed it's active: 77,774 documents indexed, 154 MB. Supports full-text search across all indexed tables simultaneously with relevance ranking, stemming, and fuzzy matching.

3. **Discovered `wmkf_abstract` field** — Found that `akoya_request` has a `wmkf_abstract` field containing full proposal abstract text. It wasn't in the schema because the schema mapper's 25-record sample missed it. Now added to the system prompt schema.

4. **Integrated `search_records` tool** — New composite tool in the Dynamics Explorer that calls the Dataverse Search API. Searches titles, abstracts, names, notes across all indexed tables in one call. Returns results grouped by entity with highlighted match text. Successfully tested "find all grants about fungi" — returned 10 relevant results across requests and contacts.

5. **Fixed result truncation/pagination issue** — Discovered that Dynamics CRM does NOT support `$skip` (error `0x80060888`). Doubled `MAX_RESULT_CHARS` from 8K → 16K so queries returning ~50 records fit without truncation. Strengthened `$select` guidance so the model requests only fields it will display.

6. **Fixed Next.js API handler warning** — Separated `return res.end()` into `res.end(); return;` to avoid "API handler should not return a value" warning.

### Commits
- `25f6957` - Add full-text search via Dataverse Search API to Dynamics Explorer
- `8fd6b85` - Add skip parameter (reverted next commit)
- `8c3b8b2` - Remove $skip (unsupported in CRM), double result char limit to 16K
- `9ab053f` - Fix Next.js API handler warning

## Primary Next Step: Architecture Planning — New Tools from Dataverse Search

**Enter planning mode to discuss how to adapt the architecture given what we learned.** Key insights from Session 50 that should inform the plan:

### What We Now Know About the Database

1. **Entity relationships** — Everything flows through `akoya_request`:
   ```
   account (4500+ orgs)
       │  _akoya_applicantid_value
       ▼
   akoya_request (5000+ proposals/grants) ◄── contact (5000+)
       │
       ├──→ akoya_requestpayment (5000+)  [payments AND reports, akoya_type bool]
       ├──→ email (5000+)                 [via _regardingobjectid_value]
       ├──→ annotation (5000+)            [notes/attachments]
       ├──→ wmkf_potentialreviewers       [5 lookup fields on request]
       └──→ lookup tables                 [grant program, type, bbstatus, etc.]
   ```

2. **Dataverse Search capabilities** — The `/api/search/v1.0/query` endpoint:
   - Searches ALL indexed text fields across multiple tables simultaneously
   - Auto query expansion: "fungi" → `(fungus* | fungi)^2 OR (fungi~1)`
   - Returns `@search.highlights` showing exactly where terms matched
   - Returns `@search.score` for relevance ranking
   - Can filter to specific entities: `entities: [{ name: 'akoya_request' }]`
   - Also has `/api/search/v1.0/suggest` for autocomplete
   - Index: 77,774 documents, 154 MB

3. **Hidden fields** — `wmkf_abstract` on `akoya_request` contains full proposal abstracts but wasn't in the original schema. There may be other populated fields not yet exposed. The schema mapper (`scripts/dynamics-schema-map.js`) samples only 25 records and can miss sparsely populated fields.

4. **CRM limitations**:
   - `$skip` is NOT supported (error `0x80060888`)
   - `$count` endpoint fails with complex filters
   - OData `contains()` only searches one field at a time
   - No server-side joins — every cross-table lookup is a separate API call
   - `_formatted` fields cannot appear in `$select`

### Questions for the Planning Discussion

1. **What new composite tools would be most valuable?** Candidates:
   - `find_request_summary` — Given a request number, return a comprehensive one-page summary (request details + org + contact + payments + reports + reviewers) in one tool call
   - `find_payments_for_account` — All payments for an org, similar to `find_emails_for_account`
   - `find_requests_by_topic` — Wrapper around Dataverse Search filtered to `akoya_request`, with richer result formatting
   - `find_reviewer_assignments` — Which requests is a reviewer assigned to?
   - `find_active_grants` — Active grants with payment summaries

2. **Should Dataverse Search replace some OData queries?** For questions like "show me all requests from Stanford," should the model use `search_records` with entity filter instead of the multi-step account→request lookup? Trade-offs: search is faster (one call) but may be less precise than exact GUID filtering.

3. **Are there more hidden fields to discover?** Should we re-run the schema mapper with a larger sample size (e.g., 100 records) to catch sparsely populated fields like `wmkf_abstract`?

4. **Token budget with new tools** — Current system prompt is ~3K tokens. Each new tool definition adds ~100-150 tokens. How many tools can we add before hitting rate limits? The 30K input token/min rate limit is the constraint.

5. **Should the char limits be tool-specific?** Currently: 16K for regular queries, 12K for composite tools. Search results might need their own limit since abstracts are long.

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
| `shared/config/prompts/dynamics-explorer.js` | System prompt + schema + tool definitions |
| `pages/api/dynamics-explorer/chat.js` | Chat API with agentic loop + composite tools |
| `lib/services/dynamics-service.js` | Dynamics API service (OData + Dataverse Search) |
| `shared/config/baseConfig.js` | Model config (currently Haiku 4.5) |
| `scripts/dynamics-schema-map.js` | Schema introspection utility |
| `scripts/test-dataverse-search.js` | Dataverse Search API test script |

## Architecture Notes

- **Agentic loop**: User question → Claude picks tools → server executes against Dynamics → results fed back → Claude responds or calls more tools
- **Composite tools**: `find_emails_for_account`, `find_emails_for_request`, `find_reports_due`, `search_records` — handle multi-step or cross-table queries server-side
- **Token budget**: System prompt ~3,000 tokens. 30k input tokens/min rate limit. Results compacted (stripped nulls, text summaries, conversation compaction between rounds)
- **Model**: Haiku 4.5 primary, Haiku 3.5 fallback
- **Query limits**: Default top=50, max 100 per query, 16K char limit per tool result (12K for composite tools)
- **Dataverse Search**: Full-text search across 77K+ indexed documents. Used by `search_records` tool.

## Testing

```bash
npm run dev                              # Run development server
npm run build                            # Verify build succeeds
node scripts/test-dataverse-search.js    # Test Dataverse Search API
node scripts/test-dataverse-search.js "CRISPR"  # Search with custom term
```

App accessible at `/dynamics-explorer`
