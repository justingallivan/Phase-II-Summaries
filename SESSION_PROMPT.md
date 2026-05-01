# Session 122 Prompt: External Reviewer Intake — Phase 4 (endpoints + landing page)

## Heads up

Session 121 closed with **3 of 7 phases shipped** for the external reviewer
intake build. The plan is fully documented at
`docs/EXTERNAL_REVIEWER_INTAKE_PLAN.md` — read that first; it has the
phase-by-phase breakdown, schema list, security model, and open questions.
This prompt only summarizes the state and points at what's next.

**Production state already changed:** 11 new fields exist on
`wmkf_appreviewersuggestion` in prod CRM. They're benign (all nullable, no
defaults that would fire on existing rows) but visible to anyone browsing the
entity in CRM. Nothing reads or writes them yet.

## Session 121 Summary

A full-day design + implementation arc on a new build: foundation-owned
external reviewer intake. Started as an exploratory conversation about how
documents flow in/out of the system; converged on building an HMAC magic-link
primitive that mediates both proposal download and review upload through our
backend. Designed reviewer-first because (a) we own that path, (b) volume is
small, (c) flow is async, (d) email-and-staff-uploads is a graceful fallback.
Connor (2026-05-01) signaled interest in eventually replacing GOapply for
applicants too, so the primitive is built to extend that direction.

A meaningful side-effect: corrected three stale memory entries claiming
`Sites.ReadWrite.Selected` was unrequested — it was actually granted
2026-04-15 and verified 2026-05-01 via a new probe (`scripts/probe-sharepoint-write.js`).

### What was completed

1. **Design + planning** — `docs/EXTERNAL_REVIEWER_INTAKE_PLAN.md` (the
   referenceable spec, 7 phases) and `docs/DATAVERSE_SHAREPOINT_FILE_MODEL.md`
   (Connor-shareable explanation of how Dataverse rows + SharePoint files
   relate). 11-field schema design, picklist value tables, JWT shape, endpoint
   contracts, rollback semantics.

2. **Phase 1 — Schema (applied to prod)** (`4d0c172`). 11 new attributes on
   `wmkf_appreviewersuggestion` via `lib/dataverse/schema/wave2-existing/wmkf_appreviewersuggestion-extensions.json`
   and the existing apply-dataverse-schema toolchain. Token state (hash,
   issued, expires, revoked), SharePoint folder pointer, structured form
   fields capturing Q1/Q3/Q10 of the review template (impact, risk, overall
   rating — explicit integer picklist values 1..N + 99 sentinel for "Unable
   to answer"), reviewer affiliation, staff-vs-self upload boolean. Schema
   probe (`scripts/probe-reviewer-suggestion-schema.js`) confirms 35 → 51
   custom attributes (the extras are auto-generated `*name` virtuals).

3. **Phase 2 — Token primitive + middleware allowlist** (`8ba8299`).
   `lib/services/external-token.js` — `mintToken()` / `verifyToken()` /
   `hashToken()`. HS256 JWT via `jose`; algorithm pinned (rejects "alg: none"
   attack); 32-char minimum secret. Verification covers signature + expiry
   only — revocation/hash-match is the caller's responsibility (needs
   Dataverse round-trip). New env var `EXTERNAL_LINK_SECRET` documented.
   `middleware.js` allowlists `/external/*` and `/api/external/*` for token
   auth at the route level; CSP still applied. `jest.setup.js` made
   defensive about `window` so node-env tests can coexist with jsdom-env.
   17 tests pinning the contract.

4. **Phase 3 — Shared upload core** (`aee574a`). `lib/services/review-upload.js`
   `writeReviewFiles()` — single function used by both the (eventual) external
   token-authenticated endpoint and the staff session-authenticated endpoint.
   Reads suggestion + expanded request → validates files (count ≤ 5, size
   ≤ 25MB, magic-byte sniff) → validates structured form data → writes each
   file to SharePoint at `akoya_request/{requestNumber}_{guidUpper}/Reviews/{suggestionId}/`
   → PATCHes Dataverse with all new fields. Discriminated result; on any
   failure after the first SharePoint write, attempts best-effort cleanup so
   we never end up with orphan files when the canonical pointer didn't get
   set. Supporting modules: `lib/external/review-form-schema.js` (form config
   + validator), `lib/utils/file-magic.js` (PDF/DOCX/DOC magic-byte
   sniffing). `GraphService.uploadFile()` and `deleteFile()` added (PUT with
   `conflictBehavior=replace`, leans on SharePoint built-in versioning for
   history). 47 tests covering happy paths, validation rejections, and both
   rollback paths.

### Commits (Session 121)

- `4d0c172` — design + Phase 1 schema (applied to prod 2026-05-01)
- `8ba8299` — Phase 2: token primitive + middleware allowlist
- `aee574a` — Phase 3: shared upload core

All pushed to `origin/main`.

### Memory updates from Session 121

- `MEMORY.md` line 24 — `Sites.ReadWrite.Selected` reframed as
  "write role on akoyaGO granted 2026-04-15, verified 2026-05-01"
- `MEMORY.md` lines 63-64 — clarified `Sites.Selected` is a single Graph
  permission with read/write set per-site at authorization time
- `project_external_reviewer_file_access.md` — body + frontmatter rewritten
  to reflect the Session 121 direction (backend-mediated primitive, no
  quarantine library needed); retracted the "separate staging library" guess

### Verified

- Schema applied to prod: ✓ (11 attributes, 35 → 51 custom attrs)
- SharePoint write: ✓ (`scripts/probe-sharepoint-write.js`, PUT + DELETE round-trip)
- Test suite: 253 pass, 1 pre-existing skip

## Where to pick up — Phase 4 (endpoints + landing page)

The shared core is ready; both endpoints just need thin wrappers around it.

### 1. Public landing page — `pages/external/review/[token].js`

Public Next.js page (covered by middleware allowlist). On mount: verifies
token via `verifyToken()`, then queries the suggestion row to check
`wmkf_externaltokenhash` matches and `wmkf_externaltokenrevoked` is false.
On success shows: proposal title, reviewer name, due date, current status,
download buttons for proposal materials, upload form (file dropzone +
structured fields rendered from `reviewFormSchema`), submit button. On
verification failure: friendly error page differentiating expired / revoked
/ malformed.

Side effect: sets `wmkf_proposalfirstaccessed` if not already set.

### 2. Proposal-download endpoint — `pages/api/external/review/[token]/proposal.js`

Streams a proposal-related file (proposal, biosketch, etc.) from SharePoint
via Graph. Backend authenticates as the app registration. Validates the
requested file is part of the request's document set (defense against
arbitrary-path injection — re-use `validatePath` in `graph-service.js`).

### 3. Upload endpoint — `pages/api/external/review/[token]/upload.js`

Multipart form: 1–5 files + structured form data. Verifies token, looks up
suggestion, calls `writeReviewFiles({ suggestionId, files, structuredData, opts: { source: 'reviewer_self_token' } })`,
maps the discriminated result to HTTP status (200/400/404/500).

### Form-fields component

`shared/components/external/ReviewFormFields.js` — renders the form by
walking `reviewFormSchema.fields`. Reusable from the staff Review Manager UI
in Phase 5. Radio buttons for picklist (HTML enforces single-select);
required attribute on all required fields.

### Notes

- `verifyToken()` returns `{ valid: false, reason }` with reasons like
  `'expired'`, `'invalid_signature'`, `'no_token'` — landing page can switch
  on this to show specific error states.
- The token check + revocation check + suggestion lookup all need a single
  Dataverse round-trip; group them.
- For multipart parsing, check what's already in the codebase. Existing
  `/api/upload-handler` uses Vercel Blob's parser; for our SharePoint flow
  we want raw Buffers. Likely need `formidable` or similar.

## Background — pending after Phase 4

- **Phase 5** — Rewrite `pages/api/review-manager/upload-review.js` to call
  `writeReviewFiles` (replacing the Vercel Blob path). New staff endpoints:
  `regenerate-token`, `revoke-token`, `mark-received-no-file`. Update Review
  Manager UI to show structured form fields when uploading on behalf, plus
  per-row token state.
- **Phase 6** — Email integration. At suggestion-accept trigger, mint token.
  At send-emails time, embed `{externalLink}` in the body. Update template
  wording (open question: who drafts — Connor and/or Justin?).
- **Phase 7** — Cutover. Trial cycle, monitor: how many reviewers use the
  link vs. email staff; token verification failures; SharePoint write errors.

## Key files added this session

| File | Purpose |
|------|---------|
| `docs/EXTERNAL_REVIEWER_INTAKE_PLAN.md` | Full implementation plan, 7 phases |
| `docs/DATAVERSE_SHAREPOINT_FILE_MODEL.md` | Connor-shareable storage explanation |
| `lib/services/external-token.js` | HMAC JWT mint/verify/hash |
| `lib/services/review-upload.js` | Shared core: SharePoint write + Dataverse PATCH |
| `lib/external/review-form-schema.js` | Form definition + validator |
| `lib/utils/file-magic.js` | PDF/DOCX/DOC magic-byte sniffing |
| `lib/dataverse/schema/wave2-existing/wmkf_appreviewersuggestion-extensions.json` | 11 new attributes (applied to prod) |
| `scripts/probe-sharepoint-write.js` | Idempotent write-access verification |
| `scripts/probe-reviewer-suggestion-schema.js` | Entity readability check |

Plus additions to `lib/services/graph-service.js` (`uploadFile`, `deleteFile`),
`middleware.js` (external path allowlist), `.env.example`
(`EXTERNAL_LINK_SECRET` documented), `jest.setup.js` (window guards for
node-env tests).

## Testing

```bash
npm test -- --runInBand          # 253 pass, 1 pre-existing skip
node scripts/probe-sharepoint-write.js
node scripts/probe-reviewer-suggestion-schema.js
node scripts/apply-dataverse-schema.js --target=prod --wave=2  # dry-run, idempotent
```

## Open questions tracked in the plan

These are the four items from `docs/EXTERNAL_REVIEWER_INTAKE_PLAN.md` §
"Open Questions for Implementation" — none block Phase 4 but worth deciding
during it:

1. Audit log destination — new Postgres table vs. new Dataverse entity.
2. Reviewer-facing email body wording (Connor / Justin draft).
3. Staff "regenerate token" UI placement.
4. Rate-limit storage — in-memory vs. Postgres.
