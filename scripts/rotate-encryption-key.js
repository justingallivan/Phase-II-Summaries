/**
 * Rotate the USER_PREFS_ENCRYPTION_KEY
 *
 * Re-encrypts all encrypted user preferences with a new key.
 * Supports dry-run mode to preview changes without modifying data.
 *
 * Usage:
 *   # Dry run (preview only)
 *   OLD_KEY=<old_hex_key> NEW_KEY=<new_hex_key> node scripts/rotate-encryption-key.js --dry-run
 *
 *   # Execute rotation
 *   OLD_KEY=<old_hex_key> NEW_KEY=<new_hex_key> node scripts/rotate-encryption-key.js
 *
 *   # Generate a new key
 *   node scripts/rotate-encryption-key.js --generate-key
 *
 * Keys must be 64-character hex strings (32 bytes). Generate one with:
 *   openssl rand -hex 32
 *
 * After rotating:
 *   1. Update USER_PREFS_ENCRYPTION_KEY in Vercel environment variables
 *   2. Redeploy (or wait for next deployment)
 *   3. Update the secret expiration date in the admin dashboard
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

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
}

const { sql } = require('@vercel/postgres');

// Encryption constants (must match lib/utils/encryption.js)
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Parse args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const generateKey = args.includes('--generate-key');

function parseKey(keyStr) {
  if (!keyStr) return null;
  if (keyStr.length === 64) {
    return Buffer.from(keyStr, 'hex');
  }
  // Accept non-hex strings by hashing (matches encryption.js behavior)
  return crypto.createHash('sha256').update(keyStr).digest();
}

function decryptWithKey(encryptedBase64, keyBuffer) {
  const combined = Buffer.from(encryptedBase64, 'base64');
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, undefined, 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function encryptWithKey(plaintext, keyBuffer) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, authTag, Buffer.from(encrypted, 'hex')]);
  return combined.toString('base64');
}

function maskValue(value) {
  if (!value || value.length < 8) return '********';
  return `${value.substring(0, 3)}****${value.substring(value.length - 3)}`;
}

function confirm(message) {
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

async function main() {
  // Generate key mode
  if (generateKey) {
    const key = crypto.randomBytes(32).toString('hex');
    console.log('Generated new encryption key:');
    console.log(key);
    console.log('\nSet this as USER_PREFS_ENCRYPTION_KEY in Vercel environment variables.');
    return;
  }

  // Get old and new keys
  const oldKeyStr = process.env.OLD_KEY;
  const newKeyStr = process.env.NEW_KEY;

  if (!oldKeyStr || !newKeyStr) {
    console.error('Error: Both OLD_KEY and NEW_KEY environment variables are required.');
    console.error('');
    console.error('Usage:');
    console.error('  OLD_KEY=<current_key> NEW_KEY=<new_key> node scripts/rotate-encryption-key.js --dry-run');
    console.error('  OLD_KEY=<current_key> NEW_KEY=<new_key> node scripts/rotate-encryption-key.js');
    console.error('');
    console.error('Generate a new key:');
    console.error('  node scripts/rotate-encryption-key.js --generate-key');
    process.exit(1);
  }

  if (oldKeyStr === newKeyStr) {
    console.error('Error: OLD_KEY and NEW_KEY must be different.');
    process.exit(1);
  }

  const oldKey = parseKey(oldKeyStr);
  const newKey = parseKey(newKeyStr);

  if (!oldKey || !newKey) {
    console.error('Error: Failed to parse keys.');
    process.exit(1);
  }

  console.log(`Encryption key rotation ${dryRun ? '(DRY RUN)' : ''}`);
  console.log('='.repeat(50));

  // Fetch all encrypted preferences
  const result = await sql`
    SELECT id, user_profile_id, preference_key, preference_value
    FROM user_preferences
    WHERE is_encrypted = true
  `;

  if (result.rows.length === 0) {
    console.log('\nNo encrypted preferences found. Nothing to rotate.');
    return;
  }

  console.log(`\nFound ${result.rows.length} encrypted preference(s).\n`);

  // Fetch profile names for display
  const profileIds = [...new Set(result.rows.map(r => r.user_profile_id))];
  const profiles = await sql`
    SELECT id, name FROM user_profiles WHERE id = ANY(${profileIds})
  `;
  const profileMap = {};
  for (const p of profiles.rows) {
    profileMap[p.id] = p.name;
  }

  // Process each encrypted preference
  let successCount = 0;
  let failCount = 0;
  const failures = [];

  for (const row of result.rows) {
    const profileName = profileMap[row.user_profile_id] || `profile ${row.user_profile_id}`;
    const label = `  ${profileName} / ${row.preference_key}`;

    try {
      // Decrypt with old key
      const plaintext = decryptWithKey(row.preference_value, oldKey);

      // Verify decryption produced something reasonable
      if (!plaintext || plaintext.length === 0) {
        throw new Error('Decrypted to empty value');
      }

      // Re-encrypt with new key
      const newEncrypted = encryptWithKey(plaintext, newKey);

      // Verify round-trip: decrypt with new key to confirm
      const verification = decryptWithKey(newEncrypted, newKey);
      if (verification !== plaintext) {
        throw new Error('Round-trip verification failed');
      }

      if (dryRun) {
        console.log(`${label}: OK (decrypted: ${maskValue(plaintext)})`);
      } else {
        // Update the database
        await sql`
          UPDATE user_preferences
          SET preference_value = ${newEncrypted}
          WHERE id = ${row.id}
        `;
        console.log(`${label}: rotated (${maskValue(plaintext)})`);
      }

      successCount++;
    } catch (err) {
      console.log(`${label}: FAILED — ${err.message}`);
      failures.push({ profileName, key: row.preference_key, error: err.message });
      failCount++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`Results: ${successCount} succeeded, ${failCount} failed`);

  if (failures.length > 0) {
    console.log('\nFailed entries:');
    for (const f of failures) {
      console.log(`  - ${f.profileName} / ${f.key}: ${f.error}`);
    }
    console.log('\nFailed entries may have been encrypted with a different key');
    console.log('or may be corrupted. They were NOT modified.');
  }

  if (dryRun) {
    console.log('\nDry run complete. No data was modified.');
    console.log('Run without --dry-run to apply changes.');
  } else if (successCount > 0) {
    console.log('\nRotation complete. Next steps:');
    console.log('  1. Set NEW_KEY as USER_PREFS_ENCRYPTION_KEY in Vercel');
    console.log('  2. Redeploy the application');
    console.log('  3. Update the expiration date in Admin > Secret Expiration');
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
