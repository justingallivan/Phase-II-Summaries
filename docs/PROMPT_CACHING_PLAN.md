# Prompt Caching Plan

**Created:** 2026-04-17 (Session 103)
**Status:** Partial — Dynamics Explorer fixed; other work queued

## Context

Anthropic's prompt cache stores a prefix of an API request on their servers with a 5-minute TTL (or 1 hour at 2x write cost). Writes cost 1.25x base input; reads cost 0.1x base input. Break-even is ~2 reads within the TTL. Minimum cacheable prefix: 1024 tokens (Sonnet/Opus), 2048 tokens (Haiku).

Caching is activated by placing `cache_control: { type: 'ephemeral' }` on a content block. Everything *before* that block in the order `tools → system → messages` is cached together.

## Baseline data (as of 2026-04-17)

Queried `api_usage_log` for all apps, past 365 days:

| App | Calls | Cache writes | Cache reads | Uses `cache_control`? |
|---|---:|---:|---:|---|
| dynamics-explorer | 893 | 0 | 0 | ❌ (fixed in Session 103) |
| expertise-finder | 387 | 0 | 0 | ❌ |
| virtual-review-panel | 343 | 0 | 0 | ❌ |
| batch-phase-ii | 98 | 0 | 0 | ❌ |
| multi-perspective-evaluator | 58 | 0 | 0 | ❌ |
| grant-reporting | 56 | 0 | 0 | ❌ |
| peer-review-summarizer | 25 | 0 | 0 | ❌ |
| batch-phase-i | 20 | 0 | 0 | ❌ |
| expense-reporter | 18 | 0 | 0 | ❌ |
| dynamics-explorer-export | 14 | 0 | 0 | ❌ (fixed in Session 103) |
| qa | 9 | 142K tok | 640K tok | ✅ |
| refine | 1 | 0 | 0 | ❌ |

Only Q&A had caching wired up before Session 103. Sample there is tiny (9 calls) but when active, reads were ~4.5× writes in tokens — cache paid for itself every time.

## Done in Session 103

### `pages/api/dynamics-explorer/chat.js`
- `callClaude` (main chat): `system` converted to array form with `cache_control: { type: 'ephemeral' }`
- `callClaudeBatch` (export): same treatment
- Both `logUsage` calls now pass `cacheCreationTokens` / `cacheReadTokens`
- Zero behavior change; billing-only change
- Expected to be the single biggest real-dollar saving in the system once validated (893-call volume)

**Verification step:** after a few real sessions, re-run the usage query to confirm cache reads are being logged for `dynamics-explorer`.

## Forward plan

### Tier 1 — Quick wins (next session)

#### 1. `expertise-finder/match.js` — highest ROI single change
- **Current state:** has `SYSTEM_PROMPT` + `system: SYSTEM_PROMPT` in fetch call (line 193), but the cacheable content is in the wrong place. The roster (dozens of members, est. 2–5K tokens, stable for hours/days) is concatenated into the user message via `createMatchingPrompt(proposalText, roster, notes)`.
- **Fix:** Move roster into the system block with `cache_control`. Roster is stable across all users and all matches, so every call after the first cache-write within the TTL becomes a read.
- **Effort:** ~1 hour (prompt refactor + cache marker + log cache tokens)
- **Expected win:** Very high. 387 calls/year volume + large stable prefix.
- **Risk:** Minimal — roster members change, but TTL is short enough that cache rebuilds naturally.

#### 2. `virtual-review-panel` (via `lib/services/multi-llm-service.js`) — simple version
- **Current state:** `_callClaude` passes `systemPrompt` separately (line 249–251) but no `cache_control`. The `SYSTEM_PROMPT` (shared across stages) is probably small, and the large cacheable content (`proposalText` + `intelligenceBlock`) is inside the user `prompt` string.
- **Simple fix:** Convert `body.system = systemPrompt` to array form with `cache_control`. Small win (only caches the persona) but trivial.
- **Also:** `logUsage` calls (lines 151, 168, 183) need `cacheCreationTokens` / `cacheReadTokens` fields.
- **Effort:** ~15 min.
- **Expected win:** Modest (small system prompt).

### Tier 2 — Structural changes (medium-term)

#### 3. `virtual-review-panel` full fix
- **The bigger win:** restructure prompts so `proposalText` + `intelligenceBlock` become a separate content block on the user message with its own `cache_control` marker. Same document is hit 3–4 times per panel run within seconds.
- **Effort:** ~half day. Touches prompt builders in `panel-review-service.js` and `_callClaude` in `multi-llm-service.js` (needs to accept structured content blocks, not just a string).
- **Expected win:** Large per run. 343 calls/year.

#### 4. `grant-reporting/extract.js`
- **Current state:** no system prompt at all (line 446: `messages: [{ role: 'user', content: prompt }]`). Proposal + report + instructions all in one string.
- **User pattern:** extract → review → regenerate-goals / regenerate-field. Same documents, different instructions.
- **Fix:** Split instructions → system + docs → user content block with `cache_control` on the docs block. Regenerate-mode calls become cache-hot.
- **Effort:** ~2 hours.
- **Expected win:** Moderate (56 calls/year; regenerate paths benefit most).

#### 5. `evaluate-multi-perspective.js`
- **Current state:** 5 Claude calls per run (3 perspectives + integrator + summary), all `messages: [{role: 'user', content: prompt}]` with no system prompt.
- **Shared context:** `initialAnalysis` + `literatureResults` + `framework` are big and stable within a run.
- **Fix:** Pull shared context into a cached content block; each perspective's specific instructions become the tail of the user message.
- **Effort:** ~3 hours (5 prompt builders to restructure).
- **Expected win:** High per run, but only 58 calls/year. Defer.

### Tier 3 — Naturally handled by prompt-storage migration

#### 6. `batch-phase-ii` / `batch-phase-i` / `process.js`
- **Today:** each call is a different proposal; the giant instruction block is concatenated with proposal text into one user message. No shared prefix across items.
- **When system/user split happens** (part of `wmkf_prompt_template` migration): instructions → cached system, proposal → user. A batch of 10 proposals inside 5 minutes becomes 1 write + 9 reads on the instruction block for free.
- **Effort:** zero additional beyond the migration.
- **Expected win:** Moderate today (98 + 20 calls/year). Will grow substantially when PowerAutomate backend automation fires sequential proposals through these flows.

### Not worth it

- **`peer-review-summarizer`** (25 calls) — one-shot per doc
- **`expense-reporter`** (18 calls) — Haiku, small prompts, likely under 2048-token minimum
- **`refine`** (1 call) — negligible volume

## Usage-logging gap

Several apps call Claude but don't pass `cache_creation_input_tokens` / `cache_read_input_tokens` through to `logUsage`. Even once caching is enabled for them, the usage log will show zeros unless these fields are added. Files confirmed missing the fields:

- `pages/api/expertise-finder/match.js` (fix alongside cache enablement)
- `lib/services/multi-llm-service.js` (fix alongside cache enablement)
- `pages/api/grant-reporting/extract.js` (fix alongside cache enablement)
- `pages/api/evaluate-multi-perspective.js` (fix alongside cache enablement)
- `pages/api/process.js` (fix when system/user split happens)

Pattern to use everywhere:
```js
logUsage({
  // ...existing fields...
  cacheCreationTokens: usage.cache_creation_input_tokens || 0,
  cacheReadTokens: usage.cache_read_input_tokens || 0,
});
```

## Non-obvious gotchas

1. **Cache TTL resets on read.** Each cache hit extends the TTL by 5 min (standard) or 1 hour (extended). Long agentic sessions keep the cache warm indefinitely.
2. **Haiku requires 2048-token minimum.** Dynamics Explorer uses Haiku 4.5 — tools + system comfortably exceed this, but smaller system prompts on Haiku apps may silently fail to cache.
3. **Order matters.** `tools → system → messages`. A `cache_control` marker on `system` caches tools + system together (good). A marker on a content block inside `messages` caches everything before it, including tools + system.
4. **Up to 4 cache breakpoints per request.** Useful for incremental caching in growing conversations (mark the last assistant turn on each round so the growing history stays cached).
5. **Marker placement doesn't change behavior** — it's purely a billing hint. Anthropic silently ignores it if the prefix is too short or cache is disabled.

## Metrics to track post-rollout

After each Tier 1/2 change, re-query `api_usage_log` for the affected app. Expected pattern:
- **Cache hits per call** (reads / calls) should climb toward ~1.0 for agentic/multi-call apps
- **Regular input tokens** per call should drop sharply (now flowing through cache reads instead)
- **Estimated cost** per call should decrease — visible in the admin dashboard usage view
