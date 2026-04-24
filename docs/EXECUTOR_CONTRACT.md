# Executor Contract

**Status:** Draft spec, May 1 2026 cycle target
**Created:** 2026-04-24 (Session 109, reconciliation pass)
**Owners:** Justin (Vercel implementation), Connor (PowerAutomate implementation)
**Related docs:** `docs/PROMPT_STORAGE_DESIGN.md`, `docs/BACKEND_AUTOMATION_PLAN.md`, `docs/WORKFLOW_CHAINING_DESIGN.md`, `docs/GRANT_CYCLE_LIFECYCLE.md`

---

## Purpose

The Executor is the shared **contract** between the PowerAutomate `ExecutePrompt` child flow and the Vercel `executePrompt()` service function. Both implementations do the same nine things with the same inputs and same outputs, so that:

- A prompt row authored once in `wmkf_ai_prompt` serves both callers without duplication
- Cache prefixes are byte-identical across callers (prompt cache hits work)
- `wmkf_ai_run` rows written by either caller are structurally identical (audit trail stays coherent)
- Adding a new prompt means editing a Dynamics row — not authoring new code in two places

The Executor is the **function invoker**. The prompt row is the **function definition**. Chains and triggers are the **Flow's** job, not the Executor's.

## Scope of generality

The contract covers **Pattern A + dual-caller prompts and Pattern B/C Vercel-only prompts** — one Executor, no branching. Specifically:

**In scope:**
- Single-shot Claude prompts (system + user, no multi-turn)
- Backend-triggered (PA, on Dynamics status change) and user-triggered (Vercel button) callers
- Summarization, classification, multi-output extraction
- Prompts that mix Dynamics-sourced inputs, SharePoint file inputs, and caller-supplied overrides
- Sequential chains (output → input via shared Dynamics fields) and parallel-consumer chains (shared context block)

**Out of scope (separate code paths):**
- Tool-use / agent loops (Dynamics Explorer)
- Streaming SSE to the UI (token-by-token display — today's Phase II pattern stays outside)
- Non-Claude models
- Anthropic Batch API (`wmkf_batch_run`, retrospective work)
- Multi-turn stateful conversations

---

## Signature

### Inputs

| Name | Type | Required | Purpose |
|---|---|---|---|
| `promptName` | string | yes | Matches `wmkf_ai_prompt.wmkf_ai_promptname`. Executor picks the current published version (`wmkf_ai_iscurrent = true`). |
| `requestId` | GUID | conditional | `akoya_request` row GUID. Required for prompts that declare any `dynamics:akoya_request.*` or `sharepoint` source variables. Optional for all-`override` prompts (Pattern B/C). |
| `overrideVariables` | object | no | Per-invocation variable overrides. Keys must match names declared in `wmkf_ai_promptvariables`. Used for user-session overrides (Vercel) and test harness runs. |
| `runSource` | enum | yes | One of the `wmkf_ai_runsource` picklist values (e.g., `PowerAutomate Auto`, `Vercel Interactive`, `Vercel User`, `Vercel Test`). Caller supplies. |

**Deferred (Phase 1+):** `overridePromptBody: { system?: string, body?: string }` — body-level override for per-session prompt editing (PROMPT_STORAGE_DESIGN §17). Not needed for May 1.

### Outputs

| Name | Type | Purpose |
|---|---|---|
| `parsed` | object | Output object matching `wmkf_ai_promptoutputschema`. Downstream chain steps consume this. |
| `runId` | GUID | `wmkf_ai_run.wmkf_ai_runid` for the logged Execution. |
| `cacheHit` | bool | Derived from Claude response's `usage.cache_read_input_tokens > 0`. For observability. |

### Errors

Executor throws (Vercel) or sets failure status (PA) on: prompt not found, variable resolution failure, Claude API error, output parse failure, target write failure.

**Invariant:** a `wmkf_ai_run` row is **always** written — even on failure — with `wmkf_ai_status = Failed` and `wmkf_ai_notes = <error summary>`. This preserves audit completeness.

---

## The 9 steps

| # | Step | PA action | Vercel equivalent |
|---|---|---|---|
| 1 | Resolve prompt | HTTP GET `wmkf_ai_prompts?$filter=wmkf_ai_promptname eq '<name>' and wmkf_ai_iscurrent eq true&$top=1` | `PromptResolver.getPrompt(name)` (to be extended) |
| 2 | Parse variable declarations | Parse JSON on `wmkf_ai_promptvariables` | `JSON.parse(row.wmkf_ai_promptvariables)` |
| 3 | Resolve variable values | Apply-to-each + Switch on `source.kind` | Loop + switch; source kinds handled by dedicated resolvers |
| 4 | Compose Claude payload | Compose action: system + user blocks; `cache_control: {type:"ephemeral"}` at declared prefix boundary | `buildClaudeRequest(prompt, variables)` |
| 5 | Call Claude | HTTP action → Anthropic API | `fetch('https://api.anthropic.com/v1/messages', ...)` |
| 6 | Parse output | Parse JSON on Claude response `content[0].text` using `wmkf_ai_promptoutputschema.jsonSchema` | Same |
| 7 | Persist outputs | Apply-to-each target binding + Switch on `target.kind` | Same loop |
| 8 | Log Execution | Create `wmkf_ai_run`: Lookup to prompt row, `wmkf_ai_promptversion`, `wmkf_ai_runsource`, `wmkf_ai_status`, `wmkf_ai_model`, `wmkf_ai_rawoutput`, token/cache counts in `wmkf_ai_notes`, `wmkf_ai_request` Lookup | Same |
| 9 | Return | Return `{ parsed, runId, cacheHit }` | `return { parsed, runId, cacheHit }` |

---

## Metadata shapes

### `wmkf_ai_promptvariables` (Memo, JSON)

```json
{
  "variables": [
    {
      "name": "proposal_text",
      "source": { "kind": "sharepoint", "pattern": "project_narrative*.pdf", "preprocess": "pdf_to_text" },
      "required": true,
      "cacheable": true,
      "placement": "user"
    },
    {
      "name": "applicant_name",
      "source": { "kind": "dynamics", "table": "akoya_request", "field": "akoya_applicantname" },
      "required": true,
      "cacheable": false,
      "placement": "user"
    },
    {
      "name": "summary_length",
      "source": { "kind": "override", "default": "1" },
      "required": false,
      "cacheable": false,
      "placement": "user"
    }
  ]
}
```

**Source kinds (Phase 0):**

| Kind | Meaning | Executor behavior |
|---|---|---|
| `dynamics` | Field value from a Dataverse row keyed by `requestId` (or `table` + explicit GUID) | Dataverse GET |
| `sharepoint` | Fetch file by pattern from the SharePoint buckets for this request | Graph API GET + preprocess |
| `override` | Value from `overrideVariables` input; fall back to `default` | Read from input |

**Source kinds (Phase 1+):**

| Kind | Meaning | Phase |
|---|---|---|
| `prior_output` | Value from a field a prior Execution wrote (implicit chaining via Dynamics) | Phase 1 |
| `context_block` | Recursively assemble another prompt row tagged as `Context` | Phase 2 |

**Preprocess hints (Phase 0):** `pdf_to_text`, `docx_to_text`. Additional hints (`truncate_tokens:N`, `strip_images`) may be added in later phases. Both Executors implement the same set; adding a new hint requires updating both.

**Placement attribute (Phase 0 — present but single-valued):** v0 only supports `placement: "user"`. Phase 2 adds `placement: "system"` for context-block variables that need to be part of the cacheable system-array prefix.

**`cacheable` flag:** Phase 0 honors this for *within-prompt* cache alignment (rerunning the same prompt on the same request hits the Claude cache). Cross-prompt cache alignment (e.g., summary + compliance sharing the bundle) requires context blocks in Phase 2.

### `wmkf_ai_promptoutputschema` (Memo, JSON)

```json
{
  "outputs": [
    {
      "name": "summary",
      "type": "string",
      "target": { "kind": "akoya_request", "field": "wmkf_ai_summary" }
    },
    {
      "name": "keywords",
      "type": "array",
      "target": { "kind": "akoya_request", "field": "wmkf_ai_dataextract", "jsonPath": "$.keywords" }
    }
  ],
  "jsonSchema": {
    "type": "object",
    "required": ["summary", "keywords"],
    "properties": {
      "summary":  { "type": "string" },
      "keywords": { "type": "array", "items": { "type": "string" } }
    }
  }
}
```

**Target kinds (Phase 0):**

| Kind | Meaning |
|---|---|
| `akoya_request` | PATCH a field on the `akoya_request` row identified by `requestId`. `jsonPath` optional — used when multiple outputs share a JSON Memo field (e.g., `wmkf_ai_dataextract`). |
| `wmkf_ai_run` | Write to a field on the Execution row being created in step 8. |
| `none` | Output is computed but not persisted (consumer is the caller's return value only). |

---

## Caching contract

**Byte-identical prefixes across callers are the whole point of cache alignment.** If PA and Vercel produce different bytes before the first `cache_control` marker, they land in different cache buckets and neither call benefits from the other.

The Executor always:

1. Sends `system` and `user` as separate blocks (requires the `wmkf_ai_systemprompt` + `wmkf_ai_promptbody` split — added by Connor in Phase 0, confirmed live 2026-04-24).
2. For each variable marked `cacheable: true`, places it **before** the last `cache_control` marker.
3. For each variable marked `cacheable: false`, places it **after** the marker (in the non-cached tail).
4. Emits exactly one `cache_control: {type: "ephemeral"}` at the boundary.

Any change to the prompt body, the system prompt, or a cacheable variable splits the cache — that's correct behavior. The cache is only safe to rely on when nothing in the prefix has changed.

**Within-prompt caching (Phase 0):** rerunning `phase-i.summary` on the same `requestId` with the same PDF content will hit cache on repeat invocations within the 5-min TTL.

**Cross-prompt caching (Phase 2):** `phase-i.summary` and `phase-i.compliance` both reference a shared `context_block` placed in `system`, so a back-to-back invocation of both prompts on one request hits cache on the second call for the document tokens.

---

## Logging contract

Every Execution writes one `wmkf_ai_run` row with, at minimum:

| Field | Value |
|---|---|
| Lookup `wmkf_ai_prompt` (new in Phase 0) | Reference to the prompt row resolved in step 1 |
| `wmkf_ai_promptversion` | The resolved row's `wmkf_promptversion` |
| `wmkf_ai_promptoverridden` | `true` if `overrideVariables` was non-empty |
| `wmkf_ai_promptoverride` | Verbatim text of the override inputs (for audit) if applicable |
| `wmkf_ai_runsource` | Caller-supplied input |
| `wmkf_ai_tasktype` | Derived from the prompt row (future — after `tasktype` lands on `wmkf_ai_prompt`) |
| `wmkf_ai_status` | `Completed` / `Failed` / `Needs Review` |
| `wmkf_ai_model` | The model ID actually used |
| `wmkf_ai_rawoutput` | Claude's raw response text |
| `wmkf_ai_request` | Lookup to `akoya_request` (if applicable) |
| `wmkf_ai_notes` | Input/output token counts + cache hit counts + any error summary |
| `wmkf_ai_rundatetime` | Set by caller or default to now |

---

## Non-goals (what the Executor does NOT do)

- **Does not orchestrate chains.** The caller (parent PA flow or Vercel API route) decides which prompts run in what order. Executor runs exactly one prompt per invocation.
- **Does not branch on output.** Business-logic conditions ("if compliance failed, notify staff") live in the caller's Flow.
- **Does not retry.** Caller decides retry policy. Executor returns failure; caller decides whether to re-invoke.
- **Does not handle arbitrary code.** Preprocessing, source kinds, and target kinds are closed enums. Weird cases require a new enum value implemented in both executors — not an "exec arbitrary script" escape hatch.
- **Does not write to SharePoint.** Phase 0 is Dynamics-only for persistence.
- **Does not manage prompt lifecycle.** Draft/publish/retire is a separate dashboard concern.
- **Does not stream.** Streaming Executor variant (`executePromptStream`) deferred; today's streaming routes stay outside the contract.

---

## Test oracle

A small test prompt `test.echo`:
- Declares two variables — one `dynamics`, one `override`
- Output schema: `{ echo: string }` with target `kind: none`
- System prompt: `"Echo the inputs verbatim as JSON."`

Both executors must:
1. Invoked with identical `requestId` and `overrideVariables`, produce byte-identical `wmkf_ai_rawoutput`
2. On second invocation, `cacheHit` is `true` regardless of which caller went first

If either assertion fails, the two implementations have drifted and must be reconciled before building more prompts on top.

---

## Phase 0 concrete scope (May 1 2026)

**Built for May 1 (Vercel-only):**
- `executePrompt()` service function implementing steps 1–9
- Variable source resolvers: `dynamics`, `sharepoint`, `override`
- Preprocessor: `pdf_to_text` (via existing `lib/utils/file-loader.js`)
- Target writer: `akoya_request` (including JSON-path set for `wmkf_ai_dataextract`)
- Reference route: `pages/api/phase-i-dynamics/summarize-v2.js` becomes a ~30-line call into `executePrompt()`
- First prompt row: `phase-i.summary` (system/body split, cacheable PDF variable, output schema targeting `wmkf_ai_summary` + `wmkf_ai_dataextract.$.keywords`)

**Explicitly deferred:**
- PowerAutomate `ExecutePrompt` child flow (Phase 1)
- Context blocks + `context_block` source kind + `placement: system` (Phase 2)
- `prior_output` source kind (Phase 1)
- `overridePromptBody` input (Phase 2+)
- Streaming Executor variant
- Publish-time structural lint + test-run gate (manual review for Phase 0)

**Phase 0 caching note:** within-prompt cache hits only. Running summary then compliance on the same request in Phase 0 does NOT share cache on the document block — both calls pay full price. That's acceptable for the May cycle budget.
