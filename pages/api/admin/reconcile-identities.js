/**
 * API Route: /api/admin/reconcile-identities
 *
 * Manual trigger for the Dynamics identity reconciliation job.
 * Same effect as the weekly cron at /api/cron/reconcile-identities, but
 * authenticated via session (superuser) instead of CRON_SECRET.
 *
 * POST body (optional):
 *   { all: boolean }   true = full backfill of every active profile
 *
 * Plan: docs/DYNAMICS_IDENTITY_RECONCILIATION_PLAN.md
 */

import { requireAuthWithProfile, isAuthRequired } from '../../../lib/utils/auth';
import { sql } from '@vercel/postgres';
import { reconcileBatch } from '../../../lib/services/dynamics-identity-service';
import { bypassDynamicsRestrictions } from '../../../lib/services/dynamics-context';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (isAuthRequired()) {
    const profileId = await requireAuthWithProfile(req, res);
    if (profileId === null) return;

    const role = await getRole(profileId);
    if (role !== 'superuser') {
      return res.status(403).json({ error: 'Admin access required' });
    }
  }

  const all = req.body?.all === true;

  try {
    const result = await bypassDynamicsRestrictions('admin-reconcile-identities', () =>
      reconcileBatch({ staleDays: 30, includeNull: true, includeAll: all }),
    );

    return res.json({
      ok: true,
      mode: all ? 'all' : 'stale+null',
      totalScanned: result.totalScanned,
      summary: result.summary,
    });
  } catch (error) {
    console.error('Admin reconcile error:', error);
    return res.status(500).json({ error: 'Reconciliation failed', message: error.message });
  }
}

async function getRole(profileId) {
  const result = await sql`
    SELECT role FROM dynamics_user_roles WHERE user_profile_id = ${profileId}
  `;
  return result.rows[0]?.role || null;
}
