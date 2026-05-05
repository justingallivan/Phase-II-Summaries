# Notes for Connor — `wmkf_ai_prompt` table

**Context:** You created `wmkf_ai_prompt` in prod. I pulled the schema via the Web API and have two items before we start wiring the app against it. Unrelated to the Wave 1 security-role email — this one is separate.

---

## 1. Access — app user has no read privilege

Right now our App Registration (`# WMK: Research Review App Suite`) is blocked from reading the table:

> `is missing prvReadwmkf_ai_prompt privilege … for entity 'wmkf_ai_prompt'`

Before the backend can pick up prompts from the table, the app user needs:
- **prvRead** on `wmkf_ai_prompt` (minimum, to fetch prompt rows at runtime)
- **prvWrite** on `wmkf_ai_prompt` (optional but useful — lets us stamp `wmkf_ai_lasttestdatetime` or `wmkf_ai_preflightpasseddatetime` from our test harnesses)

Org-level access is fine on both. Whichever role you use for the app user, adding those two privileges unblocks the next step.

---

## 2. Two schema questions before we wire it up

### a) Single `wmkf_ai_promptbody` vs. separate system/user fields

In `docs/CONNOR_QUESTIONS_2026-04-15.md` I recommended splitting the prompt into `wmkf_system_prompt` + `wmkf_user_prompt`. The Claude API treats those as separate content blocks and caches them independently — our measurements from Session 106 showed caching only fires on the system block when the model's cache floor is met, and keeping system and user separate is what lets caching work at all on prompts with per-request variables.

Your single `wmkf_ai_promptbody` Memo column is simpler to edit but collapses that distinction. Three ways forward:

1. **You add a second Memo column** (`wmkf_ai_system_prompt` alongside `wmkf_ai_promptbody`, with the existing column renamed-in-spirit to the user portion). Cleanest for the API layer.
2. **We use a delimiter inside the single field** — something like a literal line `---USER_PROMPT---` that we split on client-side. Works, but the split is invisible in the editor UI, easy to break by accident.
3. **We treat the whole body as the user prompt** and keep the system prompt in our code. Means the Dynamics-stored prompt is partial — you can only edit the user half. Defeats part of the point.

I lean (1). Curious what you think — I don't want to retrofit the table if there's a reason you merged them.

### b) How does a prompt row map to an app?

I don't see an explicit app-identifier column (e.g., `wmkf_ai_appkey`). Is the intent that `wmkf_ai_promptname` is the routing key — i.e., the app looks up by name like `phase-i-summaries.main` or `grant-reporting.extract` — or is there a different convention you have in mind?

If name-based is the plan, that works fine; we just need a shared naming convention. If you'd rather add a structured column (choice or text), now is the easy time to do it.

Related: with `wmkf_ai_iscurrent` + `wmkf_promptversion` + `wmkf_ai_rollbackfrom`, we have everything we need for version lifecycle per name — the app would resolve "current prompt for X" as `wmkf_ai_promptname eq 'X' and wmkf_ai_iscurrent eq true`. Want to confirm that's the intended query pattern before we bake it into the resolver.

---

## Not a blocker, just a flag

The `wmkf_ai_promptoutputschema` Memo column is a nice addition — matches the `wmkf_output_schema` field from `docs/WORKFLOW_CHAINING_DESIGN.md`. Once we're pulling prompts from this table, we can drive structured outputs off that same row. Good forward thinking on your part.

---

## Reference docs

- `docs/PROMPT_STORAGE_DESIGN.md` — full prompt-storage design (hybrid composition, per-session overrides)
- `docs/CONNOR_QUESTIONS_2026-04-15.md` — Q1–Q7; Q1/Q2/Q4 resolved; Q3 (template variable syntax), Q5 (intermediate fields), Q6 (`wmkf_ai_run` columns), Q7 (PD expertise) still outstanding on your side
- `docs/WORKFLOW_CHAINING_DESIGN.md` — how output schemas chain across prompts
