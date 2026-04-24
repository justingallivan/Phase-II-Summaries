# `wmkf_ai_prompt` — two quick schema questions

**For:** Connor
**Date:** 2026-04-24
**Reply cost:** ~30 seconds per question

Thanks for confirming the privileges on `wmkf_ai_prompt` / `wmkf_ai_run` — both tables now read 200 for us. The table being empty means we can't break anything by deciding schema now, which is why I'd like to get these settled before I port our prompt-resolver against it.

Both are yes/no-ish. Pick whichever answer you want for each; if you like my leans, a "yes to both" is fine.

---

## Q1. System prompt vs user prompt — one column or two?

Currently: single `wmkf_ai_promptbody` Memo column.

Claude's prompt cache requires system and user content as separate blocks. A single merged field forces us to either split client-side (fragile) or skip caching (3–5× API spend, 30–60% slower first tokens on our long-prompt apps).

**My lean:** add a second Memo column `wmkf_ai_system_prompt` alongside the existing `wmkf_ai_promptbody` (which becomes the user portion). ~2 min in the maker portal. Or authorize me to add it from our side — I'd need `prvWriteEntity` on the table (one more checkbox on `WMKF AI Tools`, if easier for you).

**Reply I need:** "yes, add the column, you do it" / "yes, I'll add it" / "no — use a delimiter instead" / "no — keep system prompts in code."

---

## Q2. App routing — convention or column?

Currently: no explicit app-identifier column. The table has `wmkf_ai_promptname`.

**My lean:** use `wmkf_ai_promptname` as the routing key, with a shared convention like `<app>.<purpose>` (e.g., `phase-i-summaries.main`, `grant-reporting.extract`). Your existing `wmkf_ai_iscurrent` + `wmkf_promptversion` + `wmkf_ai_rollbackfrom` already give the full version lifecycle per name. The app resolves "current prompt for X" as `wmkf_ai_promptname eq 'X' and wmkf_ai_iscurrent eq true`.

No schema change needed if you agree.

If you'd rather have a structured column (`wmkf_ai_appkey`, text or choice), that's fine too — it'd be cleaner for filtering admin views, at the cost of one more column and deciding who maintains the list of valid app keys.

**Reply I need:** "name-based, convention `<app>.<purpose>` is fine" / "add an app-key column" / something else.

---

## What happens after

Whichever you pick on each, I'll port `lib/services/prompt-resolver.js` to query `wmkf_ai_prompt` using the resolved pattern, flip the existing prompt-dev loop off the scratch row, and then we can start authoring real prompts in your table with the lifecycle fields doing their job.

Happy to take these as a quick Slack reply if easier than email.
