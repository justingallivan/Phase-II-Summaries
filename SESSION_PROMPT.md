# Session 108 Prompt

## Session 107 Summary

Shipped Wave 1 of the Postgres → Dataverse migration: built the reusable schema-apply infrastructure, created the solution + 3 new tables + 2 `systemuser` extensions in the sandbox, and verified end-to-end behavior with a data-level smoke test. Drafted the security-role handoff doc for Connor. Discovered his new `wmkf_ai_prompt` table in prod and flagged access + design questions for him to respond to in the morning.

### What Was Completed

1. **Wave 1 Dataverse schema applied to sandbox** (`f05f3d0`)
   - Reusable infrastructure: `lib/dataverse/client.js` (token + fetch with solution-header binding), `lib/dataverse/schema-apply.js` (idempotent ensure functions for publisher/solution/entity/attribute/relationship/alt-key with metadata-cache-lag retries), `scripts/apply-dataverse-schema.js` (CLI, sandbox by default, `--execute` + `--target=prod` explicit flags).
   - Declarative schemas as JSON under `lib/dataverse/schema/wave1/` — `systemuser-extensions.json`, `wmkf_app_user_preference.json`, `wmkf_app_user_app_access.json`, `wmkf_app_system_setting.json`.
   - 13 artifacts created under solution `wmkfResearchReviewAppSuite` (publisher `WMKF_Publisher`, prefix `wmkf`).
   - Rerun produces all `· exists` — fully idempotent.

2. **Bugs caught during first-time execute** (all fixed in the committed code)
   - **Publisher ambiguity** — three publishers share prefix `wmkf` (`Cr0a061` generic default, `WMKF_Publisher` akoyaGO, `DefaultPublisherwmkf` default). Added `publisherUniqueName` in `solution.json` for disambiguation.
   - **Client header ordering** — `MSCRM.SolutionUniqueName` auto-add clobbered `extraHeaders` suppression (self-reference when creating the solution itself). Fixed spread order in `client.js`; empty-string in extraHeaders now suppresses the auto-added header.
   - **Attribute existence check 404** — Dataverse's direct `Attributes(LogicalName='x')` path returns 404 without a type-cast for non-String subtypes (Memo, Boolean). Switched to filter-based query in `attributeExists()`.
   - **`ownerid` in composite alt-key rejected** — `ownerid` is a polymorphic `PrincipalAttribute`, not a regular Lookup; Dataverse forbids it from alt-keys. Dropped the `(wmkf_preferencekey, ownerid)` key; per-user preference-key uniqueness enforced app-side instead.

3. **Wave 1 data smoke test** (`10c1982`)
   - `scripts/smoke-test-wave1.js` — INSERT into each of the 3 new tables + alt-key duplicate attempts + lookup binding + cleanup.
   - All 6 checks pass: inserts succeed, alt-keys reject duplicates (HTTP 412), custom N:1 lookups resolve, `ownerid` auto-populates on User-owned table.
   - **Key finding:** custom-lookup `@odata.bind` uses the lookup's **SchemaName (PascalCase)**, not the logical name. The navigation-property casing follows `ReferencingEntityNavigationPropertyName` on the relationship metadata. Applies to all future lookups.

4. **Security role handoff doc for Connor** (`a828d22`)
   - `docs/SECURITY_ROLE_WAVE1.md` — explains the one table that needs User-level Read (`wmkf_AppUserPreference`, holds encrypted secrets), privilege matrix for all three Wave 1 tables, maker-portal + Web API paths, two-user isolation test plan, callouts on potential BU / role-inheritance / role-name differences.
   - Emailed to Connor — awaiting morning response.

5. **Connor's `wmkf_ai_prompt` table discovered in prod** (`e67262a`)
   - Connor finished the prompt-storage table while we were on Wave 1. Name: `wmkf_ai_prompt` (not `wmkf_prompt_template` as we'd originally scoped). Entity set: `wmkf_ai_prompts`.
   - Schema is richer than our spec: has lifecycle fields (`wmkf_ai_promptstatus` picklist, `wmkf_ai_iscurrent`, `wmkf_promptversion`, `wmkf_ai_rollbackfrom`, `wmkf_ai_publisheddatetime`, `wmkf_ai_preflightpasseddatetime`, `wmkf_ai_lasttestdatetime`), content (`wmkf_ai_promptbody`, `wmkf_ai_promptvariables`, `wmkf_ai_promptoutputschema`), Claude config (`wmkf_ai_model`, `wmkf_ai_maxtokens`, `wmkf_ai_temperature`), and meta (`wmkf_ai_promptname`, `wmkf_ai_notes`).
   - **App user has no prvRead on the table** — queries return 403. Flagged to Connor.
   - **Two schema questions for Connor** in `docs/CONNOR_PROMPT_TABLE_NOTES.md`: (1) single `wmkf_ai_promptbody` collapses the system/user-prompt split we recommended for caching — asked whether he'd add a second Memo column, use a delimiter, or keep it merged; (2) no visible app-key column — asked whether `wmkf_ai_promptname` is the routing key by convention (e.g., `phase-i-summaries.main`) or whether he'd rather add a structured column.

### Commits

- `f05f3d0` — Wave 1 Dataverse schema: solution + 3 tables + systemuser extensions
- `10c1982` — Wave 1 data smoke test — verifies end-to-end table behavior
- `a828d22` — Handoff doc for Connor: Wave 1 security role config
- `e67262a` — Notes for Connor on wmkf_ai_prompt — access + two schema questions

## Pending Connor Responses

1. **Wave 1 security-role config** (from `docs/SECURITY_ROLE_WAVE1.md`) — add role privileges to the 3 Wave 1 tables in sandbox, User-level Read on `wmkf_AppUserPreference` specifically, then run the two-user isolation test.
2. **`wmkf_ai_prompt` access + schema** (from `docs/CONNOR_PROMPT_TABLE_NOTES.md`) — grant prvRead/prvWrite to our app user, decide on system/user prompt split, decide on app routing column.
3. **From Session 106** — review of `docs/POSTGRES_TO_DATAVERSE_MIGRATION.md` (already in progress — per Justin, "on the same page"), review of `docs/RETROSPECTIVE_ANALYSIS_PLAN.md`, original Q3/Q5/Q6/Q7 from `docs/CONNOR_QUESTIONS_2026-04-15.md`.

## Potential Next Steps

### 1. Once Connor responds on prompt-table access + schema
Port `PromptResolver` (currently hits a scratch `wmkf_ai_run` row) to hit `wmkf_ai_prompt` using the query pattern `wmkf_ai_promptname eq 'X' and wmkf_ai_iscurrent eq true`. If he splits the body column, wire both `system_prompt` + `user_prompt` with `cache_control` on the system side. If he doesn't, use a marker-based split or ship in two columns client-side.

### 2. Once Connor responds on Wave 1 security roles
Run Postgres → Dataverse data sync for Wave 1 tables. Small row counts; seconds. Then dual-read validation window.

### 3. Wave 2 schema (Reviewer Finder core)
Much richer — choice columns, lookups to `akoya_request`, junction table for publications/authors, alt-keys on ORCID/DOI. Schema-apply engine will need a few small additions: Choice (Picklist) attribute type, OptionSet definitions, and a few missing RelationshipMetadata field defaults. The four Wave 1 JSON schemas plus the additions give a clear template.

### 4. Summarize-v3 (native PDF input + caching)
Still queued. Recommended path forward for backend Phase I. Takes ~1-2 hours to ship as a `/phase-i-dynamics` toggle.

### 5. Files API prototype in app code
End-to-end verified in Session 106 via `scripts/test-files-api.js`. Not yet integrated. Useful for PDFs > 24 MB or workflows that span > 5 min between calls.

### 6. Add Wave 2 app-user and staff-role config to `scripts/apply-dataverse-schema.js`
Once Connor's approach settles in for Wave 1 roles, a companion `scripts/apply-security-role.js` (same declarative JSON pattern) would let us check staff roles into the repo and apply them idempotently. Optional; maker portal works fine for now.

## Key Files Reference

| File | Purpose |
|------|---------|
| **`lib/dataverse/client.js`** | **New.** OAuth + fetch helper with solution-header binding and dry-run support |
| **`lib/dataverse/schema-apply.js`** | **New.** Idempotent ensure functions for publisher/solution/entity/attribute/relationship/alt-key |
| **`lib/dataverse/schema/solution.json`** | **New.** Solution manifest (uniqueName + publisher disambiguation) |
| **`lib/dataverse/schema/wave1/*.json`** | **New.** Declarative schemas for the 4 Wave 1 artifact groups |
| **`scripts/apply-dataverse-schema.js`** | **New.** CLI: `--target=sandbox\|prod`, `--wave=N`, `--execute` (dry-run by default) |
| **`scripts/smoke-test-wave1.js`** | **New.** Data-level smoke test with cleanup; safe to rerun |
| **`docs/SECURITY_ROLE_WAVE1.md`** | **New.** Connor handoff: privilege matrix, portal walkthrough, test plan |
| **`docs/CONNOR_PROMPT_TABLE_NOTES.md`** | **New.** Connor handoff: access ask + two schema discussion items |

## Testing

```bash
# Verify schema is still live in sandbox (should show all · exists)
node scripts/apply-dataverse-schema.js

# Rerun the data smoke test end-to-end (INSERT / alt-key / lookup / cleanup)
node scripts/smoke-test-wave1.js

# If Connor grants app-user access on wmkf_ai_prompt, verify:
node -e "require('./lib/dataverse/client').loadEnvLocal(); (async () => {
  const { getAccessToken, createClient } = require('./lib/dataverse/client');
  const url = process.env.DYNAMICS_URL;
  const token = await getAccessToken(url);
  const c = createClient({ resourceUrl: url, token });
  const r = await c.get('/wmkf_ai_prompts?\$top=5');
  console.log(r.status, r.body?.value?.length, 'rows');
})();"
```

## Session hand-off notes

- Tree clean; 4 commits ahead of origin until pushed (caught by session-end push).
- Wave 1 tables are **empty** in sandbox — smoke-test rows are cleaned up automatically; Postgres→Dataverse sync is blocked on Connor's role config.
- Custom-lookup `@odata.bind` casing: use **SchemaName** (PascalCase like `wmkf_UpdatedBy`), not logical name. Embedded as a comment in `scripts/smoke-test-wave1.js` for future reference.
- The schema-apply engine currently supports: String, Memo, Boolean, Integer, DateTime attribute types; N:1 relationships; alt-keys (single + composite, no polymorphic attrs). Wave 2 will need Picklist (Choice) + OptionSet support — small addition.
- Connor's `wmkf_ai_prompt` schema will likely need a second Memo column (for system-prompt split) — not blocking, but factor it into the morning conversation.
- Today's date: 2026-04-22 (session ended late evening; Connor replies expected in morning 2026-04-23).
