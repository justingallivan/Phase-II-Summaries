# Pending Admin Requests for Microsoft Integration

**Date:** March 5, 2026
**App Registration:** WMK: Research Review App Suite
**App (Client) ID:** `d2e73696-537a-483b-bb63-4a4de6aa5d45`

---

## Section 1: Azure AD / Microsoft Graph (Azure Portal Admin)

**Goal:** Allow the app to read SharePoint documents linked to CRM records.

### What's Needed

Add Microsoft Graph **Application** permissions to the **"WMK: Research Review App Suite"** app registration, then grant admin consent.

### Steps

1. Go to **Azure Portal → App registrations → "WMK: Research Review App Suite"**
2. Click **API permissions → + Add a permission**
3. Select **Microsoft Graph → Application permissions**
4. Add these three permissions:

| Permission | Description |
|------------|-------------|
| `Sites.Read.All` | Read items in all site collections |
| `Files.Read.All` | Read files in all site collections |
| `Mail.Send` | Send mail as any user (for future email integration) |

5. Click **"Grant admin consent for WM Keck Foundation"** (requires Global Admin or Cloud Application Administrator)
6. Verify all three show green checkmarks with "Granted" status

### How to Verify

After granting, we can verify by running:
```bash
node scripts/test-graph-service.js
```
This will attempt to resolve the SharePoint site and list documents. A successful test shows file listings from the CRM-linked SharePoint library.

### Note

The other app registration ("JPG Auth Test") already has these permissions granted. We just need the same permissions on the Dynamics app registration since that's the one our server-side code uses for all Microsoft API calls.

---

## Section 2: Dynamics 365 CRM (Dynamics Admin)

**Goal:** Allow the app's service principal to create and send email activities through Dynamics CRM.

### What's Needed

Assign an email-capable security role to the app's application user in Dynamics 365.

### Steps

1. Go to **Power Platform Admin Center → Environments → (your environment) → Settings**
2. Navigate to **Users → Application Users** (or Security → Application Users)
3. Find **"WMK: Research Review App Suite"** (or search by App ID: `d2e73696-537a-483b-bb63-4a4de6aa5d45`)
4. Click **Manage Roles** and assign one of these options:

**Option A (Recommended): Assign the built-in "Email Sender" role**
- This includes `prvCreateActivity`, `prvSendEmail`, and related email privileges
- Least-privilege approach for email functionality

**Option B: Add privileges to the existing custom role**
If you prefer to extend the app's current security role, add these privileges:

| Privilege | Entity | Purpose |
|-----------|--------|---------|
| `prvCreateActivity` | Activity (and Email) | Create email activity records |
| `prvWriteActivity` | Activity (and Email) | Modify email drafts |
| `prvSendEmail` | Email | Send emails via Server-Side Sync |
| `prvReadActivity` | Activity (and Email) | Read email status after sending |
| `prvCreate` | Activity MIME Attachment | Add file attachments to emails |

### Server-Side Synchronization

The sender's mailbox must have **Server-Side Synchronization** enabled for outgoing email. Staff will send from their own work email addresses (the same ones used for Azure AD login). These mailboxes likely already have SSS configured if staff currently send/receive email through Dynamics.

If not already configured:
1. Go to **Settings → Email Configuration → Mailboxes**
2. Find the relevant user mailboxes
3. Ensure **Outgoing Email** is set to "Server-Side Synchronization"
4. Click **Approve Email** then **Test & Enable Mailbox**

### How to Verify

After granting the role, we can verify by running:
```bash
# Create a draft email (does not send)
node scripts/test-dynamics-email.js

# Create and send a test email to yourself
node scripts/test-dynamics-email.js --send
```

### Error We're Seeing

Currently, creating an email activity returns:
```
403: Principal user is missing prvCreateActivity privilege on entity 'msfp_alert'
```
This confirms the service principal needs the activity creation privileges listed above.

---

## Section 3: SharePoint Write Access (IT Admin)

**Goal:** Allow the app to write documents (AI-generated summaries, processed reports) back to the akoyaGO SharePoint site alongside the proposal files it already reads.

**Date Added:** April 9, 2026

### Current State

- The app registration already has **`Sites.Selected`** as an Application permission in Azure Portal (confirmed April 9, 2026 — see screenshot)
- Admin consent is already granted for WM Keck Foundation
- IT previously ran a Graph API call to grant **read** access to the akoyaGO site
- **No changes needed in Azure Portal** — `Sites.Selected` already supports both read and write

### What's Needed

IT needs to run one Graph API call to add a **write** grant to the akoyaGO site for this app, using the same method they used to grant read access:

```http
POST https://graph.microsoft.com/v1.0/sites/{site-id}/permissions
Content-Type: application/json

{
  "roles": ["write"],
  "grantedToIdentities": [{
    "application": {
      "id": "d2e73696-537a-483b-bb63-4a4de6aa5d45",
      "displayName": "WMK: Research Review App Suite"
    }
  }]
}
```

To find `{site-id}`:
```http
GET https://graph.microsoft.com/v1.0/sites/appriver3651007194.sharepoint.com:/sites/akoyaGO
```

### How to Verify

After granting, we can verify by running:
```bash
node scripts/test-graph-service.js --write
```

### Note

This uses site-scoped permissions (`Sites.Selected`), not tenant-wide access. The write grant applies only to the akoyaGO site — no other SharePoint sites are affected.

---

## Summary

| Admin | Action | Status |
|-------|--------|--------|
| Azure AD Admin | Add `Sites.Read.All`, `Files.Read.All`, `Mail.Send` to "WMK: Research Review App Suite" + grant consent | Pending |
| Dynamics Admin | Assign "Email Sender" role (or equivalent privileges) to the app's application user | Pending |
| IT Admin | Grant `Sites.ReadWrite.Selected` on akoyaGO site to "WMK: Research Review App Suite" | Pending |

Once all are complete, we'll have:
- **SharePoint document access** — list and retrieve files attached to CRM requests
- **SharePoint document write-back** — store processed documents and AI outputs alongside proposals
- **Direct email sending** — send reviewer invitations and review materials directly from the app, tracked as CRM activities
