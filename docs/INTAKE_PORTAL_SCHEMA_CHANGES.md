# Intake Portal & Pilot Schema Changes — Audit Catalog

Per `project_dataverse_creator_privileges.md` (2026-05-06), Connor delegated entity/field creation authority to Justin/Claude for pilot-scope work under a summary-after model. This file is the running catalog of every Dataverse change made under that delegation.

**Conventions:**
- One section per change batch, newest first.
- Each entry: date, scope, list of entities/fields/choices, rationale, status.
- Pilot-scope only. Out-of-scope (vendor entity restructures, AkoyaGo-affecting changes) still requires explicit Connor sign-off.

---

## 2026-05-13 — Intake portal pilot — three entities queued (Connor sync, Track 1)

**Scope:** Three new pilot entities approved in shape during the 2026-05-13 Connor+Sarah sync. Two are confirmed for pilot; one is narrowed-scope replacement of the 2026-05-06 plan.

**Status:** Queued — JSON specs to be drafted by Justin/Claude under `lib/dataverse/schema/intake/` for Connor design review by **2026-05-15**. Apply to prod by **2026-05-18** (idempotent reruns + 30s-backoff retry per recent gotchas). Names below are working — naming alignment with the 2026-05-06 suggestions (`wmkf_budgetline` / `wmkf_personnel`) is itself an open question for Connor's review.

### `wmkf_portal_membership` — contact ↔ account join with approval state

Shape approved 2026-05-13 as drafted in `INTAKE_PORTAL_DESIGN.md` "One new entity" section. No changes from the 2026-05-06 baseline. Institution-claim approval workflow lives portal-side at `/apply/admin/memberships` (Option A); Connor's PA is not on the approval path.

### `wmkf_proposalbudgetline` (working name) — budget rows child of `akoya_request`

| Attribute | Type | Notes |
|---|---|---|
| `wmkf_proposalbudgetlineid` | PK | |
| `wmkf_name` | Text(160) | Synthesized: `Y{year} — {category}: {description}` |
| `_wmkf_request_value` | Lookup → `akoya_request` | Parental, cascade delete |
| `wmkf_year` | Whole number (1–10) | Int, not Choice (forward-compatible across program lengths) |
| `wmkf_category` | Choice | Pilot values: Personnel, Equipment, Supplies, Travel, Other Direct, Indirect (reserved) |
| `wmkf_description` | Text(500) | Line-item description |
| `wmkf_amount` | Money (USD) | |
| `wmkf_lineorder` | Whole number | Display order within `(request, year, category)` |

### `wmkf_proposalroster` (working name) — co-PI + key personnel child of `akoya_request`

Shape not yet sketched — to be drafted alongside `wmkf_proposalbudgetline` for Connor's 2026-05-15 review. Working assumptions: 1:N parental from `akoya_request`; per-row contact lookup + role choice (PI / Co-PI / Senior Personnel / Key Personnel / Other) + percent effort + optional biosketch attachment reference. Shape should align with the existing `wmkf_apprequestperson` junction's role taxonomy where possible.

### Deferred (was in 2026-05-06 plan, dropped to next cycle)

- **`wmkf_milestone`** — captured as narrative field on `akoya_request` for pilot.
- **`wmkf_priorsupport`** — captured as attached PDF for pilot.

Both expand to real child entities post-pilot. Narrowing the 2026-05-06 set keeps schema work to two entities in the 20-day pilot window.

### Outstanding before specs are written

- Connor weighs in on the `wmkf_proposalbudgetline` vs. `wmkf_budgetline` naming (and `wmkf_proposalroster` vs. `wmkf_personnel`).
- Connor confirms the category Choice values for `wmkf_proposalbudgetline.wmkf_category` match WMKF Research conventions.
- Cover-doc template structure (Connor's PA reads the rows + populates a Word template grouped by year + category) — drives whether we need a synthesized `wmkf_name` or PA assembles its own display strings.
- Sarah's Phase II Research field inventory (Track 2 carryover from 2026-05-13) — confirms whether budget + roster are the only repeating sections worth structuring for pilot.

---

## 2026-05-07 — Workflow-chaining fields on `akoya_request` + Field Set B (deployed, Justin/Claude)

**Scope:** 6 workflow-chaining `wmkf_ai_*` fields + 22 Field Set B fields on `akoya_request` (28 total). Deployed to prod 2026-05-07 in a single batch via `lib/dataverse/schema/wave2-existing/akoya_request-ai-extensions.json`. Closes Q5 in `docs/archive/CONNOR_QUESTIONS_2026-04-15.md` and the Field Set B skeleton entry below.

**Status:** Live in prod. All 28 attributes confirmed via `apply-dataverse-schema.js --target=prod --wave=2 --execute` (idempotent rerun shows `· exists` on all).

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

## 2026-05-07 — Field Set B (Grant Report Extraction) skeleton — SUPERSEDED

**Status:** Deployed as part of the combined batch in the "Workflow-chaining fields on `akoya_request` + Field Set B" entry above. Field shapes below preserved for diff-reference; refer to `lib/dataverse/schema/wave2-existing/akoya_request-ai-extensions.json` for the live spec.

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

---

## 2026-05-09 — Reviewer Stage 2a slice 1 (S143)

**Driver:** `docs/REVIEWER_STAGE_2A_BUILD_PLAN.md` slice 1 — Stage 2a invitation-landing page (pre-materials).

**Wave:** 3 (`lib/dataverse/schema/wave3/`).

### New entities

- **`wmkf_policy`** (parent — policy slot) — primary name `wmkf_code`, alt-key on code, lookup `wmkf_activeversion` → `wmkf_policyversion`. General-purpose slot library; first uses are `reviewer-coi` and `reviewer-ai-use`.
- **`wmkf_policyversion`** (child — versioned text) — primary name `wmkf_versionlabel`, lookup to parent `wmkf_policy`, `wmkf_policytitle` + `wmkf_policybody` (Memo) + `wmkf_effectivedate`. Each row immutable once referenced by an engagement row.

Atlas: `docs/atlas/dataverse-wmkf-policy-and-policy-version.md`.

### New fields on `wmkf_appreviewersuggestion`

Engagement-scope contact corrections (write target for Stage 2a self-confirmations; never propagated to `wmkf_potentialreviewers` or `contact`):
`wmkf_reviewerfirstname`, `wmkf_reviewerlastname`, `wmkf_reviewernickname`, `wmkf_reviewertitle`, `wmkf_revieweremail`, `wmkf_reviewerorcid`.

Decline structured capture:
`wmkf_declinereason` (Memo, was the locked-S136 field), `wmkf_declinereasonpicklist` (Picklist 5 options), `wmkf_declinereferral` (Memo).

State stamps:
`wmkf_honorariumoptout` (Boolean), `wmkf_withdrawnsufficientat` (DateTime), `wmkf_coiackedat` + `wmkf_aiuseackedat` (DateTime).

Policy ack lookups (pin to exact `wmkf_policyversion` row):
`wmkf_coipolicyversion` (Lookup), `wmkf_aiusepolicyversion` (Lookup).

### Picklist extension

`wmkf_appreviewersuggestion.wmkf_responsetype`: added `withdrawn_sufficient = 100000003` via `scripts/extend-responsetype-picklist.mjs`.

### Native entity audit

Enabled `IsAuditEnabled = true` on `wmkf_appreviewersuggestion` via `scripts/enable-suggestion-audit.mjs` (PUT against EntityDefinitions endpoint with full body). Replaces a parallel `wmkf_reviewer_audit` entity that the plan originally proposed — uses Dataverse's native field-level before/after capture instead.

### Seed rows

`scripts/seed-stage2a-policies.mjs` creates two parents (`reviewer-coi`, `reviewer-ai-use`) plus one Active child each (`wmkf_versionlabel = 2026-05-09`). AI-use body lifts from review form footer; COI body uses an explicit `[PLACEHOLDER]` until staff feedback on wording lands. Idempotent — safe to re-run.

### Pending before slice 1 ships to a real cycle

- Replace the COI placeholder body with finalized staff-approved text (create new `wmkf_policyversion` row, flip `wmkf_activeversion`).
- Configure Dataverse security role to restrict delete privilege on `wmkf_policy` / `wmkf_policyversion` to admin role (per immutability rules §4a in build plan).
- Remaining slice-1 work: extend `/api/external/review/[token]/context` payload, build `/respond` endpoint, page composition rewrite (state-driven view dispatch on existing route).

