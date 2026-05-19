# Intake Portal Item 6 / slice-0 — CANONICAL STATUS

> **This is the single status entry point for Item 6 and the slice-0 schema deploy.**
> Every other `INTAKE_PORTAL_ITEM_6_*` doc is detail or history and points here.
> If this page disagrees with another Item 6 doc about **current state**, this page
> wins. For the **locked design decision** (why deactivate-not-delete, the A+B
> hybrid, the four preconditions), `INTAKE_PORTAL_ITEM_6_DISCUSSION.md` §0 is
> authoritative and this page only summarizes it.

**Last updated:** S166, 2026-05-19.
**Maintenance rule:** when Item 6 state changes (Connor replies, a waiver is
signed, the deploy runs), update *this page first*, then the detail docs.

---

## 1. Is the slice-0 schema deploy cleared? — **NO. ONE open pre-deploy gate.**

Slice-0 is blocked on **exactly one** open pre-deploy item: **P1-Update**.

> **P1-Update** = does the recompute flow's trigger-condition filter
> (`_wmkf_request_value/akoya_requeststatus eq 'Phase II Pending'`, traversing the
> child→parent lookup) actually **bind and fire** on a child **Update whose only
> change is `statecode`→Inactive** (a deactivation)? Connor asserted the *design*
> (deactivate-not-delete); he has **not** runtime-validated this binding in the
> maker portal. Per `DISCUSSION.md` §0 precondition 1, runtime validation of this
> is a **pre-deploy** requirement.

Everything else is resolved:

| Precondition | State |
|---|---|
| P1-Create (filter excludes pre-submit drain inserts) | ✅ Clean — designed to exclude these; unchanged by Connor's ruling |
| **P1-Update** (filter binds on statecode-only deactivation Update) | 🔴 **OPEN — the single pre-deploy gate** |
| P1-Delete (filter binds on Delete) | ✅ Dissolved — no Delete trigger in the deactivate model |
| P2 (Delete-trigger parent-ID resolution) | ✅ Dissolved — deactivation is an Update; parent lookup is carried |
| P3 (rule-exception language in `INTAKE_PORTAL_DESIGN.md`) | ✅ Landed S150 |
| P4 (real-schema verification after deploy) | ⏳ Post-deploy gate — blocks PA-flow-live only, **never** the schema deploy |

Slice-0 schema itself is verified additive / non-destructive / collision-clear
(S163): `apply-dataverse-schema.js --wave=4` is creation-only/idempotent, the
picklist extend is additive, `setup-database.js` V30 adds `submission_jobs` (no
DROP). No table drop anywhere in slice-0. The *only* thing between here and
`--execute` is the P1-Update decision below.

Trigger **Select columns = LOCKED `blank`** (S163, Codex-validated
SAFE-WITH-CONDITIONS). The core-gate's Step 10 is **locked-skipped** unless that
production decision is ever reversed (then Step 10's `statecode,statuscode`
battery applies). This does **not** close P1-Update.

---

## 2. The explicit blocker (preserve verbatim)

> **No `apply-dataverse-schema.js ... --wave=4 --execute` (nor the picklist-extend
> script, nor `setup-database.js` V30) until P1-Update clears by one of the two
> paths in §3. `--execute` is NEVER run autonomously — it requires Justin's
> explicit in-session go-ahead even after the gate clears.** Slice-0 also remains
> destructive-carryover *by classification*: re-run BOTH point-in-time probes and
> grep live callers at actual deploy time regardless.

---

## 3. The two — and only two — ways P1-Update clears

P1-Update is mutually-exclusively cleared by **(i)** or **(ii)**. Nothing else.

### (i) Connor maker-portal validation — **ACTIVE, AWAITING REPLY** 🟡

- **Status:** the P1-Update core-gate test was **emailed to Connor (S165,
  2026-05-19)**. Connor is reviewing.
- **State:** test **SENT**, **AWAITING Connor's Step 11 evidence + Step 12
  verdict**. **Sending ≠ clearing — the gate is still OPEN.**
- Test handout (committed, what Connor received): `INTAKE_PORTAL_ITEM_6_CONNOR_CORE_GATE.md` (Steps 1–12).
- Cover email: `INTAKE_PORTAL_ITEM_6_CONNOR_EMAIL.md` — **intentionally uncommitted local file**; regenerate from `CONNOR_CORE_GATE.md` if on another Mac.
- Full runbook the handout was condensed from: `INTAKE_PORTAL_ITEM_6_P1UPDATE_TEST_DRAFT_v5.md`.

### (ii) Authorized risk waiver — **DRAFTED, UNAUTHORIZED** 🔴

- A waiver decoupling the schema deploy from P1-Update is **drafted** at
  `INTAKE_PORTAL_ITEM_6_P1UPDATE_TEST_DRAFT_v5.md` → **Artifact 1**.
- **Status: UNAUTHORIZED.** It becomes active *only* when Justin signs the
  "Authorized by: ____ (Justin)" line at the bottom of Artifact 1. **It cannot
  be self-authorized by an agent.** Until signed, slice-0 stays gated.
- Scope if signed: authorizes the slice-0 *schema* deploy only. Does **not**
  authorize switching on any PA recompute flow; does **not** waive P4 or any
  other precondition; P1-Update verification is added as a hard
  pre-flow-live condition tracked separately.

**Net:** path (i) is in flight; path (ii) is drafted but unsigned. Neither has
cleared. Slice-0 deploy is gated, narrowly, on P1-Update alone.

---

## 4. When Connor replies — verdict-checker criteria (do not soften)

The next session acts as **verdict-checker**, not result-narrator. Check the
returned evidence line-by-line against `CONNOR_CORE_GATE.md` Step 11
(completeness) and Step 12 (verdict). Step 12 verdict criteria, quoted from
`CONNOR_CORE_GATE.md` Step 12 (the bolded **Does NOT clear the gate as full
VERIFIED** clause is an added clarification, not in the CORE_GATE source):

> - **VERIFIED** (clears the deploy gate): **real path**; a candidate saved;
>   Step 7 PASS; Step 8 PASS; Step 9 PASS; Step 10 PASS or N/A (`blank`); every
>   required `SdkMessage` exactly `Update`; every counted run's child ID + parent
>   lookup attribution correct.
> - **partial(proxy)**: same results but on a proxy pair → `[partially verified]`;
>   real-schema repeat = P4 (post-deploy). **Does NOT clear the gate as full VERIFIED.**
> - **FAIL → Option B, no schema rework**: no candidate saves; Step 7, 8, or 9
>   fails; Step 10 fails when `configured`; any required `SdkMessage` ≠ `Update`;
>   or child/parent attribution missing/ambiguous. A FAIL is a useful, expected
>   outcome — it routes to a drain-side fallback with **zero schema rework**, not
>   a schema rollback.

🔴 **Motivated-reasoning guard.** Justin told Connor "Plan B seemed like a lot of
extra work" and Connor is "thinking about how to make Plan A viable." Working the
Step-4 candidate ladder hard is the *intended* test. The hazard is pressure to
return **VERIFIED** when the honest result is **FAIL** or **partial(proxy)**.
The *immediate* fallback B (drain-side) is light, zero schema rework; only the
post-pilot portal-wide B is the heavy lift — do not let "B = work" bleed into the
verdict. Guard specifically against:

- **(a)** prose "it fired" with no run IDs / `SdkMessage` literals / parent-GUID;
- **(b)** `partial(proxy)` banked as full VERIFIED — proxy still needs a
  real-schema repeat = precondition **P4 (post-deploy)**;
- **(c)** any `SdkMessage` ≠ `Update` waved through;
- **(d)** a *redesigned* trigger/flow conflated with a P1-Update pass — a new
  mechanism must clear Steps 7–9 itself.

Authoritative verdict-checker detail (kept in sync): memory
`slice0-deactivate-not-delete-recalc` (harness store) §"Status update — S165"
and `.claude-memory/` mirror.

---

## 5. On a clean clear — deploy sequence (reference; `--execute` never autonomous)

Triggered only by a clean **VERIFIED (real path)** in §4 **or** a Justin-signed
Artifact 1 waiver, and only with Justin's explicit in-session go-ahead:

1. Re-run BOTH point-in-time probes (read-only; must be CLEAR at deploy time, not
   just historically): `node scripts/probe-apprequestperson-role-data.js` and
   `node scripts/probe-slice0-attr-collision.mjs`.
2. Grep live callers of any surface slice-0 touches; confirm none load-bearing.
3. `node scripts/apply-dataverse-schema.js --target=prod --wave=4 --execute`
4. `node scripts/extend-apprequestperson-role-picklist.mjs`
5. `node scripts/setup-database.js` (applies V30 `submission_jobs`)
6. Post-deploy: re-run `npm run check:atlas` + the 3 P0 gates; if proxy path was
   used in (i), P4 real-schema repeat is now due before PA-flow-live.

Specs are READY at `lib/dataverse/schema/wave4*/` — **do NOT re-author them.**

---

## 6. Item 6 document map (what each doc is for)

| Doc | Role | Authoritative for |
|---|---|---|
| **`INTAKE_PORTAL_ITEM_6_STATUS.md`** (this) | **Canonical status dashboard** | **Current state: is slice-0 cleared, gate, waiver/Connor status** |
| `INTAKE_PORTAL_ITEM_6_DISCUSSION.md` §0 | Locked decision record | The *design decision* (deactivate-not-delete, A+B hybrid, the 4 preconditions) |
| `INTAKE_PORTAL_ITEM_6_CONNOR_CORE_GATE.md` | Live test handout sent to Connor | The Step 1–12 test mechanics + Step 11/12 acceptance literals |
| `INTAKE_PORTAL_ITEM_6_CONNOR_EMAIL.md` | Cover email (uncommitted, local) | — (regenerate from CORE_GATE if missing) |
| `INTAKE_PORTAL_ITEM_6_P1UPDATE_TEST_DRAFT_v5.md` | Full runbook + waiver Artifact 1 | The waiver text (Artifact 1, UNAUTHORIZED) + full §5 procedures |
| `INTAKE_PORTAL_ITEM_6_P1UPDATE_TEST_DRAFT{,_v2,_v3,_v4}.md` | Superseded review drafts | History only — superseded by v5 / CORE_GATE |
| `INTAKE_PORTAL_ITEM_6_MAKER_PORTAL_TESTS.md` | Pre-deactivate (2026-05-14) test runbook | History; §3 Candidates A–E still referenced by `DISCUSSION.md` §0 |
| `INTAKE_PORTAL_ITEM_6_QUICK_PROBE.md` | Pre-deactivate fast probe (Option A) | History only — Option A (delete-driven) is dead |

Verdict-checker / acceptance detail also lives in memory
`slice0-deactivate-not-delete-recalc` and its `.claude-memory/` mirror.
