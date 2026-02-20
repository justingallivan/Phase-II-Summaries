/**
 * API Route: /api/user-preferences
 *
 * Manages user preferences (API keys, settings) for profiles.
 *
 * GET: Get preferences for a profile (sensitive values masked)
 * POST: Set one or more preferences
 * DELETE: Delete one or more preferences
 */

import { DatabaseService } from '../../lib/services/database-service';
import { requireAuthWithProfile } from '../../lib/utils/auth';

export default async function handler(req, res) {
  // Require authentication and extract profile ID from session
  const profileId = await requireAuthWithProfile(req, res);
  if (profileId === null) return;

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, profileId);
    case 'POST':
      return handlePost(req, res, profileId);
    case 'DELETE':
      return handleDelete(req, res, profileId);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleGet(req, res, profileId) {
  try {
    const { key, includeDecrypted } = req.query;

    // If a specific key is requested, return just that value
    if (key) {
      // For API keys, use the special decryption method
      if (DatabaseService.ENCRYPTED_PREFERENCE_KEYS.includes(key)) {
        if (includeDecrypted === 'true') {
          const value = await DatabaseService.getDecryptedApiKey(profileId, key);
          return res.status(200).json({
            success: true,
            key,
            value,
            isEncrypted: true
          });
        } else {
          // Return masked value
          const preferences = await DatabaseService.getUserPreferences(profileId, false);
          return res.status(200).json({
            success: true,
            key,
            value: preferences[key] || null,
            isEncrypted: true,
            masked: true
          });
        }
      } else {
        const preferences = await DatabaseService.getUserPreferences(profileId, true);
        return res.status(200).json({
          success: true,
          key,
          value: preferences[key] || null,
          isEncrypted: false
        });
      }
    }

    // Get all preferences
    // By default, sensitive values are masked unless includeDecrypted is true
    const preferences = await DatabaseService.getUserPreferences(
      profileId,
      includeDecrypted === 'true'
    );

    // Also indicate which keys are encrypted
    const encryptedKeys = DatabaseService.ENCRYPTED_PREFERENCE_KEYS;

    return res.status(200).json({
      success: true,
      profileId,
      preferences,
      encryptedKeys
    });
  } catch (error) {
    console.error('Get user preferences error:', error);
    return res.status(500).json({
      error: 'Failed to fetch preferences'
    });
  }
}

async function handlePost(req, res, profileId) {
  try {
    const { preferences, key, value } = req.body;

    // Handle single key-value pair
    if (key !== undefined) {
      const success = await DatabaseService.setUserPreference(profileId, key, value);
      if (!success) {
        return res.status(500).json({ error: 'Failed to save preference' });
      }
      return res.status(200).json({
        success: true,
        message: 'Preference saved',
        key
      });
    }

    // Handle multiple preferences
    if (preferences && typeof preferences === 'object') {
      const success = await DatabaseService.setUserPreferences(profileId, preferences);
      if (!success) {
        return res.status(500).json({ error: 'Failed to save preferences' });
      }
      return res.status(200).json({
        success: true,
        message: 'Preferences saved',
        count: Object.keys(preferences).length
      });
    }

    return res.status(400).json({ error: 'Either key/value or preferences object is required' });
  } catch (error) {
    console.error('Set user preferences error:', error);
    return res.status(500).json({
      error: 'Failed to save preferences'
    });
  }
}

async function handleDelete(req, res, profileId) {
  try {
    const { key, keys } = req.body;

    // Handle single key deletion
    if (key) {
      const success = await DatabaseService.deleteUserPreference(profileId, key);
      return res.status(200).json({
        success,
        message: success ? 'Preference deleted' : 'Failed to delete preference',
        key
      });
    }

    // Handle multiple key deletion
    if (keys && Array.isArray(keys)) {
      let deletedCount = 0;
      for (const k of keys) {
        const success = await DatabaseService.deleteUserPreference(profileId, k);
        if (success) deletedCount++;
      }
      return res.status(200).json({
        success: true,
        message: `Deleted ${deletedCount} preferences`,
        deletedCount
      });
    }

    return res.status(400).json({ error: 'Either key or keys array is required' });
  } catch (error) {
    console.error('Delete user preferences error:', error);
    return res.status(500).json({
      error: 'Failed to delete preferences'
    });
  }
}
