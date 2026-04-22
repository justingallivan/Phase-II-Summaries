# Session 106 Prompt

## Session 105 Summary

Mixed-bag session — shipped M7 spend monitoring, fixed a silently-broken cache-token logger that cost real money for a month, added a generic `updateIfEmpty` writeback helper, and ran the v1-vs-v2 Phase I comparison that turned into a deeper investigation of native PDF input. Output is a Connor-facing brief on PDF processing for the backend.

### What Was Completed

1. **M7 spend monitoring** (`04ce74a`)
   - "Today's Spend" tile on `/admin` (total + top 3 apps + top 3 users)
   - `/api/cron/spend-check` hourly: daily-threshold alert + low-balance email via `DynamicsService.createAndSendEmail`, gated on anchor env vars
   - `scripts/update-balance-anchor.sh` for top-up syncing across `.env.local` + Vercel
   - `stats.js` adds `today` block + relabels backend (NULL `user_profile_id`)
   - Six env vars (`DAILY_SPEND_ALERT_CENTS`, `LOW_BALANCE_ALERT_CENTS`, `ANTHROPIC_BALANCE_ANCHOR_CENTS`/`_DATE`, `SPEND_ALERT_EMAIL_TO`/`_FROM`) deployed across Production/Preview/Development

2. **Dynamics-explorer cache fix** (`5d53a32`)
   - `parseClaudeStream` was silently dropping `cache_creation_input_tokens` and `cache_read_input_tokens` on `message_start.message.usage`. 30 days, 90 calls, zero cache hits in DB despite `cache_control` being sent.
   - Two-line fix; verified live: 11-call session shows cache_create=11784 then cache_read ~12K across 10 calls
   - Bug only affected the streaming path (= 100% of dynamics-explorer traffic). Non-streaming `callClaudeBatch` was already correct.

3. **`DynamicsService.updateIfEmpty()` helper** (`58b77b7`)
   - Composes read + empty-check + ETag-guarded PATCH
   - Returns discriminated `{ ok, reason }` so callers translate to HTTP themselves
   - `summarize.js` intentionally not migrated — pre-flight-before-Claude saves token spend on conflict

4. **PDF input research + Connor doc** (`3653f42`)
   - 8 May 2025 Phase I proposals run through v1 vs v2 comparison harness (Stanford, Hopkins, Harvard, Mayo, St. Jude, etc.)
   - Native PDF document-block measured on SUNY Stony Brook (1001507): $0.13 vs $0.05 text-only — 3× per call but $13/year delta at our volume
   - **PDF caching verified working**: `cache_control` on the document block → 90% cost cut and 3× latency cut on warm calls (38s → 12s)
   - For 3-stage pipeline plan: 1 cold + 2 warm = $0.20/proposal vs $0.39 fresh (48% savings) AND ~60s vs ~120s latency
   - **`docs/PDF_INPUT_FOR_BACKEND.md`** is the Connor-facing brief: measurements, recommended PA flow, Anthropic constraints (32 MB request, 600 pages), Files API guidance, open questions for him
   - Don't build a PDF-rendering pipeline. Anthropic does it server-side.

5. **Process correction in memory**
   - I conflated "Concepts" stage submissions (Dec 2025) with Phase I proposals (Apr 2026), wasting a harness run
   - New memory `feedback_concepts_vs_phase_i.md` enforces hard-exclude of `/concept/i` files from Phase I prompt pipelines

6. **Doc clarifications for Connor** (in `04ce74a`)
   - Expanded `wmkf_prompt_template` schema in `docs/CONNOR_QUESTIONS_2026-04-15.md` with per-field backend-use explanations + runtime-flow block
   - Split proposed `wmkf_body` into `wmkf_system_prompt` + `wmkf_user_prompt` to match Claude API + enable caching

### Commits

- `04ce74a` — M7 spend monitoring + prompt-table schema clarifications
- `5d53a32` — Fix dynamics-explorer cache token capture in streaming path
- `58b77b7` — Add DynamicsService.updateIfEmpty helper for AI writeback
- `3653f42` — PDF input research: cost/cache findings + backend doc

## Side observation worth a follow-up

Our existing `summarize-v2.js` puts `cache_control` only on the system block and got 0 cache hits across 8 sequential calls. The PDF cache test shows the cache fires reliably when `cache_control` is on the document block. So either (a) v2's system prompt is below the cache threshold for some reason, or (b) cache breakpoints behave differently when there's no document block to anchor them. Worth a focused diagnosis next session — would unlock the same 90% savings on the v2 path that PDF caching gave us.

## Potential Next Steps

### 1. v2 cache diagnosis
Print the actual system prompt token count at runtime; try moving `cache_control` to the user message; verify with a back-to-back two-call test. ~30 min.

### 2. Build summarize-v3 (native PDF input + caching)
The PDF research recommends this as the path forward for backend processing. Implementation is roughly summarize-v2 + `document` block + `cache_control` on it. Could ship as a second toggle on `/phase-i-dynamics` for further validation before backend handoff.

### 3. Connor sync
Walk through `docs/PDF_INPUT_FOR_BACKEND.md` together. Open questions in section "Open questions for Connor" — Encodian/Adobe licensing, PA HTTP body cap, Files API beta header, multi-pass cache window timing.

### 4. Multi-pass pipeline cost modeling
With cached-PDF numbers in hand, redo the staged-review-pipeline cost projections (`project_staged_review_pipeline.md`). Expectation: ~50% cheaper and ~50% faster than the un-cached estimate.

### 5. Files API prototype
For PDFs > 24 MB raw or workflows that span > 5 min between calls, `cache_control: ephemeral` evaporates. Prototype a Files API path that uploads the PDF once, gets a `file_id`, and references it across calls. Useful even if base64 covers 95% of our actual proposals.

### 6. Run the harness against a single research proposal with text-only vs native PDF
SUNY's PDF was figure-heavy; we measured cost but never directly compared output quality to confirm the figures changed the summary in any meaningful way. One-shot A/B comparison would settle whether vision is worth the 3× cost.

## Open Audit Items (carryover, all blocked)

| # | What | Blocker |
|---|------|---------|
| M4 | Prompt-editor governance for `wmkf_prompt_template` | Connor's table |
| L1 | Expertise Finder roster CRUD superuser check | Product call |
| I1 | `overwrite=true` flag role gating | Identity reconciliation |
| I4, I6 | Token-cache multi-tenant keying / RFC 5987 | Cleanup-only |

## Key Files Reference

| File | Purpose |
|------|---------|
| `docs/PDF_INPUT_FOR_BACKEND.md` | **New.** Connor brief with measurements, PA flow, constraints, open questions |
| `docs/CONNOR_QUESTIONS_2026-04-15.md` | Expanded `wmkf_prompt_template` schema (system/user split, per-field explanations) |
| `pages/api/cron/spend-check.js` | Hourly daily-threshold alert + low-balance email (gated) |
| `pages/api/admin/stats.js` | New `today` block + Backend label |
| `pages/api/dynamics-explorer/chat.js` | 2-line cache token capture fix in `parseClaudeStream` |
| `lib/services/dynamics-service.js` | New `updateIfEmpty()` helper (composes ETag-guarded write) |
| `scripts/update-balance-anchor.sh` | One-shot `.env.local` + Vercel sync after Anthropic top-up |
| `scripts/compare-phase-i-v1-v2.js` | v1 vs v2 Phase I prompt comparison harness |
| `scripts/test-suny-pdf-cache.js` | PDF caching verification (90% savings confirmed) |
| `scripts/test-suny-pdf-native.js` | One-shot text-vs-native-PDF cost comparison |
| `scripts/find-2025-phase-i.js` | Discover real Phase I candidates around the May 1, 2025 deadline |
| `tmp/phase-i-comparison/` (gitignored) | Per-request v1+v2 summary comparison files for human review |

## Testing

```bash
# Syntax-check edited files
node --check pages/api/cron/spend-check.js
node --check pages/api/admin/stats.js
node --check pages/api/dynamics-explorer/chat.js
node --check lib/services/dynamics-service.js

# Re-run PDF cache verification (uses /tmp/suny-stonybrook-phase-i.pdf)
node scripts/test-suny-pdf-cache.js
# Expect: cache_create ~38K on call 1, cache_read ~38K on call 2, 90% cost cut

# Trigger spend-check manually (dev mode bypasses CRON_SECRET)
curl http://localhost:3000/api/cron/spend-check

# Confirm dynamics-explorer cache logging now works
# After running a chat session, query api_usage_log for cache_read_tokens > 0
```

## Session hand-off notes

- Tree clean, 4 commits ahead of origin until pushed.
- `tmp/phase-i-comparison/` has the v1 vs v2 outputs for 8 proposals + 1 v3 (native PDF) on SUNY — read these to make the qualitative call on v1 vs v2 prompt direction.
- Anchor vars deployed but the actual `ANTHROPIC_BALANCE_ANCHOR_CENTS` value was set to 10827 (= $108.27). Update via `scripts/update-balance-anchor.sh` after each top-up.
- The "v2 caching is broken" finding from this session is real and unresolved — flagged as next-session item #1.
- Today's date: 2026-04-21.
