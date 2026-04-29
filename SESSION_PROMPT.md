# Session 116 Prompt: Build Wave 2 adapters + wire save-candidates

## Session 115 Summary

Wave 2 schema landed in prod and was reshaped to match Connor's existing `wmkf_potentialreviewers` table as the canonical lead/person record. Most of the session was design negotiation with Connor (live) — the resulting model is a clear separation between his lead-capture table and our lifecycle ledger / bibliometric sidecar. No adapter work yet — the schema/design loop took the whole session.

### What was completed

1. **Wave 2 schema applied to prod (`46c7d26`).** First execute against prod surfaced two real bugs in the original schemas:
   - Primary-name attributes on two tables were 1000 / 4000 chars long; Dataverse caps primary attributes at 850. Both lowered to 850.
   - File-load order matters: `wmkf_app_publication_author.json` had a lookup → `wmkf_appresearcher` but sorted alphabetically before it. Renamed to `wmkf_app_z_publication_author.json` so it loads after researcher.
   After fixes, all 6 wave-2 entities created cleanly and the run is idempotent.

2. **Wave 2 schema reshape (`852bd1a`)** — major design pivot driven by Connor input:
   - Connor pointed out his existing `wmkf_potentialreviewers` table was already designed as the lead/person record (firstname, email, address, expertise, source picklist, "why chosen" memo) — purpose-built for what we were rebuilding. Final model:
     ```
     wmkf_potentialreviewers (1) ─ 1:1 ─ contact
             │
             │ 1:N
             ▼
     wmkf_app_reviewer_suggestion (N) ─── (1) akoya_request
     ```
   - Connor's table = lead capture (one row per *person*, not per request). Promoted to `contact` only when staff actually reaches out.
   - Our `wmkf_app_reviewer_suggestion` = lifecycle ledger (one row per (person, proposal)). Holds relevance score, match reason, sources, lifecycle timestamps, picklists.
   - Our `wmkf_app_researcher` = bibliometric sidecar (h-index, citations, scholar id) — separate from person identity because metrics update on a different cadence (Justin's call).

3. **Schema changes applied (all in `852bd1a`):**
   - **Connor's `wmkf_potentialreviewers`:** added `wmkf_contact` lookup → `contact` (nullable until promotion), alt-key on `wmkf_contact` (1:1), alt-key on `wmkf_emailaddress` (idempotency for our upserts). Connor dropped his old `wmkf_requestlookup` column (which was per-request, doesn't fit the new per-person model). Connor cleaned up 6 duplicate emails before the alt-key would apply.
   - **Our 3 wave-2 tables (all empty):** dropped + recreated with reshaped lookups. Suggestion table now uses `wmkf_potentialreviewer` lookup (instead of `wmkf_reviewercontact` → contact); alt-key is `(potentialreviewer, request)`. Researcher table's lookup repointed `contact → wmkf_potentialreviewers` with required-1:1 alt-key.

4. **Engine extensions (in `852bd1a`):**
   - `apply-dataverse-schema.js` now loads from a `wave{N}-existing/` directory before `wave{N}/`, so existing-table extensions apply before new entities reference them.
   - New `extensions-on-existing` spec kind handles attributes + relationships + alt-keys on already-created entities (kept `attributes-on-existing` alias for backward compat).

5. **One-off scripts:**
   - `scripts/wave2-reshape-drop.js` — drops our 3 empty wave-2 entities + Connor's old request-lookup column. Idempotent.
   - `scripts/wave2-remove-formfield.js` — programmatic form-XML edit + publish to remove the lookup field from the "Potential Reviewer" main form so the column drop wasn't dependency-blocked. **Did not work in our environment** — PATCH on `/systemforms` against the Active solution layer silently returns 204 without applying changes (even on simple fields like `description`). Connor handled it via the maker portal instead. Kept the script for reference.

### Commits

- `46c7d26` — Wave 2 schema fixes: cap primary attrs at 850, fix lookup ordering
- `852bd1a` — Wave 2 reshape: align with wmkf_potentialreviewers as canonical person
- (Session-end commit will follow)

## What's set up for next session

Wave 2 schema is **fully applied and idempotent** in prod. Verified:

| Surface | State |
|---|---|
| `wmkf_potentialreviewers.wmkf_contact` lookup | Created (nullable) |
| `wmkf_potentialreviewers.wmkf_contact_unique` alt-key | Created (1:1) |
| `wmkf_potentialreviewers.wmkf_emailaddress_unique` alt-key | Created |
| `wmkf_potentialreviewers.wmkf_requestlookup` column | Dropped |
| `wmkf_app_reviewer_suggestion` | Recreated, lookups + picklists + alt-key |
| `wmkf_app_researcher` | Recreated, 1:1 to potentialreviewers |
| `wmkf_app_publication_author` | Recreated, lookups to pub + researcher |

Tables are empty. Old Postgres `reviewer_suggestions` (333 rows) archives in place — backfill is a follow-on, not blocking.

## Potential next steps

### 1. Build the adapter trio + wire `save-candidates` (the original Session 115 plan, just delayed)

Three thin adapters under `lib/dataverse/adapters/`:

- **`potential-reviewer.js`** — upsert by email alt-key (`wmkf_emailaddress`). Methods: `upsertByEmail({ name, email, affiliation, expertise, source, whyChosen })`, `getByEmail(email)`, `setContactLink(potentialReviewerId, contactId)` (called at promotion time).
- **`researcher.js`** — bibliometric sidecar, 1:1 with potentialreviewer. Methods: `upsertByPotentialReviewer(prId, { hIndex, totalCitations, googleScholarId, orcidUrl, lastChecked })`. Alt-key on `wmkf_potentialreviewer`.
- **`reviewer-suggestion.js`** — the lifecycle ledger. Upsert by `(potentialreviewer, request)` alt-key. Methods: `upsert({ potentialReviewerId, requestId, relevanceScore, matchReason, sources, programArea })` for save-candidates flow; later additions for the lifecycle transitions (`markInvited`, `markAccepted`, `markMaterialsSent`, etc.) as we wire them.

Then wire `pages/api/reviewer-finder/save-candidates.js`:

1. Resolve `request_number` (already on every Postgres `reviewer_suggestions` row) → `akoya_request` GUID via Dynamics lookup.
2. For each candidate: upsert potential-reviewer (by email), upsert researcher snapshot, upsert suggestion linking the two + request. Cutover (Dataverse-only writes per Wave 2 policy); old Postgres table archives in place.
3. Smoke test against prod with a real `request_number` (e.g., 1002386 from the `reviewer_suggestions` data).

### 2. Promotion path — when a candidate is reached out to

Per Connor: at first invitation, the potential-reviewer row should be promoted to a `contact`. Either find an existing contact by email or create a new one, then set `wmkf_potentialreviewers.wmkf_contact` lookup. Probably hooks into the next Reviewer Finder action (the one that queues a candidate for outreach) — out of scope for save-candidates, but worth queuing as a follow-on.

### 3. Read-side migration — `my-candidates`

Once writes are flowing into Dataverse, repoint the read endpoint (`/api/reviewer-finder/my-candidates`) at the new tables. Joins via potentialreviewer for person info + researcher for bibliometrics.

### 4. Backfill Postgres → Dataverse

333 rows in Postgres `reviewer_suggestions`. Each has `request_number`, researcher metadata, and lifecycle timestamps. One-shot migration script. Low priority since save-candidates already cuts new writes over.

## Hand-off notes

- **`scripts/wave2-remove-formfield.js` doesn't work in our environment** but is left in the repo. PATCH on `/systemforms` returns 204 silently without applying changes when targeting the Active solution layer. Suspect it's a privilege gap on `prvWriteSystemForm` or similar even with `System Customizer`. If we need form edits in the future, default to maker portal unless we figure this out.
- **Connor's app-user roles right now:** the four permanent ones plus `WMKF AI Elevated TEMP` and `System Customizer`. Per `docs/WAVE1_REVERT_TEMP_ELEVATIONS.md` Connor will strip the temp roles once we're confident no further schema applies are queued. Can ping him after the adapter work.
- **6 emails were duplicated in `wmkf_potentialreviewers`** before the alt-key was added; Connor cleaned them up. If save-candidates ever finds an unexpected duplicate, query `wmkf_potentialreviewers?$apply=groupby((wmkf_emailaddress),aggregate($count as c))&$filter=c gt 1` to spot recurrences.
- **Custom-lookup `@odata.bind` casing reminder** (still applies to wave 2 lookups): use the lookup's **SchemaName** (PascalCase like `wmkf_PotentialReviewer`), not the logical name. The new lookups live on suggestion (`wmkf_PotentialReviewer`, `wmkf_Request`) and researcher (`wmkf_PotentialReviewer`).

## Key files reference

| File | Status | Purpose |
|---|---|---|
| `lib/dataverse/schema/wave2-existing/wmkf_potentialreviewers-extensions.json` | new (`852bd1a`) | Connor's table extensions: contact lookup + 2 alt-keys |
| `lib/dataverse/schema/wave2/wmkf_app_reviewer_suggestion.json` | reshaped (`852bd1a`) | Lookup → potentialreviewers; alt-key (potentialreviewer, request) |
| `lib/dataverse/schema/wave2/wmkf_app_researcher.json` | reshaped (`852bd1a`) | 1:1 to potentialreviewers; bibliometric sidecar |
| `scripts/apply-dataverse-schema.js` | extended (`852bd1a`) | `wave{N}-existing/` loader + `extensions-on-existing` kind |
| `scripts/wave2-reshape-drop.js` | new (`852bd1a`) | Idempotent drops for the wave-2 entities + the old request lookup |
| `scripts/wave2-remove-formfield.js` | new (`852bd1a`) | Form-XML edit script (kept for reference; doesn't work in our env) |

## Testing

```bash
# Verify wave 2 schema is live in prod (should show all · exists)
node scripts/apply-dataverse-schema.js --target=prod --wave=2 --execute

# Confirm Connor's table extensions
node -e "require('./lib/dataverse/client').loadEnvLocal(); (async () => {
  const { getAccessToken, createClient } = require('./lib/dataverse/client');
  const url = process.env.DYNAMICS_URL;
  const token = await getAccessToken(url);
  const c = createClient({ resourceUrl: url, token });
  const r = await c.get(\"/EntityDefinitions(LogicalName='wmkf_potentialreviewers')/Keys?\$select=SchemaName,KeyAttributes\");
  for (const k of r.body.value) console.log(' -', k.SchemaName, k.KeyAttributes);
})();"

# Probe a request_number → akoya_request GUID lookup (groundwork for save-candidates)
node -e "require('./lib/dataverse/client').loadEnvLocal(); (async () => {
  const { getAccessToken, createClient } = require('./lib/dataverse/client');
  const url = process.env.DYNAMICS_URL;
  const token = await getAccessToken(url);
  const c = createClient({ resourceUrl: url, token });
  const r = await c.get(\"/akoya_requests?\$select=akoya_requestid,akoya_requestnumber&\$filter=akoya_requestnumber eq '1002386'&\$top=1\");
  console.log(r.body.value);
})();"
```
