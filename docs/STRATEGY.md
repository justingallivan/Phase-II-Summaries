# Strategic Direction: From App Suite to Workflow Engine

**Date:** March 2026
**Status:** Active — guiding development priorities

---

## Where We Are

The W.M. Keck Foundation operates a grant lifecycle that spans proposal intake, evaluation, reviewer assignment, peer review, and funding decisions. This lifecycle is currently managed through:

1. **AkoyaGO** — a third-party grants management application built on top of Microsoft Dynamics 365. It handles proposal intake (via a GOapply applicant portal), document storage (via SharePoint), status tracking, and basic CRM functions. It is a generalist system with limited customization, and the staff finds it difficult to use.

2. **The Research Review App Suite** (this project) — a custom-built collection of 14 AI-powered tools that handle proposal summarization, concept evaluation, reviewer discovery, email outreach, peer review analysis, expense processing, integrity screening, and natural language CRM queries. These tools are more capable and flexible than AkoyaGO for the actual analytical work, but they currently operate as standalone apps with manual file transfer in and out.

3. **Shadow systems** — ad hoc workflows where staff export documents from AkoyaGO, process them through the app suite (or manually), and re-upload results. Data originates in Dynamics, takes a detour through local file systems and browser downloads, and must be manually returned to Dynamics for archiving.

The Foundation is also in the process of significantly rethinking its grant cycle. The concept evaluation process is changing, Phase I may be eliminated, and there is a strong desire for automation throughout.

## Where We're Going

**The app suite becomes a workflow engine that sits directly on the Dynamics data layer.** AkoyaGO is gradually replaced — not feature-for-feature, but by purpose-built tools designed for the Foundation's actual (and evolving) needs.

The end state:
- **Dynamics 365** remains the data substrate — CRM records, relationships, status tracking
- **SharePoint** remains the document store — proposals, writeups, review materials
- **The app suite** becomes the staff-facing workflow layer — reading from Dynamics/SharePoint, processing with AI, writing results back, and automating routine tasks
- **AkoyaGO** shrinks to only the applicant-facing portal (GOapply), and eventually may be replaced entirely

### What Changes for Users

Today:
```
AkoyaGO → Export PDFs → Upload to apps → AI drafts → Download → Edit → Re-upload to AkoyaGO
```

Tomorrow:
```
App Suite → Select proposal from Dynamics → Collaborate with AI → Save to Dynamics/SharePoint
```

The mechanical steps (export, upload, download, re-upload) disappear. The *thinking* steps don't. Staff still engage with the material, refine AI-generated drafts, make editorial judgments, and apply institutional knowledge. The tools bring proposals to the user faster and put results where they belong afterward — they don't bypass the human work in between.

---

## Design Principles

### 1. Dynamics Is the Source of Truth
Every feature reads from and writes back to Dynamics/SharePoint. The app suite is a processing and workflow layer, not a separate data silo. Proposal metadata, contact info, status, and documents all live in Dynamics.

### 2. Build Modular, Wire Together Later
The grant cycle is actively being redesigned. We don't know exactly what it will look like. Individual apps and services should remain independent with clean APIs so they can be composed into whatever workflow the new cycle requires. A rigid pipeline built for today's process would be obsolete by the time it's finished.

### 3. Automate the Mechanical, Not the Intellectual
The AI processing (summarization, evaluation, reviewer discovery) is already built. The missing value is in the connectors — pulling data in from Dynamics without manual export, and depositing results back without manual upload. Every new feature should eliminate a mechanical handoff (file transfer, data re-entry, status updates) while preserving the human decision points. The goal is to get staff to the thinking work faster, not to remove them from it.

### 4. Co-Evolve Tools and Process
The new grant cycle and the new tools should inform each other. What's possible with automation should shape how the cycle is designed. What the cycle requires should prioritize what gets built. Don't build for the legacy process — build for the one you're moving toward.

### 5. Replace AkoyaGO Incrementally
There's no big-bang migration. Each piece of AkoyaGO functionality gets absorbed when there's a clear need and a better alternative. The applicant portal (GOapply) is the last to go. Staff-facing workflow is first.

---

## Building Blocks (What Exists Today)

| Capability | Implementation | Status |
|-----------|---------------|--------|
| Read CRM data | `DynamicsService` — OData queries, Dataverse Search | Working |
| Read SharePoint documents | `GraphService` — file listing and download | Blocked on `Sites.Selected` permission |
| Write SharePoint documents | Not yet implemented | Needs `Sites.ReadWrite.Selected` permission |
| Send CRM-tracked email | `DynamicsService.createAndSendEmail()` | Working (as of Session 77) |
| AI proposal analysis | Claude processing across multiple apps | Working |
| Reviewer discovery | Multi-database search + AI ranking | Working |
| Email generation | `.eml` file generation + direct Dynamics sending | Working |
| Peer review management | Review Manager app | Working |
| Natural language CRM queries | Dynamics Explorer (agentic tool-use) | Working |
| User auth + access control | Azure AD SSO + per-app grants | Working |
| Audit logging | `api_usage_log` + `dynamics_query_log` | Working |

## Key Missing Pieces

| Capability | What's Needed | Blocked On |
|-----------|--------------|------------|
| **Proposal picker** | Shared UI component to browse/search Dynamics proposals and pull them into any app | Nothing — can build now |
| **SharePoint read access** | `Sites.Selected` permission on the correct app registration | IT admin consent |
| **SharePoint write access** | `Sites.ReadWrite.Selected` to deposit outputs back | IT admin consent (request not yet made) |
| **Dynamics request context** | `dynamics_request_id` / `dynamics_request_number` columns on `proposal_searches` and other tables | Nothing — schema migration |
| **Status-driven triggers** | Power Automate flows or webhooks to trigger processing on status changes | Later phase — needs process definition |

---

## Sequencing

### Phase 1: Connect the Input (Near-Term)
Get data flowing from Dynamics into the app suite without manual file export.

- Obtain SharePoint read permission (`Sites.Selected`)
- Build the proposal picker component (search/browse Dynamics proposals)
- Wire it into Reviewer Finder as the first integrated app
- Add `dynamics_request_id` to the data model so outputs link back to CRM records
- Link email sending to CRM request records via `regardingobjectid`

**Value:** Eliminates the "export PDF → upload to app" step. Reviewer Finder can pull proposals directly from Dynamics and send emails that appear on the CRM record.

### Phase 2: Connect the Output (Medium-Term)
Get processed results flowing back to Dynamics/SharePoint without manual download and re-upload.

- Obtain SharePoint write permission (`Sites.ReadWrite.Selected`)
- Writeup apps (Phase I/II) deposit generated documents back to SharePoint
- Batch processing by grant cycle ("process all proposals for the June meeting")
- Results and summaries written to Dynamics fields or attached as SharePoint documents

**Value:** Eliminates the mechanical file shuffling. Staff still review and edit AI-generated drafts — the difference is that those drafts are waiting in SharePoint rather than requiring a download-edit-reupload cycle. The tools handle the plumbing; staff focus on the substance.

### Phase 3: Workflow Automation (Longer-Term)
Replace AkoyaGO's workflow management with purpose-built automation.

- Status-driven triggers (e.g., "when a proposal reaches Phase II Pending, generate a writeup")
- Task queues and notifications ("3 proposals need reviewer assignment")
- Dashboard views that replace AkoyaGO's request screens
- Grant cycle management (define stages, transitions, and automated actions)

**Value:** Staff work entirely in the app suite. AkoyaGO is only needed for applicant intake.

### Phase 4: Full Independence (Long-Term)
- Evaluate whether the GOapply applicant portal can be replaced
- Dynamics remains as the database layer with custom views
- AkoyaGO subscription can potentially be eliminated

---

## Relationship to the Grant Cycle Redesign

The Foundation is actively rethinking its grant cycle. Key changes under consideration:

- Concept evaluation process changing
- Phase I may be eliminated entirely
- Greater emphasis on automation and AI-assisted decision support

This redesign is an opportunity, not a complication. The modular architecture of the app suite means we can:

- Add new workflow steps as they're defined
- Remove or modify steps that change
- Prototype new cycle designs quickly by composing existing services
- Let the tools inform what's possible in the new cycle

The principle is: **don't build for the old cycle, build capabilities that serve the new one.** The proposal picker, CRM integration, AI processing, and email automation are all valuable regardless of what the cycle looks like.

---

## Technical Prerequisites (IT Coordination)

| Request | Who | Status | Document |
|---------|-----|--------|----------|
| `Sites.Selected` permission + site-specific grant | Azure AD Admin | Pending | `docs/IT_SECURITY_RESPONSE.md` |
| `Sites.ReadWrite.Selected` (future) | Azure AD Admin | Not yet requested | — |
| Email Sender role for service principal | Dynamics Admin | Granted | `docs/PENDING_ADMIN_REQUESTS.md` |
| Conditional access policy licensing | IT | In progress (their side) | — |

---

*This document captures strategic direction as of March 2026. It should be updated as the grant cycle redesign takes shape and as IT permissions are resolved.*
