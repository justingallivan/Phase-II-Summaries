/**
 * Backfill Script: Grant all 13 apps to all existing active users
 *
 * Run this ONCE after deploying the app access control feature to
 * ensure existing users are not locked out.
 *
 * Usage:
 *   node scripts/backfill-app-access.js
 *
 * Prerequisites:
 *   1. V16 migration has been run (user_app_access table exists)
 *   2. .env.local contains valid POSTGRES_URL
 */

const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        let value = valueParts.join('=');
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    }
  });
  console.log('Loaded environment variables from .env.local');
} else {
  console.error('No .env.local file found. Run: vercel env pull .env.local');
  process.exit(1);
}

// ─── Wave 1 dispatch guard ────────────────────────────────────────────────
// As of 2026-04-27 the live read backend for user_app_access is Dataverse
// (WAVE1_BACKEND_APP_ACCESS=dataverse on prod). Backfilling Postgres only
// would not affect what users actually see. If you really mean to backfill
// the Postgres copy (e.g., during Wave 1 retirement work), pass
// --allow-postgres-only explicitly. For Dataverse-side backfill, use the
// dispatch wrapper in lib/services/app-access-service.js.
if (process.env.WAVE1_BACKEND_APP_ACCESS === 'dataverse' && !process.argv.includes('--allow-postgres-only')) {
  console.error('[wave1-guard] WAVE1_BACKEND_APP_ACCESS=dataverse — this script touches Postgres only.');
  console.error('[wave1-guard] To grant apps in the live store, use lib/services/app-access-service.js#grantApps.');
  console.error('[wave1-guard] If you really mean to write to Postgres, pass --allow-postgres-only.');
  process.exit(2);
}

const { sql } = require('@vercel/postgres');

const ALL_APP_KEYS = [
  // 'concept-evaluator' deprecated 2026-04-25 — see /_archived/README.md
  'multi-perspective-evaluator',
  'batch-phase-i-summaries',
  'batch-proposal-summaries',
  'funding-gap-analyzer',
  'phase-i-writeup',
  'phase-ii-writeup',
  'reviewer-finder',
  'peer-review-summarizer',
  'expense-reporter',
  'literature-analyzer',
  'dynamics-explorer',
  'integrity-screener',
];

// Granted by Justin (id=2, superuser)
const GRANTED_BY = 2;

async function backfill() {
  try {
    // Get all active users
    const users = await sql`
      SELECT id, name, azure_email
      FROM user_profiles
      WHERE is_active = true
      ORDER BY id
    `;

    console.log(`Found ${users.rows.length} active user(s).\n`);

    let totalGranted = 0;

    for (const user of users.rows) {
      let granted = 0;
      for (const appKey of ALL_APP_KEYS) {
        try {
          await sql`
            INSERT INTO user_app_access (user_profile_id, app_key, granted_by)
            VALUES (${user.id}, ${appKey}, ${GRANTED_BY})
            ON CONFLICT (user_profile_id, app_key) DO NOTHING
          `;
          granted++;
        } catch (error) {
          console.error(`  Error granting ${appKey} to ${user.name}: ${error.message}`);
        }
      }
      console.log(`  ${user.name}${user.azure_email ? ` (${user.azure_email})` : ''}: ${granted} app(s) granted`);
      totalGranted += granted;
    }

    console.log(`\nBackfill complete. ${totalGranted} total grants inserted.`);
  } catch (error) {
    console.error('Backfill failed:', error.message);
    process.exit(1);
  }
}

backfill();
