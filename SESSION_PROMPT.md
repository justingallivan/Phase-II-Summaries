# Session 164 Prompt: slice-0 P1-Update — send Connor OR authorize the waiver

## Session 163 Summary

A long working/review session, entirely on the **slice-0 Item-6 P1-Update** thread (Track B untouched). Net outcome: the slice-0 destructive carryover was pre-flighted, Item-6 was honestly re-scoped, the three open design decisions were locked, and a fully-reviewed Connor maker-portal test + waiver were prepared. **Nothing was deployed; no waiver authorized.** The deploy now hinges on exactly one open gate.

### What was completed

1. **Destructive-carryover pre-flight (per carryover-hygiene rule).** Verified the slice-0 schema deploy is **additive / non-destructive / idempotent** (2 new entities + 4 nullable attrs + picklist option-adds + V30 Postgres table; no DROP anywhere). Re-ran BLOCKING `scripts/probe-apprequestperson-role-data.js` → CLEAR. Built + ran a new read-only `scripts/probe-slice0-attr-collision.mjs` → CLEAR — closing the attribute-collision check the schema-review doc had wrongly deferred to Connor (it was a metadata GET we could do ourselves).
2. **Item-6 honestly re-scoped (Codex-corrected).** Connor's S162 deactivate-not-delete ruling **dissolves P2 + P1-Delete**. An interim draft overstated P1-Update as "post-deploy already"; **Codex caught it** — corrected across `ITEM_6_DISCUSSION.md §0`, `DESIGN.md` PA-boundary, `SCHEMA_CHANGES.md`, atlas, and memory. **Net: P1-Update (does the parent-status trigger filter bind/fire on a `statecode`-only deactivation Update) is the ONE open pre-deploy gate** — closes only via Connor's maker-portal test OR an explicitly authorized risk waiver.
3. **Three decisions LOCKED:** entity name `wmkf_proposalbudgetline` (Justin); cost-share labels normalized to spaced form; **trigger Select-columns = `blank`** (Codex-validated SAFE-WITH-CONDITIONS — recorded in the authoritative design record with the accepted bounded over-fire tradeoff + the "does NOT close the P1-Update gate" caveat).
4. **Connor test artifacts, Codex-reviewed end to end.** Iterated DRAFT→v2→v3→v4→**v5** runbook + a condensed **core-gate handout** (`INTAKE_PORTAL_ITEM_6_CONNOR_CORE_GATE.md`), passed a Codex extraction-fidelity review (2 BLOCKER + 4 CONCERN + 1 NIT all fixed). Waiver text drafted in v5 **Artifact 1 — UNAUTHORIZED**. Connor email drafted.
5. **Process feedback captured.** New memory `feedback-share-codex-verbatim`: present Codex output verbatim as the primary artifact, immediately, before any paraphrase.

### Commits (S163, `main`, all pushed — `git status` = `main...origin/main` in sync)
- `700465a` dissolve Item-6 schema-deploy gate + in-house collision probe
- `1566e33` lock entity name + normalize cost-share labels
- `0da23c2` Codex review fixes — probe pagination + doc consistency
- `ae394ca` fix atlas self-contradictions
- `af7ede8` resolve both Codex BLOCKERs honestly (P1-Update = open gate)
- `2bc6393` Connor core-gate handout + v5 runbook (staging)
- `6e0bd09` lock Select-columns=blank decision (Codex-validated)
- `e8027f5` archive superseded drafts (DRAFT/v2/v3/v4) as audit trail

Memory (harness store `~/.claude/projects/.../memory/`, NOT repo — won't sync via git): NEW `feedback-share-codex-verbatim`; REWRITTEN `slice0-deactivate-not-delete-recalc` (now: P1-Update remains the open pre-deploy gate; the "fix was doc-narrative not spec-rework" correction); `MEMORY.md` index updated. Read `slice0-deactivate-not-delete-recalc` + `feedback-share-codex-verbatim` before resuming.

## Potential Next Steps

### A. slice-0 / P1-Update — THE open gate (destructive carryover; still NOT green-lit)

🔴 **Connor resolved the S162 *design*; S163 found the P1-Update *binding* still unverified.** "Connor responded" ≠ "safe to run" — confirmed again this session. Two mutually-exclusive resolution paths, **neither done**:

1. **Send Connor the test.** Email draft is a **local uncommitted working file** at `docs/INTAKE_PORTAL_ITEM_6_CONNOR_EMAIL.md` (per user instruction — see gotcha; it will NOT be on the other Mac). Attach the committed `INTAKE_PORTAL_ITEM_6_CONNOR_CORE_GATE.md`. Await his Step 11 evidence + Step 12 verdict. VERIFIED (real path) clears the gate; FAIL → Option B drain fallback, **zero schema rework**.
2. **Authorize the waiver.** Drafted, UNAUTHORIZED, in `INTAKE_PORTAL_ITEM_6_P1UPDATE_TEST_DRAFT_v5.md` Artifact 1 — decouples the schema deploy from P1-Update (relocates it to a hard pre-flow-live gate, NOT P4). Justin's signature line is blank by design; I must not self-authorize.

On a clean Connor result **or** an authorized waiver, the deploy sequence (still destructive — re-verify at the moment): re-run BOTH point-in-time probes (`probe-apprequestperson-role-data.js`, `probe-slice0-attr-collision.mjs`); grep live callers; `apply-dataverse-schema.js --target=prod --wave=4 --execute`; `scripts/extend-apprequestperson-role-picklist.mjs`; `node scripts/setup-database.js` (V30); post-deploy Atlas amendments + 3 P0 gates. Specs at `lib/dataverse/schema/wave4*/` — do NOT re-author.

Optional tidiness (not required to send Connor — the email references the committed handout filename): land v5/handout as the real §5 in `docs/INTAKE_PORTAL_ITEM_6_MAKER_PORTAL_TESTS.md`.

### B. Track B floor — follow-ups (parked; untouched S163; not blocking slice-0)
- **Primary Contact final shape — PARKED pending the user's SME reply** on the SoCal Request-PC vs Org-PC divergence (org-grants-staff vs request-driver-exec). Provisional: forced-choice Request-PC vs Org-PC (both Tier-2) with the duplicate-contact caveat. Do not ratify until the SME answers.
- **Name-normalized re-count** — quantify *true* person-divergence vs the inflated ~31% GUID rate.
- **Donor** = Tier-2 fast-follow — non-misleading "directed-by sponsor" label + a `wmkf_donors` entity-shape probe before build.
- **Prototype** — the user's stated path: NL→QuerySpec on-ramp into the unchanged confirm seam (additive, not a rewrite).

### C–F. Unchanged from S161/S162
Field Set D doc-label collision (Connor; `check:memory-drift` red BY DESIGN — do not silence); Reviewer Manager→Dataverse (read `project_reviewer_identity_fragmentation` first); COI policy wording; revert temp role elevations; Sarah's Phase II Research field inventory; data-quality `#1001205`/`#1001249`.

## Calendar Checkpoints (soft — Connor good-faith; report factually, not "overdue")
- **2026-05-19** — slice-0 deploy *target* (soft). Status: still gated on P1-Update (Connor test not yet sent / waiver not authorized). Not "missed" — gated by an honest open question.
- **2026-05-26** — dry-run: flip a throwaway test request to `'Phase II Pending'`, watch PA flows fire.
- **2026-05-30** — go/no-go review. **2026-06-01** — pilot accepts submissions (mid-June Phase II Research cycle).

## Gotchas (still live — carried forward)
- 🔴 **slice-0 is destructive carryover; P1-Update is the single open gate.** Connor resolved the *design* (S162); the *binding* (parent-status trigger filter on a statecode-only deactivation Update) is unverified — needs his maker-portal test OR an authorized waiver. Do not run any `--execute` autonomously; re-run both point-in-time probes at deploy time.
- 🔵 **Connor email = intentionally uncommitted local working file** (`docs/INTAKE_PORTAL_ITEM_6_CONNOR_EMAIL.md`). User chose this; it will NOT sync to the other Mac. If resuming elsewhere, regenerate from the committed handout. Everything else this arc is committed + pushed.
- 🟢 **Present Codex output VERBATIM** as the primary artifact, immediately, before any paraphrase (memory `feedback-share-codex-verbatim`). Applies to every codex-rescue/review run. The rescue agent's "running in the background, I'll notify you" return is a known failure mode — it produced nothing once this session; re-issue synchronously and treat the returned tool result as the deliverable.
- 🔴 **"PI" / "primary contact" / "donor" are per-program / disambiguation hazards** — field dictionary must be per-program, not entity-global (memory `dataverse-export-floor-scoping`).
- 🔵 **Blob = TWO stores, never conflate** — public `phase-ii-summaries-blob` (`BLOB_READ_WRITE_TOKEN`) vs Dataverse-export private `dvx-export-private` (`DVX_BLOB_RW_TOKEN`).
- 🔴 **Living-taxonomy lesson** — `lib/services/dataverse-export/{constants,live-taxonomy,compiler}.js` names must be verified against a live probe, not fixtures (tests mock the taxonomy).
- **`check:memory-drift` red by design** (Field Set D). Advisory, NOT a P0 blocker. Do not silence.
- **dataverse-export tests use `@jest-environment node`**; live repro = standalone env-loaded `.mjs`. Probe pattern: env-load `.env.local`, client_credentials token, FetchXML aggregate (NEVER OData `/$count`).
- **iCloud `.nosync` can clear `node_modules`** at session start — `npm ci` restores; `.next`/`.next.nosync/` untracked is normal.

## Key Files Reference

| File | Purpose |
|------|---------|
| memory `slice0-deactivate-not-delete-recalc` | P1-Update is the open gate; deactivate-not-delete; destructive-carryover caveat — READ FIRST for §A |
| memory `feedback-share-codex-verbatim` | Present Codex output verbatim, primary, immediately — READ before any Codex run |
| memory `dataverse-export-floor-scoping` / `akoya-temporal-axis-encodings` | Track B floor + per-program hazards / meeting-date canonical — READ for §B |
| `docs/INTAKE_PORTAL_ITEM_6_CONNOR_CORE_GATE.md` | Connor send-handout (committed) — Steps 1–12, Select-cols locked blank |
| `docs/INTAKE_PORTAL_ITEM_6_CONNOR_EMAIL.md` | Connor email draft — LOCAL working file, uncommitted (see gotcha) |
| `docs/INTAKE_PORTAL_ITEM_6_P1UPDATE_TEST_DRAFT_v5.md` | Full runbook + waiver (Artifact 1, UNAUTHORIZED) |
| `docs/INTAKE_PORTAL_ITEM_6_DISCUSSION.md` §0 | Authoritative Item-6 decision record (P1-Update gate; Select-cols decision) |
| `lib/dataverse/schema/wave4*/` | slice-0 specs — READY, do NOT re-author |
| `scripts/probe-apprequestperson-role-data.js` · `scripts/probe-slice0-attr-collision.mjs` | The two BLOCKING point-in-time pre-deploy probes (re-run at deploy) |

## Testing

```bash
npm run check:atlas && npm run check:atlas:self-test && npm run check:api-routes   # 3 P0 gates (green; api-routes=84)
node scripts/probe-apprequestperson-role-data.js     # exit 0=CLEAR; re-run at deploy
node scripts/probe-slice0-attr-collision.mjs         # exit 0=CLEAR; re-run at deploy (paginated, follows @odata.nextLink)
node scripts/check-memory-drift.js                   # advisory; exits 1 on Field Set D BY DESIGN
# Live probe pattern: standalone scripts/probe-*.mjs/.js — .env.local, client_credentials, FetchXML aggregate (NOT /$count)
```
