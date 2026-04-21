# Questions for Connor — April 2026

Items that need Connor's input or action to unblock the next phase of development. Grouped by priority.

**Reference docs:** `PROMPT_STORAGE_DESIGN.md`, `WORKFLOW_CHAINING_DESIGN.md`, `DYNAMICS_AI_FIELDS_SPEC_v3_cn.md`, `BACKEND_AUTOMATION_PLAN.md`

---

## 1. Create `wmkf_prompt_template` table (blocks prompt storage work) — **IN PROGRESS**

> **Update (2026-04-16):** Connor will work on creating this table. Naming convention TBD.

This is the main blocker. Nothing on the Vercel side can move until this table exists in Dynamics.

**What it is:** A new Dataverse table that stores Claude prompt templates — the text, model settings, version history, and metadata for every AI task. Both PowerAutomate flows and the Vercel app read from it, so prompts are managed in one place instead of being hard-coded in two systems.

**Full schema:** `docs/PROMPT_STORAGE_DESIGN.md`, lines 127–148.

Each row in this table is one version of one prompt — e.g. "the Phase I writeup prompt, version 7." The Claude API actually takes **two** prompt pieces: a **system prompt** (instructions, tone, output format — reused across every run and cached server-side by Anthropic for ~90% cost savings) and a **user prompt** (the per-request content — the proposal text, applicant name, etc., with `{{var}}` slots). Both are stored on the same row so they version together.

Column-by-column explanation of how each field is consumed at runtime:

| Column | Type | What it's for (backend use) |
|--------|------|------------------------------|
| `wmkf_name` | Text | **Natural key / lookup handle.** PA and the Vercel app both look up prompts by name (e.g. `phase-i-writeup`), never by GUID. Stable across versions. |
| `wmkf_version` | Integer | **Monotonic version number.** New edits always append a new row with `version + 1`. Never reused, never edited. Lets us audit "which version ran on request X" and roll back to a known-good version. |
| `wmkf_system_prompt` | Memo | **The system prompt** — the stable, reusable instructions Claude sees on every call. This is the text that benefits from prompt caching, so it should change as rarely as possible. Typically 4–8k chars. **Needs raised memo cap.** |
| `wmkf_user_prompt` | Memo | **The user prompt template** — the per-request content shell, with `{{var}}` slots the caller fills in at runtime (e.g. `Here is the proposal:\n\n{{proposal_text}}`). Can be as short as a single `{{proposal_text}}` when no framing is needed. **Needs raised memo cap** (user prompts with a full proposal inlined can exceed 50k chars; the template itself is short, but the cap matters for the run log). |
| `wmkf_model` | Text (~64) | **Claude model ID** (e.g. `claude-sonnet-4-6`). Lets prompt authors pin a specific model to a prompt — some tasks need Opus, others are fine on Haiku. Read by both PA (full composition) and Vercel (hybrid / interactive). |
| `wmkf_maxtokens` | Integer | **Max output tokens.** Passed straight to the Claude API call. Caps runaway responses and bounds per-call cost. |
| `wmkf_temperature` | Decimal | **Sampling temperature** (0.0–1.0). Lower for structured extraction, higher for narrative writeups. Passed to the Claude API call. |
| `wmkf_status` | Choice | **Lifecycle state.** `draft` = editable, never runs in production. `published` = live, immutable. `retired` = archived, won't be selected. Only `published` rows are used at runtime. |
| `wmkf_is_current` | Bool | **Fast "give me the live version" flag.** Exactly one `published` row per `wmkf_name` has `is_current = true`. Lets callers do a single indexed lookup (`name = X AND is_current = true`) instead of sorting by version. |
| `wmkf_variables` | Memo (JSON) | **Declared template slots.** A JSON array describing what `{{var}}` names the user prompt expects (e.g. `[{"name":"proposal_text","required":true},{"name":"summary_length","required":false,"default":"300 words"}]`). Used for (1) preflight validation — the editor refuses to publish if the template references an undeclared variable, and (2) runtime — callers know what to supply. |
| `wmkf_output_schema` | Memo (JSON) | **What structured fields the prompt produces.** When a prompt uses JSON-mode or tool-use to emit structured output (e.g. `{keywords: [...], risk_flags: [...]}`), this column declares the shape. Downstream flows read this to know which `akoya_request` fields to write. See `WORKFLOW_CHAINING_DESIGN.md`. |
| `wmkf_preflight_passed_at` | DateTime (nullable) | **Last time the prompt passed lint checks** (variable declarations match template, model ID is valid, JSON schemas parse). Editor blocks publish if null or stale. |
| `wmkf_last_test_run_at` | DateTime (nullable) | **Last time a superuser dry-ran this prompt** against a real request via the "Test Run" button. Soft requirement for publishing — catches prompts that lint-pass but produce garbage. |
| `wmkf_rollback_from_version` | Integer (nullable) | **Provenance for rollbacks.** If someone restores version 3 as a new version 8, this field on v8 = 3. Makes the rollback visible in version history instead of looking like a fresh edit. |
| `wmkf_notes` | Memo | **Per-version changelog** — "bumped max_tokens, tightened tone" — written by the editor when saving. Surfaced in the version-history UI. |
| `created_by` | Lookup (systemuser) | **Who wrote this version.** Attribution for audit + "ask this person what they meant." |
| `created_on` | DateTime | Draft creation timestamp. |
| `published_on` | DateTime (nullable) | When the row transitioned `draft → published`. Null for drafts and retired rows that never shipped. |

**Runtime flow (illustrates why each field is there):**

```
1. PA trigger fires (e.g. request stage → "submitted")
2. Lookup: WHERE wmkf_name = 'phase-i-writeup' AND wmkf_is_current = true
   → returns one row
3. Read wmkf_system_prompt  → Claude `system` param (cached)
4. Read wmkf_user_prompt    → substitute {{proposal_text}}, {{pi_name}}, etc.
                              (validated against wmkf_variables)
                            → Claude `messages[0].content`
5. Read wmkf_model, wmkf_maxtokens, wmkf_temperature → API call params
6. Claude returns structured output → validated against wmkf_output_schema
7. Write results to akoya_request fields; log run to wmkf_ai_run with
   wmkf_ai_promptversion = this row's wmkf_version
```

Every field above exists because one of those steps needs it.

**Naming question:** The v3 AI fields spec standardized to `wmkf_ai_` prefix (e.g. `wmkf_ai_run`, `wmkf_ai_summary`). Should this table follow the same convention (`wmkf_ai_prompt_template`, columns like `wmkf_ai_body`) or stay `wmkf_prompt_template`? Either works on our side — just need to know what you prefer so we match it in code.

**Action needed:** Create the table with raised memo caps on `wmkf_body`, `wmkf_variables`, `wmkf_output_schema`, and `wmkf_notes`. Same write permissions as `wmkf_ai_run` (the app registration needs `prvCreate` + `prvUpdate`).

---

## 2. Hybrid vs. full PowerAutomate composition — **DECIDED: Full composition**

> **Decision (2026-04-16):** Full PA composition chosen. Rationale: easier to debug PA-native flows, and backend automation is mission-critical — removing the Vercel runtime dependency is worth the PA-side complexity.

This is an architecture decision about how PowerAutomate flows will call Claude. Two options:

### Option A: Full composition (PA does everything)

```
Dynamics trigger
  → PA fetches prompt from wmkf_prompt_template
  → PA downloads files from SharePoint
  → PA extracts text from PDF/DOCX (native PA preprocessing)
  → PA assembles the Claude API request itself
  → PA calls Anthropic API directly
  → PA handles retries, errors, token counting
  → PA writes results to akoya_request
  → PA logs to wmkf_ai_run
```

- Pro: No runtime dependency on the Vercel app for automated jobs — fully self-contained
- Pro: PA can handle PDF/DOCX text extraction natively (confirmed 2026-04-15)
- Con: PA has to reimplement retry/backoff logic, JSON schema validation for structured outputs, prompt caching (`cache_control` header assembly), and cost calculation — all of which already work in the Vercel codebase

### Option B: Hybrid composition (PA triggers, Next.js does the Claude call)

```
Dynamics trigger
  → PA fetches prompt from wmkf_prompt_template (PA keeps audit visibility of which prompt version it read)
  → PA POSTs { prompt_row, request_id } to Next.js /api/execute-prompt
  → Next.js fetches files from SharePoint, extracts text, renders template,
    calls Claude with caching + retry, logs to wmkf_ai_run
  → Next.js returns { summary, structured_data, run_id }
  → PA writes results to akoya_request
```

- Pro: One tested codepath for all Claude calls — no divergence between what PA does and what the Vercel app does
- Pro: Structured JSON output validation + retry on malformed responses is trivial in Node.js, painful in PA expressions
- Pro: The execute-prompt endpoint is already needed for the user-override and test-run features, so PA reuses existing infrastructure
- Con: Vercel must be reachable for automated jobs to complete (if Vercel is down, PA flows stall)

**Context update (2026-04-15):** With PA's native PDF preprocessing capability confirmed, full composition is now genuinely self-contained — no Vercel dependency at all. This makes full composition more attractive than before. The remaining arguments for hybrid are:

- JSON schema validation + retry on malformed Claude output (trivial in Node.js, complex in PA expressions)
- Prompt caching (`cache_control` header assembly in PA's HTTP action)
- Single codepath for all Claude calls (easier to debug, one place to update)

**The question is now more balanced.** Rather than "hybrid unless you have a blocker," it's closer to: **how comfortable are you building retry logic and JSON validation in PA?** Things to consider:

- When Claude returns malformed JSON (happens occasionally with complex structured outputs), would you want PA to retry automatically? How complex is that in a PA flow vs. a 5-line try/catch in Node.js?
- `cache_control` headers save ~90% on the stable prefix of each prompt. Assembling the nested JSON for Anthropic's API in PA's HTTP action is doable but verbose — is that manageable?
- If both options are roughly equal effort, do you have a preference for keeping PA flows self-contained vs. delegating the Claude mechanics to Next.js?
- Is there a timeout concern with PA's HTTP action? The Claude call can take 30–60 seconds for long proposals.

If you're comfortable with the PA-side complexity, full composition gives you zero external dependencies. If you'd rather keep PA flows simpler, hybrid offloads the hard parts to code that already exists.

---

## 3. Template variable syntax — **PARTIALLY VERIFIED (Next.js side), PA side still pending**

> **Update (2026-04-17, Session 103):** The Next.js side is confirmed to work. A prototype (`lib/services/prompt-resolver.js`) stored `{{proposal_text}}`, `{{summary_length}}`, `{{summary_length_suffix}}`, `{{audience_description}}` in a Dataverse Memo field (`wmkf_ai_rawoutput` on a scratch row), read them via OData, and interpolated at runtime. Dataverse returns Memo values as literal strings — no `{{` expression interpretation. 6,634 chars round-tripped without truncation.
>
> **PA-side check still open.** Same question stands: when PA reads a Memo field containing `{{var}}` via the Dataverse connector, does its `replace()` action or expression language trip on the double-braces? The suggested one-minute test below is still the cleanest way to settle it.

Prompts stored in `wmkf_prompt_template` have placeholder slots that get filled at runtime — things like `{{proposal_text}}`, `{{institution}}`, `{{pi_name}}`. The caller (PA or Next.js) reads the template, substitutes the placeholders with real values, and sends the result to Claude.

**Recommendation:** `{{variable_name}}` (double-brace, Handlebars-style).

PA would use its `replace()` function to do the substitution:

```
replace(body, '{{proposal_text}}', outputs('ExtractedText'))
replace(body, '{{institution}}', triggerOutputs('akoya_request/institution'))
```

PA's `replace()` is delimiter-agnostic — it doesn't care whether the delimiters are `{{ }}`, `[[ ]]`, or anything else. So the question is really about readability and whether double-braces cause any issues in PA's expression language.

**Quick test Connor could run:** Create a test Memo field containing the literal text `Hello {{name}}, your score is {{score}}`, read it in a PA flow, and check whether PA returns the string as-is or throws an expression error. If the string passes through unmodified, we're done — `{{var}}` is the canonical syntax.

---

## 4. Field Set B timeline (Grant Report fields)

Field Set B (grant report extraction fields — postdoc counts, publication counts, narratives, goals assessment) is on hold per `DYNAMICS_AI_FIELDS_SPEC_v3_cn.md`, pending "further staff review."

**Questions:**
- Is there a timeline for this review?
- Who else needs to weigh in?
- Is there anything we can do to move it forward?

Not currently blocking anything — the Grant Reporting app works today without CRM writeback. But once Field Set B lands, the app can write extracted data back to Dynamics automatically.

---

## 5. Intermediate fields on `akoya_request` for workflow chaining

When the backend runs the Phase I writeup prompt, we want it to extract not just the prose summary but also structured metadata (keywords, methodologies, risk flags, etc.) in the same Claude call. Downstream tasks (compliance screening, PD assignment, reviewer matching) would then read these fields instead of re-reading the full proposal — saving significant cost and time.

**v1 fields needed on `akoya_request`:**

| Field | Type | Purpose |
|-------|------|---------|
| `wmkf_keywords` | Memo (JSON array) | 5–10 keywords characterizing the research area |
| `wmkf_methodologies` | Memo (JSON array) | Key experimental approaches and techniques |
| `wmkf_risk_flags` | Memo (JSON array) | Compliance or feasibility concerns |
| `wmkf_team_info` | Memo (JSON) | PI and co-PI details, institutional affiliations |
| `wmkf_budget_summary` | Text | Brief budget characterization |
| `wmkf_timeline` | Text | Project timeline summary |

**Naming question:** Same as Q1 — should these follow the `wmkf_ai_` prefix convention since they're AI-produced? e.g. `wmkf_ai_keywords` instead of `wmkf_keywords`.

**Not blocking v1** but ideally created in the same batch as `wmkf_prompt_template` so we can test the full chain early. The exact field list may evolve as we test — starting with these six covers the known downstream consumers.

**Future expansion (single-phase cycle, ~2 cycles out):** Session 103 produced a broader extraction plan — `docs/PROPOSAL_CONTEXT_EXTRACTION_PLAN.md` — with ~15 fields across scientific decomposition (central question, hypotheses, specific aims, methods summary, preliminary data, innovation claims, expected deliverables), review-matching metadata (required expertise, competing groups, cited authors, methods tags, discipline tags, equipment), and verbatim passages (budget summary, key claims, team summary). Not requesting those now — the 6-field v1 set is enough to prove the workflow chain. But worth knowing the growth direction when choosing the v1 field shape, especially if we'd prefer JSON-in-Memo for extensibility.

Full context: `docs/WORKFLOW_CHAINING_DESIGN.md` (the mechanism) and `docs/PROPOSAL_CONTEXT_EXTRACTION_PLAN.md` (the future-state field list + downstream economics).

---

## 6. New columns on existing `wmkf_ai_run` table

Four additions to support prompt override tracking and run-source attribution:

| Column | Type | Purpose |
|--------|------|---------|
| `wmkf_prompt_override` | Memo | Full override text when a user edits a prompt for a single run. NULL when the published prompt was used unmodified. Needs same raised cap as `wmkf_ai_rawoutput`. |
| `wmkf_prompt_was_overridden` | Bool | Denormalized flag for fast filtering |
| `wmkf_run_source` | Choice | `pa-auto` (682090010) / `vercel-user` (682090011) / `vercel-test-run` (682090012) / `vercel-interactive` (682090013) — distinguishes how each AI run was triggered. Choice values are suggestions; use whatever numbering fits your convention. |

(`wmkf_ai_promptversion` already exists and doesn't need changes.)

Lower priority than Q1 — these are needed when the prompt override/visibility features ship, not for the initial table creation.

---

## 7. PD expertise field on `systemuser` (low priority, future)

For dynamic PD assignment to fully replace hardcoded GUIDs in prompts, we'd eventually need a custom field on `systemuser` for PD expertise descriptions (e.g., "organic chemistry, materials science, catalysis"). This lets the AI read current PD specialties at runtime instead of relying on a hardcoded list that drifts when staff change.

No action needed now — just flagging it as a future dependency. See `docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md` for context.

---

## Previously resolved (for reference)

| Item | Status |
|------|--------|
| `wmkf_ai_run` table + choices | Done (2026-04-14) |
| Field Set A (summary fields) | Done (2026-04-14) |
| Field Set C (compliance fields) | Done (2026-04-14) |
| Write permissions on app registration | Done (2026-04-14) |
| Activity/email privileges | Done (2026-04-14) |
| SharePoint `Sites.ReadWrite.Selected` | Done (2026-04-15, IT) |
| Duplicate `wmkf__ai_summary` field | Connor aware, will delete |
