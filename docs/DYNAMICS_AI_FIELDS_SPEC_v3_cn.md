# Dynamics Custom Fields for AI Output — Implementation Spec

**Author:** Connor
**Status:** v3 — **Implementation complete.** `wmkf_ai_run` table, Field Sets A & C, Choices, and permissions all created in Dynamics. Field Set B remains on hold.
**Date:** 2026-04-14
**Based on:** Justin's v2 spec (`input/DYNAMICS_AI_FIELDS_SPEC.md`)

---

## Field Name Translation Key

Some field names have been modified from the original spec. This table maps old → new for anyone building app-side connections.

| Original name (Justin's specs) | New name (Dynamics) | Change reason |
|-------------------------------|---------------------|---------------|
| `wmkf_ai_run` (table) | `wmkf_ai_run` | No change |
| `wmkf_runid` | `wmkf_ai_runid` | Standardized to `wmkf_ai_` prefix |
| *(new)* | `wmkf_ai_runnum` | New field — auto-number Primary column for user-facing record identifier |
| `wmkf_request` | `wmkf_ai_request` | Standardized to `wmkf_ai_` prefix |
| `wmkf_task_type` | `wmkf_ai_tasktype` | Prefix + no underscores after prefix |
| `wmkf_generated_at` | `createdon` (built-in) | Replaced with Dynamics default field |
| `wmkf_model` | `wmkf_ai_model` | Standardized to `wmkf_ai_` prefix |
| `wmkf_prompt_version` | `wmkf_ai_promptversion` | Prefix + no underscores after prefix |
| `wmkf_status` | `wmkf_ai_status` | Standardized to `wmkf_ai_` prefix |
| `wmkf_raw_output` | `wmkf_ai_rawoutput` | Prefix + no underscores after prefix |
| `wmkf_notes` | `wmkf_ai_notes` | Standardized to `wmkf_ai_` prefix |
| `wmkf_ai_structured_data` | `wmkf_ai_dataextract` | Renamed + no underscores after prefix |
| `wmkf_ai_compliance_issues` | `wmkf_ai_complianceissues` | No underscores after prefix |
| `wmkf_ai_compliance_summary` | `wmkf_ai_compliancesummary` | No underscores after prefix |
| `wmkf_ai_summary` | `wmkf_ai_summary` | No change |

**Naming convention:** All custom fields use the `wmkf_ai_` prefix. No additional underscores appear after the prefix (e.g., `wmkf_ai_tasktype` not `wmkf_ai_task_type`).

---

## Child Table — `wmkf_ai_run`

One row per AI processing run. Serves as an audit trail and replay cache. Both Vercel apps and PowerAutomate flows write here on every run.

| Field | Type | Purpose |
|-------|------|---------|
| `wmkf_ai_runid` | Unique Identifier (auto) | System GUID for the record |
| `wmkf_ai_runnum` | Auto-number (Primary column) | User-facing record identifier |
| `wmkf_ai_request` | Lookup → `akoya_request` | The request this run was for |
| `wmkf_ai_tasktype` | Choice | Which AI task ran |
| `createdon` *(built-in)* | DateTime | When the AI call ran — uses Dynamics default field, no custom field needed |
| `wmkf_ai_model` | Single-line text (~64) | Claude model ID (e.g. `claude-sonnet-4`) |
| `wmkf_ai_promptversion` | Whole number | Prompt version, bumped on prompt text changes |
| `wmkf_ai_status` | Choice | Run outcome |
| `wmkf_ai_rawoutput` | Multi-line text (JSON) | Full structured payload from Claude |
| `wmkf_ai_notes` | Multi-line text | Failure messages, retry context |

**Dynamics Explorer note:** This table should be excluded from search results and schema suggestions in the chat tool. It's an operational log, not business data. Justin will handle this on the app side once the table exists.

---

## Choices

| Choice | Label | Value |
|--------|-------|-------|
| `wmkf_ai_tasktype` | Summary | 682090000 |
| | Report | 682090001 |
| | Check-in | 682090002 |
| | PD Assignment | 682090003 |
| `wmkf_ai_status` | Completed | 682090000 |
| | Failed | 682090001 |
| | Needs Review | 682090002 |

**Note:** API calls must use the numeric values, not the labels. The original spec's "compliance" label was renamed to "Check-in" to better reflect the task's purpose in the grant workflow.

---

## Field Set A — Proposal Intake Summary

Fields on `akoya_request`. Current values only; provenance lives in `wmkf_ai_run` with `wmkf_ai_tasktype = 682090000` (Summary).

| Field | Type | Purpose |
|-------|------|---------|
| `wmkf_ai_summary` | Multi-line text | AI-generated proposal summary narrative |
| `wmkf_ai_dataextract` | Multi-line text (JSON) | Keywords, PI name(s), methods, etc. |

---

## Field Set C — Compliance Check

Fields on `akoya_request`. Provenance lives in `wmkf_ai_run` with `wmkf_ai_tasktype = 682090002` (Check-in).

| Field | Type | Purpose |
|-------|------|---------|
| `akoya_submissionaccepted` *(existing)* | Two options | Compliance pass/fail — AI writes this on completion |
| `wmkf_ai_complianceissues` | Multi-line text (JSON) | Array of `{category, severity, description}` |
| `wmkf_ai_compliancesummary` | Multi-line text | Human-readable one-paragraph summary |

Sample JSON for `wmkf_ai_complianceissues`:

```json
[
  { "category": "budget", "severity": "error", "description": "Budget exceeds $1M cap" },
  { "category": "format", "severity": "warning", "description": "Missing biosketch for co-PI" }
]
```

`severity` values: `error`, `warning`, `info`

---

## Field Set D — PD Assignment

**No new fields on `akoya_request`.** The AI writes directly to the existing `wmkf_programdirector` lookup. Confidence, rationale, and alternate candidates are exported to an Excel sheet by PowerAutomate for human audit — not persisted in Dynamics.

A `wmkf_ai_run` row is still created with `wmkf_ai_tasktype = 682090003` (PD Assignment) for traceability.

---

## Field Set B — Grant Report Extraction

**ON HOLD — pending further staff review before implementation.** Field definitions below are provisional and may change based on feedback.

**Naming note:** Field names below have been updated from Justin's original spec to follow the `wmkf_ai_` prefix convention with no additional underscores (e.g., `wmkf_ai_report_postdocs` → `wmkf_ai_reportpostdocs`). Some publication fields were also shortened (e.g., `wmkf_ai_report_publications_total` → `wmkf_ai_reportpubstotal`). These will be added to the translation key when the hold is lifted.

Provenance lives in `wmkf_ai_run` with `wmkf_ai_tasktype = 682090001` (Report).

### Counts (numeric, filterable)

Fields on `akoya_request`. All count fields should allow null — the AI returns `null` when a count isn't stated in the report.

| Field | Type | Purpose |
|-------|------|---------|
| `wmkf_ai_reportpostdocs` | Whole number | Postdocs supported by this grant |
| `wmkf_ai_reportgradstudents` | Whole number | Graduate students supported |
| `wmkf_ai_reportundergrads` | Whole number | Undergraduates supported |
| `wmkf_ai_reportpubstotal` | Whole number | Total publications from the grant |
| `wmkf_ai_reportpubspeerreviewed` | Whole number | Peer-reviewed publications |
| `wmkf_ai_reportpubsnonpeerreviewed` | Whole number | Non-peer-reviewed publications |
| `wmkf_ai_reportpatentsawarded` | Whole number | Patents awarded during the grant |
| `wmkf_ai_reportpatentssubmitted` | Whole number | Patents filed/submitted |
| `wmkf_ai_reportadditionalfunding` | Multi-line text | Short description of additional funding leveraged |

### Narratives (freeform text)

Multi-line text fields on `akoya_request`. Staff can edit after the AI produces a draft.

| Field | Type | Purpose |
|-------|------|---------|
| `wmkf_ai_reportprojectimpacts` | Multi-line text | Multi-paragraph project impacts narrative |
| `wmkf_ai_reportawardsandhonors` | Multi-line text | Awards and honors received during grant period |
| `wmkf_ai_reportpublication1` | Multi-line text (JSON) | `{citation, abstract, source}` for top publication |
| `wmkf_ai_reportpublication2` | Multi-line text (JSON) | `{citation, abstract, source}` for second publication |
| `wmkf_ai_reportimplications` | Multi-line text | Staff-draft implications for future grantmaking |

**Publication fields note:** Each publication has citation + abstract + a flag for whether the abstract was verbatim or AI-summarized. JSON blob keeps these together. Alternative: flat fields per publication (`wmkf_ai_reportpub1citation`, `wmkf_ai_reportpub1abstract`, `wmkf_ai_reportpub1source` x2). Decision still open.

### Goals assessment (structured)

| Field | Type | Purpose |
|-------|------|---------|
| `wmkf_ai_reportoverallrating` | Choice (on hold) | `successful`, `mixed`, `unsuccessful` |
| `wmkf_ai_reportoutcomesummary` | Multi-line text | 2–4 sentence summary of overall delivery |
| `wmkf_ai_reportgoalsassessment` | Multi-line text (JSON) | Full per-goal breakdown (see sample below) |
| `wmkf_ai_reportnotesforstaff` | Multi-line text | Things a PD should double-check |

Sample JSON for `wmkf_ai_reportgoalsassessment`:

```json
[
  {
    "goal_number": "Aim 1",
    "goal_text": "Develop a novel catalyst for…",
    "evidence_from_report": "Section 3 describes completion of…",
    "status": "achieved",
    "confidence": "high"
  },
  {
    "goal_number": "Aim 2",
    "goal_text": "…",
    "status": "partial",
    "confidence": "medium"
  }
]
```

`status` values: `achieved`, `partial`, `not_addressed`, `pivoted`
`confidence` values: `high`, `medium`, `low`

---

## Permissions / Admin Actions

| Action | Detail | Status |
|--------|--------|--------|
| Write permissions on app registration | Custom security role: `prvUpdate` on `akoya_request`, `prvCreate`/`prvUpdate` on `wmkf_ai_run`. App ID: `d2e73696-537a-483b-bb63-4a4de6aa5d45` | **Done** (2026-04-14) |
| Activity privileges | `prvCreateActivity`, `prvWriteActivity`, `prvReadActivity` on Activity entity + `prvSendAsUser` (already granted). Note: `prvSendEmail` from Justin's original spec does not exist as a distinct privilege — `prvSendAsUser` + Activity privileges should cover it. Justin to verify with `node scripts/test-dynamics-email.js`. | **Done** (2026-04-14) |
| SharePoint write grant | `Sites.Selected` write access on akoyaGO site for the app registration | **Done** (2026-04-15) — IT granted write via Graph API |

---

## Implementation Status

1. ~~`wmkf_ai_run` child table + Choices~~ — **Done** (2026-04-14)
2. ~~Field Set A — Proposal Intake Summary~~ — **Done** (2026-04-14)
3. ~~Field Set C — Compliance Check~~ — **Done** (2026-04-14)
4. Field Set B — **On hold** (pending staff review)
5. Field Set D — no field work needed, just the write permission grant

---

## References

- `DYNAMICS_AI_FIELDS_SPEC_v2.md` — Justin's v2 spec (superseded; historical only)
- `BACKEND_AUTOMATION_PLAN.md` — 5-phase roadmap
- `DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md` — identity bridge plan
- `PENDING_ADMIN_REQUESTS.md` — full list of outstanding admin requests

---

## Post-v3 notes (2026-04-14, Justin)

Verification and Connor follow-up after the v3 hand-off.

### Write access verified

- Ran `scripts/test-dynamics-write.js` against test request `992629`. Full round-trip PATCH succeeded on a memo field on `akoya_request`. Scoped-write probe against `systemuser` correctly returned 403. Details in session log.
- Ran `scripts/test-dynamics-email.js --send`. Outbound email via the SendEmail action succeeded end-to-end, confirming the Activity privilege grant covers email send. `prvSendAsUser` + Activity privileges are sufficient — no separate `prvSendEmail` needed.

### Items clarified with Connor

| Item | Resolution |
|------|------------|
| Field Set B (Grant Report) hold | Reporting scope still needs input from staff beyond Connor. No timeline; the Grant Reporting app will continue running without CRM writeback until Set B is unblocked. |
| Duplicate `wmkf__ai_summary` field (double underscore) on `akoya_request` | Confirmed as a mistake. Connor will delete it. Canonical field is `wmkf_ai_summary` (single underscore). |
| `wmkf_ai_rundatetime` on `wmkf_ai_run` | Connor created it but it's vestigial. Apps should use the built-in `createdon` column as stated in the main v3 doc. Do **not** write to `wmkf_ai_rundatetime`. |

### Privilege gaps noted (not currently blocking)

- **`prvCreateNote` on `annotation`** — the grant does not include Note creation. Nothing in v3 requires it, but if a future flow wants to drop audit notes on records, we'd need to request this.
- ~~**SharePoint `Sites.Selected` write**~~ — **Resolved** (2026-04-15). IT granted write access on akoyaGO site.
