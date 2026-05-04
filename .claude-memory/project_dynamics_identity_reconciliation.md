---
name: Dynamics Identity Reconciliation
description: SHIPPED — user_profiles ↔ systemuser bridge + MSCRMCallerID write attribution on user-driven endpoints (S127–S128). Adapter chain intentionally deferred.
type: project
originSessionId: 62437821-a516-465d-9fe9-ccd2fa785705
---
**Status (2026-05-04, post Session 128):** Plan complete except adapter chain.

**Shipped Session 127:**
- V27 migration: `user_profiles.dynamics_systemuser_id` (UUID) + `dynamics_reconciled_at` (TIMESTAMP) + index. Applied to prod 2026-05-03.
- `lib/services/dynamics-identity-service.js`: `reconcileProfile` / `reconcileBatch`.
- `scripts/reconcile-dynamics-identities.js`: CLI; `--all`, `--stale N`, `--profile N`.
- NextAuth signIn callback fires `reconcileProfile` (silent) on first profile insert.
- Weekly cron `pages/api/cron/reconcile-identities.js` (Mondays 7:00 UTC). Manual admin trigger + `/admin` UI.
- 7 active prod profiles linked.

**Shipped Session 128 (Step 5 — MSCRMCallerID impersonation, with safety net):**
- All write helpers in `lib/services/dynamics-service.js` accept `actingUserSystemId`. When set AND env `DYNAMICS_IMPERSONATION_ENABLED=true`, sends `MSCRMCallerID: {guid}`. Reads never carry the header.
- **Privilege-intersection safety:** Dataverse evaluates impersonated writes under the intersection of app-user + staff privileges, so a staff role missing one Dynamics privilege would 403. Two safety mechanisms:
  - Env-var flag `DYNAMICS_IMPERSONATION_ENABLED` (default off) makes `_withCallerId` a no-op for ship-now-flip-later rollout.
  - `_writeFetch` retries once without the header on 403 and logs a warning, so a partially-privileged staff user falls back to service-principal attribution rather than failing the request.
- NextAuth jwt + session callbacks load `dynamics_systemuser_id` → `session.user.dynamicsSystemuserId`.
- Wired through user-driven API endpoints: `phase-i-dynamics/summarize`, `phase-i-dynamics/summarize-v2`, `grant-reporting/extract`, `review-manager/send-emails`, `review-manager/mark-received-no-file`, `review-manager/upload-review`, `test-email`. Executor (`lib/services/execute-prompt.js`) accepts the kwarg and threads to its two write sites.
- Intentionally null (unattended): cron, external-token endpoints, `lib/external/token-lifecycle.js`, all PA-triggered paths.
- Test coverage: `tests/unit/dynamics-service-caller-id.test.js` (13 cases) verifies direct + composed helpers, flag on/off, 403 fallback, and that reads stay clean.

**Rollout (still TODO):** flip `DYNAMICS_IMPERSONATION_ENABLED=true` in preview → smoke-test phase-i-dynamics writeback + a Review Manager email send with a non-superuser staff Dynamics account → watch logs for `[DynamicsService] Impersonated write rejected` warnings → decide per-table (add privilege to role vs. accept service-principal attribution) → promote to production. Procedure documented in `docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md` § Step 5.

**Deliberately deferred — adapter chain (Wave 2 candidate):**
- `lib/dataverse/adapters/{contact,potential-reviewer,researcher,reviewer-suggestion}.js` and `lib/external/token-lifecycle.js` still write as the service principal.
- Affected user-driven flows that are partially attributed today: send-emails (email activity = staff; contact promotion + lifecycle PATCH = service principal), reviewer-finder save-candidates, regenerate/revoke token.
- Reasoning: ~12 internal call sites would need adapter signature changes; scope-cap chosen rather than touching everything in one pass. Wiring is mechanical when picked up.

**How to apply going forward:**
- New session-bound writes: `actingUserSystemId: access.session?.user?.dynamicsSystemuserId || null` and pass to the write helper. Unattended (cron / token-auth / PA) leaves it null.
- When touching an adapter, thread `actingUserSystemId` through its public function — don't add it speculatively to all of them at once.
