# Session 132 Prompt: Open

## Heads up

Session 131 was housekeeping — Connor docs triage + CLAUDE.md tightening + Codex CLI install. Two commits, both pushed. No code changes.

The three substantive open threads from Session 131's prompt (intake portal membership flow, impersonation flag flip, security operating plan alignment) are unchanged and still the most-momentum candidates.

## Session 131 summary

### What was completed

1. **Connor docs triage** (`b36aad2`).
   - Archived 3 fully resolved docs to `docs/archive/`: `CONNOR_PROMPT_TABLE_NOTES.md`, `CONNOR_PROMPT_TABLE_FOLLOWUP.md`, `CONNOR_PROMPT_SCHEMA_QUESTIONS.md`. All superseded once `wmkf_ai_prompt` shipped with system/user split, name-based routing, and `prvRead`/`prvWrite` granted.
   - Trimmed `CONNOR_QUESTIONS_2026-04-15.md` from 222 lines to ~75: kept only Q4 (Field Set B timeline), Q5 (`akoya_request` workflow-chaining fields), Q6 (two remaining `wmkf_ai_run` columns), Q7 (PD expertise field). Added "Previously resolved" table so context isn't lost.
   - Updated `WAVE1_PROD_RUNBOOK.md` to point at the archive path.
   - Prepped two active docs for sending. `CONNOR_BRIEF_PHASE0.md` flipped to "Ready to send (2026-05-05)" — pre-send checklist 3/4 verified (cycle stability, audit row health, call-site references). `CONNOR_INTAKE_PORTAL_SYNC.md` preamble rewritten to reflect that Entra External ID access was granted and `/apply` foundation shipped in Session 129; Section 4 gained a one-paragraph note on the async submit lifecycle so Connor isn't surprised that the `'Phase II Pending'` flip lands seconds-to-minutes after submit click.
   - Memory: new `feedback_check_memory_before_asking_user.md`. Pre-send "has X happened" items are lookup tasks (MEMORY.md + commits), not user-confirm tasks. Triggered when I asked the user to confirm the IT-email status that was already in MEMORY.md.

2. **CLAUDE.md tightened: 525 → 256 lines (51%), 41.5KB → 18.9KB (54%)** (`29432f2`). Three staged passes:
   - **Service Classes** — every entry now ≤ 1 line. The dynamics-service.js paragraph (~420 words on `actingUserSystemId` / `MSCRMCallerID` plumbing) collapses to a one-liner pointing at `docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md`. Same treatment for intake-draft, token-lifecycle, llm-client, execute-prompt, review-upload, external-token, verify-suggestion-token. Stale prompt-resolver text fixed.
   - **API Endpoints** — full ~115-line catalogue replaced with a pointer to `docs/API_ROUTE_SECURITY_MATRIX.md` (CI-gated as of S130) plus a short conventions block.
   - **Database Schema** — column-by-column tables collapsed to a 13-row "table → purpose" matrix; `lib/db/schema.sql` + migrations are authoritative. Added `panel_reviews` / `panel_review_items` (was missing).
   - **Env Vars** — full block replaced with required-vs-optional groupings + pointer to `CREDENTIALS_RUNBOOK.md` and a "notable flags" callout.
   - **Per-App Model Configuration** — incomplete table dropped in favor of one line.
   - **Extended Documentation** — 35-row table reduced to 13 load-bearing operational pointers. Added `SECURITY_OPERATING_PLAN.md`, `API_ROUTE_SECURITY_MATRIX.md`, `INTAKE_PORTAL_DESIGN.md`, `DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md`, `EXTERNAL_REVIEWER_INTAKE_PLAN.md` which were missing.
   - Stale fixes: "all 13 app definitions" → made count-free (Applications table actually lists 17); historical 2026-04-26 ApiKeyManager removal note dropped; rotting "Foundation only as of Session 129" line in dual-provider NextAuth section dropped.

3. **Codex CLI installed + authenticated**. `codex-cli 0.128.0`, ChatGPT login active for `justingallivan@gmail.com`. Review gate not enabled — opt-in via `/codex:setup --enable-review-gate` if wanted.

### Commits (Session 131)

- `b36aad2` — Connor docs cleanup: archive resolved, trim stale, prep active
- `29432f2` — Tighten CLAUDE.md: 525 → 256 lines, defer detail to authoritative docs

### Memory updates this session

- New: `feedback_check_memory_before_asking_user.md` — check MEMORY.md and recent commits before asking the user to confirm pre-send / "has X happened" state.
- MEMORY.md index entry added under Operational.

### Send-ready Connor docs (pending user action)

- **`CONNOR_BRIEF_PHASE0.md`** — fully send-ready. Only outstanding pre-send checklist item is a personal re-read of `EXECUTOR_CONTRACT.md § Notes for caller authors`.
- **`CONNOR_INTAKE_PORTAL_SYNC.md`** — send-ready pending only the sync-slot pick.

## Where to pick up — Session 132

Open. No new threads opened by S131. The three highest-momentum candidates are unchanged:

### A. Continue the intake portal — institution / membership flow (~1 day)

Schema in `docs/INTAKE_PORTAL_DESIGN.md` lines 84–143. Next slice: applicant lands on `/apply` → empty memberships → institution-search flow. Search by name + EIN (Dataverse: exact EIN → exact name → fuzzy via Dataverse Search). 0..N candidates → applicant picks one or "create new." "Create new" routes to staff approval. Selection creates a `wmkf_portal_membership` row. Bite-sized scope: pick (a) the search/match endpoint or (b) the membership-write flow.

### B. Smoke-test impersonation in preview, then flip prod (~30 min, blocking on staff cooperation)

Procedure in `docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md § Step 5`. Recommended *before* more intake portal work so the impersonation flag is on for the new writes that intake will produce.

### C. Initial alignment conversation on the security operating plan (~30 min)

`docs/SECURITY_OPERATING_PLAN.md § Initial Alignment Agenda` lists six decisions for the first planning conversation. Ride a Connor sync.

### Externally gated (don't pursue without signal)

- Connor sync on the 6 outstanding intake portal decisions in `docs/CONNOR_INTAKE_PORTAL_SYNC.md`. Doc is send-ready.
- Phase 0 brief delivery — `docs/CONNOR_BRIEF_PHASE0.md` is send-ready.
- Interim grant report auto-evaluation. Backend job; blocked on Connor input.

### Deliberately deferred (still don't do)

- 27-script `setRestrictions` / `bypassRestrictions` migration — cleanup, not blocking.
- Wave 1 retirement — earliest 2026-05-17 (14-day stability clock from 2026-05-03).
- ⚠️ Drop Postgres reviewer tables — would break the live Reviewer Finder app.

## Key files added/modified this session

| File | Purpose |
|---|---|
| `CLAUDE.md` | Tightened 51% / 54%; defers detail to authoritative docs |
| `docs/CONNOR_QUESTIONS_2026-04-15.md` | Trimmed to Q4–Q7 stragglers + resolved-items table |
| `docs/CONNOR_BRIEF_PHASE0.md` | Status flipped to ready-to-send |
| `docs/CONNOR_INTAKE_PORTAL_SYNC.md` | Preamble rewritten; async submit note added; checklist updated |
| `docs/WAVE1_PROD_RUNBOOK.md` | Archive-path reference fix |
| `docs/archive/CONNOR_PROMPT_TABLE_NOTES.md` | Moved from `docs/` |
| `docs/archive/CONNOR_PROMPT_TABLE_FOLLOWUP.md` | Moved from `docs/` |
| `docs/archive/CONNOR_PROMPT_SCHEMA_QUESTIONS.md` | Moved from `docs/` |
| `.claude-memory/feedback_check_memory_before_asking_user.md` | New feedback memory |
| `.claude-memory/MEMORY.md` | Index entry for the new memory |

## Production state (sanity)

Unchanged from end of Session 130. No code shipped this session.

- AI payload boundaries: live across every high-volume Anthropic call site.
- Executor declarative caps: live; `phase-i.summary` first adopter (rawOutputRetention `'hash'`).
- Dynamics Explorer serializer: live.
- API route matrix CI gate: live.
- Identity reconciliation: code-complete; `DYNAMICS_IMPERSONATION_ENABLED` still default off in prod.
- Wave 1: stability clock running from 2026-05-03 (next eligible drop date 2026-05-17).
- Reviewer Finder, External Reviewer Intake, Intake portal Entra External ID foundation: all live.

## Testing

```bash
# Full suite — unchanged from S130, should be 407/407 (1 skipped, 406 passed)
npm test -- --runInBand

# API route matrix CI gate
npm run check:api-routes

# Re-verify live phase-i.summary row is in sync with seed source
node scripts/diff-phase-i-summary-prompt.js
# Expect: "✓ No content drift detected."
```
