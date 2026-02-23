# Email Notifications — Unified Notification Service

## Current Status

A **unified notification service** (`lib/services/notification-service.js`) handles all system notifications. It works in two modes:

### What Works Now (Dashboard Alerts)
- **New user sign-up**: When a new user authenticates via Azure AD, a `new_user` alert is created in the `system_alerts` table and appears on the admin dashboard.
- **Health monitoring**: The health-check cron creates alerts when services degrade and auto-resolves when they recover.
- **Maintenance results**: Daily cleanup results are recorded as info alerts.
- **Secret expiration**: Approaching expiry dates trigger warning/error/critical alerts.
- **Log analysis**: Server error spikes are analyzed by AI and stored as alerts.

All alerts are visible in the **System Alerts** section of the admin dashboard (`/admin`), with acknowledge and resolve actions.

### What's Deferred (Email via Microsoft Graph)

When Microsoft Graph `Mail.Send` permission is granted, the notification service will automatically send emails for `error` and `critical` severity alerts. No code changes required — just configure the environment variables.

## Prerequisites for Email

1. **Azure AD Admin** must grant the `Mail.Send` application permission to the app registration
2. The permission type must be **Application** (not Delegated)
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

### Step 2: Add Environment Variables

```env
# Email sender address (must be a valid mailbox in the tenant)
NOTIFICATION_EMAIL_FROM=noreply@wmkeck.org
NOTIFICATION_EMAIL_TO=jgallivan@wmkeck.org
```

### Step 3: Verify

The notification service checks for these env vars plus valid Dynamics credentials (reuses the same app registration). When all are present, `NotificationService.isEmailEnabled()` returns true and emails are sent automatically for error/critical alerts.

Test by checking the `/api/health` endpoint or triggering a test alert.

## Architecture

```
NotificationService.notify()
  ├── AlertService.createAlert()          ← Always (dashboard)
  └── NotificationService.sendEmail()     ← Only if error/critical + email configured
        ├── getGraphToken()               ← Reuses DYNAMICS_* credentials
        └── POST /v1/users/{from}/sendMail
```

## Alternative Approaches

If Mail.Send permission is difficult to obtain:

1. **Dashboard-only** (current) — All notifications visible in admin dashboard
2. **Webhook to Slack/Teams** — Extend NotificationService with a webhook channel
3. **Daily digest** — The existing cron infrastructure could support a digest cron
