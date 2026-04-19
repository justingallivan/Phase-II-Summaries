# Session 105 Prompt

## Session 104 Summary

Security-focused session. Three parallel Explore-agent audits (Dynamics writeback + prompt injection; new-app attack surface; SharePoint + file handling) produced a delta review against the v3.5 baseline from 2026-03-11. Consolidated everything into `docs/SECURITY_AUDIT_2026-04-18.md` and fixed every finding that did not need product or policy input — 3 Highs, 8 of 9 Mediums, 1 of 2 Lows, 4 of 7 Informationals. Remaining opens are all blocked on external decisions (Connor, product, identity reconciliation).

Also prototyped the PromptResolver `.js` fallback path (production hardening carried over from Session 103) and researched Anthropic Admin API for credit-balance monitoring — memo updated with findings.

### What Was Completed

1. **PromptResolver `.js` fallback** (`06db9a0`)
   - On Dynamics fetch failure, loads a bundled fallback module (60s cache TTL, vs 5min for fresh Dynamics fetches) instead of throwing
   - `PROMPT_RESOLVER_STRICT=true` env var restores the loud-failure behavior for the prompt-development loop
   - Extracted Phase I v2 prompt text to `shared/config/prompts/phase-i-dynamics.js` as single source of truth — both `seed-phase-i-prompt.js` and the resolver fallback import from it, so they can't drift
   - `source: 'fallback'` surfaces through to the existing `wmkf_ai_run` audit row automatically

2. **Security audit doc** (`c1554c1`)
   - New `docs/SECURITY_AUDIT_2026-04-18.md` — full findings with severity, disposition, file:line citations
   - Audit ran in parallel across three Explore agents covering distinct surfaces; their reports were consolidated and severity-normalized

3. **First-pass fixes** (`c1554c1`)
   - **H1** Download proxy now requires `requestId` and validates the folder's `{num}_{GUID32}` suffix matches. `chat.js` URL construction updated in both `list_documents` and `search_documents` tool paths.
   - **H2** Raw Dynamics / Graph error bodies no longer bubble into response fields. Four endpoints: `lookup-grant.js` (generic categories), `summarize.js` + `summarize-v2.js` (replaced `writebackError` with `writebackFailure` category), `summarize-v2.js` prompt-fetch details gated on `NODE_ENV`.
   - **M1** ETag optimistic concurrency: `DynamicsService.getRecord` preserves `@odata.etag` as `_etag`; `updateRecord` takes `{ ifMatch }` option and sets `err.status` on 412. Callers pass the preflight ETag so concurrent edits surface as `conflict` instead of silent overwrite.
   - **M2** `auditLogCreated` surfaced in responses; `tryLogAiRun` returns boolean.
   - **M5** Gemini key moved to `x-goog-api-key` header (was URL query string — logged in proxies/CDN).
   - **M6** Verified `requireAppAccess` runs `validateOrigin` before SSE headers flush; added inline invariant comment.

4. **Second-pass hardening** (`5d86f25`)
   - **M3** `DynamicsService.bypassRestrictions(requestId)` — explicit replacement for the ambiguous `setRestrictions([])` pattern. Migrated 14 call sites (API endpoints + scripts + `PromptResolver`). Real restriction lists (chat handler) still use `setRestrictions()`.
   - **M8** `validatePath` decodes its input before checking for `..`; rejects `%2e%2e` variants and malformed URI encoding.
   - **M9** `listFiles` now takes `totalTimeoutMs` (default 30s). Walk aborts if the deadline passes.
   - **L2** `loadFile()` checks `ref.source` against an explicit `ALLOWED_SOURCES` set at the boundary.
   - **I5** `file-loader.js` rejects buffers >50 MB before parsing; `withTimeout` helper races `pdf-parse` / `mammoth` against a 30s timer.
   - **I7** `SHAREPOINT_SITE_URL` env overrides validated against a hardcoded `ALLOWED_SHAREPOINT_HOSTS` set — prevents SSRF via tampered env var.

5. **I3 closed as accepted-as-is** (`d6ac70f`)
   - User confirmed `wmkf_ai_run.rawOutput` content set doesn't include PII; table sits under the same IT-governed CRM security profile. Revisit trigger documented.

6. **Credit-monitoring research**
   - Investigated Anthropic Admin API via `docs.anthropic.com` — **no direct "balance remaining" endpoint**. Closest is `/v1/organizations/cost_report` with an admin-scoped key (`sk-ant-admin-...`).
   - Memo `project_api_credit_monitoring.md` updated with two implementation paths: (A) Admin API with manual balance anchor, (B) reuse our own `api_usage_log.estimated_cost_cents` — recommended path, no new secrets, covers all four providers.
   - Corrected an earlier mistake: email send already works via `DynamicsService.createAndSendEmail` (Session 77), not Graph API. Memo reflects this.

### Commits

- `06db9a0` — Add .js fallback to PromptResolver
- `c1554c1` — Security audit 2026-04-18: fix H1, H2, M1, M2, M5
- `5d86f25` — Security hardening: fix M3, M8, M9, L2, I5, I7
- `d6ac70f` — Close audit I3 as accepted-as-is

## Open audit items (all blocked on input / upstream)

| # | What | Blocker |
|---|------|---------|
| M4 | Prompt-editor governance for `wmkf_prompt_template` | Waits for Connor's table to ship |
| M7 | Per-user cost caps / low-balance alerting | Implementation plan complete in `project_api_credit_monitoring.md`; awaiting user green-light. Observability-only (tiles + threshold alert + email via Dynamics), skip hard caps. |
| L1 | Expertise Finder roster CRUD superuser check | Product call: intentional or not? |
| I1 | `overwrite=true` flag role gating | Blocked on identity reconciliation (distinguish human vs service-principal callers) |
| I4, I6 | Token-cache multi-tenant keying / Content-Disposition RFC 5987 | Cleanup-level; not actionable absent trigger conditions |

## Potential Next Steps

### 1. M7 implementation — observability-only credit monitoring
Memo `project_api_credit_monitoring.md` has the plan:
- Extend `/api/admin/stats` with a `today` block (SQL filtered on `CURRENT_DATE`)
- Add a "Today's spend" tile to `/admin` showing total, top 3 apps, top 3 users
- New `pages/api/cron/spend-check.js` — hourly, inserts `system_alerts` row when today's total > `DAILY_SPEND_ALERT_CENTS` (default 1000 cents)
- Low-balance alert (**Option B** path): new env vars `ANTHROPIC_BALANCE_ANCHOR_CENTS` + `_DATE`; cron sums `api_usage_log.estimated_cost_cents` since anchor; email via `DynamicsService.createAndSendEmail` when remaining < threshold
- Relabel `user_profile_id IS NULL` as "Backend" in the `byUser` rollup (ready for PA calls)

### 2. Dynamics Explorer document-listing fixes (carryover from earlier sessions)
Wire `sharepoint-buckets.js` into `chat.js` tools more fully (Session 103 todo).

### 3. Phase I Dynamics v2 validation on more requests
Only tested on Rife/Levin. Run against 5–10 more requests mixing active + archived libraries to stress the bucket walker and confirm v2 output quality holds.

### 4. Verify Dynamics Explorer caching is firing
Cache fix landed in Session 103. Query `api_usage_log` for `dynamics-explorer` rows with non-zero `cache_read_tokens` to confirm hits after real chat usage.

### 5. A/B on a PDF with images
Session 103 A/B was text-only. Vision-input cache profile is untested.

### 6. Reusable `DynamicsService.updateIfEmpty(entitySet, guid, fieldName, value, { overwrite })`
Captured during Session 98. Phase I writeback now has the ETag piece (M1 fix); the generic helper would compose naturally on top.

## Key Files Reference

| File | Purpose |
|------|---------|
| `docs/SECURITY_AUDIT_2026-04-18.md` | **New.** Full audit report — findings, disposition, remaining opens |
| `lib/services/dynamics-service.js` | `bypassRestrictions()`, ETag-aware `updateRecord`, `_etag` preserved in `getRecord` |
| `lib/services/graph-service.js` | `ALLOWED_SHAREPOINT_HOSTS`, decoded `validatePath`, `listFiles` deadline |
| `lib/services/prompt-resolver.js` | `.js` fallback on Dynamics failure |
| `lib/utils/file-loader.js` | 50 MB buffer cap, 30s parser timeout, `ALLOWED_SOURCES` |
| `pages/api/dynamics-explorer/download-document.js` | Requires `requestId`, validates folder GUID suffix |
| `shared/config/prompts/phase-i-dynamics.js` | **Single source of truth** for Phase I v2 prompt (shared with seeder) |
| `project_api_credit_monitoring.md` (memory) | M7 implementation plan + Admin API research |

## Testing

No new automated tests. Manual verification:

```bash
# Syntax check everything changed this session
node --check lib/services/dynamics-service.js
node --check lib/services/graph-service.js
node --check lib/utils/file-loader.js

# Seed script still produces expected char counts (sanity check on prompt extraction)
node scripts/seed-phase-i-prompt.js --dry
# Expect: System 6,634 chars; User 258 chars
```

## Session hand-off notes

- Working tree clean after four commits. Four ahead of origin until push.
- M7 has a complete implementation plan in memory — low-effort next session if user green-lights it.
- Audit doc is self-contained; read it before touching any finding-related code.
- PromptResolver fallback is now production-safe. `PROMPT_RESOLVER_STRICT=true` stays useful during prompt development to catch silent fallback masking bugs.
- Today's date: 2026-04-18.
