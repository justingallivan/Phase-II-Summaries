# Security Review Response: WMK Research Review App Suite

**Prepared by:** Claude (AI development assistant), working with Justin Gallivan
**Date:** March 6, 2026
**Re:** Azure AD app registration security concerns
**App Registration:** WMK: Research Review App Suite (`d2e73696-537a-483b-bb63-4a4de6aa5d45`)

---

## Overview

This document responds to IT's concerns about the Azure AD app registration for the Research Review App Suite, specifically regarding:

1. Application-level permissions (the screenshot showing broad API permissions)
2. Bearer token lifetime, storage, and revocation
3. Audit logging and user-vs-app attribution
4. Conditional access policy requirements

We'll address each concern, explain the architecture, and propose scoped alternatives where the current permission requests are broader than necessary.

---

## 1. Application Permission Scope

### What We Originally Requested

We requested three Microsoft Graph **application permissions**:

| Permission | Scope | Purpose |
|------------|-------|---------|
| `Sites.Read.All` | All SharePoint sites | Read documents attached to CRM grant requests |
| `Files.Read.All` | All files in all sites | Download those documents |
| `Mail.Send` | Send as any user | Future: send reviewer invitation emails |

These are legitimately broad, and the concern is warranted.

### What We Actually Need

**SharePoint access** is limited to a single site: `appriver3651007194.sharepoint.com/sites/akoyaGO`. The app reads documents that are linked to Dynamics CRM grant request records — proposal PDFs, budget documents, etc. It does not need access to any other SharePoint site.

**Email sending** is handled through Dynamics CRM email activities, not Microsoft Graph. The Dynamics approach creates tracked CRM activity records (better for audit purposes anyway). We do not need `Mail.Send` at all.

### Proposed Narrower Permissions

| Instead of | Use | What Changes |
|------------|-----|--------------|
| `Sites.Read.All` + `Files.Read.All` | `Sites.Selected` | Admin authorizes the app for only the akoyaGO site. Our code is unchanged. |
| `Mail.Send` | *(remove entirely)* | Email is handled via Dynamics CRM activities, not Graph. No Graph email permission needed. |

**`Sites.Selected`** is a Graph application permission that grants zero access by default. An admin then explicitly authorizes specific sites via a one-time Graph API call:

```http
POST /sites/{siteId}/permissions
{
  "roles": ["read"],
  "grantedToIdentities": [{
    "application": {
      "id": "d2e73696-537a-483b-bb63-4a4de6aa5d45"
    }
  }]
}
```

This limits the app to reading documents from the akoyaGO SharePoint site only, with no access to any other site in the tenant. Our application code requires zero changes — the same Graph API calls work identically once the site-specific grant is in place.

If the `Sites.Selected` approach is acceptable, we can provide the exact site ID and walk through the authorization step together.

---

## 2. Token Architecture

The app uses **two completely independent authentication flows** that serve different purposes and should be evaluated separately.

### Flow A: User Single Sign-On (Delegated, Low Risk)

This is the standard Azure AD login flow that authenticates staff members.

| Attribute | Detail |
|-----------|--------|
| **Flow type** | OAuth 2.0 Authorization Code (via NextAuth.js library) |
| **Scopes requested** | `openid`, `email`, `profile`, `User.Read` — minimal, delegated |
| **Token type** | JWT session token |
| **Storage** | HTTP-only, encrypted cookie set by NextAuth.js. Not accessible to JavaScript. Not stored in our database. |
| **Lifetime** | 7-day maximum session age (configurable in our code) |
| **Refresh** | NextAuth handles JWT rotation internally within the session window |
| **Revocation** | See "Session Revocation" below |
| **What it grants** | Identity verification only. This flow does NOT grant access to SharePoint, Dynamics, or any other Microsoft API. |

**Session revocation:** Every API request checks the user's `is_active` flag in our database (with a 2-minute in-memory cache for performance). Setting a user to inactive immediately blocks all their API access within 2 minutes, without requiring Azure AD token revocation. Disabled accounts are blocked before any superuser bypass logic runs — there is no way around it.

**No access/refresh tokens stored:** We do not store Azure AD access tokens or refresh tokens in our database, cookies, or anywhere else. The only thing stored in the session cookie is a JWT containing the user's identity claims (name, email, internal profile ID). The cookie is encrypted with `NEXTAUTH_SECRET` and is HTTP-only.

### Flow B: Server-to-Server Service Tokens (Client Credentials)

This is the flow that would use the Graph/Dynamics permissions. It runs entirely server-side with no user interaction.

| Attribute | Detail |
|-----------|--------|
| **Flow type** | OAuth 2.0 Client Credentials Grant |
| **Client identity** | App registration client ID + client secret |
| **Token storage** | In-memory only, within the Node.js serverless function instance |
| **Lifetime** | Tokens issued by Azure AD (typically ~1 hour). We refresh 60 seconds before expiry. |
| **Persistence** | None. Vercel serverless functions are stateless — the in-memory token cache exists only for the lifetime of a function instance, then is discarded. There is no disk, no persistent memory, no shared state between instances. |
| **Revocation** | Rotating the client secret in Azure AD immediately invalidates all new token requests. Existing tokens expire naturally within ~1 hour. |
| **Access gating** | Every server-to-server call is triggered by a user action that first passes through Flow A authentication. An unauthenticated user cannot trigger any Dynamics or Graph API call. |

**Key point:** The client secret is stored in Azure Key Vault (as you noted) and in Vercel's encrypted environment variables. It is never sent to the browser or exposed in client-side code.

### Token Flow Diagram

```
┌─────────────┐     HTTPS      ┌──────────────────────┐
│   Browser    │ ◄────────────► │  Vercel Serverless   │
│             │  Session cookie │  Function            │
│  (no tokens │  (encrypted,   │                      │
│   stored)   │   HTTP-only)   │  ┌────────────────┐  │
│             │                │  │ Flow A: User   │  │
└─────────────┘                │  │ session check  │  │
                               │  └───────┬────────┘  │
                               │          │ verified   │
                               │  ┌───────▼────────┐  │
                               │  │ Flow B: Client │  │
                               │  │ credentials    │──┼──► Dynamics / Graph API
                               │  │ (in-memory     │  │
                               │  │  token only)   │  │
                               │  └────────────────┘  │
                               │                      │
                               │  Token discarded     │
                               │  when function       │
                               │  instance recycles   │
                               └──────────────────────┘
```

---

## 3. Audit Logging

### The Concern

With client credentials flow, Azure AD audit logs and Dynamics audit logs show the **app identity** as the actor, not the individual user. This makes it difficult to determine which staff member initiated a given action from Azure's perspective.

### What We Log Today

Our application maintains its own audit trail in a PostgreSQL database (Vercel Postgres / Neon). Two tables capture all activity:

**`api_usage_log`** — every AI API call across all 14 applications:

| Field | Content |
|-------|---------|
| `user_profile_id` | Which staff member made the request |
| `app_name` | Which application (e.g., "dynamics-explorer", "reviewer-finder") |
| `model` | AI model used |
| `input_tokens` / `output_tokens` | Token consumption |
| `estimated_cost_cents` | Cost estimate |
| `latency_ms` | Response time |
| `request_status` | success / error / rate_limited |
| `created_at` | Timestamp |

**`dynamics_query_log`** — every CRM query made through the Dynamics Explorer:

| Field | Content |
|-------|---------|
| `user_profile_id` | Which staff member initiated the query |
| `session_id` | Conversation session identifier |
| `query_type` | Type of CRM operation (e.g., "fetch", "search") |
| `table_name` | Which CRM table was queried |
| `query_params` | Full OData query parameters (JSON) |
| `record_count` | Number of records returned |
| `execution_time_ms` | Query duration |
| `was_denied` | Whether the query was blocked by access restrictions |
| `denial_reason` | Why it was blocked (if applicable) |
| `created_at` | Timestamp |

Both tables are indexed by user and timestamp, retained for 365 days (configurable), and cleaned up by a daily maintenance job.

### Proposed Solution: Read-Only Audit Access for IT

To address the audit concern without the complexity of switching to on-behalf-of flow, we propose giving IT direct read-only access to these audit logs. There are several options, in order of our preference:

**Option A: Periodic Audit Export (Simplest)**

We build a scheduled job that exports audit logs to a location IT can access — either a shared SharePoint folder, an Azure Blob Storage container, or email delivery. The export would include:

- All Dynamics CRM queries with user attribution, query details, and timestamps
- All API usage with user, application, and cost data
- Denial/violation events flagged separately

This could run daily or weekly, producing CSV or JSON files that IT can ingest into their SIEM or review tooling.

**Option B: Read-Only API Endpoint**

We expose a new authenticated API endpoint (e.g., `/api/audit/export`) that IT can query programmatically with date range and user filters. This would return the same data as Option A but on-demand. We'd authenticate this with a dedicated API key or service account rather than requiring Azure AD SSO.

**Option C: Direct Database Read Replica**

Vercel Postgres (backed by Neon) supports read replicas. We could provision a read-only connection string scoped to the audit tables and share it with IT for direct SQL access. This gives maximum flexibility for ad-hoc queries but requires IT to write SQL.

### Why Not On-Behalf-Of Flow?

Switching to OBO flow would give per-user attribution in Azure's native audit logs, but the tradeoffs are significant:

| Consideration | Client Credentials (current) | On-Behalf-Of |
|---------------|------------------------------|--------------|
| Code complexity | Low — single shared token | High — per-user token management, refresh handling |
| Failure modes | Simple — one token to refresh | Complex — user token expiry, refresh failures, consent revocation |
| User experience | Seamless | Users may see consent prompts; expired tokens cause mid-session failures |
| Licensing impact | Only the app needs Dynamics access | Each user needs appropriate Dynamics permissions *(your 16 staff members already have Read-Write licenses, so this is not a blocker, but it is an ongoing dependency)* |
| Audit trail | Application-level in our DB (with full user attribution) | Per-user in Azure AD + Dynamics native logs |
| Development effort | Already implemented | Estimated 2–3 weeks of rework across authentication, service layer, and API routes |

We believe the audit export approach (Option A or B) provides equivalent visibility at a fraction of the complexity. We're happy to discuss further if native Azure audit attribution is a hard requirement.

---

## 4. Conditional Access Policies

We understand that conditional access policies require appropriate Azure AD licensing (Azure AD P1 or P2) and that this is being addressed on the licensing side. From our application's perspective:

- Our app does not bypass or interfere with conditional access policies
- User authentication flows through standard Azure AD endpoints and will respect whatever conditional access policies are configured
- The client credentials flow (server-to-server) is typically excluded from user-facing conditional access policies, as it authenticates the application identity rather than a user. If policies need to restrict where the app can authenticate from, Azure AD supports [workload identity conditional access](https://learn.microsoft.com/en-us/entra/identity/conditional-access/workload-identity) for this purpose.

We're ready to test against whatever conditional access configuration is applied.

---

## 5. Optional Token Claims

We do not currently request optional token claims. The only claims we use from the Azure AD ID token are:

| Claim | Purpose |
|-------|---------|
| `oid` (object ID) | Unique identifier to match the Azure AD user to our internal profile |
| `email` | User's email address for display and profile auto-linking |
| `name` | Display name |

These are all standard claims included in the default `openid email profile` scope. We do not request or process any additional claims (group memberships, roles, custom claims, etc.).

If there are specific claims IT would like us to request or validate (e.g., group membership for access control), we can implement that.

---

## Summary of Proposed Changes

| Original Request | Proposed Change | Rationale |
|-----------------|-----------------|-----------|
| `Sites.Read.All` + `Files.Read.All` | `Sites.Selected` (scoped to akoyaGO site only) | Least-privilege; app only needs one SharePoint site |
| `Mail.Send` | Remove entirely | Email handled via Dynamics CRM activities, not Graph |
| No audit sharing | Periodic audit export to IT-accessible location | Full user attribution without OBO rework |

### What We Still Need from Admins

1. **Azure AD Admin:** Grant `Sites.Selected` (application permission) on "WMK: Research Review App Suite", grant admin consent, then authorize the app for the akoyaGO SharePoint site via Graph API
2. **Dynamics Admin:** Assign "Email Sender" security role to the app's application user in Dynamics 365 (for CRM-tracked email activities — this is a Dynamics-scoped permission, not a tenant-wide Graph permission)

We're happy to walk through either of these steps together or provide more detailed instructions.

---

## Questions for IT

1. Is `Sites.Selected` (scoped to a single site) acceptable for the SharePoint access requirement?
2. For audit log sharing, which delivery mechanism works best for your team — scheduled export (Option A), API endpoint (Option B), or direct database access (Option C)?
3. Are there specific conditional access policies you'd like us to test against once licensing is resolved?
4. Are there additional token claims you'd like us to request or validate?
