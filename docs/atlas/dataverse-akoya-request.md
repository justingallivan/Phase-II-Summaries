# Atlas: `akoya_request` (Dataverse, vendor entity + WMKF extensions)

**Last verified:** 2026-05-07 via `scripts/audit-dataverse-state.js`; discriminator/era distributions 2026-05-15 via `scripts/probe-akoya-request-discriminators.js`
**Live row count:** **~25,561** (FetchXML aggregate, 2026-05-15). ⚠️ OData `/$count` returns **5,000** — Dataverse caps `$count` at 5,000; the "5,000" figure is the cap, not the total. Use FetchXML aggregate / RetrieveTotalRecordCount for the true count.
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
- `wmkf_copi1..5` → `contacts` (legacy 5-slot Co-PI roster — superseded by `wmkf_apprequestperson` junction since S139; intake portal pilot will extend that junction with `wmkf_effortpct` / `wmkf_biosketchurl` / `wmkf_lineorder` and expand `wmkf_role` to PI / Co-PI / Senior Personnel / Key Personnel / Other per 2026-05-14 schema review)
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
- `wmkf_ai_fitassessment` (Picklist) + `wmkf_ai_fitrationale` (Memo) — **Field Set D: ready.** *(⚠️ Label collision pending Connor confirmation: `docs/DYNAMICS_AI_FIELDS_SPEC_v3_cn.md:107` says Field Set D is PD Assignment and writes to existing `wmkf_programdirector` with no new fields. Both fit-assessment fields are deployed and populated live — the deployment isn't in doubt, the label is. Resolve before writing code that targets "Field Set D" by name.)*

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

## Polymorphism & era distribution (live-probed 2026-05-15)

`akoya_request` is **polymorphic** — "grant" is a *view* over it, not the entity. No single discriminator; it is a **composite**. ⚠️ **Correction (S157, 2026-05-16, `scripts/probe-akoya-field-dictionary.js` on a verified record):** the S157 composite `wmkf_request_type` × `wmkf_grantprogram` × `akoya_requesttype` **omitted a distinct axis** — the AkoyaGO UI field labelled **"Type"** is **`wmkf_type` (Lookup → `wmkf_type` table)**, *not* the `wmkf_request_type` Picklist. They are different concepts: `wmkf_request_type` (Picklist) = *interaction kind* (Request / Concept / Office Visit / …); `wmkf_type` (Lookup) = *grant type* (e.g. `Discretionary`). The discriminator is **hierarchical, not flat** (S157, `scripts/probe-akoya-wmkf-type-taxonomy.js`): `wmkf_type` is the **coarse top-level class** (`Program` / `Discretionary` / `Site Visit` / `Special Grants` / `Special Projects` / `Individual` / `Miscellaneous`); `wmkf_grantprogram` & `akoya_programid` are the **finer program axes nested under `wmkf_type=Program`**. They are NOT redundant — joint `wmkf_type`×`wmkf_grantprogram` same-label only 21%, and that 21% is entirely the `Discretionary`×`Discretionary` cell (5,345 = the Puzzle-1 invited/discretionary giving mode; the two axes are the *same population* there). 🔴 **Pervasive-polymorphism invariant:** *every* type-ish axis mixes grant categories with non-grant operational/interaction buckets — `Site Visit`/`Office Visit` in `wmkf_type` *and* `wmkf_request_type`; `Research Reviewer` in `akoya_program`; `Individual` (wmkf_type) ≡ `Research Reviewer` (akoya_program), same Jan-2026 all-native 87-row cohort. Any "real grants" filter must strip operational buckets on **every** axis. **`akoya_programid` ("Internal Program", Lookup → `akoya_program`) is form-required *now*** — the most granular program classifier (816 legacy nulls; better than `wmkf_grantprogram`'s 4,634-null but not guaranteed). Hazard differential: `wmkf_type` has *no* duplicate-name issue + low null (159) — "key by GUID" is a defensive default justified by `akoya_program` specifically, not universal. Business-label → logical map for the program/type cluster: "Type"→`wmkf_type`, "Grant Program"→`wmkf_grantprogram`, "Internal Program"→`akoya_programid` (all Lookups). Counts below are still valid per-field; re-probe `wmkf_type`/`akoya_programid` distributions before relying on the type taxonomy. FetchXML aggregate counts (within the 50k aggregate reliable range):

- `akoya_requesttype` (Picklist): `Grant` 25,473 · `Scholarship` 88 · (`Interfund`/`Program Expense` defined but unused). Too coarse to use alone.
- `wmkf_request_type` (Picklist): `Request` 16,227 · `Concept` 3,273 · `Office Visit` 2,826 · `Site Visit` 1,528 · `Phone Call` 914 · *null* 706 · `Individual` 87. **`Concept` = feedback-only, not a funding ask. Office/Site Visit + Phone Call (~5,268) are interaction logs, not grants.**
- `wmkf_grantprogram` (lookup): `Research` 8,500 · `Discretionary` 5,345 · *null* **4,634** · `Southern California` 4,489 · `Undergraduate Education` 2,017 · `Young Scholars` 326 · `Honorarium` 87 · `Law` 62 · `Strategic Fund` 47 · `Other` 43 · `Emeritus` 7 · `Memorial` 4. **SoCal is its own large separate-process program; Discretionary is high-volume staff-directed giving; ~4,634 rows have NO program (data-quality hole for "all grants to X").**
- `akoya_requeststatus` (String): 24 live values — `Closed` 7,479 · `Phase I Declined` 5,905 · `Concept Done` 3,047 · `Office Visit` 2,826 · `Site Visit` 1,528 · `Phone Call` 914 · `Approved` 766 · `Phase II Declined` 707 · … (interaction types also appear here as status — overlapping/messy). Note the 2026-05-07 "Key fields" line listing `Accepted` is stale — no live `Accepted`; closest is `Approved`.
- `akoya_programid` ("Internal Program", **Lookup → `akoya_program`**, entity set `akoya_programs`) — the granular program axis, **distinct from `wmkf_grantprogram`** (different taxonomy/granularity: `akoya_program` splits Undergraduate Education into *Liberal Arts* 861 + *Science & Engineering* 2,583; `wmkf_grantprogram` has a single `Undergraduate Education` 2,017 — the two do NOT map 1:1). Authoritative taxonomy = **24 programs** (`scripts/probe-akoya-program-taxonomy.js`, 2026-05-16, GUID-keyed). **816 rows null** (form-required *now* but legacy/migrated rows precede that — better than `wmkf_grantprogram`'s 4,634-null but NOT "always populated"; the earlier "required ⇒ ~always" was too strong). Top: `Medical Research` 4,763 · `Science and Engineering Research` 4,632 · `Civic & Community` 2,790 · `Undergraduate Ed - Sci&Eng` 2,583 · `Directors' Directed Grant Program` 1,841 · …. **🔴 Three Track B hazards:** (1) **duplicate name** — `Law and Legal Administration` exists twice (2023-11-30 *Inactive*, 0 requests; 2024-02-15 *Active*, 62) — data is clean (all on the Active GUID) but a name-keyed filter can pick the empty one; filter by GUID. (2) **era-scoped programs** — `Strategic Fund` (created 2024-08-19), `Disaster Relief` (2025-01-23), `Bridge Funding` (2025-09-03), `Research Reviewer` (2026-01-06) have **0 migrated** rows: a pre-creation grant *cannot* be in them; conversely `Undergraduate Education - Liberal Arts` (861, all migrated, 0 native) is legacy-retired. A program filter must be era-aware. (3) **non-grant operational buckets** — `Research Reviewer` (87, all native, created 2026-01) is a reviewer-tracking bucket, not a grant program (polymorphism, like Office-Visit in `wmkf_request_type`). Creation waves: 14 programs 2023-11-30 (founding seed, 3 days before the request import), 6 on 2024-02-15, then incremental — **the taxonomy is living, not static.**
- `statecode`: 0 (active) 25,518 · 1 (inactive) 43.

**Era — boundary is precise and Dataverse-derived (2026-05-16, `scripts/probe-akoya-createdon-2023.js`):** `createdon` by year — **2023: 22,573** · 2024: 1,167 · 2025: 1,376 · 2026: 445. Day-level drill: **100% of the 2023 cohort (22,573 rows) was created on a single date, 2023-12-03**, within one ~43-minute window (`2023-12-03T17:42:10Z … 2023-12-03T18:25:32Z`). Zero native creates anywhere in 2023; the 2,988 native rows are all 2024+ (1,167 + 1,376 + 445 = 2,988; 22,573 + 2,988 = 25,561 ✓). Unambiguous single bulk-import event. **Practical native-vs-migrated classifier (no external dependency): `createdon` on 2023-12-03 ⇒ migrated/historical; `createdon` after 2023-12-03 ⇒ Akoya-native (clean, Connor-authoritative).** The *system* create date of migrated rows is gone — `overriddencreatedon` is **null on 100% of rows (0 / 25,561)** (DISCONFIRMED as an era marker, 2026-05-16 `scripts/probe-akoya-overriddencreatedon.js`, FetchXML aggregates not `$count`). **But the true business history was preserved in a domain field — see below.** Connor / AkoyaGo are a **cross-check on the 2023-12-03 go-live**, no longer a blocker for the era classifier. The earlier "cutover ~2023, confirm with Connor" / "inconclusive `overriddencreatedon`" framings are superseded.

**Era field-shape — what changed Blackbaud→AkoyaGO (2026-05-16; rates are EXACT full-cohort FetchXML aggregates from `scripts/probe-akoya-export-col-rates.js`, migrated tot=22,573 / native tot=2,988).** The prior grant system was **Blackbaud (a.k.a. "Sky")**; the 2023-12-03 import was the cutover. ⚠️ The initial `probe-akoya-era-field-shape.js` n=1,200 GUID-ordered sample was **proven biased** in the migrated cohort (`probe-akoya-era-robustness.js`: `akoya_grant` asc 95% / desc 61%; `grantprogram` asc 58% / desc 99%) — exact rates below supersede it. **Historical key:** `akoya_decisiondate` is **100% migrated / 31% native** with a reproducible realistic spread (1950s:6 · 1980s:1,929 · 2000s:5,249 · 2010s:7,636 · 2020s:3,646; **zero pre-1954** — Keck founded 1954; `probe-akoya-era-robustness.js` block d); the reliable historical-year key for the migrated cohort (mirror `wmkf_meetingdate`), *not* `createdon` (collapsed) or `akoya_datereceived` (7% mig). **Bound (S157, `scripts/probe-akoya-decline-recording.js`):** presence on *declined* rows is era-dependent — migrated declined = 100% `akoya_decisiondate`, native declined = 10%. The dates remain real (decade spread clean); but a declined row carrying a decision date is a migrated-era property, not era-stable. **Measured ≥97% both cohorts:** `akoya_requestnum` (human Request #), `akoya_requesttype`, `wmkf_request_type` (97/99), `akoya_requeststatus`, `statecode`, `akoya_applicantid` (100/97), `wmkf_meetingdate`, `akoya_fiscalyear`, `akoya_paid` (`akoya_programid` 99/80 just below). **Amount-field gap is field-specific:** `akoya_grant`/`akoya_originalgrantamount` 84% mig / ~32% nat = **confirmed lifecycle confound** (native-decided 95% / 99% resp., not-decided ≈3% — both stratified, `probe-akoya-era-robustness.js` block c); `akoya_request`/`akoya_expenses` 100% mig / ~46% nat = **migration backfill artifact + request-type mix, NOT a mystery** (`scripts/probe-akoya-request-by-type.js`): migrated 100% even on Office-Visit/Phone-Call rows that can't have a budget ⇒ import backfill, **never export migrated `akoya_request`/`akoya_expenses` as a real amount**; native `Concept` 11% (feedback-only, no budget); native `Request`-type 68% — the 32% with no ask are invited/discretionary giving (`scripts/probe-akoya-native-request-amount.js`: 577/582 `Approved`, 93% awarded, 98% paid; requested-amount N/A by design). **Puzzle fully resolved, no Connor input needed.** Export rule: requested-amount nulls are class-aware sentinels (migration-backfill / feedback-request / invited-discretionary-award / not-captured), never bare blanks. **Full table + 5-bucket classification + disclosure spec: `docs/DATAVERSE_POWER_TOOLS_DESIGN.md` → "Artifact 3".** **Net-new in AkoyaGO (~28 fields, 0% migrated by nature, not loss):** the GOapply online-intake + review-workflow layer (`akoya_goapply*`, `wmkf_readyforreview`, eligibility/completion flags, `akoya_requestsource`, `akoya_submitdatetime`). **Blackbaud lineage retained as columns:** `wmkf_bbstatus` (BB Status, mig 100/nat 9) + `wmkf_bbstaffid` (BB Staff ID, mig 90/nat 10) — secondary migrated-cohort confirmation; `_wmkf_programlevel2_value` the lone migrated-only field. The earlier "Bucket C = Blackbaud didn't capture this" framing is **retracted** — exact rates (`wmkf_grantprogram` 80/99, `akoya_primarycontactid` 70/77) are substantively present in both eras; the migrated shortfall's cause is not isolated. **Decided-state predicate (2026-05-16, `scripts/probe-akoya-status-predicate.js`):** `akoya_requeststatus` (String, 100% both eras) is the lifecycle field — Pending family `Phase I/II Pending`/`Concept Pending`/`Pending` (native ~474 rows) is a clean undecided signal (100% no decision date, 0% leakage). **`akoya_decisiondate` is NOT a "decided" flag — it is an *approval* stamp** (probe-tested status-class cross-tab, native): `APPROVED` 89% / `CLOSED` 100% carry a date vs `DECLINED/INELIGIBLE` 10% / `CONCEPT DONE` 13% / `PENDING` 0%; **1,490** terminal-decided rows (declined/ineligible/concept-done/closed) carry no date (exact, summed — not inferred). Use the `akoya_requeststatus` class map for "decided," not decision-date presence. (`Active` is 94% date-present ⇒ funded-in-progress, not in-flight; `Withdrawn` n=7/0%-date — both Connor-ambiguous-middle.) **Decline-reason recording relocated across the migration (S157, `scripts/probe-akoya-decline-recording.js`):** within declined requests, migrated uses the structured Picklist `akoya_denialreason` (98%, *not* backfill — 0% on Approved both eras), native abandoned it (8%) for free-text Memo `wmkf_denialnotes` (47%). Track B "denial reason" must be era-aware (`akoya_denialreason` migrated / `wmkf_denialnotes` native); a single-field export shows a false post-2023-12-03 cliff. ≤~50% of native declines have a reason in *either* field (Akoya-era data-quality gap). Stage detail (`scripts/probe-akoya-decline-by-stage.js`): Blackbaud enforced structured capture ~97–100% across *all* migrated decline stages; native is sporadic & stage-inconsistent — triage-out unrecorded by process (`Proposal Not Invited` 2%, `Concept Ineligible` 6%), best native = `Phase I Declined` 62% (n=640); NOT a monotonic gradient (Phase II Declined 10% but n=20, weak). ⚠️ **Field-only blind spot (user-provided backstory, S157):** the decline probes measured Dataverse fields only. Research process: Phase I-invited and *all* Phase II declines have the rationale in a **SharePoint Word doc on the request**, not a field — so "≤50% undocumented" really means "≤50% have a reason *in a field*"; Track B (Dataverse export) structurally **cannot see** the doc rationale (hard scope boundary). Early post-AkoyaGo all Phase I had a rationale doc (field intentionally empty); triaged-Phase-I later went undocumented/shadow-Excel (no enforcement); research is **NOT dropping Phase I** (user-corrected S157) — consolidating to a single-submission model (one robust Phase I replaces the old short-Phase-I→separate-Phase-II-package two-step; advancement to "Phase II" = a **status promotion on the same `akoya_request` record**, original submission migrates, no new doc/package/entity). Decline capture separately moving toward standardized reason options + "Other". 🔴 **"Phase II" is process-era-dependent** (pre-change = separate package; post-change = same record promoted by status) — counting "Phase II proposals" across that boundary conflates two different things. **All S157 decline findings are research-process-specific** — SoCal (own `wmkf_socalreasonsfordecline2`, Virtual) and discretionary are separate processes; decline analysis must be program-segmented. Track B declined-null categories: with-field-reason / triage-no-reason-expected / rationale-in-doc (Track B blind) / shadow-Excel (irrecoverable) / genuinely-missing. Meta: backfill is field-specific — `akoya_request` was backfilled, `akoya_denialreason` was not; no blanket migrated-high rule.

## Migration disposition

Stays as the system of record. WMKF AI fields and lifecycle additions are merged into the vendor entity, not extracted.

## Open questions / gotchas

- **~25,561 rows** (not "5,000" — that is the OData `$count` cap; see header). Many vendor-only fields not in our scope. Don't accidentally touch fields outside the WMKF-owned set.
- The 5-slot `wmkf_copi1..5` and `wmkf_potentialreviewer1..5` patterns are vendor-conceived but feel artificial — they're being phased out via child entities (`wmkf_apprequestperson` extended per 2026-05-14 schema review for roster, `wmkf_appreviewersuggestion` for reviewer state). Code that reads slots directly should be flagged for migration.
