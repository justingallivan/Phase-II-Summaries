/**
 * Database Cleanup Script
 *
 * Removes researchers that don't have both email AND website.
 * Also removes their associated reviewer_suggestions, publications, and keywords (CASCADE).
 *
 * Run: node scripts/cleanup-database.js
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
  console.log('Loaded environment variables from .env.local\n');
} else {
  console.error('No .env.local file found. Run: vercel env pull .env.local');
  process.exit(1);
}

const { sql } = require('@vercel/postgres');

async function cleanup() {
  try {
    console.log('=== Database Cleanup ===\n');

    // Get current stats
    const totalResult = await sql`SELECT COUNT(*) as count FROM researchers`;
    const withBothResult = await sql`
      SELECT COUNT(*) as count FROM researchers
      WHERE email IS NOT NULL AND email != ''
        AND (website IS NOT NULL AND website != '' OR faculty_page_url IS NOT NULL AND faculty_page_url != '')
    `;
    const withEmailOnlyResult = await sql`
      SELECT COUNT(*) as count FROM researchers
      WHERE email IS NOT NULL AND email != ''
        AND (website IS NULL OR website = '')
        AND (faculty_page_url IS NULL OR faculty_page_url = '')
    `;
    const withWebsiteOnlyResult = await sql`
      SELECT COUNT(*) as count FROM researchers
      WHERE (email IS NULL OR email = '')
        AND (website IS NOT NULL AND website != '' OR faculty_page_url IS NOT NULL AND faculty_page_url != '')
    `;
    const withNeitherResult = await sql`
      SELECT COUNT(*) as count FROM researchers
      WHERE (email IS NULL OR email = '')
        AND (website IS NULL OR website = '')
        AND (faculty_page_url IS NULL OR faculty_page_url = '')
    `;

    const total = parseInt(totalResult.rows[0].count);
    const withBoth = parseInt(withBothResult.rows[0].count);
    const withEmailOnly = parseInt(withEmailOnlyResult.rows[0].count);
    const withWebsiteOnly = parseInt(withWebsiteOnlyResult.rows[0].count);
    const withNeither = parseInt(withNeitherResult.rows[0].count);
    const toDelete = total - withBoth;

    console.log('Current database state:');
    console.log(`  Total researchers: ${total}`);
    console.log(`  With both email AND website: ${withBoth} (will keep)`);
    console.log(`  With email only: ${withEmailOnly} (will delete)`);
    console.log(`  With website only: ${withWebsiteOnly} (will delete)`);
    console.log(`  With neither: ${withNeither} (will delete)`);
    console.log(`\n  Total to delete: ${toDelete}`);

    if (toDelete === 0) {
      console.log('\nNo researchers to delete. Database is already clean.');
      return;
    }

    // Prompt for confirmation
    console.log('\nThis will also delete associated:');
    console.log('  - Reviewer suggestions (proposal links)');
    console.log('  - Publications');
    console.log('  - Keywords');

    // Check for associated data
    const suggestionsResult = await sql`
      SELECT COUNT(*) as count FROM reviewer_suggestions rs
      JOIN researchers r ON rs.researcher_id = r.id
      WHERE (r.email IS NULL OR r.email = '')
         OR ((r.website IS NULL OR r.website = '') AND (r.faculty_page_url IS NULL OR r.faculty_page_url = ''))
    `;
    console.log(`  - ${suggestionsResult.rows[0].count} reviewer suggestions will be deleted`);

    // Perform deletion
    console.log('\nDeleting researchers without both email and website...');

    const deleteResult = await sql`
      DELETE FROM researchers
      WHERE (email IS NULL OR email = '')
         OR ((website IS NULL OR website = '') AND (faculty_page_url IS NULL OR faculty_page_url = ''))
    `;

    console.log(`\n✓ Deleted ${deleteResult.rowCount} researchers`);

    // Verify final state
    const finalResult = await sql`SELECT COUNT(*) as count FROM researchers`;
    console.log(`\nFinal database state:`);
    console.log(`  Remaining researchers: ${finalResult.rows[0].count}`);

    // Also clear the search cache to start fresh
    console.log('\nClearing search cache...');
    const cacheResult = await sql`DELETE FROM search_cache`;
    console.log(`✓ Cleared ${cacheResult.rowCount} cached searches`);

    console.log('\n=== Cleanup Complete ===');

  } catch (error) {
    console.error('Cleanup failed:', error.message);
    process.exit(1);
  }
}

cleanup();
