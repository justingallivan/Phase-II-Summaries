# Dataverse Power Tools — Scoping & Design

**Status (2026-05-15, Session 156):** Track A and Track B designs **converged at the scoping level**. This is NOT yet a build plan. Per the project ground-truth rule, implementation is gated on explicit follow-ups recorded under "Gated next steps." This doc has been reconciled against an independent Codex source review (see "Codex review reconciliation").

**Origin:** Dynamics Explorer (`pages/api/dynamics-explorer/chat.js`) serves the "most users, simple question" case well. Two gaps it structurally cannot fill remain, currently absorbed by the AkoyaGo model-driven app (functional but poor UX):

1. Staff who must keep the database current need to **find a specific record and edit a field**.
2. Users — including non-technical ones; the triggering example was a CSO-level ask for ~5,000 requests as a downloadable Excel — need **filtered data at a volume Dynamics Explorer cannot return**.

**Two separate apps, different risk profiles.** Track A is a write tool over targeted single records; Track B is a read-only bulk export. Keeping them apart means neither compromises for the other and fits the existing "skinny scope, leverage existing infra" philosophy (`.claude-memory/project_intake_portal_skinny_scope.md`). They are siblings on the long-game GOapply/Akoya-replacement arc and share an architectural spine (see "Shared spine"), not a side quest.

---

## Existing infrastructure (verified against `lib/services/dynamics-service.js`, S156)

This is largely an assembly + UX job over existing primitives, not new infrastructure. Claims below were read from source and independently re-checked by Codex (file:line cited where load-bearing).

- **`queryRecords()`** — agentic Explorer query tool, hard-capped at `$top` 100, requires `$filter` or `$top<=25` (deliberate LLM context guard). Structurally wrong for bulk export. Calls `checkRestriction` (dynamics-service.js:445-447).
- **`queryAllRecords()`** — paginates via `@odata.nextLink` (`EXPORT_PAGE_SIZE=500` via `Prefer: odata.maxpagesize`), requires a `$filter` (no unfiltered dumps), returns `{ records, totalCount, capped }`, `$count=true`. `MAX_EXPORT_RECORDS=5000` is an **arbitrary guardrail** (bare constant, no rationale, hard `break`+truncate). **Correction (Codex):** truncation is NOT silent at the helper level — `capped`/`totalCount` are returned (dynamics-service.js:661-672) and the existing Explorer export path already sends `recordCount`/`totalCount`/`capped` to the client (chat.js:1727-1734). The real defect is arbitrary cap + the *UI not surfacing* the signal, not a silent helper. Per-page `API_TIMEOUT=30_000` (30s). **No 429/throttling/retry/`Retry-After` handling**; `fetchWithTimeout` only aborts on timeout (dynamics-service.js:1324-1337); `queryAllRecords` throws on first non-200 (dynamics-service.js:647-651). Accumulates all rows in memory before returning.
- **`searchRecords()`** — Dataverse Search API, relevance-ranked, entity-spanning via an `entities` string array, optional OData `filter`, `returntotalrecordcount`. **Correction (Codex):** `top` is `Math.min(top||20,100)` — upper-bounded at 100, **no lower bound** (dynamics-service.js:700-703); earlier "clamped 1–100" was inaccurate. Only Dataverse-Search-indexed tables are covered.
- **`getEntityAttributes()`** — returns `{ logicalName, displayName(localized), type, description, isRequired }`, filtered to `IsValidForRead`. **Confirmed (Codex):** the request `$select` includes `IsValidForCreate,IsValidForUpdate` (dynamics-service.js:364) but the returned object **drops both** (dynamics-service.js:377-383). It also selects none of `SourceType`/`AttributeOf`/`IsPrimaryId` — so it cannot distinguish calculated/rollup/formula/logical fields.
- **`getRecord()` → `processAnnotations()`** — emits `${field}_formatted` / `${field}_entity` and preserves `_etag` for If-Match. **Correction (Codex):** these annotations appear **only when Dataverse returns them** (field in `$select` and the field actually has a formatted value / lookup) — not universally on every field.
- **`getEntityRelationships()`** — returns `manyToOne.referencedEntity` (lookup targets, phase-2). **Correction (Codex):** unlike `getEntityAttributes`, it does **not** call `checkRestriction` (dynamics-service.js:392-414 vs 353-354) — a metadata-leak gap for phase-2 lookup editing.
- **`updateRecord()`** — PATCH. **Critical (Codex):** does **not** call `checkRestriction` before writing (dynamics-service.js:814-826), unlike the read paths. A Track A write endpoint built naïvely on it bypasses the restriction model.
- **`_withCallerId()` / `_writeFetch()`** — **Critical (Codex):** `MSCRMCallerID` is only added when `DYNAMICS_IMPERSONATION_ENABLED==='true'` (dynamics-service.js:166-170); `_writeFetch` retries a 403 *without* the caller id (dynamics-service.js:188-201); the identity doc documents the fallback as "attribution falls back to the service principal" (`docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md:84-90`). User attribution is **not guaranteed** by the runtime.
- **`exceljs`** — already a dependency, already used in `chat.js` (which has a 3 MB XLSX trim guard, chat.js:1603/1711-1723).

---

## Shared spine (both tracks)

Same discipline, mirrored: **AI (where used) proposes; deterministic code performs the privileged operation; a human-confirmation gate sits between.** Track A: *which field do I edit?* Track B: *what exactly am I asking for?* Compiler, not interpreter — the opposite of Dynamics Explorer, which interprets intent and acts. This is the invariant that keeps either tool from regressing into "Explorer 2": **the AI never executes, never paginates data, never sees the result set; it only emits a reviewable structured spec.**

---

## Track A — "Find & fix" (maintenance staff)

The real product is **not "edit a field"** — the edit is trivial. The hard part is **field discovery** across a huge field tail (WMKF custom + AkoyaGo + a large unused remainder). Per user: the vast majority of maintenance is surgical edits to already-populated fields in relatively few fields.

**Find.** One search box backed by `searchRecords()`. Entry varies (request # / institution / email / PI name); full-text entity-spanning search funnels all of them → ranked candidates → user picks one. Not a filter builder. (Shallow overlap with Track B: relevance lookup vs. deterministic bulk filter.)

**Fix (primary primitive).** Open the record → `getRecord` without `$select` → render **only populated fields, with human display labels** → inline edit. Hundreds of possible fields collapse to the ~30–50 actually populated. Directly answers "obscure data I can't name" for the common (already-populated) case. The read/display path is well-supported by existing code.

**Fix (secondary, empty fields).** Label/description search over `getEntityAttributes` metadata. The one place an LLM legitimately helps ("which field is that?"); the write stays deterministic + confirmed.

**Typed-field handling (the engineering meat).** Type-aware editor. **v1 scope line:** safe scalar types (text/number/date/yes-no) editable; optionsets and lookups **read-only** (phase 2). Composes three sources: (1) `getEntityAttributes` extended to surface `IsValidForUpdate`; (2) `getRecord`→`processAnnotations` for `_formatted`/`_entity` display values; (3) `getEntityRelationships()` for lookup targets (phase 2). `_etag` is preserved on every `getRecord`, so an If-Match guarded write is cheap.

### Track A — blocking write-policy decisions (Codex; required before a v1 build plan)

The read/display path has **no blocking unknowns**. The **write** path does — three explicit decisions, not assumptions:

1. **Attribution enforcement.** `MSCRMCallerID` is not guaranteed (env-gated; 403 retries without it; falls back to service principal). The v1 write endpoint must **fail closed or surface a hard warning** when attribution would fall back — it cannot claim "attributed to the acting staffer" as a given.
2. **Restriction enforcement.** `updateRecord` does not call `checkRestriction`. The Track A write path must explicitly enforce table+field restriction **before** calling it, or it silently bypasses the existing model.
3. **Dangerous-scalar exclusion.** `IsValidForUpdate=true` is not sufficient — calculated/rollup/formula/logical fields can be "updatable" yet error or silently discard the write. The metadata fetch must additionally select/inspect `SourceType`/`AttributeOf`/`IsPrimaryId` (etc.) and exclude those, even within "safe scalar" types.

**Track A edit mode (v1):** single-record find → edit; no bulk write. (Selected-set / spreadsheet round-trip are deliberate later phases.)

### Audit / change-history capability (S156 probe — `scripts/probe-dataverse-audit-capability.js`)

User hypothesis: fields with multiple audit versions reveal what staff actually edit; use that to prioritize the editor. Probed read-only against prod. Findings, with Codex review folded in — **stated conservatively; this is weaker than the hypothesis hoped:**

- **Auditing is on and broad.** Org `isauditenabled=true`; `akoya_request` 407/577 attrs audited, `contact` 267/411. The data exists.
- **Single-query dataset-wide aggregate is unavailable** — the app service principal lacks `ReadAuditSummary` (403), *and* Dataverse audit `RetrieveMultiple` requires exactly one top-level `objectid` condition. **Not over-claimed as "categorically impossible":** only the one-shot aggregate query is ruled out; iterated per-record (or batched per-`objectid`) remains. The probe tested the `objecttypecode` shape, not the single-`objectid` shape, so the precise privilege/shape boundary is only partially mapped.
- **Per-record `RetrieveRecordChangeHistory` returned 200 — on ONE `akoya_request` only.** This is a demonstration, **not a generalized capability** (Codex Critical). Untested across other entities (`contact`), eras (legacy/migrated/pre-audit-enablement records), and record states (inactive); any could return empty, partial, or a different privilege error.

**Caveats that materially weaken the hypothesis (do not treat change-frequency as a clean signal):**

1. **Change frequency conflates automation with human edits.** Power-Automate / workflow / rollup / status writes dominate high-frequency fields — which are often *exactly* the fields staff must NOT edit. Frequency is a biased proxy for "fields maintenance staff edit," not a direct measure.
2. **Privilege fragility as a feature dependency.** `RetrieveRecordChangeHistory` rides an independently-scoped audit privilege that can be revoked/re-scoped without affecting normal record read — a feature built on it can break invisibly.
3. **Sampling encodes era/migration bias.** A sample of currently-retrievable records overrepresents Akoya-native (full history) and underrepresents legacy migrated records — which may be the *primary* maintenance-edit targets. A naïve sample would overfit the wrong population.
4. **Dedupe is non-trivial.** Any frequency tally must drop annotation twins (`@…FormattedValue`, `@odata.type`) and metadata-confirmed currency `_base` shadows (mirror `dynamics-service.js:1228-1255`), not naïve underscore-stripping, or it double-counts / hides real fields.
5. **Throttle exposure.** A 300–500 per-record sampling job inherits the no-429/no-backoff gap (`dynamics-service.js:1324-1337`; `queryAllRecords` throws on first non-OK) — it can fail or silently produce a partial sample.

**Executed (S156) — the sampled analysis was actually run** (`scripts/analyze-akoya-request-change-of-state.js` then `scripts/analyze-akoya-request-staff-edits.js`), 800 Akoya-native records total (cohort `createdon >= 2024-01-01`, the 2023 migration bulk excluded), 800/800 retrieved, zero throttling. **Canonical method:** classify every changing user against `systemuser` metadata — `applicationid` set ⇒ application/integration user (definitive); plus an explicit vendor name exclusion (`Bromelkamp` = the AkoyaGO vendor, `# ` app-user convention, `akoyaGO`/`integration`). Name-regex alone is insufficient (it missed `Bromelkamp Admin`); the metadata + explicit-vendor-list method is the one to reuse.

Results:
- **Raw change-frequency: disconfirmed** as a prioritization proxy (Codex was right, now with data). The application user `# BCO akoyaGO Integration` alone accounts for ~12,742 of the changes; automation dominates the raw signal.
- **Staff-attributed signal: usable, with a shape filter.** Of 19 distinct changing actors, 17 are real WMKF staff (2 non-staff: the integration app user + the vendor admin). The staff-only ranking still splits into (a) **lifecycle/process** fields (status / verify-complete / ready-for-review flags — high `nonstaff` co-touch; workflow, *not* maintenance) and (b) **corrective/content** fields — `nonstaff ≈ 0`, free-text/decision/classification semantics: `wmkf_denialnotes`, `wmkf_conceptpapernotes`, `wmkf_wmkfprojectdescription`, `wmkf_goverifyreviewedby`, `wmkf_paymentoption`, `akoya_recommendedamount`, `akoya_grant`, `akoya_title`, and the classification fields `akoya_programid`/`wmkf_grantprogram`/`akoya_payee`/`akoya_applicantid`. **(b) is the genuine Track A maintenance signal**, extractable as "staff-attributed changes on content/decision fields with near-zero integration co-editing" — not raw frequency.
- **Concrete artifacts produced:** (1) per-record change history is reliable at scale (800/800) — strongly validates the *point-of-edit* feature; (2) an empirical **WMKF maintenance-staff roster** (Hassas, Seeley, Noda, Hibler, Kwan, Garacochea, Gage, Stone, Pallais, Cumming, …) — a solid Track A access-scoping input; (3) staff actively correct `wmkf_grantprogram` (92×), directly linked to the Track B 4,634-null-program data-quality hole.

**Net position (revised, evidence-based):** per-record change history *inline at point-of-edit* is validated and is a **candidate Track A enhancement** (still not a v1 dependency — privilege fragility remains). Raw-frequency prioritization stays **disconfirmed**, but the **staff-attributed + content-field-shaped** signal is **usable** for editor prioritization, and the **staff roster** is a concrete access-scoping artifact. Caveats kept: n=800 indicative not exhaustive; the lifecycle-vs-corrective split is semantic interpretation, not a hard field flag; "staff" = not-app-user ∧ not-vendor-name (auditable, method above).

---

## Track B — "Bulk export" (volume users) — converged design

Read-only. Lower write-risk, but **higher correctness-risk** than first assumed. The naïve framing ("filter → page → Excel") is wrong because the data model and the user population both push back.

### Threat model recalibration

Users are PhDs / lawyers / MBAs who take ownership of their analyses ("*I* performed this analysis") and have working BS detectors. These are not banking ledgers; nobody expects old records to balance or be complete. **The dominant risk is therefore NOT naïve trust of an obviously-wrong number** (their judgment + ownership culture catch "$2M to Stanford over 20 years"). **It is the *plausible* wrong number that passes the sniff test** — "52 research grants to UW since 2015" when the truth is 57 because 5 were misclassified or used a SoCal naming variant. Nobody gut-checks 52 vs 57.

**Consequence:** concentrate the correctness budget on the error class human judgment *cannot* backstop — **composition / era / classification disclosure** — and *drop* canon-grade defensive armor (sentinel-everywhere paranoia, "spreadsheet becomes truth" hardening). Provenance is reframed from a defensive warning label into a **reproducible methods section** so the accountable analyst can stand behind and reproduce the number.

### Product thesis

> The tool's core value is forcing the latent ambiguities — **which type** (polymorphism), **which era** (boundary), **what does "2021" mean** (date-basis), **which "budget"** (amount fan-out), **which "Stanford"** (institution record) — into **explicit, plain-English choices**, then producing a **reproducible, honestly-characterized chunk** the accountable expert refines in Excel.

### Why this is hard: the data model fights back

- **`request` is polymorphic; "grant" is a *view* over it, not the entity.** `akoya_request` is the base entity (docs/payments hang off it). It holds: research grants (status pending/awarded/…), **research concepts** (feedback-only, no money), **SoCal program** requests (separate process, possibly different field naming/values), **discretionary awards** (small $, very high volume — staff-directed giving), and **other projects** ($100M building-type awards). Not every request is a grant. A naïve "all grants to UW" against the polymorph silently mis-counts. The semantic layer's core artifact is a **type taxonomy + discriminator field(s)** — derived from data, not invented.
- **Temporal polymorphism.** 70-year-old foundation: file cabinets → **Blackbaud ("Sky")** → AkoyaGo (one bulk import, 2023-12-03), with field remapping. Recent Akoya-native data is clean and Connor-authoritative; migrated data is approximate but **less lossy than first assumed** — the field-shape probe (see Evidence) shows core grant facts came across ~1:1 and `akoya_decisiondate` preserves true dates back to 1955. What's actually gone is the *system* create date, not the business history. "Ever" in the triggering query is **rhetorical** — real bulk searches go back ~20 years at most, mostly recent. **Deep-history is out of Track B v1 by design** (a deliberate scope choice, *not* a data-availability limit): a "find the 1986 Stanford building award" need is a Track A / Explorer *find-one* pattern, not bulk aggregation, and must not contaminate Track B's semantic layer.
- **Completeness is a property of (field × era), not the dataset.** A correctly-classified 1993 grant can still have an empty/illegible co-PI (scanned form, never transcribed). The silent failure in a new costume: blank → `""` in Excel reads as "no co-PI" when the truth is "never captured." The tool must distinguish **null-because-absent** from **null-because-never-captured** and must NOT attempt historical recovery (no OCR heroics) — only refuse to misrepresent sparsity. Expectations are already calibrated; this is cheap honesty, not archaeology.

### Evidence (live probe 2026-05-15 — `scripts/probe-akoya-request-discriminators.js`)

Gated step #1 substantially executed. Confirms the polymorphism thesis with numbers (full distributions + caveats in `docs/atlas/dataverse-akoya-request.md`):

- **The discriminator is a composite, empirically:** `wmkf_request_type` (Request 16,227 · Concept 3,273 · Office/Site Visit + Phone Call ~5,268 interaction logs · null 706) × `wmkf_grantprogram` (Research 8,500 · Discretionary 5,345 · **null 4,634** · Southern California 4,489 · Undergraduate Education 2,017 · …) × `akoya_requesttype` (Grant 25,473 · Scholarship 88). No single field works. Every user-described slice is confirmed with volume; the **4,634 null-program** rows are a real data-quality hole for "all grants to X."
- **🔴 Hard Track B engineering requirement (promote): never use OData `$count`.** Live `/akoya_requests/$count` returned **5,000**; true total via FetchXML aggregate is **~25,561**. Dataverse caps `$count` at 5,000 — a silent ~80% undercount that *looks exactly like* the triggering "~5,000 requests." The honest-total path MUST be FetchXML aggregate / RetrieveTotalRecordCount, not `$count`. This is no longer just a UI concern — it is a correctness invariant of the export engine.
- **Era boundary is PRECISE and Dataverse-derived — no external dependency (2026-05-16, `scripts/probe-akoya-createdon-2023.js`).** Day-level drill of the 2023 cohort: **100% of the 22,573 rows were created on a single date, 2023-12-03**, inside one ~43-minute window (`17:42:10Z … 18:25:32Z`). Zero native creates anywhere in 2023; the 2,988 native rows are all 2024+ (1,167 + 1,376 + 445; 22,573 + 2,988 = 25,561 ✓). One clean bulk-import event. **The native-vs-migrated classifier is therefore solo-derivable and exact: `createdon` = 2023-12-03 ⇒ migrated/historical; `createdon` > 2023-12-03 ⇒ Akoya-native (clean, Connor-authoritative).** The Track B semantic-layer "era" artifact is now a fixed predicate against `createdon`, not an externally-supplied parameter.
- **`overriddencreatedon` DISCONFIRMED as an era marker (2026-05-16 — `scripts/probe-akoya-overriddencreatedon.js`, FetchXML aggregates, never `$count`).** `overriddencreatedon` is **null on 100% of rows (0 / 25,561)** — the import preserved no *system* origin date. The prior "inconclusive" was a `$count`-cap artifact. The era *classifier* is unaffected (it keys off `createdon`, above). **CORRECTION (2026-05-16, supersedes the earlier "true dates irrecoverable" claim in this doc/commit `3c3044d`):** that conclusion over-generalized from `overriddencreatedon` (a *system* field) to all dates and is **wrong**. The true historical date *was* preserved — in the domain field **`akoya_decisiondate`** (see the field-shape bullet below). Deep-history exclusion from Track B v1 is therefore a deliberate **scope** choice, *not* a data-availability limit.
- **Era field-shape probed — the data model differs substantially by era, but mostly in the *process layer*, not the analytical core (2026-05-16, `scripts/probe-akoya-era-field-shape.js`; n=1,200/cohort, GUID-ordered).** Migrated = `createdon` 2023-12-03 (Blackbaud/"Sky"-origin), native = after (AkoyaGO-born). Findings:
  - **Core grant facts were ~1:1 migrated and carry true history.** `akoya_decisiondate` is **100% populated in the migrated cohort** with a clean, realistic spread — 1950s:6 · 1980s:1,929 · 2000s:5,249 · 2010s:7,636 · 2020s:3,646, **zero pre-1954** (Keck Foundation founded 1954; first decisions 1955 — internally consistent, so the field is trustworthy as a real historical key). `wmkf_meetingdate` mirrors it (corroboration; 4 future-dated typo rows — minor). **A real "2021 vs 2022 vs 2023" cut is possible today** (decisions: 2021=824, 2022=954, 2023=986) — keyed on `akoya_decisiondate`, never `createdon`. Amount fields split (exact full-cohort rates, see Artifact 3): `akoya_grant`/`akoya_originalgrantamount` 84% mig / ~32% nat = a **confirmed lifecycle confound** (native-decided ≈95%, native-not-decided ≈3%); `akoya_request`/`akoya_expenses` 100% mig / ~46% nat = **NOT lifecycle** (native-decided ≈ native-not-decided ≈46% — a structural/migration gap, cause UNVERIFIED pending Connor). Full per-column rates: see "Artifact 3 — Field-Availability Boundary" below.
  - **Net-new in AkoyaGO (0% migrated by nature, not data loss):** ~28 fields, almost all `wmkf_*` — the online-intake/workflow layer Blackbaud never had: GOapply lookups (`akoya_goapplyapplication/settings/submitter`), review-workflow booleans (`wmkf_readyforreview`, `wmkf_galreadyforreview`, eligibility/completion flags), `akoya_requestsource`, `akoya_submitdatetime`.
  - **Blackbaud lineage carried forward as columns:** `_wmkf_bbstatus_value` (BB Status, mig 100%/nat 8%) and `wmkf_bbstaffid` (BB Staff ID, mig 88%/nat 8%) — explicit provenance fields usable as a **secondary migrated-cohort confirmation** signal alongside the `createdon`=2023-12-03 classifier. `_wmkf_programlevel2_value` is the lone migrated-only taxonomy field (Blackbaud concept abandoned post-migration).
  - **⚠️ Lifecycle/era confound — FIELD-SPECIFIC, not blanket (corrected after Codex review + stratification probe):** the migrated-high/native-low gap is **lifecycle** for `akoya_grant`/`akoya_originalgrantamount`/`akoya_decisiondate` (native-decided ≈ migrated, native-not-decided ≈ 0 — these are genuinely set only at award; native sparsity = pipeline state, NOT missing data) but is **NOT lifecycle** for `akoya_request`/`akoya_expenses` (decided ≈ not-decided ≈ 46% native vs 100% migrated — a structural/migration/intake-process gap, cause UNVERIFIED, needs Connor). The earlier blanket "NOT a schema or data-capture change" was wrong and is retracted. The disclosure layer must distinguish the two (Artifact 3 disclosure spec §2 vs §3), not present all native amount-sparsity as "not yet decided."

### Division of labor: tool vs. Excel (+ Claude Excel plugin)

The in-app query does **not** need to be surgical. Export a **generous, trust-bounded, well-characterized chunk**; last-mile row whittling ("find the physics grants") happens in Excel where the user already lives. The tool owns only what Excel **cannot detect or recover**:

- record-level inclusion correctness (polymorphism, era boundary),
- institution disambiguation (the "Stanford"/"UW" name-variant rollup),
- composition + era/classification + completeness disclosure,
- **generous columns** — *including* the type discriminator, era/confidence flag, resolved-institution column, and an explicit `UNKNOWN — not captured` sentinel (never a bare blank).

**Hard requirement:** refinement in Excel is only valid if those classification/provenance columns are in the file. Once the spreadsheet leaves the app the honesty machinery is gone, so it must be **baked into the artifact** (a methods/provenance sheet + explicit sentinels), not merely shown in the UI at export time.

### UX resolution: expression, not intent

The expert's bottleneck is **not** intent (they hold the predicate fully formed — "research grants, awarded, 2021–2025, budget > $1.5M") — it is **expression**: AkoyaGo fails them on (1) discoverability ("where do I click") and (2) the vocabulary gap (business terms vs. `akoya_*` logical names / optionset integers).

- **v1 core = a plain-English structured filter builder** — discoverable, business-vocabulary fields, with **fan-out choices made explicit**. "Budget > $1.5M" hides a fan-out: *which* budget — Awarded / Requested / Total project? The builder must force that choice exactly like the date-basis choice.
- **AI = phase-2 on-ramp**, not the centerpiece: NL → a proposed structured filter *rendered back into the same builder for confirmation*, for the non-expert (the boss). Plus optional disambiguation help.
- **Two doors, one engine.** Reductive (expert builds the predicate) and guided (AI proposes it) converge on the same query-spec, compiler, confirmation gate, and composition disclosure. **Composition disclosure is mandatory even in expert mode** — a tight expert filter can still be wrong about polymorphism/era.

### The three semantic-layer artifacts (the real work; mostly evidence-derived)

1. **Plain-English field dictionary** — business term → physical field(s) + control rendering, **encoding fan-out points** where one term legitimately means several fields and the builder must force a choice.
2. **Type / era taxonomy + boundary** — the request polymorphism discriminator(s), values, and the Akoya-native vs. migrated boundary date. **Era-boundary sub-part RESOLVED (2026-05-16): the boundary is `createdon` vs. 2023-12-03 (probe-derived constant).** The *type* taxonomy (recent-era authoritative definitions + remap history) still needs Connor.
3. **Field-availability boundary** — coarse "when did each *important* field become reliably captured." **DELIVERED (2026-05-16), then corrected after Codex review — see "Artifact 3 — Field-Availability Boundary" below.** Rates are now **exact full-cohort FetchXML aggregates** (`scripts/probe-akoya-export-col-rates.js`), superseding the initial `probe-akoya-era-field-shape.js` n=1,200 GUID sample that `probe-akoya-era-robustness.js` proved biased in the migrated cohort. `akoya_decisiondate` is 100% migrated / 31% native (the lifecycle confound, not "100% both eras").

### Artifact 3 — Field-Availability Boundary (delivered 2026-05-16)

Evidence: rates are **EXACT full-cohort FetchXML aggregate counts** (`scripts/probe-akoya-export-col-rates.js`, 2026-05-16) — migrated tot=22,573, native tot=2,988. **These supersede the earlier `probe-akoya-era-field-shape.js` n=1,200 GUID-ordered sample, which the robustness probe (`scripts/probe-akoya-era-robustness.js`) proved was biased in the migrated cohort** (GUID order correlates with population there: `akoya_grant` asc 95% vs desc 61%; `_wmkf_grantprogram_value` asc 58% vs desc 99%). Corrected magnitudes were large (grantprogram 58→80, primary-contact 43→70, grant 95→84). Migrated = `createdon` 2023-12-03 (Blackbaud/"Sky"); native = after. **Methodology caveat (Codex S157 pass 2):** rates are Dataverse `not-null` counts; for String fields an empty/whitespace string counts as *present* (the trim-aware exclusion the old sample used is not applied). Effect is negligible for the system-ish String fields here (`akoya_requestnum`, `akoya_requeststatus`, `akoya_fiscalyear`) but the numbers are "exact under not-null semantics," not "exact non-blank."

**Bucket A — measured ≥97% in *both* cohorts (exact full-cohort; reliable in practice — but "always-on" is an observed-state claim, not a schema guarantee).**

| Export column | Field | Type | mig% | nat% |
|---|---|---|---|---|
| Request # | `akoya_requestnum` | String | 100 | 100 |
| Request type (Akoya) | `akoya_requesttype` | Picklist | 100 | 100 |
| Request type (WMKF) | `wmkf_request_type` | Picklist | 97 | 99 |
| Lifecycle status | `akoya_requeststatus` | String | 100 | 100 |
| State | `statecode` | State | 100 | 100 |
| Applicant org | `akoya_applicantid` | Lookup | 100 | 97 |
| Meeting date | `wmkf_meetingdate` | DateTime | 100 | 100 |
| Fiscal year | `akoya_fiscalyear` | String | 100 | 99 |
| Amount paid | `akoya_paid` | Money | 100 | 100 |

(`akoya_requestnum` = the human Request # — `scripts/probe-akoya-export-col-rates.js` resolves and confirms it directly, closing the earlier probe/doc field-name mismatch. `statecode` is platform-mandatory (never null) — now probe-measured (100/100, `probe-akoya-export-col-rates.js`) so the row is probe-backed, but its 100% reflects the platform constraint, not mapping fidelity. `akoya_paid` is a rollup: always *present*, value can legitimately be 0 — presence ≠ "was paid". `akoya_programid` (Internal Program) is 99% mig / **80% nat** — strong but not ≥97 both, so it sits just below Bucket A.)

**Bucket B-lifecycle — confound CONFIRMED by stratification (`scripts/probe-akoya-era-robustness.js` block c): native sparsity is in-flight pipeline state, NOT data loss.**

| Export column | Field | Type | mig% | nat% | Stratified test (native) |
|---|---|---|---|---|---|
| Decision date | `akoya_decisiondate` | DateTime | 100 | 31 | **tautological — this field DEFINES "decided"; its own split is not independent evidence** |
| Grant (awarded) amount | `akoya_grant` | Money | 84 | 32 | decided 95% · not-decided 3% ⇒ lifecycle (non-circular) |
| Original grant amount | `akoya_originalgrantamount` | Money | 84 | 33 | **stratified (block c): decided 99% · not-decided 3% ⇒ lifecycle confirmed** (not merely "parallels grant") |

(Migrated `akoya_grant` is **84%, not 100%** — declined requests are decided but never awarded, so they correctly carry no grant amount. Note migrated is degenerately ~100% "decided" (`akoya_decisiondate` 100% migrated), so the decided/not-decided stratification only exists in the native cohort — the migrated side cannot be stratified by this proxy, which is itself the asymmetry the lifecycle finding rests on, not an open gap.)

**Bucket B-structural — gap is NOT lifecycle (refuted by the same stratification): migrated 100% but native ~46% *regardless of decision state*. Cause UNVERIFIED — migration mapping and/or an intake-process change; needs Connor remap history.**

| Export column | Field | Type | mig% | nat% | Stratified test (native) |
|---|---|---|---|---|---|
| Requested amount | `akoya_request` | Money | 100 | 48 | decided 44% · not-decided 50% ⇒ NOT lifecycle |
| Total project budget | `akoya_expenses` | Money | 100 | 45 | decided 42% · not-decided 46% ⇒ NOT lifecycle |

**Bucket C — substantively present in BOTH eras with a native edge (the earlier "Blackbaud didn't capture this" framing is RETRACTED — exact rates are far higher migrated than the biased sample showed; cause of the gap is not isolated).**

| Export column | Field | Type | mig% | nat% |
|---|---|---|---|---|
| Grant program | `wmkf_grantprogram` | Lookup | 80 | 99 |
| Primary contact | `akoya_primarycontactid` | Lookup | 70 | 77 |
| Title | `akoya_title` | String | 46 | 65 |

(`wmkf_grantprogram` mig **80%** (not 58) — the ~20% migrated gap is the S156 4,634-null-program hole and the staff `wmkf_grantprogram` 92× correction signal. The migrated shortfall could be mapping loss, a not-captured-then field, or post-migration data-cleanup still in progress — **not established**, pending Connor.)

**Bucket D — sparse in BOTH eras; exclude from the default column set / never a time key.**

| Field | Type | mig% | nat% | Note |
|---|---|---|---|---|
| `akoya_begindate` | DateTime | 35 | 39 | date-hunt min has pre-1954 outliers — unreliable |
| `akoya_enddate` | DateTime | 35 | 38 | |
| `wmkf_projectleader` | Lookup | 16 | 32 | (was mis-bucketed C off the biased sample) |
| `akoya_datereceived` | DateTime | 7 | 22 | |

**Bucket E — provenance / era columns (MUST be baked into the file per the "Division of labor" hard requirement).**

- **Era** — derived: `createdon` = 2023-12-03 ⇒ `migrated/Blackbaud (pre-2023-12-03)`; else `Akoya-native`. Robustness rests primarily on **full-cohort reconciliation, not the 5-row demo**: the entire migrated population (22,573, exact aggregate count) carries `createdon` inside the single 2023-12-03 17:42–18:25Z import window (`scripts/probe-akoya-createdon-2023.js`); the native bucket's `createdon` spreads naturally across 2024–26; the two reconcile to the exact table count (22,573+2,988=25,561). `overriddencreatedon`=0 ⇒ no create-time backdating. The 5-row `modifiedon`=2026 / `createdon`=2023-12-03 demo (`scripts/probe-akoya-era-robustness.js` block b) is *illustrative* of re-touch, not a proof over all rows. The "Dataverse `createdon` is system-owned / not PATCH-updatable" platform behavior is **asserted, not independently re-verified this session** — the empirical reconciliation above is what carries the claim.
- **BB lineage** — `wmkf_bbstatus` (mig 100/nat 9), `wmkf_bbstaffid` (mig 90/nat 10): secondary migrated-cohort confirmation alongside the `createdon` classifier.
- **Type discriminator (composite)** — `wmkf_request_type` × `wmkf_grantprogram` × `akoya_requesttype` (S156 discriminator probe).

**Historical-year key:** for time-slicing the migrated cohort use **`akoya_decisiondate`** (100% migrated; reproducible decade spread 1950s:6 · 1980s:1,929 · 2000s:5,249 · 2010s:7,636 · 2020s:3,646, **pre-1954=0, future(>2026)=0** — `scripts/probe-akoya-era-robustness.js` block d) or its mirror **`wmkf_meetingdate`** (same shape; **future(>2026)=4 typo rows, reproduced by the same probe block d** — not a hand-count). **Never** `createdon` (collapsed to 2023-12-03), `akoya_datereceived` / `akoya_begindate` (Bucket D; begindate has pre-1954 min outliers).

**Disclosure-layer spec — what the export artifact must ENCODE (not merely show in the UI). Sentinel wording is PROVISIONAL: it presumes a defined decided-state predicate, which v1 must specify (working proxy = `akoya_decisiondate` present, itself imperfect).**

1. **Era column on every row** + a methods/provenance sheet stating the 2023-12-03 cutover, the per-bucket rules, and probe provenance.
2. **Bucket-B-lifecycle nulls render as a caption, never a bare blank.** Not-decided row ⇒ `NOT YET DECIDED`; decided but absent ⇒ `UNKNOWN — not captured`. A bare blank reads as `$0` — the plausible-wrong-answer the threat model targets.
3. **Bucket-B-structural nulls** render as `UNKNOWN — capture differs by era (see methods)` — do NOT label these "not yet decided" (the stratification refuted that) and do NOT assert a Blackbaud cause until Connor confirms remap history.
4. **Bucket-D fields excluded from the default column set;** opt-in only, flagged "sparse in all eras — not reliable."
5. **Composition line mandatory even in expert mode:** `N rows: X migrated (Blackbaud, pre-2023-12-03) · Y Akoya-native; of native, Z not yet decided`.

**Residuals (exactly two, both non-solo):** (i) confirm the export-column *set* against the AkoyaGo trusted-view operational filters (gated step 2 / artifact 1 excavation); (ii) Connor must explain the Bucket-B-structural migrated-100%/native-~46% drop (mapping vs intake-process). The earlier "(iii) status-stratify the migrated cohort" is **withdrawn** — migrated is degenerately ~100% decided (`akoya_decisiondate` 100% migrated), so a decided/not-decided split cannot exist there; that asymmetry is the lifecycle finding, not an open task. This table is the evidence-derived candidate, not the final authoritative export contract.

### Track B engineering requirements (Codex-informed)

- **Backoff-hardened paging is v1, not later.** The robustness floor is "the big query must *succeed*." Today `queryAllRecords` throws on the first non-200 and there is no 429/`Retry-After` handling — the exact broad query the tool exists to serve fails hardest. v1 must add retry/backoff.
- **Concrete sync budget + buffer-vs-stream decision.** Worst case 20 pages × 30s = 600s > Vercel's 300s; rows buffered fully in memory. Realistic *filtered* slices are modest (hundreds), so synchronous export is fine for real cases; an async/background-job model is needed **only if** genuine needs exceed what hardened-sync can safely deliver. Parameterize the arbitrary 5000 cap and surface `capped`/`totalCount` **in the UI** (the helper already returns them).
- **Loud, actionable truncation.** Not a footnote — show the true total prominently and offer the narrowing dimensions ("8,213 match; narrow by program / year / status / institution").

---

## Packaging & access (Codex-corrected)

Two entries in `shared/config/appRegistry.js`, admin-assignable to their own groups (Find&fix → maintenance staff; Bulk export → volume users), mirroring the Virtual Review Panel model. **Correction (Codex):** the registry is nav/config only — this also requires Dataverse `wmkf_appuserappaccesses` grants and a `requireAppAccess` route gate on **every** new endpoint (lib/utils/auth.js:245-312; app-access-service.js:33-40). Superuser-only is too narrow. A combined "Data Admin" app is a fallback but bundles a read tool and a write tool under one coarse grant.

---

## Status of unknowns

- **Track A — read/display: unblocked.** **Write: blocked** on the three write-policy decisions above (attribution enforcement, restriction enforcement, dangerous-scalar exclusion). The earlier "no blocking unknowns for Track A v1" was premature and is retracted.
- **Track A — audit/change-history: analyzed (S156, 800 native records).** Raw-frequency prioritization **disconfirmed**; staff-attributed + content-field-shaped signal is **usable**; per-record point-of-edit history validated at scale; staff roster produced. Still **not a v1 dependency** (privilege fragility) — a candidate enhancement + an access-scoping input. See the Track A "Executed (S156)" block.
- **Track B — design converged; still blocked on the residual evidence tasks** before a build plan (semantic-layer artifacts must be evidence-derived, not invented — probe-before-plan). **Progress (2026-05-16):** artifact 2's era-boundary sub-part fully resolved by probe (cutover = 2023-12-03); **artifact 3 DELIVERED** (Field-Availability Boundary table + 5-bucket classification + disclosure-layer spec — see its section). Remaining blockers: **artifact 1** (plain-English field dictionary — needs the AkoyaGo trusted-view operational-filter excavation) + **artifact 2's *type* taxonomy portion** (Connor: recent-era authoritative definitions + remap history). Artifact 3 has **exactly two non-solo residuals** (consistent with the Artifact 3 "Residuals" line): (i) confirm the export-column *set* against the AkoyaGo trusted views (folds into the artifact-1 excavation); (ii) Connor explains the Bucket-B-structural migrated-100%/native-~46% drop.

## Codex review reconciliation (S156)

**Review 1 (design doc) folded in:** retracted "silent truncate" (helper already signals `capped`/`totalCount`; defect is the arbitrary cap + UI not surfacing it); softened "non-negotiable attribution" → explicit Track A decision #1; added `updateRecord` missing `checkRestriction` → decision #2; added dangerous-scalar (calculated/rollup/formula) exclusion → decision #3; fixed `searchRecords` to "upper-bounded at 100, no lower bound"; noted `getEntityRelationships` lacks `checkRestriction`; narrowed the `processAnnotations` claim (annotations only when Dataverse returns them); corrected packaging to include Dataverse app-access grants + per-route gates; promoted 429/backoff to Track B v1; added the concrete sync timeout/memory budget; retracted the premature "no blocking unknowns" conclusion.

**Review 2 (audit probe) folded in:** softened "bulk audit conclusively impossible" → only the one-shot aggregate query is ruled out (single-`objectid` shape untested); reframed the per-record 200 as a single demonstration, not a generalized capability; recorded the automation-vs-human conflation, privilege fragility, era-sampling bias, dedupe, and throttle caveats; downgraded change-frequency from a clean Track A input to a weak, gated, post-v1 signal; added gated step 5. Probe-script docstring corrected (token acquisition is a POST, not "strictly GET").

## Codex review reconciliation (S157 — era / field-shape work)

Review of the era probes + Artifact 3. Findings were not just softened — four of five were tested by a follow-up robustness probe (`scripts/probe-akoya-era-robustness.js`) and a fresh exact-rate probe (`scripts/probe-akoya-export-col-rates.js`), which **overturned several claims**:

- **(a) Sampling — substantiated the critique.** GUID-ordered n=1,200 was proven biased in the migrated cohort (`akoya_grant` asc 95% / desc 61%; `grantprogram` asc 58% / desc 99%). All Artifact 3 rates replaced with **exact full-cohort FetchXML aggregates**; the sampled probe is demoted to a field-discovery tool.
- **(b) createdon immutability — EVIDENCED, claim re-scoped (pass 2).** Carried by full-cohort reconciliation (all 22,573 migrated rows' `createdon` in the single 2023-12-03 import window; native spreads 2024–26; totals reconcile to the exact 25,561; `overriddencreatedon`=0), **not** the 5-row demo (now labelled illustrative). The "Dataverse `createdon` not PATCH-updatable" platform behavior is **asserted, not independently re-verified this session** — wording downgraded from "substantiated." Timezone concern is moot: raw min/max `createdon` (`17:42:10Z…18:25:32Z`) are absolute instants.
- **(c) Lifecycle confound — partially refuted.** Stratification confirmed it for `akoya_grant` and (pass 2: `akoya_originalgrantamount` added to the stratification loop — decided 99% / not-decided 3%) but **refuted it for `akoya_request`/`akoya_expenses`** (decided ≈ not-decided ≈ 46% native). Split into Bucket B-lifecycle vs B-structural; blanket "NOT a schema change" retracted. `akoya_decisiondate`'s own B-lifecycle row is flagged **tautological** (it defines "decided"; not independent evidence). Migrated-cohort stratification is degenerate (migrated ≈100% decided) — withdrawn as a residual, not left open.
- **(d) Historical key — substantiated + made reproducible.** Decade distribution is a committed probe (`probe-akoya-era-robustness.js` block d); pass 2 added a committed `future(>currentYear)` count, so the "`wmkf_meetingdate` 4 future-typo rows / `akoya_decisiondate` 0" claim is probe-derived, not a hand-count.
- **(e) Artifact 3 over-claims — corrected.** Bucket A reworded to "measured ≥97% both cohorts (observed-state, not schema guarantee)"; Bucket C "Blackbaud didn't capture this" **retracted** (exact rates far higher migrated than the biased sample); disclosure sentinels marked provisional pending a defined decided-state predicate; Request#/`akoya_requestnum` mismatch closed by `probe-akoya-export-col-rates.js`. Doc contradiction (decisiondate vs "AkoyaGo only source of true dates") fixed. **Pass 2 probe/doc-sync fixes:** `statecode` added to the exact-rate probe (was doc-only; now 100/100 probe-backed); `wmkf_projectleader` bucket label corrected C→D in the probe to match the doc; the residual list reconciled to exactly two between the Artifact 3 section and Status-of-unknowns; not-null-vs-trim semantics caveat added to the evidence line.

## Gated next steps (evidence before build plan — probe-before-plan)

1. **Claude → Dataverse probe — DONE & era boundary fully resolved (discriminator/volumes 2026-05-15 `scripts/probe-akoya-request-discriminators.js`; `overriddencreatedon` 2026-05-16 `scripts/probe-akoya-overriddencreatedon.js`; createdon-2023 day drill 2026-05-16 `scripts/probe-akoya-createdon-2023.js`).** Composite discriminator + per-type volumes + ~25,561 true count + `$count`-caps-at-5000 captured (Track B "Evidence" + Atlas). **The migration cutover is now a precise, Dataverse-derived constant: 2023-12-03** (single ~43-min import of all 22,573 historical rows; native = `createdon` > 2023-12-03). **No solo Dataverse residual remains, and step 1 no longer hands the era boundary downstream** — it is resolved here. `overriddencreatedon` is null everywhere, so migrated rows' *true* historical dates are unrecoverable from Dataverse (deep-history, out of v1 scope).
2. **User → AkoyaGo excavation:** the *operational filters* of the trusted views/reports (executable definitions, not prose). ~~+ the Akoya-native migration cutover date~~ — **cutover date resolved by probe (2023-12-03); not a blocker.** (Contradiction fix: an earlier revision called AkoyaGo "the only source of migrated rows' true historical dates" — that is wrong. `akoya_decisiondate` is a Dataverse-resident true historical date for the migrated cohort, 1955→2023. AkoyaGo is needed only for the *type taxonomy / remap history* and the Bucket-B-structural cause, not for the historical date.)
3. **Connor → recent-era taxonomy + remap history:** authoritative clean-era definitions + what is known about prior-system field remapping.
4. **(Done, this doc)** consolidated design + memory.
5. **Audit/change-history analysis — DONE for `akoya_request` (S156).** Akoya-native sampled analysis executed with the canonical method (systemuser-metadata classification + explicit vendor exclusion); raw-frequency disconfirmed, staff-attributed content signal + staff roster produced (see Track A "Executed (S156)"). **Residual (only if pursued further):** repeat for `contact`; confirm the `RetrieveRecordChangeHistory` privilege is durably granted (not incidental) before any feature depends on it; the lifecycle-vs-corrective split is semantic, not a hard flag. Not required for v1.

---

## Decisions converged with user (Session 156)

- Two separate apps, shared spine (AI proposes / deterministic acts / human-confirm gate), not one tool.
- Track A: populated-fields-only inline edit, single Dataverse Search box for find; v1 single-record, safe scalars only, optionset/lookup read-only; **write path gated on 3 explicit policy decisions**.
- Track B: not a generic builder and not fixed templates — a **plain-English structured filter builder + mandatory composition/era disclosure**, generous trust-bounded export, refine-in-Excel; AI is a phase-2 on-ramp, not the core.
- Threat model: optimize against the *plausible* wrong answer that passes the sniff test; provenance = reproducible methods, not defensive armor.
- "Ever" is rhetorical; deep-history is out of Track B v1 by design and routes to the Track A / Explorer find-one pattern.
- The real Track B work is three evidence-derived semantic-layer artifacts. **Status 2026-05-16:** artifact 3 (field-availability boundary) DELIVERED; artifact 2's era-boundary sub-part RESOLVED (cutover 2023-12-03). Still blocked: artifact 1 (field dictionary — AkoyaGo trusted-view excavation) + artifact 2's type-taxonomy portion (Connor). Neither residual is solo-actionable.
