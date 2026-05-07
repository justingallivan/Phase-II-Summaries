#!/usr/bin/env node
/**
 * Smoke test for /api/reviewer-finder/contact-history.
 *
 * Calls the handler directly with mock req/res. Bypasses auth via env override
 * (AUTH_REQUIRED=false in .env.local handles this for dev).
 *
 * Usage:
 *   node scripts/smoke-contact-history.js                              # default contact
 *   node scripts/smoke-contact-history.js --contactId <guid>
 */

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
  } catch {}
}
process.env.AUTH_REQUIRED = 'false';

const args = process.argv.slice(2);
const contactId = (() => {
  const i = args.indexOf('--contactId');
  return i >= 0 ? args[i + 1] : '871ae0e9-89f6-ee11-a1fd-000d3a3621c7';
})();

const handlerMod = await import('../pages/api/reviewer-finder/contact-history.js');
const handler = handlerMod.default;

const req = {
  method: 'GET',
  query: { contactId },
  headers: { host: 'localhost:3000' },
  // requireAppAccess inspects req.headers + cookies for a session; with
  // AUTH_REQUIRED=false the auth helper short-circuits to a synthetic profile.
  // If it doesn't, fall back to a profile-shaped object the handler tolerates.
};
const res = {
  _status: 200,
  _body: null,
  status(code) { this._status = code; return this; },
  json(body) { this._body = body; return this; },
  setHeader() {},
  end() {},
};

try {
  await handler(req, res);
} catch (err) {
  console.error('Handler threw:', err);
  process.exit(1);
}

console.log(`HTTP ${res._status}`);
if (res._status !== 200) {
  console.log(JSON.stringify(res._body, null, 2));
  process.exit(2);
}

const body = res._body;
console.log(`contactId:  ${body.contactId}`);
console.log(`counts:     pi=${body.counts.pi}  copi=${body.counts.copi}  total=${body.counts.total}`);
console.log(`\nFirst 8 rows:`);
for (const r of body.rows.slice(0, 8)) {
  console.log(`  ${r.requestNumber}  ${r.role.padEnd(4)} pos=${r.position}  ${r.cycleCode || '-'}  ${(r.title || '').slice(0, 50)}  sources=[${r.sources.join(',')}]`);
}
if (body.rows.length === 0) {
  console.log('  (no rows)');
}

// Sanity assertions: every row should have at least one source; pi rows that
// were populated by both junction AND projectleader should show both sources.
const noSource = body.rows.filter(r => !r.sources || r.sources.length === 0);
if (noSource.length > 0) {
  console.error(`\n✗ ${noSource.length} rows have empty sources — bug`);
  process.exit(3);
}
const dualSourcePiRows = body.rows.filter(r => r.role === 'pi' && r.sources.length === 2);
console.log(`\nPI rows present in BOTH junction + projectleader: ${dualSourcePiRows.length} / ${body.counts.pi}`);
if (body.counts.pi > 0 && dualSourcePiRows.length === 0) {
  console.warn('⚠ All PI rows are single-source — expected dual-source after backfill ran');
}
console.log('\n✓ smoke OK');
