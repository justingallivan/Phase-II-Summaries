# Prompt Storage Design (In Progress)

**Status:** Design conversation started 2026-04-14 (Session 99). Not yet implemented.
**Owner:** Justin Gallivan
**Related docs:** `docs/BACKEND_AUTOMATION_PLAN.md`, `docs/DYNAMICS_AI_FIELDS_SPEC_v3_cn.md`

> This doc is a live working draft. It exists so a browser Claude Code session can pick up the conceptual work visually (Mermaid diagrams, state machines, flow comparisons). Once decisions settle, it becomes the implementation spec.

---

## Motivation

Today, Claude prompts live in `shared/config/prompts/*.js` as hard-coded JS templates. This works while all AI calls originate from Next.js apps running on Vercel. It breaks as soon as **PowerAutomate-triggered backend jobs** start composing their own Claude calls on status-change events in Dynamics — PA can't import JS modules from a Vercel deployment.

We need prompts to live somewhere that:
1. **PowerAutomate can read natively** (Dataverse, or an HTTP endpoint, or both)
2. **Next.js apps can continue to read** (same text, no drift)
3. **Can be viewed by staff** — a dashboard where all authenticated users can inspect the current prompt for any app
4. **Can be edited by privileged users** without a code deploy
5. **Has immutable version history** so `wmkf_ai_run.wmkf_ai_promptversion` continues to mean exactly what it says six months from now

## Decisions already locked in

These came out of the design conversation in Session 99. Listed here so a fresh agent session doesn't re-litigate them:

1. **Storage location: Microsoft Dynamics / Dataverse.** A new table, `wmkf_prompt_template`, is the single source of truth for both PA and Next.js.
2. **PowerAutomate composes Claude calls itself** (not dumb-trigger Next.js). This is the reason Dynamics storage wins over Postgres — PA reads Dataverse natively.
3. **Next.js reads the same Dynamics table** via OData, with aggressive in-process cache (5-min TTL pattern, same as `user_app_access`) and a git-backed seed file as fallback for outages.
4. **Append-only versions.** A published version is immutable. Any edit produces a new version row. Never mutate a published `wmkf_body`.
5. **Draft / publish flow.** Edits create a `status=draft` row. An explicit publish step transitions it to `status=published` and swaps the `is_current` pointer. Old `published` versions stay queryable as `status=retired`.
6. **Dashboard access model:**
   - All authenticated users: view any prompt, any version, with diff against previous
   - Superusers only: create drafts, edit drafts, publish drafts, retire published versions
7. **Git-seed stays committed.** Canonical bootstrap copies live in the repo for disaster recovery and new-environment setup. Dynamics is source of truth; git is backup.
8. **Dynamics ≠ AkoyaGO.** Storing prompts in `wmkf_prompt_template` is consistent with "minimize reliance on AkoyaGO" — Dynamics is the underlying platform, which we're already committed to.
9. **App patterns define which prompts need Dynamics storage.** Four migration-relevant patterns exist across the current app suite (see "App patterns and inventory" below). Only Pattern A and dual-caller prompts require Dynamics storage — Pattern B and C prompts have no PA driver and can stay in `.js` indefinitely.
10. **Retirements.** Concept Evaluator is deprecated (concepts workflow being retired). Batch Phase I Summaries and Batch Phase II Summaries Vercel UIs retire once the backend can loop over the underlying per-proposal prompt — the batch apps only existed because programmatic Dynamics access didn't yet, and they share their prompts with the single-writeup apps. Multi-Perspective Evaluator is a development playground, explicitly out of migration scope.
11. **Phase I/II writeup apps become dual-caller.** Backend PA auto-drafts on status change and writes to `akoya_request.wmkf_ai_summary`. The Vercel app becomes an interactive refinement surface (Q&A against the draft, optional writeback to the same field). Both PA and Next.js read the same prompt row.
12. **v1 scope is three prompt rows.** `phase-i-writeup`, `phase-ii-writeup`, `compliance-field-set-c`. Everything else (Pattern B/C prompts, Q&A prompts, shared fragments, non-dev editor UI) is v2+.
13. **Preprocessing stays in the caller.** Text truncation, PDF/DOCX extraction, chunking, cleaning, and conditional-branch resolution are caller-side logic in both PA and Next.js. Dynamics stores static template text + `wmkf_variables` declarations — callers compute final substitution values (including pre-resolved conditional blocks) before filling slots.
14. **Q&A sub-prompts stay in `.js` for v1.** Called only from Next.js (interactive writeup sessions); no PA driver. Re-evaluate in v2 once the dual-caller pattern is proven.
15. **Defensive extraction is caller-specific, not prompt-specific.** Current Vercel prompts are roughly 70% shared analytical core + 20% defensive extraction (institution/PI/amount/period from raw PDF) + 10% input. Target prompts drop most of the 20% because Dynamics-sourced callers pass those fields as known variables. This is what makes one prompt row per analysis viable — the "Vercel sibling with defensive extraction vs. backend twin with structured inputs" split dissolves in the target state.

## App patterns and inventory

Four migration-relevant patterns across the current app suite:

- **Pattern A — Backend-primary, Vercel-as-reader.** PA/Dynamics runs the analysis on a trigger (typically a status change). Output lives in Dynamics fields. The Vercel app is a styled reader: it queries Dynamics and displays results, with no Claude call on the Vercel side.
- **Pattern B — Vercel-primary, Dynamics-as-source.** User triggers from Vercel. The app pulls structured context from Dynamics rather than asking the user to provide it or re-extract it from a PDF. Claude runs in Next.js. Output is a downloadable artifact (Word doc, `.eml`, markdown, PDF) — not persisted back to Dynamics.
- **Pattern C — Vercel-primary, user-uploaded input.** User uploads documents not stored in Dynamics (external reviews, arbitrary papers, receipts). Input is genuinely unstructured, so defensive extraction in the prompt is still warranted. Claude runs in Next.js. Output is a downloadable artifact.
- **Dual-caller (Pattern A + Vercel interactive).** One prompt row is read by both PA (auto-draft on trigger) and Next.js (user interactive refinement). Both write `wmkf_ai_run` rows with the same `wmkf_ai_promptversion` value — provenance is visible in the audit log ("auto-drafted by PA on Monday, refined by user via Q&A on Tuesday, saved over v1"). An interactive session should pin the prompt version it started with so a mid-session republish doesn't cause drift between the draft and subsequent Q&A turns.

### Inventory (post-migration state)

| App | Pattern | Dynamics prompt row? | Notes |
|---|---|---|---|
| Phase I Writeup (single) | Dual-caller | Yes (v1) | Backend auto-drafts; Vercel adds Q&A + optional save |
| Phase II Writeup (single) | Dual-caller | Yes (v1) | Same as above |
| Batch Phase I Summaries | Pattern A (backend loop) | Shared with Phase I Writeup | Vercel UI retired — backend loops the single-writeup prompt |
| Batch Phase II Summaries | Pattern A (backend loop) | Shared with Phase II Writeup | Vercel UI retired — same logic |
| Compliance / Field Set C | Pattern A | Yes (v1) | Backend-only |
| Phase I Dynamics (Test) | Pattern A (prototype) | Already the prototype | Becomes production Phase I auto-draft; source of `phase-i-writeup` prompt row |
| Concept Evaluator | Deprecated | No | Concepts workflow retired |
| Multi-Perspective Evaluator | Playground | No | Out of scope |
| Literature Analyzer | Pattern C | No — stays in `.js` | Not fully formed; no backend access planned |
| Peer Review Summarizer | Pattern C | No — stays in `.js` | External reviews, user-uploaded |
| Expense Reporter | Pattern C | No — stays in `.js` | User-uploaded receipts |
| Grant Reporting | Pattern B | Possibly (v2+) for editability | Stays in `.js` for v1 |
| Reviewer Finder | Pattern B | Possibly (v2+) for editability | Stays in `.js` for v1 |
| Review Manager | Pattern B | Possibly (v2+) for editability | Stays in `.js` for v1 |
| Expertise Finder | Pattern B | Possibly (v2+) for editability | Stays in `.js` for v1 |
| Funding Gap Analyzer | Pattern B | Possibly (v2+) for editability | Stays in `.js` for v1 |
| Integrity Screener (applicant) | Pattern B | Possibly (v2+) for editability | Distinct from Field Set C which is Pattern A |
| Dynamics Explorer | Pattern B (chat) | Probably not — ephemeral system prompts | — |
| Phase I/II writeup Q&A | Next.js-only | Deferred to v2 | No PA driver |

### Anatomy of a current Vercel prompt

Using `shared/config/prompts/phase-i-writeup.js` as the worked example. A Claude call in the current codebase is built in six layers; three of them move to Dynamics, three stay in caller code.

| Layer | Moves to `wmkf_prompt_template`? | Notes |
|---|---|---|
| Model selection (`getModelForApp`) | Yes — `wmkf_model` | Current fallback chain (DB override → env var → `baseConfig.js`) is superseded by reading Dynamics |
| Request parameters (max_tokens, temperature) | Yes — `wmkf_maxtokens`, `wmkf_temperature` | — |
| Static template body | Yes — `wmkf_body` | The ~70% analytical core |
| Variable slot declarations | Yes — `wmkf_variables` (JSON) | Named slots, descriptions, types |
| Conditional branches in prompt text | **No** — pre-resolved by caller | Caller builds the final string for the slot (e.g., "institution known" vs "institution unknown" block) and fills a single variable |
| Preprocessing (truncation, PDF extraction, chunking) | No — caller code | Depends on runtime input; Dynamics can record limits (e.g., `wmkf_max_input_chars`) but not execute them |
| HTTP envelope (`fetch` call, headers) | No — caller code | PA or Next.js |
| Response handling + `wmkf_ai_run` logging | No — caller code | Whoever makes the Anthropic call writes the run row |

### Current vs. target prompt shape

Phase I Writeup today, decomposed:

- **~70% shared analytical core** — role framing, output structure, section rules (Summary = 150-200 words, 4 rationale bullets, etc.), tone/forbidden words, formatting, output example. Carries across PA and Next.js identically.
- **~20% defensive extraction** — "You MUST extract the COMPLETE institution name," validation rules, error examples (Arizona vs. Arizona State, MIT vs. Massachusetts Institute of Technology), PI identification instructions. **Mostly disappears in the target state** because structured callers pass `institution`, `pi_name`, etc. as known variables.
- **~10% input block** — the truncated proposal text (100k char cap).

The target prompt row in Dynamics ≈ analytical core + structured-variable slots. The migrated Vercel dual-caller path adapts by sourcing those variables from Dynamics lookups instead of PDF extraction.

## Schema sketch (draft)

Not final — naming and memo caps need to line up with Dataverse conventions and Connor's review.

| Column | Type | Notes |
|---|---|---|
| `wmkf_name` | Text (natural key) | e.g. `phase-i-summary`, `grant-reporting-goals`, `compliance-screen` |
| `wmkf_version` | Integer | Append-only. Never reused. |
| `wmkf_body` | Memo | **Must raise cap from default 2000** — same pattern as `wmkf_ai_run.rawOutput` which Connor raised to 1,000,000. Some prompts (Phase I) run 5-8k chars. |
| `wmkf_model` | Text | e.g. `claude-sonnet-4-6` |
| `wmkf_maxtokens` | Integer | |
| `wmkf_temperature` | Decimal | |
| `wmkf_status` | Choice | `draft` \| `published` \| `retired` |
| `wmkf_is_current` | Bool | True for exactly one `published` row per `wmkf_name` |
| `wmkf_variables` | Memo (JSON) | Declared template slots + descriptions, so PA and the dashboard know what to substitute |
| `wmkf_notes` | Memo | Per-version change-log blurb |
| `created_by` | Lookup (systemuser) | |
| `created_on` | DateTime | |
| `published_on` | DateTime | Null while draft |

## What PowerAutomate inherits by composing Claude calls itself

Today these live in Next.js services. Once PA composes, PA owns them (or delegates back via a helper endpoint):

- **PDF/DOCX text extraction** — `lib/utils/file-loader.js`. No clean Dataverse/PA connector for PDF text extraction; likely needs a thin Next.js `/api/util/extract-text` helper.
- **Anthropic retry / backoff on 529s and rate limits.** PA has built-in retry but it's coarse; needs per-flow configuration.
- **Prompt caching with `cache_control` markers.** Doable in PA's HTTP action but the JSON assembly is ugly. We use ephemeral cache today — material cost savings.
- **Token counting + cost estimation.**
- **Logging to `wmkf_ai_run`.** PA can do this natively (it's the same Dataverse table it already writes to), so this one is easy.

The weight of this list is why **hybrid composition** (PA fetches + renders the prompt from Dynamics, then POSTs the rendered prompt to a thin Next.js `/api/execute-prompt` endpoint that handles the Claude mechanics) is still worth weighing against full composition.

## Four open questions

### 1. Template variable format

Prompts are templates with runtime slots (proposal text, grant context, file contents, etc.). What substitution syntax do we use?

- `{{var}}` — Handlebars / Liquid convention. Well-known, but PA's string substitution doesn't natively understand it.
- `{var}` — Python-style. Also foreign to PA.
- `$var` — Shell-style. Also foreign.
- **PA's native substitution** — `replace(variables('prompt'), '[[proposal_text]]', outputs('ExtractText'))` style.

The tail wags the dog here: whatever PA can substitute cleanly is what we should use on both sides, even if it looks non-standard in the codebase. Need to test PA's `replace()` + string interpolation to pick.

### 2. v1 scope — RESOLVED

**v1 is three prompt rows:** `phase-i-writeup`, `phase-ii-writeup`, `compliance-field-set-c`.

Rationale: these are the only prompts with a PA driver (the original motivation for moving out of `.js`). Phase I/II writeup rows are dual-caller — read by both PA auto-draft and Next.js interactive refinement. Compliance Field Set C is Pattern A backend-only. Batch Phase I/II Summaries share their prompts with the single-writeup apps (backend loops over the per-proposal prompt), so the batch apps contribute no new prompt rows.

See "App patterns and inventory" above for the full classification. Everything Pattern B, Pattern C, deprecated, or Q&A sub-prompt is explicitly v2+.

### 3. First non-Justin editor

If Connor (or anyone else) is going to edit prompts on day one, the dashboard needs:
- Variable-aware editor (highlights the declared `wmkf_variables`)
- Preview pane with sample substitution
- Diff view vs. last published version
- Maybe a linter for common issues (unbalanced braces, missing declared variables)

If it's Justin-only for the first quarter, a plain textarea + a "publish" button is enough.

Decides whether the dashboard is a half-day build or a multi-day build.

### 4. Hybrid vs. full PA composition

- **Full composition:** PA fetches prompt → renders → POSTs to Anthropic directly → writes result to `akoya_request` + logs to `wmkf_ai_run`. Pure — no Next.js dependency at runtime.
- **Hybrid:** PA fetches prompt → renders → POSTs rendered prompt to Next.js `/api/execute-prompt` → Next.js handles Claude call, caching, retry, token counting, SharePoint file fetch, PDF extraction → returns result → PA writes to Dynamics.

Full composition is philosophically cleaner and removes Vercel as a runtime dependency for backend jobs. Hybrid is pragmatic — reuses everything we've already built.

Tentatively chose full composition in Session 99. The "things PA inherits" list may push back toward hybrid.

---

## What to sketch

If you're a Claude Code session picking this up, these are the diagrams that would help the human think:

1. **Draft/publish state machine.** States: `draft → published → retired`. Show the `is_current` pointer swap when a new version publishes. Show that a draft can be edited in place (no new row) but a published version cannot (edits create a new draft).

2. **Full-composition vs. hybrid sequence diagrams, side by side.** Actors: `PowerAutomate`, `Dynamics`, `SharePoint`, `Anthropic API`, optionally `Next.js /api/execute-prompt`. Show every hop. This is how we'll actually compare them.

3. **Data flow for a single backend trigger** (worked example: Phase I summary on a status change from "In Review" → "Needs AI Summary"). PA reads prompt, reads files from SharePoint, extracts text, calls Claude, writes `wmkf_ai_summary` + `wmkf_ai_run`.

4. **Dashboard UI wireframe.** List of prompts → detail view with version history → draft editor. Doesn't need to be pretty — just "what's on the screen."

---

## Sketches (in progress)

Priorities 1 and 2 from the list above. Priorities 3 (worked-example data flow) and 4 (dashboard wireframe) still pending.

### 1. Draft / publish state machine

```mermaid
stateDiagram-v2
    [*] --> draft: create new (v1)
    [*] --> draft: fork from published (v N+1, new row)

    draft --> draft: edit body / metadata in place
    draft --> published: publish
    published --> retired: superseded by next publish
    published --> retired: explicit retire (no replacement)
    retired --> [*]

    note right of published
        wmkf_body is immutable here.
        Exactly one row per wmkf_name
        has is_current = true at any moment.
        Publishing a new draft atomically
        demotes this row to retired and
        flips is_current to the new row.
    end note

    note left of draft
        is_current is always false.
        Multiple concurrent drafts per
        wmkf_name are allowed (distinct
        wmkf_version integers).
    end note
```

**Invariants the state machine enforces**

- `wmkf_body` is only mutable while `status = draft`. Published and retired rows are frozen.
- For each `wmkf_name`, at most one row has `is_current = true`, and that row has `status = published`.
- The publish transition is atomic: new row becomes `published` + `is_current = true`; prior `is_current` row becomes `retired` + `is_current = false`.
- `retired` is terminal. Rows stay queryable for historical `wmkf_ai_run.wmkf_ai_promptversion` references, but are never mutated or revived.

### 2. Full-composition vs. hybrid sequence

Same trigger in both: a Dynamics status change fires a PowerAutomate flow that needs to run a prompt for a specific `akoya_request`.

**Full composition** — PowerAutomate owns the Claude call end-to-end. Next.js survives only as a utility for PDF/DOCX text extraction, because no clean Dataverse/PA connector exists for that.

```mermaid
sequenceDiagram
    autonumber
    participant Dyn as Dynamics (trigger)
    participant PA as PowerAutomate
    participant PT as wmkf_prompt_template
    participant SP as SharePoint
    participant NJ as Next.js /api/util/extract-text
    participant AN as Anthropic API
    participant Run as wmkf_ai_run

    Dyn->>PA: status change event
    PA->>PT: OData: current row for wmkf_name
    PT-->>PA: body, model, params, variables, version
    PA->>SP: list + download request files
    SP-->>PA: PDF / DOCX blobs
    PA->>NJ: POST blob(s)
    NJ-->>PA: plain text
    PA->>PA: render template (substitute variables)
    PA->>AN: POST /v1/messages (PA assembles cache_control JSON)
    Note over PA,AN: PA owns retry, 529 backoff, token + cost calc
    AN-->>PA: completion + usage
    PA->>Dyn: PATCH akoya_request.wmkf_ai_summary
    PA->>Run: INSERT wmkf_ai_run (promptversion, tokens, cost, rawOutput)
```

**Hybrid composition** — PowerAutomate owns the trigger and the final write to `akoya_request`. Next.js owns the mechanics of making the Claude call work: file fetch, extraction, template render, caching, retry, cost tracking, `wmkf_ai_run` logging.

```mermaid
sequenceDiagram
    autonumber
    participant Dyn as Dynamics (trigger)
    participant PA as PowerAutomate
    participant PT as wmkf_prompt_template
    participant NJ as Next.js /api/execute-prompt
    participant SP as SharePoint
    participant AN as Anthropic API
    participant Run as wmkf_ai_run

    Dyn->>PA: status change event
    PA->>PT: OData: current row for wmkf_name
    PT-->>PA: body, model, params, variables, version
    PA->>NJ: POST {prompt_row, request_id, trigger_context}
    NJ->>SP: list + download files (file-loader + sharepoint-buckets)
    SP-->>NJ: PDF / DOCX blobs
    NJ->>NJ: extract text, render template
    NJ->>AN: POST /v1/messages (reuses existing caching + retry)
    AN-->>NJ: completion + usage
    NJ->>Run: INSERT wmkf_ai_run (promptversion, tokens, cost, rawOutput)
    NJ-->>PA: {summary, run_id}
    PA->>Dyn: PATCH akoya_request.wmkf_ai_summary
```

**What the diagrams make visible**

- Full composition has one fewer network hop on the happy path (Anthropic ⇄ PA directly), but PA has to re-implement file extraction, `cache_control` JSON assembly, retry/backoff, and cost calculation. PDF extraction already requires a Next.js helper, which softens the "no Next.js runtime dependency" argument considerably.
- Hybrid keeps every mechanic that already works in one tested codepath (`file-loader.js`, `claude-reviewer-service.js` retry, prompt caching) and adds exactly one cross-boundary POST. PA still fetches the prompt row itself, so `wmkf_ai_promptversion` provenance stays visible in PA's audit trail — that's the thing hybrid is careful not to give up.
- In both flows, `wmkf_ai_run` is written by whoever makes the Anthropic call. Logging lives next to the call, never on the trigger side. This matters because the rawOutput + token counts come back with the completion response.
- A "hybrid lite" variant exists (PA passes only `{prompt_name, request_id}` and lets Next.js fetch the prompt row too). That collapses PA's audit visibility back to just "I called Next.js," which is why the diagram above keeps the prompt fetch on PA's side.

---

## Out of scope for this design doc

- Prompt eval / A-B testing (covered separately — the "historical replay" use case for batch evaluation tooling)
- Prompt library / shared fragments (e.g. common grant-context preamble) — worth discussing but deferring until v1 ships
- Migrating the other 13 prompts — in-scope for a follow-up once the pattern is proven on Phase I + Compliance
