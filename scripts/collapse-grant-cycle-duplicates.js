#!/usr/bin/env node
/**
 * W3 preflight: collapse duplicate inactive grant_cycles rows by renaming
 * their `short_code` to `<code>-archived-<id>` so the active row holds the
 * natural code, freeing it for the `wmkf_shortcode` alt-key add.
 *
 * Targets (verified 2026-05-12 by audit-grant-cycle-shortcode-domain.js +
 * audit-grant-cycle-duplicate-fk-refs.js):
 *   - id=11 D26 (is_active=false, 0 FK refs) → D26x11
 *   - id=12 J27 (is_active=false, 0 FK refs) → J27x12
 *   - id=13 D27 (is_active=false, 0 FK refs) → D27x13
 *
 * Rename scheme `<code>x<id>` (6 chars) fits the `varchar(10)` constraint
 * on `grant_cycles.short_code`. The `x` is non-overlapping with the natural
 * `J<YY>` / `D<YY>` cycle-code grammar, so it's unambiguously archived.
 *
 * Runs in a single transaction. Dry-run by default; pass --commit to apply.
 * Re-runnable: skips rows already renamed.
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let [, k, v] = m;
    v = v.trim().replace(/^"(.*)"$/, '$1');
    if (!process.env[k]) process.env[k] = v;
  }
}

const COMMIT = process.argv.includes('--commit');

const RENAMES = [
  { id: 11, expectedCode: 'D26', newCode: 'D26x11' },
  { id: 12, expectedCode: 'J27', newCode: 'J27x12' },
  { id: 13, expectedCode: 'D27', newCode: 'D27x13' },
];

(async () => {
  const { db } = await import('@vercel/postgres');
  const client = await db.connect();

  console.log(`# Grant cycle duplicate collapse`);
  console.log(`Mode: ${COMMIT ? 'COMMIT' : 'DRY-RUN'}`);
  console.log(`Generated: ${new Date().toISOString()}\n`);

  try {
    await client.query('BEGIN');

    for (const { id, expectedCode, newCode } of RENAMES) {
      const cur = await client.query('SELECT id, short_code, is_active FROM grant_cycles WHERE id = $1', [id]);
      if (cur.rows.length === 0) {
        console.log(`- id=${id}: NOT FOUND (skipping)`);
        continue;
      }
      const row = cur.rows[0];
      if (row.short_code === newCode) {
        console.log(`- id=${id}: already renamed to ${newCode} (skipping)`);
        continue;
      }
      if (row.short_code !== expectedCode) {
        throw new Error(`id=${id}: expected short_code=${expectedCode}, found ${row.short_code} — refusing to rename`);
      }
      if (row.is_active !== false) {
        throw new Error(`id=${id}: expected is_active=false, found ${row.is_active} — refusing to rename`);
      }

      await client.query('UPDATE grant_cycles SET short_code = $1, updated_at = NOW() WHERE id = $2', [newCode, id]);
      console.log(`- id=${id}: ${expectedCode} → ${newCode} ✓`);
    }

    // Post-state verification: no Postgres internal duplicates remain.
    const dupCheck = await client.query(`
      SELECT short_code, COUNT(*) AS n FROM grant_cycles GROUP BY short_code HAVING COUNT(*) > 1
    `);
    if (dupCheck.rows.length > 0) {
      throw new Error(`Duplicates still exist after rename: ${JSON.stringify(dupCheck.rows)}`);
    }

    if (COMMIT) {
      await client.query('COMMIT');
      console.log('\nCOMMITTED. No duplicates remain.');
    } else {
      await client.query('ROLLBACK');
      console.log('\nROLLED BACK (dry-run). No duplicates would remain after commit. Re-run with --commit to apply.');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\nFAILED, rolled back:', err.message);
    process.exit(2);
  } finally {
    client.release();
  }
})();
