# Dynamics Explorer — Document Listing Fixes

## Context

While building the Grant Reporting app we discovered that the Dynamics CRM's
SharePoint document layout is messier than `pages/api/dynamics-explorer/chat.js`
assumes. The `list_documents` tool (and to a lesser extent `search_documents`)
silently miss large numbers of files for any grant whose layout doesn't match
the "single library, flat folder" pattern.

The Grant Reporting `lookup-grant.js` endpoint was rewritten to handle three
real-world wrinkles:

1. **Multiple SharePoint libraries.** Older grants migrated from a previous
   grants management system store their files in `RequestArchive1/2/3`
   (3 libraries, allowlisted in `graph-service.js`), not in the active
   `akoya_request` library that `sharepointdocumentlocations` tracks. Folder
   names follow the same `{requestNumber}_{guidNoHyphensUpper}` convention,
   so they can be probed speculatively.

2. **Recursive subfolders.** Many grants — especially migrated ones — keep
   files inside subfolders like `Final Report/`, `Year 1/`, etc. The current
   `GraphService.listFiles()` returned both files and folder entries, and
   the chat tool blindly listed the folder name as if it were a file.

3. **Multiple `sharepointdocumentlocations` rows per request.** A request can
   have several location rows pointing at different (library, folder) pairs.
   The current `list_documents` only reads `locResult.records[0].relativeurl`
   and ignores everything else.

`graph-service.js` was already updated to support recursive walking and
folder filtering as part of the Grant Reporting commit (`4ba741b`). The
remaining work is to teach Dynamics Explorer's two SharePoint tools to use
those capabilities and to probe the archive libraries.

### Concrete example

Request `993879` (Carter / UNC-CH, 2023):
- `sharepointdocumentlocations` points only to `akoya_request/993879_...` → 10 files (administrative + reports).
- The actual Phase II Project Narrative lives in `RequestArchive3/993879_...` → 53 more files.
- Today: `list_documents request_number:993879` returns **10**.
- After fix: returns **63**, with each file labeled by library and (if nested) subfolder.

Request `993347` (Anslyn / UT Austin):
- `akoya_request/993347_...` has a `Final Report/` subfolder containing 4 files including the actual final report narrative.
- Today: `list_documents` returns the folder name `"Final Report"` as if it were a file, with no extension and no useful metadata. Downloading it 404s.
- After fix: surfaces the 4 nested files with `subfolder: "Final Report"` and skips the folder entry.

## Goals

- `list_documents` returns every file across the active library and all three archives, with subfolder contents flattened.
- Each returned file knows its `library`, `folder` (full path under the library root), and `subfolder` (relative to the bucket root) so download URLs route correctly.
- `search_documents` resolves a request number to the right (library, folder) when scoping a content search, and tolerates the same multi-library / multi-bucket case.
- The chat tool's text output for Claude makes the multi-library layout visible (so Claude can tell users *where* a file lives), while the structured `_files` payload for the front-end carries enough fields to build correct download URLs.
- One shared helper, not three copies of the same logic.

## Non-goals

- Reworking the chat tool's prompt or instruction text beyond what's needed for the new fields.
- Touching `graph-service.js` further — it already does the heavy lifting after the Grant Reporting commit.
- Backfilling old chat history. New tool calls only.
- Adding pagination or `@odata.nextLink` walking in `listFiles`. The 500-file cap is fine for any real grant.

## Approach

### Extract a shared helper

The Grant Reporting `lookup-grant.js` `listSharePointDocuments()` function is
now needed by at least two callers. Extract it into `lib/services/graph-service.js`
as a static method:

```js
GraphService.listAllRequestFiles(requestId, requestNumber, options?) → Promise<{
  libraries: [{ library, folder, count, error }],
  files: [{ name, size, mimeType, lastModified, library, folder, subfolder }],
}>
```

The helper does:
1. Query `sharepointdocumentlocations` for all rows regarding the request (uses `DynamicsService`, so the import lives in graph-service or — cleaner — the helper accepts a pre-fetched bucket list).
2. Resolve parent locations → library names (one extra round-trip, like today).
3. Append the speculative archive buckets (`RequestArchive1/2/3` with the canonical folder name).
4. `Promise.all` over every bucket calling `GraphService.listFiles(library, folder, { recursive: true })`.
5. Flatten + de-dupe by `${library}::${folder}::${name}`.

**Open question:** does `graph-service.js` get to import `DynamicsService`? Today it doesn't. Two options:

- **Option A (preferred):** Helper takes a pre-fetched `buckets` array — caller is responsible for the Dynamics queries. Keeps `graph-service.js` free of CRM coupling. Caller code stays small (~10 lines).
- **Option B:** Helper does it all and `graph-service.js` imports `DynamicsService`. Smaller caller, but creates a service-layer dependency between two things that have stayed independent so far. Also makes `graph-service.js` harder to use in contexts that don't have CRM access.

Lean toward Option A. The "list buckets from Dynamics" half is ~30 lines that
`lookup-grant.js` and `chat.js` both already have copies of; centralize *those*
in a small helper inside `lib/utils/sharepoint-buckets.js` (or as a plain
exported function from `dynamics-service.js`), and let `graph-service.js`
stay focused on Graph API mechanics.

**Final shape:**

```js
// lib/utils/sharepoint-buckets.js
export async function getRequestSharePointBuckets(requestId, requestNumber) {
  // Returns [{ library, folder }] including:
  //   - All Dynamics-tracked locations (resolved to real library names)
  //   - The speculative RequestArchive1/2/3 buckets with the canonical folder name
}

// lib/services/graph-service.js — already exists
GraphService.listFiles(library, folder, { recursive: true });

// callers
const buckets = await getRequestSharePointBuckets(requestId, requestNumber);
const results = await Promise.all(
  buckets.map(b => GraphService.listFiles(b.library, b.folder, { recursive: true }).then(...))
);
```

This is what `lookup-grant.js` already does inline. The shared helper is just
the bucket-discovery half.

## File-by-file changes

### NEW: `lib/utils/sharepoint-buckets.js`

Single exported function `getRequestSharePointBuckets(requestId, requestNumber)`:

- Lifts steps A and B of `lookup-grant.js` `listSharePointDocuments()` verbatim:
  - Query `sharepointdocumentlocations` for `_regardingobjectid_value eq '${requestId}'`
  - Resolve parent location IDs → library names
  - Build a Map keyed by `${library}::${folder}` for de-dupe
  - Append `RequestArchive1/2/3` with `${requestNumber}_${requestId.replace(/-/g,'').toUpperCase()}`
- Returns `Array<{ library: string, folder: string, source: 'dynamics'|'archive' }>`. The `source` field is for callers that want to label/sort buckets in the UI; not strictly needed but cheap to expose.
- No file listing — that's the caller's job. Keeps the helper testable in isolation.

Test it via a small scratch script or by running the existing `scripts/test-grant-reporting-docs.js` against a known-good request.

### MODIFIED: `pages/api/grant-reporting/lookup-grant.js`

Shrink `listSharePointDocuments()` to ~15 lines:
- Replace the inline bucket discovery with `await getRequestSharePointBuckets(requestId, requestNumber)`.
- Keep steps C (parallel listFiles + tolerate errors) and D (flatten + de-dupe) inline since they're caller-specific (composite key shape, classification).
- No behavior change — pure refactor. The existing curl tests (993879, 993347) should pass unchanged.

### MODIFIED: `pages/api/dynamics-explorer/chat.js` `listDocuments()`

Replace lines ~1465-1545 (everything after the request-ID resolution) with:

```js
const buckets = await getRequestSharePointBuckets(requestId, requestNum);
const bucketResults = await Promise.all(
  buckets.map(async b => {
    try {
      const files = await GraphService.listFiles(b.library, b.folder, { recursive: true });
      return { ...b, files, error: null };
    } catch (err) {
      return { ...b, files: [], error: err.message };
    }
  }),
);

// Flatten + de-dupe
const seen = new Set();
const allFiles = [];
for (const bucket of bucketResults) {
  for (const f of bucket.files) {
    const fileFolder = f.folder || bucket.folder;
    const k = `${bucket.library}::${fileFolder}::${f.name}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const subfolder = fileFolder.startsWith(bucket.folder + '/')
      ? fileFolder.slice(bucket.folder.length + 1)
      : '';
    allFiles.push({
      name: f.name, size: f.size, mimeType: f.mimeType, lastModified: f.lastModified,
      library: bucket.library, folder: fileFolder, subfolder,
    });
  }
}
```

**Tool result shape changes:**

Today the result is `{ requestNumber, library, folder, documentCount, header, documents, _files }`. After the fix:

```js
{
  requestNumber: requestNum,
  documentCount: allFiles.length,
  // Per-bucket summary so Claude can describe the layout to the user
  libraries: bucketResults
    .filter(b => b.files.length > 0 || b.error)
    .map(b => ({ library: b.library, folder: b.folder, count: b.files.length, error: b.error })),
  header: 'Filename | Size | Modified | Type | Location',
  documents: allFiles.map(f => {
    const date = f.lastModified ? new Date(f.lastModified).toLocaleDateString() : '';
    const where = f.subfolder ? `${f.library}/${f.subfolder}` : f.library;
    return `${f.name} | ${formatSize(f.size)} | ${date} | ${f.mimeType || ''} | ${where}`;
  }).join('\n') || 'No files found in any document library for this request.',
  // Structured payload for the front-end download links — each file carries
  // its own library and folder so download-document.js routes correctly.
  _files: allFiles.map(f => ({
    name: f.name,
    size: f.size,
    mimeType: f.mimeType,
    lastModified: f.lastModified,
    library: f.library,
    folder: f.folder,
    subfolder: f.subfolder,
    downloadUrl: `/api/dynamics-explorer/download-document?library=${encodeURIComponent(f.library)}&folder=${encodeURIComponent(f.folder)}&filename=${encodeURIComponent(f.name)}`,
  })),
}
```

The single top-level `library` and `folder` fields go away — they were always
a half-truth and now there's no single answer. Anywhere downstream that reads
them needs to switch to the per-file fields. (Search the front-end for usages
before deleting.)

**Tool description bump:**

Update the `list_documents` tool description in the tool definition list (around line 100-200 of chat.js — find the existing description) to mention that it now searches active and archive libraries and recurses into subfolders. Without this, Claude won't know to invoke it for older grants where it previously gave up.

### MODIFIED: `pages/api/dynamics-explorer/chat.js` `searchDocuments()`

`searchDocuments` is a different code path — it calls `GraphService.searchFiles()` (Graph KQL search) not `listFiles`. The bug there is narrower: when `request_number` is supplied, it uses `locResult.records[0]` to derive a single library and folder for scoping, missing the multi-bucket case.

Two options:

1. **Minimal:** Use `getRequestSharePointBuckets()` to get all buckets, run the search once per bucket, and merge results. Simple but multiplies Graph API calls by 4x for every request-scoped search.

2. **Smarter:** Run an unscoped search and post-filter by `webUrl` containing any of the bucket folder paths. One Graph call total, but loses some KQL precision (you can't tell Graph to scope by folder when you're scoring across the whole site).

Lean toward Option 1 — request-scoped searches are rare relative to broad searches, and the 4x multiplier is bounded and parallelizable. Document the tradeoff in a code comment so a future maintainer doesn't second-guess it.

### MODIFIED: `pages/api/dynamics-explorer/download-document.js`

Probably nothing — it already takes `library`, `folder`, `filename` as query params and calls `GraphService.downloadFileByPath`. Verify it works with a folder path that includes a slash (e.g. `993347_.../Final Report`) — `validatePath` in `graph-service.js` may need to permit interior slashes. Quick test:

```bash
curl -s "http://localhost:3000/api/dynamics-explorer/download-document?library=akoya_request&folder=993347_BEFE1C850892EE11BE37000D3A32CCEF/Final%20Report&filename=Final%20Report%20Narrative.pdf" -o /tmp/test.pdf && file /tmp/test.pdf
```

Should print `PDF document, version 1.x`. If `validatePath` rejects slashes, relax it (it's just there for path traversal protection — `..` is the real risk, not `/`).

### MODIFIED: `pages/dynamics-explorer.js` (front-end)

Wherever the chat UI renders the `_files` list from `list_documents`, it currently builds download links from the tool's top-level `library` and `folder`. After the change, those fields are gone — read the per-file `library`, `folder`, and `subfolder` instead. Quick grep:

```bash
grep -n '_files\|listDocuments\|library:' pages/dynamics-explorer.js
```

Likely a 3-5 line diff. Also a good place to display the subfolder in the file label so users can tell `Year 1/Report.docx` from `Year 2/Report.docx`.

## Testing

Manual smoke tests against the running dev server:

```bash
# 1. Multi-library case — should now find all 63 files for 993879
curl -s -X POST http://localhost:3000/api/dynamics-explorer/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"List all documents for request 993879"}]}'

# 2. Subfolder case — should find files inside "Final Report/" for 993347
curl -s -X POST http://localhost:3000/api/dynamics-explorer/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"List all documents for request 993347"}]}'

# 3. Boring case — request with no archives, no subfolders. Should still work.
#    Pick any recent (post-migration) request. 1001289 from
#    scripts/test-document-locations.js is the canonical happy-path test.
curl -s -X POST http://localhost:3000/api/dynamics-explorer/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"List documents for request 1001289"}]}'

# 4. Download routing — pick a nested file from #2 and confirm the download URL works
curl -s "http://localhost:3000/api/dynamics-explorer/download-document?library=akoya_request&folder=993347_BEFE1C850892EE11BE37000D3A32CCEF/Final%20Report&filename=Final%20Report%20Narrative.pdf" -o /tmp/x.pdf && file /tmp/x.pdf
```

For each, verify in the chat-tool result:
- `documentCount` matches the expected total (63 / 54 / a known value).
- `libraries` array shows the right per-bucket counts.
- `_files` entries each have the correct `library` and `folder` for routing.
- For #2, files inside `Final Report/` appear with `subfolder: "Final Report"`.

Regression check Grant Reporting after the `lookup-grant.js` refactor:

```bash
curl -s -X POST http://localhost:3000/api/grant-reporting/lookup-grant \
  -H 'Content-Type: application/json' -d '{"requestNumber":"993879"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['documents']['proposalBestGuess'])"
# Expect: RequestArchive3::993879_...::UNC-CH - Carter - Project Narrative - Phase II - FINAL.docx
```

## Implementation order

1. `lib/utils/sharepoint-buckets.js` — new helper, no callers yet.
2. Refactor `pages/api/grant-reporting/lookup-grant.js` to use it. Re-run the existing curl tests; should be byte-identical responses for 993879 and 993347.
3. `pages/api/dynamics-explorer/chat.js` `listDocuments()` — swap in the helper and the new flatten/dedupe block, change result shape.
4. Update tool description string for `list_documents`.
5. `pages/dynamics-explorer.js` — adapt the front-end to the new `_files` shape.
6. `pages/api/dynamics-explorer/chat.js` `searchDocuments()` — multi-bucket search.
7. Verify `download-document.js` handles subfolder paths; relax `validatePath` if needed.
8. Run the manual smoke tests above.
9. Update the auto-memory note: remove the TODO from `project_dynamics_explorer_archive_libs.md` (or replace it with a "shipped" pointer to the commit).

## Risks and tradeoffs

- **Result shape change is a breaking change for any code consuming the chat tool's `library`/`folder` top-level fields.** Mitigated by greping the front-end before merging, but if there's an external integration that hits the chat endpoint directly we'd need to add a compat shim. Current assessment: chat is internal-only, no external consumers.
- **4x more Graph API calls per `list_documents` invocation** (one per bucket in parallel). The archive probes return 404 fast for new grants and don't add meaningful latency, but they do add a small number of API calls against the Graph throttling budget. Acceptable.
- **`validatePath` relaxation** (if needed) — only loosen to allow `/` between safe segments; keep `..` blocked. Don't bypass it.
- **`searchDocuments` 4x fan-out** — flagged above, accepted as the simpler option.
