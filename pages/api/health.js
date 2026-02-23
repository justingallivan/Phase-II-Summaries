/**
 * API Route: /api/health
 *
 * Tests all configured external integrations and returns their status.
 * Visit this endpoint after deployments or when diagnosing issues.
 *
 * Returns 200 if all configured services are healthy, 503 if any fail.
 * Optional services that aren't configured show as "skipped" (not failures).
 *
 * The actual check logic lives in lib/utils/health-checker.js so it can
 * be reused by the health-check cron job.
 */

import { requireAuth } from '../../lib/utils/auth';
import { runHealthChecks } from '../../lib/utils/health-checker';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require authentication — health check exposes service status
  const session = await requireAuth(req, res);
  if (!session) return;

  const health = await runHealthChecks();
  return res.status(health.overall === 'unhealthy' ? 503 : 200).json(health);
}
