/**
 * Download SUNY Stony Brook Phase I PDF and dump it to /tmp for inspection.
 */
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const t = line.trim(); if (!t || t.startsWith('#')) return;
  const [k, ...v] = t.split('='); if (!k || v.length === 0) return;
  let val = v.join('=');
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
  process.env[k] = val;
});

(async () => {
  const { DynamicsService } = await import('../lib/services/dynamics-service.js');
  const { GraphService } = await import('../lib/services/graph-service.js');
  const { getRequestSharePointBuckets } = await import('../lib/utils/sharepoint-buckets.js');
  DynamicsService.bypassRestrictions('inspect-suny');

  const lookup = await DynamicsService.queryRecords('akoya_requests', {
    select: 'akoya_requestnum,akoya_requestid',
    filter: `akoya_requestnum eq '1001507'`, top: 1,
  });
  const req = lookup.records[0];
  const buckets = await getRequestSharePointBuckets(req.akoya_requestid, '1001507');
  for (const b of buckets) {
    try {
      const files = await GraphService.listFiles(b.library, b.folder, { recursive: true, totalTimeoutMs: 15000 });
      const target = files.find(f => /Research Phase I Application/i.test(f.name));
      if (target) {
        console.log(`Found: ${b.library}/${target.folder || b.folder}/${target.name} (${target.size} bytes)`);
        const dl = await GraphService.downloadFileByPath(b.library, target.folder || b.folder, target.name);
        const out = '/tmp/suny-stonybrook-phase-i.pdf';
        fs.writeFileSync(out, dl.buffer);
        console.log(`Saved: ${out} (${dl.buffer.length} bytes)`);
        return;
      }
    } catch (e) { console.log(`bucket ${b.library} error: ${e.message}`); }
  }
})().catch(e => { console.error(e.message); process.exit(1); });
