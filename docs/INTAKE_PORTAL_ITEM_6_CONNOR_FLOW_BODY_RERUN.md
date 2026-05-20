# Connor — Option A′ Flow-Body-Conditional Re-Run

> **Canonical status:** `INTAKE_PORTAL_ITEM_6_STATUS.md`. The original core-gate
> (`INTAKE_PORTAL_ITEM_6_CONNOR_CORE_GATE.md`) returned **FAIL** on Step 8
> (2026-05-20): trigger-level `Filter rows` with lookup-traversal Picklist
> equality "saves but does not evaluate at runtime." That closed the P1-Update
> gate and unblocked the slice-0 schema deploy.
>
> This handout is the **light re-run** for Option A′ — the flow-body-conditional
> mechanism you proposed in lieu of the trigger-level filter. It does NOT gate
> the schema deploy. It gates **PA-flow-live** for the recompute, alongside P4
> (real-schema repeat on `wmkf_proposalbudgetline` after deploy).

**Scope:** ~20–30 minutes. Two tests + one quantification.

---

## What changed from CORE_GATE.md

- **Trigger Filter rows:** **blank** (removes the lookup-traversal Picklist
  equality that failed Step 8).
- **Trigger Select columns:** still **blank** (locked design decision, S163).
- **New flow body:** explicit "Get a row by ID" on the parent + an `If`
  condition gating the downstream work. Trigger fires on every
  `wmkf_proposalbudgetline` modification org-wide; flow body short-circuits
  unless parent Picklist matches.
- **Picklist target:**
  - **Pilot (this re-run):** `wmkf_phaseiistatus eq 100000002` ("Phase II
    Pending Committee Review"). Same field you used in the original Step 8.
  - **Broader rollout (post-pilot):** `wmkf_phaseistatus eq <int>` — Phase I
    source-of-truth Picklist. Out of scope for this re-run.
- **Field framing (S169 ground-truth correction):** `akoya_requeststatus`
  (String) is a *derived* rollup. `wmkf_phaseistatus` and `wmkf_phaseiistatus`
  (both Picklists) are the canonical source-of-truth on `akoya_request`.
  Filtering on source Picklist is the engineering-preferred handle.

---

## STEP 1 — Build the Option A′ flow

Clone the existing flow (or create a sibling). Configure trigger and body as
follows; everything from CORE_GATE Step 5 still applies except for the changes
called out.

1. Trigger: Microsoft Dataverse **When a row is added, modified or deleted**.
2. Trigger config: Change type `Modified` · Table name `[CHILD_TABLE]` · Scope
   `Organization` · Select columns **blank** · **Filter rows blank**.
3. Compose `Dump trigger` → `triggerOutputs()` (as before).
4. Compose `SdkMessage` → `triggerOutputs()?['body/SdkMessage']` (as before).
5. Compose `Trigger child id` → raw child PK from trigger body (as before).
6. Compose `Trigger parent lookup` →
   `triggerOutputs()?['body/[CHILD_PARENT_LOOKUP_PROPERTY]']` (as before).
7. **NEW — "Get a row by ID"** action (Microsoft Dataverse) `Fetch parent`:
   - Table name: `[PARENT_TABLE]` (real: `akoya_request`; proxy:
     `akoya_request`).
   - Row ID: the value from compose `Trigger parent lookup`.
   - Select columns: `wmkf_phaseiistatus` (only — keep payload minimal).
8. **NEW — Compose** `Parent picklist value` → `outputs('Fetch_parent')?['body/wmkf_phaseiistatus']`.
9. **NEW — Condition** `Gate-Phase-II`:
   - Left: output of `Parent picklist value`.
   - Operator: **is equal to**.
   - Right: `100000002`.
10. **If yes** branch: the recompute work goes here.
    - For this re-run, drop in the same `List active siblings` action you used
      in CORE_GATE Step 5.12, with the same filter
      (`[CHILD_PARENT_LOOKUP_PROPERTY] eq [PARENT_C_GUID] and statecode eq
      [ACTIVE_STATECODE_INT]`), Select columns
      `[CHILD_PRIMARY_KEY],[CHILD_PARENT_LOOKUP_COLUMN],[AMOUNT_COLUMN],statecode,statuscode`.
    - Add a Compose `Yes-branch reached` → string `"yes-branch"`.
11. **If no** branch: Compose `No-branch reached` → string `"no-branch"`.
12. Save + turn on.

Record any save errors verbatim (none expected; this is standard PA shape).

---

## STEP 2 — TEST 7′ (Gate-FALSE via flow body)

Equivalent of CORE_GATE Step 7. The flow now **DOES** fire (no trigger filter)
but **MUST take the No branch**.

1. Set Parent A `wmkf_phaseiistatus` = `null` (or any value ≠ `100000002`).
2. Confirm `[CHILD_A_GUID]` is Active; reactivate via the CORE_GATE Step 3 PATCH
   if not.
3. Apply CORE_GATE Step 6 observation protocol.
4. Send the CORE_GATE Step 3 **deactivation** PATCH for `[CHILD_A_GUID]`.
5. Count runs after baseline whose child ID = `[CHILD_A_GUID]`. Expect **1**.
6. Open that run:
   - Record `SdkMessage` literal.
   - Record `Parent picklist value` Compose output.
   - Record which branch's Compose ran (`No-branch reached` should have output
     `"no-branch"`; `Yes-branch reached` should be skipped).

**PASS:** run count = 1, `SdkMessage` exactly `Update`, parent lookup present
and = `[PARENT_A_GUID]`, `Parent picklist value` = `null` (or whatever ≠
`100000002` you set), **No branch taken** (Yes branch skipped — `List active
siblings` did not execute).

**FAIL (any of):** Yes branch taken, `SdkMessage` ≠ `Update`, parent lookup
missing/wrong. Stop and report.

---

## STEP 3 — TEST 9′ (Active-subset inside the Yes branch)

Equivalent of CORE_GATE Step 9, now executing inside the `If`-true branch.

1. Set Parent C `wmkf_phaseiistatus` = `100000002`.
2. Create/select `[CHILD_C1_GUID]`, `[CHILD_C2_GUID]`, `[CHILD_C3_GUID]` under
   Parent C; set all Active; amounts `100` / `200` / `300` (or record actuals).
3. Apply CORE_GATE Step 6.
4. Send the CORE_GATE Step 3 **deactivation** PATCH for `[CHILD_C2_GUID]`.
5. Count runs after baseline whose child ID = `[CHILD_C2_GUID]`. Expect **1**.
6. Open that run:
   - Record `SdkMessage` literal.
   - Record `Parent picklist value` Compose output (expect `100000002`).
   - Confirm **Yes branch taken** (`Yes-branch reached` ran).
   - Open `List active siblings` output: record returned child GUIDs,
     state/status, amounts.

**PASS:** run count = 1, `SdkMessage` exactly `Update`, parent lookup present
and = `[PARENT_C_GUID]`, `Parent picklist value` = `100000002`, Yes branch
taken, returned active GUIDs are exactly `[CHILD_C1_GUID]` and `[CHILD_C3_GUID]`,
`[CHILD_C2_GUID]` absent. If amounts available, operator-side sum over returned
active rows = `[CHILD_C1_AMOUNT] + [CHILD_C3_AMOUNT]` (corroborating input
evidence only).

**FAIL (any of):** No branch taken under matching parent, deactivated
`[CHILD_C2_GUID]` in active set, an active sibling missing, count ≠ 1,
`SdkMessage` ≠ `Update`, or wrong sum when amounts available.

---

## STEP 4 — Quantify the firing-rate envelope

Option A′'s mechanism trades trigger-level scoping for a wider firing surface.
We need a number, not an adjective, on the run cost.

Provide:

1. **Estimated `wmkf_proposalbudgetline` modifications per day org-wide** post
   pilot opens. Order-of-magnitude is fine (10s / 100s / 1000s). If you can
   pull a rough figure from a proxy (`akoya_requestpayment` write rate, or any
   sibling table you already track), say so.
2. **PA flow run quota on the flow owner's license.** Per-user or per-flow
   limit (whichever applies under your tenant's PA SKU).
3. **Headroom estimate at pilot scale** (Phase II Research, mid-June 2026,
   ~tens of applicants).
4. **Headroom estimate at broader rollout** (Phase I, where 134 of most-recent
   200 `akoya_request` rows are `Phase I Pending` — much higher volume).

This isn't a pass/fail criterion — it's an artifact for the post-deploy
mechanism decision (Option A′ vs. Option B alone). Numbers in the right
order-of-magnitude are enough.

---

## STEP 5 — What to return

Per-test (7′, 9′): baseline timestamp, run ID, tested child GUID, run count,
`SdkMessage` literal, `Parent picklist value` Compose output, branch taken,
raw trigger-output child row ID, parent-lookup field present/value, raw
trigger-output snippet. Step 9′ also: returned active GUIDs / states /
amounts; expected vs observed.

Plus: the Step 4 firing-rate estimates and any save-time errors building the
flow.

---

## STEP 6 — Verdict

- **PASS — Option A′ cleared for PA-flow-live** (still subject to P4 real-schema
  repeat on `wmkf_proposalbudgetline` post-deploy): Step 7′ PASS + Step 9′ PASS
  + firing-rate envelope acceptable at pilot scale.
- **FAIL — Option A′ not viable**, recompute defaults to Option B alone
  (`$batch` drain hardening, per `DISCUSSION.md §0`). No schema rework either
  way.

Optional, do NOT gate the verdict: reactivation symmetry, rapid two-child
stress, parent-status transition timing. If time permits, mirror
`INTAKE_PORTAL_ITEM_6_P1UPDATE_TEST_DRAFT_v5.md` §5.9 / §5.11 / §5.12.
