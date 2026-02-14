# TODO: Automated Email Notifications for New User Onboarding

## What This Feature Does

When a new user signs into the Document Processing Suite for the first time, an automated email would be sent to `jgallivan@wmkeck.org` notifying the admin that a new user has joined and may need additional app access grants.

## Why It's Deferred

Sending emails via Microsoft Graph API requires the `Mail.Send` permission on the Azure AD app registration. This permission requires Azure AD admin consent, which involves coordination with the IT team.

## Prerequisites

1. **Azure AD Admin** must grant the `Mail.Send` application permission to the app registration
2. The permission type must be **Application** (not Delegated), since the email is sent by the server, not on behalf of a user
3. Admin consent must be granted in the Azure Portal

## Setup Instructions

### Step 1: Add API Permission

1. Go to Azure Portal > Azure Active Directory > App registrations
2. Select the Document Processing Suite app
3. Navigate to **API permissions**
4. Click **Add a permission** > **Microsoft Graph** > **Application permissions**
5. Search for and select `Mail.Send`
6. Click **Add permissions**
7. Click **Grant admin consent for [Org Name]**

### Step 2: Add Environment Variable

```env
# Email sender address (must be a valid mailbox in the tenant)
NOTIFICATION_EMAIL_FROM=noreply@wmkeck.org
NOTIFICATION_EMAIL_TO=jgallivan@wmkeck.org
```

### Step 3: Implement the Service

Create `lib/services/email-service.js`:

- Use Microsoft Graph API: `POST /v1/users/{from}/sendMail`
- Authenticate using the existing `DYNAMICS_CLIENT_ID` / `DYNAMICS_CLIENT_SECRET` / `DYNAMICS_TENANT_ID` credentials (same app registration)
- Send a simple HTML email with:
  - Subject: "New User: [name] joined the Document Processing Suite"
  - Body: User name, email, timestamp, and a link to the admin dashboard

### Step 4: Wire Into Sign-In Flow

In `pages/api/auth/[...nextauth].js`, after creating a new user profile and granting default apps, call the email service to notify the admin.

## Alternative Approaches

If Mail.Send permission is difficult to obtain:

1. **Webhook to Slack/Teams** - Post a message to a channel instead of email
2. **Admin dashboard badge** - Show a "new users" indicator on the admin page
3. **Daily digest** - A scheduled function that checks for new users and emails a summary
