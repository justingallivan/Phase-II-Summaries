# Atlas: `wmkf_apppublication`, `wmkf_appgrantcycle`, and undeployed Wave 2 entities

**Last verified:** 2026-05-07 via `scripts/audit-dataverse-state.js` + EntityDefinitions metadata probe

## `wmkf_apppublication` — DEPLOYED but EMPTY

**Live row count:** 0 (entity exists, no writers active)
**Entity set:** `wmkf_apppublications`
**Schema-as-code:** `lib/dataverse/schema/wave2/wmkf_app_publication.json`

Custom attrs (14, all confirmed deployed): `wmkf_apppublicationid` (PK), `wmkf_title` (primary name attr), `wmkf_authorsraw` (Memo), `wmkf_journal`, `wmkf_doi` (alt-key), `wmkf_pmid`, `wmkf_pmcid`, `wmkf_arxivid`, `wmkf_publicationdate`, `wmkf_year`, `wmkf_citations`, `wmkf_abstract`, `wmkf_url`, `wmkf_source`.

**No adapter exists** (no `lib/dataverse/adapters/publication.js`). No callers anywhere.

**Migration disposition:** Postgres `publications` is also empty (0 rows). Wave 2 plan is to retire the Postgres table and only start writing here when discovery is rewired. The schema-as-code calls out that authorship goes through a junction (`wmkf_app_publication_author`), but that junction is **NOT deployed** (404 on entity set). Defer junction deployment until publications start landing.

## `wmkf_appgrantcycle` — DEPLOYED, EMPTY, partial schema

**Live row count:** 0
**Entity set:** `wmkf_appgrantcycles`
**Schema-as-code:** `lib/dataverse/schema/wave2/wmkf_app_grant_cycle.json` (8 attrs)

Deployed custom attrs (10): `wmkf_appgrantcycleid`, `wmkf_displayname` (primary), `wmkf_fiscalyearcode`, `wmkf_meetingdate`, `wmkf_summarypages`, `wmkf_reviewreturndeadline`, `wmkf_reviewtemplateurl`, `wmkf_reviewtemplatefilename`, `wmkf_additionalattachments`, `wmkf_isactive` (+ `wmkf_isactivename` virtual).

**Gap vs. Postgres `grant_cycles`:** Missing `short_code`, `program_name`, `custom_fields` from both schema-as-code and live deployment. `short_code` is load-bearing (used by `cycle-code.js`).

> **Codex round-3 finding correction:** Schema-as-code has 8 attributes (not 2). Real gap: `short_code`/`program_name`/`custom_fields` are absent.

**No adapter, no callers.** Migration plan needs schema patches before this can replace Postgres `grant_cycles`. See `docs/atlas/postgres-grant-cycles.md` for Postgres side.

## `wmkf_appproposalsearch` — NOT DEPLOYED

**Live row count:** N/A (404 on `wmkf_appproposalsearches` entity set, 2026-05-07)
**Schema-as-code:** `lib/dataverse/schema/wave2/wmkf_app_proposal_search.json`

The schema-as-code defines the entity but `apply-dataverse-schema.js` was never run for it (or it ran and failed silently — TBD). Postgres `proposal_searches` is also 0 rows; writer is dead. Defer indefinitely.

## `wmkf_app_z_publication_author` — NOT DEPLOYED

**Live row count:** N/A (404 on `wmkf_app_z_publication_authors` entity set, 2026-05-07)
**Schema-as-code:** `lib/dataverse/schema/wave2/wmkf_app_z_publication_author.json`

Junction for `wmkf_apppublication ↔ wmkf_appresearcher`. Defer until publications start landing.

## What this means for the migration plan

`docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md` claims "schema-as-code already lives in `wave2/`." That's true for files-on-disk, but **deployment status differs by entity:**

| Entity | Schema-as-code? | Deployed? | Has data? |
|---|---|---|---|
| `wmkf_appresearcher` | ✅ | ✅ | ✅ (334 rows) |
| `wmkf_appreviewersuggestion` | (extension manifest only) | ✅ | ✅ (336 rows) |
| `wmkf_apppublication` | ✅ | ✅ | empty |
| `wmkf_appgrantcycle` | ✅ (partial) | ✅ (partial) | empty |
| `wmkf_appproposalsearch` | ✅ | ❌ | n/a |
| `wmkf_app_z_publication_author` | ✅ | ❌ | n/a |

The "as-built vs. as-designed" reconciliation Codex round-3 #5 asked for is captured here.
