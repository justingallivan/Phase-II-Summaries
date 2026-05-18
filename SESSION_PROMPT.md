# Session 161 Prompt: Track B Phase 2 — build the builder UI (API layer done + twice Codex-converged)

## Session 160 Summary

User direction: Power Tools (Track B), implementation. **First app code** — S159 was design/plan; S160 built it. Phase 1 deterministic spine + Phase 2 API layer, each taken through a Codex cold-review + confirm round to convergence, plus the owed status reconcile. **69/69 tests green, all P0 gates green throughout. The builder UI is the one remaining piece — Track B is not yet user-reachable.**

### What was completed

1. **Phase 1 — deterministic spine** (`lib/services/dataverse-export/`): `constants` (Living-taxonomy dated-evidence layer), `compiler` (§2.1 validation + QuerySpec→FetchXML, aggregate count never `/$count`), `fetch-client` (backoff-hardened FetchXML paging primitive), `disclosure` (era/sentinel/decline-trifurcation/PI/institution engine), `workbook` (ExcelJS Data + Methods/Provenance sheets). Headless-tested vs fixture specs (the §11 exit criterion). Codex cold-round (0 P0/17 P1/9 P2) folded + confirm-pass converged (0 residuals); two reasoned push-backs held (RSS-vs-buffered-bytes; status `contains`).
2. **Doc/memory status reconcile** — one-pass across build plan §3/§10, design-doc AUTHORITATIVE block + Status-of-unknowns, memory entry, MEMORY.md index. Re-grep clean.
3. **Phase 2 — API layer** (`pages/api/dataverse-export/`): `metadata` (live taxonomies, fail-loud), `preview` (validate→compile→true count→signed `resultToken`, NO rows), `run` (resultToken confirm-gate → SSE → PRIVATE Blob → terminal `{ready,downloadUrl}`), `download` (gated proxy: requireAppAccess + signed short-lived token + private blob stream). `result-token.js` stateless confirm gate (HS256/NEXTAUTH_SECRET, typ-pinned). `live-taxonomy.js` shared fetch + operational resolver. appRegistry entry + security matrix (80→84).
4. **Two Codex Phase-2 rounds folded**: API-layer review (0 P0/5 P1/6 P2/1 P3 — incl. private-Blob exposure, excludeOperational silent no-op, preview taxonomy warnings, budget headroom, integration tests) then confirm-round (8 CONFIRMED + 3 new small items: download stream error-handling, security-matrix self-contradiction, route-test auth-wiring coverage). All folded; loop converged.

### Commits (S160, `main` — pushed at /stop)
`4bfd7db` Phase 1 spine + headless tests · `cb662cd` Phase 1 Codex fold · `3da2734` status reconcile · `8d46c7d` Phase 2 API layer · `3094a9c` Phase 2 Codex API-layer fold · `d6466d7` Phase 2 confirm-round fold · (+ this doc commit)

## Carry Forward

### A. Track B Phase 2 — BUILD THE BUILDER UI (the primary next step; nothing v1-core blocks it)
`pages/dataverse-bulk-export.js` does not exist yet → the app is not user-reachable. Build per build plan §6: `RequireAppAccess` guard; structured business-vocabulary filter builder where **every fan-out is a forced explicit choice** (which type / era scope / date basis / amount / program axis — `akoya_*` logical names never shown); preview/confirm panel (compiled spec in plain English, **true total prominent**, composition line, era split, `appliedRules`, `taxonomyWarnings`, any fail-loud) rendered from `/preview`; run → consume the `/run` SSE (`progress`/`truncated`/`ready`/`error`) → on `ready` fetch the gated `downloadUrl`; **loud truncation UX** (true total + narrowing dimensions, never a quiet footnote); on `error` no download offered. Mirror an existing SSE-consuming page. The API contract is stable + twice-reviewed; this is UI work against a fixed seam. After it lands: add it to nav-appropriate spots, write a `docs/guides/` user guide, and update the CLAUDE.md Applications-table row (drop the "builder UI not yet built" caveat).

### B. Track B follow-ups (non-blocking, decide deliberately)
- **Blob object lifecycle** — exposure is closed (private + gated + ~1h signed token); physical deletion still rides the existing maintenance Blob sweep. A deliberate retention/cleanup decision is owed before GA (not a v1 blocker).
- **Operational resolver coverage** — `live-taxonomy.buildResolver` maps the operational labels; if Dataverse adds an operational variant the preview/run **fail loud (422)** by design. That is correct behavior, not a bug — but it means a new operational label needs a (data-only) taxonomy reality, surfaced loudly, never silently included.
- **Non-v1-core, do NOT block on:** the 121-view preset library (Phase 3, gated on the per-program recognition working-session with user/Connor/Sarah), 4 embedded-nested RDL de-nests, AI on-ramp (Phase 2+ — the compiler/confirm seam is built so it slots in), async job model, bulk DOCX→text decline-rationale, Track A entirely (separate app key + its 3 write-policy decisions).
- **Orthogonal still-open:** Puzzle 2c doc-resident decline-rationale dimension (unchanged).

### C. slice-0 deploy — STILL the pilot path; gated on Connor Item 6; soft target 2026-05-19
Report factually (per `project_slice0_timeline_posture`): "gated on Connor's Item 6 maker-portal Tests 1+2" — **not** "overdue/at-risk". Soft 2026-05-19 is imminent; no slice-0 movement (all S160 was Power Tools by user direction). Specs READY (`lib/dataverse/schema/wave4*/`, do NOT re-author). Deploy procedure when Item 6 clears: (1) re-run BLOCKING `node scripts/probe-apprequestperson-role-data.js` (exit 0; point-in-time); (2) Connor review `wmkf_proposalbudgetline` name / cost-share label / `wmkf_portal_membership` shape; (3) `node scripts/apply-dataverse-schema.js --target=prod --wave=4 --execute` then `node scripts/extend-apprequestperson-role-picklist.mjs`; (4) `node scripts/setup-database.js` (V30 `009_submission_jobs.sql`); (5) post-deploy: entity-set pluralization, move both entities out of Atlas "Known gaps", re-run `check:atlas` + `:api-routes`.

### D. Forwarded data-quality follow-up (user's action, tracked)
`#1001205` (Project Angel Food) + `#1001249` (The Harmony Project) — native `Active` grants, null `akoya_decisiondate`; user forwarding to Connor + Sarah. NOT a Track B blocker.

### E. Reviewer Manager → Dataverse (when that work starts)
Read `project_reviewer_identity_fragmentation` + `project_no_banking_pii_in_dataverse` first. Open: run-to-ground the bill.com "early-adopter abandoned local collection" assumption (only 8/87 have `wmkf_billcom*`).

### Doc-vs-catalog gap (needs Connor — do NOT auto-absorb)
`contact.wmkf_portal_oid` + `akoya_request.wmkf_phaseiisubmittedat`/`wmkf_phaseiisubmittedby` in `INTAKE_PORTAL_DESIGN.md:621` but absent from the 2026-05-14 catalog. Reconcile with Connor.

### F. Low priority
COI policy body wording (Stage 2a); revert temp role elevations on prod app user (deferred per `project_wave1_pending.md`); Sarah's Phase II Research field inventory (Track 2).

## Open Items (pending Connor / a working-session — unchanged unless noted)

- **Field Set D doc-label collision** — `dataverse-akoya-request.md` vs `DYNAMICS_AI_FIELDS_SPEC_v3_cn.md:107`. `check:memory-drift` red by design until resolved. Ask Connor; do NOT silence.
- **121-view recognition working-session** — gates the Phase-3 guided-preset library only (NOT v1-core). Per-program "canonical trusted slice" with user/Connor/Sarah. Evidence `docs/atlas/evidence/akoya-recognition-sizing-2026-05-17.txt`.
- **`incompatible_shape` drift bucket** — unbuilt in `reconcile-memory-claims.js`. Follow-up only if memory-drift tooling invested in further.

## Calendar Checkpoints (soft — slack built in, Connor good-faith; report factually)

- **2026-05-19** — Slice-0 deploy *target* (soft) — ~2 days out as of S160 close (2026-05-17); gated on Connor Item 6, no slice-0 movement (S160 was Power Tools by user direction).
- **2026-05-26** — Dry-run: flip throwaway test request to `'Phase II Pending'`, watch PA flows fire.
- **2026-05-30** — Go/no-go review.
- **2026-06-01** — Pilot accepting submissions for mid-June Phase II Research cycle.

## Gotchas

- **🔴 Reconcile, don't append-patch** (`feedback_reconcile_dont_append_docs`). After ANY status edit to a long-lived doc: grep WHOLE doc + memory + MEMORY.md index, fix all together, then a final re-grep (S160's Phase-2 confirm round caught a security-matrix self-contradiction the same way — top-says-X/tail-says-not-X is a P0).
- **Power Tools status owned SOLELY by the design-doc "Residuals — AUTHORITATIVE LIST"; engineering phase ledger by the build plan §10.** Everywhere else points, never restates. Honest state: v1-core gates CLOSED; Phase 1 spine + Phase 2 API layer DONE + twice Codex-converged; **builder UI is the only remaining Phase-2 piece**; non-v1-core open (121-view preset, 4-RDL de-nest, Puzzle 2c, Track A).
- **Codex relay rule** (`feedback_codex_relay_verbatim`): deliver Codex output verbatim as the entire response, no commentary. Foreground, **fresh cold thread** (`--fresh`), never `--resume`. Invoke the `codex:codex-rescue` Agent directly. **Know when to STOP** — S160 ran fold→confirm per phase and converged; a 3rd round on small dictated fixes is diminishing returns.
- **Vercel Blob model = PRIVATE + gated proxy** (revised S160 from Codex). `/run` writes `access:'private'` + `contentDisposition:attachment`; the ONLY retrieval is `GET /api/dataverse-export/download` (requireAppAccess + signed short-lived `dvx-download` token binding the pathname). NOT a public URL. This is still the build-plan §5 ONE model (durable Blob ≠ the §12-rejected in-memory second-GET).
- **The QuerySpec→FetchXML seam is stable + twice-reviewed.** The UI emits a QuerySpec; do not re-derive semantics in the UI — `/preview` is the authority for total/composition/warnings. AI on-ramp later emits the same QuerySpec into the same confirm gate (additive, never a rewrite).
- **`createdon`-era ≠ business-era.** Time-slice on `akoya_decisiondate`, never `createdon`. `eraScope` is a creation-PROVENANCE filter only. **Decided-state = `akoya_requeststatus` value→class map** (exact map only; absent ⇒ UNCLASSIFIED, no suffix fallback — S160 Codex fold).
- **OData `/$count` caps at 5,000** — true total is FetchXML aggregate only (hard invariant; the spine enforces it).
- **Don't re-run committed S159 probes to "re-verify"** — dated evidence in `docs/atlas/evidence/akoya-*-2026-05-17.txt` is the oracle. Re-run only with a NEW structural hypothesis.
- **W6 Postgres table-drop** (`project_w6_table_drop_pending`) triggers ≥ 2026-07-01 — not yet due. **Unverified-until-checked destructive carryover** — grep-verify the 4 drain-only tables have no live readers before any DROP.
- **slice-0 specs already exist (`lib/dataverse/schema/wave4*/`)** — do NOT re-author. Pre-deploy probe `scripts/probe-apprequestperson-role-data.js`. Scope = 4 items (`project_slice0_scope`).
- **`check:memory-drift` red by design** (Field Set D). Advisory, NOT a P0 blocker. Don't silence.
- **`node_modules` was empty at S160 start** (iCloud `.nosync` cleared it) — `npm ci` restores it. iCloud sync can silently mutate the working tree; `git restore` usually right.
- **Tests use `@jest-environment node`** for the dataverse-export suites (jose ESM won't parse under jsdom). Run local jest via `node node_modules/jest/bin/jest.js <file>` (npx fetches a jest without `next/jest`).

## Key Files Reference

| File | Purpose |
|------|---------|
| `lib/services/dataverse-export/` | Track B engine — constants · compiler · fetch-client · disclosure · workbook · result-token · live-taxonomy (Phase 1 spine + Phase 2 support; twice Codex-converged) |
| `pages/api/dataverse-export/{metadata,preview,run,download}.js` | Phase 2 API layer (stable seam the UI builds against) |
| `tests/unit/dataverse-export.test.js` · `dataverse-export-routes.test.js` | 49 spine+token + 20 route-handler tests (69 total, green) |
| `docs/DATAVERSE_POWER_TOOLS_TRACK_B_BUILD_PLAN.md` | Engineering plan + §10 phase ledger (§6 = the builder UI spec) |
| `docs/DATAVERSE_POWER_TOOLS_DESIGN.md` | Design; **"Residuals — AUTHORITATIVE LIST" = single source of truth for status** |
| `shared/config/appRegistry.js` | `dataverse-bulk-export` entry (admin-assignable; not default-granted) |
| `lib/dataverse/schema/wave4*/` | slice-0 specs (READY; not deployed) |

## Testing

```bash
node node_modules/jest/bin/jest.js tests/unit/dataverse-export.test.js tests/unit/dataverse-export-routes.test.js  # 69/69 green
npm run check:atlas && npm run check:atlas:self-test && npm run check:api-routes  # P0 gates (green at S160 close; api-routes=84)
node scripts/check-memory-drift.js   # advisory; exits 1 on Field Set D by design
# Next: pages/dataverse-bulk-export.js — UI against the stable /preview + /run + /download seam.
#   /preview is the authority for total/composition/warnings; UI must not re-derive semantics.
```
