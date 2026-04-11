# Session 97 Prompt

## Session 96 Summary

Built the Grant Reporting app end-to-end and hardened the SharePoint document layer for both Grant Reporting and Dynamics Explorer. Discovered (and fixed) that older grants migrated from a previous grants management system store their files in archive libraries and nested subfolders that the original document tooling silently missed.

### What Was Completed

1. **Grant Reporting App — Full Build (`4ba741b`)**
   - New page (`pages/grant-reporting.js`) with three-step wizard: lookup → document picker (SharePoint or upload) → editable form + Word export
   - API endpoints:
     - `/api/grant-reporting/lookup-grant` — single round-trip Dynamics record + SharePoint document listing
     - `/api/grant-reporting/extract` — three modes: `full` (extract + goals comparison in parallel), `regenerate` (single field), `regenerate-goals`
   - Prompts (`shared/config/prompts/grant-reporting.js`):
     - `createGrantReportExtractionPrompt` — header / counts / narratives, temperature 0.1
     - `createFieldRegenerationPrompt` — single-field redo
     - `createGoalsAssessmentPrompt` — proposal-vs-report side-by-side, temperature 0.2
   - `compareProposalToReport()` factored as a pure helper so a future PowerAutomate-triggered backend job can call it headless
   - Word export (`shared/utils/grant-report-word-export.js`) — header block, counts table, narrative sections, project goals assessment block
   - Registry, Sonnet 4 model config, `RequireAppAccess` page guard, `requireAppAccess(req, res, 'grant-reporting')` on both API routes
   - **Not in `DEFAULT_APP_GRANTS`** — staff-only, must be granted via admin dashboard

2. **Multi-Library + Subfolder SharePoint Support (`4ba741b` + `9f8dcbf`)**
   - **Discovery:** Older grants (2023-vintage) keep their full file set in `RequestArchive1/2/3` libraries — Dynamics doesn't track these, but the folder convention is identical (`{requestNumber}_{guidNoHyphensUpper}`) so they can be probed speculatively in parallel. Concrete example: request 993879 (Carter/UNC-CH) — Project Narrative is in `RequestArchive3`, not `akoya_request`. Used to return 10 files; now returns 63.
   - **Discovery:** Migrated grants frequently keep files in subfolders like `Final Report/`, `Year 1/`, etc. The old `listFiles` returned subfolder entries as if they were files. Example: request 993347 picked the folder name "Final Report" as the report.
   - **Fixes:**
     - `lib/services/graph-service.js` — `listFiles()` got a `recursive` option (depth/breadth capped); filters out folders with `item.file != null`. `downloadFile()` now prefers `@microsoft.graph.downloadUrl` with manual-redirect fallback (the old `redirect: 'follow'` against `/items/{id}/content` was forwarding the bearer token to SharePoint's CDN host and getting 404s).
     - `pages/api/grant-reporting/lookup-grant.js` — `classifyFile()` heuristic rebuilt with custom separator class `[\s_\-]` (since `\b` fails between alphanumerics and `_`); proposal signals win when both fire so "Project Narrative ... FINAL.docx" stays a proposal; Phase I files explicitly excluded.
     - Composite keys are now 3-part (`library::folder::filename`) so files with the same name in different subfolders don't collide.
   - **Shared helper:** `lib/utils/sharepoint-buckets.js` `getRequestSharePointBuckets(requestId, requestNumber)` returns all plausible (library, folder) buckets — used by both `lookup-grant.js` and Dynamics Explorer's `list_documents`/`search_documents`.

3. **Dynamics Explorer Document Tools — Multi-Library + Subfolder Support (`9f8dcbf`)**
   - `pages/api/dynamics-explorer/chat.js` `listDocuments()` rewritten to use the shared helper; result shape adds `libraries[]` summary and per-file `library`/`folder`/`subfolder`; top-level `library`/`folder` removed (always a half-truth)
   - `searchDocuments()` rewritten to fan out KQL searches across all buckets in parallel and merge/dedupe by file id or webUrl
   - Tool descriptions updated so Claude knows to invoke them for older grants
   - Front-end `DocumentLinks` in `pages/dynamics-explorer.js` shows the location next to each file (`library` or `library/subfolder`) so users can disambiguate `Year 1/Report.docx` vs `Year 2/Report.docx`
   - Smoke-tested against 993879 (63 files, multi-library), 993347 (54 files, nested subfolder), 1001289 (4 files, happy path with archive probes filtered from summary), and a direct download against a nested file

4. **Memory + Documentation Updates**
   - `lib/utils/sharepoint-buckets.js` (new shared helper)
   - `docs/DYNAMICS_EXPLORER_DOCUMENT_LISTING_PLAN.md` (planning doc, now shipped)
   - `CLAUDE.md` — Grant Reporting added to Applications, per-app model, and API endpoint sections
   - Memory: `project_dynamics_explorer_archive_libs.md` flipped from TODO → shipped; `project_interim_report_automation.md` added as new TODO blocked on Dynamics write access

### Commits
- `4ba741b` Add Grant Reporting app with multi-library SharePoint support
- `9f8dcbf` Extend Dynamics Explorer document tools to multi-library + subfolders

## Deferred Items (Carried Forward)

- **Interim grant report auto-evaluation** — saved to memory (`project_interim_report_automation.md`); blocked on Dynamics write access. Backend job that mirrors today's manual staff workflow.
- **Staged Pipeline Implementation** — plan saved at `docs/STAGED_PIPELINE_IMPLEMENTATION_PLAN.md`, not yet scheduled
- **CRM Email Send (Phase A)** — pending feedback on plan (`docs/CRM_EMAIL_SEND_PLAN.md`)
- **Send SharePoint write permission email to IT** — drafted but not yet sent
- **Drop `Final Report Template.docx` into `public/templates/`** — Grant Reporting Word export was built without the template on hand; visual parity needs to be checked side-by-side before any production use
- Build Proposal Picker component for Dynamics integration
- next-auth v5 migration (still in beta)
- Re-enable coverage thresholds when test coverage reaches 70%/80%
- Code hardening: upload attribution, legacy upload-file.js cleanup

## Potential Next Steps

### 1. Test Grant Reporting Against Real Reports
Pick a few historical grants with known interim/final reports, run them through the app, and check:
- Counts and narratives are extracted accurately
- Goals assessment finds the right aims and rates them honestly (Claude has a tendency to read charitably)
- Word export looks acceptable next to the real `Final Report Template.docx`
- Iterate prompts if quality is off

### 2. Test Expertise Finder End-to-End (carried from Session 95)
Grant access, upload a real proposal, verify staff/consultant/board outputs, iterate prompt.

### 3. Build Batch Evaluation Tool (Phase 1 Priority)
Same as Session 95 — prompt engineering at scale against historical data, starting with compliance screening.

### 4. Send SharePoint Write Permission Email
Drafted but not sent. Once granted, unblocks the interim report auto-evaluation TODO and other write-back features.

### 5. Test Devil's Advocate End-to-End (carried from Session 93)
Run several panel reviews with DA enabled, verify output and exports.

### 6. Begin Data Migration Planning
Map operational tables to Dynamics entities (now includes `expertise_roster`, `expertise_matches`, and eventually any AI-output fields on `akoya_request`).

## Key Files Reference

| File | Purpose |
|------|---------|
| `pages/grant-reporting.js` | Grant Reporting page (3-step wizard, editable form, goals assessment, Word export) |
| `pages/api/grant-reporting/lookup-grant.js` | Dynamics record + SharePoint document listing in one round-trip |
| `pages/api/grant-reporting/extract.js` | Full extraction / per-field regenerate / goals regenerate |
| `shared/config/prompts/grant-reporting.js` | Three prompt templates for Grant Reporting |
| `shared/utils/grant-report-word-export.js` | DOCX builder for the final report |
| `lib/utils/sharepoint-buckets.js` | Shared helper: discover all plausible (library, folder) buckets for a request |
| `lib/services/graph-service.js` | `listFiles({recursive})`, `downloadFile()` prefers `@microsoft.graph.downloadUrl` |
| `pages/api/dynamics-explorer/chat.js` | `listDocuments`/`searchDocuments` use the shared bucket helper |
| `docs/DYNAMICS_EXPLORER_DOCUMENT_LISTING_PLAN.md` | Implementation plan for the multi-library/subfolder fix (now shipped) |

## Testing

```bash
npm run dev                              # Start dev server

# Grant Reporting smoke tests (auth disabled in dev)
curl -s -X POST http://localhost:3000/api/grant-reporting/lookup-grant \
  -H 'Content-Type: application/json' -d '{"requestNumber":"993879"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['documents']['proposalBestGuess'])"
# Expect: RequestArchive3::993879_...::UNC-CH - Carter - Project Narrative - Phase II - FINAL.docx

# Dynamics Explorer smoke tests
curl -s -X POST http://localhost:3000/api/dynamics-explorer/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"List documents for request 993879"}]}'
# Expect: 63 files across akoya_request (10) + RequestArchive3 (53)

curl -s -X POST http://localhost:3000/api/dynamics-explorer/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"List documents for request 993347"}]}'
# Expect: files inside Final Report/ surfaced with subfolder field

# Nested-folder download
curl -s "http://localhost:3000/api/dynamics-explorer/download-document?library=akoya_request&folder=993347_BEFE1C850892EE11BE37000D3A32CCEF/Final%20Report&filename=Final%20Report%20Narrative.pdf" \
  -o /tmp/test.pdf && file /tmp/test.pdf
# Expect: PDF document, version 1.x
```
