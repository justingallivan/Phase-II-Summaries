/**
 * Probe what `pages/api/external/review/[token]/context.js` would surface
 * for a given suggestionId. Walks the same SharePoint buckets, prints
 * per-bucket success/error/file count, and shows what gets excluded by
 * the Reviews/ filter. Use when the public landing page reports
 * "no materials" against a proposal you know has files.
 *
 * Usage: node scripts/probe-external-files.js <suggestionId>
 *
 * Loads .env.local manually (this script is run outside Next), then calls
 * the same DynamicsService + GraphService + bucket helper used by the
 * endpoint. No writes.
 */

import fs from 'fs';
import path from 'path';

// ── tiny .env.local loader (matches existing scripts' pattern) ─────────
function loadDotEnv() {
  const file = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '').trim();
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}
loadDotEnv();

const { DynamicsService } = await import('../lib/services/dynamics-service.js');
const { GraphService } = await import('../lib/services/graph-service.js');
const { getRequestSharePointBuckets } = await import('../lib/utils/sharepoint-buckets.js');
const { bypassDynamicsRestrictions } = await import('../lib/services/dynamics-context.js');

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node scripts/probe-external-files.js <requestNumber>');
  console.error('  e.g. node scripts/probe-external-files.js 1001289');
  process.exit(1);
}

console.log(`\n→ Looking up request ${arg}\n`);

await bypassDynamicsRestrictions('probe-external-files', async () => {

const { records } = await DynamicsService.queryRecords('akoya_requests', {
  select: 'akoya_requestid,akoya_requestnum,akoya_title',
  filter: `akoya_requestnum eq '${arg}'`,
  top: 1,
});

const req = records[0];
if (!req) {
  console.error(`No akoya_request found with requestnum '${arg}'.`);
  process.exit(2);
}

console.log(`Request:  ${req.akoya_title}`);
console.log(`Number:   ${req.akoya_requestnum}`);
console.log(`Id:       ${req.akoya_requestid}\n`);

const buckets = await getRequestSharePointBuckets(req.akoya_requestid, req.akoya_requestnum);
console.log(`Discovered ${buckets.length} candidate bucket(s):\n`);
for (const b of buckets) {
  console.log(`  [${b.source}] ${b.library} :: ${b.folder}`);
}
console.log();

let totalIncluded = 0;
let totalExcluded = 0;
for (const bucket of buckets) {
  process.stdout.write(`→ ${bucket.library}/${bucket.folder} `);
  try {
    const items = await GraphService.listFiles(bucket.library, bucket.folder, {
      recursive: true,
      maxDepth: 3,
    });
    console.log(`(${items.length} files)`);
    for (const f of items) {
      const inReviews = /(^|\/)Reviews(\/|$)/i.test(f.folder || '');
      if (inReviews) totalExcluded++; else totalIncluded++;
      const tag = inReviews ? 'EXCLUDED' : 'included';
      console.log(`    [${tag}] ${f.folder}/${f.name}  (${f.size} B)`);
    }
  } catch (e) {
    console.log(`ERR: ${e.message}`);
  }
}

console.log(`\nResult: ${totalIncluded} included / ${totalExcluded} excluded by Reviews/ filter\n`);

}); // bypassDynamicsRestrictions
