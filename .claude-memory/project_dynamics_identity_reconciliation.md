---
name: Dynamics Identity Reconciliation
description: TODO — bridge Vercel user_profiles to Dynamics systemusers via email match so writes can be attributed, reporting can be joined, and PD lookups can be dynamic
type: project
originSessionId: 62437821-a516-465d-9fe9-ccd2fa785705
---
TODO — bridge `user_profiles` (Vercel) to `systemuser` (Dynamics) via email match.

**Why:** Today the two identity systems never meet. Writes from Vercel apps appear as the service principal, cross-system reporting can't join cleanly, and PowerAutomate has to hardcode PD GUIDs. All 16 licensed staff use `@wmkeck.org` emails that match `internalemailaddress` on `systemuser`, so the mapping is deterministic — just not stored anywhere. Surfaced during Connor's review of `DYNAMICS_AI_FIELDS_SPEC.md` (point 7, PD prompt drift).

**How to apply:**
- Full scope doc: [`docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md`](../../Programming/Phase-II-Summaries/docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md)
- Implementation is ~½ day; steps 1–4 (schema + resolver + sign-in hook + weekly cron) need no new permissions. Step 5 (impersonation header on writes) needs the pending Dynamics write-permission grant.
- Migration target: V26 on `user_profiles` — add `dynamics_systemuser_id UUID` + `dynamics_reconciled_at TIMESTAMP`.
- Treat as blocker for: `MSCRMCallerID` attribution on writes, unified admin-dashboard/Dynamics reporting, any attempt to replace hardcoded PD lists in PowerAutomate flows with dynamic lookups.
- Not in scope: two-way sync, non-staff profiles, historical backfill of existing records.
