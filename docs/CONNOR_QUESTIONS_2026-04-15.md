# Open items for Connor — carried from April 2026

Originally a longer list of seven items; Q1/Q2/Q3 shipped (the `wmkf_ai_prompt` table is live with system/user split and name-based routing — see archived `docs/archive/CONNOR_PROMPT_TABLE_FOLLOWUP.md` for the resolution detail). The four items below are the stragglers; none are blocking, all could ride a future sync.

**Status as of 2026-05-05.** Last touched: 2026-05-05.

---

## Q4. Field Set B timeline (Grant Report writeback fields)

Field Set B (grant report extraction fields — postdoc counts, publication counts, narratives, goals assessment) is on hold per `DYNAMICS_AI_FIELDS_SPEC_v3_cn.md`, pending "further staff review."

**Questions:**
- Is there a timeline for this review?
- Who else needs to weigh in?
- Is there anything we can do to move it forward?

Not currently blocking — Grant Reporting works today without CRM writeback. Once Field Set B lands, the app can write extracted data back to Dynamics automatically.

---

## Q5. Intermediate fields on `akoya_request` for workflow chaining

When the backend runs the Phase I writeup prompt, we want it to extract not just the prose summary but also structured metadata (keywords, methodologies, risk flags, etc.) in the same Claude call. Downstream tasks (compliance screening, PD assignment, reviewer matching) would then read these fields instead of re-reading the full proposal — saving significant cost and time.

**v1 fields needed on `akoya_request`** (suggested `wmkf_ai_*` prefix to match v3 spec convention):

| Field | Type | Purpose |
|-------|------|---------|
| `wmkf_ai_keywords` | Memo (JSON array) | 5–10 keywords characterizing the research area |
| `wmkf_ai_methodologies` | Memo (JSON array) | Key experimental approaches and techniques |
| `wmkf_ai_risk_flags` | Memo (JSON array) | Compliance or feasibility concerns |
| `wmkf_ai_team_info` | Memo (JSON) | PI and co-PI details, institutional affiliations |
| `wmkf_ai_budget_summary` | Text | Brief budget characterization |
| `wmkf_ai_timeline` | Text | Project timeline summary |

**Not blocking v1** but ideally created in the same batch when convenient so we can test the full chain early. The exact field list may evolve as we test — starting with these six covers the known downstream consumers.

**Future expansion (single-phase cycle, ~2 cycles out):** Session 103 produced a broader extraction plan — `docs/PROPOSAL_CONTEXT_EXTRACTION_PLAN.md` — with ~15 fields across scientific decomposition, review-matching metadata, and verbatim passages. Not requesting those now — the 6-field v1 set is enough to prove the workflow chain. But worth knowing the growth direction when choosing the v1 field shape, especially if we'd prefer JSON-in-Memo for extensibility.

Full context: `docs/WORKFLOW_CHAINING_DESIGN.md` (the mechanism) and `docs/PROPOSAL_CONTEXT_EXTRACTION_PLAN.md` (the future-state field list + downstream economics).

---

## Q6. Two remaining columns on `wmkf_ai_run`

`wmkf_ai_promptoverride` is shipped and in use (Session 130 added redaction logic on the Vercel side). The two stragglers from the original ask:

| Column | Type | Purpose |
|--------|------|---------|
| `wmkf_prompt_was_overridden` | Bool | Denormalized flag for fast filtering of overridden runs |
| `wmkf_run_source` | Choice | `pa-auto` / `vercel-user` / `vercel-test-run` / `vercel-interactive` — distinguishes how each AI run was triggered. Choice values are suggestions; use whatever numbering fits your convention. |

Lower priority than other items — these are needed when the prompt override/visibility admin features ship, not for current operations.

---

## Q7. PD expertise field on `systemuser` (low priority, future)

For dynamic PD assignment to fully replace hardcoded GUIDs in prompts, we'd eventually need a custom field on `systemuser` for PD expertise descriptions (e.g., "organic chemistry, materials science, catalysis"). This lets the AI read current PD specialties at runtime instead of relying on a hardcoded list that drifts when staff change.

No action needed now — just flagging it as a future dependency. See `docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md` for context.

---

## Previously resolved (for reference)

| Item | Status |
|------|--------|
| Q1 — Create `wmkf_ai_prompt` table | Done. Table live; richer schema than originally spec'd; in production use via Executor + prompt-resolver. |
| Q2 — Hybrid vs. full PA composition | Decided 2026-04-16: full PA composition. |
| Q3 — `{{var}}` syntax | Verified on Next.js side (Session 103); PA side untested but unblocked since PA `replace()` is delimiter-agnostic. |
| Q6a — `wmkf_ai_promptoverride` column | Shipped; Session 130 added override-value redaction. |
| `wmkf_ai_run` table + Field Sets A & C | Done 2026-04-14. |
| Write permissions, activity privileges | Done 2026-04-14. |
| SharePoint `Sites.Selected` (read + write) | Done 2026-04-15. |
| `prvRead` / `prvWrite` on `wmkf_ai_prompt` | Done 2026-04-24 (see `docs/archive/CONNOR_PROMPT_TABLE_FOLLOWUP.md`). |
| System/user prompt split + name-based routing | Done 2026-04-24 (`wmkf_ai_systemprompt` + `wmkf_ai_promptbody`; `wmkf_ai_promptname` with `<app>.<purpose>` convention). |
