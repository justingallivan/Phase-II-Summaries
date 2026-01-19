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

export default async function handler(req, res) {
  switch (req.method) {
    case 'GET':
      return handleGet(req, res);
    case 'POST':
      return handlePost(req, res);
    case 'DELETE':
      return handleDelete(req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleGet(req, res) {
  try {
    const { profileId, key, includeDecrypted } = req.query;

    if (!profileId) {
      return res.status(400).json({ error: 'profileId is required' });
    }

    const parsedProfileId = parseInt(profileId, 10);

    // If a specific key is requested, return just that value
    if (key) {
      // For API keys, use the special decryption method
      if (DatabaseService.ENCRYPTED_PREFERENCE_KEYS.includes(key)) {
        if (includeDecrypted === 'true') {
          const value = await DatabaseService.getDecryptedApiKey(parsedProfileId, key);
          return res.status(200).json({
            success: true,
            key,
            value,
            isEncrypted: true
          });
        } else {
          // Return masked value
          const preferences = await DatabaseService.getUserPreferences(parsedProfileId, false);
          return res.status(200).json({
            success: true,
            key,
            value: preferences[key] || null,
            isEncrypted: true,
            masked: true
          });
        }
      } else {
        const preferences = await DatabaseService.getUserPreferences(parsedProfileId, true);
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
      parsedProfileId,
      includeDecrypted === 'true'
    );

    // Also indicate which keys are encrypted
    const encryptedKeys = DatabaseService.ENCRYPTED_PREFERENCE_KEYS;

    return res.status(200).json({
      success: true,
      profileId: parsedProfileId,
      preferences,
      encryptedKeys
    });
  } catch (error) {
    console.error('Get user preferences error:', error);
    return res.status(500).json({
      error: 'Failed to fetch preferences',
      message: error.message
    });
  }
}

async function handlePost(req, res) {
  try {
    const { profileId, preferences, key, value } = req.body;

    if (!profileId) {
      return res.status(400).json({ error: 'profileId is required' });
    }

    const parsedProfileId = parseInt(profileId, 10);

    // Verify profile exists
    const profile = await DatabaseService.getUserProfileById(parsedProfileId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Handle single key-value pair
    if (key !== undefined) {
      const success = await DatabaseService.setUserPreference(parsedProfileId, key, value);
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
      const success = await DatabaseService.setUserPreferences(parsedProfileId, preferences);
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
      error: 'Failed to save preferences',
      message: error.message
    });
  }
}

async function handleDelete(req, res) {
  try {
    const { profileId, key, keys } = req.body;

    if (!profileId) {
      return res.status(400).json({ error: 'profileId is required' });
    }

    const parsedProfileId = parseInt(profileId, 10);

    // Handle single key deletion
    if (key) {
      const success = await DatabaseService.deleteUserPreference(parsedProfileId, key);
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
        const success = await DatabaseService.deleteUserPreference(parsedProfileId, k);
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
      error: 'Failed to delete preferences',
      message: error.message
    });
  }
}
