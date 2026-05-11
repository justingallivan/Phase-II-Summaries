# Session 146 Prompt: open

## Session 145 summary

Four commits on main, all pushed to origin. Two architectural deliveries plus an admin UX overhaul.

### What was completed

1. **Tier-keyed Claude model picker (`bc8a389`, `edcd6db`)**
   - `APP_MODELS` now stores tier keys (`opus`/`sonnet`/`haiku`) instead of dated ids. `lib/services/model-resolver.js` resolves to the latest concrete id by querying `/v1/models` (24h TTL) with a hand-maintained `TIER_FALLBACK_IDS` cold-start safety net.
   - Concrete ids still pass through as an escape hatch (env vars, system_settings, prompt rows). Audit rows always log the resolved concrete id Anthropic actually ran.
   - Admin picker rebuilt with grouped optgroups (Default / Tiers / Pin specific version), short labels, friendly app names, manual Refresh button.
   - `getModelDisplayName` handles tier strings.

2. **Policy editor — `/api/admin/policies` + PoliciesSection (`d0abcc6`, `61a46f9`)**
   - Four rounds of Codex review before any code landed (agents `a5af57b…` → `aff1757b…`). Each round surfaced findings; v5 plan absorbed all of them. See DEVELOPMENT_LOG.md S145 entry.
   - Server: pre-flight validation (allowlist FIRST so OData filter never sees unsanitized slotCode), pending audit row before any mutation (hard-abort on audit-write failure), parent-ETag concurrency, alt-key `wmkf_policyversion_parent_label_unique` enforced at DB level, idempotent branch dispatch (already_published / label_conflict / resume / fresh-publish), best-effort prior-version retire, structured outcome response with per-field diff flags.
   - Storage: dedicated Postgres `policy_publish_audit` (V28) — NOT `wmkf_ai_run`. Codex review concluded the AI-run table is the wrong long-term home; purpose-named now, generalize when a second AI-config admin surface appears.
   - Markdown pipeline: `shared/utils/policy-markdown.js` uses `marked` + `dompurify` with strict allowlist (no raw HTML, http/https/mailto schemes only, no event handlers, no non-href attrs on `<a>`). Server validator rejects with `disallowed_content` on any drop; renderer silently strips. 17 unit cases.
   - UI: `shared/components/admin/PoliciesSection.js` with slot card, active-version preview (markdown-rendered), Prefill-from-active button, live preview pane, version history with residue badges, structured outcome banners (completed / already_published / label_conflict / concurrency_conflict / invalid_body / partial).

3. **Admin UX overhaul (`d0abcc6`)**
   - New `CollapsibleCard` wrapper. Model Configuration, Policies, Role Management, App Access Management, Dynamics Identity Linkage collapse by default with lazy mount on first open.
   - Service Health detail grid + Health Check History recent-checks table now collapse; summary boxes stay visible.
   - API Usage: 1-day period option added (replaces standalone Today's Spend card), three breakdown tables collapse under one Show Breakdowns toggle.
   - Soft-archive button in App Access Management (`DELETE /api/admin/users` → sets `is_active=false`). Refuses self-archive; row preserved for audit FK integrity.
   - Health-check, secret-check, log-analysis crons now record runs via `MaintenanceService.startRun/completeRun` — the corresponding tiles will populate once next prod fire lands.

### Architectural decision (memorable)

Discussed and aligned with Justin: **AI-config admin** (model picker, policy editor, eventually prompts) is intentionally NOT the same surface as **Dataverse data admin** (open-ended search + CRUD across hundreds of entities, AkoyaGo retirement scope). AI-config is narrow, task-specific forms with strict business rules; data admin is a months-long project deferred to a separate scope. Codex's round-1 critique reinforced this — declined to build a generic `VersionedContentEditor` abstraction until `wmkf_ai_prompt` proves the second use case. See `docs/atlas/dataverse-wmkf-policy-and-policy-version.md` for the policy-side pattern.

### Browser-smoke fixes during the session

Two bugs caught during in-browser failure-mode testing on the live admin page:
- `validatePolicyMarkdown` silently accepted `<script>` at the very start of the body (marked stripped it before DOMPurify could see it). Added a raw-HTML pre-scan that rejects any `<tag>` in the input.
- Post-publish reload was unmounting every `SlotPanel` (loading branch blanked the whole section), destroying outcome state before the banner could render. Gated the loading placeholder on `!state` so refetches preserve prior render.
- Added per-field `fieldsMatch` flags to the `label_conflict` response so the diff block shows ✓/✗ per title/body/effectiveDate.

### Memory updates

None this session. Strategic conversation about AI-config vs data-admin scope was recorded in DEVELOPMENT_LOG.md S145 entry instead.

### Commits

- `bc8a389` — Tier-keyed model picker (Opus / Sonnet / Haiku) auto-tracks latest
- `edcd6db` — Model picker: 24h TTL + manual Refresh button
- `d0abcc6` — Policy editor + admin UX overhaul
- `61a46f9` — Policy editor: browser-smoke fixes

## Production state

- All five CI gates green: `check:atlas` (29 PG / 27 DV), `check:atlas:self-test` (11/11), `check:api-routes` (80 routes), `check:doc-currency`, `check:doc-currency:self-test`. Build green. Policy markdown unit tests 17/17.
- Dataverse alt key `wmkf_policyversion_parent_label_unique` deployed live (2026-05-10). Postgres `policy_publish_audit` table live.
- Wave 1 stability clock: 7 days from 2026-05-10 (originally 2026-05-17, now likely past). Re-verify before flipping flags.
- `reviewer-coi` slot currently has 3 retired Lorem-ipsum versions in history plus an active `2026-05-10-restore` row holding the original `[PLACEHOLDER]` body. Cleanup of the lorem-ipsum retired rows is optional cosmetic — they're unreferenced and can be hard-deleted via Dynamics admin UI when convenient. `reviewer-ai-use` also has a `2026-05-10-restore` row active with the original AI-use body lifted from the review form footer.
- Stage 2a slice 1 production engagement against a real reviewer cycle is still outstanding. The COI body remains placeholder pending staff wording feedback.

## Where to pick up — Session 146 (open)

No headline locked. Plausible threads, roughly ordered by readiness:

### A. Real Stage 2a engagement (highest unlock value, externally gated)

Pre-production blockers from S143/S144/S145 still standing:

1. **End-to-end production engagement** — invite a real reviewer through Review Manager and exercise the Stage 2a flow in production. The smoke scripts (`scripts/find-stage2a-candidates.js`, `inspect-stage2a-state.js`, `reset-stage2a-state.js`) cover offline test cases; this is the first real-cycle run.
2. **COI policy body wording** — editor is live (`/admin` Policies section). When the staff feedback meeting yields wording, publish a new `wmkf_policyversion` via the form. Atlas page `docs/atlas/dataverse-wmkf-policy-and-policy-version.md` documents the immutability rules.
3. **Dataverse security role** — restrict delete privilege on `wmkf_policy` and `wmkf_policyversion` to a small admin role. Referential `Restrict` cascade catches the worst case at the DB level; role config is the second layer.

### B. Wave 1 retirement (externally gated)

Stability clock expired (2026-05-17 was 7 days from S144 close on 2026-05-10). Flip `WAVE1_BACKEND_*` flags to `dataverse` per `docs/WAVE1_VERCEL_FLAG_ROLLOUT.md`, retire Postgres `system_settings` / `user_app_access` / `user_preferences`. Remove temp role elevations per `docs/WAVE1_REVERT_TEMP_ELEVATIONS.md`. Verify no regressions before deleting tables.

### C. Proposal Context Extraction field-set extension (S, design-only)

Extend `docs/DYNAMICS_AI_FIELDS_SPEC_v3_cn.md` with the 21 proposed AI fields. Plan at `docs/PROPOSAL_CONTEXT_EXTRACTION_PLAN.md`. ~1-2 hrs.

### D. Retrospective Analysis Gap 1 — historical-request picker (M)

Build the cycle/program/status filter UI with SharePoint folder auto-resolve. Plan at `docs/RETROSPECTIVE_ANALYSIS_PLAN.md`. ~4-6 hrs.

### E. Connor's PA-side ExecutePrompt (externally gated)

When it lands, run the parity oracle from both sides.

### F. Cleanup follow-ups from S145

- Hard-delete the three Lorem-ipsum `wmkf_policyversion` rows on `reviewer-coi` via Dynamics maker portal (purely cosmetic).
- If/when `wmkf_ai_prompt` editor becomes useful, extract the `VersionedContentEditor` abstraction Codex round-2 said to defer — same pattern as PoliciesSection but with `activationMode: 'currentFlag'`.

## Key files modified or added (S145)

| File | Status | Purpose |
|---|---|---|
| `lib/services/model-resolver.js` | NEW | Tier → concrete id resolver; `/v1/models` cache with 24h TTL + static fallback |
| `shared/config/baseConfig.js` | MODIFIED | `APP_MODELS` tier-keyed; injected resolver |
| `lib/services/model-override-loader.js` | MODIFIED | Warms model cache alongside override cache |
| `lib/services/execute-prompt.js` | MODIFIED | `callClaude` resolves prompt-row `wmkf_ai_model` before sending; audit rows log resolved id |
| `pages/api/admin/models.js` | MODIFIED | Returns tier catalog; validates tier-or-claude-* on PUT; force-refresh query param |
| `shared/utils/modelNames.js` | MODIFIED | Tier display names |
| `pages/api/admin/policies.js` | NEW | GET (list slots) + POST (publish new version) |
| `pages/api/admin/users.js` | NEW | DELETE soft-archive (sets is_active=false) |
| `shared/components/admin/PoliciesSection.js` | NEW | Policy editor UI |
| `shared/utils/policy-markdown.js` | NEW | marked + DOMPurify pipeline (renderer + validator) |
| `tests/unit/policy-markdown.test.js` | NEW | 17 cases for markdown pipeline |
| `lib/dataverse/schema/wave3/05_wmkf_policyversion_altkey.json` | NEW | Alt key manifest (deployed prod 2026-05-10) |
| `lib/db/migrations/006_policy_publish_audit.sql` | NEW | Audit table migration (V28 in setup-database.js) |
| `scripts/probe-policyversion-statecodes.mjs` | NEW | One-time metadata probe for statecode integers |
| `pages/admin.js` | MODIFIED | `CollapsibleCard` wrapper, section refactors, Remove button, 1-day usage period |
| `pages/api/admin/stats.js` | MODIFIED | Accepts `?period=1d` |
| `pages/api/cron/{health-check,secret-check,log-analysis}.js` | MODIFIED | Record runs in `maintenance_runs` |
| `docs/atlas/dataverse-wmkf-policy-and-policy-version.md` | MODIFIED | Write-paths section + statecode invariant + alt-key entry |
| `docs/API_ROUTE_SECURITY_MATRIX.md` | MODIFIED | `/api/admin/policies` + `/api/admin/users` entries |
| `CLAUDE.md` | MODIFIED | `policy_publish_audit` row in DB schema table |
| `DEVELOPMENT_LOG.md` | MODIFIED | S145 milestone entry |

## Testing

```bash
# CI gates — all should be green
npm run check:atlas
npm run check:atlas:self-test
npm run check:api-routes
npm run check:doc-currency
npm run check:doc-currency:self-test

# Build
npm run build

# Markdown pipeline tests (jsdom env required, set by header in test file)
npx jest tests/unit/policy-markdown.test.js

# Executor unit tests (still pass after model-resolver wiring)
npx jest tests/unit/execute-prompt-multi-output.test.js

# Manual: /admin Policies section → publish a new version on a slot.
# Failure-mode tests covered:
#   invalid_body  — paste raw <script> or javascript: link
#   label_conflict — reuse existing label with different content (now shows
#                    per-field ✓/✗ marks identifying the differing field)
#   already_published — Prefill from active version → Publish
```

## Carryover hygiene

No destructive carryover items in S146. The Lorem-ipsum cleanup under F is additive (hard-delete unreferenced rows via Dynamics maker portal); only acts on rows that are guaranteed unreferenced because they were created during testing.
