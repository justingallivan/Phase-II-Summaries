# Reviewer Finder — future architecture sketch

**Status:** Design sketch (Session 110, 2026-04-25). Not yet implemented.
**Trigger for implementation:** Justin called Reviewer Finder out as the most complicated app + needed soon after May 1 cycle. This doc plans Session 112+ work.
**Owner:** Justin (Vercel implementation), Connor (Wave 2 Dataverse migration when researcher/publication tables move)

## Summary

Reviewer Finder is **not** a tool-use agent. It's a multi-step orchestration of:
1. Single-shot Claude calls (proposal analysis, search-strategy generation, candidate scoring)
2. External API fetches (PubMed, arXiv, BioRxiv, ChemRxiv, ORCID, Google Scholar via SerpAPI)
3. DB lookups (existing `researchers` / `publications` pool, deduplication, COI filtering)
4. SSE streaming for progress updates to the UI

That orchestration *is* complex, but it lives in the **route**, not in the Claude call. Each individual Claude call fits the existing Executor contract today. Reviewer Finder does not require `executeAgent()` or any out-of-contract Executor extension.

## Migration shape

Three Claude calls, three prompt rows in `wmkf_ai_prompt`:

| Prompt name | Purpose | Inputs | Outputs |
|---|---|---|---|
| `reviewer-finder.analyze` | Extract proposal metadata (PI, institution, keywords, research area) | `proposal_text` (override) | structured JSON: PI, institution, area, keywords[] |
| `reviewer-finder.search-strategy` | Given the analysis, propose search queries for each external database | analysis output (passed via override) | `{ pubmed: [...], scholar: [...], orcid: [...] }` |
| `reviewer-finder.score-candidates` | Given a list of candidate researchers + the proposal, rank and rationalize | analysis output + candidate list (overrides) | ranked list with rationale |

All three are single-shot, parseMode=json, no jsonPath writeback (results land in Postgres `proposal_searches` + `reviewer_suggestions` today, eventually Dataverse Wave 2 tables). `target.kind: "none"` for all outputs since the route consumes them and persists separately.

Variable kinds: all `override`. The route owns input plumbing (the proposal text comes from upload; the candidate list comes from external APIs after the route runs them). No `dynamics` or `sharepoint` source kinds needed — Reviewer Finder doesn't read from `akoya_request` or SharePoint today.

## What the migration does NOT change

- **External API services** (`pubmed-service.js`, `arxiv-service.js`, `orcid-service.js`, `serp-contact-service.js`, etc.) — stay in `lib/services/`. Not Claude calls; not relevant to prompt storage.
- **Discovery orchestration** (`lib/services/discovery-service.js`, 1464 lines) — the large state machine that fans out external API calls and merges results stays put. Way too much logic to fit in a prompt.
- **Deduplication / COI filtering** (`deduplication-service.js`) — pure data work, not AI.
- **Streaming SSE** in `discover.js` — that's how progress reaches the UI. Stays at route level. The Executor is synchronous; progress events happen *between* Executor calls.
- **Postgres data** (`researchers`, `publications`, `proposal_searches`, `reviewer_suggestions`) — Wave 2 of the migration plan moves these to Dataverse later. Orthogonal to the prompt migration; can happen on its own track.

## Why this matters

The fear was that Reviewer Finder would need `executeAgent()` (a tool-use companion to `executePrompt()`) and that would be a huge build. Reading the actual code makes it clear that's not the case. The contract's "out of scope: tool-use loops" exclusion does not block Reviewer Finder.

The migration is real work — three prompts to author, route refactors to wire `executePrompt` into each call site, smoke testing — but it's mechanical, in the same shape as the Phase 0 work just shipped. Probably 1.5–2 sessions, post-cycle.

## When `executeAgent()` IS needed

Eventually we may want a true agent loop somewhere — most likely for:
- **Dynamics Explorer chat** (already implemented as a custom tool-use loop in `pages/api/dynamics-explorer/chat.js`; could be migrated to share infrastructure)
- A future "Research Question Decomposition" agent that iteratively refines a proposal's key questions through tool-use against the literature

But none of these are blocking. Reviewer Finder migrates cleanly without it. Defer `executeAgent()` until there's a second concrete caller asking for the same shape.

## Sequenced plan (post-cycle)

1. **Author the three prompt rows** in `wmkf_ai_prompt`. Same flow as `phase-i.summary` seed. Naming: `reviewer-finder.analyze`, `reviewer-finder.search-strategy`, `reviewer-finder.score-candidates`.
2. **Refactor `analyze.js`** to call `executePrompt('reviewer-finder.analyze', ...)`. Smallest of the three; good warm-up.
3. **Refactor `discover.js`** to use `executePrompt` for each Claude call inside its orchestration loop. Streaming SSE stays at the route level — emit progress events between Executor calls.
4. **Smoke test** end-to-end against a known proposal.
5. **(Independent track) Wave 2 Dataverse migration** moves `researchers`/`publications`/`proposal_searches`/`reviewer_suggestions` to Dataverse. Doesn't affect prompt rows; affects where saved candidate state lives. Do this when Postgres bill or staff-facing data discoverability becomes a real driver.

## Open questions

- **Caching strategy.** `reviewer-finder.analyze` reads the proposal text every time. If staff run the analyzer multiple times on the same proposal during a session, prompt cache helps (5-min TTL). If runs are days apart, caching doesn't help. No action needed in Phase 0; mention to Justin if observed.
- **Score-candidates input size.** When the candidate list from external APIs is large (50+ researchers), it can blow past Claude's context window. Currently `discovery-service` pre-filters; verify the filter is tight enough before migrating.
- **Per-user customization.** Reviewer Finder has heavily-customized search workflows per user (saved preferences, COI lists, expertise weighting). The Executor's `overrideVariables` covers per-call customization; saved per-user defaults stay in `user_preferences` (Wave 1 already-migrated table). No new mechanism needed.
