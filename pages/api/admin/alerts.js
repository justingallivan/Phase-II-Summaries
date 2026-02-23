/**
 * API Route: /api/admin/alerts
 *
 * GET  — List active/acknowledged alerts (superuser only)
 *   Query: ?status=active|acknowledged|resolved (default: active+acknowledged)
 * PATCH — Acknowledge or resolve an alert
 *   Body: { id, action: 'acknowledge'|'resolve' }
 *
 * Also supports GET ?summary=true for badge counts only.
 */

import { requireAuthWithProfile, isAuthRequired } from '../../../lib/utils/auth';
import { sql } from '@vercel/postgres';
import AlertService from '../../../lib/services/alert-service';

export default async function handler(req, res) {
  // Auth check — same pattern as stats.js
  let profileId = null;
  if (!isAuthRequired()) {
    // Dev mode — skip auth
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
      // Summary mode — just counts for badge
      if (req.query.summary === 'true') {
        const summary = await AlertService.getAlertSummary();
        return res.json(summary);
      }

      const alerts = await AlertService.getAlerts({ status: req.query.status });
      return res.json({ alerts });
    } catch (error) {
      console.error('Admin alerts GET error:', error);
      return res.status(500).json({ error: 'Failed to fetch alerts' });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const { id, action } = req.body;
      if (!id || !['acknowledge', 'resolve'].includes(action)) {
        return res.status(400).json({ error: 'Missing id or invalid action (acknowledge|resolve)' });
      }

      let result;
      if (action === 'acknowledge') {
        result = await AlertService.acknowledgeAlert(id, profileId);
      } else {
        result = await AlertService.resolveAlert(id, profileId);
      }

      if (!result) {
        return res.status(404).json({ error: 'Alert not found or already resolved' });
      }

      return res.json({ alert: result });
    } catch (error) {
      console.error('Admin alerts PATCH error:', error);
      return res.status(500).json({ error: 'Failed to update alert' });
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
