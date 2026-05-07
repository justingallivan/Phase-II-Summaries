# Intake Portal & Pilot Schema Changes — Audit Catalog

Per `project_dataverse_creator_privileges.md` (2026-05-06), Connor delegated entity/field creation authority to Justin/Claude for pilot-scope work under a summary-after model. This file is the running catalog of every Dataverse change made under that delegation.

**Conventions:**
- One section per change batch, newest first.
- Each entry: date, scope, list of entities/fields/choices, rationale, status.
- Pilot-scope only. Out-of-scope (vendor entity restructures, AkoyaGo-affecting changes) still requires explicit Connor sign-off.

---

## 2026-05-07 — Workflow-chaining fields on `akoya_request` (planned, Justin/Claude)

**Scope:** 6 `wmkf_ai_*` fields on `akoya_request` that downstream prompts (compliance, PD assignment, reviewer matching) read instead of re-parsing the full proposal. Closes Q5 in `docs/archive/CONNOR_QUESTIONS_2026-04-15.md`. Falls under 2026-05-06 creator-privilege delegation.

**Status:** Not yet applied.

| Field | Type |
|---|---|
| `wmkf_ai_keywords` | Memo (JSON array) |
| `wmkf_ai_methodologies` | Memo (JSON array) |
| `wmkf_ai_riskflags` | Memo (JSON array) |
| `wmkf_ai_teaminfo` | Memo (JSON) |
| `wmkf_ai_budgetsummary` | Multi-line text |
| `wmkf_ai_timeline` | Multi-line text |

Field names normalized to `wmkf_ai_*` no-underscore-after-prefix convention (per v3 spec naming rule), so `wmkf_ai_risk_flags` → `wmkf_ai_riskflags`, etc.

---

## 2026-05-07 — Echo-prompt parity oracle row in `wmkf_ai_prompt` (planned, Justin/Claude)

**Scope:** Single seeded `wmkf_ai_prompt` row that echoes its inputs as outputs. Approved by Connor 2026-05-07 as a parity test oracle: both Vercel `executePrompt()` and the upcoming PA-side `ExecutePrompt` child flow should produce byte-identical `wmkf_ai_run` rows for identical inputs. Cheap drift-detector across the two Executor implementations.

**Status:** Not yet seeded. No new schema — just a new row in the existing `wmkf_ai_prompt` table.

**Naming proposal:** `executor.echo-parity` (`<domain>.<purpose>` per `project_prompt_storage_strategy.md`).

---

## 2026-05-07 — `wmkf_apprequestperson` junction (planned, Justin/Claude to deploy)

**Scope:** Net-new junction entity tracking PI/co-PI participation across `akoya_request` history. Resolves the S136 lock (`project_reviewer_postgres_to_dataverse_migration.md`) and Connor's 2026-05-07 sign-off on vendor-data junctions.

**Status (2026-05-07):** Schema deployed to prod (`lib/dataverse/schema/wave2/wmkf_app_request_person.json` applied via `apply-dataverse-schema.js --target=prod --wave=2 --execute`). Entity, both attrs, both lookups, and alt key all confirmed live. Backfill script not yet written.

Deploy hit Dataverse 429 throttling between metadata customizations (concurrent `EntityCustomization` lock). The apply script is idempotent so a 30s-backoff retry loop completed it cleanly. Future schema deploys should expect the same — bake retry-with-backoff into any wrapper script.

**Schema:**
- `wmkf_request` — Lookup → `akoya_request`
- `wmkf_contact` — Lookup → `contact`
- `wmkf_role` — Choice: `pi | copi`
- `wmkf_authorposition` — Whole number, optional (0 for PI; 1–5 for legacy co-PI slot of origin)
- Alt key: `(wmkf_request, wmkf_contact, wmkf_role)`
- Ownership: OrganizationOwned

**Population:**
- One-time backfill (`scripts/backfill-request-person-junction.js`) — walks every `akoya_request`, emits ~3,000 rows. Justin/Claude.
- Ongoing sync — **Connor's net-new PA flows** on `akoya_request` create/update. PA flows create `contact` records as needed and write junction rows directly.
- **`_wmkf_projectleader_value` (PI lookup) stays live** — used by other flows unrelated to reviewers. PA flows dual-write (projectleader field + junction `pi` row). Only the **co-PI slots** (`_wmkf_copi1..5_value`) become obsolete read-only legacy data post-migration.

**Read-side strategy (steady state, revised 2026-05-07):** `/api/reviewer-finder/contact-history` UNIONs junction rows (role = pi OR copi) with `akoya_request._wmkf_projectleader_value` matches. Not a fallback — projectleader stays authoritative for PI in parallel with the junction. Avoids transition-window failure modes (junction stale on a projectleader-only update, or vice versa).

---

## 2026-05-07 — `wmkf_expertise` Memo on `systemuser` (created by Connor)

**Scope:** New Memo field `wmkf_expertise` on `systemuser` for Program Director expertise descriptions (e.g., "organic chemistry, materials science, catalysis"). Created by Connor (vendor-entity addition outside delegated scope, but included in this catalog for completeness).

**Status:** Live. Swap-out of hardcoded PD GUIDs/expertise in PA + Vercel prompts is downstream and not yet scheduled.

**Note:** Field name collides nominally with the planned `wmkf_expertise` column on `wmkf_app_expertise_roster` (per `docs/POSTGRES_TO_DATAVERSE_MIGRATION.md`). No conflict — Dynamics scopes custom field names per entity.

---

## 2026-05-07 — Field Set B (Grant Report Extraction) skeleton

**Scope:** Add Field Set B fields to `akoya_request` per `docs/DYNAMICS_AI_FIELDS_SPEC_v3_cn.md`. Connor's call: build the skeleton as currently spec'd; iterate later based on staff feedback.

**Status:** Cleared to build. Not yet applied.

**Counts (Whole number, nullable):**
- `wmkf_ai_reportpostdocs`
- `wmkf_ai_reportgradstudents`
- `wmkf_ai_reportundergrads`
- `wmkf_ai_reportpubstotal`
- `wmkf_ai_reportpubspeerreviewed`
- `wmkf_ai_reportpubsnonpeerreviewed`
- `wmkf_ai_reportpatentsawarded`
- `wmkf_ai_reportpatentssubmitted`

**Multi-line text:**
- `wmkf_ai_reportadditionalfunding`
- `wmkf_ai_reportprojectimpacts`
- `wmkf_ai_reportawardsandhonors`
- `wmkf_ai_reportimplications`
- `wmkf_ai_reportoutcomesummary`
- `wmkf_ai_reportgoalsassessment` (JSON payload — full per-goal breakdown)
- `wmkf_ai_reportnotesforstaff`

**Publication fields (flat, not JSON — Connor 2026-05-07):**
- `wmkf_ai_reportpub1citation` (Multi-line text)
- `wmkf_ai_reportpub1abstract` (Multi-line text)
- `wmkf_ai_reportpub1source` (Single-line text)
- `wmkf_ai_reportpub2citation` (Multi-line text)
- `wmkf_ai_reportpub2abstract` (Multi-line text)
- `wmkf_ai_reportpub2source` (Single-line text)

**Choice:**
- `wmkf_ai_reportoverallrating` — `successful` / `mixed` / `unsuccessful` (Connor 2026-05-07: fine as a starting set; full rating mechanism not yet spec'd, expect iteration).

**Provenance:** All runs writing these fields log to `wmkf_ai_run` with `wmkf_ai_tasktype = 682090001` (Report).
