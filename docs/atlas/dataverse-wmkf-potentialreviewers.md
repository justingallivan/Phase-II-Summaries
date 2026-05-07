# Atlas: `wmkf_potentialreviewers` (Dataverse, vendor entity + extensions)

**Last verified:** 2026-05-07 via `scripts/audit-dataverse-state.js`
**Live row count:** 4,267
**Entity set:** `wmkf_potentialreviewerses` (note Dynamics-pluralized form)
**Adapter:** `lib/dataverse/adapters/potential-reviewer.js`
**Extension manifest:** `lib/dataverse/schema/wave2-existing/wmkf_potentialreviewers-extensions.json`

## Source of truth

**Connor's lead/person record.** One row per real person — global, not per-proposal. Email is the de-dupe key. Promoted to a CRM `contact` when staff first reaches out (via `wmkf_contact` lookup).

This is the **canonical person record** for the reviewer-finder domain. Postgres `researchers` (331 rows) is a small, partial historical pool — `wmkf_potentialreviewers` has 4,267 rows because Connor's team also tracks reviewers from other systems and historical outreach.

## Key fields (live, sample-probed 2026-05-07)

Identity:
- `wmkf_potentialreviewersid` (PK)
- `wmkf_name` (full name) + `wmkf_firstname` + `wmkf_lastname`
- `wmkf_prefix` (Picklist — Mr/Dr/Prof/etc.)
- `wmkf_title` (String — job title)

Contact:
- `wmkf_emailaddress` (de-dupe key in adapter)
- `wmkf_organizationname`
- `wmkf_areaofexpertise`

Provenance / linking:
- `wmkf_source` (Picklist — where the lead came from)
- `wmkf_whyreviewerwaschosen` (free-form rationale)
- `wmkf_contact` (Lookup → `contacts`) — set when promoted to CRM contact
- `_wmkf_contact_value` is what shows in queries

Field caps observed empirically:
- `wmkf_organizationname` — 100 chars
- `wmkf_areaofexpertise` — 100 chars

(Full-string affiliation belongs on `wmkf_appresearcher.wmkf_primaryaffiliation`.)

## Adapter contract (`lib/dataverse/adapters/potential-reviewer.js`)

Methods:
- `getByEmail`, `getById`
- `upsertByEmail({ name, email, affiliation, expertise, whyChosen })` — find-or-create on email; on match, **fill-if-empty only** (preserves staff edits)
- `update(id, updates)` — partial update with name-splitting
- `setContactLink(potentialReviewerId, contactId)` — sets `wmkf_Contact@odata.bind`

`splitName` strips `Dr./Prof./Professor` prefixes and splits on whitespace.
`clamp` truncates to FIELD_MAX with `…` suffix.

## Read paths

- `pages/api/review-manager/send-emails.js` — outreach
- `pages/api/review-manager/render-emails.js` (≈line 85) — `DynamicsService.getRecord('wmkf_potentialreviewerses', personId)` to hydrate person fields per email draft
- `pages/api/review-manager/reviewers.js` `fetchPotentialReviewers` — chunked OR-chain on `wmkf_potentialreviewersid` to hydrate the Review Manager reviewer list
- `pages/api/reviewer-finder/{save-candidates,my-candidates}.js`
- (Indirectly via `wmkf_appresearcher` lookup — every researcher row has a 1:1 to here)

## Write paths

- Endpoints: same as read (via `upsertByEmail` / `update` / `setContactLink`)
- `scripts/backfill-postgres-to-dataverse.js` (≈line 189) — `upsertByEmail` against the Postgres `researchers` pool during Wave 2 backfill.

## Cross-system

| Source | Mapping |
|---|---|
| Postgres `researchers` | Migrates 1:1 by email match — produces the identity half of the new model |
| Dataverse `contacts` | Promoted on first outreach via `wmkf_contact` lookup; AppendTo permission granted 2026-05-01 |
| Dataverse `wmkf_appresearcher` | 1:1 sidecar holding bibliometric snapshots |
| Vendor `akoya_requests.wmkf_potentialreviewer1..5` | Legacy per-proposal slots (not the canonical link — those are in `wmkf_appreviewersuggestion`) |

## "Engaged" semantics + cleanup cron (locked S136) [ASSUMED — per `project_reviewer_postgres_to_dataverse_migration.md`]

Per the migration plan, this table is treated as **scratch + history** rather than canonical-person. A `wmkf_potentialreviewer` row becomes "engaged" (= history) when ANY of the 8 signals on its linked `wmkf_appreviewersuggestion` are populated (see that page). The Wave 2 cleanup cron drops un-engaged rows after `wmkf_meetingdate < today - 30 days` with cascade onto the `wmkf_appresearcher` sidecar. Permanent reviewer identity ultimately lives in `contact` via promotion (`wmkf_contact` lookup).

## Migration disposition [ASSUMED — per migration plan]

Already the source of truth for identity. No data migration **into** this entity from Postgres yet — Wave 2 will drive that as part of researcher-pool retirement. The 4,267 rows are vendor-historical and will drain via cleanup cron + cycle close, not bulk-migrate.

## Open questions / gotchas

- 4,267 rows is much larger than Postgres `researchers` (331). Per the migration plan: don't import researchers in bulk — engagement-history approach replaces the bulk-import pattern.
- `wmkf_contact` lookup population unknown — should probe how many rows have a non-null contact link before any cleanup-cron rollout.
- The "per-proposal slot vs. per-person canonical" distinction is contextual: the *table* is per-person (email is the dedupe key, `upsertByEmail` is idempotent), but `akoya_request.wmkf_potentialreviewer1..5` lookups treat individual rows as **per-proposal slot fills**. Both framings are correct; cleanup-cron acts on the per-person row when it has no per-proposal engagement.
