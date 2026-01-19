/**
 * Import User Profile Assignments for Legacy Data Migration
 *
 * Reads a CSV file with proposal -> user_profile_id mappings and
 * updates the database accordingly.
 *
 * Usage:
 *   node scripts/import-user-assignments.js --file proposals-for-migration.csv
 *   node scripts/import-user-assignments.js --file proposals-for-migration.csv --dry-run
 *
 * CSV format (from export script):
 *   proposal_id,proposal_title,pi_name,institution,grant_cycle,candidate_count,current_user_profile_id,new_user_profile_id
 *
 * The script reads the "new_user_profile_id" column and updates:
 *   - reviewer_suggestions.user_profile_id
 *   - proposal_searches.user_profile_id (matched by proposal_title)
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

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

const { sql } = require('@vercel/postgres');

// Parse command line arguments
const args = process.argv.slice(2);
let inputFile = null;
let dryRun = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file' || args[i] === '-f') {
    inputFile = args[i + 1];
    i++;
  } else if (args[i] === '--dry-run') {
    dryRun = true;
  }
}

if (!inputFile) {
  console.error('Usage: node scripts/import-user-assignments.js --file <csv-file> [--dry-run]');
  console.error('');
  console.error('Options:');
  console.error('  --file, -f    CSV file with proposal -> user_profile_id mappings');
  console.error('  --dry-run     Show what would be updated without making changes');
  process.exit(1);
}

// Parse CSV line (handles quoted fields)
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);

  return result;
}

// Prompt for confirmation
async function confirm(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(`${message} (y/N): `, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function importAssignments() {
  try {
    // Resolve file path
    const filePath = path.isAbsolute(inputFile)
      ? inputFile
      : path.join(__dirname, '..', inputFile);

    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }

    console.log(`Reading ${filePath}...\n`);

    // Read and parse CSV
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      console.error('CSV file is empty or has no data rows.');
      process.exit(1);
    }

    // Parse header
    const headers = parseCSVLine(lines[0]);
    const proposalIdIndex = headers.indexOf('proposal_id');
    const newProfileIdIndex = headers.indexOf('new_user_profile_id');

    if (proposalIdIndex === -1 || newProfileIdIndex === -1) {
      console.error('CSV must have "proposal_id" and "new_user_profile_id" columns.');
      process.exit(1);
    }

    // Parse data rows
    const assignments = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const proposalId = values[proposalIdIndex]?.trim();
      const newProfileId = values[newProfileIdIndex]?.trim();

      if (proposalId && newProfileId) {
        const profileIdNum = parseInt(newProfileId, 10);
        if (!isNaN(profileIdNum) && profileIdNum > 0) {
          assignments.push({
            proposalId,
            profileId: profileIdNum
          });
        }
      }
    }

    if (assignments.length === 0) {
      console.log('No valid assignments found in CSV.');
      console.log('Make sure to fill in the "new_user_profile_id" column with profile IDs.');
      return;
    }

    console.log(`Found ${assignments.length} proposals with user_profile_id assignments.\n`);

    // Verify profile IDs exist
    const profileIds = [...new Set(assignments.map(a => a.profileId))];
    const profiles = await sql`
      SELECT id, name, display_name FROM user_profiles WHERE id = ANY(${profileIds})
    `;

    const validProfileIds = new Set(profiles.rows.map(p => p.id));
    const invalidAssignments = assignments.filter(a => !validProfileIds.has(a.profileId));

    if (invalidAssignments.length > 0) {
      console.error('Invalid profile IDs found:');
      invalidAssignments.forEach(a => {
        console.error(`  Proposal ${a.proposalId}: profile_id ${a.profileId} does not exist`);
      });
      console.error('');
      console.error('Create the profiles first or fix the CSV file.');
      process.exit(1);
    }

    // Show summary
    console.log('Assignment summary:');
    for (const profileId of profileIds) {
      const profile = profiles.rows.find(p => p.id === profileId);
      const count = assignments.filter(a => a.profileId === profileId).length;
      console.log(`  Profile ${profileId} (${profile.display_name || profile.name}): ${count} proposals`);
    }
    console.log('');

    if (dryRun) {
      console.log('DRY RUN - No changes will be made.\n');
      console.log('Changes that would be applied:');
      for (const assignment of assignments) {
        console.log(`  ${assignment.proposalId} -> profile_id ${assignment.profileId}`);
      }
      console.log('');
      console.log('Run without --dry-run to apply these changes.');
      return;
    }

    // Confirm before proceeding
    const confirmed = await confirm(`Update ${assignments.length} proposals with user profile assignments?`);
    if (!confirmed) {
      console.log('Cancelled.');
      return;
    }

    console.log('\nApplying updates...');

    let updatedSuggestions = 0;
    let updatedSearches = 0;

    for (const assignment of assignments) {
      // Update reviewer_suggestions
      const suggestionResult = await sql`
        UPDATE reviewer_suggestions
        SET user_profile_id = ${assignment.profileId}
        WHERE proposal_id = ${assignment.proposalId}
          AND (user_profile_id IS NULL OR user_profile_id != ${assignment.profileId})
      `;
      updatedSuggestions += suggestionResult.rowCount || 0;

      // Update proposal_searches (match by proposal_title from reviewer_suggestions)
      const searchResult = await sql`
        UPDATE proposal_searches ps
        SET user_profile_id = ${assignment.profileId}
        FROM (
          SELECT DISTINCT proposal_title
          FROM reviewer_suggestions
          WHERE proposal_id = ${assignment.proposalId}
        ) rs
        WHERE ps.proposal_title = rs.proposal_title
          AND (ps.user_profile_id IS NULL OR ps.user_profile_id != ${assignment.profileId})
      `;
      updatedSearches += searchResult.rowCount || 0;
    }

    console.log('\nMigration complete!');
    console.log(`  Updated reviewer_suggestions rows: ${updatedSuggestions}`);
    console.log(`  Updated proposal_searches rows: ${updatedSearches}`);

  } catch (error) {
    console.error('Import failed:', error.message);
    process.exit(1);
  }
}

// Run import
importAssignments();
