# Atlas: `akoya_request` (Dataverse, vendor entity + WMKF extensions)

**Last verified:** 2026-05-07 via `scripts/audit-dataverse-state.js`
**Live row count:** 5,000+ (probe capped at default page; total higher)
**Entity set:** `akoya_requests`

## Source of truth

**Master grant-request record.** AkoyaGO-vendor-owned core fields + WMKF-added `wmkf_*` extension fields. The lifecycle pivot for proposals — Reviewer Finder, Review Manager, Phase I/II Summaries, Grant Reporting all read here.

**No dedicated adapter** — accessed directly via `DynamicsService.queryRecords` / `DynamicsService.getRecord` / `DynamicsService.updateRecord` from many endpoints and services.

## Key fields (live, sample-probed 2026-05-07)

Identity / status:
- `akoya_requestid` (PK)
- `akoya_requestnum` (e.g. `1002787`) — natural join key, used by Postgres `reviewer_suggestions.request_number`
- `akoya_title`
- `akoya_requeststatus` (String — `Concept Pending | Phase I Pending | Phase II Pending | Accepted | ...`)
- `akoya_requesttype` (Picklist), `wmkf_request_type` (Picklist)
- `akoya_fiscalyear` (e.g. `December 2026`) — joins to `grant_cycles.short_code` via `cycle-code.js`
- `wmkf_meetingdate` (DateOnly)

Money / dates:
- `akoya_request` (requested amount), `akoya_paid`, `akoya_expenses`
- `akoya_loireceived`, `akoya_loiacknowledged`, `akoya_loirequestedamount`
- `akoya_begindate`, `akoya_enddate`
- `akoya_submitdate`, `akoya_submitdatetime`

People (lookups):
- `akoya_applicantid` → `accounts`
- `akoya_payee` → `accounts`
- `akoya_primarycontactid` → `contacts`
- `wmkf_projectleader`, `wmkf_researchleader`, `wmkf_ceo` → `contacts`
- `wmkf_copi1..5` → `contacts` (legacy 5-slot Co-PI roster — to be replaced by `wmkf_personnel` child entity per intake portal pilot)
- `wmkf_potentialreviewer1..5` → `wmkf_potentialreviewers` (legacy slots — actual reviewer state lives in `wmkf_appreviewersuggestion`)
- `wmkf_programdirector` (lead PD), `wmkf_programdirector2` (secondary, no reviewer assignment role) → `systemusers`
- `wmkf_programcoordinator` → `systemusers`
- `wmkf_grantprogram`, `wmkf_programareaserved` → vendor program entities
- `wmkf_type` → vendor type entity

Content / abstract:
- `wmkf_abstract` (full proposal abstract; added by WMKF, not in vendor schema)
- `wmkf_excludedreviewers` (free-form names)

WMKF AI writeback fields (canonical: `docs/DYNAMICS_AI_FIELDS_SPEC_v3_cn.md` — v2 is archived, do not use):
- `wmkf_ai_summary` (Memo) — Phase I summary text. **Field Set A: ready, live writeback active.**
- `wmkf_ai_dataextract` (Memo, JSON) — domain tags / structured extract. **Field Set A: ready.**
- `wmkf_ai_complianceissues` (Memo, JSON), `wmkf_ai_compliancesummary` (Memo). **Field Set C: ready.** (v3 also reuses existing `akoya_submissionaccepted`.) Note: live probe shows a numeric `wmkf_ai_compliancecheck` field on the entity; per the v3 spec this is part of an earlier draft that Connor is reconciling — do not write to `compliancecheck`, write to `complianceissues` + `compliancesummary`.
- `wmkf_ai_fitassessment` (Picklist) + `wmkf_ai_fitrationale` (Memo) — **Field Set D: ready.**

**Workflow-chaining fields (S139, deployed `b536121`)** — cached extractions so downstream prompts don't re-parse the narrative:
- `wmkf_ai_keywords` (Memo, JSON array, 4000), `wmkf_ai_methodologies` (Memo, JSON array, 4000), `wmkf_ai_riskflags` (Memo, JSON array, 4000)
- `wmkf_ai_teaminfo` (Memo, JSON object, 8000), `wmkf_ai_budgetsummary` (Memo, narrative, 8000), `wmkf_ai_timeline` (Memo, narrative, 8000)

**Field Set B (Grant Report) — DEPLOYED (S139, `b536121`).** 22 fields covering counts (postdocs / grad students / undergrads / pubs total / pubs peer-reviewed / pubs non-peer-reviewed / patents awarded / patents submitted), narrative summaries (additional funding, project impacts, awards & honors, implications, outcome summary, notes for staff), per-goal JSON (`wmkf_ai_reportgoalsassessment` at 32000 chars — documented exception to the flat-fields convention), top-2 publication triples (`wmkf_ai_reportpub{1,2}{citation,abstract,source}`), and overall rating (Picklist: Successful / Mixed / Unsuccessful). Schema spec: `lib/dataverse/schema/wave2-existing/akoya_request-ai-extensions.json`. Naming follows the v3 rule (`wmkf_ai_<concept>` with no underscore between concept words — so `wmkf_ai_riskflags`, NOT `wmkf_ai_risk_flags`). Wired up to Grant Reporting writeback when staff is ready; field shapes are stable.

**Cruft / do-not-write fields** [VERIFIED via `project_dynamics_ai_writeback.md`]:
- `wmkf__ai_summary` (double underscore) — exists alongside the real `wmkf_ai_summary`; Connor will delete. Do not target.
- `wmkf_ai_rundatetime` on `wmkf_ai_run` — vestigial; use built-in `createdon` instead.

WMKF status / flags (the long tail):
- `wmkf_phaseistatus` (Picklist), `wmkf_phaseiicheckincomplete` (Picklist), `wmkf_phistaffversioncompleteflag`
- `wmkf_readyforreview`, `wmkf_galreadyforreview`, `wmkf_pcgoverifycomplete` (Picklist)
- `wmkf_vendorverified` (Picklist), `wmkf_rationalesummarycompleted`
- `wmkf_groupexempt`, `wmkf_organizationisgovernmententity`, `wmkf_california`, `wmkf_caftb`, etc. — eligibility booleans

Sample row had **364 total fields** (vendor + WMKF + standard Dataverse audit fields). Most fields are vendor-owned and not touched by app code.

## Read paths (high-traffic)

- `lib/services/dynamics-service.js` (canonical client, all reads route here)
- `pages/api/dynamics-explorer/*` — natural-language query
- `pages/api/grant-reporting/*` — final-report extraction + writeback
- `pages/api/phase-i-dynamics/summarize.js` — Phase I summary writeback
- `pages/api/review-manager/*` — reviewer lifecycle
- `pages/api/reviewer-finder/{load-proposal,my-candidates,save-candidates}.js` — `load-proposal.js` (≈line 73) `getRecord('akoya_requests', requestId, { select: 'akoya_requestid,akoya_requestnum' })` to resolve request number for the SharePoint proposal lookup that follows
- `pages/api/grant-reporting/lookup-grant.js` — request lookup for Grant Reporting (`reviewer-finder/lookup-grant.js` does not exist; the original Atlas citation was wrong)
- `pages/api/reviewer-finder/my-proposals.js` (≈lines 80, 131) — `DynamicsService.queryAllRecords('akoya_requests', ...)` to list Phase-II-Pending proposals for the picker; cycle and PD filters applied
- `pages/api/expertise-finder/*`
- (NOT `pages/api/integrity-screener/*`, NOT `pages/api/virtual-review-panel.js` — both read no Dataverse. `integrity-service.js` imports only Postgres `sql`; `virtual-review-panel.js` is a single file (not a directory) that's PDF-upload-driven and Postgres-backed via `PanelReviewService`.)
- `lib/dataverse/adapters/reviewer-suggestion.js` `findByPD` — joins requests by lead PD

## Write paths (verified 2026-05-07)

- `pages/api/phase-i-dynamics/summarize.js` — writes ONLY `wmkf_ai_summary` (≈line 192) with pre-flight overwrite guard. The endpoint header comment defers `wmkf_ai_dataextract` (structured JSON) to "a later pass" — do not assume it writes structured fields.
- `lib/services/execute-prompt.js` (≈line 511) — Executor contract writer. **Dynamically writes to whichever `akoya_request` field the prompt's `target.field` declares.** Used by `pages/api/phase-i-dynamics/summarize-v2.js`. Same overwrite-guard pattern. This is the canonical AI writeback path going forward; phase-i-dynamics/summarize.js is the legacy direct path.
- (Dynamics Explorer does NOT write — its 11 tools are read-only: search, get_entity, get_related, describe_table, query_records, count_records, aggregate, find_reports_due, list_documents, search_documents, export_csv. The `dynamics_restrictions` table exists but no write-tools are wired in.)

> **Codex R7 corrections (2026-05-07):**
> - `pages/api/grant-reporting/extract.js` historically wrote only the `wmkf_ai_run` audit log row (the line 526 comment *"wmkf_ai_run row is therefore the ONLY durable copy of"* extracted data reflects that prior state). Field Set B fields were DEPLOYED on `akoya_request` 2026-05-07 (22 fields, see `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md`); wiring `grant-reporting/extract.js` to write the flat fields is a follow-up.
> - `pages/api/integrity-screener/*` writes screenings to **Postgres** `integrity_screenings` via `IntegrityService.saveScreening`; no `akoya_request` writes exist anywhere in integrity-screener or integrity service files.

All user-driven writes use `MSCRMCallerID` (impersonation contract per `docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md`); preview + prod flag now ON.

## Junction relationship (S139)

`wmkf_apprequestperson` is the new PI/co-PI history junction (5,561 rows after backfill). UNION-read with `_wmkf_projectleader_value` per `pages/api/reviewer-finder/contact-history.js`. Connor's PA flows (not yet shipped) will dual-write the junction alongside the projectleader lookup on create/update. Until then, the legacy `wmkf_copi1..5` slot lookups remain the only co-PI write path. Full details: [`atlas/dataverse-wmkf-apprequestperson.md`](dataverse-wmkf-apprequestperson.md).

## SharePoint linkage

`sharepointdocumentlocation` rows linked via `_regardingobjectid_value`; folder pattern `{requestNumber}_{guidNoHyphensUpper}`. Multiple libraries: `akoya_request` (active) + `RequestArchive1/2/3` (migrated). See `lib/utils/sharepoint-buckets.js` and `project_dynamics_explorer_archive_libs.md`.

## Cross-system

| Postgres | Dataverse | Notes |
|---|---|---|
| `reviewer_suggestions.request_number` | `akoya_request.akoya_requestnum` | natural join key |
| `proposal_searches.request_number` | same | (table empty) |
| `grant_cycles.short_code` | derives from `akoya_request.wmkf_meetingdate` via `cycle-code.js` | not stored on request |

## Migration disposition

Stays as the system of record. WMKF AI fields and lifecycle additions are merged into the vendor entity, not extracted.

## Open questions / gotchas

- 5,000+ rows; many vendor-only fields not in our scope. Don't accidentally touch fields outside the WMKF-owned set.
- The 5-slot `wmkf_copi1..5` and `wmkf_potentialreviewer1..5` patterns are vendor-conceived but feel artificial — they're being phased out via child entities (`wmkf_personnel`, `wmkf_appreviewersuggestion`). Code that reads slots directly should be flagged for migration.
