/**
 * API Route: /api/admin/secrets
 *
 * GET — Secret expiration status for all tracked secrets
 * PUT — Update rotation/expiration date for a secret
 *   Body: { key, rotationDate?, expirationDate? }
 *
 * Superuser only.
 */

import { requireAuthWithProfile, isAuthRequired } from '../../../lib/utils/auth';
import { sql } from '@vercel/postgres';

// Secrets we track
const TRACKED_SECRETS = [
  { key: 'azure_ad_client_secret', name: 'Azure AD Client Secret' },
  { key: 'dynamics_client_secret', name: 'Dynamics CRM Client Secret' },
  { key: 'nextauth_secret', name: 'NextAuth Secret' },
  { key: 'user_prefs_encryption_key', name: 'User Preferences Encryption Key' },
  { key: 'cron_secret', name: 'Cron Secret' },
];

export default async function handler(req, res) {
  let profileId = null;
  if (!isAuthRequired()) {
    // Dev mode
  } else {
    profileId = await requireAuthWithProfile(req, res);
    if (profileId === null) return;

    const role = await getRole(profileId);
    if (role !== 'superuser') {
      return res.status(403).json({ error: 'Admin access required' });
    }
  }

  if (req.method === 'GET') {
    try {
      const settings = await sql`
        SELECT setting_key, setting_value, updated_at
        FROM system_settings
        WHERE setting_key LIKE 'secret_expiration:%'
           OR setting_key LIKE 'secret_rotation:%'
      `;

      const settingsMap = {};
      for (const row of settings.rows) {
        settingsMap[row.setting_key] = { value: row.setting_value, updatedAt: row.updated_at };
      }

      const now = new Date();
      const secrets = TRACKED_SECRETS.map(secret => {
        const expEntry = settingsMap[`secret_expiration:${secret.key}`];
        const rotEntry = settingsMap[`secret_rotation:${secret.key}`];

        let daysUntilExpiry = null;
        let status = 'not_tracked';
        if (expEntry) {
          const expDate = new Date(expEntry.value);
          daysUntilExpiry = Math.ceil((expDate - now) / (24 * 60 * 60 * 1000));
          if (daysUntilExpiry <= 0) status = 'expired';
          else if (daysUntilExpiry <= 7) status = 'critical';
          else if (daysUntilExpiry <= 14) status = 'warning';
          else if (daysUntilExpiry <= 30) status = 'attention';
          else status = 'ok';
        }

        return {
          key: secret.key,
          name: secret.name,
          expirationDate: expEntry?.value || null,
          lastRotated: rotEntry?.value || null,
          daysUntilExpiry,
          status,
        };
      });

      return res.json({ secrets });
    } catch (error) {
      console.error('Admin secrets GET error:', error);
      return res.status(500).json({ error: 'Failed to fetch secret status' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { key, rotationDate, expirationDate } = req.body;
      if (!key) {
        return res.status(400).json({ error: 'Missing secret key' });
      }

      // Validate the key is one we track
      if (!TRACKED_SECRETS.find(s => s.key === key)) {
        return res.status(400).json({ error: 'Unknown secret key' });
      }

      if (rotationDate) {
        await sql`
          INSERT INTO system_settings (setting_key, setting_value, updated_by)
          VALUES (${'secret_rotation:' + key}, ${rotationDate}, ${profileId})
          ON CONFLICT (setting_key)
          DO UPDATE SET setting_value = ${rotationDate}, updated_by = ${profileId}, updated_at = CURRENT_TIMESTAMP
        `;
      }

      if (expirationDate) {
        await sql`
          INSERT INTO system_settings (setting_key, setting_value, updated_by)
          VALUES (${'secret_expiration:' + key}, ${expirationDate}, ${profileId})
          ON CONFLICT (setting_key)
          DO UPDATE SET setting_value = ${expirationDate}, updated_by = ${profileId}, updated_at = CURRENT_TIMESTAMP
        `;
      }

      return res.json({ ok: true });
    } catch (error) {
      console.error('Admin secrets PUT error:', error);
      return res.status(500).json({ error: 'Failed to update secret dates' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function getRole(profileId) {
  try {
    const result = await sql`
      SELECT role FROM dynamics_user_roles
      WHERE user_profile_id = ${profileId}
    `;
    return result.rows[0]?.role || 'read_only';
  } catch {
    return 'read_only';
  }
}
