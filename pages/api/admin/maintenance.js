/**
 * API Route: /api/admin/maintenance
 *
 * GET — Last run per maintenance job + next scheduled times.
 * Superuser only.
 */

import { requireAuthWithProfile, isAuthRequired } from '../../../lib/utils/auth';
import { sql } from '@vercel/postgres';
import MaintenanceService from '../../../lib/services/maintenance-service';

// Cron schedules for display
const SCHEDULES = {
  'daily-maintenance': { cron: '0 3 * * *', description: 'Daily at 3:00 AM UTC' },
  'health-check': { cron: '*/15 * * * *', description: 'Every 15 minutes' },
  'secret-check': { cron: '0 8 * * *', description: 'Daily at 8:00 AM UTC' },
  'log-analysis': { cron: '0 */6 * * *', description: 'Every 6 hours' },
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthRequired()) {
    // Dev mode — skip auth
  } else {
    const profileId = await requireAuthWithProfile(req, res);
    if (profileId === null) return;

    const role = await getRole(profileId);
    if (role !== 'superuser') {
      return res.status(403).json({ error: 'Admin access required' });
    }
  }

  try {
    const lastRuns = await MaintenanceService.getLastRuns();
    const config = await MaintenanceService.getRetentionConfig();

    // Merge last runs with schedule info
    const jobs = Object.entries(SCHEDULES).map(([jobName, schedule]) => {
      const lastRun = lastRuns.find(r => r.job_name === jobName) || null;
      return {
        jobName,
        schedule: schedule.description,
        cron: schedule.cron,
        lastRun: lastRun ? {
          status: lastRun.status,
          recordsDeleted: lastRun.records_deleted,
          startedAt: lastRun.started_at,
          completedAt: lastRun.completed_at,
          durationMs: lastRun.duration_ms,
          errorMessage: lastRun.error_message,
        } : null,
      };
    });

    return res.json({ jobs, retentionConfig: config });
  } catch (error) {
    console.error('Admin maintenance GET error:', error);
    return res.status(500).json({ error: 'Failed to fetch maintenance status' });
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
