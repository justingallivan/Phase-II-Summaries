# PDF Input to Claude — Findings for Backend Architecture

**Audience:** Connor (backend / PowerAutomate work)
**Date:** 2026-04-21
**Context:** Session 105 measured the cost, latency, and quality of three approaches to feeding PDF proposals to Claude. Findings inform the upcoming PA flow design where Dynamics status changes trigger AI processing.

---

## TL;DR

1. **Native PDF input works and costs ~3× more per call than text-only**, but in absolute terms that's **$0.09 extra per Phase I summary** (about $13/year at our volume on Batch API). For a foundation that funds millions in research grants, that's not a budget conversation — it's a quality conversation.
2. **PDF prompt-caching cuts subsequent calls by 90%** and is verified working. The staged 3-pass pipeline drops from $0.39 → $0.20 per proposal **and** from 120s → 60s total latency.
3. **Don't build a PDF→image rendering pipeline.** Anthropic does it server-side. PA just sends the PDF blob.
4. **For backend, prefer the Files API over base64 inline** when (a) PDFs > 24 MB raw, or (b) you'll run multiple Claude passes on the same PDF.
5. **Place `cache_control` on the document block, not just the system prompt** — easy thing to miss.

---

## What we tested

### Approach A — text-only (current production)
Extract text via `pdf-parse`, send as a normal user message. No vision. 19 pages of SUNY Stony Brook proposal → 9.8K input tokens.

### Approach B — native PDF document block
Send the whole PDF as a `document` content block (base64 inline). Claude server-side renders pages as images + extracts text, then processes both. Same SUNY proposal → 38.4K input tokens (3.91×).

### Approach C — selective figure-page rendering
Detect which pages have substantive figures, render only those as PNGs, attach as image blocks alongside text. **We did NOT build this.** Reason: requires `pdfjs-dist` + canvas in Vercel runtime (or Encodian / Adobe / Azure Function in PA). High infra cost relative to the marginal win over Approach B.

---

## Per-proposal cost (Sonnet 4.6 list pricing)

Measured on SUNY Stony Brook (1001507), 14.6 MB PDF, 19 pages, 1 image-heavy section:

| Approach | Input tokens | Output tokens | **Per-call cost** | Latency |
|----------|------:|------:|------:|------:|
| A — text only | 9,809 | 1,157 | **$0.0468** | 26s |
| B — native PDF | 38,393 | 1,264 | **$0.1342** | 41s |
| B + cache (warm) | 38,334 cached + 28 new | 307 | **$0.0162** | 12s |

### Annual cost at Keck volume (~300 Phase I proposals/year)

| Approach | Annual cost | With Batch API (50% off) |
|----------|------:|------:|
| Text only | $14 | $7 |
| Native PDF | $40 | $20 |
| **Vision premium** | **$26** | **$13** |

**Even with no caching at all, the upgrade to full-vision processing costs $13/year extra at our volume.**

---

## Caching mechanics — verified

We sent the same SUNY PDF twice within 5 minutes with `cache_control: ephemeral` on the document block. Results:

| | Call 1 (cold) | Call 2 (warm) |
|---|---:|---:|
| `cache_creation_input_tokens` | **38,334** | 0 |
| `cache_read_input_tokens` | 0 | **38,334** |
| `input_tokens` (uncached) | 22 | 28 |
| Output tokens | 1,094 | 307 |
| **Cost** | $0.16 | **$0.016** |
| Latency | 38s | **12s** |

Two takeaways:

- **The cached prefix covers BOTH the system prompt AND the PDF.** The cache_control tag on the document block makes Anthropic treat everything before the user's text question as cacheable. A follow-up question on the same PDF only pays for output + a tiny per-call uncached input portion.
- **Cache reads also bypass page rendering.** That's where the 38s → 12s latency drop comes from. The PDF was already rendered when the cache was written; subsequent reads serve the rendered pages directly.

### Implication for the 3-stage pipeline

If we run fit-screen → intelligence brief → virtual panel as 3 sequential Claude calls within the cache window:

| Approach | Per-proposal cost | Total latency |
|----------|------:|------:|
| 3 fresh calls (no cache) | $0.39 | ~120s |
| 1 cold + 2 warm (with cache) | $0.20 | ~60s |
| **Savings** | **48%** | **50%** |

For 300 proposals/year × 3 stages, caching saves ~$60/year and 5 hours of cumulative wall-clock time. Real for batch backend automation.

---

## Anthropic PDF API constraints

Per Anthropic's [PDF support docs](https://docs.anthropic.com/en/docs/build-with-claude/pdf-support):

| Constraint | Limit | Affects us? |
|------------|------:|-------------|
| Max request payload | 32 MB | Only for PDFs > ~24 MB raw (base64 inflates ~33%) |
| Max pages per request | 600 (or 100 for 200K-context models) | Sonnet 4.6 has 1M context → 600 pages. Phase I proposals are 15-30 pages — no concern |
| Format | Standard PDF only | No encrypted/password-protected PDFs |
| Token cost | 1,500-3,000 tokens per page | Matches our SUNY measurement (~2K/page × 19 pages = 38K) |

### Three delivery methods

| Method | Best for | Notes |
|--------|----------|-------|
| **URL reference** | Public docs | PDF must be publicly accessible — won't work for SharePoint behind auth |
| **Base64 inline** | One-shot calls, PDF ≤ ~24 MB raw | Counts against 32 MB request cap after inflation |
| **Files API** (`anthropic-beta: files-api-2025-04-14`) | Backend, multi-pass workflows, large PDFs | Upload once → get `file_id` → reference in subsequent calls. Bypasses request-size limit, plays well with caching |

---

## Recommended PA flow for Phase I summary writeback

```
[Trigger: akoya_request status → "submitted"]
   │
   ▼
[PA: Dynamics → akoya_request lookup, get requestId + applicant info]
   │
   ▼
[PA: SharePoint → list akoya_request library + RequestArchive1/2/3
       for the request folder, find Research Phase I Application*.pdf]
   │
   ▼
[PA: SharePoint → download PDF as bytes]
   │
   ▼
[PA: HTTP POST to Anthropic /v1/messages
       - system: cached Phase I prompt (with cache_control)
       - messages[0].content[0]: document block with PDF base64 + cache_control
       - messages[0].content[1]: text "Produce Phase I summary..."]
   │
   ▼
[PA: parse response → write summary to akoya_request.wmkf_ai_summary]
   │
   ▼
[PA: log to wmkf_ai_run]
```

**Key choices for PA implementation:**

- **Don't render PDF pages in PA.** Send the whole PDF; Anthropic handles rendering.
- **Set `cache_control: { type: "ephemeral" }` on the document block** — pays off the moment any second call hits the same proposal within 5 min. For staged pipelines this is automatic savings.
- **Use base64 inline** for one-shot summaries (PDFs are ≤ 16 MB in our actual data). Switch to Files API only if you're chaining 3+ Claude calls on the same proposal AND want the cache to outlive the 5-min ephemeral window.
- **Skip the figure-extraction rabbit hole.** You don't need Encodian or Adobe PDF Services connectors. The native PDF block is already vision-aware.

---

## What's NOT solved by this approach

1. **Single-pass cost vs multi-pass cost.** If you only ever need ONE summary per proposal, caching doesn't help — there's no second call to read the cache. Native PDF input then costs $0.13/proposal vs $0.05 for text-only. Quality decision.

2. **PDF cache lifetime.** Ephemeral = 5 min. If your pipeline has > 5 min of human review between stages, the cache evaporates. Use 1-hour cache (`type: "ephemeral"` with `ttl: 3600` on Anthropic's roadmap; not currently widely available) or the Files API for longer-lived caching.

3. **Bromelkamp's PDF bloat (separate finding).** akoyaGO's `ABCpdf` PDF generator stores embedded images uncompressed — SUNY's 14.6 MB file is 91% just 4 large RGB images. Doesn't affect our processing (text extraction skips images), but worth knowing if file storage costs ever become a budget item.

---

## Test artifacts

All measurements above came from these scripts:

| Script | Purpose |
|--------|---------|
| `scripts/find-2025-phase-i.js` | Discover real Phase I candidates around the May 1, 2025 deadline |
| `scripts/list-all-pdfs-for-candidates.js` | Enumerate PDFs per candidate to identify true Phase I file naming |
| `scripts/compare-phase-i-v1-v2.js` | v1 vs v2 prompt comparison harness (8 May 2025 proposals) |
| `scripts/test-suny-pdf-native.js` | One-shot text-vs-native-PDF cost comparison |
| `scripts/test-suny-pdf-cache.js` | Two-call PDF caching verification |
| `scripts/inspect-suny-pdf.js` | Pull a SharePoint PDF locally for inspection |

Comparison outputs (gitignored) under `tmp/phase-i-comparison/`.

---

## Open questions for Connor

1. **Adobe PDF Services or Encodian connector** — already licensed in the org? If yes, no harm done; if no, this finding means you don't need to spend on either.
2. **PA HTTP action max body size** — default is 100 MB; should not be a constraint for our 14-25 MB PDFs but worth confirming the tenant doesn't have a smaller cap.
3. **Files API beta header (`files-api-2025-04-14`)** — fine to use in PA HTTP action? Anthropic uses beta headers for newer features even when they're stable in production.
4. **Multi-pass pipeline timing** — does the 5-min ephemeral cache window fit your envisioned PA flow rhythm, or do you need the longer-lived Files API path?
