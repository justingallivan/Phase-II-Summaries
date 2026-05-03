---
name: Backend Automation Vision
description: Leadership-driven initiative to move from manual user-initiated processing to event-driven backend automation via PowerAutomate, with all results written to Dynamics
type: project
---

Leadership wants key processing tasks automated on the backend — no manual uploads. Two tiers:

**Tier 1 (Fully Automatic):** PowerAutomate triggers on Dynamics status changes (e.g., proposal submitted) → calls our API → results written back to Dynamics fields. Example: Phase II proposal arrives → auto-generate summary.

**Tier 2 (Human-Initiated, CRM-Connected):** Staff uses our UI for higher-touch tasks needing judgment (reviewer finding with specific expertise criteria, review management). Results still flow back to Dynamics as source of truth.

**Write-back strategy:** PowerAutomate handles CRM writes initially (it already has full Dynamics access). Direct API writes from our app later when IT grants write permissions on app registration.

**New custom fields needed on `akoya_request`:** `wmkf_ai_summary`, `wmkf_ai_structured_data`, `wmkf_ai_summary_generated_at`, `wmkf_ai_summary_model`, `wmkf_ai_summary_version`. Schema ownership (vendor vs. internal) TBD.

**Configurable prompts:** Prompts should be editable by admins via the dashboard (DB-backed with versioning), not requiring code deploys. Both automatic and manual flows use the same prompt system.

**Why:** The system evolved from individual workflow tool → multi-user platform → organization wants it as infrastructure. Backend triggers are the natural next step.

**How to apply:** All new API work should be stateless and token-authenticated so it can serve both UI users and PowerAutomate. Plan for dual auth (service token OR user session) on processing endpoints.
