---
name: project_reviewer_identity_fragmentation
description: A peer reviewer's identity is scattered across 4 disjoint stores with no shared key — a hard constraint on Reviewer Manager → Dataverse
metadata:
  type: project
---
Discovered S158 by read-only probe (`scripts/probe-akoya-reviewer-linkage.js`, evidence `docs/atlas/evidence/akoya-reviewer-linkage-2026-05-16.txt`) while resolving Power Tools residual (ii). WMKF now pays peer reviewers a $250 honorarium, tracked as `akoya_request` rows (`wmkf_grantprogram=Honorarium`, `wmkf_type=Individual`, `akoya_program=Research Reviewer`, source GOapply, ~87 rows all 2026). Probing how the reviewer *person* is modelled exposed that one reviewer's identity exists in **≥4 disjoint representations with no shared key**:

1. **Dataverse `contact`** — via `akoya_primarycontactid` on the honorarium row. Real people (institutional email/jobtitle) but **auto-created by GOapply, uncurated**: inconsistent Active/Inactive, junk jobtitles ("title", "Program Coordinator or something"), no `parentcustomerid` org link. Some are staff test rows (wmkeck.org / Connor Noda).
2. **GOapply contact object** — `akoya_goapplysubmitter` → `akoya_akoyaapplycontact` (email-keyed), a *separate* portal-layer person record.
3. **The honorarium `akoya_request` row itself** — reviewer *activity/payment* buried in the grants entity (polymorphic reuse).
4. **Postgres `researchers`** — the existing Reviewer Finder pool, app-managed, entirely outside Dataverse (drain-only, W6 drop pending ≥2026-07-01 — see [[project_w6_table_drop_pending]]).

Email is the only natural join across these, and it is fragile (typos, role accounts, missing in the Postgres pool).

**Why:** The user explicitly flagged this as bearing on how the Reviewer Manager database is structured in Dataverse ([[project_reviewer_postgres_to_dataverse_migration]]). The 1:1 migration model assumed a cleaner mapping; this fragmentation + the dirty auto-created `contact` rows is a real, non-obvious constraint that is not derivable without this probe.

**How to apply:** Before/within the Reviewer Manager → Dataverse design, explicitly decide (a) the **canonical reviewer entity** (likely `contact`, but it needs de-dupe + curation — the GOapply-auto-created rows are not a roster) and (b) a **reconciliation key/strategy**, and **reuse existing identity machinery** ([[project_dynamics_identity_reconciliation]] — `dataverse-identity-map`, `dynamics-identity-service`, `contact-enrichment-service` 5-tier lookup, `program-director-resolver`) rather than inventing a new bridge. Track-B/Power-Tools angle: these honoraria are cleanly excluded from grant exports by `wmkf_grantprogram = Honorarium` (see [[project_dataverse_power_tools]]).
