# Session 140 Prompt: Post-Wave-2 follow-ups + doc-triage cleanup

## Heads up — read before doing anything

S139 shipped the entire Wave 2 build set in one go (5/5 items). That clears the build backlog from S138's hand-off. The remaining work falls into three buckets, and **none of them are urgent** — pick whatever matches the available bandwidth and energy.

Two cross-cutting findings from S139 that should shape any future schema work:

1. **Dataverse `EntityCustomization` 429 throttling between metadata writes is the rule.** `apply-dataverse-schema.js` should be invoked through a 30s-backoff retry loop for any multi-attribute deploy. Idempotent reruns are safe.
2. **`@odata.bind` keys are case-sensitive** (PascalCase nav-property name from the schema spec, NOT lowercase logical name). Plain field read/writes use lowercase; only `@odata.bind` cares. This bit us once during the junction backfill smoke.

Useful as standing memory for the next person touching either area.

## Session 139 summary

### What was completed

All 5 Wave 2 build items landed and verified live (commits below):

1. **`executor.echo-parity` prompt row** seeded; both Vercel `executePrompt()` runs produce byte-identical raw output and the second hits cache. Sonnet-4 with cache-load-bearing filler in the system block (haiku's 2048-token cache minimum couldn't be cleared with a tiny smoke prompt).
2. **`wmkf_apprequestperson` junction entity** deployed (table + 2 attrs + 2 lookups + alt key). Spec at `lib/dataverse/schema/wave2/wmkf_app_request_person.json`.
3. **Junction backfill** — 5,561 rows (4,488 PI + 1,073 Co-PI) inserted from legacy slot fields in 8 minutes. Idempotent on rerun. Script at `scripts/backfill-request-person-junction.js`.
4. **28 fields on `akoya_request`** — 6 workflow-chaining + 22 Field Set B (grant report extraction). Spec at `lib/dataverse/schema/wave2-existing/akoya_request-ai-extensions.json`.
5. **`/api/reviewer-finder/contact-history`** UNION endpoint — reads junction OR projectleader-field with per-row source provenance. Live-tested with PI dual-source, co-PI single-source, and empty-history cases.

### Commits

- `2eda700` — Seed executor.echo-parity prompt + harness for two-side parity oracle
- `c8cbfe1` — Deploy wmkf_apprequestperson junction entity to prod Dataverse
- `8b9b287` — Backfill 5,561 wmkf_apprequestperson rows from akoya_request slot fields
- `b536121` — Deploy 28 wmkf_ai_* fields on akoya_request (workflow-chaining + Field Set B)
- `b23586c` — Add /api/reviewer-finder/contact-history with UNION read strategy

### Memory updates this session

None written. Domain memories that informed the session:
- `project_reviewer_postgres_to_dataverse_migration.md` (junction read strategy)
- `project_dataverse_creator_privileges.md` (delegation scope)
- `project_dynamics_ai_writeback.md` (Field Set B v3 status)
- `project_prompt_storage_strategy.md` (executor naming convention)

The cross-cutting findings above are good candidates for new feedback memories if/when they bite a future session.

## Production state

- **Connor's plate (still his):** PA-side `ExecutePrompt` child flow + PA flows on `akoya_request` create/update for junction sync. Both unblocked since 2026-05-07. Status update in next sync.
- **Justin/Claude's plate:** post-Wave-2. The 5-item build set is closed.
- **Atlas + CI gate live and self-tested.** `npm run check:atlas` + `:self-test` + `:api-routes` (now 77 routes) all green.
- **Wave 1 in steady state.** Stability clock ends 2026-05-17.
- **5,561 junction rows in production.** Connor's ongoing-sync PA flows must (a) preserve them on update and (b) dual-write `_wmkf_projectleader_value` + `pi` junction row for new requests. Until those flows ship, the contact-history endpoint's per-row `sources` array shows transition-state honestly.

## Where to pick up — Session 140

### A. **Doc-triage cleanup** (PRIMARY candidate, picks up §B from S139)

S138 ran Step 1+2+3 of doc-triage (categorization + 36-doc archive). The remaining steps are all small-to-medium and complete the doc-currency story.

- **Bucket A refresh** (3 docs): `AUTHENTICATION_SETUP.md` (98d, dual-provider Entra External shipped since), `CREDENTIALS_RUNBOOK.md` (73d), `API_ROUTE_SECURITY_MATRIX.md` (endpoint-persistence annotation per Atlas v1 known-gaps).
- **"Other" archive batch** (6 candidates not in original Bucket C): `DYNAMICS_AI_FIELDS_SPEC_v2.md`, `DYNAMICS_AI_FIELDS_SPEC_cn-notes.md`, `DYNAMICS_EXPLORER_DOCUMENT_LISTING_PLAN.md`, `CRM_EMAIL_SEND_PLAN.md`, `ENTRA_ID_INTEGRATION_SUMMARY.md`, `SHAREPOINT_DOCUMENT_ACCESS.md` (verify-then-archive).
- **Bucket B "flagged for refresh"** (more involved per doc): `STRATEGY.md` (56d), `GRANT_CYCLE_LIFECYCLE.md` (28d), `REVIEWER_LIFECYCLE_PROPOSAL.md` (40d, Phase A shipped since), `STAGED_REVIEW_PIPELINE.md` + `STAGED_PIPELINE_IMPLEMENTATION_PLAN.md` (36d), `DYNAMICS_SCHEMA_ANNOTATION.md`.
- **Bucket D guides refresh** (6 per-app guides last touched 78d): spot-check vs current app behavior.
- **Promote `check-doc-currency.js` to CI** — extend the `check:atlas:self-test` pattern to bind drift probes into the CI gate.

### B. **Codex review of S139 commits** (smaller scope, defensive)

Five new commits in one session is a lot of new code/schema. Worth running `gpt-5.3-codex` against the diff to surface anything the in-loop testing missed. Per `project_codex_recurring_review.md`, treat findings as input, not a to-do list.

Specifically worth checking:
- The contact-history endpoint's two-stage request-meta fetch (top=100 + remaining-pass) handles edge cases correctly.
- The backfill script's `_wmkf_request_value` dedupe handles the cross-request same-contact pattern.
- The Field Set B field shapes (Memo lengths, choice values) match what downstream prompts will need.

### C. **REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md status sweep**

The plan has a lot of "W2 owner: Justin" rows that are now done. Worth sweeping to mark completion and identify what's actually next on the critical path. Cycle gating: this plan is aligned with Connor-collaboration cadence, so don't strand it ahead of the next sync.

### D. Externally gated (don't pursue without signal)

- **Wave 1 retirement** — earliest 2026-05-17.
- **Connor's PA-side `ExecutePrompt` build** — when it lands, run the parity oracle from both sides and verify byte-identical `wmkf_ai_rawoutput`. The Vercel side is ready (`scripts/test-echo-parity.js`).
- **Connor's `akoya_request` create/update PA flows** — when they ship, the contact-history endpoint's per-row `sources` array stops showing single-source `[junction]` for newly-PI-touched data; that's the signal to consider the migration "in steady state."

## Key files added/modified this session

| File | Status | Purpose |
|---|---|---|
| `scripts/seed-echo-parity-prompt.js` | NEW | Idempotent seed for the executor parity oracle row |
| `scripts/test-echo-parity.js` | NEW | Two-run parity smoke (rawOutput identical + cacheHit on run 2) |
| `lib/dataverse/schema/wave2/wmkf_app_request_person.json` | NEW | Junction entity spec |
| `scripts/backfill-request-person-junction.js` | NEW | One-time backfill from legacy slot fields; idempotent on rerun |
| `lib/dataverse/schema/wave2-existing/akoya_request-ai-extensions.json` | NEW | 28-field spec (6 workflow-chaining + 22 Field Set B) |
| `pages/api/reviewer-finder/contact-history.js` | NEW | UNION-read endpoint for PI/co-PI history |
| `scripts/smoke-contact-history.js` | NEW | Handler-level smoke (kept for regression) |
| `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md` | EDITED | Audit catalog updated for junction + Field Set B deploys |
| `docs/API_ROUTE_SECURITY_MATRIX.md` | EDITED | Added `/api/reviewer-finder/contact-history` row (77 routes) |

## Testing

```bash
# Gates remain green
npm run check:api-routes
npm run check:atlas
npm run check:atlas:self-test
npm run test:ci

# Re-verify the parity oracle whenever the Executor or model config changes
node scripts/test-echo-parity.js

# Schema rerun is idempotent — useful for sanity checks
node scripts/apply-dataverse-schema.js --target=prod --wave=2

# Endpoint smoke (requires dev server on :3000)
curl -s "http://localhost:3000/api/reviewer-finder/contact-history?contactId=<guid>" | python3 -m json.tool
```

## How to know Session 140 went well

- **If §A (doc-triage cleanup):** at least the Bucket A refresh + "Other" archive batch land. The Bucket B refreshes are bigger and may take a full session each.
- **If §B (Codex review):** findings triaged into either fix-now / fix-later / not-a-bug, with the fix-now bucket actually patched. The S138 pattern is the model.
- **If §C (plan sweep):** completion status accurately reflects S139 deliveries; next critical-path item is identified for the post-2026-05-17 window.
