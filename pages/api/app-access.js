/**
 * API Route: /api/app-access
 *
 * CRUD for per-user app access grants.
 * GET:    Returns caller's allowed apps (or all grants when ?all=true for superusers)
 * POST:   Grant apps to a user (superuser only)
 * DELETE: Revoke apps from a user (superuser only)
 */

import { requireAuthWithProfile, isAuthRequired, clearAppAccessCache } from '../../lib/utils/auth';
import { sql } from '@vercel/postgres';
import { ALL_APP_KEYS } from '../../shared/config/appRegistry';

export default async function handler(req, res) {
  // When auth is disabled (dev mode), return all apps
  if (!isAuthRequired()) {
    if (req.method === 'GET') {
      return res.json({ apps: ALL_APP_KEYS, isSuperuser: true });
    }
    return res.json({ success: true });
  }

  const profileId = await requireAuthWithProfile(req, res);
  if (profileId === null) return;

  const isSuperuser = await checkSuperuser(profileId);

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, profileId, isSuperuser);
    case 'POST':
      return handlePost(req, res, profileId, isSuperuser);
    case 'DELETE':
      return handleDelete(req, res, profileId, isSuperuser);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleGet(req, res, profileId, isSuperuser) {
  // Superusers see all apps
  if (isSuperuser && !req.query.all) {
    return res.json({ apps: ALL_APP_KEYS, isSuperuser: true });
  }

  // ?all=true — superuser admin view: all users and their grants
  if (req.query.all === 'true') {
    if (!isSuperuser) {
      return res.status(403).json({ error: 'Superuser access required' });
    }

    const grants = await sql`
      SELECT
        p.id as user_profile_id,
        p.name as user_name,
        p.azure_email,
        COALESCE(array_agg(a.app_key ORDER BY a.app_key) FILTER (WHERE a.app_key IS NOT NULL), '{}') as apps
      FROM user_profiles p
      LEFT JOIN user_app_access a ON p.id = a.user_profile_id
      WHERE p.is_active = true
      GROUP BY p.id, p.name, p.azure_email
      ORDER BY p.name
    `;

    return res.json({
      grants: grants.rows,
      allApps: ALL_APP_KEYS,
    });
  }

  // Regular user: return their own grants
  const result = await sql`
    SELECT app_key FROM user_app_access
    WHERE user_profile_id = ${profileId}
    ORDER BY app_key
  `;

  return res.json({
    apps: result.rows.map(r => r.app_key),
    isSuperuser: false,
  });
}

async function handlePost(req, res, profileId, isSuperuser) {
  if (!isSuperuser) {
    return res.status(403).json({ error: 'Only superusers can grant app access' });
  }

  const { userProfileId, apps } = req.body;

  if (!userProfileId || !Array.isArray(apps) || apps.length === 0) {
    return res.status(400).json({ error: 'userProfileId and apps[] are required' });
  }

  // Validate app keys
  const invalid = apps.filter(k => !ALL_APP_KEYS.includes(k));
  if (invalid.length > 0) {
    return res.status(400).json({ error: `Invalid app keys: ${invalid.join(', ')}` });
  }

  // Insert grants (ignore duplicates)
  for (const appKey of apps) {
    await sql`
      INSERT INTO user_app_access (user_profile_id, app_key, granted_by)
      VALUES (${userProfileId}, ${appKey}, ${profileId})
      ON CONFLICT (user_profile_id, app_key) DO NOTHING
    `;
  }

  clearAppAccessCache(userProfileId);
  return res.json({ success: true, granted: apps });
}

async function handleDelete(req, res, profileId, isSuperuser) {
  if (!isSuperuser) {
    return res.status(403).json({ error: 'Only superusers can revoke app access' });
  }

  const { userProfileId, apps } = req.body;

  if (!userProfileId || !Array.isArray(apps) || apps.length === 0) {
    return res.status(400).json({ error: 'userProfileId and apps[] are required' });
  }

  for (const appKey of apps) {
    await sql`
      DELETE FROM user_app_access
      WHERE user_profile_id = ${userProfileId} AND app_key = ${appKey}
    `;
  }

  clearAppAccessCache(userProfileId);
  return res.json({ success: true, revoked: apps });
}

async function checkSuperuser(profileId) {
  try {
    const result = await sql`
      SELECT role FROM dynamics_user_roles
      WHERE user_profile_id = ${profileId}
    `;
    return result.rows[0]?.role === 'superuser';
  } catch {
    return false;
  }
}
