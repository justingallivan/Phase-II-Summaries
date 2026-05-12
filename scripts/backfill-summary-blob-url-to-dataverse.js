#!/usr/bin/env node
/**
 * W5 step 3 prep — backfill `reviewer_suggestions.summary_blob_url` →
 * `wmkf_appreviewersuggestion.wmkf_summarybloburl`.
 *
 * Why: pre-W5, generate-emails.js read summary_blob_url per-candidate from
 * Postgres so multi-proposal email batches attach the correct summary
 * per recipient. After cutover, the field needs to live on the DV
 * suggestion. Schema patch landed via wave2-existing
 * `wmkf_appreviewersuggestion-extensions.json` (added `wmkf_SummaryBlobUrl`,
 * String/500).
 *
 * Identity chain (mirrors reconcile-reviewer-migration.js):
 *   PG row →
 *     researcher.email + reviewer_suggestions.request_number →
 *       DV wmkf_potentialreviewer (by email) +
 *       DV akoya_request (by akoya_requestnum) →
 *         DV wmkf_appreviewersuggestion (by (potentialreviewer, request)) →
 *           PATCH wmkf_summarybloburl
 *
 * Dry-run by default; --commit to write.
 * Idempotent: skips rows where DV already has a non-null wmkf_summarybloburl
 * matching the source value.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

const COMMIT = process.argv.includes('--commit');

const { sql } = await import('@vercel/postgres');
const { DynamicsService } = await import('../lib/services/dynamics-service.js');
const { bypassDynamicsRestrictions } = await import('../lib/services/dynamics-context.js');
const potentialReviewerAdapter = await import('../lib/dataverse/adapters/potential-reviewer.js');
const reviewerSuggestionAdapter = await import('../lib/dataverse/adapters/reviewer-suggestion.js');

console.log('# Summary blob URL PG → DV backfill');
console.log(`Mode: ${COMMIT ? 'COMMIT' : 'DRY-RUN'}`);
console.log(`Generated: ${new Date().toISOString()}\n`);

const pgRows = (await sql`
  SELECT
    rs.id AS pg_id,
    rs.request_number,
    rs.summary_blob_url,
    r.email,
    r.name
  FROM reviewer_suggestions rs
  LEFT JOIN researchers r ON r.id = rs.researcher_id
  WHERE rs.summary_blob_url IS NOT NULL
    AND r.email IS NOT NULL
    AND rs.request_number IS NOT NULL
`).rows;
console.log(`PG rows with summary_blob_url + matchable identity: ${pgRows.length}`);

let nMatched = 0, nMissing = 0, nAlreadySet = 0, nWouldWrite = 0, nWritten = 0, nErrors = 0;

await bypassDynamicsRestrictions('w5-backfill-summary-blob', async () => {
  // Cache request GUID lookups.
  const requestGuidByNum = new Map();
  const distinctReqNums = [...new Set(pgRows.map(r => String(r.request_number)))];
  for (const num of distinctReqNums) {
    const r = await DynamicsService.queryRecords('akoya_requests', {
      select: ['akoya_requestid', 'akoya_requestnum'],
      filter: `akoya_requestnum eq '${num.replace(/'/g, "''")}'`,
      top: 1,
    });
    if (r.records.length > 0) requestGuidByNum.set(num, r.records[0].akoya_requestid);
  }

  for (const pg of pgRows) {
    const tag = `pg=${pg.pg_id} req=${pg.request_number}`;
    const requestId = requestGuidByNum.get(String(pg.request_number));
    if (!requestId) { nMissing++; console.log(`MISSING-REQUEST  ${tag}`); continue; }

    const person = await potentialReviewerAdapter.getByEmail(pg.email);
    if (!person) { nMissing++; console.log(`MISSING-PERSON   ${tag} email=${pg.email}`); continue; }

    const sug = await reviewerSuggestionAdapter.findByPotentialReviewerAndRequest(
      person.wmkf_potentialreviewersid,
      requestId,
    );
    if (!sug) { nMissing++; console.log(`MISSING-SUG      ${tag} email=${pg.email}`); continue; }

    nMatched++;

    if (sug.wmkf_summarybloburl === pg.summary_blob_url) {
      nAlreadySet++;
      continue;
    }
    if (sug.wmkf_summarybloburl && sug.wmkf_summarybloburl !== pg.summary_blob_url) {
      // DV has a different value — surface but don't overwrite without explicit flag
      console.log(`CONFLICT-EXISTS  ${tag}  dv=${(sug.wmkf_summarybloburl || '').slice(0, 60)} pg=${(pg.summary_blob_url || '').slice(0, 60)}`);
      continue;
    }

    if (!COMMIT) {
      nWouldWrite++;
      continue;
    }

    try {
      await DynamicsService.updateRecord(
        'wmkf_appreviewersuggestions',
        sug.wmkf_appreviewersuggestionid,
        { wmkf_summarybloburl: pg.summary_blob_url },
      );
      nWritten++;
    } catch (err) {
      console.error(`ERROR  ${tag}: ${err.message}`);
      nErrors++;
    }
  }
});

console.log(`\n## Summary`);
console.log(`  matched (DV suggestion found): ${nMatched}`);
console.log(`  missing (request/person/sug not in DV): ${nMissing}`);
console.log(`  already-correct in DV: ${nAlreadySet}`);
if (!COMMIT) console.log(`  would-write: ${nWouldWrite}`);
else console.log(`  written: ${nWritten}`);
console.log(`  errors: ${nErrors}`);

if (nErrors > 0) process.exit(1);
if (!COMMIT) console.log('\nDRY-RUN — re-run with --commit to apply.');
