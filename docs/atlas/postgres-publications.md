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

- 0 rows. Writer (`DatabaseService.createPublication` / similar) was either never wired or was disabled.
- `DatabaseService.getRecentPublications` reader untraced as of S136 (Codex round-3 #7).

## Read paths

- `lib/services/database-service.js`
- `scripts/clear-all-database.js`, `scripts/db-row-counts.js`

## Write paths

- `lib/services/database-service.js` — INSERT / DELETE
- `scripts/clear-all-database.js`

## Cross-system

Schema-as-code at `lib/dataverse/schema/wave2/wmkf_app_publication.json` exists and the Dataverse entity `wmkf_apppublication` IS DEPLOYED (14 custom attrs verified live), but has **0 rows**. Both Postgres and Dataverse sides are empty.

## Migration disposition

Per `docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md`: skip-safe — drop the Postgres table during cleanup; no rows to migrate. Dataverse `wmkf_apppublication` will start populating once the live discovery flow writes to it.
