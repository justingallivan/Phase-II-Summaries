# Dynamics Custom Fields for AI Output — Spec for Connor

**Audience:** Connor (AkoyaGO / Power Platform admin)
**Author:** Justin Gallivan
**Purpose:** Definitive list of custom fields the AI apps need on `akoya_request` so results can be written back to Dynamics (directly from the Vercel apps today, and from PowerAutomate flows in the near future).
**Status:** Draft — please review and flag anything that's awkward in AkoyaGO or the Power Platform environment before creation.

---

## Background

The Keck AI apps (Phase I/II Summaries, Grant Reporting, Compliance Screener, PD Assignment) currently write nothing back to Dynamics. All outputs live on Vercel Postgres or are displayed transiently in the browser. The long-term plan ([BACKEND_AUTOMATION_PLAN.md](./BACKEND_AUTOMATION_PLAN.md)) is:

1. **Human-initiated writes** — staff clicks "Save to CRM" in the Vercel app; the app updates the relevant record.
2. **Backend-triggered writes** — PowerAutomate flows on status change call the same Claude prompts and update the record unattended.

Both paths write to the same fields, so we only need to spec them once.

---

## Prerequisites (not fields, but related)

### Write permission on the app registration

- **App ID:** `d2e73696-537a-483b-bb63-4a4de6aa5d45` (same registration used by Dynamics Explorer today)
- **Current permission:** Read-only via service principal
- **Needed:** Custom security role granting `prvUpdate` on `akoya_request`
- Once granted, the Vercel apps and PowerAutomate flows can write to any of the fields below.

---

## Naming convention

All custom fields use the `wmkf_ai_` prefix, grouped by task:

- `wmkf_ai_summary_*` — proposal intake summary (already spec'd in GRANT_CYCLE_LIFECYCLE.md)
- `wmkf_ai_report_*` — grant report extraction (new)
- `wmkf_ai_compliance_*` — compliance check results (new)
- `wmkf_ai_pd_*` — PD assignment recommendation (new)

Each task has the same four metadata fields so we can track provenance consistently: **(CN: is there any way to leverage Dynamics' existing Audit History functionality to track this info instead of creating four unique metadata fields for every AI task? When a record is modified Audit History already tracks the date/time, user, field, and old & new values)**

- `*_generated_at` (DateTime)
- `*_model` (Single-line text, ~64 chars)
- `*_version` (Integer — prompt version number, increments when we change prompts)
- `*_status` (Option set: pending / processing / completed / failed / needs_review)

**Rule of thumb we're following:** structured data that staff will filter/sort on gets its own typed field. Freeform narrative text gets a multi-line text field. Everything else (rich structured output like a list of goals with statuses) goes into a single multi-line text JSON field to avoid exploding the schema.

---

## Field Set A — Proposal Intake Summary (already spec'd)

Included here for completeness. These are the fields from `docs/GRANT_CYCLE_LIFECYCLE.md` — no change.

| Field | Type | Purpose |
|-------|------|---------|
| `wmkf_ai_summary` | Multi-line text | AI-generated proposal summary (the narrative) |
| `wmkf_ai_structured_data` | Multi-line text (JSON) | Keywords, PI name(s), methods, etc. |
| `wmkf_ai_summary_generated_at` | DateTime | When AI processing ran |
| `wmkf_ai_summary_model` | Single-line text | Claude model used (e.g. `claude-sonnet-4`) |
| `wmkf_ai_summary_version` | Integer | Prompt version |

**Suggested addition** (not in the original spec but useful for UX parity with the other sets):

| Field | Type | Purpose |
|-------|------|---------|
| `wmkf_ai_summary_status` | Option set | pending / processing / completed / failed / needs_review |

---

## Field Set B — Grant Report Extraction (Grant Reporting app)

The Grant Reporting app extracts structured data from a grantee's progress/final report. The form staff see today has three sections: header (pulled from Dynamics), counts (numeric), and narratives. This field set mirrors that structure.

### Counts (numeric, filterable)

Keeping these as flat integers lets staff build Dynamics views/reports like "grants with ≥3 peer-reviewed publications":

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

Each of these is multi-line text. Staff can edit them in Dynamics after the AI produces a draft.

| Field | Type | Purpose |
|-------|------|---------|
| `wmkf_ai_report_project_impacts` | Multi-line text | Multi-paragraph project impacts narrative |
| `wmkf_ai_report_awards_and_honors` | Multi-line text | Awards and honors received during grant period |
| `wmkf_ai_report_publication_1` | Multi-line text (JSON) | `{citation, abstract, source}` for top publication |
| `wmkf_ai_report_publication_2` | Multi-line text (JSON) | `{citation, abstract, source}` for second publication |
| `wmkf_ai_report_implications` | Multi-line text | Staff-draft implications for future grantmaking |

**Publication fields note:** each publication has a citation + abstract + a flag for whether the abstract was verbatim or AI-summarized. Using a JSON blob keeps these together without creating 6 flat fields. If you'd rather have flat fields (`wmkf_ai_report_pub1_citation`, `wmkf_ai_report_pub1_abstract`, `wmkf_ai_report_pub1_source`) for display in forms, that works too — let me know which you prefer.

### Goals assessment (structured)

The AI compares the original proposal to the report and rates each stated aim. The result is a list of goals with per-goal status and a rolled-up rating. We want both the flat "overall rating" (for filtering/reporting) and the full structured output (for display).

| Field | Type | Purpose |
|-------|------|---------|
| `wmkf_ai_report_overall_rating` | Option set | successful / mixed / unsuccessful |
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

### Metadata

| Field | Type | Purpose |
|-------|------|---------|
| `wmkf_ai_report_generated_at` | DateTime | When AI processing ran |
| `wmkf_ai_report_model` | Single-line text | Claude model used |
| `wmkf_ai_report_version` | Integer | Prompt version |
| `wmkf_ai_report_status` | Option set | pending / processing / completed / failed / needs_review |
| `wmkf_ai_report_source_file` | Single-line text (~255) | Filename of the report document that was processed (for traceability — the app already knows the SharePoint location) |

---

## Field Set C — Compliance Check (Phase I/II)

PowerAutomate will call the compliance prompt once per proposal. The output is pass/fail plus a list of issues. Staff need to be able to filter on the top-level result and see the issue list.

| Field | Type | Purpose |
|-------|------|---------|
| `wmkf_ai_compliance_passed` | Two options (Yes/No) | Quick-filter: did the proposal pass compliance? | **(CN: Suggest we use the existing** `akoya_submissionaccepted` **boolean field)**
| `wmkf_ai_compliance_phase` | Option set | Phase I / Phase II (which compliance prompt ran) | **(CN: superfluous in the light of upcoming change to single stage submissions, no point implementing for one cycle of Phase IIs)**
| `wmkf_ai_compliance_issues` | Multi-line text (JSON) | Array of `{category, severity, description}` objects |
| `wmkf_ai_compliance_summary` | Multi-line text | Human-readable one-paragraph summary |
| `wmkf_ai_compliance_generated_at` | DateTime | When check ran |
| `wmkf_ai_compliance_model` | Single-line text | Claude model used |
| `wmkf_ai_compliance_version` | Integer | Prompt version |
| `wmkf_ai_compliance_status` | Option set | pending / processing / completed / failed / needs_review |

Sample JSON for `wmkf_ai_compliance_issues`:

```json
[
  { "category": "budget", "severity": "error", "description": "Budget exceeds $1M cap" },
  { "category": "format", "severity": "warning", "description": "Missing biosketch for co-PI" }
]
```

`severity` values: `error`, `warning`, `info`

---

## Field Set D — PD Assignment

Batch-run after each Phase I application deadline. The AI recommends a program director per proposal based on fit. **(CN: and balances assignments across PDs)**

| Field | Type | Purpose |
|-------|------|---------|
| `wmkf_ai_pd_recommended` | Lookup → systemuser | Recommended PD (preferred — enables Dynamics-native queries) | **(CN: I suggest writing assignments directly to the** `wmkf_programdirector` **lookup field. I see limited value in using an intermediate field)**
| `wmkf_ai_pd_confidence` | Option set | high / medium / low | **(CN: again, I see limited value in tracking this data in Dynamics. The powerautomate flow could produce an excel sheet with this info if human auditing is necessary)**
| `wmkf_ai_pd_rationale` | Multi-line text | Why this PD was recommended | **(CN: see prior comment)**
| `wmkf_ai_pd_alternates` | Multi-line text (JSON) | Runner-up PDs: `[{systemuserid, name, score}]` | **(CN: see prior comment)**
| `wmkf_ai_pd_generated_at` | DateTime | When assignment ran |
| `wmkf_ai_pd_model` | Single-line text | Claude model used |
| `wmkf_ai_pd_version` | Integer | Prompt version |
| `wmkf_ai_pd_status` | Option set | pending / processing / completed / failed / needs_review |

**Open question:** if lookup to systemuser is painful to populate from the PowerAutomate side, we can fall back to a Single-line text field storing the PD's systemuserid as a string. The lookup is strictly a UX nicety.

---

## Option set values summary

| Option set | Values |
|------------|--------|
| `*_status` (used on all four sets) | `pending`, `processing`, `completed`, `failed`, `needs_review` |
| `wmkf_ai_report_overall_rating` | `successful`, `mixed`, `unsuccessful` |
| `wmkf_ai_compliance_phase` | `phase_i`, `phase_ii` |
| `wmkf_ai_pd_confidence` | `high`, `medium`, `low` |

If there's already an existing option set in the org for any of these (e.g. "status"), reuse it rather than creating a duplicate.

---

## Alternative design: related entity per AI run

If the flat-fields approach above feels heavy, the alternative is a child entity:

- New table: `wmkf_ai_output` with fields `(request_id, task_type, generated_at, model, version, status, structured_data, summary_text)`
- Each AI run creates a new record related back to `akoya_request`

**Trade-offs:**
- **Pros:** history preserved automatically (re-runs don't overwrite prior results); schema doesn't grow per new AI task; easier retry tracking
- **Cons:** queries become joins; staff have to click through to related records to see AI output; filter-on-count fields (publications, postdocs) are harder to surface in list views

My current recommendation is the flat-fields approach for data staff read/filter on (counts, overall rating, compliance pass/fail, recommended PD) and a single JSON field for the full structured payload. But if your AkoyaGO experience suggests a related entity would be cleaner in the UI, I'm open to it. **(CN: See my note about using Audit History. I'm fine with creating new fields on the records for data, but there are a lot of fields that are clerical in nature that staff will likely never reference. Perhaps a hybrid flat-field/child entity approach is possible: the child-entity keeping a record of AI flow runs, with the most up-to-date data written to fields on the request records. Would have to train Dynamics Explorer to ignore search hits on this child entity)**

---

## Suggested implementation order

We don't need all of this on day one. In priority order:

1. **Set A status field** (`wmkf_ai_summary_status`) — 1 field, unblocks parity with the others.
2. **Set B: Grant report extraction** — staff are test-driving the Grant Reporting app now and will want to save results to Dynamics soon.
3. **Set C: Compliance check** — aligns with Phase 4 of the backend automation plan (Phase I automated check-in).
4. **Set D: PD assignment** — last, after compliance is proven.

Each set is independent — we can build and use the apps against Set B while you're still defining Set C.

---

## Questions for Connor

1. Does the flat-fields approach work in your AkoyaGO environment, or would you prefer the related-entity alternative? **(CN: see my prior note on this)**
2. Any existing option sets we should reuse (especially for status values)? **(CN: we can create new Choices)**
3. For `wmkf_ai_pd_recommended` — lookup to systemuser is ideal, but if that's hard to populate from PowerAutomate, we can use plain text. **(CN: The current implementation in my draft of this flow is to hardcode the PD systemuser GUIDs. Any staff changes would require manually editing these values, as well as the PD expertise descriptions, assuming those are written into the system prompt. This is the simplest implementation. Perhaps in the future we could explore storing PD expertise on the systemuser record and dynamically retrieving it, however I don't think that level of process automation is a priority)**
4. Any naming convention changes you'd prefer? I've used `wmkf_ai_*` to cluster these together; happy to follow whatever pattern matches the rest of the custom schema. **(CN: that works well)**

---

## References

- [GRANT_CYCLE_LIFECYCLE.md](./GRANT_CYCLE_LIFECYCLE.md) — full grant proposal lifecycle with AI task mapping
- [BACKEND_AUTOMATION_PLAN.md](./BACKEND_AUTOMATION_PLAN.md) — roadmap for the Vercel → PowerAutomate migration
- [DYNAMICS_SCHEMA_ANNOTATION.md](./DYNAMICS_SCHEMA_ANNOTATION.md) — existing `akoya_request` fields, for naming-convention reference
