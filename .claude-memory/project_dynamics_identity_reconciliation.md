---
name: Dynamics Identity Reconciliation
description: SHIPPED 2026-05-03 (Session 127) — user_profiles ↔ systemuser bridge persisted in DB. Step 5 (MSCRMCallerID impersonation on writes) still deferred.
type: project
originSessionId: 62437821-a516-465d-9fe9-ccd2fa785705
---
**Status (2026-05-03):** Steps 1–4 + 6 of `docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md` shipped in commit `76c6a21`. Step 5 (impersonation header on writes) deliberately deferred — separate PR/session.

**What landed:**
- V27 migration: `user_profiles.dynamics_systemuser_id` (UUID) + `dynamics_reconciled_at` (TIMESTAMP) + index. Applied to prod 2026-05-03.
- `lib/services/dynamics-identity-service.js`: `reconcileProfile` / `reconcileBatch` with discriminated results.
- `scripts/reconcile-dynamics-identities.js`: CLI; supports `--all`, `--stale N`, `--profile N`.
- NextAuth signIn callback fires `reconcileProfile` (silent) on first profile insert.
- `pages/api/cron/reconcile-identities.js` + `vercel.json` schedule `0 7 * * 1` (Mondays 7:00 UTC).
- `pages/api/admin/reconcile-identities.js` (superuser-gated manual trigger) + `/admin` "Dynamics Identity Linkage" section.
- All 7 active prod profiles linked to their systemuserids via the backfill. Other licensed staff auto-link on next login or via the cron.

**What's still TODO (Step 5 — write attribution):**
- Add `actingUserSystemId` arg to Dynamics write helpers (`MSCRMCallerID` header).
- Cross-cutting change to existing write paths in `dynamics-service.js` — needs a careful audit of every caller before flipping any of them, since the service principal currently shows up in `modifiedby` and that's the working baseline.
- Unblocks: writes attributed to acting staff, dynamic PD lookup in PowerAutomate flows.

**How to apply going forward:**
- New code that does Dynamics writes from a session context should plumb `session.user.profileId` → look up `dynamics_systemuser_id` → pass to the write helper as `actingUserSystemId`. PowerAutomate-triggered writes leave it null (intentional — they're unattended).
- Don't write directly from this entry — full plan is `docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md` step 5.
