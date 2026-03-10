/**
 * API Route: Link Azure account to existing profile
 *
 * POST /api/auth/link-profile
 * Body:
 *   - profileId: ID of existing profile to link (for linking)
 *   - createNew: true to create new profile instead
 *
 * Identity (azureId, azureEmail, displayName) is always derived from the
 * server-side session — never trusted from the request body.
 */

import { getServerSession } from 'next-auth';
import { sql } from '@vercel/postgres';
import { authOptions } from './[...nextauth]';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify the user is authenticated
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Only users in the first-login linking flow may use this endpoint.
  // Once linked (needs_linking = false), this becomes inaccessible,
  // preventing already-linked users from claiming additional profiles.
  if (!session.user.needsLinking) {
    return res.status(403).json({ error: 'Account is already linked' });
  }

  // Derive identity from the trusted session, not the request body.
  const azureId = session.user.azureId;
  const azureEmail = session.user.azureEmail;
  const displayName = session.user.name || azureEmail;
  const { profileId, createNew } = req.body;

  try {
    if (createNew) {
      // Create new profile and link it
      // First, remove any temporary profile created during sign-in
      await sql`
        DELETE FROM user_profiles
        WHERE azure_id = ${azureId} AND needs_linking = true
      `;

      // Create the new profile
      const result = await sql`
        INSERT INTO user_profiles (name, display_name, azure_id, azure_email, is_default, needs_linking)
        VALUES (${azureEmail}, ${displayName}, ${azureId}, ${azureEmail}, false, false)
        RETURNING id, name, display_name
      `;

      return res.status(200).json({
        success: true,
        profile: result.rows[0],
        message: 'New profile created and linked',
      });
    }

    if (!profileId) {
      return res.status(400).json({ error: 'Profile ID required' });
    }

    // Link to existing profile — require the profile's stored email to match
    // the caller's Azure email. This prevents a first-time user from claiming
    // another person's profile by ID. Profiles whose email does not match
    // must be linked by an admin (update the profile's azure_email first).
    const existing = await sql`
      SELECT id, azure_id, name, display_name
      FROM user_profiles
      WHERE id = ${profileId} AND is_active = true
        AND azure_email = ${azureEmail}
    `;

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found or email does not match your account' });
    }

    if (existing.rows[0].azure_id && existing.rows[0].azure_id !== azureId) {
      return res.status(400).json({ error: 'Profile is already linked to another account' });
    }

    // Remove any temporary profile created during sign-in BEFORE updating
    // (to avoid unique constraint violation on azure_id)
    await sql`
      DELETE FROM user_profiles
      WHERE azure_id = ${azureId} AND id != ${profileId} AND needs_linking = true
    `;

    // Link the Azure account to this profile
    await sql`
      UPDATE user_profiles
      SET azure_id = ${azureId}, azure_email = ${azureEmail},
          needs_linking = false, last_login_at = CURRENT_TIMESTAMP
      WHERE id = ${profileId}
    `;

    return res.status(200).json({
      success: true,
      profile: existing.rows[0],
      message: 'Profile linked successfully',
    });
  } catch (error) {
    console.error('Error linking profile:', error);
    return res.status(500).json({ error: 'Failed to link profile' });
  }
}
