---
name: feedback_reconcile_dont_append_docs
description: When updating a long-lived design/state doc, reconcile the whole doc to one consistent state — never append-patch a new claim while leaving stale contradictory text elsewhere
metadata:
  type: feedback
---
When recording a new decision/finding into a long-lived design or state document (e.g. `docs/DATAVERSE_POWER_TOOLS_DESIGN.md`, Atlas pages, SESSION_PROMPT), **edit the document into a single internally-consistent state**. Do not bolt the new claim onto the top/middle and leave the old contradictory wording in the tail, status lines, or summary blocks. After any edit that changes a status/conclusion, re-grep the whole doc for every place that restates that status and bring them all into agreement (AUTHORITATIVE block, Status-of-unknowns, lead-ins, tails, memory pointer).

**Why:** This is a *recurring, named* failure. S157's Codex holistic review found the Power Tools record had gone stale/self-contradictory from incremental append-patching and had to be consolidated. S158 reproduced the exact same failure — even while the session was explicitly watching for it — declaring residuals "all CLOSED / build-plan-ready" at the top while line 393 still read "neither residual is solo-actionable." A self-contradictory doc on `main` is a ground-truth violation (CLAUDE.md), it silently propagates wrong beliefs across session handoffs, and it forces an expensive external review to catch what a self-grep would have.

**How to apply:** (1) Before editing, read enough of the doc to know every location that asserts the thing you're changing. (2) Make the change everywhere in the same pass. (3) After the pass, grep the doc for the old claim's keywords + the residual/section IDs and verify zero divergent restatements remain. (4) Prefer rewriting a stale block over adding a new "S158 update:" paragraph next to it. (5) Treat "the top says X, the tail says not-X" as a P0 to fix immediately, same urgency as a red CI gate. Related: [[project_dataverse_power_tools]], [[feedback_surface_full_review_findings]].
