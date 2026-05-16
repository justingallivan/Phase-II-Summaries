# Dataverse Power Tools — Scoping & Design

**Status:** Scoping converged (2026-05-15, Session 156). Not yet a build plan — a grounding probe is mandatory before any implementation plan per the project ground-truth rule.

**Origin:** Dynamics Explorer serves the "most users, simple question" case well. Two gaps remain that it structurally cannot fill, currently absorbed by the Akoya Go model-driven app (functional but poor UX):

1. Staff who must keep the database current need to **find a specific record and edit a field**.
2. Users (incl. non-technical ones — the triggering example was a CSO-level request for ~5000 requests as a downloadable Excel) need **filtered data at a volume Dynamics Explorer cannot return**.

These are two different tools with different risk profiles and **will be built as two separate apps**. Keeping them separate means neither compromises for the other (Track A never pages tens of thousands of rows; Track B never touches a write path) and fits the existing "skinny scope, leverage existing infra" philosophy (`.claude-memory/project_intake_portal_skinny_scope.md`). They plausibly sit on the long-game GOapply/Akoya-replacement arc rather than being a side quest.

---

## Why Dynamics Explorer can't do this

`pages/api/dynamics-explorer/chat.js` is a single agentic endpoint. Its query tool, `dynamics-service.queryRecords()`, is **[VERIFIED via grep]** hard-capped at `$top` 100 and requires either a `$filter` or `$top <= 25`. That cap is deliberate — it keeps the LLM from blowing its context window. It is the structurally wrong tool for "return 5000 rows as a spreadsheet," and no prompting fixes that.

The plumbing for the real answer already partly exists:

- `dynamics-service.queryAllRecords()` **[VERIFIED — code read S156]** paginates via `@odata.nextLink` (`EXPORT_PAGE_SIZE = 500` through `Prefer: odata.maxpagesize`), requires a `$filter` (no unfiltered dumps), and returns `{ records, totalCount, capped }`. The `MAX_EXPORT_RECORDS = 5000` cap is an **arbitrary guardrail, not a documented limit** — bare constant, no rationale comment, hard `break` + truncate `allRecords.length = 5000`. It already knows the *true* `totalCount` (`$count=true`) and already signals truncation via `capped`. Per-page `API_TIMEOUT = 30_000` (30s).
- `dynamics-service.searchRecords()` **[VERIFIED — code read S156]** — Dataverse Search API (`/api/search/v1.0/query`), relevance-ranked, entity-spanning via an `entities` string array (e.g. `['akoya_request','contact','account']`), `top` clamped 1–100 (default 20), optional OData `filter`, `returntotalrecordcount`. Results normalized to `{ entity, objectId, score, highlights, attributes }`. Caveat: only Dataverse-Search-indexed tables are covered; `top` ≤ 100 means "locate the record" relies on relevance + optional filter, not browsing — consistent with the Track A design.
- `getEntityAttributes()` **[VERIFIED — code read S156]** returns per attribute `{ logicalName, displayName (localized, falls back to logicalName), type (AttributeType), description, isRequired }`, filtered to `IsValidForRead`. **Two material gaps for Track A:** (a) it *fetches* `IsValidForCreate`/`IsValidForUpdate` but **drops them in the `.map()`** — the editor needs `IsValidForUpdate` to decide editable vs read-only, so this method needs a small extension; (b) it returns **no optionset option-labels and no lookup target-entity** — those come from *different* sources (see Track A typed-field note). `getRecord()` runs every record through `processAnnotations()`, which **[VERIFIED]** emits `${field}_formatted` (human-readable optionset/lookup display values) and `${field}_entity` (lookup target logical name) and preserves `_etag` as `_etag` for If-Match optimistic concurrency.
- `exceljs` **[VERIFIED]** is already a dependency and already used inside `chat.js`.

So this is largely an assembly + UX job over existing primitives, not new infrastructure.

---

## Track A — "Find & fix" (maintenance staff)

The real product is **not "edit a field"** — the edit is trivial. The hard part is **field discovery**: the database has WMKF custom fields, commonly-used Akoya Go fields, and a very large tail of fields nobody uses. A staffer knows the *data* they want to change but typically does not remember the Dynamics logical field name. Per user (S156): the **vast majority of maintenance work is on already-populated fields**, surgical, in relatively few fields.

### Find
One search box backed by Dataverse Search (`searchRecords()`). Entry point varies in practice — sometimes a request number, sometimes an institution name, sometimes an email, sometimes a PI name — and full-text entity-spanning search funnels all of those through one box → ranked candidate records → user picks the right one. Deliberately **not** a filter builder; this is "locate the one record," small result count. (This is the only overlap with Track B, and it is shallow: relevance lookup vs. deterministic bulk filter.)

### Fix (primary primitive)
Open the record → fetch it whole (`getRecord` without `$select` returns all fields) → render **only the fields that actually have a value**, each with its **human display label** (not `wmkf_obscurething`) and current value → inline edit. A record with hundreds of possible fields typically has ~30–50 populated; the thousands of empty/unused fields never render. This directly answers "obscure data lives in Dynamics but I don't remember the field" for the common case (field already has a value).

### Fix (secondary, for currently-empty fields)
Label/description search over the entity's attribute metadata (`getEntityAttributes`) — "program officer" surfaces matching logical fields by display name even when blank on this record. This is the one place in Track A where an LLM legitimately earns its keep (semantic "which field is that?"); the **write itself stays deterministic, confirmed, and audited**.

### Typed-field handling (the real engineering meat)
Editing typed Dataverse fields is not text boxes. The editor must be type-aware: optionsets need option-label metadata, lookups need target-entity + GUID-free resolution, two-options / money / datetime each differ. **v1 scope line:** handle the safe scalar types (text / number / date / yes-no) cleanly; render optionsets and lookups **read-only** with a phase-2 follow. Editing those wrong silently corrupts data.

**Probe finding (S156) — the editor must compose three sources, not one:** `getEntityAttributes` alone is insufficient. (1) editability flags: `getEntityAttributes` must be extended to surface `IsValidForUpdate` (currently fetched-but-dropped); (2) human-readable current values for optionsets/lookups: come free from `getRecord` → `processAnnotations` as `${field}_formatted` / `${field}_entity`; (3) lookup *target entity* (for phase-2 editing): `getEntityRelationships()` (exists, returns `manyToOne.referencedEntity`). Track A's read/display path is well-supported by existing code; the only required service change for v1 is surfacing `IsValidForUpdate`. **Concurrency bonus:** `_etag` is already preserved on every `getRecord`, so a safe If-Match guarded write (reject if the record changed under the editor) is cheap to implement.

### Write contract (non-negotiable, not a design choice)
Writes attributed to the acting staffer via the existing `MSCRMCallerID` impersonation contract (`docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md`) + audited.

### Track A edit mode (v1)
Single-record find → edit. No bulk-write surface in v1. (Small selected-set and spreadsheet-round-trip bulk edit are deliberate later phases, sequenced after single-edit is proven.)

---

## Track B — "Bulk export" (volume users)

Separate app. Read-only, deterministic filter → paged pull → Excel download. Lower risk; mostly assembly over `queryAllRecords()` + `exceljs`. The literal blocker is the `MAX_EXPORT_RECORDS = 5000` cap and the Explorer's `$top` 100 agentic cap.

### Open questions (NOT yet decided with the user)
- **Volume ceiling / execution model.** Realistic top end unknown — "~10k" (single synchronous request is plausible within Vercel's 300s timeout at 500/page) vs. "entire request history, tens of thousands" (needs a background-job execution model). Decides sync-vs-async.
- **Query construction UX.** Saved parameterized reports authored in code (matches forms-as-code / skinny-scope philosophy; serves non-technical users like the triggering CSO request directly) vs. a generic guided filter builder vs. both (templates + a raw-query escape hatch gated to a smaller power group). Not pinned.

---

## Packaging & access (proposed, not finalized)

Two entries in `shared/config/appRegistry.js`, each app-key gated and admin-assignable to its own group (Find&fix → maintenance staff; Bulk export → volume users), mirroring the Virtual Review Panel admin-assign model. Superuser-only is likely too narrow (maintenance staff / the CSO are probably not superusers). One combined "Data Admin" app is the fallback if registry/nav surface is a concern, but it bundles a read tool and a write tool under one grant — coarser permissioning.

---

## Grounding probe — DONE (Session 156, source-contract read)

All three targets resolved against `lib/services/dynamics-service.js` (no prod Dataverse calls needed). Findings folded into the verified bullets and the Track A typed-field note above. Net:

1. **`getEntityAttributes`** — exposes labels/type/description/required, filtered to readable. One required v1 service change: surface the already-fetched `IsValidForUpdate`. Optionset/lookup display handled by the existing `processAnnotations` path, not this method.
2. **`searchRecords`** — confirmed the right Track A "find" primitive (relevance-ranked, entity-array scoping, `top` ≤ 100). Caveat: entity must be Dataverse-Search-indexed.
3. **`MAX_EXPORT_RECORDS = 5000`** — arbitrary guardrail, not a documented limit. The triggering ~5000-request export sits *exactly at the cap* and would silently truncate to 5000 with `capped:true` while `totalCount` shows the real number. Track B's first concrete change: parameterize the ceiling + surface `capped`/`totalCount`, then decide sync (bounded by 30s/page + Vercel timeout) vs. async job for higher ceilings.

**No blocking unknowns remain for a Track A v1 implementation plan.** Track B still needs the two user decisions (volume ceiling, query UX) before its plan.

---

## Decisions converged with user (Session 156)

- Two separate apps, not one. (User instinct, confirmed.)
- Track A: vast majority of work is populated-fields-only, labels, inline edit. Record identification varies (request # / institution / email / PI name) → single Dataverse Search box.
- Track A v1: single-record edit only; safe scalar types only; optionset/lookup read-only until phase 2.
- Track B kept as the lower-priority, less-defined track for now; Track A is higher-pain and higher-clarity.
