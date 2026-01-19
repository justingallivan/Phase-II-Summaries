/**
 * Cleanup Duplicate Grant Cycles
 *
 * This script removes duplicate grant cycles from the database,
 * keeping the oldest entry for each shortCode and reassigning
 * any proposals from deleted cycles to the kept cycle.
 *
 * Usage: node scripts/cleanup-duplicate-cycles.js
 */

const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').replace(/^["']|["']$/g, '');
      process.env[key.trim()] = value.trim();
    }
  });
}

const { sql } = require('@vercel/postgres');

async function cleanupDuplicateCycles() {
  console.log('Checking for duplicate grant cycles...\n');

  try {
    // Find all shortCodes that have duplicates
    const duplicatesResult = await sql`
      SELECT short_code, COUNT(*) as count, array_agg(id ORDER BY created_at ASC) as ids
      FROM grant_cycles
      WHERE short_code IS NOT NULL AND is_active = true
      GROUP BY short_code
      HAVING COUNT(*) > 1
    `;

    if (duplicatesResult.rows.length === 0) {
      console.log('No duplicate cycles found. Database is clean.');
      return;
    }

    console.log(`Found ${duplicatesResult.rows.length} shortCode(s) with duplicates:\n`);

    for (const row of duplicatesResult.rows) {
      const shortCode = row.short_code;
      const ids = row.ids;
      const keepId = ids[0]; // Keep the first (oldest) one
      const deleteIds = ids.slice(1); // Delete the rest

      console.log(`  ${shortCode}: ${row.count} entries (IDs: ${ids.join(', ')})`);
      console.log(`    Keeping ID: ${keepId}`);
      console.log(`    Deleting IDs: ${deleteIds.join(', ')}`);

      // Reassign any proposals from duplicate cycles to the kept cycle
      for (const deleteId of deleteIds) {
        const reassignResult = await sql`
          UPDATE reviewer_suggestions
          SET grant_cycle_id = ${keepId}
          WHERE grant_cycle_id = ${deleteId}
        `;

        if (reassignResult.rowCount > 0) {
          console.log(`    Reassigned ${reassignResult.rowCount} proposals from cycle ${deleteId} to ${keepId}`);
        }
      }

      // Soft delete the duplicate cycles (set is_active = false)
      const deleteResult = await sql`
        UPDATE grant_cycles
        SET is_active = false, updated_at = NOW()
        WHERE id = ANY(${deleteIds})
      `;

      console.log(`    Deactivated ${deleteResult.rowCount} duplicate cycle(s)\n`);
    }

    console.log('Cleanup complete!');

    // Show remaining active cycles
    const remainingResult = await sql`
      SELECT id, short_code, name, is_active
      FROM grant_cycles
      WHERE is_active = true
      ORDER BY short_code
    `;

    console.log('\nActive cycles after cleanup:');
    for (const row of remainingResult.rows) {
      console.log(`  ${row.short_code}: ${row.name} (ID: ${row.id})`);
    }

  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

cleanupDuplicateCycles();
