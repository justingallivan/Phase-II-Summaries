# Wave 1 — Vercel Flag Rollout (TODO)

**What:** flip the three `WAVE1_BACKEND_*` env vars in Vercel one at a time to route reads/writes of the three Wave 1 tables from Postgres to Dataverse.

**Status as of 2026-04-24:** all three default to `postgres`. App is unchanged. Prod Dataverse is a byte-for-byte shadow copy of Postgres, verified 66/66.

**Who does this:** Justin, via Vercel dashboard or `vercel env` CLI.

---

## Rollout order (least → most blast radius)

Flip one per day, watch for regressions between each. Rollback at any step is unset-the-flag — takes effect on next invocation.

### Step 1 — `WAVE1_BACKEND_SETTINGS=dataverse`

Reads: `baseConfig.js` model-override preload (hot, cached 5min), admin/models, admin/secrets, cron/secret-check, maintenance service retention config.

Writes: admin/models PUT (model override change), admin/secrets PUT (rotation date change).

Blast radius: lowest. Settings are read often but written rarely. Model-override misread = one API call uses wrong model. Rollback is instant.

**What to watch after flip:**
- Any new 5xx on `/api/admin/models` GET or PUT.
- API usage log spot check — model overrides still being picked up (e.g., `expense-reporter` using `claude-haiku-3-5`, not the default).
- Cron logs for `/api/cron/secret-check` at next 08:00 UTC firing.

### Step 2 — `WAVE1_BACKEND_PREFS=dataverse`

Reads: per-user preference lookups (API keys, reviewer-finder settings) — happens on almost every user-scoped API call.

Writes: profile settings page, reviewer-finder cycle config save, etc.

Blast radius: medium. Per-user scope so a bug affects one person until caught. Encryption roundtrip is the main risk surface, but it's identical code both sides (same `lib/utils/encryption`).

**What to watch after flip:**
- `/api/user-preferences` GET/POST errors.
- Any user report that an API key "stopped working" — would indicate decryption mismatch.
- Spot-check a known user: sign in as dev, open profile settings, confirm API keys are masked but present.

### Step 3 — `WAVE1_BACKEND_APP_ACCESS=dataverse`

Reads: `requireAppAccess()` in `lib/utils/auth.js` — called on **every authenticated API request** as the auth gate. 2-min in-process cache softens it.

Writes: admin app-access grants/revokes, first-login default grants from NextAuth.

Blast radius: highest. A bug here locks users out of apps. But the data already verified identical, and the hot path is cached, so the failure mode would be a specific edge case (e.g., Dataverse rate limiting on a cold cache).

**What to watch after flip:**
- 403 "user does not have access to X" errors in logs (beyond the usual baseline).
- Admin dashboard `/admin` → Apps tab — all users show correct app counts.
- Confirm superuser (Justin) still bypasses all gates.

---

## How to flip a flag

Either:

**Vercel dashboard:**
1. Project settings → Environment variables
2. Add `WAVE1_BACKEND_SETTINGS` (or PREFS or APP_ACCESS) = `dataverse`
3. Apply to **Production** (leave Preview/Development as-is until they're needed)
4. Redeploy the latest prod deployment (Vercel → Deployments → ... menu → Redeploy) so the new env reaches running functions

**CLI:**
```bash
vercel env add WAVE1_BACKEND_SETTINGS production
# enter: dataverse
vercel --prod  # redeploy to pick up the new env
```

---

## Rollback

Remove the env var (or set to `postgres`) and redeploy. Takes effect on the next invocation — no data migration needed (Postgres remains the source of truth until we drop the tables).

Dataverse rows written during the short flag-on window stay in Dataverse; Postgres rows from the same period are whatever the previous Postgres read saw. Minor divergence possible during the window but re-syncing Postgres→Dataverse is cheap (`node scripts/sync-wave1-postgres-to-dataverse.js --target=prod --execute` — already idempotent).

---

## After all three flags stable

1. Decide on cutover: stop writing to Postgres, drop the 3 tables.
2. Remove the feature-flag dispatch code (the wrappers become Dataverse-only).
3. Remove the three Postgres tables from the migration plan as "done".
4. Proceed to Wave 2.

---

## Recommended pacing

One flag per day, watch 24h before the next. Full rollout takes ~3 days of calendar time but <1 hour of active work.

Fastest-safe: flip all three in one deployment if there's a reason for urgency (e.g., Postgres bill, data residency). Still works — the verification proved they're identical. Just reduces our ability to isolate a regression to one table.
