# Dynamics Custom Fields for AI Output — Spec for Connor (v2, superseded)

> **Superseded by [DYNAMICS_AI_FIELDS_SPEC_v3_cn.md](./DYNAMICS_AI_FIELDS_SPEC_v3_cn.md)** — Connor's v3 is the canonical, implemented spec as of 2026-04-14. This v2 is retained for historical context only. Field names, Choice values, and the `wmkf_ai_run` schema in v2 do **not** match what's actually live in Dynamics — refer to v3.

**Audience:** Connor (AkoyaGO / Power Platform admin)
**Author:** Justin Gallivan
**Status:** v2 — superseded by v3.

---

## Background

The Keck AI apps (Phase I/II Summaries, Grant Reporting, Compliance Screener, PD Assignment) currently write nothing back to Dynamics. All outputs live on Vercel Postgres or are displayed transiently in the browser. The long-term plan ([BACKEND_AUTOMATION_PLAN.md](./BACKEND_AUTOMATION_PLAN.md)) is:

1. **Human-initiated writes** — staff clicks "Save to CRM" in the Vercel app; the app updates the relevant record.
2. **Backend-triggered writes** — PowerAutomate flows on status change call the same Claude prompts and update the record unattended.

Both paths write to the same fields, so we only need to spec them once.

---

## Decisions incorporated from v1 review

- **Metadata moves to a child entity.** Per-task `*_generated_at`, `*_model`, `*_version`, `*_status` fields are dropped from `akoya_request` — that history lives in a new `wmkf_ai_run` table (below). Only "current values" stay on the request.
- **Dynamics audit history** covers who/when/old-new for the flat fields on the request, so we don't duplicate that.
- **Compliance pass/fail** reuses the existing `akoya_submissionaccepted` boolean instead of a new field.
- **Compliance phase field** is dropped — single-stage submissions are coming, Phase I is going away.
- **PD assignment** writes directly to the existing `wmkf_programdirector` lookup rather than through an intermediate `wmkf_ai_pd_recommended` field. Confidence / rationale / alternates don't land in Dynamics — PowerAutomate exports them to an Excel sheet for human audit.
- **PD expertise lookup** stays out of scope here. The Power Platform flow hardcodes PD GUIDs and expertise in the system prompt for now; future dynamic lookup is tracked separately.
- **Naming convention** (`wmkf_ai_*`) confirmed.
- **New Choices (option sets)** OK to create as needed.

---

## Prerequisites (not fields, but related)

### Write permission on the app registration

- **App ID:** `d2e73696-537a-483b-bb63-4a4de6aa5d45` (same registration used by Dynamics Explorer today)
- **Current permission:** Read-only via service principal
- **Needed:** Custom security role granting `prvUpdate` on `akoya_request` and `prvCreate`/`prvUpdate` on the new `wmkf_ai_run` table

Once granted, the Vercel apps and PowerAutomate flows can write.

---

## Naming convention

All custom fields on `akoya_request` use the `wmkf_ai_` prefix, grouped by task:

- `wmkf_ai_summary_*` — proposal intake summary
- `wmkf_ai_report_*` — grant report extraction
- `wmkf_ai_compliance_*` — compliance check
- (PD assignment writes to the existing `wmkf_programdirector` lookup — no new prefix needed)

**Rule of thumb:** structured data that staff will filter/sort on gets its own typed field. Freeform narrative text gets a multi-line text field. Rich structured output (list of goals with statuses, list of compliance issues) goes into a single multi-line text JSON field to avoid exploding the schema.

---

## Child entity — `wmkf_ai_run` (new table)

One row per AI processing run. Serves as both an audit trail and a replay cache. The Vercel apps and PowerAutomate flows write here on every run, even when the "current value" fields on `akoya_request` are also updated.

| Field | Type | Purpose |
|-------|------|---------|
| `wmkf_runid` | Primary key (auto) | |
| `wmkf_request` | Lookup → `akoya_request` | The request this run was for |
| `wmkf_task_type` | Option set | `summary`, `report`, `compliance`, `pd_assignment` |
| `wmkf_generated_at` | DateTime | When the AI call ran |
| `wmkf_model` | Single-line text (~64) | Claude model ID (e.g. `claude-sonnet-4`) |
| `wmkf_prompt_version` | Whole number | Prompt version, bumped whenever we change prompt text |
| `wmkf_status` | Option set | `completed`, `failed`, `needs_review` |
| `wmkf_raw_output` | Multi-line text (JSON) | Full structured payload from Claude — enables replay/debugging without re-running the model |
| `wmkf_notes` | Multi-line text | Failure messages, retry context, anything worth preserving |

**Dynamics Explorer note:** the chat tool should be configured to **exclude `wmkf_ai_run` from search results and schema suggestions**. It's an operational log, not business data — staff shouldn't see these records surfacing in natural-language queries about grants. Justin will add the exclusion on the app side.

---

## Field Set A — Proposal Intake Summary

Fields on `akoya_request`. Current values only.

| Field | Type | Purpose |
|-------|------|---------|
| `wmkf_ai_summary` | Multi-line text | AI-generated proposal summary narrative |
| `wmkf_ai_structured_data` | Multi-line text (JSON) | Keywords, PI name(s), methods, etc. |

*(Provenance — when/model/version — lives in the `wmkf_ai_run` child row with `wmkf_task_type = 'summary'`.)*

---

## Field Set B — Grant Report Extraction (Grant Reporting app)

Fields on `akoya_request`. The form staff see today has three sections: header (pulled from Dynamics, no new fields), counts (numeric), and narratives. This field set mirrors that structure.

### Counts (numeric, filterable)

Flat integers let staff build Dynamics views/reports like "grants with ≥3 peer-reviewed publications":

| Field | Type | Purpose |
|-------|------|---------|
| `wmkf_ai_report_postdocs` | Whole number | Postdocs supported by this grant |
| `wmkf_ai_report_grad_students` | Whole number | Graduate students supported |
| `wmkf_ai_report_undergrads` | Whole number | Undergraduates supported |
| `wmkf_ai_report_publications_total` | Whole number | Total publications from the grant |
| `wmkf_ai_report_publications_peer_reviewed` | Whole number | Peer-reviewed publications |
| `wmkf_ai_report_publications_non_peer_reviewed` | Whole number | Non-peer-reviewed publications |
| `wmkf_ai_report_patents_awarded` | Whole number | Patents awarded during the grant |
| `wmkf_ai_report_patents_submitted` | Whole number | Patents filed/submitted |
| `wmkf_ai_report_additional_funding` | Multi-line text | Short description of additional funding leveraged |

All count fields should allow null — the AI returns `null` when a count isn't stated in the report, and we want to preserve that distinction.

### Narratives (freeform text)

Multi-line text. Staff can edit after the AI produces a draft.

| Field | Type | Purpose |
|-------|------|---------|
| `wmkf_ai_report_project_impacts` | Multi-line text | Multi-paragraph project impacts narrative |
| `wmkf_ai_report_awards_and_honors` | Multi-line text | Awards and honors received during grant period |
| `wmkf_ai_report_publication_1` | Multi-line text (JSON) | `{citation, abstract, source}` for top publication |
| `wmkf_ai_report_publication_2` | Multi-line text (JSON) | `{citation, abstract, source}` for second publication |
| `wmkf_ai_report_implications` | Multi-line text | Staff-draft implications for future grantmaking |

**Publication fields note:** each publication has citation + abstract + a flag for whether the abstract was verbatim or AI-summarized. JSON blob keeps these together without six flat fields. If you'd rather have flat fields (`wmkf_ai_report_pub1_citation`, `...pub1_abstract`, `...pub1_source` × 2) for easier display in Dynamics forms, tell me — happy either way.

### Goals assessment (structured)

The AI compares the original proposal to the report and rates each stated aim. Flat "overall rating" (for filtering/reporting) plus the full structured output (for display).

| Field | Type | Purpose |
|-------|------|---------|
| `wmkf_ai_report_overall_rating` | Option set | `successful`, `mixed`, `unsuccessful` |
| `wmkf_ai_report_outcome_summary` | Multi-line text | 2–4 sentence summary of overall delivery |
| `wmkf_ai_report_goals_assessment` | Multi-line text (JSON) | Full per-goal breakdown (see sample below) |
| `wmkf_ai_report_notes_for_staff` | Multi-line text | Things a PD should double-check |

Sample JSON for `wmkf_ai_report_goals_assessment`:

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

*(Provenance lives in `wmkf_ai_run` with `wmkf_task_type = 'report'`.)*

---

## Field Set C — Compliance Check

Fields on `akoya_request`. Two new fields; pass/fail reuses an existing one.

| Field | Type | Purpose |
|-------|------|---------|
| `akoya_submissionaccepted` *(existing)* | Two options | Compliance pass/fail. AI writes this on completion. |
| `wmkf_ai_compliance_issues` | Multi-line text (JSON) | Array of `{category, severity, description}` |
| `wmkf_ai_compliance_summary` | Multi-line text | Human-readable one-paragraph summary |

Sample JSON for `wmkf_ai_compliance_issues`:

```json
[
  { "category": "budget", "severity": "error", "description": "Budget exceeds $1M cap" },
  { "category": "format", "severity": "warning", "description": "Missing biosketch for co-PI" }
]
```

`severity` values: `error`, `warning`, `info`

*(Provenance lives in `wmkf_ai_run` with `wmkf_task_type = 'compliance'`.)*

---

## Field Set D — PD Assignment

**No new fields on `akoya_request`.**

The AI writes directly to the existing `wmkf_programdirector` lookup. Confidence, rationale, and alternate candidates are written to an Excel sheet by PowerAutomate for human audit — not persisted in Dynamics.

A `wmkf_ai_run` row is still created with `wmkf_task_type = 'pd_assignment'` so we can trace which run set which PD.

---

## Option set values summary

| Option set | Values |
|------------|--------|
| `wmkf_task_type` *(on `wmkf_ai_run`)* | `summary`, `report`, `compliance`, `pd_assignment` |
| `wmkf_status` *(on `wmkf_ai_run`)* | `completed`, `failed`, `needs_review` |
| `wmkf_ai_report_overall_rating` | `successful`, `mixed`, `unsuccessful` |

New Choices to create; no existing option sets need reusing at this point.

---

## Suggested implementation order

We don't need all of this on day one. In priority order:

1. **`wmkf_ai_run` child table + option sets.** Foundation for everything else. Enables the Vercel apps to start logging AI runs even before flat fields exist.
2. **Field Set B — Grant Report Extraction.** Staff are test-driving the Grant Reporting app now and will want to save results to Dynamics soon.
3. **Field Set A — Proposal Summary.** Used by Phase I/II Writeup apps; low urgency because they're already usable without CRM writeback.
4. **Field Set C — Compliance Check.** Aligns with Phase 4 of the backend automation plan.
5. **(No field work for Set D — just needs the write permission grant.)**

Each set is independent after (1) lands — we can build and use the apps against Set B while you're still defining Set C.

---

## Open items

1. **Publication fields shape** (Set B narratives) — single JSON field per publication, or three flat fields per publication? Tell me which fits AkoyaGO better.
2. **Write permission grant** on the app registration is still outstanding — all of this is useful only once that's in place.
3. **Dynamics Explorer exclusion** of `wmkf_ai_run` from search results will be handled on Justin's side once the table exists.

---

## References

- [GRANT_CYCLE_LIFECYCLE.md](./GRANT_CYCLE_LIFECYCLE.md) — full grant proposal lifecycle with AI task mapping
- [BACKEND_AUTOMATION_PLAN.md](./BACKEND_AUTOMATION_PLAN.md) — roadmap for the Vercel → PowerAutomate migration
- [DYNAMICS_SCHEMA_ANNOTATION.md](./DYNAMICS_SCHEMA_ANNOTATION.md) — existing `akoya_request` fields, for naming-convention reference
- [DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md](./DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md) — separate plan to bridge app users ↔ Dynamics systemusers, unblocks attributed writes and future dynamic PD lookup
