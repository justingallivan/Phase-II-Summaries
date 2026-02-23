/**
 * API Route: /api/admin/health-history
 *
 * GET — Recent health check history
 *   Query: ?hours=24 (default 24, max 168 = 7 days)
 *
 * Superuser only.
 */

import { requireAuthWithProfile, isAuthRequired } from '../../../lib/utils/auth';
import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthRequired()) {
    // Dev mode
  } else {
    const profileId = await requireAuthWithProfile(req, res);
    if (profileId === null) return;

    const role = await getRole(profileId);
    if (role !== 'superuser') {
      return res.status(403).json({ error: 'Admin access required' });
    }
  }

  try {
    const hours = Math.min(parseInt(req.query.hours) || 24, 168);

    const result = await sql`
      SELECT id, overall_status, services, response_time_ms, triggered_by, created_at
      FROM health_check_history
      WHERE created_at >= NOW() - MAKE_INTERVAL(hours => ${hours})
      ORDER BY created_at DESC
      LIMIT 500
    `;

    // Calculate uptime percentage
    const checks = result.rows;
    const healthyCount = checks.filter(c => c.overall_status === 'healthy').length;
    const uptimePercent = checks.length > 0 ? ((healthyCount / checks.length) * 100).toFixed(1) : null;

    return res.json({
      checks,
      summary: {
        total: checks.length,
        healthy: healthyCount,
        degraded: checks.filter(c => c.overall_status === 'degraded').length,
        unhealthy: checks.filter(c => c.overall_status === 'unhealthy').length,
        uptimePercent,
        hours,
      },
    });
  } catch (error) {
    console.error('Admin health-history GET error:', error);
    return res.status(500).json({ error: 'Failed to fetch health history' });
  }
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
