#!/usr/bin/env node
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

const tables = ['researchers', 'publications', 'researcher_keywords', 'reviewer_suggestions', 'proposal_searches', 'grant_cycles'];
for (const t of tables) {
  try {
    const r = await sql.query(`SELECT COUNT(*)::int AS c FROM ${t}`);
    console.log(t.padEnd(25), r.rows[0].c);
  } catch (e) { console.log(t.padEnd(25), 'ERR', e.message.slice(0, 80)); }
}

try {
  const r = await sql`SELECT
    COUNT(*) FILTER (WHERE year >= 2024)::int AS recent_2024_plus,
    COUNT(*) FILTER (WHERE year BETWEEN 2020 AND 2023)::int AS midrange_2020_2023,
    COUNT(*) FILTER (WHERE year < 2020)::int AS old_pre_2020,
    COUNT(*) FILTER (WHERE year IS NULL)::int AS no_year
    FROM publications`;
  console.log('\npublication age:', r.rows[0]);
} catch (e) { console.log('age dist ERR', e.message.slice(0, 80)); }

try {
  const r = await sql`SELECT
    COUNT(*)::int AS researchers_with_pubs,
    AVG(pub_count)::float AS avg_pubs_per_researcher,
    MAX(pub_count)::int AS max_pubs
    FROM (SELECT researcher_id, COUNT(*) AS pub_count FROM publications GROUP BY researcher_id) sub`;
  console.log('per-researcher:', r.rows[0]);
} catch (e) { console.log('per-researcher ERR', e.message.slice(0, 80)); }
