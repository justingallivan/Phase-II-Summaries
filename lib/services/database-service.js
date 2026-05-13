/**
 * DatabaseService — Postgres helpers used by the Reviewer Finder app.
 *
 * Current scope:
 *   - Search result caching (`search_cache`)
 *   - Cache statistics + maintenance utilities
 *   - User-preferences dispatcher (`useDataversePrefs()`) — the Postgres
 *     branch is dead code retained pending a separate cleanup pass;
 *     production routes go through the Dataverse adapter chain.
 *
 * Researcher / publication / keyword / reviewer-suggestion methods that
 * used to live here were removed in W5 (commit `0c58da4`) once their
 * three live callers (`discovery-service`, `deduplication-service`,
 * `contact-enrichment-service`) migrated to Dataverse adapters. See
 * the short pointer at the foot of this file for replacement modules.
 */

const { sql } = require('@vercel/postgres');
const crypto = require('crypto');
const { encrypt, decrypt, maskValue } = require('../utils/encryption');

// Loaded via variable-path require so the bundler can't statically trace
// it — keeps the fs/path-using Dataverse client out of client bundles that
// transitively reach DatabaseService. Server-side only.
let _dataversePrefs;
function getDataversePrefsService() {
  if (_dataversePrefs) return _dataversePrefs;
  const modName = './dataverse-prefs-service';
  // eslint-disable-next-line global-require, import/no-dynamic-require
  _dataversePrefs = require(modName);
  return _dataversePrefs;
}
function useDataversePrefs() {
  // Default Dataverse; explicit 'postgres' fails loudly (user_preferences
  // dropped 2026-05-12). The legacy Postgres branches in this class are
  // dead code retained pending a follow-up cleanup pass.
  return process.env.WAVE1_BACKEND_PREFS !== 'postgres';
}

class DatabaseService {
  // ============================================
  // CACHE OPERATIONS
  // ============================================

  /**
   * Generate a hash for cache lookup
   */
  static generateQueryHash(source, query) {
    return crypto
      .createHash('sha256')
      .update(`${source}:${query}`)
      .digest('hex');
  }

  /**
   * Check if a search result is cached and not expired
   */
  static async checkCache(source, query) {
    try {
      const queryHash = this.generateQueryHash(source, query);

      const result = await sql`
        SELECT results FROM search_cache
        WHERE source = ${source}
          AND query_hash = ${queryHash}
          AND expires_at > CURRENT_TIMESTAMP
      `;

      const cached = result.rows[0]?.results;
      if (!cached) return null;

      // Handle both string (needs parsing) and already-parsed JSON
      if (typeof cached === 'string') {
        try {
          return JSON.parse(cached);
        } catch (parseError) {
          console.error('Cache JSON parse error:', parseError.message);
          return null;
        }
      }

      return cached;
    } catch (error) {
      console.error('Cache check error:', error.message);
      return null; // Fail gracefully - continue without cache
    }
  }

  /**
   * Store search results in cache
   */
  static async cacheSearch(entry) {
    try {
      const queryHash = this.generateQueryHash(entry.source, entry.query);
      const resultCount = Array.isArray(entry.results) ? entry.results.length : 0;

      await sql`
        INSERT INTO search_cache (
          source, query_hash, query_text, results, result_count, expires_at
        )
        VALUES (
          ${entry.source},
          ${queryHash},
          ${entry.query},
          ${JSON.stringify(entry.results)},
          ${resultCount},
          ${entry.expiresAt.toISOString()}
        )
        ON CONFLICT (source, query_hash)
        DO UPDATE SET
          results = ${JSON.stringify(entry.results)},
          result_count = ${resultCount},
          created_at = CURRENT_TIMESTAMP,
          expires_at = ${entry.expiresAt.toISOString()}
      `;
    } catch (error) {
      console.error('Cache write error:', error.message);
      // Fail gracefully - continue without caching
    }
  }

  // Researcher / publication / keyword / suggestion methods removed in W5.
  // Replacements: `lib/utils/name-normalization.js`,
  // `lib/dataverse/adapters/{potential-reviewer,researcher,reviewer-suggestion}`.
  // Migration history: `docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md`.

  // ============================================
  // ANALYTICS & MAINTENANCE
  // ============================================

  /**
   * Get cache statistics
   */
  static async getCacheStats() {
    try {
      const result = await sql`
        SELECT
          source,
          COUNT(*) as total_entries,
          SUM(result_count) as total_results,
          COUNT(*) FILTER (WHERE expires_at > CURRENT_TIMESTAMP) as active_entries,
          COUNT(*) FILTER (WHERE expires_at <= CURRENT_TIMESTAMP) as expired_entries
        FROM search_cache
        GROUP BY source
      `;

      return result.rows;
    } catch (error) {
      console.error('Get cache stats error:', error.message);
      return [];
    }
  }

  /**
   * Clean up expired cache entries
   */
  static async cleanupExpiredCache() {
    try {
      const result = await sql`
        DELETE FROM search_cache
        WHERE expires_at < CURRENT_TIMESTAMP
      `;

      return result.rowCount || 0;
    } catch (error) {
      console.error('Cleanup cache error:', error.message);
      return 0;
    }
  }

  /**
   * Clear ALL cache entries (force fresh searches)
   */
  static async clearAllCache() {
    try {
      const result = await sql`DELETE FROM search_cache`;
      console.log(`Cleared ${result.rowCount || 0} cache entries`);
      return result.rowCount || 0;
    } catch (error) {
      console.error('Clear cache error:', error.message);
      return 0;
    }
  }

  /**
   * Clear cache for a specific source
   */
  static async clearCacheForSource(source) {
    try {
      const result = await sql`
        DELETE FROM search_cache
        WHERE source = ${source}
      `;
      console.log(`Cleared ${result.rowCount || 0} ${source} cache entries`);
      return result.rowCount || 0;
    } catch (error) {
      console.error('Clear source cache error:', error.message);
      return 0;
    }
  }

  /**
   * Check if database is connected and tables exist
   */
  static async healthCheck() {
    try {
      const result = await sql`SELECT 1 as ok`;
      return result.rows[0]?.ok === 1;
    } catch (error) {
      console.error('Database health check failed:', error.message);
      return false;
    }
  }

  // ============================================
  // USER PROFILE OPERATIONS
  // ============================================

  /**
   * Get all user profiles
   * @param {boolean} includeArchived - Whether to include archived (is_active=false) profiles
   * @returns {Array} List of user profiles
   */
  static async getUserProfiles(includeArchived = false) {
    try {
      let result;
      if (includeArchived) {
        result = await sql`
          SELECT * FROM user_profiles
          ORDER BY is_default DESC, last_used_at DESC
        `;
      } else {
        result = await sql`
          SELECT * FROM user_profiles
          WHERE is_active = true
          ORDER BY is_default DESC, last_used_at DESC
        `;
      }

      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        displayName: row.display_name,
        avatarColor: row.avatar_color,
        isDefault: row.is_default,
        isActive: row.is_active,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
        azureId: row.azure_id,
        azureEmail: row.azure_email,
        lastLoginAt: row.last_login_at,
        needsLinking: row.needs_linking,
        dynamicsSystemuserId: row.dynamics_systemuser_id,
        dynamicsReconciledAt: row.dynamics_reconciled_at
      }));
    } catch (error) {
      console.error('Get user profiles error:', error.message);
      return [];
    }
  }

  /**
   * Get a single user profile by ID
   * @param {number} id - Profile ID
   * @returns {Object|null} User profile or null
   */
  static async getUserProfileById(id) {
    try {
      const result = await sql`
        SELECT * FROM user_profiles WHERE id = ${id}
      `;

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        id: row.id,
        name: row.name,
        displayName: row.display_name,
        avatarColor: row.avatar_color,
        isDefault: row.is_default,
        isActive: row.is_active,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
        azureId: row.azure_id,
        azureEmail: row.azure_email,
        lastLoginAt: row.last_login_at,
        needsLinking: row.needs_linking,
        dynamicsSystemuserId: row.dynamics_systemuser_id,
        dynamicsReconciledAt: row.dynamics_reconciled_at
      };
    } catch (error) {
      console.error('Get user profile by ID error:', error.message);
      return null;
    }
  }

  /**
   * Create a new user profile
   * @param {Object} profile - Profile data (name, displayName, avatarColor, isDefault)
   * @returns {Object} Created profile with ID
   */
  static async createUserProfile(profile) {
    try {
      // If this is the default profile, unset any existing default
      if (profile.isDefault) {
        await sql`UPDATE user_profiles SET is_default = false WHERE is_default = true`;
      }

      const result = await sql`
        INSERT INTO user_profiles (name, display_name, avatar_color, is_default)
        VALUES (
          ${profile.name},
          ${profile.displayName || profile.name},
          ${profile.avatarColor || '#6366f1'},
          ${profile.isDefault || false}
        )
        RETURNING *
      `;

      const row = result.rows[0];
      return {
        id: row.id,
        name: row.name,
        displayName: row.display_name,
        avatarColor: row.avatar_color,
        isDefault: row.is_default,
        isActive: row.is_active,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at
      };
    } catch (error) {
      console.error('Create user profile error:', error.message);
      throw error;
    }
  }

  /**
   * Update a user profile
   * @param {number} id - Profile ID
   * @param {Object} updates - Fields to update (name, displayName, avatarColor, isDefault)
   * @returns {Object} Updated profile
   */
  static async updateUserProfile(id, updates) {
    try {
      // If setting as default, unset any existing default
      if (updates.isDefault) {
        await sql`UPDATE user_profiles SET is_default = false WHERE is_default = true AND id != ${id}`;
      }

      const result = await sql`
        UPDATE user_profiles SET
          name = COALESCE(${updates.name}, name),
          display_name = COALESCE(${updates.displayName}, display_name),
          avatar_color = COALESCE(${updates.avatarColor}, avatar_color),
          is_default = COALESCE(${updates.isDefault}, is_default),
          last_used_at = CASE WHEN ${updates.updateLastUsed || false} THEN CURRENT_TIMESTAMP ELSE last_used_at END
        WHERE id = ${id}
        RETURNING *
      `;

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        id: row.id,
        name: row.name,
        displayName: row.display_name,
        avatarColor: row.avatar_color,
        isDefault: row.is_default,
        isActive: row.is_active,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at
      };
    } catch (error) {
      console.error('Update user profile error:', error.message);
      throw error;
    }
  }

  /**
   * Archive (soft delete) a user profile
   * @param {number} id - Profile ID
   * @returns {boolean} Success
   */
  static async archiveUserProfile(id) {
    try {
      await sql`
        UPDATE user_profiles
        SET is_active = false, is_default = false
        WHERE id = ${id}
      `;
      return true;
    } catch (error) {
      console.error('Archive user profile error:', error.message);
      return false;
    }
  }

  /**
   * Update last_used_at timestamp for a profile
   * @param {number} id - Profile ID
   */
  static async touchUserProfile(id) {
    try {
      await sql`
        UPDATE user_profiles
        SET last_used_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
      `;
    } catch (error) {
      console.error('Touch user profile error:', error.message);
    }
  }

  // ============================================
  // USER PREFERENCE OPERATIONS
  // ============================================

  /**
   * List of preference keys that should be encrypted
   */
  static ENCRYPTED_PREFERENCE_KEYS = [
    'api_key_claude',
    'api_key_orcid_client_id',
    'api_key_orcid_client_secret',
    'api_key_ncbi',
    'api_key_serp'
  ];

  /**
   * Get all preferences for a user profile
   * @param {number} profileId - Profile ID
   * @param {boolean} includeDecrypted - Whether to decrypt encrypted values (sensitive!)
   * @returns {Object} Preferences as key-value pairs
   */
  static async getUserPreferences(profileId, includeDecrypted = false) {
    if (useDataversePrefs()) {
      return getDataversePrefsService().getUserPreferences(profileId, includeDecrypted);
    }
    try {
      const result = await sql`
        SELECT preference_key, preference_value, is_encrypted
        FROM user_preferences
        WHERE user_profile_id = ${profileId}
      `;

      const preferences = {};
      for (const row of result.rows) {
        if (row.is_encrypted) {
          if (includeDecrypted) {
            preferences[row.preference_key] = decrypt(row.preference_value);
          } else {
            // Return masked value
            const decrypted = decrypt(row.preference_value);
            preferences[row.preference_key] = maskValue(decrypted);
          }
        } else {
          preferences[row.preference_key] = row.preference_value;
        }
      }

      return preferences;
    } catch (error) {
      console.error('Get user preferences error:', error.message);
      return {};
    }
  }

  /**
   * Set a single user preference
   * @param {number} profileId - Profile ID
   * @param {string} key - Preference key
   * @param {string} value - Preference value
   * @param {boolean} isEncrypted - Whether to encrypt the value
   * @returns {boolean} Success
   */
  static async setUserPreference(profileId, key, value, isEncrypted = null) {
    if (useDataversePrefs()) {
      return getDataversePrefsService().setUserPreference(profileId, key, value, isEncrypted);
    }
    try {
      // Auto-detect encryption if not specified
      if (isEncrypted === null) {
        isEncrypted = this.ENCRYPTED_PREFERENCE_KEYS.includes(key);
      }

      const storedValue = isEncrypted && value ? encrypt(value) : value;

      await sql`
        INSERT INTO user_preferences (user_profile_id, preference_key, preference_value, is_encrypted)
        VALUES (${profileId}, ${key}, ${storedValue}, ${isEncrypted})
        ON CONFLICT (user_profile_id, preference_key)
        DO UPDATE SET
          preference_value = ${storedValue},
          is_encrypted = ${isEncrypted},
          updated_at = CURRENT_TIMESTAMP
      `;

      return true;
    } catch (error) {
      console.error('Set user preference error:', error.message);
      return false;
    }
  }

  /**
   * Set multiple user preferences at once
   * @param {number} profileId - Profile ID
   * @param {Object} preferences - Key-value pairs of preferences
   * @returns {boolean} Success
   */
  static async setUserPreferences(profileId, preferences) {
    if (useDataversePrefs()) {
      return getDataversePrefsService().setUserPreferences(profileId, preferences);
    }
    try {
      for (const [key, value] of Object.entries(preferences)) {
        if (value !== undefined) {
          await this.setUserPreference(profileId, key, value);
        }
      }
      return true;
    } catch (error) {
      console.error('Set user preferences error:', error.message);
      return false;
    }
  }

  /**
   * Delete a user preference
   * @param {number} profileId - Profile ID
   * @param {string} key - Preference key
   * @returns {boolean} Success
   */
  static async deleteUserPreference(profileId, key) {
    if (useDataversePrefs()) {
      return getDataversePrefsService().deleteUserPreference(profileId, key);
    }
    try {
      await sql`
        DELETE FROM user_preferences
        WHERE user_profile_id = ${profileId} AND preference_key = ${key}
      `;
      return true;
    } catch (error) {
      console.error('Delete user preference error:', error.message);
      return false;
    }
  }

  /**
   * Get a decrypted API key for a profile
   * @param {number} profileId - Profile ID
   * @param {string} key - Preference key (e.g., 'api_key_claude')
   * @returns {string|null} Decrypted API key or null
   */
  static async getDecryptedApiKey(profileId, key) {
    if (useDataversePrefs()) {
      return getDataversePrefsService().getDecryptedApiKey(profileId, key);
    }
    try {
      const result = await sql`
        SELECT preference_value, is_encrypted
        FROM user_preferences
        WHERE user_profile_id = ${profileId} AND preference_key = ${key}
      `;

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      if (row.is_encrypted) {
        return decrypt(row.preference_value);
      }
      return row.preference_value;
    } catch (error) {
      console.error('Get decrypted API key error:', error.message);
      return null;
    }
  }

  /**
   * Check if a profile has a specific preference set
   * @param {number} profileId - Profile ID
   * @param {string} key - Preference key
   * @returns {boolean} Whether the preference exists and has a value
   */
  static async hasPreference(profileId, key) {
    if (useDataversePrefs()) {
      return getDataversePrefsService().hasPreference(profileId, key);
    }
    try {
      const result = await sql`
        SELECT 1 FROM user_preferences
        WHERE user_profile_id = ${profileId}
          AND preference_key = ${key}
          AND preference_value IS NOT NULL
          AND preference_value != ''
      `;
      return result.rows.length > 0;
    } catch (error) {
      console.error('Has preference error:', error.message);
      return false;
    }
  }
}

module.exports = { DatabaseService };
