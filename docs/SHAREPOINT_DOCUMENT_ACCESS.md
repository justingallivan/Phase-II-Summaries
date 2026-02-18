# SharePoint Document Access via Dynamics Explorer

## Status: Blocked — Awaiting Azure AD Admin Consent

## Overview

Documents attached to Dynamics CRM requests (e.g., proposal PDFs, concept papers) are stored in **SharePoint**, not in Dynamics itself. Dynamics maintains pointers via `sharepointdocumentlocation` records. To programmatically access file content, we need **Microsoft Graph API** permissions.

## What We Know (Confirmed via Testing)

### SharePoint Configuration
- **SharePoint Site:** `https://appriver3651007194.sharepoint.com/sites/akoyaGO`
- **Document Library:** `akoya_request` (relative URL from root location)
- **Folder Pattern:** `{RequestNumber}_{GUIDNoHyphensUppercase}`
  - Example: `1001289_EEC6F39CE7D4EF118EE96045BD082F70`
- **Source:** SharePoint (confirmed by "ShareP..." in Dynamics UI)

### Dynamics API Access (Already Working)
- `sharepointdocumentlocations` entity is queryable via existing Dynamics auth
- Filter: `_regardingobjectid_value eq '{akoya_request GUID}'`
- Returns: `name`, `relativeurl`, `locationtype`, `servicetype`
- `sharepointsites` entity returns the root site URL
- `sharepointdocument` virtual entity does NOT work via Web API (400 error on `regardingobjectid` property)
- `annotations` (notes with attachments) returned 0 results — documents are purely in SharePoint

### Other Document Libraries Observed
- `akoya_phase` — Phase document locations
- `akoya_requestpayment` — Payment document locations
- `akoya_akoyaapply`, `akoya_akoyaapplycontact`, `akoya_goapplystatustracking` — GOapply documents

### Test Request: 1001289
- **GUID:** `eec6f39c-e7d4-ef11-8ee9-6045bd082f70`
- **Applicant:** Emory University
- **Documents seen in UI:** Call Participant Bios.pdf, Concept Papers.pdf, History Report - Emory.pdf, Research Concepts_2025-01-17T15-27-52Z.pdf

## What's Needed

### Azure AD Permissions (Blocked)
The app registration **"JPG Auth Test"** (client ID: `d2e73696-537a-483b-bb63-4a4de6aa5d45`) needs:

1. **Microsoft Graph > Application permissions:**
   - `Files.Read.All` — Read files in all site collections
   - `Sites.Read.All` — Read items in all site collections
2. **Admin consent** must be granted by a Global Administrator or Cloud Application Administrator

The permissions have already been added to the app registration but are in "Not granted" status. An admin needs to click "Grant admin consent for WM Keck Foundation" on the API permissions page.

No new secrets or app registrations are needed — the same credentials work with a different OAuth scope.

## Implementation Plan

### Phase 1: Microsoft Graph Service
Create `lib/services/microsoft-graph-service.js`:

```javascript
// Authentication
// - Same client credentials flow as dynamics-service.js
// - Scope: https://graph.microsoft.com/.default (instead of DYNAMICS_URL/.default)
// - Token cached separately from Dynamics token

// Key methods:
// - getAccessToken() — client credentials grant with Graph scope
// - listFiles(siteId, folderPath) — list files in a SharePoint folder
// - downloadFile(siteId, itemId) — download file content (binary)
// - getFileMetadata(siteId, itemId) — get file properties
```

### Phase 2: Document Resolution Helper
Create a helper that bridges Dynamics and Graph:

```javascript
// Given a request number:
// 1. Query akoya_requests to get the GUID
// 2. Query sharepointdocumentlocations filtered by _regardingobjectid_value
// 3. Combine with root SharePoint site URL to build full path
// 4. Use Microsoft Graph to list/download files from that path

// SharePoint site resolution:
// Site URL: https://appriver3651007194.sharepoint.com/sites/akoyaGO
// Full folder: /akoya_request/1001289_EEC6F39CE7D4EF118EE96045BD082F70/
```

### Phase 3: Dynamics Explorer Integration
Add a new tool to the Dynamics Explorer agent:

```javascript
// Tool: get_request_documents
// Input: { request_number: "1001289" } or { request_id: "eec6f39c-..." }
// Output: List of documents with names, sizes, modified dates
// Optional: Download and pass content to Claude for analysis

// Tool: read_document
// Input: { request_number: "1001289", filename: "Concept Papers.pdf" }
// Output: Extracted text content from the PDF
// Note: PDFs would need text extraction (pdf-parse or similar)
```

### Phase 4: PDF Processing
For Claude to act on documents:
- Download PDF via Graph API
- Extract text (using existing PDF processing from other apps, or Claude's vision capability for scanned documents)
- Pass content to Claude as part of the conversation

### Key Considerations
- **File size limits:** Large PDFs may need to be chunked or summarized
- **Vision vs text extraction:** Claude can read PDFs directly if passed as base64 images, but text extraction is more token-efficient
- **Caching:** Consider caching document listings (they don't change often)
- **Permissions scope:** `Sites.Read.All` is broad; `Sites.Selected` would be more secure but requires additional configuration per site

## Test Script

`scripts/test-document-locations.js` — queries Dynamics for document locations. Run with:
```bash
node scripts/test-document-locations.js [requestNumber]
```
Default: 1001289. Requires `.env.local` with Dynamics credentials.

## Graph API Endpoints (For Implementation)

```
# Authenticate
POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
  scope=https://graph.microsoft.com/.default

# Find the SharePoint site
GET https://graph.microsoft.com/v1.0/sites/appriver3651007194.sharepoint.com:/sites/akoyaGO

# List document libraries (drives) on the site
GET https://graph.microsoft.com/v1.0/sites/{site-id}/drives

# List files in a folder
GET https://graph.microsoft.com/v1.0/sites/{site-id}/drive/root:/akoya_request/1001289_EEC6F39CE7D4EF118EE96045BD082F70:/children

# Download a file
GET https://graph.microsoft.com/v1.0/sites/{site-id}/drive/items/{item-id}/content
```
