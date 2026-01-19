/**
 * DatabaseService - Handles all database operations for Expert Reviewers Pro
 *
 * Features:
 * - Search result caching (6-month expiry)
 * - Researcher profile management (deduplication)
 * - Publication tracking
 * - Keyword/expertise associations
 * - Reviewer suggestion history
 */

const { sql } = require('@vercel/postgres');
const crypto = require('crypto');
const { encrypt, decrypt, maskValue } = require('../utils/encryption');

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

  // ============================================
  // RESEARCHER OPERATIONS
  // ============================================

  /**
   * Normalize a name for matching purposes
   */
  static normalizeName(name) {
    if (!name) return '';
    return name
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Find a researcher by normalized name
   */
  static async findResearcher(name) {
    try {
      const normalized = this.normalizeName(name);

      const result = await sql`
        SELECT * FROM researchers
        WHERE normalized_name = ${normalized}
        LIMIT 1
      `;

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        id: row.id,
        name: row.name,
        normalizedName: row.normalized_name,
        primaryAffiliation: row.primary_affiliation,
        department: row.department,
        email: row.email,
        website: row.website,
        orcid: row.orcid,
        googleScholarId: row.google_scholar_id,
        hIndex: row.h_index,
        i10Index: row.i10_index,
        totalCitations: row.total_citations,
      };
    } catch (error) {
      console.error('Find researcher error:', error.message);
      return null;
    }
  }

  /**
   * Create or update a researcher profile
   */
  static async createOrUpdateResearcher(researcher) {
    try {
      const existing = await this.findResearcher(researcher.name);

      // Truncate fields to fit database column limits
      const truncatedAffiliation = researcher.primaryAffiliation?.substring(0, 500) || null;
      const truncatedDepartment = researcher.department?.substring(0, 255) || null;
      const truncatedEmail = researcher.email?.substring(0, 255) || null;
      const truncatedWebsite = researcher.website?.substring(0, 500) || null;

      if (existing) {
        // Update existing researcher
        await sql`
          UPDATE researchers SET
            primary_affiliation = COALESCE(${truncatedAffiliation}, primary_affiliation),
            department = COALESCE(${truncatedDepartment}, department),
            email = COALESCE(${truncatedEmail}, email),
            website = COALESCE(${truncatedWebsite}, website),
            orcid = COALESCE(${researcher.orcid}, orcid),
            google_scholar_id = COALESCE(${researcher.googleScholarId}, google_scholar_id),
            h_index = GREATEST(COALESCE(${researcher.hIndex}, 0), COALESCE(h_index, 0)),
            i10_index = GREATEST(COALESCE(${researcher.i10Index}, 0), COALESCE(i10_index, 0)),
            total_citations = GREATEST(COALESCE(${researcher.totalCitations}, 0), COALESCE(total_citations, 0)),
            last_updated = CURRENT_TIMESTAMP
          WHERE id = ${existing.id}
        `;
        return existing.id;
      } else {
        // Create new researcher
        const result = await sql`
          INSERT INTO researchers (
            name, normalized_name, primary_affiliation, department,
            email, website, orcid, google_scholar_id,
            h_index, i10_index, total_citations
          )
          VALUES (
            ${researcher.name},
            ${researcher.normalizedName || this.normalizeName(researcher.name)},
            ${truncatedAffiliation},
            ${truncatedDepartment},
            ${truncatedEmail},
            ${truncatedWebsite},
            ${researcher.orcid || null},
            ${researcher.googleScholarId || null},
            ${researcher.hIndex || null},
            ${researcher.i10Index || null},
            ${researcher.totalCitations || null}
          )
          RETURNING id
        `;
        return result.rows[0].id;
      }
    } catch (error) {
      console.error('Create/update researcher error:', error.message);
      return null;
    }
  }

  /**
   * Get researchers by keywords
   */
  static async getResearchersByKeywords(keywords) {
    try {
      const result = await sql`
        SELECT DISTINCT r.*
        FROM researchers r
        JOIN researcher_keywords rk ON r.id = rk.researcher_id
        WHERE rk.keyword = ANY(${keywords})
        ORDER BY r.h_index DESC NULLS LAST
        LIMIT 100
      `;

      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        normalizedName: row.normalized_name,
        primaryAffiliation: row.primary_affiliation,
        department: row.department,
        email: row.email,
        website: row.website,
        orcid: row.orcid,
        googleScholarId: row.google_scholar_id,
        hIndex: row.h_index,
        i10Index: row.i10_index,
        totalCitations: row.total_citations,
      }));
    } catch (error) {
      console.error('Get researchers by keywords error:', error.message);
      return [];
    }
  }

  // ============================================
  // PUBLICATION OPERATIONS
  // ============================================

  /**
   * Add a publication for a researcher
   */
  static async addPublication(publication) {
    try {
      // Handle publicationDate - can be Date object or string
      let pubDate = null;
      if (publication.publicationDate) {
        if (publication.publicationDate instanceof Date) {
          pubDate = publication.publicationDate.toISOString().split('T')[0];
        } else if (typeof publication.publicationDate === 'string') {
          pubDate = publication.publicationDate.split('T')[0];
        }
      }

      await sql`
        INSERT INTO publications (
          researcher_id, title, authors, author_position,
          publication_date, year, journal, doi, pmid, arxiv_id,
          citations, abstract, source
        )
        VALUES (
          ${publication.researcherId},
          ${publication.title},
          ${publication.authors || []},
          ${publication.authorPosition || null},
          ${pubDate},
          ${publication.year || null},
          ${publication.journal || null},
          ${publication.doi || null},
          ${publication.pmid || null},
          ${publication.arxivId || null},
          ${publication.citations || 0},
          ${publication.abstract || null},
          ${publication.source}
        )
        ON CONFLICT (doi) DO NOTHING
      `;
    } catch (error) {
      // Ignore duplicate errors
      if (!error.message?.includes('duplicate')) {
        console.error('Add publication error:', error.message);
      }
    }
  }

  /**
   * Get recent publications for a researcher
   */
  static async getRecentPublications(researcherId, limit = 10) {
    try {
      const result = await sql`
        SELECT * FROM publications
        WHERE researcher_id = ${researcherId}
        ORDER BY publication_date DESC NULLS LAST
        LIMIT ${limit}
      `;

      return result.rows.map(row => ({
        researcherId: row.researcher_id,
        title: row.title,
        authors: row.authors,
        authorPosition: row.author_position,
        publicationDate: row.publication_date ? new Date(row.publication_date) : null,
        year: row.year,
        journal: row.journal,
        doi: row.doi,
        pmid: row.pmid,
        arxivId: row.arxiv_id,
        citations: row.citations,
        abstract: row.abstract,
        source: row.source,
      }));
    } catch (error) {
      console.error('Get publications error:', error.message);
      return [];
    }
  }

  // ============================================
  // KEYWORD OPERATIONS
  // ============================================

  /**
   * Add keywords for a researcher
   */
  static async addKeywords(researcherId, keywords, source = 'publications') {
    try {
      for (const keyword of keywords) {
        if (keyword && keyword.trim()) {
          await sql`
            INSERT INTO researcher_keywords (researcher_id, keyword, source)
            VALUES (${researcherId}, ${keyword.toLowerCase().trim()}, ${source})
            ON CONFLICT (researcher_id, keyword, source) DO NOTHING
          `;
        }
      }
    } catch (error) {
      console.error('Add keywords error:', error.message);
    }
  }

  /**
   * Add a single keyword with relevance score (upserts, keeping max relevance)
   */
  static async addKeywordWithRelevance(researcherId, keyword, relevanceScore = 1.0, source = 'publications') {
    try {
      if (!keyword || !keyword.trim()) return;

      const cleanKeyword = keyword.toLowerCase().trim().substring(0, 255);

      await sql`
        INSERT INTO researcher_keywords (researcher_id, keyword, relevance_score, source)
        VALUES (${researcherId}, ${cleanKeyword}, ${relevanceScore}, ${source})
        ON CONFLICT (researcher_id, keyword, source)
        DO UPDATE SET
          relevance_score = GREATEST(researcher_keywords.relevance_score, ${relevanceScore})
      `;
    } catch (error) {
      console.error('Add keyword with relevance error:', error.message);
    }
  }

  /**
   * Get all keywords for a researcher
   */
  static async getKeywordsForResearcher(researcherId) {
    try {
      const result = await sql`
        SELECT keyword, relevance_score, source
        FROM researcher_keywords
        WHERE researcher_id = ${researcherId}
        ORDER BY relevance_score DESC, keyword ASC
      `;

      return result.rows.map(row => ({
        keyword: row.keyword,
        relevanceScore: row.relevance_score,
        source: row.source
      }));
    } catch (error) {
      console.error('Get keywords for researcher error:', error.message);
      return [];
    }
  }

  /**
   * Get all unique keywords in the database with counts (for filter dropdown)
   */
  static async getAllKeywords(limit = 200) {
    try {
      const result = await sql`
        SELECT keyword, COUNT(DISTINCT researcher_id) as researcher_count
        FROM researcher_keywords
        GROUP BY keyword
        ORDER BY researcher_count DESC, keyword ASC
        LIMIT ${limit}
      `;

      return result.rows.map(row => ({
        keyword: row.keyword,
        count: parseInt(row.researcher_count)
      }));
    } catch (error) {
      console.error('Get all keywords error:', error.message);
      return [];
    }
  }

  // ============================================
  // REVIEWER SUGGESTION OPERATIONS
  // ============================================

  /**
   * Record a reviewer suggestion for a proposal
   */
  static async recordSuggestion(proposalId, proposalTitle, researcherId, relevanceScore, matchReason, sources) {
    try {
      await sql`
        INSERT INTO reviewer_suggestions (
          proposal_id, proposal_title, researcher_id,
          relevance_score, match_reason, sources
        )
        VALUES (
          ${proposalId},
          ${proposalTitle},
          ${researcherId},
          ${relevanceScore},
          ${matchReason},
          ${sources}
        )
        ON CONFLICT (proposal_id, researcher_id)
        DO UPDATE SET
          relevance_score = ${relevanceScore},
          match_reason = ${matchReason},
          sources = ${sources},
          suggested_at = CURRENT_TIMESTAMP
      `;
    } catch (error) {
      console.error('Record suggestion error:', error.message);
    }
  }

  /**
   * Get all suggestions for a proposal
   */
  static async getSuggestionsForProposal(proposalId) {
    try {
      const result = await sql`
        SELECT
          rs.*,
          r.name, r.email, r.website, r.primary_affiliation,
          r.h_index, r.total_citations
        FROM reviewer_suggestions rs
        JOIN researchers r ON rs.researcher_id = r.id
        WHERE rs.proposal_id = ${proposalId}
        ORDER BY rs.relevance_score DESC
      `;

      return result.rows;
    } catch (error) {
      console.error('Get suggestions error:', error.message);
      return [];
    }
  }

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
        needsLinking: row.needs_linking
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
        needsLinking: row.needs_linking
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
