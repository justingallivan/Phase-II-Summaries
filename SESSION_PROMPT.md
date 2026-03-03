# Session 71 Prompt: Next Steps

## Session 70 Summary

Implemented Word template export for Proposal Summarizer and fixed a critical silent text truncation bug affecting all PDF-processing apps.

### What Was Completed

1. **Phase II Word Template Export** (Steps 0-6 of plan)
   - Legacy fallback files created (`proposal-summarizer-legacy.js`, `process-legacy.js`, prompts legacy)
   - Installed `docx` npm package for client-side .docx generation
   - Restructured summarization prompt into two-part output: Part 1 (grade 13 audience summary page) and Part 2 (technical detailed writeup)
   - Created `shared/utils/word-export.js` — generates .docx matching the Keck Phase II writeup template (Times New Roman, correct margins/tabs/spacing, page headers, page breaks)
   - Added Word export modal to `pages/proposal-summarizer.js` with Staff Lead field, editable AI-extracted fields, and internal fields (Program Type, Invited Amount, etc.)
   - Added Word export button to `shared/components/ResultsDisplay.js`

2. **Critical Bug Fix: Silent Text Truncation** (all apps)
   - All prompt templates were truncating PDF text to 6K-15K characters, silently dropping content that appears later in proposals (personnel sections, budgets, methodology details)
   - Increased all text limits to 100K characters (well within Claude's 200K token context window)
   - Fixed in 6 prompt files + Q&A endpoint + common.js TEXT_LIMITS constants
   - Affected apps: Proposal Summarizer, Phase I Summaries, Phase I Writeup, Reviewer Finder, Funding Gap Analyzer, Q&A

3. **User-Friendly API Error Messages** (`pages/api/process.js`)
   - Added `getApiErrorMessage()` — translates HTTP status codes (429, 529, 503, 401, 400) into clear user-facing messages
   - Previously threw generic "Failed to generate summary" for all errors

4. **Word Export Formatting Fixes**
   - Analyzed actual Word template XML for exact formatting specs
   - Fixed font (Calibri → Times New Roman), sizes, tab stops, margins
   - Fixed page breaks (`TextRun({ break: 1 })` → `PageBreak` class)
   - Added italic markdown (`*text*`) support in `contentToRuns()`
   - Strip `---` separators and PART markers from output

5. **Prompt Improvements**
   - Personnel Overview (Part 1): now 2-4 sentences with title, institution, and expertise per investigator (with example)
   - Personnel (Part 2): concise 3-5 sentences focused on project roles, no lengthy lab descriptions
   - Added cross-reference between summary `<u>` tags and structured extraction to fix PI name errors
   - Added em dash minimization rule to style guide

### Commits
- `291f238` Add Word template export and restructure Phase II writeup prompt
- `051b09d` Fix Word export: match template formatting, make all fields editable
- `0b7e15e` Fix PI extraction and strip part markers from output
- `7564157` Fix page breaks in Word export using PageBreak class
- `524ac20` Direct structured extraction to use Key Personnel section for names
- `22a5974` Increase text limits to 100K chars across all apps, fix silent truncation

## Deferred Items (Carried Forward)

- SharePoint document access (blocked on Azure AD admin consent — see `docs/SHAREPOINT_DOCUMENT_ACCESS.md`)
- Dynamics Explorer search heuristics & query optimization
- Email notifications via Graph API (deferred until `Mail.Send` permission granted — see `docs/TODO_EMAIL_NOTIFICATIONS.md`)
- next-auth v5 migration (still in beta)

## Potential Next Steps

### 1. Test Word Export with More Proposals
Run several different proposals through the Word export to verify formatting consistency, personnel extraction accuracy, and section content with the new 100K text limit.

### 2. Phase I Writeup Word Export
Apply the same Word template export pattern to Phase I writeups if a template exists.

### 3. Batch Word Export
Currently Word export is per-file. Could add a "Download All as Word" button that generates a ZIP of .docx files for batch processing.

### 4. Graphical Abstract Page
Page 2 of the Word template is a placeholder. Could add image upload support to let users insert a graphical abstract.

## Key Files Reference

| File | Purpose |
|------|---------|
| `shared/config/prompts/proposal-summarizer.js` | Two-part prompt template, `parseSections()`, `enhanceFormatting()` |
| `shared/utils/word-export.js` | Client-side .docx generation matching Keck template |
| `pages/proposal-summarizer.js` | Frontend with Word export modal and Staff Lead field |
| `pages/api/process.js` | API endpoint with cross-reference fix and error messages |
| `shared/components/ResultsDisplay.js` | Added Word export button |
| `shared/config/prompts/common.js` | TEXT_LIMITS constants (updated to 100K) |
| `WMKF Templates/Phase II writeup template 2.25.26.docx` | Reference Word template |

## Testing

```bash
npm run dev                    # Start dev server
npm run build                  # Verify no build errors
# Upload a PDF proposal → Generate Writeup Drafts
# Click Word export → verify modal pre-fills correctly
# Fill internal fields → Generate Word Document
# Open .docx in Word → verify formatting matches template
# Test with overloaded API → verify user-friendly error message
```
