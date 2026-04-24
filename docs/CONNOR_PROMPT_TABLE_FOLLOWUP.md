# `wmkf_ai_prompt` — privilege + two schema decisions

**For:** Connor
**Date:** 2026-04-24
**Time needed:** ~1 min for the privilege; ~5 min if you also want to resolve the two schema questions today.

---

## Context

Thanks for getting us through the Wave 1 privileges yesterday — the prod cutover went cleanly and we've verified 66/66 read-path assertions. Wave 1 is done.

Next thing on our side is wiring our prompt-resolver against the `wmkf_ai_prompt` table you created. This note is the same ask I flagged before the Wave 1 push (`docs/CONNOR_PROMPT_TABLE_NOTES.md`) — re-surfaced now that we're ready to actually use it.

Three asks total — but only the first is needed to unblock progress. The other two are design decisions where I'd like your input now so we don't ship a v1 that needs rework.

---

## 1. Minimum unblock — one privilege

Add **`prvRead` on `wmkf_ai_prompt`** at **Organization** depth to a permanent role on the app user. `WMKF AI Tools` is the natural home since it's the permanent "day-to-day operations" role.

Without this, the app user gets `403 is missing prvReadwmkf_ai_prompt privilege` on every lookup.

### Steps (maker portal)

1. Open **https://make.powerapps.com** → **Production**.
2. Left nav → **… More → Security roles**.
3. Open **WMKF AI Tools** for editing.
4. Find the row for **wmkf_ai_prompt** (under **Custom Entities**).
5. Click the **Read** circle until it's a **green filled circle** (Organization).
6. **Save and Close.**

No re-assignment needed — the role is already on the app user.

### Verification (I'll run this after you confirm)

```bash
node -e "
require('./lib/dataverse/client').loadEnvLocal();
const { getAccessToken, createClient } = require('./lib/dataverse/client');
(async () => {
  const url = process.env.DYNAMICS_URL;
  const token = await getAccessToken(url);
  const c = createClient({ resourceUrl: url, token });
  const r = await c.get('/wmkf_ai_prompts?\$top=5&\$select=wmkf_ai_promptname,wmkf_ai_iscurrent');
  console.log('status=', r.status, 'rows=', r.body?.value?.length);
})();
"
```

Expected: `status= 200 rows= N` where N is however many rows you've seeded.

### Optional — also useful but not required

**`prvWrite` on `wmkf_ai_prompt`** at Org depth. Same row, same steps, different circle (Write).

This lets our test harnesses stamp `wmkf_ai_lasttestdatetime` and `wmkf_ai_preflightpasseddatetime` back to the row when we preflight a prompt version — closes the audit loop on your lifecycle fields. Skip it if you'd rather we not write to the table for now; we'll do those timestamps client-side and stamp later.

---

## 2. Schema decision — system vs user prompt split

Your current schema has a single `wmkf_ai_promptbody` Memo column for the prompt content.

Claude's prompt cache requires **system and user prompts to be separate content blocks**. Our measurements in Session 106 showed caching only fires when the system block is sent as its own block and meets the minimum cache-floor length. Collapsing them into one string means we can't hit the cache reliably, which shows up as 3–5× higher API spend and 30–60% slower first tokens on the apps that use long prompts (Phase I summaries, extract, etc.).

Three options to address this:

| # | Option | Schema impact | Caching works? | Editing experience |
|---|---|---|---|---|
| a | Add a second Memo column `wmkf_ai_system_prompt` next to the existing `wmkf_ai_promptbody` (which becomes the user portion) | **+1 column** | Yes, cleanly | Two Memo fields in the form — clear |
| b | Use a delimiter in the single field (e.g., `---USER_PROMPT---` on its own line) that we split client-side | None | Yes, but fragile — invisible to editors, easy to break | One Memo field, hidden convention |
| c | Keep the system prompt in our code, only edit the user portion via this table | None | Yes, but the CRM editor only has half the prompt | Only half of each prompt is visible in CRM |

**I lean (a)** — one new Memo column. Clean separation, both halves visible to editors, matches the Claude API model. ~2 min of maker-portal work (or we can do it from our side if you give us `prvWriteEntity` on your solution; whichever you prefer).

If you have a reason you kept them merged, I'd like to hear it before we ask you to change it — there may be a consideration I'm missing.

---

## 3. Schema decision — app routing column

The table has `wmkf_ai_promptname` but no explicit app-identifier column. Two patterns work:

| # | Option | Schema impact | Notes |
|---|---|---|---|
| a | **Name is the routing key** — app queries `wmkf_ai_promptname eq 'phase-i-summaries.main'`, with a shared naming convention like `<app>.<purpose>` | None | Simplest. Your existing `wmkf_ai_iscurrent` + `wmkf_promptversion` + `wmkf_ai_rollbackfrom` already give full version lifecycle per name. |
| b | Add a structured app-key column (`wmkf_ai_appkey`, text or choice) | **+1 column** | Cleaner for filtering admin views by app, or constraining choices via a picklist |

**I lean (a)** — name-based, with a convention. Your lifecycle fields do the heavy lifting, and the naming convention is something we own on the app side. Adding another column doesn't buy much unless you want a picklist-constrained list of valid app keys (in which case I'd want to discuss how that's maintained).

---

## Priorities / phasing

Ranked by what unblocks us:

1. **`prvRead` on `wmkf_ai_prompt`** — if you only do one thing today, this. Without it we can't even query the table.
2. **Your call on #2** — even just a yes/no on option (a). If yes, we can add the column (or you can).
3. **Your call on #3** — even a quick "let's do name-based, convention is `<app>.<purpose>`" is enough.

Items 2 and 3 can come in a reply tomorrow or later this week if you're busy today. They're design decisions, not blockers — we can start with the current schema and retrofit if needed, but it's cheaper to get it right the first time.

---

## Reference docs

- `docs/PROMPT_STORAGE_DESIGN.md` — full prompt-storage design
- `docs/WORKFLOW_CHAINING_DESIGN.md` — how output schemas chain across prompts
- `docs/CONNOR_PROMPT_TABLE_NOTES.md` — the original note on this table (for context)
- `docs/CONNOR_QUESTIONS_2026-04-15.md` — the broader question list; Q1/Q2/Q4 resolved; Q3/Q5/Q6/Q7 still pending
