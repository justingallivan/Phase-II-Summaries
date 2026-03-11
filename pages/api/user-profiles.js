/**
 * API Route: /api/user-profiles
 *
 * Manages user profiles for the multi-user system.
 *
 * GET: Return caller's own profile (default), or all profiles (?all=true, superuser only)
 * POST: Create a new profile
 * PATCH: Update a profile (own only)
 * DELETE: Archive (soft delete) a profile (own only)
 */

import { sql } from '@vercel/postgres';
import { DatabaseService } from '../../lib/services/database-service';
import { requireAuthWithProfile, clearAppAccessCache } from '../../lib/utils/auth';
import { BASE_CONFIG } from '../../shared/config/baseConfig';

/**
 * Strip fields that allow user enumeration (azureId, azureEmail, needsLinking).
 * These are internal identity fields — no consumer needs them in the list response.
 */
function sanitizeProfile({ azureId, azureEmail, needsLinking, ...safe }) {
  return safe;
}

export default async function handler(req, res) {
  // All methods use requireAuthWithProfile so we have the caller's profileId
  const profileId = await requireAuthWithProfile(req, res);
  if (profileId === null) {
    // If response was already sent (auth failure), stop
    if (res.headersSent) return;
    // Dev mode (AUTH_REQUIRED=false) with no userProfileId param —
    // allow GET/POST through without scoping for dev compatibility
    if (req.method === 'GET') return handleGet(req, res, null);
    if (req.method === 'POST') return handlePost(req, res);
    return res.status(401).json({ error: 'Profile ID required' });
  }

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, profileId);
    case 'POST':
      return handlePost(req, res);
    case 'PATCH':
      return handlePatch(req, res, profileId);
    case 'DELETE':
      return handleDelete(req, res, profileId);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleGet(req, res, profileId) {
  try {
    const { includeArchived, id, linkable } = req.query;

    // ?linkable=true — server-side filter for ProfileLinkingDialog.
    // Returns only unlinked profiles whose azureEmail matches the caller's email.
    if (linkable === 'true') {
      const callerProfile = await DatabaseService.getUserProfileById(profileId);
      const callerEmail = callerProfile?.azureEmail?.toLowerCase();
      if (!callerEmail) {
        return res.status(200).json({ success: true, profiles: [], count: 0 });
      }
      const allProfiles = await DatabaseService.getUserProfiles(false);
      const linkableProfiles = allProfiles
        .filter(p => !p.azureId && p.azureEmail?.toLowerCase() === callerEmail)
        .map(sanitizeProfile);
      return res.status(200).json({
        success: true,
        profiles: linkableProfiles,
        count: linkableProfiles.length
      });
    }

    // ?id=X — single profile lookup, restricted to caller's own profile
    if (id) {
      const requestedId = parseInt(id, 10);
      if (requestedId !== profileId) {
        return res.status(403).json({ error: 'Cannot view another user\'s profile' });
      }
      const profile = await DatabaseService.getUserProfileById(requestedId);
      if (!profile) {
        return res.status(404).json({ error: 'Profile not found' });
      }
      return res.status(200).json({ success: true, profile: sanitizeProfile(profile) });
    }

    // ?all=true — full list, superuser only (used by admin dashboard)
    if (req.query.all === 'true') {
      const isSuperuser = await checkSuperuser(profileId);
      if (!isSuperuser) {
        return res.status(403).json({ error: 'Superuser access required' });
      }
      const profiles = await DatabaseService.getUserProfiles(includeArchived === 'true');
      return res.status(200).json({
        success: true,
        profiles: profiles.map(sanitizeProfile),
        count: profiles.length
      });
    }

    // Default — return only the caller's own profile
    // (profileId is null in dev mode — fall back to all profiles)
    if (!profileId) {
      const profiles = await DatabaseService.getUserProfiles(includeArchived === 'true');
      return res.status(200).json({
        success: true,
        profiles: profiles.map(sanitizeProfile),
        count: profiles.length
      });
    }
    const profile = await DatabaseService.getUserProfileById(profileId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    return res.status(200).json({
      success: true,
      profiles: [sanitizeProfile(profile)],
      count: 1
    });
  } catch (error) {
    console.error('Get user profiles error:', error);
    return res.status(500).json({
      error: 'Failed to fetch profiles',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
}

async function handlePost(req, res) {
  try {
    const { name, displayName, avatarColor, isDefault } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Profile name is required' });
    }

    // Validate avatar color if provided
    if (avatarColor && !/^#[0-9A-Fa-f]{6}$/.test(avatarColor)) {
      return res.status(400).json({ error: 'Avatar color must be a valid hex color (e.g., #6366f1)' });
    }

    const profile = await DatabaseService.createUserProfile({
      name: name.trim(),
      displayName: displayName?.trim() || name.trim(),
      avatarColor: avatarColor || '#6366f1',
      isDefault: isDefault || false
    });

    return res.status(201).json({
      success: true,
      profile
    });
  } catch (error) {
    console.error('Create user profile error:', error);

    // Check for unique constraint violation
    if (error.message?.includes('unique') || error.message?.includes('duplicate')) {
      return res.status(409).json({
        error: 'A profile with this name already exists'
      });
    }

    return res.status(500).json({
      error: 'Failed to create profile',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
}

async function handlePatch(req, res, sessionProfileId) {
  try {
    const { id, name, displayName, avatarColor, isDefault, updateLastUsed } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Profile ID is required' });
    }

    // Users can only modify their own profile
    if (parseInt(id, 10) !== sessionProfileId) {
      return res.status(403).json({ error: 'Cannot modify another user\'s profile' });
    }

    // Validate avatar color if provided
    if (avatarColor && !/^#[0-9A-Fa-f]{6}$/.test(avatarColor)) {
      return res.status(400).json({ error: 'Avatar color must be a valid hex color (e.g., #6366f1)' });
    }

    const profile = await DatabaseService.updateUserProfile(parseInt(id, 10), {
      name: name?.trim(),
      displayName: displayName?.trim(),
      avatarColor,
      isDefault,
      updateLastUsed
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    return res.status(200).json({
      success: true,
      profile
    });
  } catch (error) {
    console.error('Update user profile error:', error);

    // Check for unique constraint violation
    if (error.message?.includes('unique') || error.message?.includes('duplicate')) {
      return res.status(409).json({
        error: 'A profile with this name already exists'
      });
    }

    return res.status(500).json({
      error: 'Failed to update profile',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
}

async function handleDelete(req, res, sessionProfileId) {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Profile ID is required' });
    }

    // Users can only delete their own profile
    if (parseInt(id, 10) !== sessionProfileId) {
      return res.status(403).json({ error: 'Cannot delete another user\'s profile' });
    }

    const success = await DatabaseService.archiveUserProfile(parseInt(id, 10));

    if (!success) {
      return res.status(500).json({ error: 'Failed to archive profile' });
    }

    // Immediately invalidate cached app access so deactivated user
    // cannot use remaining cache TTL to make authenticated requests
    clearAppAccessCache(parseInt(id, 10));

    return res.status(200).json({
      success: true,
      message: 'Profile archived'
    });
  } catch (error) {
    console.error('Delete user profile error:', error);
    return res.status(500).json({
      error: 'Failed to archive profile',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
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
