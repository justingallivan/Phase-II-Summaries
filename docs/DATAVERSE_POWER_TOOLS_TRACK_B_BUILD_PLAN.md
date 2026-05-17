# Dataverse Power Tools — Track B (Bulk Export) Build Plan

**Status:** Build-plan-ready (S159). Authored against the converged design in `docs/DATAVERSE_POWER_TOOLS_DESIGN.md` — that doc's **"Residuals — AUTHORITATIVE LIST"** owns scoping/status; this doc owns *engineering*. Do not restate status divergently here; where this plan needs a semantic determination it **points to** the design doc, it does not re-derive it.

**Prerequisite gates (all met S159):** v1-core data/semantic gates closed — default column contract (user-confirmed + Codex-audited), per-program decline segmentation (probe-resolved), era boundary / decided-state / program-type axes / operational exclusions / test-record predicate / institution-disambiguation design input. Open items are **scoped out of v1-core**: the 121-view preset library (Phase 3 guided layer), 4 embedded-nested RDL de-nests, the orthogonal Puzzle 2c doc-rationale dimension, Track A entirely.

---

## 1. Scope of this build

**In (v1):** A read-only, plain-English **structured filter builder** over `akoya_request` that produces a **generous, trust-bounded, honestly-characterized Excel chunk** the accountable analyst refines in Excel. Two doors deferred to one: v1 is the **expert reductive door only** (the analyst holds the predicate; the tool solves *expression*, not intent).

**Out (explicitly, by design — not omissions):**
- Track A ("Find & fix" edits) — separate app, separate build, write-path-gated.
- AI natural-language on-ramp — Phase 2+ (the compiler/confirm seam is built so it slots in; v1 ships zero AI).
- The 121-view preset/"canonical slice per program family" guided layer — Phase 3, gated on the recognition working-session; **not** required for the expert builder (the dominant trusted pattern is operator-supplied filters — 28/36 RDLs are prefilter-only).
- Async/background-job export — deferred until evidence shows real exports exceed the hardened-synchronous budget.
- Bulk DOCX→text decline-rationale extraction — deferred phase; v1 surfaces a retrieval *link* only.
- Deep-history (pre-cutover) as a bulk concern — routes to Track A / Explorer find-one by design.

**One-sentence product thesis (from design doc):** force the latent ambiguities — which *type*, which *era*, what does "2021" mean, which *budget*, which *institution* — into explicit choices, then emit a reproducible, honestly-characterized chunk.

---

## 2. Architecture — the QuerySpec spine (compiler, not interpreter)

The invariant that keeps this from regressing into "Explorer 2": **a structured spec is compiled deterministically; nothing interprets intent and acts.** The AI (Phase 2) never executes, never paginates, never sees the result set — it only emits a `QuerySpec` rendered back into the builder for human confirmation.

```
[Expert builder UI]  ──emits──>  QuerySpec (structured JSON)
                                      │
                          POST /preview │  (deterministic compile + true count, NO rows)
                                      ▼
        QuerySpec → FetchXML compiler  +  semantic/disclosure engine
                                      │
                         ┌────────────┴─────────────┐
                         ▼                            ▼
              compiled FetchXML (shown)     composition preview:
              + true total (FetchXML agg)   era split · classification ·
                                            unclassified set · program
                                            roll-up in/out · est. size
                                      │
                          ── human confirm gate ──
                                      │
                          POST /run  │  (confirmed QuerySpec only)
                                      ▼
            backoff-hardened FetchXML paging → rows (buffered)
                                      ▼
            Excel artifact: Data sheet (+ per-row sentinels)
                          + Methods/Provenance sheet (baked-in honesty)
                                      ▼
                    SSE progress → file_ready (base64)
```

**`QuerySpec`** (the seam — versioned JSON):
```jsonc
{
  "version": 1,
  "entity": "akoya_request",
  "filters": [ { "axis": "program", "field": "akoya_programid", "op": "eq", "value": "<guid>" },
               { "axis": "dateBasis", "field": "akoya_decisiondate", "op": "between", "from": "2021-01-01", "to": "2025-12-31" },
               { "axis": "amount", "which": "awarded", "field": "akoya_grant", "op": "gt", "value": 1500000 } ],
  "programRollup": "optionB",          // wmkf_type=Program only; non-Program as separate lines
  "excludeOperational": true,           // strip Site/Office Visit/Phone, Research Reviewer
  "excludeTestRecords": true,           // default on
  "columns": { "default": true, "optIn": ["akoya_payee"] },
  "eraScope": "all"                     // provenance dimension, never a business-period filter
}
```
Every fan-out (which budget, which date-basis, which program axis) is an explicit field in the spec — there is no "smart" default that hides a choice. The builder *forces* the choice; the compiler *fails closed* on an ambiguous/absent one.

---

## 3. The deterministic core (`lib/services/dataverse-export/`)

### 3a. FetchXML query primitive — **the central new infrastructure**

The codebase has **no FetchXML support**: `dynamics-service.js::queryAllRecords` is OData-only, hard-capped at exactly 5,000 (`MAX_EXPORT_RECORDS`), requires a `$filter`, **throws on the first non-200, has no 429/Retry-After/backoff**, and buffers all rows. OData `/$count` silently caps at 5,000 — *that ~80% undercount is the exact trigger this tool exists to fix.* So v1's spine is a **new** primitive, not a reuse:

`lib/services/dataverse-export/fetch-client.js`
- `fetchXmlPage(entitySet, fetchXml, pagingCookie)` → one page via `?fetchXml=`, `Prefer: odata.maxpagesize=<N>` + `odata.include-annotations="*"`.
- `fetchXmlAll(fetchXml, { hardCapRows, hardBudgetMs })` → pages via the FetchXML **paging cookie** (not `@odata.nextLink`); returns `{ rows, fetched, capped, truncatedByBudget, pages }`.
- `fetchXmlAggregateCount(entity, filterFx)` → the **true total** via `<fetch aggregate="true"><attribute aggregate="count"/>`. **Never OData `/$count`.** This is a hard correctness invariant of the engine (design doc, promoted from UI concern).
- **Backoff-hardened (Codex v1 requirement):** 429 / `Retry-After` / 5xx → exponential backoff + jitter, capped retries; the broad query the tool exists to serve must *succeed*, not throw on first blip. A page that ultimately fails after retries → loud, actionable error (never a silent partial).
- Reuses `dynamics-service.js` only for the OAuth token acquisition + `fetchWithTimeout` abort wiring; the query path is independent.

This module is testable in isolation against a fixture `QuerySpec` before any UI exists (Phase 1 exit criterion).

### 3b. QuerySpec → FetchXML compiler (`compiler.js`)

Pure function `compile(querySpec) → { fetchXml, countFetchXml, appliedRules[] }`. Encodes **every** resolved hard invariant (authority = design doc; do not re-derive):

| Invariant | Compiler behavior |
|---|---|
| **Era** | `createdon` = creation-*provenance* partition only. Business-history filters compile to `akoya_decisiondate` (fallback `wmkf_meetingdate` when null on Active/awarded), **never `createdon`**. If a spec tries to time-slice on `createdon` → compile error. |
| **Decided-state** | `akoya_requeststatus` value→class map (Pending\*=in-flight; \*Declined/Ineligible/Denied/Closed/\*Done/Approved=decided-terminal). Never decisiondate-presence. |
| **Program axis** | `akoya_programid`→`akoya_program` canonical, **keyed by GUID** (duplicate program name exists; 816 legacy nulls). `wmkf_grantprogram` is a *separate* coarse funding/payment axis — offered as a distinct labeled filter, never conflated. Default = `akoya_programid` ∧ `wmkf_type=Program`. |
| **Program roll-up (Option B)** | Program grant total = `wmkf_type=Program` rows only; `Special Projects`/`Special Grants`/etc. compile as **separate reported lines**, never folded in. Emits a mandatory per-program in/out breakdown (disclosure engine). |
| **Operational exclusion** | Strip Site/Office Visit/Phone + Research Reviewer on **every** axis; sharpest predicate `wmkf_grantprogram = Honorarium` (≡ `wmkf_type=Individual`). `Miscellaneous` is **real grants** — included. |
| **Test records** | Default-exclude `applicant account.name = "W. M. Keck Foundation" ∧ native era` (22-row bounded; opt-in to include, with disclosure). |
| **Amount fan-out** | `which: awarded` → `akoya_grant`; `requested` → `akoya_request`; `total` → `akoya_expenses`; plus `recommended`/`invited`. Money compiles the `*_base` currency pair, never the display string. |

The compiler returns `appliedRules[]` so the methods sheet can state, in plain English, exactly what was applied.

### 3c. Semantic / disclosure engine (`disclosure.js`)

Post-query, per-row + aggregate. Produces the **baked-in honesty** (design doc §"Disclosure-layer spec", 6 mandatory items):

1. **Era column on every row** + a methods/provenance sheet (2023-12-03 cutover, per-bucket rules, probe provenance, the ~169-row business-era cross-contamination disclosure when both dims present).
2. **Bucket-B-lifecycle nulls → status-class caption**, never bare blank: `NOT YET DECIDED` / `DECIDED — no award (declined/ineligible)` / `UNKNOWN — not captured`.
3. **Bucket-B-structural** class-aware sentinel: migrated ⇒ `UNKNOWN — migration backfill`; native Concept ⇒ `N/A — feedback request`; native Request+Approved+has-award ⇒ `N/A — invited/discretionary award`; else `UNKNOWN — not captured`. (Migrated `akoya_request`/`akoya_expenses` are **never** exported as a real amount — migration-backfill artifact.)
4. **Bucket-D fields** excluded from default; opt-in, flagged "sparse all eras".
5. **Composition line mandatory even in expert mode**: `N rows: X migrated (pre-2023-12-03) · Y native; of native, Z in-flight (Pending*)` — counted from the status class map.
6. **Program roll-up Option-B line**: `Program $X [excludes: Special Projects $Y, Special Grants $Z — reported separately]`.

Plus the S159-resolved engine rules:
- **Decline output (per-program-segmented, never pooled):** era-aware field — migrated `akoya_denialreason` (Picklist) / native `wmkf_denialnotes` (Memo); **SoCal-area programs additionally read the third field `wmkf_socalreasonsfordecline2`**; trifurcate declined-nulls into `declined-with-reason` / `declined-triage (no reason expected: Proposal Not Invited / *Ineligible)` / `declined-reason-missing (should exist)`; **`(program-unattributed declines)` is its own fail-loud bucket** (native `akoya_programid`-null, ~9% of native declines) — never silently dropped or mis-assigned; doc-resident rationale (Puzzle 2c) → surface a retrieval **link** only (extraction deferred).
- **Primary Contact caption (mandatory):** `akoya_primarycontactid` = the institution's WMKF **foundation liaison / grant steward** (President's office for large gifts) — **NOT the PI**; the PI is `wmkf_projectleader` (see below).
- **PI column (`wmkf_projectleader`, program-conditional):** research-scoped exports → DEFAULT (near-complete ~90–98% native); non-research → `N/A — no PI (non-research process)` sentinel, never blank.
- **Institution disambiguation — fail-loud clustering, NO structural backstop:** `parentaccountid`/`akoya_defaultpayee` are ~0% (census) — unusable. Rollup clusters on `akoya_aka` (94%) + `wmkf_legalname` (82%) + `akoya_applicantid`/`akoya_payee` identities; `wmkf_usingpayee=true` is a *weak positive* divergence hint only (non-census sample evidence — do not present as precise). Unresolved/ambiguous orgs are surfaced as such; never imply false precision (e.g. "52 grants to UW" when variants are unresolved).

### 3d. Excel artifact writer (`workbook.js`)

ExcelJS 4.4.0 (already a dependency; mirror the `recordsToExcel` pattern + 3 MB trim guard in `pages/api/dynamics-explorer/chat.js`). Output:
- **Data sheet** — the default column contract (§4) + opted-in columns, with per-row sentinels (never bare blanks), era column, resolved-institution column.
- **Methods / Provenance sheet** — non-optional. The reproducible methods section: cutover date, `appliedRules[]` in plain English, per-bucket sentinel legend, composition line, program roll-up in/out line, decline-trifurcation legend, the test-record/operational exclusions applied, the institution-clustering caveat, true total vs returned (truncation), probe-provenance footnotes (probe-substantiated vs user-attested, tagged).

---

## 4. The column contract (S159-closed, user-confirmed, Codex-audited)

The default SET is owned by the design doc's **Artifact 1 table** (do not duplicate the list here — reference it). Build rules:

- **Default columns** = the Artifact-1 SET + S159 adds: `akoya_primarycontactid` (with the liaison caption), `account.address1_city`, `account.address1_stateorprovince`, and `wmkf_projectleader` **program-conditionally** (research → default PI; non-research → `N/A — no PI` sentinel).
- **Opt-in (flagged):** `akoya_payee` ("native-era only ~1% migrated; mostly mirrors applicant in sample, diverges notably e.g. fiscal-sponsor/research-foundation — taxonomy not exhaustive"). Bucket-D fields, opt-in, flagged sparse.
- **Pruned (never offered):** `akoya_purpose` (2-value boilerplate).
- Money columns export the `*_base` currency pair. Lookups export the formatted display + the resolved-entity where the engine resolves it.

---

## 5. API surface (`pages/api/dataverse-export/`)

All three routes: `requireAppAccess(req, res, 'dataverse-bulk-export')` (per-route gate — Codex packaging correction; registry membership is necessary but not sufficient). CSRF/origin via the existing `requireAppAccess` path.

| Route | Method | Behavior |
|---|---|---|
| `/api/dataverse-export/metadata` | GET | Live taxonomies (program/status/type) for the builder, enumerated from Dataverse **at request time** (Living-taxonomy: never hardcoded). Fail-loud on fetch failure (visible error, not a silent stale list). |
| `/api/dataverse-export/preview` | POST | `QuerySpec` → compiled FetchXML (returned for inspection) + **true total via FetchXML aggregate count** + composition preview (era split, classification, unclassified set, program roll-up in/out, estimated size/time). **Returns NO data rows.** This is the human-confirm gate. |
| `/api/dataverse-export/run` | POST | Confirmed `QuerySpec` → backoff-hardened FetchXML paging → Excel (Data + Methods sheets) → **SSE** progress frames + terminal `file_ready` (base64). Hard wall-clock budget; loud truncation. |

SSE convention mirrors Virtual Review Panel: `res.write(\`data: ${JSON.stringify({ event, ...data })}\\n\\n\`)`, headers `text/event-stream` (or VRP's chunked text/plain) / no-cache / keep-alive. Progress events: `{event:'progress', pages, fetched, total}`; terminal `{event:'file_ready', filenameBase64...}` or `{event:'error', message, retryable}`.

**API route security matrix:** `npm run check:api-routes` fails on `pages/api/**` additions without a matrix update — adding these 3 routes to `docs/API_ROUTE_SECURITY_MATRIX.md` is part of the implementation PR (catalogue grows 80→83).

---

## 6. The expert filter builder (`pages/dataverse-bulk-export.js`)

`RequireAppAccess` guard (client-side defense-in-depth; the API gate is authoritative). UI:

- **Structured filter builder** — business-vocabulary fields (not `akoya_*` logical names / optionset ints), discoverable. Every fan-out is a **forced explicit choice**, not a hidden default:
  - *Which type* (polymorphism — grant vs concept vs operational; operational excluded by default with a visible toggle).
  - *Which era scope* (provenance dimension; explicitly **not** a business-period control — the date-basis control is separate and labeled).
  - *Which date basis* (`akoya_decisiondate` default; `createdon` is **not** offered as a history filter).
  - *Which amount* (Awarded / Requested / Total project / Recommended / Invited — no bare "budget").
  - *Which program axis* (`akoya_programid` 24-program taxonomy default ∧ `wmkf_type=Program`; `wmkf_grantprogram` funding-category as a separate labeled filter).
- **Preview/confirm panel** (renders the `/preview` response): the compiled spec in plain English, the **true total prominently**, the mandatory composition line, the program roll-up in/out line, and any **unclassified / fail-loud warnings** — the user sees the gaps *before* they run.
- **Run + download** with live SSE progress; **loud truncation** if capped: true total shown prominently + the offered narrowing dimensions ("8,213 match — narrow by program / year / status / institution"), never a quiet footnote.

---

## 7. Packaging & access

- `shared/config/appRegistry.js`: new entry `{ key: 'dataverse-bulk-export', name: 'Dataverse Bulk Export', href: '/dataverse-bulk-export', icon: '📤', description: ..., categories: [...], features: [...] }` — mirror the Virtual Review Panel entry shape.
- Admin-assignable to a **volume-users** group via Dataverse `wmkf_appuserappaccesses` (the registry is nav/config only — Codex correction). Not superuser-only (too narrow).
- Every endpoint gated by `requireAppAccess(req, res, 'dataverse-bulk-export')`. Track A, when built, is a *separate* app key — do not bundle a read tool and a write tool under one coarse grant.

---

## 8. Engineering requirements (Codex-mandated v1 — not "later")

1. **Backoff-hardened paging is v1.** The robustness floor is *the big query must succeed*. 429/`Retry-After`/5xx → exponential backoff + jitter + capped retries; ultimate failure → loud actionable error, never a silent partial result. (Today's `queryAllRecords` throws on first non-200 — the exact broad query the tool exists for fails hardest; the new primitive must not.)
2. **Concrete sync budget + a hard wall-clock ceiling.** Worst case 20 pages × 30 s = 600 s > Vercel's 300 s; rows buffer in memory. Realistic *filtered* slices are hundreds–low-thousands → synchronous is fine for real cases. v1 = hardened-synchronous with a **hard wall-clock budget**; on budget-exceed → return what's fetched + `truncatedByBudget` + the loud-truncation UX, never a hang or a silent cut. Async/background-job model is a **deferred** phase, built only if a genuine need exceeds what hardened-sync safely delivers.
3. **Loud, actionable truncation.** Parameterize the arbitrary 5,000 cap; surface `capped` / true `totalCount` prominently in the UI with narrowing dimensions. (The helper already returns the signals — the defect was the cap + UI not surfacing it.)
4. **True total via FetchXML aggregate, never OData `/$count`.** A correctness invariant, not a nicety — `/$count` caps at 5,000 and *looks exactly like* the triggering "~5,000 requests."

---

## 9. Living-taxonomy & fail-loud runtime contract (concrete, not a slogan)

Enforced in the metadata route + disclosure engine (design doc §"Fail-loud runtime contract"):
- Taxonomies (`akoya_program`, `wmkf_type`, `akoya_requeststatus`, …) enumerated **live at query time**, never a hardcoded list. No documentation/drift cadence required (currency is in the runtime).
- A row whose program/status/type value is **absent from the semantic-annotation map** → **included** with raw value preserved + a per-row column `UNCLASSIFIED — <axis>=<rawvalue>`. Never silently dropped, never coerced to the nearest known bucket.
- Unclassified set summarized in the composition line + methods sheet: `K rows in N unclassified <axis> value(s): [list] — included, flagged, not interpreted`.
- Unclassified value on a **process-dependent output path** (e.g. decline-reason for a program with no process annotation) → emit raw + `UNCLASSIFIED PROCESS — manual review required` + a **hard UI warning**; do not apply a default process rule.
- No swallowed exceptions: taxonomy-fetch failure / unmapped value / unannotated program is a visible, actionable, artifact-baked condition — never a log line only.

---

## 10. Phasing & what's deferred

| Phase | Content | Gate |
|---|---|---|
| **1 — Deterministic spine** | FetchXML primitive (backoff paging + aggregate count), QuerySpec compiler, semantic/disclosure engine, Excel writer. Testable headless against fixture specs. | None — column contract + semantic rules are closed (S159). |
| **2 — Expert builder + API** | metadata/preview/run routes, the forced-fan-out builder UI, confirm gate, SSE run + download, appRegistry + Dataverse access. | None v1-core. |
| **3 — Guided preset library** *(deferred, not v1-core)* | Canonical trusted slice per program family (collapses the 139-view/121-shape surface). | The 121-view recognition working-session (per-program, with user/Connor/Sarah). Gates only this layer — the expert builder is fully usable without it (operator-supplied filters are the dominant trusted pattern). |
| **Later — AI on-ramp** | NL → proposed `QuerySpec` rendered back into the builder for confirmation. | Phase 2+; the compiler/confirm seam is built in v1 so this is additive, never a rewrite. |
| **Deferred** | Async/background-job export; bulk DOCX→text decline-rationale extraction (v1 surfaces a link); Track A entirely. | Evidence/scope triggers, not v1. |

---

## 11. Testing & gates

- **Probes are the fixtures.** The committed `scripts/probe-akoya-*.js` + dated evidence are the ground-truth oracle for compiler/engine unit tests (era classifier, decided-state map, program roll-up Option-B math, operational exclusion, test-record predicate, decline trifurcation incl. SoCal third field + program-unattributed bucket, the column contract). Living-taxonomy: counts are dated evidence — re-run a probe only with a *new* structural hypothesis.
- **`npm run check:api-routes`** — add the 3 routes to `docs/API_ROUTE_SECURITY_MATRIX.md` in the implementation PR (80→83); the gate fails on `pages/api/**` without it.
- **`npm run check:atlas` / `:atlas:self-test`** — read-only over already-documented entities (`akoya_request`, `akoya_program`, `account`, `contact`); no new Postgres tables. Confirm green before/after; no Atlas page additions expected (verify, don't assume).
- **Headless spine test (Phase 1 exit):** a fixture `QuerySpec` → compiled FetchXML snapshot + aggregate-count call + Excel byte-shape, with backoff simulated (injected 429s) — proves "the big query succeeds" before any UI.
- **Disclosure golden test:** a known mixed-era, mixed-program, declined-with-nulls result → assert every sentinel, the composition line, the program roll-up in/out line, and zero bare blanks.

---

## 12. Open questions / decisions needed

1. **Excel delivery mechanism for large files.** `file_ready` base64-over-SSE mirrors the Explorer export, but the 3 MB XLSX guard is small for a "generous chunk." Decision: raise the guard + chunk the base64, or switch `/run` to a streamed `Content-Disposition: attachment` download with SSE only for progress? (Leaning: streamed attachment; confirm.)
2. **Hard wall-clock budget value.** Vercel ceiling is 300 s; pick the v1 budget (e.g. 240 s) and the page-size (`Prefer: odata.maxpagesize`, 500 like the OData path or larger for FetchXML?). Needs one measured timing run against a realistic broad filtered slice.
3. **`wmkf_grantprogram` as a second program filter — surface in v1 or Phase 2?** It's a resolved *axis* (model (b)) but a second program control adds builder complexity; v1 could ship `akoya_programid`-only with `wmkf_grantprogram` as a labeled Phase-2 add. (Leaning: v1 `akoya_programid` default + the funding-category filter behind an "advanced" disclosure.)
4. **Institution-cluster presentation.** Given no structural backstop, does v1 (a) emit a `resolved_institution` best-effort cluster column + a fail-loud "unresolved variants" annotation, or (b) emit raw applicant/payee + AKA + legal-name columns and leave clustering to Excel? (Leaning: (b) for v1 — honest, no false precision; (a) is a Phase-2 enhancement once the clustering heuristic is validated.)

---

## 13. Out-of-scope reminders (carried from the design doc)

- **Not a generic builder, not fixed templates.** A plain-English structured filter builder + mandatory disclosure; refine-in-Excel. AI is a Phase-2 on-ramp, not the core.
- **Threat model:** optimize against the *plausible* wrong answer that passes the sniff test; provenance = a reproducible methods section, not defensive armor. Users are accountable PhDs/lawyers/MBAs.
- **"Ever" is rhetorical.** Deep-history is a Track A / Explorer find-one pattern; it must not contaminate Track B's semantic layer.
- **Status & semantic determinations are owned by `docs/DATAVERSE_POWER_TOOLS_DESIGN.md`** ("Residuals — AUTHORITATIVE LIST"). This plan references; it does not re-derive. Any drift → reconcile there first (the reconcile-don't-append discipline).
- **Provenance discipline:** probe-substantiated vs user-attested is tracked per-determination in the design doc; the methods sheet must carry that tagging through to the artifact (never present user-attested semantics as probe-proven).
