---
name: Reviewer Finder — Dataverse-native entry path
description: Reviewer Finder's PDF-upload entry was replaced by a Dynamics-native picker; both the entry path and the save-candidates writeback are now Dataverse-only (verified 2026-05-03).
type: project
originSessionId: 97cd3044-49bb-4f67-b000-5d32980d6faa
---
**Status: SHIPPED.** Both pieces of the original direction landed before 2026-05-03; verified by reading the live code:

- **Picker UI:** `pages/reviewer-finder.js` exposes a "From My Proposals" / "Upload PDF" tab toggle. The picker (`ProposalPickerCard`) is the default tab, calling `/api/reviewer-finder/my-proposals` for the cycle dropdown and `/api/reviewer-finder/load-proposal` to materialize the chosen proposal's narrative PDF into Vercel Blob for the existing analyze pipeline. PDF upload retained as a fallback only.
- **Save-candidates writeback:** `pages/api/reviewer-finder/save-candidates.js` writes via the three Dataverse adapters (`potential-reviewer`, `researcher`, `reviewer-suggestion`) — Postgres is **no longer written by this endpoint**. Review Manager and My Candidates both read from Dataverse.

**Postgres reviewer tables are NOT dormant.** Audit 2026-05-03 found `researchers`, `publications`, `reviewer_suggestions`, `proposal_searches`, `grant_cycles` are still load-bearing for the broader Reviewer Finder app — `pages/api/reviewer-finder/researchers.js` (browse/manage), `extract-summary.js`, `generate-emails.js`, `grant-cycles.js`, and `my-proposals.js` all still read/write Postgres. The Dataverse cutover was scoped to the save-candidates write path; the rest of the app still runs on Postgres.

**UPDATE 2026-05-06**: Connor approved aggressive timeline for migrating those Postgres reviewer tables to Dataverse — see `project_reviewer_postgres_to_dataverse_migration.md`. Migration is now active top-priority work, prerequisite for intake portal pilot (mid-June 2026). The "do not drop" stance below is correct *until* migration ships.

**How to apply:** when planning Reviewer Finder work, do not rebuild the picker or save-candidates writeback — they're done.
- **Do NOT drop the Postgres reviewer tables** without a broader migration of the browse/email/summary flows. The "drop dormant tables" item that has appeared in multiple session prompts is **wrong** — it would break the live app.
- **Identity bridge (`user_profiles` → `systemuser`)** — the original direction listed this as a prerequisite. It's working in prod (the picker uses it via `program-director-resolver.js`), but the broader identity-reconciliation TODO in `project_dynamics_identity_reconciliation.md` covers attribution on Dataverse writes and joined reporting, which is a different scope and still open.

**Verification commands** (if status ever needs to be re-confirmed):
- `grep -n "ProposalPickerCard\|FileUploaderSimple" pages/reviewer-finder.js` — both should be present, picker as default tab.
- `head -20 pages/api/reviewer-finder/save-candidates.js` — header comment confirms Postgres is no longer written.
