/**
 * API Route: /api/admin/stats
 *
 * Returns aggregated API usage statistics for the admin dashboard.
 * Protected: superuser role required (or auth bypassed in dev mode).
 *
 * Query params:
 *   period  - '7d' | '30d' | '90d' (default '30d')
 */

import { requireAuthWithProfile, isAuthRequired } from '../../../lib/utils/auth';
import { sql } from '@vercel/postgres';

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

  const period = req.query.period || '30d';
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;

  try {
    const [summary, byUser, byApp, byDay] = await Promise.all([
      getSummary(days),
      getByUser(days),
      getByApp(days),
      getByDay(days),
    ]);

    return res.json({ period, days, summary, byUser, byApp, byDay });
  } catch (error) {
    console.error('Admin stats error:', error);
    return res.status(500).json({ error: 'Failed to fetch usage stats' });
  }
}

async function getSummary(days) {
  const result = await sql`
    SELECT
      COUNT(*)::int AS total_requests,
      COALESCE(SUM(input_tokens), 0)::bigint AS total_input_tokens,
      COALESCE(SUM(output_tokens), 0)::bigint AS total_output_tokens,
      COALESCE(SUM(estimated_cost_cents), 0)::numeric AS total_cost_cents,
      COUNT(DISTINCT user_profile_id)::int AS unique_users,
      COUNT(*) FILTER (WHERE request_status = 'error')::int AS error_count
    FROM api_usage_log
    WHERE created_at >= NOW() - MAKE_INTERVAL(days => ${days})
  `;
  return result.rows[0];
}

async function getByUser(days) {
  const result = await sql`
    SELECT
      u.user_profile_id,
      COALESCE(p.name, p.azure_email, 'Unknown') AS user_name,
      COUNT(*)::int AS request_count,
      COALESCE(SUM(u.input_tokens), 0)::bigint AS total_input_tokens,
      COALESCE(SUM(u.output_tokens), 0)::bigint AS total_output_tokens,
      COALESCE(SUM(u.estimated_cost_cents), 0)::numeric AS total_cost_cents,
      COUNT(*) FILTER (WHERE u.request_status = 'error')::int AS error_count
    FROM api_usage_log u
    LEFT JOIN user_profiles p ON u.user_profile_id = p.id
    WHERE u.created_at >= NOW() - MAKE_INTERVAL(days => ${days})
    GROUP BY u.user_profile_id, p.name, p.azure_email
    ORDER BY total_cost_cents DESC
  `;
  return result.rows;
}

async function getByApp(days) {
  const result = await sql`
    SELECT
      app_name,
      COUNT(*)::int AS request_count,
      COALESCE(SUM(input_tokens), 0)::bigint AS total_input_tokens,
      COALESCE(SUM(output_tokens), 0)::bigint AS total_output_tokens,
      COALESCE(SUM(estimated_cost_cents), 0)::numeric AS total_cost_cents,
      COALESCE(AVG(latency_ms), 0)::int AS avg_latency_ms,
      COUNT(*) FILTER (WHERE request_status = 'error')::int AS error_count
    FROM api_usage_log
    WHERE created_at >= NOW() - MAKE_INTERVAL(days => ${days})
    GROUP BY app_name
    ORDER BY total_cost_cents DESC
  `;
  return result.rows;
}

async function getByDay(days) {
  const result = await sql`
    SELECT
      DATE(created_at) AS day,
      COUNT(*)::int AS request_count,
      COALESCE(SUM(estimated_cost_cents), 0)::numeric AS total_cost_cents,
      COUNT(DISTINCT user_profile_id)::int AS unique_users
    FROM api_usage_log
    WHERE created_at >= NOW() - MAKE_INTERVAL(days => ${days})
    GROUP BY DATE(created_at)
    ORDER BY day ASC
  `;
  return result.rows;
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
