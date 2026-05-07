#!/usr/bin/env node
// Audit every reviewer-side Postgres table:
//   - row count
//   - most recent activity (created_at / updated_at if present)
//   - per-column non-null counts (which fields are actually populated)
//   - schema (column names + types)

import { readFileSync } from 'fs';
import { resolve } from 'path';

for (const envFile of ['.env', '.env.local']) {
  try {
    const c = readFileSync(resolve(process.cwd(), envFile), 'utf8');
    for (const line of c.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[k]) process.env[k] = v;
    }
  } catch (e) {}
}

const { sql } = await import('@vercel/postgres');

// 1. List every table in the public schema with its row count.
const allTables = await sql`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY table_name
`;

console.log('=== ALL TABLES IN PUBLIC SCHEMA ===\n');
const counts = {};
for (const { table_name } of allTables.rows) {
  try {
    const r = await sql.query(`SELECT COUNT(*)::int AS c FROM "${table_name}"`);
    counts[table_name] = r.rows[0].c;
    console.log(`  ${table_name.padEnd(35)} ${r.rows[0].c}`);
  } catch (e) {
    console.log(`  ${table_name.padEnd(35)} ERR ${e.message.slice(0, 60)}`);
  }
}

// 2. Reviewer-side tables — deep dive.
const REVIEWER_TABLES = [
  'researchers',
  'researcher_keywords',
  'publications',
  'reviewer_suggestions',
  'proposal_searches',
  'grant_cycles',
  'search_cache',
];

console.log('\n=== REVIEWER-SIDE TABLE DETAIL ===');
for (const table of REVIEWER_TABLES) {
  if (!(table in counts)) {
    console.log(`\n--- ${table}: NOT PRESENT ---`);
    continue;
  }
  console.log(`\n--- ${table} (${counts[table]} rows) ---`);

  // Schema
  const cols = await sql.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
    [table]
  );
  console.log('  columns:');
  for (const r of cols.rows) console.log(`    ${r.column_name.padEnd(35)} ${r.data_type}`);

  if (counts[table] === 0) continue;

  // Recent activity if created_at / updated_at present
  const colNames = cols.rows.map(r => r.column_name);
  if (colNames.includes('created_at')) {
    const r = await sql.query(`SELECT MIN(created_at) AS oldest, MAX(created_at) AS newest FROM "${table}"`);
    console.log(`  created_at:  ${r.rows[0].oldest} → ${r.rows[0].newest}`);
  }
  if (colNames.includes('updated_at') || colNames.includes('last_updated')) {
    const col = colNames.includes('updated_at') ? 'updated_at' : 'last_updated';
    const r = await sql.query(`SELECT MIN(${col}) AS oldest, MAX(${col}) AS newest FROM "${table}"`);
    console.log(`  ${col}:  ${r.rows[0].oldest} → ${r.rows[0].newest}`);
  }

  // Per-column non-null counts (only for "interesting" columns — skip id/created_at/updated_at)
  const skipCols = new Set(['id', 'created_at', 'updated_at', 'last_updated']);
  console.log('  per-column populated count:');
  for (const r of cols.rows) {
    if (skipCols.has(r.column_name)) continue;
    try {
      const q = await sql.query(`SELECT COUNT(*)::int AS c FROM "${table}" WHERE "${r.column_name}" IS NOT NULL`);
      const pct = counts[table] > 0 ? Math.round((q.rows[0].c / counts[table]) * 100) : 0;
      console.log(`    ${r.column_name.padEnd(35)} ${String(q.rows[0].c).padStart(6)} (${pct}%)`);
    } catch (e) {
      console.log(`    ${r.column_name.padEnd(35)} ERR ${e.message.slice(0, 40)}`);
    }
  }
}

// 3. For reviewer_suggestions specifically, break down by cycle code.
console.log('\n=== reviewer_suggestions BY CYCLE PREFIX ===');
try {
  const r = await sql`
    SELECT
      SUBSTRING(proposal_id FROM 1 FOR 3) AS cycle_prefix,
      COUNT(*)::int AS rows,
      COUNT(*) FILTER (WHERE selected)::int AS selected,
      COUNT(*) FILTER (WHERE invited)::int AS invited,
      COUNT(*) FILTER (WHERE response_type = 'accepted')::int AS accepted,
      COUNT(*) FILTER (WHERE response_type = 'declined')::int AS declined,
      MIN(suggested_at) AS oldest,
      MAX(suggested_at) AS newest
    FROM reviewer_suggestions
    GROUP BY SUBSTRING(proposal_id FROM 1 FOR 3)
    ORDER BY MAX(suggested_at) DESC
  `;
  for (const row of r.rows) {
    console.log(`  ${row.cycle_prefix}\t${row.rows} rows | sel=${row.selected} inv=${row.invited} acc=${row.accepted} dec=${row.declined} | ${row.oldest} → ${row.newest}`);
  }
} catch (e) { console.log('  ERR', e.message.slice(0, 100)); }

// 4. researchers — distribution of completeness
console.log('\n=== researchers: completeness signals ===');
try {
  const r = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE email IS NOT NULL)::int AS with_email,
      COUNT(*) FILTER (WHERE orcid IS NOT NULL)::int AS with_orcid,
      COUNT(*) FILTER (WHERE google_scholar_id IS NOT NULL)::int AS with_scholar,
      COUNT(*) FILTER (WHERE h_index IS NOT NULL)::int AS with_hindex
    FROM researchers
  `;
  console.log('  ', JSON.stringify(r.rows[0]));
} catch (e) { console.log('  ERR', e.message.slice(0, 100)); }

// 5. grant_cycles full dump (small enough)
console.log('\n=== grant_cycles: full dump ===');
try {
  const r = await sql`SELECT id, name, short_code, program_name, is_active, review_deadline, created_at FROM grant_cycles ORDER BY id`;
  for (const row of r.rows) {
    console.log(`  ${String(row.id).padStart(3)} ${row.short_code || '?'.padEnd(5)} ${row.is_active ? 'A' : '-'} ${row.review_deadline || '?'} | ${row.name}`);
  }
} catch (e) { console.log('  ERR', e.message.slice(0, 100)); }
