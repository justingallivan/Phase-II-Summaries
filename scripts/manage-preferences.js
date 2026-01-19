/**
 * Manage user preferences - view and delete
 *
 * Usage:
 *   node scripts/manage-preferences.js --list
 *   node scripts/manage-preferences.js --delete-all-keys
 *   node scripts/manage-preferences.js --delete-keys --profile 2
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Load env
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
}

const { sql } = require('@vercel/postgres');

// Parse args
const args = process.argv.slice(2);
const listMode = args.includes('--list');
const deleteAllKeys = args.includes('--delete-all-keys');
const deleteKeys = args.includes('--delete-keys');
const profileIndex = args.indexOf('--profile');
const profileId = profileIndex !== -1 ? parseInt(args[profileIndex + 1], 10) : null;

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

async function listPreferences() {
  const result = await sql`
    SELECT up.id, up.name, up.display_name, p.preference_key,
           CASE WHEN p.is_encrypted THEN '(encrypted)' ELSE LEFT(p.preference_value, 30) END as value
    FROM user_profiles up
    LEFT JOIN user_preferences p ON up.id = p.user_profile_id
    WHERE up.is_active = true
    ORDER BY up.id, p.preference_key
  `;

  console.log('Current preferences by profile:\n');
  let currentProfile = null;
  for (const row of result.rows) {
    if (row.id !== currentProfile) {
      console.log(`\nProfile ${row.id}: ${row.display_name || row.name}`);
      currentProfile = row.id;
    }
    if (row.preference_key) {
      console.log(`  - ${row.preference_key}: ${row.value || '(empty)'}`);
    } else {
      console.log('  (no preferences)');
    }
  }
}

async function deleteApiKeys(targetProfileId = null) {
  // API key preference keys
  const apiKeyPrefixes = ['api_key_'];

  let query;
  if (targetProfileId) {
    query = await sql`
      SELECT p.id, p.preference_key, up.name, up.display_name
      FROM user_preferences p
      JOIN user_profiles up ON p.user_profile_id = up.id
      WHERE p.preference_key LIKE 'api_key_%'
        AND p.user_profile_id = ${targetProfileId}
    `;
  } else {
    query = await sql`
      SELECT p.id, p.preference_key, up.name, up.display_name, up.id as profile_id
      FROM user_preferences p
      JOIN user_profiles up ON p.user_profile_id = up.id
      WHERE p.preference_key LIKE 'api_key_%'
    `;
  }

  if (query.rows.length === 0) {
    console.log('No API keys found to delete.');
    return;
  }

  console.log('\nAPI keys to delete:');
  for (const row of query.rows) {
    console.log(`  - Profile "${row.display_name || row.name}": ${row.preference_key}`);
  }

  const confirmed = await confirm(`\nDelete ${query.rows.length} API key(s)?`);
  if (!confirmed) {
    console.log('Cancelled.');
    return;
  }

  let result;
  if (targetProfileId) {
    result = await sql`
      DELETE FROM user_preferences
      WHERE preference_key LIKE 'api_key_%'
        AND user_profile_id = ${targetProfileId}
    `;
  } else {
    result = await sql`
      DELETE FROM user_preferences
      WHERE preference_key LIKE 'api_key_%'
    `;
  }

  console.log(`\nDeleted ${result.rowCount} API key preference(s).`);
}

async function main() {
  try {
    if (listMode || (!deleteAllKeys && !deleteKeys)) {
      await listPreferences();
    }

    if (deleteAllKeys) {
      await deleteApiKeys(null);
    } else if (deleteKeys && profileId) {
      await deleteApiKeys(profileId);
    } else if (deleteKeys && !profileId) {
      console.log('Error: --delete-keys requires --profile <id>');
      console.log('Use --delete-all-keys to delete from all profiles.');
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main().then(() => process.exit(0));
