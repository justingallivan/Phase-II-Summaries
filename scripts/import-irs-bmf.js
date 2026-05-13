#!/usr/bin/env node
/**
 * Manual / ad-hoc trigger of the IRS BMF refresh.
 *
 * The canonical path is the quarterly cron at /api/cron/refresh-irs-bmf
 * (15th of Jan/Apr/Jul/Oct). This script invokes the same service
 * function for local development and one-off refreshes (e.g., right
 * before opening an unscheduled cycle).
 *
 * Two trigger paths exist intentionally:
 *   - cron handler (canonical, audited via maintenance_runs)
 *   - this script (local dev, ad-hoc, no DB audit row)
 * Both call the same `refresh()` in `lib/services/irs-bmf-service.js`,
 * so behavior matches.
 *
 * Usage:
 *   node scripts/import-irs-bmf.js              # dry-run (downloads + counts, no swap)
 *   node scripts/import-irs-bmf.js --commit     # real run (atomic swap to live)
 *
 * Requires POSTGRES_URL in env (.env.local).
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

const { refresh } = await import('../lib/services/irs-bmf-service.js');

console.log('# IRS BMF refresh');
console.log(`Mode: ${COMMIT ? 'COMMIT (atomic swap to live)' : 'DRY-RUN (download + stage only)'}`);
console.log(`Generated: ${new Date().toISOString()}\n`);

try {
  const stats = await refresh({ dryRun: !COMMIT });
  console.log('\n## Results');
  for (const [region, info] of Object.entries(stats.perRegion)) {
    console.log(`  region ${region}: ${info.rows.toLocaleString()} rows (${(info.csvSizeBytes / 1024 / 1024).toFixed(1)} MB downloaded)`);
  }
  console.log(`  total rows: ${stats.totalRows.toLocaleString()}`);
  if (stats.swappedAt) {
    console.log(`  swapped to live at: ${stats.swappedAt}`);
  } else if (COMMIT) {
    console.log('  (no swap — check service log for skip reason)');
  } else {
    console.log('  (dry-run — no swap)');
  }
  console.log(`  completed at: ${stats.completedAt}`);
  if (!COMMIT) console.log('\nDRY-RUN — re-run with --commit to apply.');
} catch (err) {
  console.error('\nERROR:', err.message);
  process.exit(1);
}
