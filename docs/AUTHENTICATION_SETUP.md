# Authentication Setup Guide

This guide explains how to configure Azure AD (Microsoft Entra ID) authentication to restrict app access to your organization only.

## Overview

The app uses Microsoft Azure AD for single sign-on (SSO). When enabled:
- All pages require authentication
- All API endpoints require authentication
- Only users in your organization's Azure AD tenant can access the app

A **kill switch** (`AUTH_REQUIRED` environment variable) allows you to disable authentication without code changes if something goes wrong.

---

## Prerequisites

Before starting, you need:
1. Access to your organization's Azure Portal (portal.azure.com)
2. Permission to create App Registrations (or work with IT who can)
3. Access to Vercel project settings

---

## Step 1: Azure AD App Registration

### 1.1 Create the App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **New registration**
4. Configure:
   - **Name:** `Document Processing Suite` (or your preferred name)
   - **Supported account types:** Select **"Accounts in this organizational directory only"** (Single tenant)
   - **Redirect URI:**
     - Platform: **Web**
     - URL: `https://your-app.vercel.app/api/auth/callback/azure-ad`
     - (Replace with your actual Vercel domain)
5. Click **Register**

### 1.2 Note the Application Details

After registration, note these values from the **Overview** page:
- **Application (client) ID** → This is your `AZURE_AD_CLIENT_ID`
- **Directory (tenant) ID** → This is your `AZURE_AD_TENANT_ID`

### 1.3 Create a Client Secret

1. Go to **Certificates & secrets** in the left menu
2. Click **New client secret**
3. Add a description (e.g., "Vercel Production")
4. Choose an expiration (recommended: 24 months)
5. Click **Add**
6. **Immediately copy the secret value** → This is your `AZURE_AD_CLIENT_SECRET`
   - You cannot view this value again after leaving the page!

### 1.4 Configure API Permissions (Optional)

The default permissions should work. If needed:
1. Go to **API permissions**
2. Ensure these are present:
   - `Microsoft Graph` → `User.Read` (Delegated)
   - `openid`, `email`, `profile` (usually included by default)

### 1.5 Add Additional Redirect URIs

For Vercel preview deployments, add additional redirect URIs:
1. Go to **Authentication** in the left menu
2. Under **Web** → **Redirect URIs**, add:
   - `https://your-app.vercel.app/api/auth/callback/azure-ad` (production)
   - `https://your-app-git-*.vercel.app/api/auth/callback/azure-ad` (preview deployments)
   - `http://localhost:3000/api/auth/callback/azure-ad` (local development)

**Note:** For preview deployments, you may need to use a wildcard pattern or add specific preview URLs as needed.

---

## Step 2: Configure Vercel Environment Variables

### 2.1 Generate NEXTAUTH_SECRET

Run this command to generate a secure secret:
```bash
openssl rand -base64 32
```

### 2.2 Add Environment Variables in Vercel

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add the following variables:

| Variable | Value | Environments |
|----------|-------|--------------|
| `AUTH_REQUIRED` | `true` | Production, Preview |
| `AZURE_AD_CLIENT_ID` | `<from Step 1.2>` | Production, Preview, Development |
| `AZURE_AD_CLIENT_SECRET` | `<from Step 1.3>` | Production, Preview, Development |
| `AZURE_AD_TENANT_ID` | `<from Step 1.2>` | Production, Preview, Development |
| `NEXTAUTH_SECRET` | `<from Step 2.1>` | Production, Preview, Development |
| `NEXTAUTH_URL` | `https://your-app.vercel.app` | Production only |

**Notes:**
- `NEXTAUTH_URL` is automatically set by Vercel for preview deployments
- For local development, set `NEXTAUTH_URL=http://localhost:3000` in `.env.local`

### 2.3 Redeploy

After adding environment variables:
1. Go to **Deployments** tab
2. Click the three dots on the latest deployment
3. Select **Redeploy**

---

## Step 3: Test the Authentication

### 3.1 Test Login Flow

1. Visit your app URL
2. You should be redirected to Microsoft login
3. Sign in with your organization account
4. After successful login, you should see the app

### 3.2 Test Organization Restriction

If configured as single-tenant:
1. Try signing in with a personal Microsoft account (outlook.com, hotmail.com)
2. You should see an error: "You cannot access this application"

### 3.3 Test API Protection

With browser developer tools:
1. Sign out of the app
2. Try accessing an API endpoint directly: `https://your-app.vercel.app/api/user-profiles`
3. Should return: `{"error":"Authentication required"}`

---

## Step 4: Kill Switch Usage

The `AUTH_REQUIRED` environment variable acts as a kill switch. If you get locked out:

### Disabling Authentication (Emergency Access)

1. Go to Vercel Dashboard → Project → **Settings** → **Environment Variables**
2. Find `AUTH_REQUIRED`
3. Change value from `true` to `false`
4. Click **Save**
5. Go to **Deployments** → Redeploy the latest deployment
6. Wait ~30 seconds for deployment to complete
7. Access the app without authentication

### Re-enabling Authentication

1. Fix any issues with Azure AD configuration
2. Change `AUTH_REQUIRED` back to `true`
3. Redeploy

---

## Local Development

### Option A: With Authentication

Create `.env.local` in your project root:
```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<your-secret>
AZURE_AD_CLIENT_ID=<your-client-id>
AZURE_AD_CLIENT_SECRET=<your-client-secret>
AZURE_AD_TENANT_ID=<your-tenant-id>
AUTH_REQUIRED=true
```

### Option B: Without Authentication (Development Only)

For local development without Azure AD:
```env
AUTH_REQUIRED=false
```

This allows you to develop without setting up Azure credentials locally.

---

## Troubleshooting

### "AADSTS50011: The reply URL specified in the request does not match"

**Cause:** The redirect URI in Azure doesn't match your app URL.

**Fix:**
1. Go to Azure Portal → App Registration → Authentication
2. Add the exact URL shown in the error message to Redirect URIs

### "AADSTS700016: Application not found in the directory"

**Cause:** Wrong tenant ID or the app registration was deleted.

**Fix:** Verify `AZURE_AD_TENANT_ID` matches your organization's tenant.

### "AADSTS50020: User account from external identity provider does not exist in tenant"

**Cause:** User is trying to sign in with an account outside your organization (e.g., personal Microsoft account).

**Fix:** This is expected behavior for single-tenant apps. Only organization accounts can sign in.

### Users Can't Access After Login

**Cause:** Session or JWT issues.

**Fix:**
1. Verify `NEXTAUTH_SECRET` is set and consistent across deployments
2. Clear browser cookies for your app domain
3. Try incognito/private browsing

### Locked Out Completely

**Fix:** Use the kill switch:
1. Set `AUTH_REQUIRED=false` in Vercel
2. Redeploy
3. Debug the issue
4. Re-enable when fixed

---

## Security Considerations

### Single Tenant vs Multi-Tenant

- **Single tenant** (recommended): Only your organization's users can sign in
- **Multi-tenant**: Any Microsoft account can sign in (not recommended for internal apps)

Verify your app registration is single-tenant in Azure Portal → App Registration → Authentication → Supported account types.

### Client Secret Rotation

Azure AD client secrets expire. Set a calendar reminder to rotate before expiration:
1. Create a new secret in Azure Portal
2. Update `AZURE_AD_CLIENT_SECRET` in Vercel
3. Redeploy
4. Delete the old secret in Azure Portal

### Monitoring Sign-ins

View sign-in logs in Azure Portal:
1. Azure Active Directory → Sign-in logs
2. Filter by Application = your app name

---

## Architecture Reference

### Protected Resources

| Resource | Protection Method |
|----------|-------------------|
| All pages | `RequireAuth` wrapper in `_app.js` |
| API routes | `requireAuth()` in each handler |
| Auth routes (`/api/auth/*`) | Public (required for OAuth flow) |

### Key Files

| File | Purpose |
|------|---------|
| `pages/_app.js` | Global auth wrapper |
| `lib/utils/auth.js` | Server-side auth utilities |
| `pages/api/auth/[...nextauth].js` | NextAuth configuration |
| `pages/api/auth/status.js` | Auth status endpoint (checks kill switch) |
| `shared/components/RequireAuth.js` | Client-side auth guard |

---

## Support

For issues with:
- **Azure AD configuration:** Contact your IT department
- **App-specific issues:** Check the troubleshooting section above
- **Vercel deployment:** See [Vercel Documentation](https://vercel.com/docs)
