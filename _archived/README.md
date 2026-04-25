# Archived code

Files in this directory are **deprecated and not built**. The directory sits outside `pages/`, so Next.js does not route anything here, and outside the active import graph, so the bundler does not include it.

Directory layout mirrors the source location:
- `_archived/pages/foo.js` was at `pages/foo.js`
- `_archived/shared/config/prompts/bar.js` was at `shared/config/prompts/bar.js`

This preserves provenance — a future maintainer reading `_archived/pages/concept-evaluator.js` knows it lived at `pages/concept-evaluator.js` historically. Move or delete files freely; the repo has them in git history regardless.

## What's archived and why

| Path | Archived | Reason |
|---|---|---|
| `pages/concept-evaluator.js` | 2026-04-25 (Session 110) | App being deprecated. Concept-stage screening workflow superseded; intake AI work moves to backend automation post-cycle. |
| `pages/api/evaluate-concepts.js` | 2026-04-25 (Session 110) | API counterpart of `concept-evaluator.js` |
| `shared/config/prompts/concept-evaluator.js` | 2026-04-25 (Session 110) | Prompt for the deprecated app. Note: `shared/config/prompts/multi-perspective-evaluator.js` reuses some content from this prompt — that one is **not** archived. |
