# Connor request — grant Delegate role to Research Review App Suite

**Status:** Drafted 2026-05-05 (Session 132). Sent: _pending_.
**Blocks:** `DYNAMICS_IMPERSONATION_ENABLED=true` rollout to production. Preview is flipped and smoke-tested — only this Delegate-role grant is missing.
**Effort for Connor:** ~2 min in Power Platform admin or the Dynamics web client.

---

## Email body

> **Subject:** Quick Dataverse admin task — grant Delegate role to Research Review App Suite
>
> Hi Connor,
>
> Need your hands on a 2-minute Dataverse admin task. The Research Review App Suite needs to start attributing user-driven writes back to the actual staff member who triggered them (instead of the service principal). The code's been ready for a couple weeks — today I smoke-tested it in preview and confirmed the only thing left blocking us is one missing privilege on the application user.
>
> Can you grant the **Delegate** security role to the application user `# WMK: Research Review App Suite`?
>
> Click path:
>
> &nbsp;&nbsp;Power Platform admin center → Environments → wmkf
> &nbsp;&nbsp;→ Settings → Users + permissions → Application users
> &nbsp;&nbsp;→ open `# WMK: Research Review App Suite`
> &nbsp;&nbsp;→ Manage security roles → check **Delegate** → Save
>
> Or in the Dynamics web client: Advanced Settings → Security → Users → switch the view to "Application Users" → open that user → MANAGE ROLES → Delegate → OK.
>
> Why: the Delegate role carries the platform privilege `prvActOnBehalfOfAnotherUser`, which is what lets the app pass `MSCRMCallerID` on writes. Without it, every impersonated write 403s — confirmed today by direct API probe and matching log warnings on a live preview run.
>
> What changes after the grant: when staff use Phase I Dynamics, Grant Reporting, Review Manager, etc., the `modifiedby` / `createdby` fields on the resulting akoya_request / wmkf_ai_run / email rows reflect the staff member rather than "# WMK: Research Review App Suite". No code change, no config change on our side once you've granted it — the env flag is already on in preview, and prod will be flipped after a clean post-Delegate retest.
>
> How to verify on your end (optional): once you save, the role list for that application user should show Delegate alongside whatever's already there. I'll re-run the preview smoke and confirm in our next sync.
>
> If you'd rather I walk through it on a call or screenshare, happy to.
>
> Thanks,
> Justin

---

## Internal context (don't send to Connor)

**Discovered during S132 smoke (2026-05-05).** Preview env flag flipped, ran `/phase-i-dynamics` summarize on request 1002379 logged in as `jgallivan@wmkeck.org`. Two `[DynamicsService] Impersonated write rejected` warnings landed in Vercel preview logs, both with the same Dataverse error:

```
contextUserId=53e97fb3-a006-f111-8406-000d3a352682 is missing privilege
prvActOnBehalfOfAnotherUser
(PrivilegeId: ae5c41f0-e823-4cb9-b25a-8ef020201973,
 Parameter'user'=29b0de0d-4ff7-ee11-a1fd-000d3a3621c7,
 callerId=29b0de0d-4ff7-ee11-a1fd-000d3a3621c7)
```

`53e97fb3-a006-f111-8406-000d3a352682` is the application user `# WMK: Research Review App Suite`. The error is on the *app user*, not on Justin's staff role. Reproduced via direct API probe (`fetch` with `MSCRMCallerID` set, app-user credentials) — confirmed Probe 1 (impersonated PATCH on `akoya_request`) returns 403 with the above message; Probe 2 (same PATCH, no impersonation header) returns 204.

**Why the rollout doc anticipated the wrong layer.** `docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md § Step 5` framed expected 403s as staff-role privilege intersection — i.e., a particular staff role missing `prvUpdate` on, say, `wmkf_ai_run`. The actual gap is one layer above: the app user lacks `prvActOnBehalfOfAnotherUser`, the platform privilege required to set `MSCRMCallerID` for *anyone*. Until Delegate is granted, every staff impersonation will 403 regardless of which staff member is acting.

**Post-grant verification plan.**
1. Confirm Delegate appears on the role list for `# WMK: Research Review App Suite`.
2. Re-run `/phase-i-dynamics` against request 1002379 with `overwrite=true` (the field currently holds probe text — re-run will both restore the summary and serve as the smoke).
3. Query `akoya_request` for `_modifiedby_value` — should resolve to Justin's systemuserid `29b0de0d-4ff7-ee11-a1fd-000d3a3621c7`, not the app-user GUID.
4. Query latest `wmkf_ai_run` row for `_createdby_value` — same expected value.
5. Tail Vercel preview logs — zero `Impersonated write rejected` warnings.
6. Repeat smoke as a narrower-role staff user (kmoses) to surface any *table-level* 403s the rollout doc actually anticipated. If any appear, decide per-table whether to extend the staff role or accept service-principal attribution for that table.
7. Flip prod env: `vercel env add DYNAMICS_IMPERSONATION_ENABLED production`, redeploy, smoke once.

**Side effects of the probe to be aware of.** I overwrote `akoya_request 1002379.wmkf_ai_summary` with the string `(impersonation probe — ignore)` while reproducing the issue. Re-running summarize with overwrite=true restores it.

**Why the env flag stays on in preview meanwhile.** The 403 fallback in `_writeFetch` handles the failure gracefully — writes still land, just attributed to the service principal. Leaving the flag on means we can re-run the smoke immediately after Connor saves without coordinating another env change. No user-visible regression.
