/**
 * API Route: /api/dynamics-explorer/roles
 *
 * CRUD for Dynamics Explorer user roles.
 * GET: list all roles (superuser) or own role (any user)
 * POST: assign role to a user (superuser only)
 * DELETE: remove role, reverts to read_only (superuser only)
 */

import { requireAuthWithProfile } from '../../../lib/utils/auth';
import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  const profileId = await requireAuthWithProfile(req, res);
  if (profileId === null) return;

  // Get caller's role
  const callerRole = await getRole(profileId);

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, profileId, callerRole);
    case 'POST':
      return handlePost(req, res, profileId, callerRole);
    case 'DELETE':
      return handleDelete(req, res, profileId, callerRole);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleGet(req, res, profileId, callerRole) {
  if (callerRole === 'superuser') {
    // Return all roles with user names
    const result = await sql`
      SELECT r.id, r.user_profile_id, r.role, r.created_at,
             p.name as user_name,
             g.name as granted_by_name
      FROM dynamics_user_roles r
      LEFT JOIN user_profiles p ON r.user_profile_id = p.id
      LEFT JOIN user_profiles g ON r.granted_by = g.id
      ORDER BY r.created_at DESC
    `;
    return res.json({ roles: result.rows, callerRole });
  }

  // Non-superusers only see their own role
  return res.json({ role: callerRole, callerRole });
}

async function handlePost(req, res, profileId, callerRole) {
  if (callerRole !== 'superuser') {
    return res.status(403).json({ error: 'Only superusers can assign roles' });
  }

  const { userProfileId, role } = req.body;

  if (!userProfileId) {
    return res.status(400).json({ error: 'userProfileId is required' });
  }

  const validRoles = ['superuser', 'read_write', 'read_only'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
  }

  // Upsert the role
  const result = await sql`
    INSERT INTO dynamics_user_roles (user_profile_id, role, granted_by)
    VALUES (${userProfileId}, ${role}, ${profileId})
    ON CONFLICT (user_profile_id)
    DO UPDATE SET role = ${role}, granted_by = ${profileId}
    RETURNING id, user_profile_id, role, created_at
  `;

  return res.json({ role: result.rows[0] });
}

async function handleDelete(req, res, profileId, callerRole) {
  if (callerRole !== 'superuser') {
    return res.status(403).json({ error: 'Only superusers can remove roles' });
  }

  const { userProfileId } = req.body || req.query;

  if (!userProfileId) {
    return res.status(400).json({ error: 'userProfileId is required' });
  }

  await sql`
    DELETE FROM dynamics_user_roles
    WHERE user_profile_id = ${userProfileId}
  `;

  return res.json({ success: true, message: 'Role removed, user reverts to read_only' });
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
