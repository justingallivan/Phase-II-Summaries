#!/usr/bin/env node
/**
 * W3 step 5 smoke — exercise the grant-cycles-dataverse helper against
 * live prod to verify list + counts + alt-key lookup all work.
 *
 * Read-only. Does NOT call create/update/archive paths.
 */

const { loadEnvLocal } = require('../lib/dataverse/client');
loadEnvLocal();

const {
  listCycles,
  findByShortCode,
  fetchCounts,
} = require('../lib/services/grant-cycles-dataverse');

(async () => {
  console.log('# Grant cycles Dataverse smoke\n');

  console.log('## 1. listCycles({ includeArchived: false })');
  const t1 = Date.now();
  const active = await listCycles({ includeArchived: false });
  console.log(`  ${active.length} rows in ${Date.now() - t1}ms`);
  for (const c of active) {
    console.log(`  - ${c.shortCode || '(no shortcode)'}: ${c.name} (id=${c.id.slice(0, 8)}…) fy=${c.fiscalYearCode || '—'}`);
  }
  console.log('');

  console.log('## 2. listCycles({ includeArchived: true })');
  const t2 = Date.now();
  const all = await listCycles({ includeArchived: true });
  console.log(`  ${all.length} rows in ${Date.now() - t2}ms\n`);

  console.log('## 3. findByShortCode("J26")');
  const t3 = Date.now();
  const j26 = await findByShortCode('J26');
  console.log(`  ${j26 ? `found id=${j26.id.slice(0, 8)}… name=${j26.name}` : 'not found'} in ${Date.now() - t3}ms`);
  console.log('');

  console.log('## 4. findByShortCode("j26") — case-normalization check');
  const t4 = Date.now();
  const j26lower = await findByShortCode('j26');
  console.log(`  ${j26lower ? `found id=${j26lower.id.slice(0, 8)}…` : 'not found'} in ${Date.now() - t4}ms`);
  console.log('');

  console.log('## 5. findByShortCode("ZZZ999") — non-existent');
  const t5 = Date.now();
  const none = await findByShortCode('ZZZ999');
  console.log(`  ${none ? 'UNEXPECTED HIT' : 'correctly null'} in ${Date.now() - t5}ms`);
  console.log('');

  console.log('## 6. fetchCounts()');
  const t6 = Date.now();
  const counts = await fetchCounts();
  console.log(`  fetched in ${Date.now() - t6}ms`);
  console.log(`  proposal counts (top 5 by count):`);
  const propTop = [...counts.proposalCountsByFiscalYear.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  for (const [k, v] of propTop) console.log(`    ${k}: ${v}`);
  console.log(`  candidate counts:`);
  for (const [k, v] of counts.candidateCountsByShortCode.entries()) {
    console.log(`    ${k}: ${v}`);
  }
  console.log(`  unassigned candidate count: ${counts.unassignedCandidateCount}`);
  console.log('');

  // Sanity cross-check against the audit script's findings: J26 should have
  // 334 selected suggestions, D25 should have 2.
  const j26Count = counts.candidateCountsByShortCode.get('J26') || 0;
  const d25Count = counts.candidateCountsByShortCode.get('D25') || 0;
  console.log('## 7. Cross-check against audit baseline');
  console.log(`  J26 candidates: ${j26Count} (audit baseline was 334 total, this filters selected=true so likely smaller)`);
  console.log(`  D25 candidates: ${d25Count} (audit baseline was 2 total)`);
  console.log('');

  console.log('## Verdict\n');
  if (active.length >= 10 && j26 && j26lower && !none && counts.candidateCountsByShortCode.size > 0) {
    console.log('**PASS.** All readers operational; alt-key lookup case-insensitive via normalization.');
  } else {
    console.log('**ISSUES.** Review output above.');
    process.exitCode = 1;
  }
})().catch(err => {
  console.error('FAILED:', err.message);
  console.error(err.stack);
  process.exit(2);
});
