#!/usr/bin/env node
// Investigate PG=16 DV=15 discrepancy on req 1002285.
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let [, k, v] = m;
  v = v.trim().replace(/^"(.*)"$/, '$1');
  if (!process.env[k]) process.env[k] = v;
}

const { sql } = await import('@vercel/postgres');
const { DynamicsService } = await import('../lib/services/dynamics-service.js');
const { bypassDynamicsRestrictions } = await import('../lib/services/dynamics-context.js');

const pg = (await sql`
  SELECT rs.id AS pg_id, r.email
  FROM reviewer_suggestions rs JOIN researchers r ON r.id = rs.researcher_id
  WHERE rs.request_number = '1002285' AND rs.selected = true AND r.email IS NOT NULL
  ORDER BY r.email
`).rows;

await bypassDynamicsRestrictions('probe', async () => {
  const reqs = await DynamicsService.queryRecords('akoya_requests', {
    select: ['akoya_requestid'],
    filter: "akoya_requestnum eq '1002285'",
    top: 1,
  });
  const requestId = reqs.records[0].akoya_requestid;

  const dvSugs = await DynamicsService.queryRecords('wmkf_appreviewersuggestions', {
    select: 'wmkf_appreviewersuggestionid,_wmkf_potentialreviewer_value,wmkf_selected',
    filter: `_wmkf_request_value eq ${requestId} and wmkf_selected eq true`,
    top: 50,
  });

  console.log(`PG rows: ${pg.length}`);
  console.log(`DV selected suggestions: ${dvSugs.records.length}`);

  // Get DV person ids and look up emails
  const dvPersonIds = new Set(dvSugs.records.map(s => s._wmkf_potentialreviewer_value));
  console.log(`DV person ids: ${dvPersonIds.size}`);

  const dvPersons = await DynamicsService.queryRecords('wmkf_potentialreviewerses', {
    select: 'wmkf_potentialreviewersid,wmkf_emailaddress',
    filter: [...dvPersonIds].map(id => `wmkf_potentialreviewersid eq ${id}`).join(' or '),
    top: 50,
  });
  const dvEmailByPersonId = new Map(dvPersons.records.map(p => [p.wmkf_potentialreviewersid, p.wmkf_emailaddress]));
  const dvEmails = new Set(dvPersons.records.map(p => (p.wmkf_emailaddress || '').toLowerCase()));

  const pgEmails = new Set(pg.map(r => r.email.toLowerCase()));

  console.log(`\nPG emails (${pgEmails.size}):`);
  for (const e of [...pgEmails].sort()) console.log(`  ${e} ${dvEmails.has(e) ? '✓' : '✗ NOT IN DV'}`);

  console.log(`\nDV emails (${dvEmails.size}):`);
  for (const e of [...dvEmails].sort()) console.log(`  ${e} ${pgEmails.has(e) ? '✓' : '✗ NOT IN PG'}`);
});
