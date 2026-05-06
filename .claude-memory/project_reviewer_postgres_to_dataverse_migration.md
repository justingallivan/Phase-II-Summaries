---
name: Reviewer Postgres → Dataverse migration is now active top priority
description: Connor approved aggressive timeline 2026-05-06; migration is now prerequisite for intake portal pilot (mid-June 2026). Was strategic-horizon, now active work.
type: project
---

**Status as of 2026-05-06**: Active top priority. Was on the strategic horizon for "long-term" (`project_strategy_direction.md`); promoted to **active prerequisite for intake portal pilot** in the 2026-05-06 sync with Connor. Connor: "let's pull the band-aid off."

**Why**: Portal pilot architecture writes to Dataverse-only world. Connor explicitly preferred Option A (migrate first, then build portal) over Option B (decouple, build portal independent of migration). Pilot date does not slip (mid-June 2026), so migration must land in ~3 weeks.

**How to apply**:
- Treat reviewer migration as the gating workstream for pilot. Portal pilot work that doesn't depend on reviewer data can proceed in parallel; anything reviewer-touching waits.
- The note in `project_reviewer_finder_dataverse_entry_path.md` saying "Postgres reviewer tables are NOT dormant — do not drop" remains factually correct *until* the migration ships, but the strategic stance "do not drop" is now temporary, not indefinite.

## Scope (what migrates)

| Postgres table | Dataverse target | Notes |
|---|---|---|
| `researchers` | TBD: extend `contact` (recommended) **or** new `wmkf_researcher` entity | Design fork open; recommend extending `contact` since per-proposal lifecycle already converges there |
| `publications` | New `wmkf_publication` (child of contact/researcher) **or** JSON longtext **or** retire-and-rescrape | Design fork open; tens of thousands of rows |
| `proposal_searches` | Per-PD state, could stay Postgres or move | Lower stakes |
| `grant_cycles` | Already maps to Dynamics request stages — likely retire | Read-only references |
| `reviewer_suggestions` | Per-PD suggestion tracking, could stay Postgres or move | Lower stakes |

## Vercel-side rewrite scope

- 5+ endpoints under `pages/api/reviewer-finder/` — `researchers`, `grant-cycles`, `my-proposals`, `extract-summary`, `generate-emails`
- `pages/reviewer-finder.js` — 18+ Postgres call sites
- `lib/services/`: `discovery-service.js`, `contact-enrichment-service.js`, `deduplication-service.js`, `database-service.js`
- Enrichment jobs (Google Scholar / ORCID / PubMed) — pipe writes to Dataverse instead of Postgres
- Email generation flow

## Per-proposal vs. enrichment-pool — what's already done

The 2026-05-03 entry path (`project_reviewer_finder_dataverse_entry_path.md`) covers the **per-proposal lifecycle** only:
- Picker UI reads from Dataverse
- Save-candidates writes `wmkf_potentialreviewer` records
- Contact promotion at invite works (verified 2026-05-01)

The **org-wide enrichment pool** is what's still Postgres and migrates now.

## Open design forks

1. **Researcher entity model** — extend `contact` (single identity per person across all WMKF roles) vs. new `wmkf_researcher` entity (researchers can exist without `contact` rows). Lean: extend `contact`.
2. **Publications model** — child entity (queryable, expensive migration) vs. JSON longtext (simple, less queryable) vs. retire-and-rescrape on advancement (drops historical pile, recovers on demand). Lean: child entity for query power, but rescrape worth a real conversation.

Both forks need decision before code lands. Justin owns; Connor will react to draft plan.

## Doc to write

`docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md` — same shape as existing `docs/POSTGRES_TO_DATAVERSE_MIGRATION.md` for Wave 1. Skeleton + entity design + endpoint rewrite list + dependency order + rollback strategy.
