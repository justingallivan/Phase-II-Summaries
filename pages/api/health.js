/**
 * API Route: /api/health
 *
 * Tests all configured external integrations and returns their status.
 * Visit this endpoint after deployments or when diagnosing issues.
 *
 * Returns 200 if all configured services are healthy, 503 if any fail.
 * Optional services that aren't configured show as "skipped" (not failures).
 */

import { sql } from '@vercel/postgres';
import { requireAuth } from '../../lib/utils/auth';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require authentication — health check exposes service status
  const session = await requireAuth(req, res);
  if (!session) return;

  const health = {
    timestamp: new Date().toISOString(),
    services: {},
  };

  // 1. Database
  try {
    const result = await sql`SELECT COUNT(*) as tables FROM information_schema.tables WHERE table_schema = 'public'`;
    health.services.database = { status: 'ok', detail: `${parseInt(result.rows[0].tables)} tables in public schema` };
  } catch (error) {
    health.services.database = { status: 'error', message: error.message };
  }

  // 2. Claude API
  if (process.env.CLAUDE_API_KEY) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Reply with the word ok.' }],
        }),
      });
      if (response.ok) {
        health.services.claude = { status: 'ok', detail: 'Tested with claude-haiku-4-5-20251001' };
      } else {
        let message = `HTTP ${response.status}`;
        try {
          const data = await response.json();
          if (data.error?.message) message = data.error.message;
        } catch {}
        health.services.claude = { status: 'error', message };
      }
    } catch (error) {
      health.services.claude = { status: 'error', message: error.message };
    }
  } else {
    health.services.claude = { status: 'error', message: 'CLAUDE_API_KEY not set' };
  }

  // 3. Azure AD (SSO)
  if (process.env.AUTH_REQUIRED === 'true' && process.env.AZURE_AD_TENANT_ID) {
    try {
      const response = await fetch(
        `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: process.env.AZURE_AD_CLIENT_ID,
            client_secret: process.env.AZURE_AD_CLIENT_SECRET,
            scope: 'https://graph.microsoft.com/.default',
          }).toString(),
        }
      );
      const data = await response.json();
      health.services.azureAd = {
        status: data.access_token ? 'ok' : 'error',
        ...(data.access_token && { detail: 'Client credentials token acquired' }),
        ...(data.error && { message: `${data.error}: ${data.error_description?.split('.')[0]}` }),
      };
    } catch (error) {
      health.services.azureAd = { status: 'error', message: error.message };
    }
  } else {
    health.services.azureAd = {
      status: 'skipped',
      detail: process.env.AUTH_REQUIRED !== 'true' ? 'AUTH_REQUIRED is not true' : 'Missing tenant config',
    };
  }

  // 4. Dynamics CRM
  if (process.env.DYNAMICS_CLIENT_ID && process.env.DYNAMICS_TENANT_ID) {
    try {
      const response = await fetch(
        `https://login.microsoftonline.com/${process.env.DYNAMICS_TENANT_ID}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: process.env.DYNAMICS_CLIENT_ID,
            client_secret: process.env.DYNAMICS_CLIENT_SECRET,
            scope: `${process.env.DYNAMICS_URL || 'https://wmkf.crm.dynamics.com'}/.default`,
          }).toString(),
        }
      );
      const data = await response.json();
      health.services.dynamicsCrm = {
        status: data.access_token ? 'ok' : 'error',
        ...(data.access_token && { detail: 'OAuth token acquired for CRM API' }),
        ...(data.error && { message: `${data.error}: ${data.error_description?.split('.')[0]}` }),
      };
    } catch (error) {
      health.services.dynamicsCrm = { status: 'error', message: error.message };
    }
  } else {
    health.services.dynamicsCrm = { status: 'skipped', detail: 'DYNAMICS_CLIENT_ID or DYNAMICS_TENANT_ID not set' };
  }

  // 5. Encryption key
  health.services.encryption = process.env.USER_PREFS_ENCRYPTION_KEY
    ? { status: 'ok', detail: 'AES-256-GCM key present' }
    : { status: 'error', message: 'USER_PREFS_ENCRYPTION_KEY not set — API key storage will fail' };

  // 6. NEXTAUTH_URL
  health.services.nextAuthUrl = process.env.NEXTAUTH_URL
    ? { status: 'ok', detail: process.env.NEXTAUTH_URL }
    : { status: 'warning', message: 'NEXTAUTH_URL not set — using VERCEL_URL fallback' };

  // Overall status
  const statuses = Object.values(health.services).map(s => s.status);
  const hasError = statuses.includes('error');
  const hasWarning = statuses.includes('warning');
  health.overall = hasError ? 'unhealthy' : hasWarning ? 'degraded' : 'healthy';

  return res.status(hasError ? 503 : 200).json(health);
}
