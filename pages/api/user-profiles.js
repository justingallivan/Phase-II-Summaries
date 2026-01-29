/**
 * API Route: /api/user-profiles
 *
 * Manages user profiles for the multi-user system.
 *
 * GET: List all user profiles
 * POST: Create a new profile
 * PATCH: Update a profile
 * DELETE: Archive (soft delete) a profile
 */

import { DatabaseService } from '../../lib/services/database-service';
import { requireAuth } from '../../lib/utils/auth';

export default async function handler(req, res) {
  // Require authentication
  const session = await requireAuth(req, res);
  if (!session) return;

  switch (req.method) {
    case 'GET':
      return handleGet(req, res);
    case 'POST':
      return handlePost(req, res);
    case 'PATCH':
      return handlePatch(req, res);
    case 'DELETE':
      return handleDelete(req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleGet(req, res) {
  try {
    const { includeArchived, id } = req.query;

    // If ID is provided, get single profile
    if (id) {
      const profile = await DatabaseService.getUserProfileById(parseInt(id, 10));
      if (!profile) {
        return res.status(404).json({ error: 'Profile not found' });
      }
      return res.status(200).json({ success: true, profile });
    }

    // Otherwise, list all profiles
    const profiles = await DatabaseService.getUserProfiles(includeArchived === 'true');

    return res.status(200).json({
      success: true,
      profiles,
      count: profiles.length
    });
  } catch (error) {
    console.error('Get user profiles error:', error);
    return res.status(500).json({
      error: 'Failed to fetch profiles',
      message: error.message
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
      message: error.message
    });
  }
}

async function handlePatch(req, res) {
  try {
    const { id, name, displayName, avatarColor, isDefault, updateLastUsed } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Profile ID is required' });
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
      message: error.message
    });
  }
}

async function handleDelete(req, res) {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Profile ID is required' });
    }

    const success = await DatabaseService.archiveUserProfile(parseInt(id, 10));

    if (!success) {
      return res.status(500).json({ error: 'Failed to archive profile' });
    }

    return res.status(200).json({
      success: true,
      message: 'Profile archived'
    });
  } catch (error) {
    console.error('Delete user profile error:', error);
    return res.status(500).json({
      error: 'Failed to archive profile',
      message: error.message
    });
  }
}
