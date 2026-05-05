---
name: Dynamics Explorer tool-result serializer — deferred
description: Codex AI_DATA_FLOW_MATRIX P1 #2 (Dynamics Explorer agentic-loop record-detail leakage) was discussed and deferred 2026-05-04. Capture the trigger conditions to revisit so the deferral does not become amnesia.
type: project
originSessionId: 86703e2a-1188-4182-8ea8-fcc124398944
---
Codex's AI_DATA_FLOW_MATRIX P1 #2 recommended a CRM field serialization layer between Dynamics Explorer tool results and Claude's context. Discussed in Session 130 and deferred.

**Why deferred:**
The "sensitive field" framing did not match the user base. 16 staff, all with full Dataverse access by design; flows are curated by Justin and Connor at the schema level. There is no data-leak threat model that staff-side RBAC does not already cover.

The actual concern is narrower: context pollution / token cost / AI-summary loopback when fields like `wmkf_ai_summary` or `wmkf_ai_rawoutput` enter Claude's context on later queries and get treated as authoritative input. None of these symptoms have been observed because `wmkf_ai_summary` is new and not populated at scale.

**Why:** Preventive work for an unproven failure mode does not earn its keep on this codebase. The realistic mitigation (per-table default `select` when Claude omits one in `query_records` / `get_entity` / `get_related`) also requires system-prompt tuning to avoid regressing answer quality, so the cost is real.

**How to apply:** Treat as a watch item, not a backlog item. Revisit if any of these trigger:
- Claude citing `wmkf_ai_summary` or `wmkf_ai_rawoutput` content as authoritative on a fresh query (loopback symptom).
- Dynamics Explorer token costs creeping up noticeably as more long-text fields land on `akoya_request` or related tables.
- A new tool or query expansion materially broadens what records enter the agentic loop.

If revisited, the design lives in `docs/AI_DATA_FLOW_MATRIX.md` under the P1 #2 section: per-table default `select` (not a "redact sensitive fields" denylist), denylist-style for AI-generated and narrative long-text fields, system-prompt updates so Claude knows to explicitly request excluded fields when the user's question implies them.
