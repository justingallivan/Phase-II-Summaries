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
- **Temporal polymorphism.** 70-year-old foundation: file cabinets → prior system → AkoyaGo, with field remapping. Recent Akoya-native data is mostly clean and Connor-authoritative; pre-Akoya migrated data is approximate and some knowledge is gone. "Ever" in the triggering query is **rhetorical** — real bulk searches go back ~20 years at most, mostly recent. **Deep-history is out of Track B v1 by design**: a "find the 1986 Stanford building award" need is a Track A / Explorer *find-one* pattern, not bulk aggregation, and must not contaminate Track B's semantic layer.
- **Completeness is a property of (field × era), not the dataset.** A correctly-classified 1993 grant can still have an empty/illegible co-PI (scanned form, never transcribed). The silent failure in a new costume: blank → `""` in Excel reads as "no co-PI" when the truth is "never captured." The tool must distinguish **null-because-absent** from **null-because-never-captured** and must NOT attempt historical recovery (no OCR heroics) — only refuse to misrepresent sparsity. Expectations are already calibrated; this is cheap honesty, not archaeology.

### Evidence (live probe 2026-05-15 — `scripts/probe-akoya-request-discriminators.js`)

Gated step #1 substantially executed. Confirms the polymorphism thesis with numbers (full distributions + caveats in `docs/atlas/dataverse-akoya-request.md`):

- **The discriminator is a composite, empirically:** `wmkf_request_type` (Request 16,227 · Concept 3,273 · Office/Site Visit + Phone Call ~5,268 interaction logs · null 706) × `wmkf_grantprogram` (Research 8,500 · Discretionary 5,345 · **null 4,634** · Southern California 4,489 · Undergraduate Education 2,017 · …) × `akoya_requesttype` (Grant 25,473 · Scholarship 88). No single field works. Every user-described slice is confirmed with volume; the **4,634 null-program** rows are a real data-quality hole for "all grants to X."
- **🔴 Hard Track B engineering requirement (promote): never use OData `$count`.** Live `/akoya_requests/$count` returned **5,000**; true total via FetchXML aggregate is **~25,561**. Dataverse caps `$count` at 5,000 — a silent ~80% undercount that *looks exactly like* the triggering "~5,000 requests." The honest-total path MUST be FetchXML aggregate / RetrieveTotalRecordCount, not `$count`. This is no longer just a UI concern — it is a correctness invariant of the export engine.
- **Era boundary is PRECISE and Dataverse-derived — no external dependency (2026-05-16, `scripts/probe-akoya-createdon-2023.js`).** Day-level drill of the 2023 cohort: **100% of the 22,573 rows were created on a single date, 2023-12-03**, inside one ~43-minute window (`17:42:10Z … 18:25:32Z`). Zero native creates anywhere in 2023; the 2,988 native rows are all 2024+ (1,167 + 1,376 + 445; 22,573 + 2,988 = 25,561 ✓). One clean bulk-import event. **The native-vs-migrated classifier is therefore solo-derivable and exact: `createdon` = 2023-12-03 ⇒ migrated/historical; `createdon` > 2023-12-03 ⇒ Akoya-native (clean, Connor-authoritative).** The Track B semantic-layer "era" artifact is now a fixed predicate against `createdon`, not an externally-supplied parameter.
- **`overriddencreatedon` DISCONFIRMED as an era marker (2026-05-16 — `scripts/probe-akoya-overriddencreatedon.js`, FetchXML aggregates, never `$count`).** `overriddencreatedon` is **null on 100% of rows (0 / 25,561)** — the import preserved no original dates. The prior "inconclusive" was a `$count`-cap artifact. **What this does NOT cost us:** the era *classifier* is unaffected (it keys off `createdon`, above). **What it does cost:** the *true historical creation date* of a migrated row is gone from Dataverse — irrecoverable without AkoyaGo. That is deep-history, already out of Track B v1 by design. So Connor/AkoyaGo are a **cross-check on the 2023-12-03 go-live + the sole source for migrated rows' true dates**, not a blocker for the era classifier.

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
3. **Field-availability boundary** — coarse "when did each *important* field become reliably captured" (amount: always; co-PI: post-Akoya; narrative: scans pre-~2010). Bounded to the ~10–15 columns that appear in real exports — not all ~800 fields.

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
- **Track B — design converged; still blocked on the residual evidence tasks** before a build plan (semantic-layer artifacts must be evidence-derived, not invented — probe-before-plan). **Progress (2026-05-16):** the era-boundary sub-artifact is fully resolved by probe (cutover = 2023-12-03). Remaining blockers: AkoyaGo operational-filter excavation (artifact 1) + Connor recent-era *type* taxonomy/remap history (artifact 2's type portion) + the field-availability boundary (artifact 3).

## Codex review reconciliation (S156)

**Review 1 (design doc) folded in:** retracted "silent truncate" (helper already signals `capped`/`totalCount`; defect is the arbitrary cap + UI not surfacing it); softened "non-negotiable attribution" → explicit Track A decision #1; added `updateRecord` missing `checkRestriction` → decision #2; added dangerous-scalar (calculated/rollup/formula) exclusion → decision #3; fixed `searchRecords` to "upper-bounded at 100, no lower bound"; noted `getEntityRelationships` lacks `checkRestriction`; narrowed the `processAnnotations` claim (annotations only when Dataverse returns them); corrected packaging to include Dataverse app-access grants + per-route gates; promoted 429/backoff to Track B v1; added the concrete sync timeout/memory budget; retracted the premature "no blocking unknowns" conclusion.

**Review 2 (audit probe) folded in:** softened "bulk audit conclusively impossible" → only the one-shot aggregate query is ruled out (single-`objectid` shape untested); reframed the per-record 200 as a single demonstration, not a generalized capability; recorded the automation-vs-human conflation, privilege fragility, era-sampling bias, dedupe, and throttle caveats; downgraded change-frequency from a clean Track A input to a weak, gated, post-v1 signal; added gated step 5. Probe-script docstring corrected (token acquisition is a POST, not "strictly GET").

## Gated next steps (evidence before build plan — probe-before-plan)

1. **Claude → Dataverse probe — DONE & era boundary fully resolved (discriminator/volumes 2026-05-15 `scripts/probe-akoya-request-discriminators.js`; `overriddencreatedon` 2026-05-16 `scripts/probe-akoya-overriddencreatedon.js`; createdon-2023 day drill 2026-05-16 `scripts/probe-akoya-createdon-2023.js`).** Composite discriminator + per-type volumes + ~25,561 true count + `$count`-caps-at-5000 captured (Track B "Evidence" + Atlas). **The migration cutover is now a precise, Dataverse-derived constant: 2023-12-03** (single ~43-min import of all 22,573 historical rows; native = `createdon` > 2023-12-03). **No solo Dataverse residual remains, and step 1 no longer hands the era boundary downstream** — it is resolved here. `overriddencreatedon` is null everywhere, so migrated rows' *true* historical dates are unrecoverable from Dataverse (deep-history, out of v1 scope).
2. **User → AkoyaGo excavation:** the *operational filters* of the trusted views/reports (executable definitions, not prose). ~~+ the Akoya-native migration cutover date~~ — **cutover date now resolved by probe (2023-12-03); AkoyaGo is a cross-check + the only source of migrated rows' true historical dates, not a blocker.**
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
- The real Track B work is three evidence-derived semantic-layer artifacts; design is blocked on the three evidence tasks.
