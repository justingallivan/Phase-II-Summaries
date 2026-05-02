/**
 * Shared review-upload core. Used by both the external (token-authenticated)
 * and staff (session-authenticated) endpoints. The two endpoints differ only
 * in how they identify the suggestion (token payload vs. request body) and
 * what `source` they tag — the actual file-handling and Dataverse writes are
 * one code path so the two flows can never drift.
 *
 * Behavior:
 *   1. Read the suggestion + expanded request to derive the SharePoint folder
 *      pattern (`{requestNumber}_{guidNoHyphensUpper}`).
 *   2. Validate all files (extension, magic bytes, per-file size, count).
 *   3. Validate structured form data against `reviewFormSchema`.
 *   4. Upload each file to SharePoint at `akoya_request/{request}/Reviews/{suggestionId}/`.
 *      Track item ids as we go so we can roll back if a later step fails.
 *   5. PATCH the suggestion row with the new field values (folder, primary
 *      filename, received-at, picklists, affiliation, staff flag).
 *
 * On failure after the first SharePoint write, attempt best-effort cleanup
 * of the files we just wrote. If cleanup itself fails, log loudly — staff
 * may need to remove orphan files manually.
 */

import { DynamicsService } from './dynamics-service.js';
import { GraphService } from './graph-service.js';
import { validateReviewForm } from '../external/review-form-schema.js';
import { validateReviewFile } from '../utils/file-magic.js';

const REVIEW_LIBRARY = 'akoya_request';
const MAX_FILES = 5;
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB per file

const MIME_BY_EXT = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
};

/**
 * Write review files to SharePoint and update the suggestion row.
 *
 * @param {Object} args
 * @param {string} args.suggestionId - GUID of the wmkf_appreviewersuggestion row
 * @param {Array<{ filename: string, buffer: Buffer }>} args.files - 1..MAX_FILES files
 * @param {Object} args.structuredData - Raw form values keyed by `field.key`
 * @param {Object} args.opts
 * @param {'reviewer_self_token'|'staff_upload'} args.opts.source
 * @param {string|null} [args.opts.performedBy] - Profile id (staff endpoint) or null (token endpoint)
 * @returns {Promise<{ ok: true, folder: string, files: Array<{ name, id, webUrl, size }>, dataverseValues: Object }
 *                  | { ok: false, reason: 'validation', errors: string[] }
 *                  | { ok: false, reason: 'not_found' }
 *                  | { ok: false, reason: 'sharepoint_failed', error: string, partial?: Array }
 *                  | { ok: false, reason: 'dataverse_failed', error: string, cleanedUp: boolean }>}
 */
export async function writeReviewFiles({ suggestionId, files, structuredData, opts }) {
  // ── 1. Argument shape ─────────────────────────────────────────────────
  if (!suggestionId || typeof suggestionId !== 'string') {
    return { ok: false, reason: 'validation', errors: ['suggestionId required'] };
  }
  if (!Array.isArray(files) || files.length === 0) {
    return { ok: false, reason: 'validation', errors: ['at least one file required'] };
  }
  if (files.length > MAX_FILES) {
    return { ok: false, reason: 'validation', errors: [`max ${MAX_FILES} files per upload`] };
  }
  if (!opts || (opts.source !== 'reviewer_self_token' && opts.source !== 'staff_upload')) {
    return { ok: false, reason: 'validation', errors: ['opts.source must be reviewer_self_token or staff_upload'] };
  }

  // ── 2. File validation (size + magic bytes) ───────────────────────────
  const fileErrors = [];
  for (const [idx, f] of files.entries()) {
    if (!f || typeof f.filename !== 'string' || !Buffer.isBuffer(f.buffer)) {
      fileErrors.push(`file[${idx}]: must have filename (string) and buffer (Buffer)`);
      continue;
    }
    if (f.buffer.length === 0) {
      fileErrors.push(`${f.filename}: empty file`);
      continue;
    }
    if (f.buffer.length > MAX_FILE_BYTES) {
      fileErrors.push(`${f.filename}: exceeds ${MAX_FILE_BYTES} bytes`);
      continue;
    }
    const v = validateReviewFile(f.filename, f.buffer);
    if (!v.ok) {
      fileErrors.push(`${f.filename}: ${v.reason}`);
    } else {
      f._type = v.type;
    }
  }
  if (fileErrors.length > 0) {
    return { ok: false, reason: 'validation', errors: fileErrors };
  }

  // ── 3. Structured data validation ─────────────────────────────────────
  const formResult = validateReviewForm(structuredData);
  if (!formResult.ok) {
    return { ok: false, reason: 'validation', errors: formResult.errors };
  }

  // ── 4. Resolve the request folder name ────────────────────────────────
  let suggestion;
  try {
    suggestion = await DynamicsService.getRecord(
      'wmkf_appreviewersuggestions',
      suggestionId,
      {
        select: 'wmkf_appreviewersuggestionid,_wmkf_request_value',
        expand:
          'wmkf_Request($select=akoya_requestid,akoya_requestnum),' +
          'wmkf_PotentialReviewer($select=wmkf_lastname,wmkf_name)',
      },
    );
  } catch (e) {
    if (e.status === 404) return { ok: false, reason: 'not_found' };
    throw e;
  }

  const request = suggestion?.wmkf_Request;
  if (!request?.akoya_requestid || !request?.akoya_requestnum) {
    return { ok: false, reason: 'not_found' };
  }

  const requestFolder = `${request.akoya_requestnum}_${request.akoya_requestid.replace(/-/g, '').toUpperCase()}`;
  const reviewerSubfolder = buildReviewerSubfolder(suggestionId, suggestion?.wmkf_PotentialReviewer);
  const reviewsFolder = `${requestFolder}/Reviewer_Uploads/${reviewerSubfolder}`;

  // ── 5. Upload files to SharePoint, tracking for rollback ──────────────
  const uploaded = [];
  let driveId;
  try {
    driveId = await GraphService.getDriveId(REVIEW_LIBRARY);
    for (const f of files) {
      const contentType = MIME_BY_EXT[f._type] || 'application/octet-stream';
      const item = await GraphService.uploadFile(
        REVIEW_LIBRARY,
        reviewsFolder,
        f.filename,
        f.buffer,
        contentType,
      );
      uploaded.push(item);
    }
  } catch (e) {
    // Best-effort cleanup of anything already uploaded
    await cleanupSharePointItems(driveId, uploaded);
    return {
      ok: false,
      reason: 'sharepoint_failed',
      error: e.message,
      partial: uploaded.map(u => u.name),
    };
  }

  // ── 6. PATCH the Dataverse row ────────────────────────────────────────
  const primaryFilename = files[0].filename;
  const dvPatch = {
    ...formResult.dataverseValues,
    wmkf_reviewsharepointfolder: reviewsFolder,
    wmkf_reviewfilename: primaryFilename,
    wmkf_reviewreceivedat: new Date().toISOString(),
    wmkf_reviewuploadedbystaff: opts.source === 'staff_upload',
  };

  try {
    await DynamicsService.updateRecord('wmkf_appreviewersuggestions', suggestionId, dvPatch);
  } catch (e) {
    // Roll back the SharePoint writes — we don't want orphan files when the
    // canonical pointer record never got updated.
    const cleanedUp = await cleanupSharePointItems(driveId, uploaded);
    return {
      ok: false,
      reason: 'dataverse_failed',
      error: e.message,
      cleanedUp,
    };
  }

  return {
    ok: true,
    folder: reviewsFolder,
    files: uploaded,
    dataverseValues: dvPatch,
  };
}

/**
 * Build the per-reviewer subfolder name for a SharePoint upload path.
 *
 * Format: `{sanitizedLastName}_{shortId}` where shortId is the first
 * 8 chars of the suggestion GUID. Falls back to `{shortId}` only when
 * the lastname sanitizes to an empty string (e.g. CJK-only names with
 * no ASCII fold).
 *
 * Why human-readable: lets staff browse SharePoint and identify whose
 * review is whose without cross-referencing Dataverse. Automation
 * doesn't depend on the format — `wmkf_reviewsharepointfolder` on the
 * row is the canonical pointer, and reviewer identity always comes
 * from the joined `wmkf_potentialreviewer` row, never from parsing
 * folder names.
 *
 * The subfolder name is computed once at first upload and frozen on the
 * row. Replacing files reuses the same folder. Renames to the source
 * row (e.g., reviewer's name corrected later) do not propagate to
 * SharePoint.
 *
 * Sanitization recipe:
 *   1. Pull lastname (or last word of full name if lastname unset)
 *   2. NFD normalize, drop combining marks (`José` → `Jose`)
 *   3. Strip everything not [A-Za-z0-9]
 *   4. Truncate to 30 chars
 *   5. If empty, fall back to short-id-only
 *   6. Append `_` + first 8 chars of suggestion GUID
 *
 * @param {string} suggestionId
 * @param {Object|null} reviewer - expanded wmkf_PotentialReviewer row,
 *   or null. Reads `wmkf_lastname` first, falls back to last word of
 *   `wmkf_name`.
 * @returns {string}
 */
export function buildReviewerSubfolder(suggestionId, reviewer) {
  const shortId = String(suggestionId || '').replace(/-/g, '').slice(0, 8);
  const rawLast = (reviewer?.wmkf_lastname && reviewer.wmkf_lastname.trim())
    || lastWordOf(reviewer?.wmkf_name)
    || '';
  const sanitized = rawLast
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 30);
  return sanitized ? `${sanitized}_${shortId}` : shortId;
}

function lastWordOf(name) {
  if (!name || typeof name !== 'string') return '';
  const cleaned = name.trim().replace(/^(dr\.?|prof\.?|professor)\s+/i, '');
  const parts = cleaned.split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || '';
}

async function cleanupSharePointItems(driveId, items) {
  if (!driveId || items.length === 0) return true;
  let allOk = true;
  for (const item of items) {
    try {
      await GraphService.deleteFile(driveId, item.id);
    } catch (e) {
      allOk = false;
      console.error(`[review-upload] cleanup failed for ${item.name} (${item.id}): ${e.message}`);
    }
  }
  return allOk;
}
