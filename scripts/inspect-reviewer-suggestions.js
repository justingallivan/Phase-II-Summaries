#!/usr/bin/env node
/**
 * Quick inspector for the Postgres reviewer_suggestions corpus we're about
 * to backfill. Counts total rows, breaks down by request_number presence,
 * grant_cycle, and lifecycle state.
 *
 * Usage: node scripts/inspect-reviewer-suggestions.js
 */

require('./../lib/dataverse/client').loadEnvLocal();

const { sql } = require('@vercel/postgres');

(async () => {
  const total = await sql`SELECT COUNT(*)::int AS n FROM reviewer_suggestions`;
  console.log(`Total rows: ${total.rows[0].n}`);

  const withReq = await sql`
    SELECT
      COUNT(*) FILTER (WHERE request_number IS NOT NULL AND request_number <> '')::int AS with_req,
      COUNT(*) FILTER (WHERE request_number IS NULL OR request_number = '')::int AS without_req
    FROM reviewer_suggestions
  `;
  console.log(`  with request_number:    ${withReq.rows[0].with_req}`);
  console.log(`  without request_number: ${withReq.rows[0].without_req}`);

  const cycles = await sql`
    SELECT gc.short_code, gc.id, COUNT(rs.*)::int AS n
    FROM reviewer_suggestions rs
    LEFT JOIN grant_cycles gc ON gc.id = rs.grant_cycle_id
    GROUP BY gc.short_code, gc.id
    ORDER BY n DESC
  `;
  console.log('\nBy grant cycle:');
  for (const r of cycles.rows) {
    console.log(`  ${r.short_code || '(no cycle)'} (id=${r.id ?? '-'}): ${r.n}`);
  }

  const lifecycle = await sql`
    SELECT
      COUNT(*) FILTER (WHERE selected = true)::int AS selected,
      COUNT(*) FILTER (WHERE invited = true)::int AS invited,
      COUNT(*) FILTER (WHERE accepted = true)::int AS accepted,
      COUNT(*) FILTER (WHERE declined = true)::int AS declined,
      COUNT(*) FILTER (WHERE materials_sent_at IS NOT NULL)::int AS materials_sent,
      COUNT(*) FILTER (WHERE review_received_at IS NOT NULL)::int AS review_received,
      COUNT(*) FILTER (WHERE thankyou_sent_at IS NOT NULL)::int AS thankyou_sent,
      COUNT(*) FILTER (WHERE review_blob_url IS NOT NULL)::int AS has_blob
    FROM reviewer_suggestions
  `;
  console.log('\nLifecycle state:');
  for (const [k, v] of Object.entries(lifecycle.rows[0])) {
    console.log(`  ${k}: ${v}`);
  }

  // Sample 3 rows with full lifecycle, 3 without request_number
  console.log('\nSample (with request_number):');
  const sample = await sql`
    SELECT rs.id, rs.proposal_id, rs.proposal_title, rs.request_number,
           rs.grant_cycle_id, rs.selected, rs.invited, rs.accepted, rs.declined,
           rs.review_status, rs.review_received_at, rs.materials_sent_at,
           rs.proposal_url, rs.proposal_password, rs.review_blob_url,
           r.name AS researcher_name, r.email AS researcher_email
    FROM reviewer_suggestions rs
    JOIN researchers r ON r.id = rs.researcher_id
    WHERE rs.request_number IS NOT NULL
    ORDER BY rs.id DESC
    LIMIT 3
  `;
  for (const row of sample.rows) {
    console.log('  ', JSON.stringify({
      id: row.id, req: row.request_number, title: (row.proposal_title || '').slice(0, 60),
      cycle: row.grant_cycle_id, status: row.review_status,
      flags: { sel: row.selected, inv: row.invited, acc: row.accepted, dec: row.declined },
      sent: !!row.materials_sent_at, received: !!row.review_received_at,
      researcher: row.researcher_name, email: row.researcher_email,
    }));
  }

  console.log('\nSample (no request_number):');
  const noReq = await sql`
    SELECT rs.id, rs.proposal_id, rs.proposal_title, rs.grant_cycle_id, rs.selected,
           r.name AS researcher_name
    FROM reviewer_suggestions rs
    JOIN researchers r ON r.id = rs.researcher_id
    WHERE rs.request_number IS NULL OR rs.request_number = ''
    ORDER BY rs.id DESC
    LIMIT 3
  `;
  for (const row of noReq.rows) {
    console.log('  ', JSON.stringify({
      id: row.id, proposalId: row.proposal_id,
      title: (row.proposal_title || '').slice(0, 60),
      cycle: row.grant_cycle_id, researcher: row.researcher_name,
    }));
  }

  process.exit(0);
})().catch((e) => {
  console.error('Inspect failed:', e.message);
  process.exit(1);
});
