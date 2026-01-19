/**
 * Export Proposals for User Profile Migration
 *
 * Generates a CSV file listing all proposals with their candidates,
 * allowing manual assignment of user_profile_id values for migration.
 *
 * Usage:
 *   node scripts/export-proposals-for-migration.js
 *   node scripts/export-proposals-for-migration.js --output proposals.csv
 *
 * Output: CSV with columns:
 *   - proposal_id
 *   - proposal_title
 *   - pi_name (from proposal_authors)
 *   - grant_cycle
 *   - candidate_count
 *   - user_profile_id (empty - to be filled in manually)
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

const { sql } = require('@vercel/postgres');

// Parse command line arguments
const args = process.argv.slice(2);
let outputFile = 'proposals-for-migration.csv';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output' || args[i] === '-o') {
    outputFile = args[i + 1] || outputFile;
    i++;
  }
}

async function exportProposals() {
  try {
    console.log('Fetching proposals from database...\n');

    // Get all unique proposals with their candidate counts
    const result = await sql`
      SELECT
        rs.proposal_id,
        rs.proposal_title,
        rs.proposal_authors,
        rs.proposal_institution,
        gc.name as grant_cycle_name,
        COUNT(DISTINCT rs.researcher_id) as candidate_count,
        MAX(rs.user_profile_id) as current_user_profile_id
      FROM reviewer_suggestions rs
      LEFT JOIN grant_cycles gc ON rs.grant_cycle_id = gc.id
      WHERE rs.selected = true
      GROUP BY rs.proposal_id, rs.proposal_title, rs.proposal_authors, rs.proposal_institution, gc.name
      ORDER BY rs.proposal_title
    `;

    if (result.rows.length === 0) {
      console.log('No proposals found in the database.');
      return;
    }

    console.log(`Found ${result.rows.length} proposals to export.\n`);

    // List available user profiles
    const profiles = await sql`
      SELECT id, name, display_name FROM user_profiles WHERE is_active = true ORDER BY id
    `;

    if (profiles.rows.length > 0) {
      console.log('Available User Profiles:');
      profiles.rows.forEach(p => {
        console.log(`  ${p.id}: ${p.display_name || p.name}`);
      });
      console.log('');
    } else {
      console.log('No user profiles found. Create profiles first via the web interface.\n');
    }

    // Build CSV content
    const headers = ['proposal_id', 'proposal_title', 'pi_name', 'institution', 'grant_cycle', 'candidate_count', 'current_user_profile_id', 'new_user_profile_id'];
    const rows = result.rows.map(row => {
      // Extract PI name from proposal_authors (usually first author)
      let piName = row.proposal_authors || '';
      if (piName.includes(',')) {
        piName = piName.split(',')[0].trim();
      }

      return [
        escapeCSV(row.proposal_id),
        escapeCSV(row.proposal_title || 'Untitled'),
        escapeCSV(piName),
        escapeCSV(row.proposal_institution || ''),
        escapeCSV(row.grant_cycle_name || 'Unassigned'),
        row.candidate_count,
        row.current_user_profile_id || '',
        '' // new_user_profile_id - to be filled in manually
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Write to file
    const outputPath = path.join(__dirname, '..', outputFile);
    fs.writeFileSync(outputPath, csvContent, 'utf8');

    console.log(`Export complete!`);
    console.log(`Output file: ${outputPath}`);
    console.log(`\nNext steps:`);
    console.log(`1. Open ${outputFile} in a spreadsheet application`);
    console.log(`2. Fill in the "new_user_profile_id" column with profile IDs (see list above)`);
    console.log(`3. Save the file`);
    console.log(`4. Run: node scripts/import-user-assignments.js --file ${outputFile}`);

  } catch (error) {
    console.error('Export failed:', error.message);
    process.exit(1);
  }
}

// Escape a value for CSV
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Run export
exportProposals();
