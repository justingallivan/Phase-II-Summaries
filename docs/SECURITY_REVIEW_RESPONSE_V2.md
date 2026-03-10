# Security Review Response V2: Addressing Reed's Analysis

**Prepared by:** Claude 
**Date:** March 9, 2026
**Re:** Response to Reed's security analysis of the Azure AD app registration
**App Registration:** WMK: Research Review App Suite (`d2e73696-537a-483b-bb63-4a4de6aa5d45`)

---

## Executive Summary

Reed's analysis is thorough and well-reasoned. However, its central conclusion — that the app acts as a "privilege broker" into Dynamics via delegated `user_impersonation` — is based on a factual misunderstanding of how our code actually authenticates to Microsoft APIs.

**The root cause of the misunderstanding:** Our current Azure AD setup uses a single app registration for both user SSO *and* the service principal. This puts delegated permissions (`User.Read`, `user_impersonation`) alongside application permissions on the same registration page. Reed saw the combined permission list and reasonably concluded the app brokers user privilege into Dynamics. It does not — but the registration makes it look like it does.

**The fix:** Split into two separate app registrations with clean, non-overlapping permission scopes. This eliminates the ambiguity at the architectural level and makes the security posture self-evident from the portal.

**What's independently valid:** Several of Reed's session management concerns stand on their own merits regardless of the auth flow question. We propose mitigations for those and want IT's input on the right parameters.

---

## 1. The Root Cause: One Shared App Registration

Today, the registration "WMK: Research Review App Suite" serves two unrelated purposes:

| Purpose | OAuth Flow | Permissions Used |
|---------|-----------|-----------------|
| **User SSO** (NextAuth.js login) | Authorization Code (delegated) | `openid email profile User.Read` |
| **Service principal** (Dynamics + Graph server calls) | Client Credentials (application) | Dynamics CRM, `Sites.Selected` |

Because both flows share one registration, the Azure portal shows all permissions together. Reed saw `user_impersonation` listed as a delegated permission and concluded the app uses it to act as signed-in users in Dynamics.

That's a reasonable reading of the portal — but it doesn't match what the code does.

---

## 2. What the Code Actually Does (With References)

### Dynamics: Client Credentials, Not Delegated

**`lib/services/dynamics-service.js` lines 89-93:**
```js
const body = new URLSearchParams({
  grant_type: 'client_credentials',
  client_id: DYNAMICS_CLIENT_ID,
  client_secret: DYNAMICS_CLIENT_SECRET,
  scope: `${DYNAMICS_URL}/.default`,
});
```

Every Dynamics API call uses `grant_type: 'client_credentials'`. The token represents the *application's service principal*, not any user. A Dynamics admin and a standard user trigger identical API calls — both run with the fixed privileges of the service principal, not the user's Dynamics role.

### SharePoint/Graph: Client Credentials, Not Delegated

**`lib/services/graph-service.js` lines 40-44:**
```js
const body = new URLSearchParams({
  grant_type: 'client_credentials',
  client_id: DYNAMICS_CLIENT_ID,
  client_secret: DYNAMICS_CLIENT_SECRET,
  scope: 'https://graph.microsoft.com/.default',
});
```

Same pattern — `client_credentials` grant. The resulting token carries only the *application permissions* granted to the service principal, not any user's SharePoint permissions.

### User SSO: Identity Only, No Microsoft API Tokens

**`pages/api/auth/[...nextauth].js` lines 28-29:**
```js
scope: 'openid email profile User.Read',
```

The SSO flow requests only identity scopes. No Dynamics scopes, no SharePoint scopes, no `user_impersonation`, no `offline_access`.

**What goes into the session cookie** (`[...nextauth].js` lines 145-173):

| JWT Claim | Source | Purpose |
|-----------|--------|---------|
| `azureId` | Azure AD `oid` | Match to internal profile |
| `azureEmail` | Azure AD email | Display + auto-linking |
| `profileId` | Our database | Internal user ID |
| `profileName` | Our database | Display name |
| `avatarColor` | Our database | UI personalization |
| `needsLinking` | Our database | First-login flow flag |

No Microsoft access token. No refresh token. No Dynamics token. The cookie is encrypted with `NEXTAUTH_SECRET` and is HTTP-only.

### What Does NOT Exist in the Codebase

A search of the entire codebase for `offline_access`, `user_impersonation`, and `refresh_token` returns **zero results**. These strings do not appear in any JavaScript file. The app never requests, stores, or uses them.

---

## 3. Why Reed's "Privilege Broker" Model Doesn't Apply

Reed's central argument is:

> "attacker steals session → attacker obtains delegated Dynamics token → attacker interacts directly with Microsoft APIs"

This threat chain requires the app to obtain delegated Dynamics tokens from the user's authentication context. Our app does not do this. Here's why each link in the chain breaks:

| Reed's Assumption | Actual Implementation |
|---|---|
| App uses delegated `user_impersonation` to get Dynamics tokens | App uses `client_credentials` grant — no user token involved |
| Session cookie unlocks delegated Microsoft API access | Session cookie contains identity claims only — no Microsoft tokens |
| User's Dynamics privilege flows through the app | Service principal has fixed privileges regardless of which user is logged in |
| Admin user session = admin Dynamics access | Admin user session = same service principal access as any other user |
| Blast radius scales with user privilege | Blast radius is fixed at service principal's permission set |

**A stolen session gives the attacker access to what the *application* can do (via its API endpoints and access controls), not what the *user* can do in Dynamics.** This is a fundamentally different — and smaller — blast radius than the delegated model Reed analyzed.

---

## 4. Proposed Fix: Split App Registrations

To eliminate the confusion permanently, we propose splitting into two registrations:

| Registration | Purpose | Permission Type | Permissions | Env Vars |
|---|---|---|---|---|
| **SSO App** | User login via NextAuth | Delegated only | `openid email profile User.Read` | `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID` |
| **Service Principal** | Dynamics + Graph server calls | Application only | Dynamics CRM, `Sites.Selected` | `DYNAMICS_CLIENT_ID`, `DYNAMICS_CLIENT_SECRET`, `DYNAMICS_TENANT_ID` |

This achieves several things:

1. **The SSO app has zero Dynamics/SharePoint permissions** — there is no path from user session to enterprise APIs, period.
2. **The service principal has zero delegated permissions** — no `user_impersonation`, no ambiguity about whether it acts as users.
3. **The portal tells the truth** — anyone reviewing either registration sees exactly what it does.
4. **Code change is trivial** — we already use separate env var prefixes (`AZURE_AD_*` vs `DYNAMICS_*`); they just happen to hold the same values today.

After the split, the concerns Reed raised about delegated privilege escalation, admin user amplification, and delegated token theft all become structurally impossible — not just "not implemented" but architecturally excluded.

---

## 5. Answering Every Question from Reed's Review

### Dynamics

> **Why does the application need delegated Dynamics `user_impersonation`?**

It doesn't. The `user_impersonation` permission is an artifact of both SSO and service principal sharing one registration. The app has never used it — all Dynamics calls use `client_credentials`. Splitting registrations removes it entirely.

> **Which exact endpoints or features require it?**

None. Every Dynamics API call (`dynamics-service.js`) uses the client credentials grant. No endpoint in the application requests or uses a delegated Dynamics token.

> **Can the application perform write, update, delete, or admin-like operations in Dynamics?**

Very limited. `createRecord()` and `updateRecord()` are stubbed — they throw errors immediately (`dynamics-service.js` lines 557-562). No `deleteRecord` method exists. The only write operations that work are CRM email activities (`createEmailActivity`, `sendEmail`), which create tracked email records — a standard CRM workflow action, not an administrative operation.

> **Can Dynamics administrators sign into this application?**

Yes, any user in the Azure AD tenant can authenticate. However, because the app uses client credentials (not delegated), an admin's Dynamics privileges do not flow through the application. An admin session has exactly the same Dynamics access as any other user session — the fixed capabilities of the service principal.

> **If so, why is that allowed?**

Because admin privilege escalation cannot occur in a client-credentials architecture. The service principal's permissions are the ceiling, regardless of who triggers the request.

> **Are there any privileged roles that should be explicitly blocked from using the app?**

Not needed given client credentials, but we're open to this discussion. If IT wants to restrict access to a specific Azure AD group, we can implement group-based filtering in the NextAuth callback.

### SharePoint

> **What SharePoint permission model will be used?**

`Sites.Selected` (application permission) — grants zero access by default. An admin then authorizes the service principal for only the akoyaGO site via a one-time Graph API call. This is the most restrictive SharePoint permission available.

> **Is access delegated per user or app-only?**

App-only (client credentials). See `graph-service.js` lines 40-44.

> **Is it scoped to one site with least privilege?**

Yes. `Sites.Selected` + site-specific authorization = access to akoyaGO only, read permission only.

> **Will the backend cache tokens or retrieve documents server-side?**

Tokens are cached in-memory only (within the serverless function instance). Vercel serverless functions are stateless — the cache exists only for the lifetime of a function instance, then is discarded. There is no disk, database, or shared cache. Documents are retrieved server-side, streamed to the AI model for processing, and not persisted.

> **What actions can the app perform against SharePoint?**

Read-only: list files in a folder, download file content. No write, upload, delete, grant, or index operations. The `Sites.Selected` permission with `read` role enforces this at the API level even if our code tried to write.

### Session and Token Handling

> **What exactly is in the session cookie?**

A JWT encrypted with `NEXTAUTH_SECRET`, containing: `azureId`, `azureEmail`, `profileId`, `profileName`, `avatarColor`, `needsLinking`, `isNewUser`. No Microsoft access tokens, refresh tokens, or API credentials. Full mapping in `[...nextauth].js` lines 145-190.

> **Are Microsoft refresh tokens ever issued?**

No. The SSO flow does not request `offline_access` (the scope required for refresh tokens). The string `refresh_token` does not appear anywhere in the codebase.

> **Are downstream access tokens stored in memory, cache, database, or session objects?**

In-memory only, within the serverless function instance. Not in the database, not in session objects, not accessible from the browser. These tokens belong to the *service principal* (client credentials), not to any user session — they are shared across all requests hitting the same function instance and discarded when the instance recycles.

> **What is the idle timeout?**

Currently: none. **We agree this should be added.** We're proposing 1-2 hours and would like IT's input on the right value given staff workflow patterns (some processes like batch proposal review can take extended periods).

> **What is the absolute timeout?**

Currently: 7 days (`[...nextauth].js` line 200). **We agree this is too long for this context.** We're proposing 8-24 hours and would like IT's preferred value.

> **How are old sessions invalidated on rotation?**

Currently: stateless JWT — old tokens remain valid until expiry. **We acknowledge this is a gap.** We're proposing a server-side session store as the path to immediate per-session invalidation (see Section 6).

> **Can one session be revoked immediately without disabling the user?**

Currently: no — only user-level revocation via `is_active` flag. **We acknowledge this is a gap.** A server-side session store would enable per-session revocation.

### Governance and Control

> **Are Conditional Access policies applied?**

The app authenticates through standard Azure AD endpoints and respects whatever Conditional Access policies are configured. We're ready to test against any policy configuration IT applies.

> **Is MFA required?**

MFA is an Azure AD tenant policy decision. Our app does not bypass or interfere with MFA. If the tenant requires MFA for the app, users will be prompted.

> **Are managed devices required for privileged access?**

This is an Azure AD Conditional Access policy decision. If configured, our app will respect it.

> **Is step-up authentication required before sensitive actions?**

Not currently implemented. We're open to discussing which operations (if any) warrant step-up auth. Given that the app uses client credentials (fixed privilege, not user-escalated), the set of "sensitive actions" is narrower than in a delegated model — but we welcome IT's perspective.

> **Are anomalous concurrent sessions detected?**

Not currently implemented. This is feasible if we move to a server-side session store (which we're proposing). We'd appreciate guidance on what detection patterns IT considers important.

> **Are privileged actions logged and reviewed?**

Yes. Two audit tables with full user attribution:
- **`api_usage_log`** — every AI API call across all 14 applications (user, app, model, tokens, cost, latency, status)
- **`dynamics_query_log`** — every CRM query (user, session, table, query params, record count, execution time, was_denied, denial_reason)

Both are indexed by user and timestamp, retained for 365 days. We've previously offered IT read access via periodic export, API endpoint, or database read replica.

---

## 6. Proposed Mitigations for Valid Concerns

Reed's session management concerns are independently valid regardless of the auth flow question. We agree these are worth addressing and want IT's input on the right parameters.

### Split App Registrations
**Status:** Ready to implement on our side once IT creates the SSO registration.
**Effect:** Eliminates `user_impersonation` from the architecture entirely. Makes the security posture self-evident from the Azure portal.

### Shorten Session Lifetime
**Current:** 7-day maximum.
**Proposed:** 8-24 hour absolute timeout.
**Question for IT:** What value fits your security posture? Shorter is more secure but creates more frequent re-authentication friction for staff.

### Add Idle Timeout
**Current:** None.
**Proposed:** 1-2 hour idle timeout.
**Question for IT:** Some staff workflows (batch proposal review, extended research sessions) can run 60+ minutes. What idle window balances security with workflow?

### Server-Side Session Store
**Current:** Stateless JWT — no per-session revocation.
**Proposed:** Move to a server-side session store (database-backed) to enable:
- Immediate per-session revocation
- Immediate all-sessions-for-user revocation
- Concurrent session detection
- Replay resistance
**Question for IT:** Given that our app uses client credentials (stolen sessions can't escalate to user's Dynamics privileges), is this warranted now, or is it lower priority than the other items?

### Trust Chain Documentation
**Status:** Will update `SECURITY_ARCHITECTURE.md` to explicitly document the full trust chain from browser session through service principal to Dynamics/SharePoint, addressing the analytical gap Reed identified.

---

## 7. Action Items

### Our Side

| Item | Description | Status |
|------|-------------|--------|
| Split env vars | Point `AZURE_AD_*` at new SSO registration, keep `DYNAMICS_*` on service principal | Ready when IT creates SSO app |
| Shorten session maxAge | Reduce from 7 days to agreed-upon value | Awaiting IT input on value |
| Add idle timeout | Implement inactivity-based session expiry | Awaiting IT input on value |
| Update documentation | Revise SECURITY_ARCHITECTURE.md with full trust chain | Will do alongside implementation |

### IT Side

| Item | Description |
|------|-------------|
| Create SSO app registration | Delegated only: `openid email profile User.Read`. Zero Dynamics/SharePoint permissions. |
| Clean up service principal | Remove `user_impersonation` and other delegated permissions (or they go away naturally with split) |
| Grant `Sites.Selected` | Application permission on the service principal, then authorize for akoyaGO site via Graph API |
| Assign email role | "Email Sender" security role for the service principal's application user in Dynamics |
| Apply Conditional Access | Configure policies as desired — we'll test against them |

---

## 8. Summary

Reed's review was rigorous and asked the right questions. The conclusions were wrong only because the portal presented misleading information — a direct consequence of our architectural shortcut of sharing one registration.

The split-registration proposal doesn't just fix the cosmetics. It makes the security properties structurally enforced:

- **SSO app:** Cannot access Dynamics or SharePoint. Period.
- **Service principal:** Cannot impersonate users. Period.
- **Stolen session:** Gives access to the app's own endpoints and the service principal's fixed permissions — not the user's enterprise privileges.

