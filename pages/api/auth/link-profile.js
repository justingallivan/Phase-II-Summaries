/**
 * API Route: Link Azure account to existing profile
 *
 * POST /api/auth/link-profile
 * Body:
 *   - profileId: ID of existing profile to link (for linking)
 *   - createNew: true to create new profile instead
 *   - azureId: Azure AD user ID
 *   - azureEmail: User's email from Azure
 *   - displayName: User's name from Azure (for new profiles)
 */

import { getServerSession } from 'next-auth/next';
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

  const { profileId, createNew, azureId, azureEmail, displayName } = req.body;

  // Verify the Azure ID matches the session
  if (azureId !== session.user.azureId) {
    return res.status(403).json({ error: 'Azure ID mismatch' });
  }

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
        VALUES (${azureEmail}, ${displayName || azureEmail}, ${azureId}, ${azureEmail}, false, false)
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

    // Link to existing profile
    // First, verify the profile exists and is not already linked
    const existing = await sql`
      SELECT id, azure_id, name, display_name
      FROM user_profiles
      WHERE id = ${profileId} AND is_active = true
    `;

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    if (existing.rows[0].azure_id && existing.rows[0].azure_id !== azureId) {
      return res.status(400).json({ error: 'Profile is already linked to another account' });
    }

    // Link the Azure account to this profile
    await sql`
      UPDATE user_profiles
      SET azure_id = ${azureId}, azure_email = ${azureEmail},
          needs_linking = false, last_login_at = CURRENT_TIMESTAMP
      WHERE id = ${profileId}
    `;

    // Remove any temporary profile created during sign-in
    await sql`
      DELETE FROM user_profiles
      WHERE azure_id = ${azureId} AND id != ${profileId} AND needs_linking = true
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
