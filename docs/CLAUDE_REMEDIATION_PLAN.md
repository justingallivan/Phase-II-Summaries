# Remediation Plan — Closing the Ground-Truth Gap

**Created:** 2026-05-07 (S136)
**Author:** Claude (self-directed, at Justin's instruction)
**Scope:** This is a self-correction document. Justin can read it; the audience is future-Claude (and current-Claude when this drifts).

## Why this exists

Over Session 136 (and earlier), the reviewer migration plan has been wrong about the live state of the codebase repeatedly:

| Round | What I said | Ground truth |
|---|---|---|
| Initial draft | Researcher pool model with `wmkf_app_researcher` standalone entity | Live system is 1:1 sidecar `wmkf_appresearcher` ↔ `wmkf_potentialreviewer` |
| Initial draft | Publications has tens of thousands of rows | 0 rows; writer is dead code |
| Initial draft | `proposal_searches` is alive | 0 rows; writer is dead, IDOR guard always fails |
| Codex round 1 | `reviewer_suggestions` has ~15 columns | 37 columns; `request_number` is the natural join key |
| Codex round 1 | Backfill idempotency is `(proposal_id, email)` | `proposal_id` is the title-prefix, not a cycle code |
| Codex round 1 | Reviewer-portal data lives on `wmkf_potentialreviewer` | It lives on `wmkf_appreviewersuggestion` (per `wmkf_appreviewersuggestion-extensions.json`) |
| Codex round 2 | `wmkf_potentialreviewer` is per-proposal slot | It's global per-person; suggestions are per-(person, proposal) |
| Codex round 2 | Review Manager is fully Dataverse | `render-emails.js` + `send-emails.js` read `grant_cycles` from Postgres |
| Parity probe | Backfill is critical path workstream | 97.6% of Postgres rows are stale duplicates of existing Dataverse rows; backfill is essentially done |
| Memory survey (S136 evening) | Wave 2 schema was undesigned, naming convention was settled, "pool vs 1:1" was a real fork | `lib/dataverse/schema/wave2/` had **6 fully designed schema-as-code files** for months; the schema described the 1:1 model already (no fork existed); the "naming convention divergence" was a misread of snake_case filenames vs. PascalCase schemaName vs. lowercase deployed names — the schema-as-code is internally consistent |
| Memory survey (same) | The reviewer migration was discovery work | Memory entry `project_reviewer_history_data_quality.md` had previously cited "the Wave 2 backfill (333 Postgres rows → Dataverse)" — the backfill was a known plan, not a discovery |

Each correction came from a probe (live audit, grep gate, adapter re-read, parity script). **None of these facts were documented anywhere I could read; all of them are derivable from the source code I authored.** The cycle is: write a plan from memory → Codex catches a guess → I probe → I correct → I get to a new layer of misunderstanding → repeat.

**This is not acceptable** (Justin's words, but I agree). The pattern means every plan goes through three drafts before it's right, and the third draft still might be wrong. The remediation must be structural — better documentation of the live state — not just "be more careful."

## Root cause

I built the app suite incrementally over many sessions. Each session knew its local context. The integrated state — how every table connects to every adapter to every endpoint to every UI surface — was never written down comprehensively. CLAUDE.md is a high-level orientation; it does not capture per-table data flows, per-endpoint persistence sources, or per-adapter entity models.

When I plan migrations or integration work, I currently rely on (in order):
1. Memory of recent sessions
2. CLAUDE.md
3. Memory entries in `.claude-memory/`
4. Schema doc (`docs/DYNAMICS_SCHEMA_ANNOTATION.md`) — partial
5. `lib/db/schema.sql` — incomplete (e.g., `grant_cycles` was added by ad-hoc script, not in schema.sql)
6. Grepping the codebase ad hoc

The first three are guess-prone (memory rots). 4 and 5 are partial. 6 is the only reliable source but is invoked too late, and only when something already feels off.

## What "good" looks like

A canonical **Application State Atlas** that for every significant entity, table, adapter, and endpoint records:
- **Schema**: columns / fields with type and population stats
- **Source of truth**: Postgres-only, Dataverse-only, mixed-and-which-direction
- **Read paths**: which endpoints / services / scripts query it
- **Write paths**: which endpoints / services / scripts mutate it
- **Cross-system linkages**: how Postgres ↔ Dataverse interact for this entity
- **Last verified**: timestamp of the most recent live probe, with the script used

When I draft a migration or integration plan, the Atlas is the first thing I read — not the last thing I correct.

## The plan

### Phase 0 — Stop the bleeding (S137 or earlier)

Before continuing migration execution work, I commit to these rules. They apply effective immediately. The cost is a few extra tool calls per session; the savings is dramatic vs. the rework cycle that S136 surfaced.

**Probe-before-plan rule.** Any plan claim about live state is labeled with one of:
- `[VERIFIED 2026-05-07 via scripts/X.js]` — actually probed
- `[ASSUMED — needs verification]` — guess, don't act on it without checking

**No "is X the case" without checking.** If I can't cite a probe or a recent grep, I run one before answering. Default response shape: "Let me check" + tool call, not "I think X."

**Commit probe scripts.** Every probe gets committed to `scripts/` so the result is reproducible.

**Memory hygiene rule** (added 2026-05-07 after surfacing that I had not been reading memory entries even when they were directly relevant):
- At session start, after seeing the index, I **read full memory entries** for any memory whose name matches the work I'm about to do. Reading the index line is not enough.
- If the work I'm starting touches a domain (e.g., "reviewer migration"), I `cat` every memory file matching `*reviewer*`, `*migration*`, or `*<domain>*` before drafting any plan content.
- **Memory drift detection**: if the memory directory looks suspiciously sparse for a domain that I know has been worked on (e.g., a Reviewer Finder project history but only one memory entry mentioning it), I flag the gap and ask whether unsynced memory exists on another machine.
- I tell the user, plainly, what memory I read before answering — not as a brag but as evidence of grounding.

**Adjacent-context survey rule** (added 2026-05-07 after the `wave2/` directory miss):
- When I cite a single file (e.g., `lib/dataverse/schema/wave2-existing/wmkf_appreviewersuggestion-extensions.json`), I `ls` its **parent directory** before treating my citation as authoritative.
- When I cite a doc (e.g., `docs/POSTGRES_TO_DATAVERSE_MIGRATION.md`), I `ls docs/` to see what siblings exist with related names.
- When I'm about to claim "X has no Y" (e.g., "publications has no Dataverse counterpart"), I grep for Y in plausible locations before asserting.
- This rule is mechanical, not stylistic. The grep cost is bounded; the rework cost when I miss adjacent work is unbounded.

**Active doubt on state claims rule** (added 2026-05-07 after the "naming convention" non-issue):
- When I'm about to write "the convention is X," "the design landed at Y," or "live state is Z," I treat that as a **flag**, not a conclusion.
- Default: read three independent sources (live entity / schema-as-code / memory entry) before stating a "convention" or "settled" claim.
- If sources conflict (as `wave2/` underscored filenames vs. live no-underscore deployment did), I name the conflict and let the user resolve, rather than guessing which is right.

**Sycophancy and "I think" hedging** are different and unrelated rules. The above is about ground-truth, not tone.

### Phase 1 — Inventory (~1 session)

Build a comprehensive inventory of the app suite's data layer. Output: `docs/APPLICATION_STATE_ATLAS.md` (index doc) + `docs/atlas/` (per-entity pages).

Inventory targets:

**A. Postgres tables.** For each of the ~27 tables in `lib/db/schema.sql` + ad-hoc-created tables:
- Schema (columns, types, indexes, constraints) from live `information_schema`
- Live row count + per-column population (already automated in `scripts/audit-postgres-state.js`; extend to all tables)
- Read sites (grep for `FROM <table>`)
- Write sites (grep for `INSERT INTO <table>`, `UPDATE <table>`)
- Migration disposition (per the Wave 1 + Wave 2 plans + actual reality)

**B. Dataverse entities** (custom + extended):
- Custom entities (`wmkf_app*`) — schema, alt keys, ownership, adapter file
- Extension fields on vendor entities (`akoya_request`, `contact`, `account`, `wmkf_potentialreviewer`, `wmkf_appreviewersuggestion`)
- Inline schema annotations from `docs/DYNAMICS_SCHEMA_ANNOTATION.md` reconciled against probed truth
- Read sites (grep for entity logical name + adapter import)
- Write sites (same)
- Auto-populated fields (e.g., the 0% bibliometric fields on `wmkf_appresearcher`)

**C. Adapters in `lib/dataverse/adapters/`**:
- For each: which entity, what FIELD_SELECT, what lookups, what writes, what callers
- Documented in the per-entity Atlas page

**D. API endpoints** (already partially captured in `docs/API_ROUTE_SECURITY_MATRIX.md`; extend with persistence info):
- For each endpoint: Postgres reads/writes? Dataverse reads/writes? Both? Where's the source of truth for what it returns?
- Cross-link to the Atlas pages it touches

**E. Service layer in `lib/services/`**:
- Per service: which adapters/tables it talks to, what business operations it implements

This inventory is **the fix**. Once it exists, I read the Atlas index when starting any data-layer work, and the per-entity pages tell me what I need without guessing.

### Phase 2 — CI gate (1 session, after Phase 1 ships)

A new CI check (`npm run check:application-state-atlas`):
- Greps for new INSERT/UPDATE/DELETE sites against tables; fails if a new write site appears that isn't reflected in the Atlas page for that table
- Greps for new adapter imports; fails if an entity gains a caller that isn't in the Atlas
- Same shape as `check:api-routes` already does for `pages/api/**`

This is the durability mechanism. Without CI gating, the Atlas would rot the same way the security matrix used to before its CI gate.

### Phase 3 — Self-rules embedded in CLAUDE.md (concurrent with Phase 1)

Add a "Ground-truth requirement" section to CLAUDE.md that codifies Phase 0's rules:
- Before any migration or integration plan claim, cite a probe
- The Atlas is the canonical source for live state
- Plans must label every state claim with `[VERIFIED]` or `[ASSUMED]`

This is the reminder mechanism. The Atlas itself is read-on-demand; the rule is what makes me pull it open.

### Phase 4 — Backfill the Wave 1 + Wave 2 history (concurrent)

Reconcile the existing migration docs (`POSTGRES_TO_DATAVERSE_MIGRATION.md`, `REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md`) against the Atlas. Anywhere they describe the system "as planned" but the system landed differently, mark "as-built" vs. "as-planned" explicitly so the divergence doesn't propagate to Wave 3+.

## Sequencing relative to migration execution

The reviewer migration is on a 6-week timeline ending mid-June. The remediation plan can't block that, but should run alongside it:

- **Phase 0** (probe-before-plan + label rule): immediately, no calendar cost
- **Phase 1** (Atlas inventory): one session in the next 1–2 weeks, before W3 endpoint rewrites
- **Phase 2** (CI gate): after Phase 1, before W4
- **Phase 3** (CLAUDE.md updates): same week as Phase 1
- **Phase 4** (Wave doc reconciliation): after Phase 1; can run continuously

If the migration timeline tightens, Phase 1 takes priority over Phases 2–4, because Phase 1 directly de-risks W3–W5.

## What this is NOT

- **Not a process change for Justin.** Justin doesn't need to read the Atlas; he can keep asking me direct questions. The Atlas is for ME to consult before answering.
- **Not a substitute for Codex review.** Stress-tests catch issues the Atlas wouldn't (timeline realism, cutover race conditions). The Atlas closes a different gap — the "what does the live system actually look like" gap.
- **Not a replacement for memory.** Memory captures intent, decisions, and "why." The Atlas captures structural facts. Both stay; they don't overlap.

## Acceptance — how I know I'm done

Two acceptance signals, both required:

1. **Codex review of the next major plan does not produce corrections about the live state of the existing codebase** — only about the proposed work.
2. **Justin doesn't have to surface unread memory or unread directories** — if he says "you missed X," X is something I genuinely couldn't have surfaced via the rules above (e.g., off-machine state I have no access to), not something that was in memory or `ls`'d adjacent to a file I cited.

Until both, I'm still in the regression zone.

## Failure mode to watch for

Even with the Atlas, I could degrade into "I'll just trust what it says" without re-probing. The CI gate (Phase 2) protects against the Atlas getting stale relative to the code. But if I read the Atlas and don't notice that its "Last verified" date is 6 months old on a table that's seen heavy churn, I'm back where I started.

Mitigation: every Atlas page carries a `Last verified` timestamp. If a page hasn't been touched in 60+ days and I'm planning destructive work against the entity it describes, I rerun the probe before I trust the page. CLAUDE.md will codify this.
