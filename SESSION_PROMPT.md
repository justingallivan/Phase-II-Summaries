# Session 73 Prompt: Next Steps

## Session 72 Summary

Upgraded the Proposal Summarizer Q&A from isolated single-question requests to a full streaming multi-turn chat with web search, citation handling, and a side panel UI.

### What Was Completed

1. **Streaming Multi-Turn Q&A Chat**
   - Rewrote `/api/qa` as SSE streaming endpoint with full conversation history
   - System prompt includes full proposal text (80K chars) + generated summary
   - Conversation trimming (last 6 messages) to manage context window
   - 4096 max_tokens (up from 1500), 120s timeout, 4mb body limit
   - Retry on 429 with backoff; usage logging after stream completes
   - `pages/api/process.js` now returns `extractedText` in results for Q&A context

2. **Web Search with Dynamic Filtering**
   - `web_search_20260209` tool with dynamic filtering (code_execution auto-injected)
   - Source URL extraction from `web_search_tool_result` blocks and inline citations
   - Sources sent as SSE event and rendered as clickable links below messages
   - `pause_turn` stop reason handling

3. **Side Panel UI (replacing modal)**
   - Q&A chat is now a 520px right-side panel that slides in from the right
   - Writeup content stays visible and scrollable underneath a light backdrop
   - Streaming text with pulsing cursor, dynamic thinking indicators ("Searching the web...")
   - Auto-scroll via useRef, AbortController for mid-stream cancellation
   - `slideInRight` animation added to Tailwind config

4. **Prompt & Extraction Improvements**
   - Removed all em dashes from prompt templates (Claude was mirroring prompt style)
   - Fixed structured data extraction: strip markdown code fences before JSON.parse
   - Expanded fallback keyword stop list from 12 to ~80 common English words
   - State postal abbreviations in city_state extraction (e.g., "Reno, NV" not "Reno, Nevada")
   - Extracted Data section collapsed by default with click-to-expand toggle

### Commits
- `8cee3c8` - Upgrade proposal summarizer Q&A to streaming multi-turn chat with web search
- `d64a9f0` - Add web search citation handling to Q&A streaming
- `c86b672` - Upgrade Q&A web search to v20260209 with dynamic filtering
- `36c0a12` - Fix: remove explicit code_execution tool (auto-injected by web_search_20260209)
- `386980e` - Convert Q&A modal to slide-in side panel
- `390a371` - Remove em dashes from prompt templates to reduce em dash use in output
- `b68f9b2` - Fix structured data extraction and collapse it by default
- `ed573bb` - Use state postal abbreviation in city_state extraction prompt

## Deferred Items (Carried Forward)

- SharePoint document access (blocked on Azure AD admin consent — see `docs/SHAREPOINT_DOCUMENT_ACCESS.md`)
- Dynamics Explorer search heuristics & query optimization
- Email notifications via Graph API (deferred until `Mail.Send` permission granted — see `docs/TODO_EMAIL_NOTIFICATIONS.md`)
- next-auth v5 migration (still in beta)

## Potential Next Steps

### 1. Batch Proposal Summaries Q&A
The batch page (`batch-proposal-summaries.js`) uses the same ResultsDisplay component but may need its own Q&A wiring to pass extractedText through.

### 2. Phase I Writeup Q&A
Apply the same streaming Q&A pattern to Phase I writeups (`phase-i-writeup.js`, `batch-phase-i-summaries.js`).

### 3. Word Export Enhancements
- Batch Word export (ZIP of .docx files)
- Graphical abstract page (image upload for page 2)
- Test Word export with more proposals for formatting consistency

### 4. Q&A Prompt Caching
The web search docs describe prompt caching with `cache_control` breakpoints. Since the system prompt (proposal text + summary) is large and identical across turns, caching could significantly reduce input token costs.

### 5. Production Deployment
Push to Vercel and verify streaming Q&A works in production (SSE through Vercel's edge network).

## Key Files Reference

| File | Purpose |
|------|---------|
| `pages/api/qa.js` | SSE streaming Q&A endpoint with web search |
| `pages/api/process.js` | Returns `extractedText` in results; fixed JSON parsing |
| `pages/proposal-summarizer.js` | Side panel Q&A UI with streaming |
| `shared/config/prompts/proposal-summarizer.js` | Q&A system prompt, extraction prompt, em dash cleanup |
| `shared/components/ResultsDisplay.js` | Collapsible extracted data toggle |
| `tailwind.config.js` | `slideInRight` animation |

## Testing

```bash
npm run dev                    # Start dev server
npm run build                  # Verify no build errors
# Process a proposal, then open Q&A side panel
# Ask a question about the PI → verify streaming + web search
# Ask a follow-up → verify multi-turn context
# Check Word export → verify city/state uses postal abbreviation
```
