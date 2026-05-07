# Wave 1 Prod Cutover — One Privilege Decision Needed

**For:** Connor
**Date:** 2026-04-24
**Time needed:** ~2 min of maker-portal clicks, either path

---

## Where we are

I ran the Wave 1 schema script against prod (`wmkf.crm.dynamics.com`). Your `WMKF AI Elevated TEMP` role on the app user carried us most of the way — everything metadata-specific that we'd listed worked:

**Created successfully:**
- Publisher reused: `WMKF_Publisher` ✓
- Solution `wmkfResearchReviewAppSuite` ✓
- Columns on `systemuser`: `wmkf_app_AvatarColor`, `wmkf_app_NeedsLinking` ✓

**Blocked on** the first custom-table creation. Dataverse autogenerates a default form, a default view, and entity-mapping metadata whenever a new entity is created, and the role is missing the privileges that let the caller do that. The exact error:

```
SecLib::CheckPrivilege failed.
User: 53e97fb3-a006-f111-8406-000d3a352682
PrivilegeName: prvCreateSystemForm
Required Depth: Basic
```

---

## What would unblock us

Two paths. They're functionally equivalent for this cutover, so pick whichever suits your own work better. I'm presenting both because you may have other reasons to prefer one (e.g., you already intended to extend `WMKF AI Elevated TEMP` for your own needs, or you may have a policy against custom roles mirroring built-ins).

---

### Option A — Add six privileges to `WMKF AI Elevated TEMP`

Surgical. The role stays narrowly scoped. Six additions, all at **Organization** depth:

| # | Privilege | Entity | Purpose |
|---|---|---|---|
| 1 | `prvCreateSystemForm` | System Form | Auto-generated default forms on new entities |
| 2 | `prvWriteSystemForm` | System Form | Modify forms after creation |
| 3 | `prvCreateSavedQuery` | Saved Query | Auto-generated default views on new entities |
| 4 | `prvWriteSavedQuery` | Saved Query | Modify views after creation |
| 5 | `prvReadSavedQuery` | Saved Query | Some metadata ops read the default view |
| 6 | `prvCreateEntityMap` | Entity Map | Auto-generated mapping records on new entities |

`prvReadSystemForm` is already on the role — confirmed via Web API.

#### Steps (maker portal)

1. Open **https://make.powerapps.com** → **Production** environment.
2. Left nav → **… More → Security roles**.
3. Open **WMKF AI Elevated TEMP** for editing.
4. On the role editor, each table has a row with eight clickable circles (Create / Read / Write / Delete / Append / Append To / Assign / Share). For each row below, click the circle listed until it's a **green filled circle** (Organization-level).

   | Table | Set this column to Organization |
   |---|---|
   | **System Form** | Create, Write |
   | **Saved View** (a.k.a. Saved Query) | Create, Read, Write |
   | **Entity Map** | Create |

   *(Depending on the role editor view you may need to scroll to the **Customization** tab; all three tables live there.)*

5. **Save and Close.**

That's it — no need to reassign the role, it's already on the app user.

#### What happens next

I rerun `node scripts/apply-dataverse-schema.js --target=prod --execute`. The script is idempotent: the solution and the two `systemuser` columns will show `· exists` and be skipped; the three new tables and their columns/relationships/keys will be created.

---

### Option B — Assign the built-in `System Customizer` role

Broadest. System Customizer is one of Dataverse's two stock "power" roles; the other is System Administrator which you've ruled out.

The key distinction relative to your concern about Sys Admin: **System Customizer grants customization power but NOT data access**. It cannot read, write, or delete business records — only metadata (tables, columns, relationships, forms, views, roles, solutions). So the concerns that ruled out Sys Admin don't apply here.

This role has all six privileges from Option A plus anything else Dataverse might surprise us with during creation of the remaining tables.

#### Steps (maker portal)

1. Open **https://make.powerapps.com** → **Production** environment.
2. Left nav → **… More → Users + permissions → Application users**.
3. Find **"# WMK: Research Review App Suite"** (App ID `d2e73696-537a-483b-bb63-4a4de6aa5d45`).
4. Click **Manage Roles**.
5. Check the box for **System Customizer**. Click **Save**.

That's it. You can leave `WMKF AI Elevated TEMP` assigned as well — they stack additively.

#### What happens next

Same as Option A — I rerun the schema script, it resumes from where it stopped.

#### Revoking after cutover

System Customizer can be removed the same way after all three scripts (schema + role + data sync) complete. If Option A was for "keep the permanent set tight," Option B with a later revoke is for "go wide now, pull back once we're done."

---

## Which I'd lean toward, if you want a recommendation

**Option B**, only because we've already spent one execute cycle discovering a missing privilege (`prvCreateSystemForm`). There's a real chance creation of the remaining two tables needs something else I haven't mapped, and the cycle-time cost of another back-and-forth is higher than the marginal security cost of System Customizer for the ~10 minutes the cutover takes.

But if `WMKF AI Elevated TEMP` is a role you're actively curating for a reason (documentation, reuse, your own workflow), Option A is perfectly fine — the six privileges are the minimum known requirement, and if Dataverse surprises us again, we just loop back once more.

---

## After the schema works

The remaining commands don't need any additional privileges from you — they only touch data in the tables we just created and roles:

1. `node scripts/apply-security-role.js --target=prod --execute --assign=<7 staff emails>`
2. `node scripts/sync-wave1-postgres-to-dataverse.js --target=prod --execute`

Total added time ~2 minutes. Full verification follows.

---

## Files / context

- `docs/WAVE1_PROD_RUNBOOK.md` — full cutover runbook (background, rollback notes, sandbox proof)
- `docs/SECURITY_ROLE_WAVE1.md` — the privilege matrix for the staff role that command 2 creates
- `lib/dataverse/schema/wave1/*.json` — the declarative schemas that define what's being created
