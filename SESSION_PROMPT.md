# Session 115 Prompt: Resume Wave 2 once Connor re-grants the role; first adapter

## Session 114 Summary

A productive session that **shipped** the Review Manager direct-send (smoke-tested live), then **started** Wave 2 of the Postgres → Dataverse migration. Wave 2 is partially blocked: schemas authored and dry-run clean, but the schema-apply against prod was denied because the temp role elevations have already been removed from the app user. Email drafted to Connor to re-grant `WMKF AI Elevated TEMP` so we can apply.

### What was completed

1. **Review Manager direct email send — smoke-tested end-to-end and committed** (`5e0f8c2`).
   - Materials, followup, thankyou template paths all transition status + timestamps correctly against a live test reviewer (`Justin Gallivan Test`, suggestion id 914) on request **1002379**.
   - Partial-failure path validated: bad email → per-recipient `email_failed` event in SSE, DB stays untouched for the failed row.
   - Three Session 113 build bugs surfaced and fixed during the run:
     - `pages/api/review-manager/send-emails.js` was missing `DynamicsService.bypassRestrictions()` (fail-closed since the security pass).
     - Dynamics email `description` is rendered as HTML — added `plainTextToHtml()` helper so newlines and links survive.
     - Removed the now-obsolete "From Email" UI field (sender comes from session).
   - Three independent dev-mode/auth-pages fixes also rolled into the same commit:
     - `lib/utils/auth.js` — `requireAuthWithProfile` dev-bypass branch now also accepts `profileId` (matching what `ProfileContext` sends), unblocking `/api/user-preferences` in `AUTH_REQUIRED=false` setups.
     - `pages/api/review-manager/reviewers.js` — GET honors `userProfileId` query param when auth is bypassed.
     - `pages/_app.js` — skip Profile/AppAccess providers on `/auth/*` pages so the signin page doesn't fire authenticated API calls that get redirected to HTML and break `JSON.parse` in the browser.

2. **Wave 2 schema authoring — done, dry-run clean, apply blocked on Connor** (`678faca`).
   - **Engine extensions** in `lib/dataverse/schema-apply.js`: added `Decimal`, `Double`, `Picklist` (local option set with inline option values).
   - **6 entity definitions** in `lib/dataverse/schema/wave2/`:
     - `wmkf_app_grant_cycle` (alt-key on fiscal year code)
     - `wmkf_app_researcher` (lookup → contact, alt-key on ORCID)
     - `wmkf_app_publication` (alt-key on DOI)
     - `wmkf_app_publication_author` (junction; alt-key on publication+position)
     - `wmkf_app_proposal_search` (lookup → akoya_request)
     - `wmkf_app_reviewer_suggestion` (3 lookups, 2 picklists, alt-key on contact+request)
   - `scripts/apply-dataverse-schema.js` minor banner fix (was hardcoded "Wave 1 artifacts").
   - **Apply against prod failed with 403 / `prvCreateEntity` denied.** App user roles confirmed: only the four permanent ones remain (`WMKF Research Review App Suite - Staff`, `WMKF AI Tools`, `WMKF Custom Entities`, `akoyaGO Read Only access`). Both `WMKF AI Elevated TEMP` and `System Customizer` have been stripped. Memory `project_wave1_pending.md` updated to reflect this.
   - **Drafted email to Connor** asking him to re-add `WMKF AI Elevated TEMP` temporarily so we can apply Wave 2.

3. **Local dev environment now does real Azure AD signin.** Pulled production env vars to `.env.local`, merged in `AZURE_AD_CLIENT_ID/SECRET/TENANT_ID`, flipped `AUTH_REQUIRED=true`. Added `http://localhost:3000/api/auth/callback/azure-ad` as a Web platform redirect URI to the Azure app registration. Sign-in flow works.

### Commits

- `5e0f8c2` — Review Manager: direct Dynamics email send (smoke-tested)
- `678faca` — Wave 2 schema: engine extensions + 6 entity definitions

## What's blocking

**Wave 2 schema apply is blocked on Connor.** He needs to re-add `WMKF AI Elevated TEMP` to the app user `# WMK: Research Review App Suite` (App ID `d2e73696-537a-483b-bb63-4a4de6aa5d45`) via the prod maker portal. Email is drafted; Justin to send. Once on:

```bash
node scripts/apply-dataverse-schema.js --target=prod --wave=2 --execute
```

Idempotent, ~5–10 min, lands in `wmkfResearchReviewAppSuite` solution. After that, Connor strips the role again per `docs/WAVE1_REVERT_TEMP_ELEVATIONS.md`.

## Potential next steps

### 1. Resume Wave 2 once schema is applied — first adapter on `reviewer_suggestion`
Per Justin's call, the first adapter is the big one (`wmkf_app_reviewer_suggestion`) — exercises every cross-cutting pattern (3 lookups, 2 picklists, alt-key on lookups). Expected scope: a thin `lib/dataverse/adapters/reviewer-suggestion.js` with read/write helpers, then point one Reviewer Finder route at it (probably `/api/reviewer-finder/save-candidates` first since it's the write side, or `/api/reviewer-finder/my-candidates` for read-first). Postgres `reviewer_suggestions` table archives in place; backfill happens later.

### 2. (Independent) Wave 1 flag flip rollout
Still pending per `docs/WAVE1_VERCEL_FLAG_ROLLOUT.md`. Order: SETTINGS → PREFS → APP_ACCESS, one per day with 24h watch. This is independent of Wave 2 and could be threaded in alongside.

### 3. Review Manager UI polish (deferred)
Justin noted "we might have more UI work to do" but the wiring is solid. Candidate items: post-cycle UX pass on the preview/send modal flow; better empty-states; clearer status transitions in the reviewer table.

### 4. Reviewer accept/decline magic links (post direct-send, half-day)
Per `project_reviewer_accept_decline_links.md`. Direct-send is now live and producing real `materials_sent_at` timestamps, which is the foundation. HMAC-signed token + two-click confirm + public response endpoint.

## Key files reference

| File | Status | Purpose |
|---|---|---|
| `pages/api/review-manager/send-emails.js` | committed (5e0f8c2) | Direct Dynamics send + regarding link + plain-text-to-HTML + `bypassRestrictions()` |
| `pages/api/review-manager/render-emails.js` | committed (5e0f8c2) | Preview-only endpoint (no Dynamics, no DB writes) |
| `pages/api/review-manager/reviewers.js` | committed (5e0f8c2) | GET dev-mode `userProfileId` query support |
| `pages/review-manager.js` | committed (5e0f8c2) | EmailModal 3-step flow; From Email field removed |
| `pages/_app.js` | committed (5e0f8c2) | Skip Profile/AppAccess providers on /auth/* pages |
| `lib/utils/auth.js` | committed (5e0f8c2) | `requireAuthWithProfile` accepts `profileId` alias |
| `lib/dataverse/schema-apply.js` | committed (678faca) | Engine extensions: Decimal/Double/Picklist |
| `lib/dataverse/schema/wave2/*.json` | committed (678faca) | 6 entity definitions |
| `scripts/apply-dataverse-schema.js` | committed (678faca) | Generic banner ("Wave N artifacts") |

## Hand-off notes

- **Test reviewer state.** Suggestion 914 (`Justin Gallivan Test`, justingallivan@me.com) on request 1002379 has the full lifecycle populated from this session's tests: `materials_sent_at`, `reminder_sent_at`, `thankyou_sent_at` all set, `review_status='complete'`. Justin opted to leave it as-is — it's a real record showing the workflow. Don't be surprised by it.
- **`.env.local` is now in real-auth mode.** `AUTH_REQUIRED=true` with Azure AD creds pulled from prod. To go back to dev-bypass, set `AUTH_REQUIRED=false`. The dev-mode auth fixes from this session mean both modes now work cleanly.
- **Wave 2 schema dry-run is rerunnable** — `--target=prod --wave=2` (no `--execute`) shows the full plan without touching anything. Useful as a sanity check after Connor flips the role on.
- **Don't conflate Wave 2 with Wave 1's full ceremony.** Per existing memory: Wave 2 is build-then-backfill-later. App routes will write to Dataverse only; Postgres archives in place; one-shot backfill at our leisure. No flags, no dispatch wrappers, no 14-day clean window.

## Memory updates this session

- `project_wave1_pending.md` (UPDATED) — temp elevations have been removed (was previously marked still pending). Added side-effect note: any future schema-apply needs Connor to re-grant the role temporarily.

## Testing reminders

```bash
npm run dev                                                      # local smoke (auth on)
npx next build                                                   # build check
node scripts/test-wave1-flag-dispatch.js                         # Wave 1 canary (35/35)
node scripts/verify-wave1-read-path.js --target=prod             # post-flag-flip check
node scripts/apply-dataverse-schema.js --target=prod --wave=2    # Wave 2 dry-run (rerunnable)
node scripts/apply-dataverse-schema.js --target=prod --wave=2 --execute   # blocked on Connor
```
