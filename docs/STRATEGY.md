# Where We're Headed

**March 2026** — living document, updated as things evolve.

---

## The Situation

We have three systems doing the work of one:

1. **AkoyaGO** sits on top of Dynamics 365. It takes in proposals, stores documents in SharePoint, tracks status, and manages CRM data. It's a generalist grants management tool — not built for us, hard to customize, and not easy to use.

2. **Our app suite** (this project) has 14 tools that handle the real analytical work — summarizing proposals, finding reviewers, screening integrity, exploring CRM data, and more. These are purpose-built and flexible, but they're standalone. Getting data in and out means manual file transfers.

3. **Shadow workflows** fill the gaps. Staff export PDFs from AkoyaGO, upload them to our apps, download the results, edit them, and re-upload to AkoyaGO for archiving. The data starts in Dynamics and ends up back in Dynamics, but takes a long detour through hard drives and browser downloads along the way.

Meanwhile, the grant cycle itself is being rethought. Concepts will come in differently, Phase I may go away, and there's interest in more automation. The Foundation is nearly 75 years old — there are a lot of legacy processes.

## The Direction

AkoyaGO is a UI layer on top of Dynamics. All the data — proposals, contacts, status, documents — lives in Dynamics and SharePoint. We can access it directly through the APIs we've already built.

So the plan is straightforward: **our apps read from Dynamics, do the work, and write back to Dynamics.** No more exporting, uploading, downloading, and re-uploading. Over time, AkoyaGO handles less and less until it's just the applicant intake portal (GOapply), and eventually maybe not even that.

This isn't a big-bang migration. We absorb AkoyaGO's responsibilities one at a time, starting with whatever's most useful.

### What the workflow looks like

Today:
```
AkoyaGO → Export PDFs → Upload to apps → AI drafts → Download → Edit → Re-upload to AkoyaGO
```

What we're building toward:
```
App Suite → Select proposal from Dynamics → Collaborate with AI → Save to Dynamics/SharePoint
```

The file shuffling goes away. The thinking doesn't. Staff still work with the material, shape the AI output, and make the calls. The tools just get them there faster and put the results where they belong.

---

## How We're Building This

A few things we've learned that guide how we work:

**Keep everything in Dynamics.** Our apps are a working layer, not a second database. Proposal data, contacts, documents, status — it all lives in Dynamics/SharePoint. We read it, work with it, and put it back.

**Keep things modular.** The grant cycle is changing and we don't know exactly what it'll look like yet. Each app and service should work independently so we can rearrange them as the process takes shape. Don't build a rigid pipeline for a process that's still being defined.

**Automate the tedious parts, not the judgment.** File transfers, data re-entry, status updates — that's what should be automatic. Reviewing a proposal, refining a writeup, choosing reviewers — that's where staff bring their expertise. The goal is to spend less time on logistics and more time on the actual work.

**Build for where we're going, not where we've been.** The new grant cycle and the new tools should shape each other. Don't replicate the old process in code — build capabilities that serve whatever comes next.

---

## What We Have

| What | How | Status |
|------|-----|--------|
| Read CRM data | `DynamicsService` — OData queries, Dataverse Search | Working |
| Read SharePoint documents | `GraphService` — file listing and download | Waiting on IT permission |
| Write to SharePoint | Not built yet | Need to request permission |
| Send CRM-tracked email | `DynamicsService.createAndSendEmail()` | Working |
| AI proposal processing | Claude integration across 14 apps | Working |
| Reviewer discovery | Multi-database search + AI ranking | Working |
| Email generation | `.eml` files + direct Dynamics sending | Working |
| Review management | Review Manager app | Working |
| CRM chat interface | Dynamics Explorer | Working |
| Auth + access control | Azure AD SSO + per-app grants | Working |

## What We Need Next

| What | Blocked on |
|------|-----------|
| **Proposal picker** — browse/search Dynamics proposals from within our apps | Nothing, can start now |
| **SharePoint read access** — `Sites.Selected` permission for the akoyaGO site | IT approval |
| **SharePoint write access** — deposit outputs back to SharePoint | Haven't requested yet |
| **Dynamics request linking** — tie our database records to CRM request IDs | Nothing, just a schema migration |
| **Status-driven triggers** — auto-start processing when proposals reach certain stages | Needs the new grant cycle to be defined |

---

## Rough Sequence

### First: Get proposals into our apps from Dynamics
No more PDF exports. Users browse proposals from within the app suite, metadata comes from CRM fields, documents come from SharePoint. Start with the Reviewer Finder since it has the most moving parts.

### Then: Get results back into Dynamics
Writeups, summaries, and other outputs go directly to SharePoint instead of being downloaded and re-uploaded. Staff still review and edit — the drafts just show up where they need to be.

### Later: Automate the routine triggers
When a proposal hits a certain status, kick off the appropriate processing. Notify staff when something needs their attention. Build dashboards that replace AkoyaGO's views.

### Eventually: Full independence from AkoyaGO
Evaluate whether the applicant portal can be replaced. At that point, Dynamics is just the database and our suite is the entire workflow layer.

---

## The Grant Cycle Redesign

The cycle is changing — concepts, phases, evaluation methods are all in flux. That's actually helpful. We're not locked into replicating the old process. We can:

- Build capabilities (proposal picker, AI processing, email integration) that work regardless of the cycle structure
- Try new approaches quickly since everything is modular
- Let what's technically possible inform how the new cycle is designed

---

## IT Dependencies

| What | Who | Status |
|------|-----|--------|
| `Sites.Selected` + site authorization | Azure AD Admin | Pending (see `docs/IT_SECURITY_RESPONSE.md`) |
| `Sites.ReadWrite.Selected` | Azure AD Admin | Not yet requested |
| Email Sender role in Dynamics | Dynamics Admin | Done |
| Conditional access licensing | IT | Their side, in progress |
