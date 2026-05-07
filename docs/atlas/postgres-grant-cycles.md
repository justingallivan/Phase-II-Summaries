# Atlas: `grant_cycles` (Postgres)

**Last verified:** 2026-05-07 via `scripts/audit-postgres-state.js`
**Live row count:** 13

## Source of truth

**Postgres-only, load-bearing.** Dataverse counterpart `wmkf_appgrantcycle` IS deployed (10 custom attrs verified live 2026-05-07, see [dataverse-wmkf-apppublication-and-appgrantcycle.md](dataverse-wmkf-apppublication-and-appgrantcycle.md)) but holds **0 rows** and is missing 3 columns (`short_code`, `program_name`, `custom_fields`) — so all live reads still go to Postgres.

## Schema (live, 13 columns)

| Column | Type | Populated |
|---|---|---|
| id | integer (SERIAL PK) | 13/13 |
| name | varchar | 13/13 |
| short_code | varchar | 13/13 (`Jxx`/`Dxx`) |
| program_name | varchar | 13/13 |
| review_deadline | date | **0/13** |
| summary_pages | varchar | 13/13 |
| review_template_blob_url | varchar(500) | 0/13 |
| review_template_filename | varchar(255) | 0/13 |
| additional_attachments | jsonb | 0/13 |
| custom_fields | jsonb | 0/13 |
| is_active | boolean | 13/13 |
| created_at, updated_at | timestamp | 13/13 |

Live data: J23–J27, D23–D27 cycles; some duplicates (id 11–13 are inactive duplicates of D26/J27/D27). All have `review_deadline = NULL` despite being a populated column on the Postgres schema.

## Read paths

- `lib/services/maintenance-service.js`
- `pages/api/review-manager/render-emails.js`, `pages/api/review-manager/send-emails.js` — Review Manager reads from Postgres (NOT Dataverse). Codex round-1 finding confirmed.
- `pages/api/reviewer-finder/grant-cycles.js`
- 4 scripts

## Write paths

- `pages/api/reviewer-finder/grant-cycles.js` (admin-add cycle UI)
- `scripts/cleanup-duplicate-cycles.js`, `scripts/backfill-postgres-to-dataverse.js`

## Cross-system

| Postgres | Live Dataverse `wmkf_appgrantcycle` (probed 2026-05-07) |
|---|---|
| `name` | `wmkf_displayname` (primary name attr) |
| `short_code` | **NOT in deployed entity** — this is the Wave 2 gap |
| `program_name` | **NOT in deployed entity** |
| `review_deadline` | `wmkf_reviewreturndeadline` (note rename) |
| `summary_pages` | `wmkf_summarypages` |
| `review_template_blob_url` | `wmkf_reviewtemplateurl` |
| `review_template_filename` | `wmkf_reviewtemplatefilename` |
| `additional_attachments` | `wmkf_additionalattachments` |
| `custom_fields` | **NOT in deployed entity** |
| `is_active` | `wmkf_isactive` |

**Schema-as-code (`lib/dataverse/schema/wave2/wmkf_app_grant_cycle.json`) has 8 attributes** — `wmkf_FiscalYearCode`, `wmkf_MeetingDate`, `wmkf_SummaryPages`, `wmkf_ReviewReturnDeadline`, `wmkf_ReviewTemplateUrl`, `wmkf_ReviewTemplateFilename`, `wmkf_AdditionalAttachments`, `wmkf_IsActive`. The deployed entity has `wmkf_FiscalYearCode` confirmed via reading the metadata, but neither the schema-as-code nor the deployed entity has `wmkf_ShortCode`, `wmkf_ProgramName`, or `wmkf_CustomFields`.

> **Codex round-3 finding correction:** The schema-as-code has 8 attributes (not 2 as previously claimed). Real gap vs. Postgres: `short_code`, `program_name`, `custom_fields` are missing from both schema-as-code and deployment.

## Migration disposition

Per `docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md`: cycle data migrates to `wmkf_appgrantcycle`. Either patch schema-as-code with `wmkf_ShortCode`/`wmkf_ProgramName`/`wmkf_CustomFields`, or accept that those Postgres columns are unused (review_deadline is 0% populated; short_code is 100% populated and used by `cycle-code.js` + UI).

`short_code` is **load-bearing** — used by `lib/utils/cycle-code.js` `meetingDateToCycleCode()` and the picker UI. Cannot drop.

## Open questions / gotchas

- 13 rows include 3 inactive duplicates (ids 11/12/13) — investigate before migration whether to merge or drop.
- `review_deadline` is 0% populated — does any caller require it? Grep `review_deadline` to verify.
- Review Manager (`render-emails.js`, `send-emails.js`) reads from Postgres `grant_cycles`; cutover requires endpoint rewrite or dual-read.
