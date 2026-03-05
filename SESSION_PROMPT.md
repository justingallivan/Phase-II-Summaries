# Session 75 Prompt: Next Steps

## Session 74 Summary

Improved batch summary formatting and exports, added PDF export to three apps, parsed Phase I cover pages, and moved integrity screener API keys server-side.

### What Was Completed

1. **Batch Phase II Summary Formatting**
   - Removed redundant `# {index}. {filename}` headers from markdown export
   - Removed unnecessary horizontal rule after metadata block in `enhanceFormatting()`
   - Downgraded project title from H1 to H2 so institution name is the only H1
   - Added explicit project title instruction to the Phase II summarization prompt

2. **PDF Export for Batch Summaries**
   - Added `exportAllAsPdf()` to both `batch-proposal-summaries.js` and `batch-phase-i-summaries.js`
   - Parses markdown-formatted results into PDFReportBuilder calls (headers, bullets, key-values, paragraphs)
   - Page break between each proposal entry, cover page with batch metadata
   - Uses dynamic import for `pdf-lib` to avoid bundle bloat

3. **WinAnsi Encoding Fix in pdf-export.js**
   - Added `sanitizeForPdf()` function that replaces Unicode characters unsupported by Helvetica (subscripts, superscripts, em dashes, smart quotes, etc.) with ASCII equivalents
   - Applied to all text paths: `wrapText`, `addTitle`, `addSection`, `addMetadata`, `addKeyValue`, `addBadge`, `addHighlightBox`
   - Fixed newline encoding error by splitting on `\n` before word-wrapping in `wrapText()`

4. **Phase I Cover Page Parsing**
   - Added `parseCoverPage()` to `process-phase-i.js` — deterministic regex extraction of institution, project title, PI, co-PIs, amount, and period from the structured cover page
   - Cover page data used in `enhancePhaseIFormatting()` for proper headers and metadata
   - Structured data supplemented with cover page fields
   - Co-PI parser scoped to `Dr. Firstname Lastname` patterns, bounded by section headers to prevent runaway matching into budget/references

5. **Integrity Screener API Keys Server-Side**
   - `serpApiKey` now read from `process.env.SERP_API_KEY` in the API endpoint
   - `userProfileId` derived from `access.profileId` (authenticated session)
   - Removed `ApiSettingsPanel`, `useProfile`, and `apiSettings` state from frontend
   - Added PDF export with per-applicant pages, status badges, and source details

### Commits
- `a5cca0f` - Add PDF export to batch summaries, improve formatting, and parse Phase I cover pages
- `760ab75` - Move integrity screener API keys server-side, add PDF export, fix newlines in pdf-export

## Known Issues

### Integrity Screener: Malformed "View Source" URLs
The Retraction Watch match URLs contain two URLs concatenated with a semicolon (e.g., `https://retractionwatch.com/.../;https://retractionwatch.com/?s=Name`). The first is the article URL and the second is a search URL. These need to be split and handled separately — likely use the first URL for the "View on Retraction Watch" link. Investigate where the URLs are joined in `integrity-service.js` or `integrity-matching-service.js`.

## Deferred Items (Carried Forward)

- SharePoint document access (blocked on Azure AD admin consent)
- Dynamics Explorer search heuristics & query optimization
- Email notifications via Graph API (deferred until `Mail.Send` permission granted)
- next-auth v5 migration (still in beta)

## Potential Next Steps

### 1. Fix Integrity Screener Source URLs
Split the concatenated Retraction Watch URLs so only the article URL is used for the link.

### 2. Batch Proposal Summaries Q&A
The batch page (`batch-proposal-summaries.js`) uses the same ResultsDisplay component but may need its own Q&A wiring to pass extractedText through.

### 3. Phase I Writeup Q&A
Apply the same streaming Q&A pattern to Phase I writeups (`phase-i-writeup.js`, `batch-phase-i-summaries.js`).

### 4. Word Export Enhancements
- Batch Word export (ZIP of .docx files)
- Graphical abstract page (image upload for page 2)
- Test Word export with more proposals for formatting consistency

### 5. Prompt Caching for Other Endpoints
The same `cache_control` pattern could be applied to other endpoints that send large repeated context (e.g., batch processing, concept evaluator).

### 6. Production Deployment
Push to Vercel and verify all changes work in production.

## Key Files Reference

| File | Purpose |
|------|---------|
| `pages/batch-proposal-summaries.js` | Batch Phase II page with PDF/Markdown export |
| `pages/batch-phase-i-summaries.js` | Batch Phase I page with PDF/Markdown export |
| `pages/api/process-phase-i.js` | Phase I API with cover page parser |
| `shared/config/prompts/proposal-summarizer.js` | Phase II prompt with project title instruction, `enhanceFormatting()` |
| `shared/utils/pdf-export.js` | PDFReportBuilder with WinAnsi sanitizer and newline handling |
| `pages/integrity-screener.js` | Integrity screener with PDF export, no client-side API keys |
| `pages/api/integrity-screener/screen.js` | Screening endpoint with server-side SERP key |

## Testing

```bash
npm run dev                    # Start dev server
npm run build                  # Verify no build errors
# Batch Phase II: process proposals, export PDF and Markdown
# Batch Phase I: process proposals, verify cover page metadata in output
# Integrity Screener: run a screening, export PDF
# Verify SERP_API_KEY is in .env.local for local dev
```
