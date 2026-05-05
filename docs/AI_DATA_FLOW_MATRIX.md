# AI Data Flow Matrix

Last updated: 2026-05-04

## Purpose

This document maps where the application sends data to external AI providers. It assumes Foundation staff are authorized to use these applications in accordance with Foundation data-protection and data-sharing policies. The purpose here is not to second-guess staff intent, but to identify code-level threats: places where bugs, missing guardrails, weak defaults, logging, retention, provider drift, or overly broad serialization could send or persist more data than the staff user intended.

It complements `docs/API_ROUTE_SECURITY_MATRIX.md`: that document answers "who can call this route," while this one answers "what the code sends or stores once an authorized caller does."

## Review Legend

| Risk | Meaning |
|---|---|
| Low | Narrow, predictable payloads with little chance of accidental over-sharing or sensitive persistence. |
| Medium | Payloads include staff-provided proposal/report/reviewer/CRM context, but the code path is bounded and understandable. |
| High | Code path can send broad raw documents, high-fidelity CRM records, multi-provider payloads, or raw outputs to durable storage; risk is about implementation blast radius, not staff intent. |

## Cross-Cutting Observations

- `LLMClient` is the preferred Anthropic wrapper. It uses `safeFetch`, timeout/retry handling, redacted errors, and token/cost usage logging.
- `api_usage_log` stores usage metadata: user, app, model, token counts, cost estimate, latency, status, and error message. It does not intentionally store prompts or raw proposal text.
- Some Dynamics AI-run paths intentionally store raw model output in Dataverse, especially `executePrompt()` and grant-reporting helpers. Output can contain proposal/report-derived content and should be treated as sensitive.
- Several older service paths still call Anthropic with raw `fetch` instead of `LLMClient` / `safeFetch`.
- Many proposal workflows send up to 80,000-100,000 characters of extracted text. That may be appropriate for staff workflows, but the code should make the size and source of transmitted text explicit, bounded, and testable.
- The Virtual Review Panel may send the same proposal to multiple providers: Anthropic, OpenAI, Google, and Perplexity depending on configuration. The code threat is provider-boundary drift: a config/UI change could broaden provider exposure without being obvious to operators.

## Initial Findings

### P1 - Large document payloads lack a shared, explicit send boundary

Several routes send large extracted proposal/report payloads to external models. This includes reviewer finding, proposal summaries, Phase I/II summaries, grant reporting goals assessment, virtual review panel, and Q&A. This is an authorized staff workflow, but the implementation currently expresses limits inconsistently across routes and prompt helpers.

Code threat: future changes can accidentally raise limits, send the wrong file text, duplicate payloads across multiple calls, or include fields the route did not actually need.

Recommended next step: define a small shared helper or convention for AI payload construction that records source, character limit, truncation marker, and data class. Use it in high-volume routes so reviewers can see the boundary in code.

### P1 - Dynamics Explorer can send verbose CRM records into an agentic loop

`/api/dynamics-explorer/chat` sends role-gated CRM query/search results to Claude, and export processing can batch CRM records through Claude. Restrictions shape the accessible table/field set, but the serialization layer can still pass high-fidelity records wholesale.

Code threat: a tool, query expansion, or future schema change could include more CRM fields than the user intended to ask about.

**Status (2026-05-04): deferred — watch item.** Discussed in Session 130. The realistic threat model for this user base (16 staff, all with full Dataverse access by design; flows curated by Justin and Connor) is not data leak — it is context pollution / token cost / AI-summary loopback if `wmkf_ai_summary` or similar AI-generated long-text fields enter Claude's context as "ground truth" on later queries. None of those symptoms have been observed yet because `wmkf_ai_summary` is new and not yet populated at scale. Building a serialization layer now would be preventive work for an unproven failure mode, and the realistic mitigation (per-table default `select` when Claude omits one) requires system-prompt tuning to avoid regressing answer quality.

Revisit triggers:
- Claude citing prior `wmkf_ai_summary` / `wmkf_ai_rawoutput` content as authoritative input on a fresh query (loopback symptom).
- Dynamics Explorer token costs creeping up noticeably as more long-text fields land on `akoya_request` or related tables.
- A new tool or query expansion materially broadens what records enter the agentic loop.

If revisited, the design proposal is in Session 130 conversation: per-table default `select` for `query_records` / `get_entity` / `get_related` when Claude omits one, denylist-style for AI-generated and narrative long-text fields, system-prompt updates to teach Claude when to explicitly request the excluded fields.

### P1 - Virtual Review Panel provider boundaries are configuration-sensitive

`/api/virtual-review-panel` can send full proposal text to multiple providers through `MultiLLMService`, including Claude, OpenAI, Gemini, and Perplexity. This materially expands vendor exposure compared with Claude-only routes.

Code threat: a default provider list or environment variable change can broaden where payloads go without a code reviewer seeing the impact.

Recommended next step: add an explicit provider allowlist/config surface and log provider set per run. Consider tests that assert default provider behavior.

### P2 - Legacy/direct Anthropic fetch paths bypass the canonical wrapper

`ClaudeReviewerService`, `ContactEnrichmentService.claudeWebSearch`, `health-checker`, and the old module demo use direct `fetch` calls. Some of these are low sensitivity, but the pattern bypasses `LLMClient`'s timeout, safeFetch, retry, and redaction behavior.

Recommended next step: migrate remaining production Claude callers to `LLMClient` or `safeFetch` as appropriate. The reviewer-finder analysis path should be prioritized because it sends raw proposal text.

### P2 - AI-run logs persist generated outputs with large limits

`executePrompt()` stores `wmkf_ai_rawoutput` up to 1,000,000 characters in Dataverse. Grant reporting also stores parsed extraction/goals outputs through `DynamicsService.logAiRun`. These are useful audit records, but may contain sensitive derived proposal/report content.

Code threat: a prompt output can unexpectedly include copied input text or sensitive fields and then persist far longer or wider than the original route response.

Recommended next step: confirm Dataverse permissions and retention for `wmkf_ai_run`. Add a per-prompt raw-output retention mode so high-volume prompts can store structured outputs or hashes instead of full raw output where appropriate.

### P3 - Error/log analysis flow is relatively well minimized

`/api/cron/log-analysis` redacts log entries before sending them to Claude and redacts again before storing alert output. This is a good pattern to reuse for other flows.

Recommended next step: use this as the model for "redact before external AI, redact again before persistence."

## Data Flow Matrix

| Area / Route | Provider(s) | Data Sent | Volume / Limits | Persistence After Call | Current Controls | Risk | Notes / Hardening Ideas |
|---|---|---|---|---|---|---|---|
| `/api/reviewer-finder/analyze` via `ClaudeReviewerService.analyzeProposal` | Anthropic Claude | Proposal text from upload/blob, additional notes, excluded names, reviewer count/settings | Body limit 10 MB; service prompt likely sends large proposal text | Usage metadata; generated proposal info/reviewer suggestions returned to client and later saved by user flows | App access, rate limit, `safeFetch` for blob input | High | Priority migration target: direct Anthropic `fetch` in `ClaudeReviewerService`; add explicit input cap and payload-construction helper. |
| `/api/reviewer-finder/generate-emails` | Anthropic Claude | Candidate/reviewer details, proposal info, base email body | Per-email prompt; `maxTokens: 512` | Generated email returned/saved; usage metadata | App access; uses `LLMClient` | Medium | Sends reviewer + proposal context. Reasonable, but keep prompt fields tight. |
| `/api/reviewer-finder/enrich-contacts` / `ContactEnrichmentService.claudeWebSearch` | Anthropic Claude with web search | Candidate name and institution | Minimal prompt; `max_tokens: 256`; one web search | Enriched contact info returned/saved | App access, rate limit, server-side credentials only | Medium | Direct Anthropic `fetch`; candidate PII/name sent to Claude/web search. Migrate to `LLMClient` or `safeFetch`. |
| `/api/process`, `/api/process-legacy` | Anthropic Claude | Extracted Phase II proposal text; filename; generated summary reused for structured extraction | Prompt utilities truncate proposal text, commonly up to 100k chars | Summary and structured data returned; extracted text included in response object | App access, rate limit, `LLMClient`, `safeFetch` for blob input | High | Main code risk is returning full extracted text in API response and duplicating it across summary + extraction calls. Confirm UI need or remove from response. |
| `/api/process-phase-i` | Anthropic Claude | Extracted Phase I proposal text | Similar to batch proposal summarizer; structured extraction second call | Summary/structured data returned | App access, `LLMClient` | High | Same minimization issue as `/api/process`. |
| `/api/process-phase-i-writeup` | Anthropic Claude | Extracted Phase I writeup/proposal text | Similar raw proposal prompt + structured extraction | Writeup/structured data returned | App access, `LLMClient` | High | Same minimization issue as `/api/process`. |
| `/api/process-peer-reviews` | Anthropic Claude | Peer review text and possibly proposal/review context | Review-analysis prompt plus question extraction | Analysis/questions returned | App access, `LLMClient` | Medium | Review text can contain sensitive reviewer opinions. Confirm retention and output handling. |
| `/api/qa` | Anthropic Claude with web search tool | Proposal text up to 80k chars in system prompt, summary text, filename, recent conversation, user question | System prompt caches proposal context; last 6 messages retained | Usage metadata; streamed answer/sources returned | App access, rate limit, `LLMClient`, prompt cache, conversation trimming | High | Good conversation trimming. Code risk is combining internal proposal context with web search tool in the same call. Consider a mode flag for tool-enabled vs. internal-only Q&A. |
| `/api/refine` | Anthropic Claude | Existing generated summary and user feedback | `maxTokens: 3000` | Refined summary returned; usage metadata | App access, `LLMClient` | Medium | Does not send raw proposal unless summary contains it. Lower risk than original summarization. |
| `/api/analyze-funding-gap` | Anthropic Claude | Proposal text for funder/funding-gap extraction and analysis | Text prompt likely up to 100k chars | Funding extraction/analysis returned; usage metadata | App access, `LLMClient` | High | Raw proposal to model. Candidate for structured pre-extraction/minimized sections. |
| `/api/analyze-literature` | Anthropic Claude | Literature search results, user topic/proposal context, synthesis prompts | Multiple calls, 4k-6k max output | Analysis returned; usage metadata | App access, `LLMClient` | Medium | Depends on user-supplied context. Search results mostly public; proposal context may raise risk. |
| `/api/evaluate-multi-perspective` | Anthropic Claude | User concept/proposal text and perspective prompts; optional image/vision payloads | Multiple model calls; 1.5k-3.5k max output | Evaluation returned; manual usage logging | App access, `LLMClient` | Medium | Clarify whether users paste non-public proposal material. |
| `/api/phase-i-dynamics/summarize` | Anthropic Claude | Proposal file text loaded from SharePoint/upload plus request GUID context | Large proposal text sent to prompt; max output default | Writes summary to `akoya_request.wmkf_ai_summary`; logs AI run/usage | App access, rate limit, overwrite guard, optimistic concurrency | High | Code risk is wrong-record writeback or accidental overwrite; concurrency guard is good. Add shared payload cap convention. |
| `/api/phase-i-dynamics/summarize-v2` via `executePrompt()` | Anthropic Claude | `proposal_text` override truncated to 100k chars plus prompt variables from Dynamics/SharePoint | `proposal_text: fileLoad.text.substring(0, 100000)` | Writes target fields; stores `wmkf_ai_run` raw output up to 1M chars | App access, executor guard, overwrite controls, Dataverse audit | High | Good centralized architecture. Review prompt variable declarations and raw output retention. |
| `lib/services/execute-prompt.js` | Anthropic Claude | Prompt variables from Dynamics, SharePoint text extraction, caller overrides | Variable `maxChars` supported; call body is one user message | Writes outputs to Dynamics; creates AI-run audit row with raw output | Centralized prompt executor, output guards, Dataverse audit | High | Add classification to prompt definitions: allowed data classes, max chars, raw-output retention mode. |
| `/api/grant-reporting/extract` | Anthropic Claude | Grant report text, proposal text for goals assessment, authoritative Dynamics header fields, current narratives | Extraction `maxTokens: 4096`; goals assessment includes proposal + report text | Returns structured extraction/goals; logs usage and AI-run outputs | App access, rate limit, `LLMClient`, file loader | High | Code risk is multi-document prompt growth and raw-output persistence. Add explicit file source/length metadata and output retention policy. |
| `/api/dynamics-explorer/chat` | Anthropic Claude with tool loop | User question, recent conversation, tool definitions, CRM query/search/list document results, possible exported record batches | Streaming `maxTokens: 2048`; batch processing `maxTokens: 4096`; result char caps per tool | Dynamics query log stores query params/counts; usage metadata | App access, Dynamics roles/restrictions, result char caps, conversation trimming | High | Highest CRM-specific code target. Add tool-result field serializer and sensitive-field masking before model context. |
| `/api/virtual-review-panel` and `PanelReviewService` | Anthropic, OpenAI, Gemini, Perplexity | Proposal text, extracted claims, PI/team intelligence, search results, structured review prompts | Long multi-stage prompts; multi-provider; panel DB stores text hash not raw proposal | Panel results/items/costs stored; provider outputs persisted | App access, rate limit, provider availability checks | High | Code risk is provider-set drift. Add explicit provider allowlist and persist provider set per run. |
| `MultiLLMService` | Anthropic, OpenAI, Gemini, Perplexity | Arbitrary prompt/system prompt from caller | Defaults `maxTokens: 16384`; timeout via `Promise.race` | Usage metadata if logging context supplied | `safeFetch` for provider calls | High | Shared transport for full proposal review. Consider request aborts instead of Promise.race and provider-level data classification. |
| `/api/integrity-screener/screen` / `IntegrityService.analyzeWithHaiku` | Anthropic Claude | Search result titles, URLs, snippets for applicant/research integrity analysis | Top search results; `maxTokens: 1000` | Screening results/history through service | App access; `LLMClient` | Medium | Mostly public search snippets, but query subject is person/institution-sensitive. |
| `/api/cron/log-analysis` | Anthropic Claude | Redacted Vercel error summaries: timestamp, path, message | Up to 50 entries; `maxTokens: 1024` | Alert message/metadata stored; output redacted again | Cron secret, input redaction, output redaction, `LLMClient` | Low | Good reference pattern. |
| `lib/utils/health-checker.js` | Anthropic Claude | Static "Hello" health-check prompt | `max_tokens: 10` | Health status only | Cron/admin health surface | Low | Direct `fetch` acceptable risk, but can migrate to `safeFetch` for consistency. |
| `lib/services/claude-reviewer-service.js` | Anthropic Claude | Reviewer-finder prompts containing raw proposal text, reviewer criteria, notes/exclusions | Large prompt; service-level retry/fallback | Usage metadata when logging context supplied | Called behind reviewer-finder app access | High | Direct `fetch`, no `safeFetch`, no canonical timeout. Priority migration target. |
| `lib/services/contact-enrichment-service.js` | Anthropic Claude web search | Candidate name and institution | Minimal prompt, one web search | Contact enrichment result | Server-side credentials only | Medium | Direct `fetch`; migrate to canonical wrapper/tool handling where feasible. |
| `lib/services/multi-llm-service.js` | Anthropic/OpenAI/Gemini/Perplexity | Arbitrary caller prompt, often proposal review prompts | Large max-token default | Usage metadata | `safeFetch`; provider env keys | High | Exposure depends entirely on caller. Needs caller-level matrix references. |
| `modules/expertise_matching/src/reviewer_matcher.jsx` | Anthropic Claude | Browser-side prompt for local/module reviewer matching | Demo/module code path, not main API | Unknown | Direct browser/component fetch | Medium | Confirm whether this module is production-reachable. If not, archive or document as non-production. |

## Recommended Hardening Sequence

1. **Reviewer Finder proposal analysis**
   - Migrate `ClaudeReviewerService` to `LLMClient`.
   - Add explicit max input characters and document it.
   - Add tests around the payload cap/helper.

2. **Dynamics Explorer tool-result serialization**
   - Add a serializer that filters/masks CRM records before they enter model messages.
   - Make allowed fields explicit per tool and role.
   - Add tests that sensitive fields are not sent for read-only users.

3. **Prompt Executor data classification**
   - Extend Dynamics prompt definitions with data class, `maxChars`, and raw-output retention policy.
   - Add a check that `proposal_text` variables must declare `maxChars`.

4. **Virtual Review Panel provider policy**
   - Add provider allowlist configuration and default to the minimum provider set.
   - Persist the provider set used for each run.

5. **AI-run retention and raw-output review**
   - Confirm who can read `wmkf_ai_run`.
   - Decide whether raw outputs should be retained for all prompts.
   - Add cleanup/retention policy if needed.

## Open Questions

- Where should payload limits live: per route, prompt definition, or shared helper?
- Should web search/tool-enabled calls be explicitly separated from internal-only model calls in code?
- What provider set should Virtual Review Panel default to in production?
- Who can read `wmkf_ai_run` raw outputs in Dataverse, and how long should those outputs live?
- Are summary-page extraction and Dynamics-stored abstracts sufficient for reviewer-finder analysis in some cycles?
