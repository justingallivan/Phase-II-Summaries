/**
 * MaintenanceService - Database and blob cleanup operations
 *
 * Provides batch-delete for unbounded tables (api_usage_log, dynamics_query_log),
 * expired cache cleanup, orphaned blob cleanup, and audit trail for all runs.
 *
 * Retention periods are configurable via system_settings table.
 */

const { sql } = require('@vercel/postgres');
const { list, del } = require('@vercel/blob');
const DatabaseService = require('./database-service');

class MaintenanceService {
  // ============================================
  // CLEANUP OPERATIONS
  // ============================================

  /**
   * Delete api_usage_log records older than retentionDays.
   * Uses batch delete to avoid long-running transactions.
   */
  static async cleanupUsageLog(retentionDays = 90) {
    try {
      const result = await sql`
        DELETE FROM api_usage_log
        WHERE created_at < NOW() - MAKE_INTERVAL(days => ${retentionDays})
      `;
      return result.rowCount || 0;
    } catch (error) {
      console.error('MaintenanceService.cleanupUsageLog error:', error.message);
      throw error;
    }
  }

  /**
   * Delete dynamics_query_log records older than retentionDays
   */
  static async cleanupQueryLog(retentionDays = 365) {
    try {
      const result = await sql`
        DELETE FROM dynamics_query_log
        WHERE created_at < NOW() - MAKE_INTERVAL(days => ${retentionDays})
      `;
      return result.rowCount || 0;
    } catch (error) {
      console.error('MaintenanceService.cleanupQueryLog error:', error.message);
      throw error;
    }
  }

  /**
   * Clean up expired search cache entries
   */
  static async cleanupExpiredCache() {
    try {
      return await DatabaseService.cleanupExpiredCache();
    } catch (error) {
      console.error('MaintenanceService.cleanupExpiredCache error:', error.message);
      throw error;
    }
  }

  /**
   * Clean up old health check history records
   */
  static async cleanupHealthHistory(retentionDays = 30) {
    try {
      const result = await sql`
        DELETE FROM health_check_history
        WHERE created_at < NOW() - MAKE_INTERVAL(days => ${retentionDays})
      `;
      return result.rowCount || 0;
    } catch (error) {
      console.error('MaintenanceService.cleanupHealthHistory error:', error.message);
      throw error;
    }
  }

  /**
   * Delete orphaned Vercel Blob files not referenced by any active record.
   *
   * Collects all blob URLs referenced in proposal_searches, grant_cycles,
   * and reviewer_suggestions, then compares against blob storage listing.
   * Old blobs not in the reference set are deleted.
   *
   * @param {number} retentionDays - Only consider blobs older than this for deletion
   * @param {boolean} dryRun - If true, list what would be deleted without deleting
   * @returns {{ deleted: number, skipped: number, errors: number, details: string[] }}
   */
  static async cleanupBlobs(retentionDays = 90, dryRun = false) {
    const stats = { deleted: 0, skipped: 0, errors: 0, details: [] };

    try {
      // 1. Collect all blob URLs still referenced in the database
      const [proposals, cycles, suggestions, reviews] = await Promise.all([
        sql`SELECT summary_blob_url, full_proposal_blob_url FROM proposal_searches
            WHERE summary_blob_url IS NOT NULL OR full_proposal_blob_url IS NOT NULL`,
        sql`SELECT review_template_blob_url FROM grant_cycles
            WHERE review_template_blob_url IS NOT NULL`,
        sql`SELECT summary_blob_url FROM reviewer_suggestions
            WHERE summary_blob_url IS NOT NULL`,
        sql`SELECT review_blob_url FROM reviewer_suggestions
            WHERE review_blob_url IS NOT NULL`,
      ]);

      const activeUrls = new Set();
      for (const row of proposals.rows) {
        if (row.summary_blob_url) activeUrls.add(row.summary_blob_url);
        if (row.full_proposal_blob_url) activeUrls.add(row.full_proposal_blob_url);
      }
      for (const row of cycles.rows) {
        if (row.review_template_blob_url) activeUrls.add(row.review_template_blob_url);
      }
      for (const row of suggestions.rows) {
        if (row.summary_blob_url) activeUrls.add(row.summary_blob_url);
      }
      for (const row of reviews.rows) {
        if (row.review_blob_url) activeUrls.add(row.review_blob_url);
      }

      stats.details.push(`Found ${activeUrls.size} active blob URLs in database`);

      // 2. List all blobs in storage
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      let cursor;
      let totalBlobs = 0;

      do {
        const listing = await list({ cursor, limit: 100 });
        cursor = listing.cursor;
        totalBlobs += listing.blobs.length;

        for (const blob of listing.blobs) {
          // Skip blobs newer than retention cutoff
          if (new Date(blob.uploadedAt) > cutoff) {
            stats.skipped++;
            continue;
          }

          // Skip blobs that are still referenced
          if (activeUrls.has(blob.url)) {
            stats.skipped++;
            continue;
          }

          // Delete orphaned blob
          if (dryRun) {
            stats.details.push(`Would delete: ${blob.pathname} (${blob.size} bytes, uploaded ${blob.uploadedAt})`);
            stats.deleted++;
          } else {
            try {
              await del(blob.url);
              stats.deleted++;
            } catch (delError) {
              stats.errors++;
              stats.details.push(`Delete failed: ${blob.pathname}: ${delError.message}`);
            }
          }
        }
      } while (cursor);

      stats.details.unshift(`Scanned ${totalBlobs} total blobs in storage`);
      if (dryRun) {
        stats.details.unshift('DRY RUN — no blobs were actually deleted');
      }

      return stats;
    } catch (error) {
      console.error('MaintenanceService.cleanupBlobs error:', error.message);
      stats.errors++;
      stats.details.push(`Fatal error: ${error.message}`);
      return stats;
    }
  }

  // ============================================
  // AUDIT TRAIL
  // ============================================

  /**
   * Record the start of a maintenance job
   * @returns {number} The run ID
   */
  static async startRun(jobName) {
    try {
      const result = await sql`
        INSERT INTO maintenance_runs (job_name, status)
        VALUES (${jobName}, 'running')
        RETURNING id
      `;
      return result.rows[0].id;
    } catch (error) {
      console.error('MaintenanceService.startRun error:', error.message);
      return null;
    }
  }

  /**
   * Complete a maintenance run with results
   */
  static async completeRun(runId, { status = 'completed', recordsProcessed = 0, recordsDeleted = 0, details, errorMessage } = {}) {
    if (!runId) return;
    try {
      await sql`
        UPDATE maintenance_runs
        SET status = ${status},
            records_processed = ${recordsProcessed},
            records_deleted = ${recordsDeleted},
            details = ${details ? JSON.stringify(details) : null},
            error_message = ${errorMessage || null},
            completed_at = CURRENT_TIMESTAMP,
            duration_ms = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at))::int * 1000
        WHERE id = ${runId}
      `;
    } catch (error) {
      console.error('MaintenanceService.completeRun error:', error.message);
    }
  }

  /**
   * Get the last run for each job
   */
  static async getLastRuns() {
    try {
      const result = await sql`
        SELECT DISTINCT ON (job_name)
          id, job_name, status, records_processed, records_deleted,
          details, error_message, started_at, completed_at, duration_ms
        FROM maintenance_runs
        ORDER BY job_name, started_at DESC
      `;
      return result.rows;
    } catch (error) {
      console.error('MaintenanceService.getLastRuns error:', error.message);
      return [];
    }
  }

  // ============================================
  // CONFIGURATION
  // ============================================

  /**
   * Read configurable retention periods from system_settings.
   * Falls back to defaults if not configured.
   */
  static async getRetentionConfig() {
    const defaults = {
      usage_log_days: 90,
      query_log_days: 365,
      blob_days: 90,
      health_history_days: 30,
      alert_days: 90,
    };

    try {
      const result = await sql`
        SELECT setting_key, setting_value
        FROM system_settings
        WHERE setting_key LIKE 'retention:%'
      `;

      for (const row of result.rows) {
        const key = row.setting_key.replace('retention:', '');
        const value = parseInt(row.setting_value, 10);
        if (!isNaN(value) && defaults.hasOwnProperty(key)) {
          defaults[key] = value;
        }
      }
    } catch (error) {
      console.error('MaintenanceService.getRetentionConfig error:', error.message);
    }

    return defaults;
  }
}

module.exports = MaintenanceService;
