/**
 * Cleanup: drop concept-evaluator rows from user_app_access.
 *
 * Concept Evaluator was deprecated in Session 110 (2026-04-25) — page + API
 * + prompt moved to /_archived. Existing user_app_access grants for
 * 'concept-evaluator' are harmless (the app no longer exists), but they
 * pollute admin views. This script removes them.
 *
 * Usage:
 *   node scripts/cleanup-concept-evaluator-grants.js --dry-run
 *   node scripts/cleanup-concept-evaluator-grants.js --execute
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').replace(/^["']|["']$/g, '');
      process.env[key.trim()] = value.trim();
    }
  });
}

const { sql } = require('@vercel/postgres');

const DRY = process.argv.includes('--dry-run');
const EXECUTE = process.argv.includes('--execute');

if (!DRY && !EXECUTE) {
  console.error('Pass --dry-run or --execute. Refusing to run without an explicit mode.');
  process.exit(2);
}

const APP_KEY = 'concept-evaluator';

(async () => {
  try {
    const before = await sql`
      SELECT user_app_access.user_profile_id, user_profiles.name
      FROM user_app_access
      LEFT JOIN user_profiles ON user_profiles.id = user_app_access.user_profile_id
      WHERE user_app_access.app_key = ${APP_KEY}
      ORDER BY user_app_access.user_profile_id
    `;

    console.log(`Rows for app_key='${APP_KEY}': ${before.rowCount}`);
    for (const r of before.rows) {
      console.log(`  user_profile_id=${r.user_profile_id} (${r.name || '<unknown>'})`);
    }

    if (before.rowCount === 0) {
      console.log('Nothing to clean up. Exiting.');
      return;
    }

    if (DRY) {
      console.log(`\n--- DRY RUN ---`);
      console.log(`Would DELETE ${before.rowCount} row(s) from user_app_access where app_key='${APP_KEY}'.`);
      return;
    }

    const result = await sql`DELETE FROM user_app_access WHERE app_key = ${APP_KEY}`;
    console.log(`\n✓ Deleted ${result.rowCount} row(s).`);

    const after = await sql`SELECT COUNT(*)::int AS n FROM user_app_access WHERE app_key = ${APP_KEY}`;
    if (after.rows[0].n !== 0) {
      console.error(`✗ Verification failed: ${after.rows[0].n} row(s) still present.`);
      process.exit(1);
    }
    console.log('✓ Verified: 0 rows remain.');
  } catch (err) {
    console.error('✗ Error:', err.message);
    process.exit(1);
  }
})();
