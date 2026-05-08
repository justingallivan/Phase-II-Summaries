# Plan: Send Emails via Dynamics CRM from Reviewer Finder & Review Manager

## Context

Both Reviewer Finder and Review Manager currently generate `.eml` files that users download and open in their email client manually. This creates friction at every stage of the reviewer lifecycle — invitations, materials, reminders, and thank-yous all require manual send. The Dynamics CRM email service (`dynamics-service.js`) already has full send capability. This plan adds "Send via CRM" as an option alongside the existing .eml download, linking sent emails to `akoya_request` records in Dynamics for audit trail.

This is **Phase A** of a larger reviewer lifecycle automation effort:
- **Phase A (this plan):** CRM email send — foundation for all subsequent automation
- **Phase B (future):** Status dashboard + cron-based monitoring. Cron flags overdue items daily → dashboard surfaces them → user decides action (one-click reminders, etc.)
- **Phase C (future):** Reviewer portal — token-based, time-limited page where reviewers upload COI forms, completed reviews, and billing info. No login required. Uploads auto-route to SharePoint.
- **Phase D (future):** Review intake + auto-filing to SharePoint via Graph API (needs `Sites.ReadWrite.Selected`)
- **Phase E (ongoing):** Schema cleanup — `declined_at`, per-reviewer `review_due_date` (defaults to cycle deadline, overridable for extensions), normalize booleans
- **Phase F (future):** Dynamics event-driven triggers via PowerAutomate (Option 3). APIs built stateless from Phase A onward to support this.

Design principles:
- APIs should be callable without a browser session (stateless, token-authenticated) so PowerAutomate flows can invoke them in the future.
- CRM send helper must be callable from both UI (button click) and programmatically (chatbot tool, cron job) — keep it in a shared utility, not embedded in API routes.
- Grant cycle ownership will eventually be multi-user (PD + coordinator), but Phase A doesn't change the scoping model — it just sends emails for whoever is logged in.
- Workflow steps will be data-driven per grant cycle (not hardcoded for Research programs) to support SoCal and special programs later.

The existing schema works for Phase A. Schema improvements in Phase D won't be blocked by this work.

## Data Model: Researchers vs. Suggestions

- `researchers` — shared pool of reviewer experts (can serve across many proposals)
- `reviewer_suggestions` — links a researcher to a specific proposal, with `UNIQUE(proposal_id, researcher_id)`. Each row has its own `request_number`.
- When sending an email, the `suggestionId` identifies the specific researcher+proposal pairing. The CRM `regardingId` comes from that suggestion's `request_number`, ensuring the email is linked to the correct request in Dynamics.
- A researcher who reviews multiple proposals will have multiple suggestion rows, each with its own request number and email history.

## Files to Create

- **`lib/utils/crm-email-helpers.js`** — Shared helpers for CRM email sending

## Files to Modify

- **`pages/api/reviewer-finder/generate-emails.js`** — Add CRM send path
- **`pages/api/review-manager/send-emails.js`** — Add CRM send path
- **`shared/components/EmailGeneratorModal.js`** — Add delivery method toggle + CRM results view
- **`pages/review-manager.js`** — Add delivery method toggle to EmailModal + CRM results view

## Implementation Steps

### Step 1: Create `lib/utils/crm-email-helpers.js`

Three exports:

1. **`textToHtml(plainText)`** — Convert plain text body to HTML for Dynamics `description` field. Escape HTML entities, `\n` → `<br>`, handle `**bold**` → `<strong>`.

2. **`resolveRequestGuids(requestNumbers)`** — Takes array of request number strings, deduplicates, queries Dynamics using same pattern as Dynamics Explorer's `getEntity()` for requests (chat.js:800-802): `DynamicsService.queryRecords('akoya_requests', { filter: "akoya_requestnum eq '...'", select: 'akoya_requestid', top: 1 })`. Returns `Map<requestNumber, akoya_requestid>`. Null for not-found. Parallel lookups (Promise.allSettled).

3. **`sendEmailViaCrm({ senderEmail, recipientEmail, subject, bodyText, attachments, requestNumber, requestGuidMap })`** — Orchestrates single CRM send: looks up GUID from map, converts body via `textToHtml`, calls `DynamicsService.createAndSendEmail()`. Returns `{ success: true, emailId }` or `{ success: false, error }`.

### Step 2: Modify Reviewer Finder API (`generate-emails.js`)

- Add `request_number` to `lookupProposalInfoForCandidates` SQL SELECT
- Accept `options.deliveryMethod` (`'eml'` default or `'crm'`) and `options.senderAzureEmail`
- When `deliveryMethod === 'crm'`:
  - Collect unique request numbers from proposalInfoMap
  - Call `resolveRequestGuids()` once at start
  - In per-candidate loop: compose subject/body via existing `replacePlaceholders()` + `buildTemplateData()`, then call `sendEmailViaCrm()` with attachments
  - Emit `crm_sent` SSE event per candidate (status + emailId or error)
  - `result` event includes `crmResults` array (no .eml content sent to browser)
  - `markAsSent` DB updates unchanged
- When `deliveryMethod === 'eml'`: no changes to existing code path

### Step 3: Modify Review Manager API (`send-emails.js`)

- Add `rs.request_number` to reviewer data SQL SELECT
- Accept `deliveryMethod` and `senderAzureEmail` in request body
- Same CRM send pattern as Step 2
- All three template types (materials/followup/thankyou) work identically

### Step 4: Modify EmailGeneratorModal.js (Reviewer Finder frontend)

- In OPTIONS step: add delivery method radio group
  - "Download as .eml files" (default)
  - "Send directly via CRM"
- When CRM selected: sender shows as logged-in user's email (read-only, from `useSession()`), markAsSent forced on
- Generate button label: "Generate Emails" vs "Send Emails via CRM"
- Handle `crm_sent` SSE event type in progress step
- DOWNLOAD step when CRM: show results table (name, email, sent/failed status) instead of download buttons. Summary: "X of Y sent successfully via CRM"

### Step 5: Modify Review Manager EmailModal (`review-manager.js`)

Same UI pattern as Step 4, adapted to the 3-step compose/progress/download flow.

### Step 6: Session access

Both modals use `useSession()` from `next-auth/react` to get `session.user.azureEmail`. Already available — `SessionProvider` is in `_app.js`, `useSession` used elsewhere.

## Reusable Code

| What | Where | Reuse |
|------|-------|-------|
| `DynamicsService.createAndSendEmail()` | `lib/services/dynamics-service.js:831` | Core CRM send — already complete |
| `DynamicsService.queryRecords()` | `lib/services/dynamics-service.js:349` | Request GUID lookup |
| Request lookup pattern | `pages/api/dynamics-explorer/chat.js:800` | `akoya_requestnum eq '...'` filter |
| `buildTemplateData()` | `lib/utils/email-generator.js` | Template data for both .eml and CRM |
| `replacePlaceholders()` | `lib/utils/email-generator.js` | Subject/body placeholder substitution |
| `safeFetch()` | `lib/utils/safe-fetch.js` | Attachment fetching from blob storage |
| `useSession()` | `next-auth/react` | User's Azure email for sender |

## Edge Cases

- **Missing `request_number`**: Older suggestions may be null. Send email without `regardingId` — still sends, just won't appear on request timeline in CRM.
- **Dynamics unavailable**: `sendEmailViaCrm` catches per-recipient errors. User sees which failed, can retry or fall back to .eml.
- **Attachment size**: Dynamics default 5MB per attachment. Log warning and send without oversized attachments.
- **Rate/timeout**: Each CRM email ≈ 3 API calls. For 20 candidates ≈ 60 calls. `maxDuration: 300` (5 min) should suffice.
- **Templates stay editable**: Users can customize subject/body before sending — not raw form emails.

## Verification

1. `npm run build` — no build errors
2. Dev test Reviewer Finder: select candidates → choose CRM delivery → verify SSE events → verify emails appear in Dynamics linked to request
3. Dev test Review Manager: same flow for materials/followup/thankyou
4. Dev test .eml fallback: confirm existing download still works unchanged
5. Verify `reviewer_suggestions` DB updates happen in both delivery modes
6. Test with null `request_number` — email sends without CRM linking
