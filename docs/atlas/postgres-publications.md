# Atlas: `publications` (Postgres)

**Last verified:** 2026-05-07 via `scripts/audit-postgres-state.js`
**Live row count:** **0**

## Source of truth

**None.** Table exists; nothing reads or writes it in production traffic. Writer is dead code.

## Schema (live)

| Column | Type |
|---|---|
| id | integer (SERIAL PK) |
| researcher_id | integer (FK researchers.id, ON DELETE CASCADE) |
| title | text |
| authors | text[] |
| author_position | integer |
| publication_date | date |
| year | integer |
| journal | varchar(500) |
| doi | varchar(100) UNIQUE |
| pmid | varchar(50) |
| pmcid | varchar(50) |
| arxiv_id | varchar(50) |
| citations | integer (default 0) |
| abstract | text |
| source | varchar(50) |
| created_at | timestamp |
| url | varchar (added by ad-hoc migration) |

Indexes: `researcher_id`, `publication_date DESC`, `doi`.

## Live state notes

- 0 rows. Writer was either never wired or was disabled.
- **W5 update (commit `0c58da4`):** the `DatabaseService.addPublication` / `getRecentPublications` / `getResearchersByKeywords` methods that referenced this table were gutted from `database-service.js`. No live readers or writers remain in the service layer.

## Read paths

- `scripts/clear-all-database.js`, `scripts/db-row-counts.js` — admin scripts only

Pre-W5 (now removed):
- `lib/services/database-service.js` — `addPublication`, `getRecentPublications`, `getResearchersByKeywords` (all gutted in `0c58da4` after zero-caller grep)

## Write paths

- `scripts/clear-all-database.js` — admin script only

Pre-W5 (now removed):
- `lib/services/database-service.js` — `addPublication` INSERT (gutted in `0c58da4`)

## Cross-system

Schema-as-code at `lib/dataverse/schema/wave2/wmkf_app_publication.json` exists and the Dataverse entity `wmkf_apppublication` IS DEPLOYED (14 custom attrs verified live), but has **0 rows**. Both Postgres and Dataverse sides are empty.

## Migration disposition

Per `docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md`: skip-safe — drop the Postgres table during cleanup; no rows to migrate. Dataverse `wmkf_apppublication` will start populating once the live discovery flow writes to it.
