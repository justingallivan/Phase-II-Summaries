/**
 * Assign orphan records with NULL user_profile_id to a specified user profile.
 *
 * Legacy rows in reviewer_suggestions and proposal_searches may have
 * user_profile_id = NULL (created before the user profile system in V10).
 * These rows are invisible to all users since queries filter by profile ID.
 * This script assigns them to a specified profile.
 *
 * Usage:
 *   # Dry run (preview only)
 *   node scripts/assign-orphan-records.js --profile-id 1 --dry-run
 *
 *   # Execute assignment
 *   node scripts/assign-orphan-records.js --profile-id 1
 *
 * Idempotent: re-running finds 0 orphans if already assigned.
 */

const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
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

const { sql } = require('@vercel/postgres');

// Parse args
const args = process.argv.slice(2);
const profileIdIdx = args.indexOf('--profile-id');
const dryRun = args.includes('--dry-run');

if (profileIdIdx === -1 || !args[profileIdIdx + 1]) {
  console.error('Usage: node scripts/assign-orphan-records.js --profile-id <N> [--dry-run]');
  process.exit(1);
}

const targetProfileId = parseInt(args[profileIdIdx + 1], 10);
if (isNaN(targetProfileId) || targetProfileId <= 0) {
  console.error('Error: --profile-id must be a positive integer');
  process.exit(1);
}

async function run() {
  try {
    console.log(`\nTarget profile ID: ${targetProfileId}`);
    console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'EXECUTE'}\n`);

    // Verify target profile exists
    const profileResult = await sql`SELECT id, name, azure_email, is_active FROM user_profiles WHERE id = ${targetProfileId}`;
    if (profileResult.rows.length === 0) {
      console.error(`Error: No user profile found with id = ${targetProfileId}`);
      process.exit(1);
    }
    const profile = profileResult.rows[0];
    console.log(`Target profile: ${profile.name} (${profile.azure_email || 'no email'})${profile.is_active ? '' : ' [INACTIVE]'}`);

    // Count orphan rows
    const [suggestionsCount, searchesCount] = await Promise.all([
      sql`SELECT COUNT(*) as count FROM reviewer_suggestions WHERE user_profile_id IS NULL`,
      sql`SELECT COUNT(*) as count FROM proposal_searches WHERE user_profile_id IS NULL`,
    ]);

    const orphanSuggestions = parseInt(suggestionsCount.rows[0].count, 10);
    const orphanSearches = parseInt(searchesCount.rows[0].count, 10);

    console.log(`\nOrphan rows found:`);
    console.log(`  reviewer_suggestions: ${orphanSuggestions}`);
    console.log(`  proposal_searches:    ${orphanSearches}`);

    if (orphanSuggestions === 0 && orphanSearches === 0) {
      console.log('\nNo orphan records to assign. Database is clean.');
      process.exit(0);
    }

    if (dryRun) {
      console.log('\n[DRY RUN] Would assign the above records. Run without --dry-run to execute.');
      process.exit(0);
    }

    // Execute assignment
    console.log(`\nAssigning orphan records to profile ${targetProfileId}...`);

    if (orphanSuggestions > 0) {
      const result = await sql`UPDATE reviewer_suggestions SET user_profile_id = ${targetProfileId} WHERE user_profile_id IS NULL`;
      console.log(`  reviewer_suggestions: ${result.rowCount} rows updated`);
    }

    if (orphanSearches > 0) {
      const result = await sql`UPDATE proposal_searches SET user_profile_id = ${targetProfileId} WHERE user_profile_id IS NULL`;
      console.log(`  proposal_searches: ${result.rowCount} rows updated`);
    }

    console.log('\nDone. All orphan records have been assigned.');

  } catch (error) {
    console.error('\nError:', error.message);
    process.exit(1);
  }
}

run();
