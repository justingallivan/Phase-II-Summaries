# Atlas: `wmkf_policy` + `wmkf_policyversion` (Dataverse)

**Last verified:** 2026-05-09 (created S143)
**Live row counts:** `wmkf_policy` = 2 (`reviewer-coi`, `reviewer-ai-use`); `wmkf_policyversion` = 2 (one Active child per parent)
**Entity sets:** `wmkf_policies` (parent), `wmkf_policyversions` (child)
**Schema manifests:**
- `lib/dataverse/schema/wave3/01_wmkf_policy.json` (parent entity create)
- `lib/dataverse/schema/wave3/02_wmkf_policyversion.json` (child entity create + parent lookup)
- `lib/dataverse/schema/wave3/03_wmkf_policy_activeversion.json` (parent → active child lookup, added after both entities exist to break the cyclic dependency)

**Seed script:** `scripts/seed-stage2a-policies.mjs`

## Source of truth

**Active.** Staff-editable policy library. Each parent `wmkf_policy` row is a stable conceptual slot (e.g., `reviewer-coi`); each `wmkf_policyversion` child is one specific version of the policy text. The parent's `wmkf_activeversion` lookup points at whichever child is currently in force. Reviewer-facing surfaces fetch the active child by slot code at render time.

General-purpose: applicant T&C, staff handbook, and other future surfaces use the same entity pair without schema changes.

## Schema

### `wmkf_policy` (parent — slot)

| Field | Type | Purpose |
|---|---|---|
| `wmkf_policyid` | Uniqueidentifier (PK) | |
| `wmkf_code` | String, primary name attribute, alt-key `wmkf_policy_code_unique` | Stable slot identifier in kebab-case (e.g., `reviewer-coi`). Application code references slot codes directly. |
| `wmkf_displayname` | String | Human-readable slot name for staff browsing in Dynamics views. |
| `wmkf_description` | Memo | Internal staff note: what the slot is for, where it surfaces. |
| `wmkf_activeversion` | Lookup → `wmkf_policyversion` | The currently-active child. Reading this is the only authoritative way to find the in-force policy text for a slot. |
| `statecode`, `statuscode` | State / Status | Slot lifecycle. |

### `wmkf_policyversion` (child — versioned text)

| Field | Type | Purpose |
|---|---|---|
| `wmkf_policyversionid` | Uniqueidentifier (PK) | |
| `wmkf_versionlabel` | String, primary name attribute (Application Required) | Free-form version identifier (e.g., `2026-05-09`, `v1.2`). Operationally meaningful — appears in screenshots, printouts, audit trails. |
| `wmkf_policy` | Lookup → `wmkf_policy` (Application Required) | Parent slot. |
| `wmkf_policytitle` | String (Application Required) | Card heading rendered in the modal. |
| `wmkf_policybody` | Memo (Application Required) | Full policy text (markdown or plain). |
| `wmkf_effectivedate` | DateTime | When staff intended this version to take effect. **Informational only** — activation is staff-controlled via the parent's `wmkf_activeversion` lookup, not date-driven. |
| `statecode`, `statuscode` | State / Status | Draft / Active / Retired. |

## Read paths

**Render-time fetch by slot code:**

```
GET wmkf_policies?$filter=wmkf_code eq '<slot-code>' and statecode eq 0
  &$expand=wmkf_activeversion($select=wmkf_policyversionid,wmkf_versionlabel,wmkf_policytitle,wmkf_policybody,wmkf_effectivedate)
```

**Historical ack resolution (from a `wmkf_appreviewersuggestion` ack lookup):**

```
GET wmkf_appreviewersuggestions(<id>)?$select=wmkf_coiackedat,wmkf_aiuseackedat
  &$expand=wmkf_coipolicyversion($select=wmkf_versionlabel,wmkf_policytitle,wmkf_policybody;
           $expand=wmkf_policy($select=wmkf_code,wmkf_displayname))
```

The lookup chain (engagement → version → parent slot) preserves the exact policy text the reviewer saw at acknowledgment time, regardless of subsequent staff edits or activation flips.

## Write paths (staff-controlled, no application writes)

- **Add a new policy version:** create a `wmkf_policyversion` child under an existing parent in `Draft`; flip parent's `wmkf_activeversion` lookup when ready. Existing acks against the prior active row remain valid (lookup pins to the specific child GUID).
- **Activate a draft:** flip parent's `wmkf_activeversion`; old child becomes `Retired` by convention (manual statuscode update, not automatic).
- **Edit body in-place:** **DO NOT** edit `wmkf_policybody`/`wmkf_policytitle`/`wmkf_versionlabel` on a child once any engagement row references it. Create a new version row instead. See immutability rules in `docs/REVIEWER_STAGE_2A_BUILD_PLAN.md` §4a.

## Immutability and delete enforcement

Two layers:
1. **Referential** — the lookups from `wmkf_appreviewersuggestion` to `wmkf_policyversion` use default `Restrict` cascade on delete. A delete of a referenced child fails at the database level.
2. **Security role** (TODO before slice 1 ships to a real cycle): restrict delete privilege on `wmkf_policy` and `wmkf_policyversion` to a small admin role. Ordinary staff who can edit policy bodies should NOT have delete privilege on used rows.

## Seeded slot rows (2026-05-09)

| Code | Display name | Active version label | Body source |
|---|---|---|---|
| `reviewer-coi` | Reviewer Confidentiality and Conflict of Interest | `2026-05-09` | **Placeholder** — pending staff wording feedback per `docs/REVIEWER_STAGE_2A_BUILD_PLAN.md` open question 7. Replace with finalized text via Dynamics admin (create new version row, flip active_version) before slice 1 ships to a real reviewer. |
| `reviewer-ai-use` | Reviewer AI-Use Policy | `2026-05-09` | Lifted from existing review form footer text. May want staff review on parity with what reviewers see today. |

## Cross-system

None. Net-new entity pair; no Postgres mirror, no legacy migration.

## Migration disposition

N/A — created in S143 Stage 2a slice 1.
