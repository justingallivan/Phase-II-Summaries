#!/usr/bin/env node
/**
 * restore-reviewer-suggestion-cleanup-backup.js
 *
 * Reverses the post-pilot one-shot reviewer-suggestion cleanup by re-creating
 * the deleted `wmkf_appreviewersuggestion` rows from the pre-delete backup blob.
 *
 * Spec: docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md §"Rollback strategy" item 3
 * ("reads the JSON blob, re-CREATEs the `wmkf_appreviewersuggestion` rows via
 * `reviewerSuggestionAdapter.upsert`. Idempotent via alt key.") and dependency-
 * order step 15 ("`scripts/restore-reviewer-suggestion-cleanup-backup.js` MUST exist before the
 * cleanup script's first real-mode run").
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BACKUP-BLOB CONTRACT v1 — defined here; the (not-yet-built) one-shot cleanup
 * script MUST emit exactly this envelope before it deletes any row:
 *
 *   {
 *     "schema": "reviewer-cleanup-backup/v1",
 *     "generatedAt": "<ISO-8601>",
 *     "cleanupRunId": "<opaque id, echoed in restore logs>",
 *     "predicateVersion": "S136-8signal",   // engaged-signal predicate revision
 *     "rows": [
 *       {
 *         // REQUIRED — the alt-key + FK binds the adapter upsert needs:
 *         "potentialReviewerId": "<wmkf_potentialreviewers GUID>",
 *         "requestId":           "<akoya_requests GUID>",
 *         // REQUIRED (boolean) — `selected` is one of the 8 engaged-signals the
 *         // cleanup predicate keys on; a deleted (unengaged) row has
 *         // selected=false. The backup MUST record its true value. This restore
 *         // NEVER defaults it: a missing/non-boolean `selected` is a hard SKIP,
 *         // because defaulting would silently misclassify a restored unengaged
 *         // row as engaged (it would then survive the next cleanup pass).
 *         "selected":            false,
 *         // Content fields (all optional; restored verbatim via upsert):
 *         "suggestionLabel":  "...",
 *         "grantCycleCode":   "J26",
 *         "programArea":      "...",
 *         "relevanceScore":   0.0,
 *         "matchReason":      "...",
 *         "sources":          "...",
 *         "summaryBlobUrl":   "...",
 *         // Provenance (NOT written back — for human-readable logs / audit only):
 *         "originalSuggestionId": "<wmkf_appreviewersuggestionid the row had>",
 *         "requestNumber":        "<akoya_requestnum, for logs>",
 *         "reviewerEmail":        "<for logs>",
 *         "deletedAt":            "<ISO-8601>"
 *       }
 *     ]
 *   }
 *
 * FIDELITY ASSUMPTION (load-bearing — do not silently break):
 *   The cleanup predicate (locked S136, 8 engaged-signals: wmkf_contact,
 *   wmkf_emailsentat, wmkf_responsetype, wmkf_selected, wmkf_externaltokenissued,
 *   wmkf_proposalfirstaccessed, wmkf_reviewsharepointfolder, any review-form
 *   picklist) only ever deletes UNENGAGED rows. Such rows carry no lifecycle /
 *   outreach / token / structured-review / Stage-2a state — only save-candidates
 *   content. That is exactly the field set `reviewerSuggestionAdapter.upsert`
 *   restores, so the restore is faithful. If the cleanup predicate is ever
 *   widened to delete rows that DO carry lifecycle state, this script would
 *   silently lose those fields — STOP and revisit (the backup envelope + this
 *   restore would need the full field set, not the upsert subset).
 *
 * OPEN CONTRACT DECISION (flag for the cleanup author + Justin, do NOT decide
 * here): which Blob store the cleanup backup lives in. Reviewer-suggestion
 * backups reference person GUIDs and (in provenance) emails — arguably PII.
 * The repo's general script pattern is the PUBLIC `phase-ii-summaries-blob`
 * store (`BLOB_READ_WRITE_TOKEN`) with 30-day retention; the private store
 * (`dvx-export-private` / `DVX_BLOB_RW_TOKEN`) is Dataverse-export-only and must
 * NOT be conflated. A reviewer-PII backup may warrant private storage instead.
 * This restore is store-agnostic: it consumes a local file or a fetched URL, so
 * the decision can be made when the cleanup script is built.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * USAGE
 *   node scripts/restore-reviewer-suggestion-cleanup-backup.js --file ./backup.json          # dry-run
 *   node scripts/restore-reviewer-suggestion-cleanup-backup.js --blob-url https://...        # dry-run
 *   node scripts/restore-reviewer-suggestion-cleanup-backup.js --file ./backup.json --commit # write
 *
 * Exactly one of --file / --blob-url is required. Dry-run is the default and
 * performs ONLY read-only alt-key lookups to print an accurate create-vs-update
 * plan; no writes happen without --commit. Re-runnable, NOT atomically
 * idempotent: the adapter does find-then-update/create (a sequential read then
 * write — NOT a true Dataverse alternate-key PATCH), so sequential
 * single-instance reruns after a partial restore are safe (existing rows are
 * updated in place). Do NOT run concurrent instances against the same backup —
 * the find-then-write window is racy and could double-create. Exit code is
 * non-zero if any row fails, so it is safe to gate automation on.
 *
 * Admin-scoped: like the sibling backfill, all Dataverse calls run inside a
 * restrictions-bypassed context and NO MSCRMCallerID impersonation is applied
 * (a restore is a system operation, not a user action).
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── env bootstrap (mirrors scripts/backfill-reviewer-suggestions-to-dataverse.js) ──
const envPath = join(__dirname, '..', '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let [, k, v] = m;
    v = v.trim().replace(/^"(.*)"$/, '$1');
    if (!process.env[k]) process.env[k] = v;
  }
}

// ── arg parsing ──
const argv = process.argv.slice(2);
const COMMIT = argv.includes('--commit');
function argValue(flag) {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}
const filePath = argValue('--file');
const blobUrl = argValue('--blob-url');

if ((!filePath && !blobUrl) || (filePath && blobUrl)) {
  console.error('FATAL: provide exactly one of --file <path> or --blob-url <url>.');
  process.exit(2);
}

const SCHEMA = 'reviewer-cleanup-backup/v1';

async function loadBackup() {
  let raw;
  if (filePath) {
    if (!existsSync(filePath)) {
      console.error(`FATAL: backup file not found: ${filePath}`);
      process.exit(2);
    }
    raw = readFileSync(filePath, 'utf8');
  } else {
    const res = await fetch(blobUrl);
    if (!res.ok) {
      console.error(`FATAL: fetch ${blobUrl} → HTTP ${res.status}. If the backup blob is access-controlled, download it first and pass --file.`);
      process.exit(2);
    }
    raw = await res.text();
  }
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    console.error(`FATAL: backup is not valid JSON: ${e.message}`);
    process.exit(2);
  }
  if (doc?.schema !== SCHEMA) {
    console.error(`FATAL: unexpected backup schema "${doc?.schema}" (expected "${SCHEMA}"). Refusing to proceed — a schema mismatch means this restore cannot guarantee fidelity.`);
    process.exit(2);
  }
  if (!Array.isArray(doc.rows)) {
    console.error('FATAL: backup envelope has no "rows" array.');
    process.exit(2);
  }
  return doc;
}

const doc = await loadBackup();

console.log('# Reviewer-suggestion restore from cleanup backup');
console.log(`Mode:             ${COMMIT ? 'COMMIT (writes)' : 'DRY-RUN (read-only plan)'}`);
console.log(`Source:           ${filePath ? `file ${filePath}` : `blob ${blobUrl}`}`);
console.log(`Backup generated: ${doc.generatedAt ?? '(unstated)'}`);
console.log(`Cleanup run id:   ${doc.cleanupRunId ?? '(unstated)'}`);
console.log(`Predicate ver:    ${doc.predicateVersion ?? '(unstated)'}`);
console.log(`Rows in backup:   ${doc.rows.length}`);
console.log(`Generated:        ${new Date().toISOString()}\n`);

const { DynamicsService } = await import('../lib/services/dynamics-service.js');
const { bypassDynamicsRestrictions } = await import('../lib/services/dynamics-context.js');
const reviewerSuggestionAdapter = await import('../lib/dataverse/adapters/reviewer-suggestion.js');

const counts = { created: 0, updated: 0, wouldCreate: 0, wouldUpdate: 0, skippedInvalid: 0, failed: 0 };
const failures = [];

await bypassDynamicsRestrictions('restore-reviewer-suggestion-cleanup-backup', async () => {
  let n = 0;
  for (const row of doc.rows) {
    n += 1;
    const tag = `[${n}/${doc.rows.length}] req=${row.requestNumber ?? row.requestId ?? '?'} rev=${row.reviewerEmail ?? row.potentialReviewerId ?? '?'} (was ${row.originalSuggestionId ?? '?'})`;

    if (!row.potentialReviewerId || !row.requestId) {
      counts.skippedInvalid += 1;
      failures.push(`${tag} — INVALID: missing potentialReviewerId/requestId (cannot upsert without the alt-key)`);
      console.log(`SKIP  ${tag} — missing required potentialReviewerId/requestId`);
      continue;
    }
    if (typeof row.selected !== 'boolean') {
      // `selected` is an engaged-signal. Defaulting it would misclassify a
      // restored unengaged row as engaged — refuse, don't guess.
      counts.skippedInvalid += 1;
      failures.push(`${tag} — INVALID: "selected" missing or non-boolean (got ${JSON.stringify(row.selected)}); refusing to default an engaged-signal field`);
      console.log(`SKIP  ${tag} — "selected" missing/non-boolean; not defaulting (engaged-signal)`);
      continue;
    }

    const upsertArgs = {
      potentialReviewerId: row.potentialReviewerId,
      requestId: row.requestId,
      suggestionLabel: row.suggestionLabel,
      grantCycleCode: row.grantCycleCode,
      programArea: row.programArea,
      relevanceScore: row.relevanceScore,
      matchReason: row.matchReason,
      sources: row.sources,
      selected: row.selected, // guaranteed boolean by the validation gate above; NEVER defaulted
      summaryBlobUrl: row.summaryBlobUrl,
    };

    try {
      if (!COMMIT) {
        // Read-only: determine create-vs-update for an accurate dry-run plan.
        const existing = await reviewerSuggestionAdapter.findByPotentialReviewerAndRequest(
          row.potentialReviewerId,
          row.requestId,
        );
        if (existing) {
          counts.wouldUpdate += 1;
          console.log(`WOULD-UPDATE ${tag} → existing ${existing.wmkf_appreviewersuggestionid}`);
        } else {
          counts.wouldCreate += 1;
          console.log(`WOULD-CREATE ${tag}`);
        }
      } else {
        const { id, created } = await reviewerSuggestionAdapter.upsert(upsertArgs);
        if (created) {
          counts.created += 1;
          console.log(`CREATED ${tag} → ${id}`);
        } else {
          counts.updated += 1;
          console.log(`UPDATED ${tag} → ${id} (already existed; content re-applied)`);
        }
      }
    } catch (e) {
      counts.failed += 1;
      failures.push(`${tag} — ${e.message}`);
      console.log(`FAIL  ${tag} — ${e.message}`);
    }
  }
});

console.log('\n── Summary ──');
if (COMMIT) {
  console.log(`Created:        ${counts.created}`);
  console.log(`Updated:        ${counts.updated}`);
} else {
  console.log(`Would create:   ${counts.wouldCreate}`);
  console.log(`Would update:   ${counts.wouldUpdate}`);
}
console.log(`Skipped invalid:${counts.skippedInvalid}`);
console.log(`Failed:         ${counts.failed}`);

if (failures.length) {
  console.log('\n── Failures / invalid rows ──');
  for (const f of failures) console.log(`  - ${f}`);
}

if (!COMMIT) {
  console.log('\nDry-run only — no rows were written. Re-run with --commit to apply.');
}

// Non-zero exit if anything could not be restored, so automation can gate on it.
process.exit(counts.failed + counts.skippedInvalid > 0 ? 1 : 0);
