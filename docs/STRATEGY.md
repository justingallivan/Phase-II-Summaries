# Where We're Headed

**Last updated: March 12, 2026** — living document, updated as things evolve.

---

## The Systems

Six systems support WMKF's grant workflow:

1. **Dataverse** — The database that stores WMKF's grant and CRM data: requests, reports, payments, applicants, contacts, programs, and their relationships.

2. **Dynamics 365** — Microsoft's interface for Dataverse. Includes cloud flows, business rules, workflows, and API access. PowerAutomate flows (built by the AkoyaGO vendor and Foundation staff) handle significant behind-the-scenes automation.

3. **AkoyaGO** — A Dynamics 365 app. The primary staff UI for searching, viewing, and editing Dataverse tables. Includes numerous Dynamics customizations for grants management.

4. **GOapply** — AkoyaGO's applicant portal. External website for applicants and grantees to submit proposals and interact with WMKF. Data maps to Dataverse; submitted documents route to SharePoint via Dynamics.

5. **SharePoint** — Cloud document storage. Two primary areas: the AkoyaGO site (where AkoyaGO stores documents, not meant for direct user access) and the WMKF site (shared staff documents with multiple sub-sites).

6. **Vercel App Suite** (this project) — 14 purpose-built tools that summarize proposals, find reviewers, screen applicant integrity, explore CRM data, and more. Originally standalone, now with expanding connections to the other systems.

---

## The Problem

The workflow for reviewing applications is high-touch with manual tasks repeated for each application. The app suite simplifies higher-level tasks, but in its current form adds overhead moving documents between SharePoint and the apps.

AkoyaGO, as a Dynamics app, cannot directly display documents stored in SharePoint, requiring users to navigate between two systems for a single record. Information about individual applications lives in two places — Dataverse and SharePoint — with no unified view.

### What the workflow looks like today

```
AkoyaGO → Export PDFs → Upload to apps → AI drafts → Download → Edit → Re-upload to AkoyaGO
```

### What we're building toward

```
App Suite → Select proposal from Dynamics → Collaborate with AI → Save to Dynamics/SharePoint
```

The file shuffling goes away. The thinking doesn't. Staff still work with the material, shape the AI output, and make the calls. The tools just get them there faster and put the results where they belong.

---

## The Direction

The primary goal is to reduce the manual procedural work so staff can focus their time on analytical work. The app suite also has the potential to provide a faster, more unified interface for accessing data and documents — something AkoyaGO doesn't do well.

**Dataverse and SharePoint are the source of truth.** Our apps are a working layer, not a second database. Proposal data, contacts, documents, status — it all lives in Dynamics/SharePoint. We read it, work with it, and put it back. Over time, we reduce the friction that AkoyaGO creates for program directors by giving them cleaner, purpose-built interfaces for the work they actually do.

This is not a plan to replace AkoyaGO. There is significant business logic in PowerAutomate flows and Dynamics customizations, and there may be vendor/licensing dependencies that are not yet fully understood. The guiding principle is to **minimize reliance on AkoyaGO** and build things that would still work if it went away — but that's a long-term possibility, not a near-term goal.

### How the workflow is changing

The app suite started as a bottom-up effort to accelerate individual workflows. Without programmatic access to documents or CRM data, file upload was the only starting point — and the apps had to extract data from proposals that already existed as ground truth in Dataverse. That was a historical contingency.

Now we have read access to Dynamics and SharePoint, and leadership buy-in to use AI for automation. The next phase inverts the flow: instead of users uploading files and triggering processing, **backend triggers will initiate the same API calls** based on proposal status changes. Users will still use the app suite's interfaces — Review Manager, Reviewer Finder, etc. — but the data arrives automatically.

---

## Principles

**Keep everything in Dynamics.** Avoid creating secondary databases in the apps. We don't yet have write access to Dataverse, but expect to get it soon. Until then, Postgres serves as a development substrate and operational store. Some data currently in Postgres — like researcher profiles, publications, and reviewer candidates — is valuable organizational knowledge that belongs in the CRM long-term. Researchers are a reusable resource (good reviewers get called upon repeatedly), and discovery results represent paid API calls worth preserving. Once write access is established, we'll need to both write to existing Dataverse fields and create new ones where the current schema doesn't cover our needs (e.g., reviewer contact data, AI-generated summaries). Other data is purely app-operational (usage logs, screening history, system alerts) and may stay in Postgres. Long-term, most organizational data should live in Dataverse, with freshness metadata (e.g., "contact info current as of [date]") to enable automated refresh of stale records.

**Keep things modular.** The grant cycle is changing and we don't know exactly what it'll look like yet. Each app and service should work independently so we can rearrange them as the process takes shape. Don't build a rigid pipeline for a process that's still being defined.

**Automate the tedious parts, not the judgment.** Document management, data entry, composing drafts, status updates — that's what should be automatic. Reading and reviewing proposals, finalizing recommendation materials, choosing reviewers — that's where staff bring their expertise.

**Create a unified view of data and documents.** From the user's perspective, data and documents should be part of a single record, despite being stored in Dataverse and SharePoint separately. This is something AkoyaGO cannot do natively.

**Build for where we're going, not where we've been.** The new grant cycle and the new tools should shape each other. Don't replicate the old process in code — build capabilities that serve whatever comes next.

---

## What We Have

| What | How | Status |
|------|-----|--------|
| Read CRM data | `DynamicsService` — OData queries, Dataverse Search | Working |
| Read SharePoint documents | `GraphService` — file listing, download, full-text search | Working |
| Write to Dynamics/SharePoint | Not built yet | No write permission yet |
| Send CRM-tracked email | `DynamicsService.createAndSendEmail()` | Working |
| AI proposal processing | Claude integration across 14 apps | Working |
| Reviewer discovery | Multi-database search + AI ranking | Working |
| Email generation | `.eml` files + direct Dynamics sending | Working |
| Review management | Review Manager app | Working |
| CRM chat interface | Dynamics Explorer with agentic tool use | Working |
| Auth + access control | Azure AD SSO + per-app grants | Working |
| Dynamics request linking | `request_number` on reviewer/proposal tables | Done |
| User feedback logging | Thumbs up/down + auto-detection on Dynamics Explorer | Working |
| Operational monitoring | Health checks, log analysis, maintenance cron, alerts | Working |

## What We Need Next

| What | Blocked on |
|------|-----------|
| **Proposal picker** — browse/search Dynamics proposals from within our apps | Nothing, can start now |
| **SharePoint write access** — deposit outputs back to SharePoint | IT permission (`Sites.ReadWrite.Selected`) |
| **Dynamics write access** — update Dataverse fields from our apps | IT permission + schema planning |
| **Status-driven triggers** — auto-start processing when proposals reach certain stages | Backend architecture discussion + new grant cycle definition |

---

## Rough Sequence

### First: Get proposals into our apps from Dynamics
No more PDF exports. Users browse proposals from within the app suite, metadata comes from CRM fields, documents come from SharePoint. Start with the Reviewer Finder since it has the most moving parts.

### Then: Get results back into Dynamics
Writeups, summaries, and other outputs go directly to SharePoint and Dataverse instead of being downloaded and re-uploaded. Staff still review and edit — the drafts just show up where they need to be.

### Later: Automate the routine triggers
When a proposal hits a certain status, kick off the appropriate processing. Notify staff when something needs their attention. These will likely use the same API calls the app suite already makes, but triggered from the backend rather than by users. This phase requires close collaboration with Connor and alignment on the PowerAutomate flows and Dynamics business logic.

---

## The Grant Cycle Redesign

The cycle is changing — concepts, phases, evaluation methods are all in flux. That's actually helpful. We're not locked into replicating the old process. We can:

- Build capabilities (proposal picker, AI processing, email integration) that work regardless of the cycle structure
- Try new approaches quickly since everything is modular
- Let what's technically possible inform how the new cycle is designed

---

## Vendor and Licensing Considerations

AkoyaGO's vendor provides a license for Dynamics/Dataverse. While WMKF owns its data and could migrate to another Dynamics instance, the extent of dependency on AkoyaGO-specific workflows and business logic is not fully understood. This will be clarified over time as the contract relationship evolves. In the meantime, the principle is: build things that minimize reliance on AkoyaGO, with the understanding that it might eventually go away.

---

## IT Dependencies

| What | Who | Status |
|------|-----|--------|
| `Sites.Selected` + site authorization | Azure AD Admin | Granted |
| `Sites.ReadWrite.Selected` | Azure AD Admin | Not yet requested |
| Email Sender role in Dynamics | Dynamics Admin | Done |
| Conditional access licensing | IT | Their side, in progress |
| Dynamics write permissions | TBD | Not yet scoped |
