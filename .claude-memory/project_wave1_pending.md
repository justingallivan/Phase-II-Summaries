---
name: Wave 1 pending follow-ups
description: Status of post-2026-04-24 cutover follow-ups — flag rollout corrected 2026-05-03 after a 6-day silent fallback; elevations revert STILL PENDING (memory previously claimed done but live check disproved it).
type: project
originSessionId: 97cd3044-49bb-4f67-b000-5d32980d6faa
---
Wave 1 was cut over to prod on 2026-04-24. Schema, role, 149 rows of data, and read-path verification all done.

**Status of follow-ups (corrected 2026-05-03):**

1. **Flip Vercel env flags** — DONE 2026-05-03 with caveat. The flags were originally added on ~2026-04-27 with values `"dataverse\n"` (trailing newline, likely from `echo "dataverse" | vercel env add`). All three dispatch sites do strict `=== 'dataverse'` equality, so the comparison silently failed and prod ran on Postgres for 6 days while looking rolled over. Corrected by deleting the broken vars and re-adding via dashboard as plain (non-Sensitive) variables with value `dataverse` — verified clean via `vercel env pull`. Resync confirmed zero divergence (0 inserts across all 3 tables; 145 rows already aligned). **14-day stability clock starts 2026-05-03; earliest retirement 2026-05-17.** See `docs/WAVE1_VERCEL_FLAG_ROLLOUT.md` for the trailing-newline gotcha now documented inline.

2. **Remove temp elevations from prod app user** — DELIBERATELY HELD until after intake portal schema work lands. The app user `# WMK: Research Review App Suite` (systemuserid `53e97fb3-a006-f111-8406-000d3a352682`) currently has both `WMKF AI Elevated TEMP` and `System Customizer` still attached. **Why held:** intake portal needs new schema (`wmkf_portal_membership` entity, `wmkf_portal_oid` on contact, `wmkf_phaseiisubmittedat`/`wmkf_phaseiisubmittedby` on akoya_request, plus possibly child entities depending on Connor's structured-tables persistence decision). Schema script runs as the app user, so create-time privileges (`prvCreateEntity`, `prvCreateAttribute`) need to be present — i.e., the temp roles must stay on. Reverting now would just force Connor to re-add the role weeks later. **Correct sequence:** Entra unblock → Connor design sync → schema script lands new entities/fields → THEN ask Connor for the revert. Also worth asking Connor about: the role list shows `akoyaGO Team User (no accounting)` where the doc expected `akoyaGO Read Only access` — possible role rename or replacement; ask in the same revert message. (Memory previously claimed done 2026-04-28; live check 2026-05-03 disproved that.)

**Why these matter:** they tie off the migration cleanly. The flag flip is what makes the Postgres → Dataverse migration provably in effect (not just provisioned). The elevation revert is the security hygiene piece — minimal permanent surface for the app user.

**How to apply:** when checking Wave 1 status, **always run the live Dynamics role check first** (the small node command in `docs/WAVE1_REVERT_TEMP_ELEVATIONS.md` § Verification) — memory has been wrong about this once already. Same for flag values: don't trust dashboard "set" indicators; pull and grep to confirm the actual stored bytes.

**Side effect of the eventual elevation revert:** any future schema-apply script run (e.g. Wave 2) will fail with `prvCreateEntity` denied. Connor needs to re-add `WMKF AI Elevated TEMP` temporarily, run the apply, then strip it again. See `docs/WAVE1_REVERT_TEMP_ELEVATIONS.md` for the recovery procedure.
