# Session 139 Prompt: Wave 2 build kickoff + remaining doc-triage refresh

## Heads up — read before doing anything

Session 138 was a Connor-present working session that resolved every open Connor question on the books, plus a doc-currency triage that archived 36 closed/historical docs. Both fronts moved. The major design surface that changed is the **`wmkf_apprequestperson` junction read-strategy**: contact-history now does a UNION (junction OR `_wmkf_projectleader_value`), not a junction-first/6-OR-fallback. Critical nuance — read `docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md` §5 before touching the contact-history endpoint.

Also: **`wmkf_ai_run` audit columns Q6 turned out to already exist** (`wmkf_ai_promptoverridden`, `wmkf_ai_runsource`) — this was caught by Codex review of the same-day commit. The pattern is the kind of ground-truth miss `CLAUDE_REMEDIATION_PLAN.md` is meant to prevent. Carryover memo: **before marking anything as "to build under delegation," grep the codebase first.**

A new `scripts/check-doc-currency.js` flags drift signals beyond the age + status-verb probe — code-name mismatches, table-liveness drift, source-of-truth drift, path-contract drift. Run it before doc edits in living plans.

## Session 138 summary

### What was completed (in chronological order)

1. **Verified Connor docs were stale before drafting agenda.** `CONNOR_QUESTIONS_2026-04-15.md` had Q5/Q6 framed as Connor asks but they were already under the 2026-05-06 creator-privilege delegation (Q5) or already deployed in production (Q6 — only caught later by Codex). `CONNOR_BRIEF_PHASE0.md` was send-ready but priority-stale (reviewer migration outranks PA-side ExecutePrompt build). Built a 4-item live agenda from the surviving questions plus pilot-junction items.

2. **Resolved every agenda item with Connor in the room** (`4005e7e`):
   - **Q4 (Field Set B)** — cleared to build skeleton; flat publication fields chosen over JSON; starting choice values for overall rating accepted as v1.
   - **Q7 (PD expertise on systemuser)** — Connor created `wmkf_expertise` Memo. Three docs updated to flip the dependency to done.
   - **`wmkf_apprequestperson` junction** (collapsed items 2+3 of agenda) — vendor-data junction approved. Connor builds net-new PA flows (`akoya_request` create/update → create contacts as needed → write junction rows + dual-write `_wmkf_projectleader_value`). Justin/Claude owns schema deploy + backfill. Critical detail: PI lookup field stays live (other flows depend on it); only co-PI slots become obsolete.
   - **Phase 0 PA-side ExecutePrompt** — bandwidth confirmed, build proceeds in parallel with pilot work; echo-prompt parity oracle approved as drift detector.
   - Sent Connor a memo email recapping resolutions + per-side work split.

3. **Codex review of the Connor-sync commit caught real issues** (`9827802`):
   - **CRITICAL** — junction read strategy was specified as "junction-first / 6-OR fallback," which fails in two transition windows. Revised to UNION (junction OR projectleader-field) as steady-state.
   - **IMPORTANT** — Q6 columns (`wmkf_ai_promptoverridden`, `wmkf_ai_runsource`) already exist in production via `lib/services/execute-prompt.js`. Reframed Q6 from "to build under delegation" to "already done — doc was stale."
   - Several smaller catalog-completeness gaps closed (Q5 fields, echo-prompt oracle, goals-assessment JSON exception called out).

4. **Doc-currency triage Step 1+2** (`192e6e1`):
   - 119 markdown docs categorized into Buckets A (authoritative) / B (living plans) / C (point-in-time) / D (per-app guides) / E (Atlas) / Other.
   - `docs/DOC_TRIAGE_2026-05-07.md` artifact captures the analysis with explicit Bucket C allowlist (36 files).
   - `scripts/check-doc-currency.js` implements four drift probes Codex suggested: code-name drift, table-liveness mismatch, source-of-truth drift, path-contract drift. Pattern-configured for easy extension when new drift modes get caught.
   - Codex review (gpt-5.3-codex) of the triage flagged two corrections (API_ROUTE_SECURITY_MATRIX has known gap; DYNAMICS_SCHEMA_ANNOTATION is cited as Atlas-reconciliation input, not "Other"). Folded in.

5. **Doc-currency triage Step 3** (`f191f24` + `<wrap-commit>`):
   - 36 closed/historical docs moved via `git mv` to `docs/archive/`.
   - 5 living plans had path citations rewritten via sed.
   - `PROMPT_STORAGE_DESIGN.md` drift fix folded in (stale column names → live production names).
   - End state: `docs/` top-level dropped from 97 → 57 files; `docs/archive/` grew from 4 → 40.

### Commits

- `4005e7e` — Resolve all open Connor questions; seed schema-changes catalog
- `9827802` — Address Codex review of 2026-05-07 Connor sync commit
- `192e6e1` — Doc triage Step 1+2: categorize 119 docs, add drift detector
- `f191f24` — Doc triage Step 3: archive 36 closed/historical docs to docs/archive/
- `<wrap-commit>` — Fold in path rewrites + drift fixes that should have been in f191f24

### Memory updates this session

None written. Domain memories that informed the session:
- `project_dataverse_creator_privileges.md` (delegation scope)
- `project_intake_portal_pilot_decisions_2026-05-06.md` (six-decision walkthrough resolutions)
- `project_reviewer_postgres_to_dataverse_migration.md` (S136 lock state)
- `project_dynamics_ai_writeback.md` (Field Set v3 status)
- `project_codex_recurring_review.md` (Codex-as-input pattern)

## Production state

- **Connor's plate (his next build):** PA-side `ExecutePrompt` child flow + PA flows on `akoya_request` create/update for junction sync. Both unblocked.
- **Justin/Claude's plate (5 build items, all unstarted):**
  1. Echo-prompt parity oracle row in `wmkf_ai_prompt` (smallest, ~30 min)
  2. `wmkf_apprequestperson` schema deploy via `apply-dataverse-schema.js` + alt key
  3. `scripts/backfill-request-person-junction.js` (~3,000 rows from existing slot fields)
  4. Field Set B skeleton + 6 workflow-chaining fields on `akoya_request` (~22 fields total in one batch)
  5. `/api/reviewer-finder/contact-history` endpoint with the **UNION read strategy** (junction OR projectleader-field, NOT junction-first fallback)
- **Atlas + CI gate live and self-tested.** `npm run check:atlas` + `:self-test` still green.
- **Wave 1 in steady state.** Stability clock ends 2026-05-17.

## Where to pick up — Session 139

### A. **Wave 2 / pilot build kickoff** (PRIMARY candidate)

The 5 work items above are independent and orderable. Suggested sequence smallest-first:

1. **Echo-prompt parity oracle row** — single seed in `wmkf_ai_prompt` named `executor.echo-parity`, identity transformation. Useful as a smoke test for both Vercel `executePrompt()` and (later) PA-side `ExecutePrompt`.
2. **`wmkf_apprequestperson` schema deploy** — net-new entity per `docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md` §5 + `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md`. Use existing `apply-dataverse-schema.js` pattern. Includes alt key `(wmkf_request, wmkf_contact, wmkf_role)`.
3. **Backfill script** — walks `akoya_request`, emits one row per populated PI/co-PI lookup. ~3,000 rows in a single `$batch`. Read existing backfill scripts for batching patterns first.
4. **Field Set B + workflow-chaining fields** — 22 fields in one schema batch. Field shapes locked per `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md`.
5. **`/api/reviewer-finder/contact-history`** — UNION read strategy. Critical: not junction-first / fallback.

### B. Doc-triage cleanup (smaller scope, completes the doc work)

- **Bucket A refresh** — `AUTHENTICATION_SETUP.md` (98d, dual-provider Entra External shipped since), `CREDENTIALS_RUNBOOK.md` (73d), `API_ROUTE_SECURITY_MATRIX.md` (endpoint persistence annotation per Atlas v1 known-gaps).
- **Bucket B "flagged for refresh"** — STRATEGY.md (56d), GRANT_CYCLE_LIFECYCLE.md (28d), REVIEWER_LIFECYCLE_PROPOSAL.md (40d, Phase A shipped), STAGED_REVIEW_PIPELINE.md + STAGED_PIPELINE_IMPLEMENTATION_PLAN.md (36d), DYNAMICS_SCHEMA_ANNOTATION.md.
- **"Other" archive batch** — 6 candidates not in Bucket C: `DYNAMICS_AI_FIELDS_SPEC_v2.md`, `DYNAMICS_AI_FIELDS_SPEC_cn-notes.md`, `DYNAMICS_EXPLORER_DOCUMENT_LISTING_PLAN.md`, `CRM_EMAIL_SEND_PLAN.md`, `ENTRA_ID_INTEGRATION_SUMMARY.md`, `SHAREPOINT_DOCUMENT_ACCESS.md` (verify-then-archive).
- **Step 4** — promote `check-doc-currency.js` selected probes to a CI gate (extending `check:atlas:self-test` pattern).
- **Bucket D guides refresh** — 6 per-app guides last touched 78d ago; spot-check vs current app behavior.

### C. Externally gated (don't pursue without signal)

- Wave 1 retirement — earliest 2026-05-17.
- Connor's PA-side ExecutePrompt build progress — no Vercel-side work depends on it landing first.

## Key files added/modified this session

| File | Status | Purpose |
|---|---|---|
| `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md` | NEW | Audit catalog for delegated schema changes (running list) |
| `docs/DOC_TRIAGE_2026-05-07.md` | NEW | Triage analysis snapshot + Bucket C allowlist + Step 3 execution result |
| `scripts/check-doc-currency.js` | NEW | Drift detector for living plans (4 probes) |
| `docs/CONNOR_QUESTIONS_2026-04-15.md` | EDITED → archived | Q4–Q7 marked resolved; later moved to `docs/archive/` |
| `docs/CONNOR_BRIEF_PHASE0.md` | EDITED → archived | Marked superseded; moved to archive |
| `docs/CONNOR_INTAKE_PORTAL_SYNC.md` | archived | Six decisions resolved 2026-05-06 |
| `docs/CONNOR_DELEGATE_ROLE_REQUEST.md` | archived | Role granted |
| `docs/DYNAMICS_AI_FIELDS_SPEC_v3_cn.md` | EDITED | Field Set B cleared to build; flat publication fields; goals-assessment JSON exception called out |
| `docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md` | EDITED | PD-expertise dependency flipped to done |
| `docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md` | EDITED | §5 junction read strategy revised to UNION; resolution items |
| `docs/PROMPT_STORAGE_DESIGN.md` | EDITED | Stale column names → live production names |
| `docs/archive/` | +36 files | Bucket C sweep |

## Testing

```bash
# Gates remain green
npm run check:api-routes
npm run check:atlas
npm run check:atlas:self-test
npm run test:ci

# New flagging tool — run before editing living plans
node scripts/check-doc-currency.js
```

## How to know Session 139 went well

If §A (Wave 2 build): at least the echo-prompt oracle row and `wmkf_apprequestperson` schema land in sandbox. The full 5-item set is more than one session.

If §B (doc triage cleanup): at least Bucket A refresh + Other archive batch land. The Bucket B refresh is more involved per doc.
