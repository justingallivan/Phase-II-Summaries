/**
 * API Route: /api/dynamics-explorer/restrictions
 *
 * CRUD for Dynamics Explorer table/field restrictions.
 * Superuser-only management of data access restrictions.
 *
 * GET: list all restrictions
 * POST: add a restriction
 * DELETE: remove a restriction by id
 */

import { requireAppAccess } from '../../../lib/utils/auth';
import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  const access = await requireAppAccess(req, res, 'dynamics-explorer');
  if (!access) return;

  const profileId = access.profileId;

  const callerRole = await getRole(profileId);

  switch (req.method) {
    case 'GET':
      return handleGet(req, res);
    case 'POST':
      return handlePost(req, res, profileId, callerRole);
    case 'DELETE':
      return handleDelete(req, res, profileId, callerRole);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleGet(req, res) {
  const result = await sql`
    SELECT r.id, r.table_name, r.field_name, r.restriction_type, r.reason, r.created_by,
           p.name as created_by_name
    FROM dynamics_restrictions r
    LEFT JOIN user_profiles p ON r.created_by = p.id
    ORDER BY r.table_name, r.field_name
  `;
  return res.json({ restrictions: result.rows });
}

async function handlePost(req, res, profileId, callerRole) {
  if (callerRole !== 'superuser') {
    return res.status(403).json({ error: 'Only superusers can manage restrictions' });
  }

  const { table_name, field_name, restriction_type, reason } = req.body;

  if (!table_name) {
    return res.status(400).json({ error: 'table_name is required' });
  }

  const validTypes = ['block', 'mask'];
  const rType = restriction_type || 'block';
  if (!validTypes.includes(rType)) {
    return res.status(400).json({ error: `Invalid restriction_type. Must be one of: ${validTypes.join(', ')}` });
  }

  // Check for existing restriction on same table/field combo
  const fieldVal = field_name || null;
  const existing = fieldVal
    ? await sql`SELECT id FROM dynamics_restrictions WHERE table_name = ${table_name} AND field_name = ${fieldVal}`
    : await sql`SELECT id FROM dynamics_restrictions WHERE table_name = ${table_name} AND field_name IS NULL`;

  let result;
  if (existing.rows.length > 0) {
    result = await sql`
      UPDATE dynamics_restrictions
      SET restriction_type = ${rType}, reason = ${reason || null}, created_by = ${profileId}
      WHERE id = ${existing.rows[0].id}
      RETURNING id, table_name, field_name, restriction_type, reason
    `;
  } else {
    result = await sql`
      INSERT INTO dynamics_restrictions (table_name, field_name, restriction_type, reason, created_by)
      VALUES (${table_name}, ${fieldVal}, ${rType}, ${reason || null}, ${profileId})
      RETURNING id, table_name, field_name, restriction_type, reason
    `;
  }

  return res.json({ restriction: result.rows[0] });
}

async function handleDelete(req, res, profileId, callerRole) {
  if (callerRole !== 'superuser') {
    return res.status(403).json({ error: 'Only superusers can manage restrictions' });
  }

  const id = req.body?.id || req.query?.id;

  if (!id) {
    return res.status(400).json({ error: 'id is required' });
  }

  await sql`
    DELETE FROM dynamics_restrictions
    WHERE id = ${id}
  `;

  return res.json({ success: true });
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
