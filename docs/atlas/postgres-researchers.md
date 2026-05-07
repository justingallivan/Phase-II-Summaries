# Atlas: `researchers` (Postgres)

**Last verified:** 2026-05-07 via `scripts/audit-postgres-state.js`
**Live row count:** 331

## Source of truth

Postgres-only **for now**. Wave 2 migrates the canonical identity to Dataverse `wmkf_potentialreviewers` + bibliometrics to `wmkf_appresearcher`. Until then, this is the de-facto researcher pool.

## Schema (live, from `information_schema`)

| Column | Type | Notes |
|---|---|---|
| id | integer | PK, SERIAL |
| name | varchar(255) | required |
| normalized_name | varchar(255) | lowercase + diacritic-stripped, dedupe key |
| primary_affiliation | varchar(500) | |
| department | varchar(255) | |
| email | varchar(255) | 327 / 331 populated (99%) |
| website | varchar(500) | |
| orcid | varchar(50) | 1 / 331 populated (0.3%) |
| google_scholar_id | varchar(100) | 1 / 331 populated |
| h_index | integer | 0 / 331 populated |
| i10_index | integer | 0 / 331 populated |
| total_citations | integer | 0 / 331 populated |
| notes | text | V12 |
| created_at | timestamp | default `now()` |
| last_updated | timestamp | default `now()` |
| last_checked | timestamp | "last verified" stamp |
| metrics_updated_at | timestamp | added by `setup-database.js`; written on h-index/citations updates by `pages/api/reviewer-finder/researchers.js` (≈line 601) |
| email_source | varchar(100) | M002 — `pubmed \| orcid \| claude_search \| manual` |
| email_year | integer | M002 — pub year where email was found (recency signal) |
| email_verified_at | timestamp | M002 |
| orcid_url | varchar(255) | M002 |
| google_scholar_url | varchar(500) | M002 |
| faculty_page_url | varchar(500) | M002 |
| contact_enriched_at | timestamp | M002 — last enrichment-pass timestamp |
| contact_enrichment_source | varchar(50) | M002 — which tier filled contact info |

Indexes: `normalized_name`, `email`, `last_updated`, `(email IS NOT NULL)`, `contact_enriched_at`, `orcid` (M002). (See `lib/db/schema.sql` + `lib/db/migrations/002_contact_enrichment.sql`.)

> **Verified active readers/writers of the M002 columns:** `pages/api/reviewer-finder/researchers.js` (UI edit) and `lib/services/contact-enrichment-service.js` (enrichment pipeline).

## Live state notes

- 331 rows; 99% have an email; **bibliometric fields (h-index, i10, citations) are 0% populated** — the writer that fills them never landed or got removed.
- Parity probe (`scripts/backfill-reviewer-suggestions-parity.js`) treats this pool as the source for `wmkf_appresearcher` row creation; **Dataverse `wmkf_appresearcher` count is 334** (slightly higher — see "Cross-system" below).

## Read paths

- `lib/services/database-service.js` — `findResearcher`, `findResearchers`, list queries
- `pages/api/reviewer-finder/researchers.js` — UI's researcher browse/edit view
- `scripts/audit-postgres-state.js`, `scripts/clear-all-database.js`, `scripts/cleanup-database.js`

`DatabaseService.findResearcher` callers (3, per Codex round-3 finding):
- `lib/services/discovery-service.js`
- `lib/services/deduplication-service.js`
- `lib/services/contact-enrichment-service.js`

## Write paths

- `lib/services/database-service.js` — `createOrUpdateResearcher`, `updateResearcher`
- `pages/api/reviewer-finder/researchers.js` — UI edit + delete
- `lib/services/contact-enrichment-service.js` — calls `DatabaseService.createOrUpdateResearcher`; this is an active write site (Codex round-3 correction).

DELETE writers: `clear-all-database.js`, `cleanup-database.js`, `pages/api/reviewer-finder/researchers.js`, `scripts/cleanup-database.js`.

## Cross-system linkages

| Direction | Mapping | Status |
|---|---|---|
| Postgres `researchers.id` → Dataverse `wmkf_potentialreviewers` | by email match | live (per-proposal saves promote on demand) |
| Postgres `researchers.h_index/i10/total_citations` → `wmkf_appresearcher.wmkf_hindex/...` | via adapter `lib/dataverse/adapters/researcher.js` | adapter exists; bibliometric fields are 0% populated in Postgres so the migration carries no metric values |

`wmkf_appresearchers` has 334 rows (3 more than Postgres `researchers`). Likely cause: per-proposal promotion via `save-candidates` created Dataverse rows for people who never made it into the Postgres pool (e.g., candidates added directly from the picker without enrichment). Not a data-loss risk.

## Migration disposition

Per `docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md`: identity → `wmkf_potentialreviewers`; bibliometric snapshot → `wmkf_appresearcher`. Browse/edit UI rewrites endpoints to query Dataverse directly. Postgres `researchers` retired post-cutover.

## Open questions / gotchas

- Three callers of `DatabaseService.findResearcher` (not just discovery's cache lookup). Migration plan must cover all three.
- The 0%-populated bibliometric fields raise the question of whether they were ever live; treat the migration as **not** carrying metric data forward unless we re-scrape.
