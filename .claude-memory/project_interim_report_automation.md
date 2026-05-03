---
name: Interim grant report auto-evaluation (blocked on Dynamics write access)
description: Future backend automation to evaluate yearly interim grant reports and write results back to a Dynamics field, mirroring the staff workflow
type: project
originSessionId: 855d17dc-8935-4bc6-88a5-cb73f4cb1b2d
---
# Interim grant report auto-evaluation

In addition to the final reports the Grant Reporting app currently handles, grantees submit **yearly interim reports** during multi-year grants. Today, staff read each interim report manually and write their evaluation into a field on the corresponding `akoya_request` record in Dynamics.

This is a natural fit for the same backend-automation pattern we're using for other apps:

- PowerAutomate triggers on a Dynamics status change (e.g., interim report attached / status flips to "interim received")
- Backend endpoint pulls the new report from SharePoint (via the same `getRequestSharePointBuckets` + `GraphService.listFiles` path Grant Reporting already uses)
- Claude generates the evaluation against the original proposal — likely a thinner version of the existing `compareProposalToReport` helper, focused on year-over-year progress rather than final-narrative completeness
- Result is written back to the staff evaluation field on the request record

**Why:** Same motivation as the rest of the backend-automation work — staff time on routine evaluations, consistent format, source-of-truth in Dynamics. Interim reports are higher-volume than final reports (one per year per active grant), so the automation payoff is meaningful.

**How to apply:** Don't start implementation yet. **Blocked on Dynamics write permissions** — the app registration currently has read-only access to Dynamics, and write-back is needed before this is useful. Revisit when IT grants write access (tracked alongside `Sites.ReadWrite.Selected` for SharePoint). When unblocking:

1. Identify (with Connor) which `akoya_request` field holds the staff evaluation today, or whether a new `wmkf_ai_interim_evaluation` field is needed.
2. Build the prompt to mirror what staff actually write — get a few real examples from past evaluations first.
3. Reuse the bucket + Graph plumbing from `pages/api/grant-reporting/extract.js` and `lib/utils/sharepoint-buckets.js`; the document discovery work is already done.
4. Expose a stateless endpoint that PowerAutomate can call (service-token auth), and a small UI in Grant Reporting for staff to preview/override before write-back.
