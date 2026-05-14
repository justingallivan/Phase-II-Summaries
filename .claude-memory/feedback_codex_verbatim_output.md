---
name: feedback-codex-verbatim-output
description: "Codex/codex-rescue output is verbatim to the user, always — never paraphrase or summarize, even on subsequent rounds in the same session"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 1e1dfc4f-ebfe-49c2-965d-23d90c70e16f
---

When invoking the `codex:codex-rescue` subagent (or running the `/codex:rescue` skill), Codex's stdout must be returned to the user **verbatim** with no paraphrase, summary, rewriting, or surrounding commentary. This holds for every round-trip in a session — not just the first one.

**Why:** Stated by Justin during S149 (2026-05-14 schema review) after I summarized Codex's pass 2 and pass 3 outputs instead of pasting them. The first-round response handled by the inline command path correctly passed Codex's text through; subsequent calls routed via direct `Agent(subagent_type: codex:codex-rescue)` invocations and I added my own bullet-restatement on top. That defeats the point — Codex's exact wording, severity labels, and line numbers are what the user is paying tokens for, not my interpretation of them.

**How to apply:**
- Every Codex round-trip: paste stdout exactly as returned, inside a clearly-marked block. My commentary, if any, goes *after* the verbatim block, never before or instead.
- This applies even when I think the output is verbose, repetitive, or could be summarized for clarity — those judgments aren't mine to make on Codex output.
- The `codex:codex-result-handling` skill's contract enforces this; treat it as binding regardless of how the subagent was invoked.
- If the output is long, that's fine — long is the right answer when the user wants verbatim.
