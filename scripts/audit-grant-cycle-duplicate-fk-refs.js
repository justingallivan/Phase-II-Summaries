#!/usr/bin/env node
/**
 * W3 preflight follow-up: check whether the 3 duplicate inactive grant_cycles
 * rows (ids 11, 12, 13) are referenced by any FK rows. If anything points at
 * them, renaming `short_code` is still safe (FK is on id, not short_code) but
 * the references are worth surfacing before the collapse.
 *
 * Read-only.
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let [, k, v] = m;
    v = v.trim().replace(/^"(.*)"$/, '$1');
    if (!process.env[k]) process.env[k] = v;
  }
}

const DUPLICATE_IDS = [11, 12, 13];

(async () => {
  const { sql } = await import('@vercel/postgres');

  console.log(`# Duplicate grant_cycles FK reference check`);
  console.log(`Generated: ${new Date().toISOString()}\n`);
  console.log(`Checking FK references to grant_cycles.id IN (${DUPLICATE_IDS.join(', ')}):\n`);

  // proposal_searches.grant_cycle_id → grant_cycles.id (ON DELETE SET NULL)
  const ps = await sql.query(
    `SELECT grant_cycle_id, COUNT(*) AS n FROM proposal_searches WHERE grant_cycle_id = ANY($1) GROUP BY grant_cycle_id ORDER BY grant_cycle_id`,
    [DUPLICATE_IDS],
  );
  console.log(`## proposal_searches.grant_cycle_id`);
  if (ps.rows.length === 0) {
    console.log('NONE — no proposal_searches rows reference any of the duplicate IDs.\n');
  } else {
    for (const r of ps.rows) console.log(`- id=${r.grant_cycle_id}: ${r.n} row(s)`);
    console.log('');
  }

  // reviewer_suggestions.grant_cycle_id → grant_cycles.id (ON DELETE SET NULL)
  const rs = await sql.query(
    `SELECT grant_cycle_id, COUNT(*) AS n FROM reviewer_suggestions WHERE grant_cycle_id = ANY($1) GROUP BY grant_cycle_id ORDER BY grant_cycle_id`,
    [DUPLICATE_IDS],
  );
  console.log(`## reviewer_suggestions.grant_cycle_id`);
  if (rs.rows.length === 0) {
    console.log('NONE — no reviewer_suggestions rows reference any of the duplicate IDs.\n');
  } else {
    for (const r of rs.rows) console.log(`- id=${r.grant_cycle_id}: ${r.n} row(s)`);
    console.log('');
  }

  // Pull the actual duplicate rows for inspection.
  const dupRows = await sql.query(
    `SELECT id, short_code, name, program_name, is_active, review_deadline, review_template_blob_url, additional_attachments, custom_fields, summary_pages, created_at, updated_at
     FROM grant_cycles WHERE id = ANY($1) ORDER BY id`,
    [DUPLICATE_IDS],
  );
  console.log(`## Full duplicate row contents (for inspection)\n`);
  for (const r of dupRows.rows) {
    console.log(`### id=${r.id} (${r.short_code}, is_active=${r.is_active})`);
    for (const [k, v] of Object.entries(r)) {
      if (k === 'id' || k === 'short_code' || k === 'is_active') continue;
      const repr = v === null ? '_null_' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      console.log(`- ${k}: ${repr}`);
    }
    console.log('');
  }

  // Verdict
  const anyRefs = ps.rows.length + rs.rows.length > 0;
  console.log(`## Verdict\n`);
  if (!anyRefs) {
    console.log('**SAFE TO RENAME.** Zero FK rows reference the duplicate inactive ids. The rename is a pure metadata change with no downstream consequences.');
  } else {
    console.log('**FK references present.** Rename is still safe (FK is on id, not short_code), but be aware that downstream rows continue pointing at the renamed cycle. Decide whether to also reassign those FK refs to the active cycle id.');
  }
})().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(2);
});
