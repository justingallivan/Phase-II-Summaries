/**
 * Cron: /api/cron/secret-check
 *
 * Daily check (8:00 AM UTC) for approaching secret expirations.
 * Reads expiration dates from system_settings and creates alerts
 * at tiered thresholds: warning at 14 days, error at 7 days,
 * critical if expired.
 *
 * Secret expiration dates are stored in system_settings with keys like:
 *   secret_expiration:azure_ad_client_secret = "2026-06-15"
 *
 * Last-rotation dates are stored as:
 *   secret_rotation:azure_ad_client_secret = "2026-01-15"
 *
 * Auth: Vercel CRON_SECRET (dev mode bypasses)
 */

import { sql } from '@vercel/postgres';
import { verifyCronSecret } from '../../../lib/utils/cron-auth';
import NotificationService from '../../../lib/services/notification-service';
import AlertService from '../../../lib/services/alert-service';

// Secrets we track — display name + settings key suffix
const TRACKED_SECRETS = [
  { key: 'azure_ad_client_secret', name: 'Azure AD Client Secret' },
  { key: 'dynamics_client_secret', name: 'Dynamics CRM Client Secret' },
  { key: 'nextauth_secret', name: 'NextAuth Secret' },
  { key: 'user_prefs_encryption_key', name: 'User Preferences Encryption Key' },
  { key: 'cron_secret', name: 'Cron Secret' },
];

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyCronSecret(req, res)) return;

  try {
    // Load all secret_expiration:* settings
    const settings = await sql`
      SELECT setting_key, setting_value
      FROM system_settings
      WHERE setting_key LIKE 'secret_expiration:%'
         OR setting_key LIKE 'secret_rotation:%'
    `;

    const settingsMap = {};
    for (const row of settings.rows) {
      settingsMap[row.setting_key] = row.setting_value;
    }

    const results = [];
    const now = new Date();

    for (const secret of TRACKED_SECRETS) {
      const expirationStr = settingsMap[`secret_expiration:${secret.key}`];
      const rotationStr = settingsMap[`secret_rotation:${secret.key}`];

      if (!expirationStr) {
        results.push({ key: secret.key, name: secret.name, status: 'not_tracked' });
        continue;
      }

      const expiration = new Date(expirationStr);
      const daysUntilExpiry = Math.ceil((expiration - now) / (24 * 60 * 60 * 1000));
      const autoResolveKey = `secret:${secret.key}`;

      let severity = null;
      if (daysUntilExpiry <= 0) {
        severity = 'critical';
      } else if (daysUntilExpiry <= 7) {
        severity = 'error';
      } else if (daysUntilExpiry <= 14) {
        severity = 'warning';
      }

      if (severity) {
        const title = daysUntilExpiry <= 0
          ? `EXPIRED: ${secret.name}`
          : `${secret.name} expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}`;

        await NotificationService.notify({
          type: 'secret_expiration',
          severity,
          title,
          message: `Expiration date: ${expirationStr}. ${rotationStr ? `Last rotated: ${rotationStr}` : 'No rotation date recorded.'}`,
          metadata: {
            secretKey: secret.key,
            secretName: secret.name,
            expirationDate: expirationStr,
            lastRotated: rotationStr || null,
            daysUntilExpiry,
          },
          source: 'cron/secret-check',
          autoResolveKey,
        });
      } else {
        // Secret is healthy — auto-resolve any prior alerts for it
        await AlertService.autoResolve(autoResolveKey);
      }

      results.push({
        key: secret.key,
        name: secret.name,
        expirationDate: expirationStr,
        lastRotated: rotationStr || null,
        daysUntilExpiry,
        status: severity || 'ok',
      });
    }

    return res.json({ ok: true, secrets: results });
  } catch (error) {
    console.error('Secret check cron error:', error);
    return res.status(500).json({ error: 'Secret check failed', message: error.message });
  }
}
