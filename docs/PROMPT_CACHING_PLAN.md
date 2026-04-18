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

### Phase I A/B experiment (2026-04-17)

Ran v1 (monolithic user message) vs v2 (system/user split fetched from Dynamics) 3 trials each on a 3-page Phase I proposal (`Keck_RifeLevin_Phase1 2023.docx`, request 996637). See `scripts/ab-phase-i-prompts.js`.

| Metric | v1 | v2 |
|---|---|---|
| Output chars (avg) | 5,812 | **5,210 (−10%)** |
| Output tokens (avg) | 1,107 | 1,012 |
| Latency (avg) | 28.5s | 25.9s |
| Input tokens (regular) | 4,325 | 4,373 |
| Cache write / read tokens | 0 / 0 | **0 / 0** |

**Key findings:**
1. **All 3 v2 trials produced shorter output than all 3 v1 trials** — real effect, not noise. The split appears to produce consistently tighter summaries (same factual content, ~10% fewer chars). "Tighter = better" is subjective, but the effect is real.
2. **Cache did not fire for Phase I.** System block was ~1,650 tokens — below Sonnet 4.6's empirical 2,048 threshold. Confirmed by a follow-up binary search: 1,210-token prompts don't cache, 2,403-token prompts do.
3. **This does not invalidate the caching argument for other apps** — Dynamics Explorer, Expertise Finder, and chained workflows all exceed the threshold. It does mean Phase I alone gains nothing from caching today, and the system/user split should be justified on other grounds for small-system apps (editor-safety, mix-and-match, tighter output).

**Followup:** the experiment was on a .docx (text-only). Repeat with raw PDF + images once we wire the vision path to get numbers for the user-side scenario.

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
2. **Empirical Sonnet 4.6 minimum is ~2048 tokens, not 1024.** Anthropic's docs list 1024 for Sonnet/Opus, but a 2026-04-17 experiment on Sonnet 4.6 confirmed no caching fires at 1,210 tokens and caching does fire at 2,403 tokens. Treat **2,048 as the working floor for all current models** until proven otherwise. This was a surprise — previously we'd assumed 1024 and would have mis-planned Phase I caching.
3. **Haiku requires 2048-token minimum** (per docs, and consistent with the empirical Sonnet observation above).
4. **Order matters.** `tools → system → messages`. A `cache_control` marker on `system` caches tools + system together (good). A marker on a content block inside `messages` caches everything before it, including tools + system.
5. **Up to 4 cache breakpoints per request.** Useful for incremental caching in growing conversations (mark the last assistant turn on each round so the growing history stays cached).
6. **Marker placement doesn't change behavior** — it's purely a billing hint. Anthropic silently ignores it if the prefix is too short or cache is disabled.

### Threshold implications for our apps

| App | System block size | Expected cache behavior |
|---|---|---|
| Phase I summarization | ~1,650 tokens (system only) | ❌ **Below threshold today.** `cache_control` is a no-op as currently sized. |
| Dynamics Explorer | Tools + system ≈ 3–5K tokens | ✅ Well above threshold |
| Expertise Finder | System + roster (planned) ≈ 2–5K | ✅ Above, once roster moves to system |
| Virtual Review Panel | SYSTEM_PROMPT only is small (<1K) | ❌ Below — the win requires moving proposal text into a cached content block |
| Batch Phase II | Instructions ~3–4K | ✅ Above once split from proposal text |
| Grant Reporting | Instructions ~2–3K | Borderline — needs measurement |

**Takeaway:** don't assume `cache_control` on a small system block will fire. Measure the system-block token count against the 2,048 floor before counting the savings.

## Proposal size + caching

Two separate effects as proposal documents grow:

1. **System-block threshold does NOT move with proposal size.** The proposal goes in the user message (or a content block inside it), so the system-block token count is independent of proposal length.

2. **Per-call input cost scales linearly with proposal size.** Rough arithmetic for Sonnet 4.6 at current pricing ($3/MTok input):
   - 3-page proposal (~14K chars, ~4.3K tokens): ~$0.013/call
   - 5-page proposal (~23K chars, ~7.2K tokens): ~$0.022/call (+66%)

3. **The real win from bigger proposals is chained caching.** See the next section. If a 5-page proposal is fed into 4 downstream prompts, caching the proposal itself cuts total input cost by ~60%. The savings grow with proposal length × chain depth.

### Image handling — text vs. vision input paths

The A/B experiment on 2026-04-17 was done on a `.docx` proposal which was text-extracted by our `file-loader.js` layer before hitting Claude. So images were effectively stripped upstream. In the production future there are two distinct paths:

| Path | Image handling | Typical input size | Caching implications |
|---|---|---|---|
| **PA backend (automation)** | Connor plans to strip images in a pre-filter before the Claude call | Lean, deterministic, text-only | Smaller cached blocks; may fall closer to the 2,048 threshold |
| **User-side (UI-initiated)** | Unprocessed PDFs likely passed with images intact (via Claude's document API or base64 blocks) | 2–3× larger due to image tokens (~1,000–1,600 tok each) | Cached blocks easily exceed threshold; larger ROI from caching |

Key points:
- **Image tokens ARE cacheable.** Anthropic's cache supports image content blocks — images get cached along with text when they sit behind a `cache_control` marker.
- **User-side has higher cache ROI precisely because of image bloat.** A user-side PDF with 4 figures might be 15K tokens cached once, saving 13.5K × N reads in a chained workflow.
- **Our current experiments don't measure the image path.** All A/B data to date is text-extracted. Before claiming cache ROI on user-side PDFs, rerun the experiment with `pdf` content blocks to get real numbers.

## Workflow chaining cache pattern

The highest-leverage caching opportunity in our roadmap: **ingest-once / chain-downstream workflows** (see `docs/WORKFLOW_CHAINING_DESIGN.md`). A single proposal is fed into multiple sequential prompts (triage → summary → panel review → compliance), and the proposal text is the largest stable element across all of them.

### The pattern

Each downstream call has the same structure:
```javascript
{
  model: '...',
  system: [
    { type: 'text', text: SYSTEM_PROMPT_FOR_THIS_STAGE }
    // ↑ changes per stage; not cached
  ],
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Proposal document:\n\n${proposalText}`,
          cache_control: { type: 'ephemeral' }   // ← cache boundary
        },
        {
          type: 'text',
          text: STAGE_SPECIFIC_INSTRUCTIONS      // ← changes per stage
        }
      ]
    }
  ]
}
```

The cache prefix is: `model + system_for_this_stage + proposal_text`. As long as the model and the system block for a given stage stay stable, the proposal block reads from cache on every call after the first.

**Variant:** put a stable "role + format" system prompt used across all stages into the system block with its own `cache_control`. Then you have two cache segments — one for the role (shared across all stages) and one for the proposal (shared within each stage). Up to 4 breakpoints per request are allowed.

### When to invest

- Chain depth ≥ 2 (anything that calls Claude multiple times against the same document)
- Proposal text is large enough that its tokens dominate the per-call cost
- All calls happen within the 5-minute TTL window (PA-orchestrated flows almost always meet this)

### When NOT to invest

- Single call per document (Phase I summary as currently shipped) — nothing to cache against
- Very short input documents where the proposal tokens aren't the bulk of the cost
- Calls separated by user think-time that breaks the TTL

### Implementation order (when we get here)

1. Start with the first real chain we build (likely the 3-stage triage pipeline per `docs/STAGED_REVIEW_PIPELINE.md`). Wire `cache_control` on the proposal block from day one.
2. Verify cache reads in `api_usage_log` — if not, the proposal size may be below the 2,048 threshold (unlikely for a full proposal but possible for an abstract-only pass).
3. Measure actual savings: compute `(cache_read_tokens × 0.1 + cache_write_tokens × 1.25) / (cache_read_tokens + cache_write_tokens + input_tokens)` for the chain — should approach 0.1–0.15 per call once the cache is warm.

### Complementary strategy: pre-extraction (not caching)

Caching and pre-extraction solve different problems. Caching is **intra-workflow** — same prefix reused across back-to-back calls within the 5-minute TTL. Pre-extraction is **across time** — a first pass captures structured context into Dynamics fields, and every downstream call (days, weeks later, different model) reads the extracts instead of re-ingesting the full proposal.

For the single-phase grant cycle (two cycles out) where staff select proposals for deeper evaluation using only the originally submitted document, pre-extraction is the dominant economics. See `docs/PROPOSAL_CONTEXT_EXTRACTION_PLAN.md` for the field shape, downstream calculations (~42K tokens saved per advancing proposal × 4 LLM providers × N deep-dive calls), and the argument for why this compounds with expensive models.

The two strategies layer:
- **Initial ingest call** (bigger, cache-eligible): runs once, caches to accelerate immediate follow-on if any
- **Extracted fields in Dynamics**: persist, replace most downstream full-proposal reads
- **Downstream calls** operate on ~1.5K tokens of extracted context, fall well below cache threshold individually, but don't need caching because the expensive input has already been compressed to structured fields

## Metrics to track post-rollout

After each Tier 1/2 change, re-query `api_usage_log` for the affected app. Expected pattern:
- **Cache hits per call** (reads / calls) should climb toward ~1.0 for agentic/multi-call apps
- **Regular input tokens** per call should drop sharply (now flowing through cache reads instead)
- **Estimated cost** per call should decrease — visible in the admin dashboard usage view
