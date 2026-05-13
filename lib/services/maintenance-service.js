/**
 * MaintenanceService - Database and blob cleanup operations
 *
 * Provides batch-delete for unbounded tables (api_usage_log, dynamics_query_log),
 * expired cache cleanup, orphaned blob cleanup, and audit trail for all runs.
 *
 * Retention periods are configurable via Dataverse `wmkf_appsystemsettings`
 * (read through the settings-service dispatcher).
 */

const { sql } = require('@vercel/postgres');
const { list, del } = require('@vercel/blob');
const DatabaseService = require('./database-service');
const { listSettings } = require('./settings-service');
const { DynamicsService } = require('./dynamics-service');
const { bypassDynamicsRestrictions } = require('./dynamics-context');

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
   * Collects all blob URLs referenced in Dataverse (post-W5 cutover):
   *   - `wmkf_appgrantcycle.wmkf_reviewtemplateurl` (cycle-level template)
   *   - `wmkf_appreviewersuggestion.wmkf_summarybloburl` (per-candidate summary)
   *   - `wmkf_appreviewersuggestion.wmkf_reviewbloburl` (legacy; retained
   *      for historical rows — Vercel Blob retired for review uploads
   *      2026-05-03 in favor of SharePoint, but historical URLs still
   *      live in this column and must not be reaped)
   *
   * Postgres `proposal_searches.full_proposal_blob_url` is intentionally
   * omitted — the table is empty (0 rows, dead writer) and is being
   * dropped during Wave 2 cleanup.
   *
   * @param {number} retentionDays - Only consider blobs older than this for deletion
   * @param {boolean} dryRun - If true, list what would be deleted without deleting
   * @returns {{ deleted: number, skipped: number, errors: number, details: string[] }}
   */
  static async cleanupBlobs(retentionDays = 90, dryRun = false) {
    const stats = { deleted: 0, skipped: 0, errors: 0, details: [] };

    try {
      // 1. Collect all blob URLs still referenced in Dataverse.
      // Read-only system maintenance — wrap in bypass so the restriction
      // context (which can be absent for cron-initiated calls) is satisfied.
      // Fail-closed on `capped` (queryAllRecords' 5000-row safety limit):
      // an undercount of active URLs becomes false-positive deletions,
      // which here is permanent data loss of summary PDFs / review files.
      const dvUrls = await bypassDynamicsRestrictions('maintenance-blob-scan', async () => {
        const [cycles, suggestions] = await Promise.all([
          DynamicsService.queryAllRecords('wmkf_appgrantcycles', {
            select: 'wmkf_reviewtemplateurl',
            filter: 'wmkf_reviewtemplateurl ne null',
          }),
          DynamicsService.queryAllRecords('wmkf_appreviewersuggestions', {
            select: 'wmkf_summarybloburl,wmkf_reviewbloburl',
            filter: 'wmkf_summarybloburl ne null or wmkf_reviewbloburl ne null',
          }),
        ]);

        if (cycles.capped || suggestions.capped) {
          throw new Error(
            `blob-scan refused: Dataverse query hit the 5000-row export cap ` +
            `(cycles.capped=${!!cycles.capped}, suggestions.capped=${!!suggestions.capped}). ` +
            `Continuing would silently undercount active URLs and risk reaping ` +
            `live files. Raise the cap or scope the scan before retrying.`
          );
        }

        const urls = new Set();
        for (const row of cycles.records) {
          if (row.wmkf_reviewtemplateurl) urls.add(row.wmkf_reviewtemplateurl);
        }
        for (const row of suggestions.records) {
          if (row.wmkf_summarybloburl) urls.add(row.wmkf_summarybloburl);
          if (row.wmkf_reviewbloburl) urls.add(row.wmkf_reviewbloburl);
        }
        return urls;
      });

      // Intake-portal drafts (still Postgres — `intake_drafts.attachments` is
      // JSONB of `{filename, blob_url, ...}`). The original Postgres scanner
      // never read this table; the new scanner closes that pre-existing gap
      // so cron can't reap an applicant's in-flight upload.
      const intakeRows = await sql`
        SELECT jsonb_array_elements(attachments)->>'blob_url' AS blob_url
        FROM intake_drafts
        WHERE attachments IS NOT NULL AND jsonb_array_length(attachments) > 0
      `;

      const activeUrls = new Set(dvUrls);
      for (const row of intakeRows.rows) {
        if (row.blob_url) activeUrls.add(row.blob_url);
      }

      stats.details.push(
        `Found ${activeUrls.size} active blob URLs ` +
        `(Dataverse: ${dvUrls.size}, intake_drafts: ${intakeRows.rows.length})`
      );

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
   * Read configurable retention periods from Dataverse `wmkf_appsystemsettings`
   * via the settings-service dispatcher. Falls back to defaults if not configured.
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
      const rows = await listSettings('retention:');
      for (const [settingKey, settingValue] of Object.entries(rows)) {
        const key = settingKey.replace('retention:', '');
        const value = parseInt(settingValue, 10);
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
