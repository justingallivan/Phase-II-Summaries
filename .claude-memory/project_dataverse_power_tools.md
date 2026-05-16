---
name: Dataverse Power Tools — two separate apps (Find&fix + Bulk export)
description: Scoped S156 plan to fill the two gaps Dynamics Explorer can't (targeted field edits; high-volume filtered export) — both currently absorbed by Akoya Go
type: project
originSessionId: S156
---
Dynamics Explorer covers the "most users, simple question" case but structurally cannot do two things still done in Akoya Go (poor UX): (1) maintenance staff finding a record and editing a field; (2) volume users pulling filtered data beyond what the Explorer's agentic query can return (triggering example: a CSO-level ask for ~5000 requests as an Excel download). These become **two separate apps** — different risk profiles, kept apart on purpose.

**Why:** The Explorer's query tool (`dynamics-service.queryRecords`) is deliberately capped at `$top` 100 (LLM context guard) — wrong tool for bulk. The real Track-A product is *field discovery*, not editing: huge field tail, users don't recall logical names. ~60% of plumbing already exists: `queryAllRecords` (paginates, `MAX_EXPORT_RECORDS=5000`), `searchRecords` (Dataverse Search), `getEntityAttributes`, `exceljs` (already a dep). Fits the [[project_intake_portal_skinny_scope]] "leverage existing infra" philosophy; plausibly on the GOapply-replacement long-game arc.

**How to apply:**
- Full design + verified/assumed state claims: `docs/DATAVERSE_POWER_TOOLS_DESIGN.md`. Read it before any build plan.
- Track A primitive = "show only populated fields, with human display labels, inline edit" via `getRecord` (no `$select`) + `getEntityAttributes` labels. v1: single-record find→edit; safe scalar types only; optionset/lookup READ-ONLY until phase 2. Writes attributed via `MSCRMCallerID` per [[project_dynamics_identity_reconciliation]] + audited.
- Track B = read-only deterministic filter → paged pull → Excel; lower priority. Open: volume ceiling (sync vs async) + query UX (parameterized reports vs builder) — NOT decided with user.
- Packaging (proposed, not final): two `appRegistry.js` keys, admin-assignable, Virtual-Review-Panel model.
- Grounding probe DONE (S156, source read). Key findings: `getEntityAttributes` drops the already-fetched `IsValidForUpdate` (one required v1 service change); optionset/lookup display + `_etag` concurrency come free from `getRecord`→`processAnnotations`; `searchRecords` confirmed the Track A "find" primitive; the 5000 export cap is arbitrary and the triggering query sits exactly at it (silent truncate, `capped`/`totalCount` already signaled). **No blocking unknowns for a Track A v1 plan.** Track B still needs the 2 user decisions (volume ceiling, query UX) before its plan.
