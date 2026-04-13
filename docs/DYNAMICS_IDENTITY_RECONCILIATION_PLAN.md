# Dynamics Identity Reconciliation Plan

**Status:** TODO — scoped, not yet scheduled
**Owner:** Justin (app side), Connor (Dynamics side, minor)
**Last updated:** 2026-04-13

## Problem

The Vercel apps and Dynamics run two parallel identity systems that never meet:

| System | User identifier |
|--------|----------------|
| Vercel apps | `user_profiles.id`, Azure AD `oid`, `azure_email` |
| Dynamics | `systemuser.systemuserid` (GUID), `internalemailaddress` |

Until they are joined, the apps cannot:
- Write records to Dynamics as the acting staff member (writes show as the service principal).
- Cross-reference app usage with Dynamics activity for reporting.
- Dynamically resolve staff (e.g. PD lookup) without hardcoded GUIDs in prompts or PowerAutomate flows.

All 16 licensed staff use `@wmkeck.org` emails that match `internalemailaddress` on `systemuser`, so the mapping is deterministic — we just need to store it.

## What it unlocks

1. **Writes attributed to the right person.** Sending the `MSCRMCallerID` header with the impersonated systemuserid causes Dynamics to record the acting staff member on `modifiedby`, `createdby`, and audit history.
2. **Unified reporting.** Admin dashboard usage stats, expertise matches, panel reviews, etc. can join cleanly with Dynamics records.
3. **Dynamic PD lookup.** If PD expertise is stored on `systemuser` records (see "Dependency on Connor" below), the PowerAutomate flow can query active PDs with their expertise descriptions at runtime instead of hardcoding GUIDs. Eliminates silent drift when staff join or leave.

## Implementation

### 1. Schema change — migration V26

Add to `scripts/setup-database.js`:

```sql
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS dynamics_systemuser_id UUID,
  ADD COLUMN IF NOT EXISTS dynamics_reconciled_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_user_profiles_dynamics_systemuser_id
  ON user_profiles(dynamics_systemuser_id);
```

Nullable — profiles for external/test users without a Dynamics account stay null.

### 2. Resolver script — `scripts/reconcile-dynamics-identities.js`

For each `user_profiles` row with non-null `azure_email`:

```
GET {DYNAMICS_URL}/api/data/v9.2/systemusers
  ?$filter=internalemailaddress eq '{azure_email}'
  &$select=systemuserid,fullname,isdisabled
```

- Match found → write `dynamics_systemuser_id` + `dynamics_reconciled_at = NOW()`.
- No match → log, leave null, continue.
- Disabled user (`isdisabled = true`) → log, leave null (they lost their Dynamics license).

Run once manually to backfill existing profiles. Requires only read access, which the current app registration already has.

### 3. Resolve on user creation

In the NextAuth sign-in callback (or wherever the first-login profile insert happens), call the resolver once for the new user and set `dynamics_systemuser_id` before the welcome modal. Adds ~200ms to first login; silent if lookup fails.

### 4. Weekly maintenance cron

New entry in `pages/api/cron/reconcile-identities.js`:
- Re-run the resolver for profiles where `dynamics_reconciled_at` is older than 30 days OR `dynamics_systemuser_id IS NULL AND azure_email IS NOT NULL`.
- Catches staff who get their Dynamics account after their first app login.
- Authenticated via existing `CRON_SECRET` / `requireCron`.
- Schedule: weekly, `0 7 * * 1` (Mondays 7am UTC).

Add a "Reconcile now" button in the admin app that calls the same endpoint on demand.

### 5. Impersonation on writes

Update the Dynamics write helper (new, doesn't exist yet — gate for the work that follows Connor's write-permission grant) to accept an `actingUserSystemId` argument:

```js
await dynamicsService.updateRequest(requestId, fields, {
  actingUserSystemId: session.user.dynamics_systemuser_id,
});
```

Internally adds the header:
```
MSCRMCallerID: {systemuserid}
```

PowerAutomate-triggered writes don't set this — they're unattended, so `modifiedby` correctly reads "System" / the app registration.

### 6. Admin dashboard visibility

Add one line to `/admin` user management: each row shows "Dynamics: ✓ linked" or "Dynamics: not linked (last checked: {date})". Helps spot reconciliation failures without tailing logs.

## Dependency on Connor

**For (1)–(4):** none. Read access is already granted.

**For (5):** requires the write permission grant we're already waiting on. Impersonation header works with any write-capable security role.

**For (3) to fully replace hardcoded PD prompts:** Connor would need to add a custom field to `systemuser` for PD expertise description. Out of scope for this plan — this plan only builds the identity bridge; dynamic PD lookup is a separate follow-up that depends on it.

## Out of scope

- **Two-way sync.** We're one-directional: Azure AD / app profile → find the Dynamics systemuser. If a staff person's email changes on one side, we re-run the resolver; we don't try to keep Dynamics in sync with our DB or vice versa.
- **Non-staff profiles.** Reviewers, external collaborators, etc. don't live in Dynamics as systemusers. Nothing to reconcile.
- **Historical backfill of existing records.** Things already written by the service principal stay as-is; this only affects writes going forward.

## Effort

~½ day of focused work once Justin picks it up:
- Migration + index: 15 min
- Resolver script: 1 h (mostly error handling for the three cases above)
- NextAuth hook: 30 min
- Cron endpoint: 30 min
- Admin dashboard line: 30 min
- Tests + manual verification against real profile: 1 h
- Impersonation helper (Step 5): 45 min, deferred until write permissions land

## References

- `user_profiles` schema — `scripts/setup-database.js` V10 (line ~249)
- Memory: **Dynamics CRM Users** — 16 licensed staff, all `@wmkeck.org`
- [`lib/services/dynamics-service.js`](../lib/services/dynamics-service.js) — where the impersonation header will plug in
- [BACKEND_AUTOMATION_PLAN.md](./BACKEND_AUTOMATION_PLAN.md) — context for why attribution matters
- [DYNAMICS_AI_FIELDS_SPEC.md](./DYNAMICS_AI_FIELDS_SPEC.md) — point 7 (PD prompt drift) motivated this
