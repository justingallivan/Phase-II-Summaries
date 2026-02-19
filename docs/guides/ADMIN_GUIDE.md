# Admin Guide

Operational documentation for system administrators (superusers).

## Admin Dashboard

The Admin dashboard is accessible at `/admin` and is restricted to superusers. It provides:

- **System Health** — Status of database, Claude API, Azure AD, Dynamics CRM, and encryption
- **Usage Analytics** — API call volume, token usage, cost estimates, and latency metrics
- **Role Management** — Assign or remove Dynamics Explorer roles for users
- **App Access Management** — Control which apps each user can access
- **Model Configuration** — Override the AI model used by each app

## Managing User Access

### Granting App Access

1. Go to **Admin** → **App Access** tab
2. You'll see a grid of users (rows) and apps (columns)
3. Check or uncheck boxes to grant or revoke access
4. Click **Save** to apply changes

New users start with limited access. Grant the apps they need after they've signed in for the first time.

### Role Management

The Dynamics Explorer has its own role system for controlling what CRM data users can query:

1. Go to **Admin** → **Roles** tab
2. Assign roles to users (controls table/field access within Dynamics Explorer)

## Model Configuration

Each app uses a default AI model optimized for its task. Administrators can override these:

1. Go to **Admin** → **Models** tab
2. See the current model for each app
3. Select a different model from the dropdown
4. Click **Save** — the override takes effect immediately

Common reasons to change models:
- Switch to a faster/cheaper model for high-volume apps
- Upgrade to a more capable model for complex analysis tasks
- Test new model versions before rolling out broadly

Overrides are stored in the `system_settings` table and persist across server restarts.

## Health Monitoring

The health panel checks:

| Service | What's Checked |
|---------|----------------|
| **Database** | Connection to Vercel Postgres |
| **Claude API** | API key validity and availability |
| **Azure AD** | Authentication service connectivity |
| **Dynamics CRM** | OAuth token acquisition and API access |
| **Encryption** | User preference encryption key status |

A red status indicator means the service is unreachable or misconfigured. Check the environment variables and service status.

## Credential Rotation

For detailed credential management procedures, see [docs/CREDENTIALS_RUNBOOK.md](../CREDENTIALS_RUNBOOK.md).

Key environment variables:
- `CLAUDE_API_KEY` — Anthropic API key (used by all apps)
- `NEXTAUTH_SECRET` — Session encryption key
- `AZURE_AD_CLIENT_SECRET` — Azure AD app registration secret
- `DYNAMICS_CLIENT_SECRET` — Dynamics 365 CRM API secret
- `USER_PREFS_ENCRYPTION_KEY` — 32-byte hex key for encrypting user preferences

All secrets are configured in Vercel Environment Variables and are not stored in code.

## Usage Analytics

The usage dashboard shows:
- **Total API calls** and **total tokens** over a time period
- **Cost estimates** based on model pricing
- **Per-app breakdown** of usage
- **Latency percentiles** (p50, p95, p99) for response times
- **Model distribution** — which models are being used most

Use this data to identify high-cost apps, monitor adoption, and plan capacity.

## Common Administrative Tasks

### Adding a New User

New users are auto-provisioned on first sign-in via Azure AD. To grant them full access:
1. Ask them to sign in once (creates their profile)
2. Go to Admin → App Access
3. Check the apps they should have
4. Save

### Removing User Access

1. Go to Admin → App Access
2. Uncheck all apps for the user
3. Save

The user can still sign in but will only see the home page with no available apps.

### Backfilling Access for Existing Users

If you need to grant all apps to all existing users at once:

```bash
node scripts/backfill-app-access.js
```

This grants every app to every existing user profile.
