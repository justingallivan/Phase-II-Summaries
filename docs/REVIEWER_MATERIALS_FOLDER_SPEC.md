# Reviewer Materials — SharePoint Folder Convention

**Audience:** Connor (PowerAutomate / file generation owner)
**Status:** Proposal, in production behind a feature flag
**Related:** `docs/DATAVERSE_SHAREPOINT_FILE_MODEL.md` (file storage architecture)

---

## What we need from PowerAutomate

For each `akoya_request` that is going out for external review, create a
subfolder named **`Reviewer_Materials`** under the request's existing
SharePoint folder, and place inside it the files we want external reviewers
to see — and only those files.

```
akoya_request/                                                ← existing library
  └─ 1002379_54E2B88B04B9F011BBD36045BD02B4CC/                 ← existing per-request folder
      ├─ Application Cover Page.docx                            ← internal, untouched
      ├─ Governing BoardList.pdf                                ← internal, untouched
      ├─ St. Jude...Phase_II_Staff_Version.pdf                  ← internal, untouched
      ├─ Phase II/                                              ← raw GoApply submission
      │   ├─ Project Narrative.pdf
      │   ├─ Bibliography.pdf
      │   └─ ... (etc.)
      └─ Reviewer_Materials/                                    ← NEW: created by your flow
          ├─ Project Narrative.pdf                              ← copied/curated by flow
          ├─ Bibliography.pdf
          ├─ Biographical Sketches.pdf
          ├─ Project Budget.pdf
          ├─ Financial Narrative.pdf
          ├─ Collaborative Arrangements.pdf
          └─ Graphical Abstract.pdf
```

The reviewer-facing app reads only what's inside `Reviewer_Materials/`.
Anything else in the request folder — admin paperwork, staff briefs,
governing board lists, declaration letters, the raw `Phase II/`
submission — is invisible to reviewers by construction.

---

## Why this design

**Security by default.** A typical request folder holds 20+ files, several
of which (staff AI summaries, governing board lists, internal status
letters, applicant admin paperwork) should never be exposed externally.
A blanket "show the whole folder" rule would leak any of these the moment
they appear. Allowlisting one curated subfolder makes leakage impossible
absent staff explicitly placing the wrong file there.

**Staff visibility.** Anyone browsing SharePoint can see exactly what was
shared with reviewers — no opaque filter buried in code. If a reviewer
asks "where's X?" staff can answer without running a tool.

**Decouples curation from submission.** GoApply's submission shape can
change without affecting what reviewers see. PowerAutomate becomes the
single canonical place that decides "here is the reviewer package."

---

## What goes in `Reviewer_Materials/`

For Phase II reviews, the reviewer-facing package today looks like:

- Project Narrative
- Bibliography
- Biographical Sketches
- Project Budget
- Financial Narrative
- Collaborative Arrangements
- Graphical Abstract
- (Optional) Proposal Abstract

Most of these are already produced by GoApply into `Phase II/`. The flow's
job is to copy (or generate fresh PDFs of) the curated subset into
`Reviewer_Materials/`. Subfolders inside `Reviewer_Materials/` are fine
if useful — the reader walks recursively.

**Explicitly do NOT include:**

- `*_Staff_Version.*` — internal AI-generated staff briefs
- Application / Proposal Cover Pages — admin forms
- Recognition Statement, Declaration of Status Letter, Governing Board
  List — applicant administrative paperwork
- Phase I materials (when reviewing Phase II)
- Other Support documents (PII risk: pending grants from non-applicants)

When in doubt, exclude. Staff can always drop a file in manually after
the fact.

---

## Folder name details

- **Spelling:** exactly `Reviewer_Materials` (capital R, capital M, single
  underscore). Case-insensitive on the read side, but standardize on this
  for clarity.
- **Location:** directly inside `akoya_request/{requestNumber}_{requestGuid}/`.
- **Creation:** if the folder doesn't exist, the reviewer-facing app shows
  "The Foundation hasn't shared materials yet — please contact us if you
  need them." Reviewers can still load the page, just no downloads.

---

## Multi-folder support / transition windows

The reviewer app supports a comma-separated environment variable
`REVIEWER_MATERIALS_FOLDERS` for periods where two folder names need to
coexist (e.g., renaming the convention while in-flight requests use the
old name). Default: `Reviewer_Materials`. If we change the convention,
the var lets us match both names during the transition without a deploy.
You don't need to do anything with this — flagged so you know flexibility
exists.

---

## What the system does on its end

For reference — you don't need to build any of this; it's already in place.

1. **Magic link generation** — when a reviewer accepts, the app mints a
   one-time JWT and sends them a `https://[app]/external/review/{token}`
   URL.
2. **File listing** — the landing page calls Microsoft Graph, walks the
   request's SharePoint folder under the `akoya_request` library, and
   returns only files whose path contains `/Reviewer_Materials/`.
3. **File download** — when a reviewer clicks Download, the app
   re-validates membership (defense against ID brute-forcing), then
   streams the file from SharePoint via Graph as the foundation's app
   registration. The reviewer never sees a SharePoint URL or token.

---

## Open questions for you

1. **Review uploads folder name.** Reviews submitted *by* the reviewer
   land in a sibling folder under the same request. Currently the app
   writes to `akoya_request/{request}/Reviews/{suggestionGuid}/`. We're
   considering renaming this to `Received_Reviews/` so the inbound vs.
   outbound rhetoric matches `Reviewer_Materials/`. If your flow ever
   needs to read or process review uploads, the name should align before
   we ship to production.

2. **Per-reviewer subfolder name.** Currently a GUID
   (`Received_Reviews/7f3a-9c2e-...`); not human-scannable. Considering
   `{ReviewerLastName}_{shortId}/` (e.g. `Patel_7f3a9c2e`). Cleaner for
   manual SharePoint browsing.

3. **PA-driven trigger.** Should the `Reviewer_Materials/` folder
   creation be driven by a status flip on `akoya_request` (e.g., when
   the request enters "Phase II Pending"), or by an explicit "ready for
   external review" trigger you build separately?

4. **Naming convention drift.** If your team has an existing convention
   for review-related subfolders (from the prior grants management
   system or current internal practice), let's align before locking
   `Reviewer_Materials` into PA flows. Easier to converge now than to
   migrate later.

---

## Suggested next step

A 30-minute working session to walk through one real request end-to-end:
look at what's currently in its SharePoint folder, decide what should
land in `Reviewer_Materials/`, and sketch the PA steps that would put
them there.
