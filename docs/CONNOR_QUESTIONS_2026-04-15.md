# Open items for Connor — carried from April 2026

Originally a longer list of seven items; Q1/Q2/Q3 shipped (the `wmkf_ai_prompt` table is live with system/user split and name-based routing — see archived `docs/archive/CONNOR_PROMPT_TABLE_FOLLOWUP.md` for the resolution detail). The four items below are the stragglers; none are blocking, all could ride a future sync.

**Status as of 2026-05-05.** Last touched: 2026-05-05.

---

## ~~Q4. Field Set B timeline~~ — **Resolved 2026-05-07**

Connor: build the skeleton as currently spec'd; expect iteration as staff feedback comes in. Publication fields chosen flat (not JSON) for staff editability. Schema additions logged to `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md`; spec updated in `docs/DYNAMICS_AI_FIELDS_SPEC_v3_cn.md`. Choice values for `wmkf_ai_reportoverallrating` still pending.

---

## ~~Q5. Intermediate fields on `akoya_request`~~ — **Closed 2026-05-07** (under delegation)

The 6 `wmkf_ai_*` workflow-chaining fields (keywords, methodologies, risk_flags, team_info, budget_summary, timeline) fall under the schema-creation delegation Connor granted 2026-05-06. Justin/Claude to build directly; logged to `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md`. Not a Connor ask.

---

## ~~Q6. Two remaining columns on `wmkf_ai_run`~~ — **Closed 2026-05-07** (under delegation)

`wmkf_prompt_was_overridden` (Bool) + `wmkf_run_source` (Choice: `pa-auto / vercel-user / vercel-test-run / vercel-interactive`) fall under the same delegation. Justin/Claude to build directly; logged to `docs/INTAKE_PORTAL_SCHEMA_CHANGES.md`.

---

## ~~Q7. PD expertise field on `systemuser`~~ — **Resolved 2026-05-07**

Connor created **`wmkf_expertise`** (Memo) on `systemuser`. Unblocks dynamic PD lookup — the AI can read current PD specialties at runtime instead of relying on hardcoded GUIDs in prompts. Implementation work (querying active PDs with expertise descriptions, swapping out hardcoded lists in PA/Vercel prompts) is downstream of this and not yet scheduled.

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
