#!/usr/bin/env node
/**
 * Verify that DatabaseService (and eventually the app-access / settings
 * wrappers) return identical results for the same operations regardless of
 * the WAVE1_BACKEND_* flag.
 *
 * Approach: for each method pair, invoke twice — once with the flag
 * pointed at postgres, once at dataverse. Compare outputs.
 *
 * Prefs are the only table wired in this pass. app-access + settings tests
 * will go here as their wiring lands.
 *
 * Test subject: Justin (pg id=2). Uses test-only keys so nothing mutates
 * real data.
 */

const { loadEnvLocal } = require('../lib/dataverse/client');
loadEnvLocal();

// Must set the flag BEFORE requiring DatabaseService so the lazy loader
// captures the right thing — except actually the dispatch is at call time,
// not require time, so we can flip the env var per test.
const { DatabaseService } = require('../lib/services/database-service');

const JUSTIN = 2;

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  const tag = pass ? '✓ PASS' : '✗ FAIL';
  console.log(`  ${tag}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function withBackend(backend, fn) {
  const prev = process.env.WAVE1_BACKEND_PREFS;
  process.env.WAVE1_BACKEND_PREFS = backend;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.WAVE1_BACKEND_PREFS;
    else process.env.WAVE1_BACKEND_PREFS = prev;
  }
}

async function cleanupBoth() {
  // Clean up test keys on both backends so rerun is safe.
  for (const backend of ['postgres', 'dataverse']) {
    await withBackend(backend, async () => {
      for (const key of ['test.flag.plain', 'test.flag.encrypted', 'test.flag.temp']) {
        await DatabaseService.deleteUserPreference(JUSTIN, key);
      }
    });
  }
}

(async () => {
  console.log('Wave 1 flag-dispatch integration test — prefs only for now\n');
  await cleanupBoth();

  // ── Read parity: listing Justin's prefs via both backends ──
  console.log('━━━ Read parity: DatabaseService.getUserPreferences ━━━');
  const pgPrefs = await withBackend('postgres', () => DatabaseService.getUserPreferences(JUSTIN, true));
  const dvPrefs = await withBackend('dataverse', () => DatabaseService.getUserPreferences(JUSTIN, true));

  const pgKeys = new Set(Object.keys(pgPrefs));
  const dvKeys = new Set(Object.keys(dvPrefs));
  record(
    `key sets match (${pgKeys.size} pg, ${dvKeys.size} dv)`,
    pgKeys.size === dvKeys.size && [...pgKeys].every((k) => dvKeys.has(k)),
    pgKeys.size === dvKeys.size ? null : `pg-only=[${[...pgKeys].filter(k=>!dvKeys.has(k))}] dv-only=[${[...dvKeys].filter(k=>!pgKeys.has(k))}]`,
  );

  let valuesMatch = true;
  for (const k of pgKeys) {
    if (dvPrefs[k] !== pgPrefs[k]) valuesMatch = false;
  }
  record('decrypted values match for every key', valuesMatch);

  // ── Write-then-read through each backend ──
  console.log('\n━━━ Write parity: setUserPreference + read back ━━━');
  for (const backend of ['postgres', 'dataverse']) {
    await withBackend(backend, async () => {
      const ok = await DatabaseService.setUserPreference(JUSTIN, 'test.flag.plain', `hello-${backend}`);
      record(`[${backend}] setUserPreference returns true`, ok === true);
      const v = await DatabaseService.getDecryptedApiKey(JUSTIN, 'test.flag.plain');
      record(`[${backend}] getDecryptedApiKey returns written value`, v === `hello-${backend}`, `got=${v}`);
      const has = await DatabaseService.hasPreference(JUSTIN, 'test.flag.plain');
      record(`[${backend}] hasPreference returns true`, has === true);
    });
  }

  // ── Cross-backend: write via pg, read via dv (should both see the postgres row) ──
  // Note: the row in DV was NOT synced (this is a test-only key). So DV won't see it.
  // This documents the limitation: cross-backend visibility requires the sync script
  // or a dual-write layer. For cutover planning, we do the sync immediately before
  // flipping the flag — no cross-backend period.
  console.log('\n━━━ Cross-backend visibility (documented limitation) ━━━');
  await cleanupBoth();
  await withBackend('postgres', () => DatabaseService.setUserPreference(JUSTIN, 'test.flag.temp', 'pg-only'));
  const seenFromDv = await withBackend('dataverse', () => DatabaseService.getDecryptedApiKey(JUSTIN, 'test.flag.temp'));
  record(
    'write via postgres is NOT visible via dataverse (expected — separate storage)',
    seenFromDv === null,
    `got=${seenFromDv}`,
  );

  // ── Encryption parity: write encrypted via each backend, read back ──
  console.log('\n━━━ Encryption parity ━━━');
  const SECRET = 'sk-flag-test-secret-0987654321';
  for (const backend of ['postgres', 'dataverse']) {
    await withBackend(backend, async () => {
      await DatabaseService.setUserPreference(JUSTIN, 'test.flag.encrypted', SECRET, true);
      const plaintext = await DatabaseService.getDecryptedApiKey(JUSTIN, 'test.flag.encrypted');
      record(`[${backend}] encrypted roundtrip`, plaintext === SECRET, `got=${plaintext}`);
      const masked = (await DatabaseService.getUserPreferences(JUSTIN, false))['test.flag.encrypted'];
      record(`[${backend}] masked read returns mask`, typeof masked === 'string' && masked !== SECRET && /[•*]/.test(masked), `got=${masked}`);
    });
  }

  await cleanupBoth();

  console.log('\n═══ Summary ═══');
  const pass = results.filter((r) => r.pass).length;
  const fail = results.filter((r) => !r.pass).length;
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error(`\nFATAL: ${e.message}`);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
