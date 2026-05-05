# Session 131 Prompt: Open

## Heads up

Session 130 was a security-hardening tranche driven by an ongoing Codex review thread. Seven commits, all pushed. P1 column of the AI security matrix is now closed end-to-end and an operating plan is in place for ongoing cadence. Tree is clean.

No carryover red flags. Codex's parallel matrix-CI work from Session 129 was integrated this session (`ad8f4f3`) — that thread is fully closed.

## Session 130 summary

### What was completed

1. **AI payload boundary across high-volume Anthropic call sites** (`6af5614`). Established `lib/utils/ai-payload-boundary.js` as the canonical helper. Every route that sends extracted proposal/report text to Claude now passes through `buildBoundedTextPayload` with an explicit source string, dataClass, and route-appropriate cap. Routes covered: reviewer-finder analyze, /api/process + /api/process-legacy, batch Phase I + Phase I writeup, /api/qa, /api/grant-reporting/extract (3 sites), /api/analyze-funding-gap, /api/virtual-review-panel (single boundary propagating through all proposal-bearing stages), /api/phase-i-dynamics/summarize. Six prompt builders had dead `text.substring(0, textLimit)` cleaned up — the route boundary is now the single source of truth. Tests pin every bounded source string.

2. **API route security matrix + CI gate** (`ad8f4f3`). Codex's parallel work from Session 129 integrated this session. `docs/API_ROUTE_SECURITY_MATRIX.md` catalogues every API route's auth/access pattern; `scripts/check-api-route-security-matrix.js` cross-references and exits non-zero on missing/stale entries. Wired into `npm run check:api-routes` and CI. 76 routes covered.

3. **Override redaction in `wmkf_ai_promptoverride`** (`b057f7e`). Closed Codex P2 finding: `writeRunRow()` was persisting raw `JSON.stringify(overrideVariables)`, so summarize-v2 was writing raw `fileLoad.text` into Dataverse before the Executor boundary applied. Added `redactBoundedOverrides()` — variables with `dataClass + maxChars` declarations now persist as `[redacted: dataClass=..., originalChars=..., maxChars=...]`. Non-bounded scalars stay verbatim.

4. **Raw-output retention modes for `wmkf_ai_run`** (`39da64e`). New `lib/utils/ai-run-retention.js` exposes `applyRawOutputRetention(rawOutput, retention)` with three modes: `'full'` (default, backwards compat), `'hash'` (`{retention, originalChars, sha256}`), `'none'` (`{retention, originalChars}`). Wired into Executor (`outputSchema.rawOutputRetention`) and `DynamicsService.logAiRun()`. Idempotence guard prevents re-hashing already-retained envelopes. Adopters: `phase-i.summary` prompt row (live tenant activated) and v1 `/api/phase-i-dynamics/summarize` for parity. Grant Reporting deliberately stays `'full'` — no save endpoint, audit row is the only durable copy. Inline comment documents this for future maintainers.

5. **Dynamics Explorer model-context serializer** (`06e682b`). Codex AI_DATA_FLOW_MATRIX P1 #2, originally deferred earlier in the session but then implemented when scope was reframed from "sensitive field redaction" to "model-context minimization." `lib/utils/dynamics-explorer-serializer.js` recursively strips OData metadata, redacts sensitive/loopback field patterns (`description`, `notetext`, `body`, `documentbody`, `wmkf_ai_rawoutput`, `wmkf_ai_promptoverride`, plus credential-shaped names), caps long scalars at 1500 chars, and adds `_aiContextBoundary` metadata when redaction fires. Passthrough for `describe_table`, `count_records`, `list_documents`, `search_documents`. Search highlights routed through field-level serializer so hits on `notetext`/`description` become placeholders. Annotation/email label formatters routed through the same path for consistency. `wmkf_ai_summary` deliberately NOT in denylist — relies on long-string cap so legitimate summary queries still work.

6. **Security operating plan** (`1ffa15d`). New `docs/SECURITY_OPERATING_PLAN.md` captures the operating cadence we want now that the hardening tranche is complete. Weekly (Justin solo, 30-45 min, anchored to start of coding sessions), monthly (rides Connor syncs), quarterly (Justin + IT contact, half day, calendar-or-event-triggered). Each current watch item carries an explicit escalation threshold so the watch list cannot grow indefinitely. Initial Alignment Agenda included for the first planning conversation.

### Live tenant activation

`phase-i.summary` prompt row at `d4201d8e-3840-f111-88b5-000d3a3065b8` now carries `rawOutputRetention: 'hash'`. Verified zero drift via `scripts/diff-phase-i-summary-prompt.js` after `--execute`. The row also got `dataClass: 'proposal_text', maxChars: 100000` on the `proposal_text` variable earlier in the session.

### Commits (Session 130)

- `6af5614` — Establish AI payload-boundary helper and apply across high-volume Anthropic call sites
- `ad8f4f3` — Add API route security matrix and CI gate
- `d5351ac` — Memory: Session 130 — defer Dynamics Explorer tool-result serializer (later flipped to shipped)
- `b057f7e` — Redact bounded override values in wmkf_ai_promptoverride audit field
- `39da64e` — Add wmkf_ai_run raw-output retention modes; adopt hash for phase-i.summary
- `06e682b` — Add Dynamics Explorer model-context serializer
- `1ffa15d` — Add SECURITY_OPERATING_PLAN.md

### Memory updates this session

- `project_dynamics_explorer_serializer_deferred.md` — flipped from "deferred" to "shipped"; renamed; rewrote rationale and watch items for post-ship state.
- MEMORY.md index entry for the serializer rewritten to reflect shipped status with model-context-minimization framing.

## Where to pick up — Session 131

Open. The two threads with the most momentum are unchanged from Session 130's prompt; the security thread is now closed.

### A. Continue the intake portal — institution / membership flow (~1 day)

Now that `/apply` has a working applicant identity (Session 129), the next slice is institution selection:
- Applicant lands on `/apply` → empty memberships → routed to institution-search flow.
- Search by name + EIN (Dataverse query: exact EIN → exact name → fuzzy via Dataverse Search).
- 0..N candidates returned → applicant picks one or requests "create new."
- "Create new" routes to staff approval, not auto-creation.
- New `wmkf_portal_membership` request row created on selection.

Schema is documented in `docs/INTAKE_PORTAL_DESIGN.md` (lines 84–143). Pilot uses `wmkf_portal_membership` (new) + fields on existing `contact` and `akoya_request`. Next session can scope to either (a) the search/match endpoint or (b) the membership-write flow with staff approval, depending on bite size preferred.

### B. Smoke-test impersonation in preview, then flip prod (~30 min, blocking on staff cooperation)

Procedure in `docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md` § Step 5. The adapter chain is fully plumbed (Session 129); the preview test exercises a much larger surface than what was tested in Session 128. Recommended: do this BEFORE more intake portal work, so the impersonation flag is on for the new writes that intake will produce.

### C. Initial alignment conversation on the security operating plan (~30 min)

`docs/SECURITY_OPERATING_PLAN.md § Initial Alignment Agenda` lists six decisions to make in the first planning conversation. Once aligned, fold the decisions back into the relevant sections and remove the agenda block. This is a Connor-sync topic for the next regular sync — not urgent, just don't let it sit indefinitely.

### Externally gated (don't pursue without signal)

- Connor sync on the 6 outstanding intake portal decisions in `docs/CONNOR_INTAKE_PORTAL_SYNC.md`. Some of these (form schema, reviewer-consumable artifact decision) gate later sessions but not the membership flow.
- Interim grant report auto-evaluation. Backend job, blocked on Connor input on triggering and report cadence.

### Deliberately deferred (still don't do)

- 27-script `setRestrictions` / `bypassRestrictions` migration — cleanup, not blocking.
- Wave 1 retirement — earliest 2026-05-17 (14-day stability clock from 2026-05-03).
- ⚠️ Drop Postgres reviewer tables — would break the live Reviewer Finder app.

## Key files added/modified this session

| File | Purpose |
|---|---|
| `lib/utils/ai-payload-boundary.js` | Canonical bounded-payload helper. Per-route cap constants, DATA_CLASSES enum, source-string convention. |
| `lib/utils/ai-run-retention.js` | NEW. `applyRawOutputRetention(rawOutput, retention)` — `full` / `hash` / `none`. Idempotent. |
| `lib/utils/dynamics-explorer-serializer.js` | NEW. Recursive sanitizer for tool results + record-level + field-level entry points. |
| `lib/services/execute-prompt.js` | `applyVariableBoundaries()` between resolve and compose. `redactBoundedOverrides()` before audit write. `outputSchema.rawOutputRetention` honored. |
| `lib/services/dynamics-service.js` | `logAiRun()` accepts `rawOutputRetention`. |
| `pages/api/dynamics-explorer/chat.js` | Serializer wired at tool-result, search-highlight, annotation/email label, and export-AI-processing paths. |
| `pages/api/grant-reporting/extract.js` | All 6 `tryLogAiRun` call sites bounded; retention deliberately stays `'full'` with inline comment explaining why. |
| `pages/api/phase-i-dynamics/summarize.js` (v1) | `rawOutputRetention: 'hash'` on success/needs_review path. |
| `scripts/check-api-route-security-matrix.js` | NEW. CI gate for matrix updates. |
| `scripts/seed-phase-i-summary-prompt.js` | Added `dataClass + maxChars + rawOutputRetention: 'hash'`. Live row activated. |
| `scripts/diff-phase-i-summary-prompt.js` | NEW. Read-only field-by-field diff; ran clean post-activation. |
| `docs/SECURITY_OPERATING_PLAN.md` | NEW. Cadence + watch-item escalation thresholds + alignment agenda. |
| `docs/EXECUTOR_CONTRACT.md` | Data-classification + payload-boundary section; `wmkf_ai_promptoverride` redaction documented. |
| `docs/AI_DATA_FLOW_MATRIX.md` | P1 column marked closed; serializer flipped from deferred to shipped. |
| `docs/API_ROUTE_SECURITY_MATRIX.md` | NEW. 76-route matrix. |

## Production state (sanity)

- AI payload boundaries: live across every high-volume Anthropic call site.
- Executor declarative caps: live; `phase-i.summary` is the first adopter.
- `wmkf_ai_run` retention: phase-i.summary uses `'hash'` in the live tenant. Other callers default to `'full'` (backwards compatible).
- Dynamics Explorer serializer: live; redaction fires on first non-passthrough tool call.
- API route matrix CI gate: live; PRs touching `pages/api/**` will fail without a matrix update.
- Identity reconciliation: code-complete end-to-end. `DYNAMICS_IMPERSONATION_ENABLED` still default off in prod — no behavior change yet.
- Wave 1: 14-day stability clock running from 2026-05-03 (next eligible drop date 2026-05-17).
- Reviewer Finder: production-tested. Postgres reviewer tables still load-bearing.
- External Reviewer Intake: live.
- Intake portal Entra External ID foundation: live in code. No `/apply` UI yet beyond the Session 129 smoke test.

## Testing

```bash
# Standard suite — should be 407/407 (1 skipped, 406 passed)
npm test -- --runInBand

# API route matrix CI gate
npm run check:api-routes

# Targeted regression on the security tranche
npm test -- --runInBand --testPathPatterns="ai-payload-boundary|ai-run-retention|execute-prompt|phase-i-dynamics|grant-reporting|dynamics-explorer|virtual-review-panel"

# Re-verify live phase-i.summary row is in sync with seed source
node scripts/diff-phase-i-summary-prompt.js
# Expect: "✓ No content drift detected."
```
