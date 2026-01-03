/**
 * Clear All Database Tables
 *
 * Removes ALL data from the database for a fresh start.
 * Run: node scripts/clear-all-database.js
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

async function clearAll() {
  console.log('=== Clear All Database Tables ===\n');

  // Get counts before
  const researchers = await sql`SELECT COUNT(*) as count FROM researchers`;
  const suggestions = await sql`SELECT COUNT(*) as count FROM reviewer_suggestions`;
  const keywords = await sql`SELECT COUNT(*) as count FROM researcher_keywords`;
  const publications = await sql`SELECT COUNT(*) as count FROM publications`;
  const cache = await sql`SELECT COUNT(*) as count FROM search_cache`;

  console.log('Before:');
  console.log(`  Researchers: ${researchers.rows[0].count}`);
  console.log(`  Reviewer suggestions: ${suggestions.rows[0].count}`);
  console.log(`  Keywords: ${keywords.rows[0].count}`);
  console.log(`  Publications: ${publications.rows[0].count}`);
  console.log(`  Cache entries: ${cache.rows[0].count}`);

  // Delete all data
  console.log('\nDeleting all data...');
  await sql`DELETE FROM reviewer_suggestions`;
  await sql`DELETE FROM researcher_keywords`;
  await sql`DELETE FROM publications`;
  await sql`DELETE FROM researchers`;
  await sql`DELETE FROM search_cache`;
  await sql`DELETE FROM proposal_searches`;

  console.log('\n✓ All tables cleared');

  // Verify
  const after = await sql`SELECT COUNT(*) as count FROM researchers`;
  console.log(`\nAfter: ${after.rows[0].count} researchers`);
  console.log('\n=== Database Reset Complete ===');
}

clearAll().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
