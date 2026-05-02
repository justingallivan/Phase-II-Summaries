/**
 * GET /api/review-manager/download-review?suggestionId=...&filename=...
 *
 * Stream a completed review back to staff. Two storage backends coexist:
 *
 *   - SharePoint (Phase 5+): file lives in
 *     `akoya_request/{request}/Reviewer_Uploads/{reviewerSubfolder}/`,
 *     pointed at by `wmkf_reviewsharepointfolder`. Streamed via Graph as
 *     the foundation's app registration.
 *
 *   - Vercel Blob (legacy, pre-Phase-5): URL in `wmkf_reviewbloburl`.
 *     Public URL — we redirect rather than proxy. Eventually retired
 *     when the migration script runs.
 *
 * Caller passes `suggestionId`. Optional `filename` selects a specific
 * file when the upload included multiple; defaults to the primary
 * filename stored on the row (wmkf_reviewfilename).
 */

import { requireAppAccess } from '../../../lib/utils/auth';
import { DynamicsService } from '../../../lib/services/dynamics-service';
import { GraphService } from '../../../lib/services/graph-service';
import { bypassDynamicsRestrictions } from '../../../lib/services/dynamics-context';

const REVIEW_LIBRARY = 'akoya_request';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
  }

  const access = await requireAppAccess(req, res, 'review-manager');
  if (!access) return;

  const { suggestionId, filename: requestedFilename } = req.query;
  if (!suggestionId || typeof suggestionId !== 'string') {
    return res.status(400).json({ ok: false, reason: 'validation', errors: ['suggestionId required.'] });
  }

  try {
    let suggestion;
    try {
      suggestion = await bypassDynamicsRestrictions('download-review-lookup', () =>
        DynamicsService.getRecord('wmkf_appreviewersuggestions', suggestionId, {
          select: 'wmkf_appreviewersuggestionid,wmkf_reviewsharepointfolder,wmkf_reviewfilename,wmkf_reviewbloburl',
        }),
      );
    } catch (e) {
      if (/Get record failed \(404\)/.test(e.message || '')) {
        return res.status(404).json({ ok: false, reason: 'not_found' });
      }
      throw e;
    }

    const folder = suggestion?.wmkf_reviewsharepointfolder;
    const blobUrl = suggestion?.wmkf_reviewbloburl;
    const primaryFilename = suggestion?.wmkf_reviewfilename;

    // SharePoint path (preferred when set — reflects current upload core)
    if (folder) {
      const filename = requestedFilename || primaryFilename;
      if (!filename) {
        return res.status(404).json({ ok: false, reason: 'no_filename_on_row' });
      }
      const file = await GraphService.downloadFileByPath(REVIEW_LIBRARY, folder, filename);
      res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeFilename(file.filename)}"`,
      );
      res.setHeader('Content-Length', file.size);
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).send(file.buffer);
    }

    // Legacy Vercel Blob path. Public URL — redirect rather than proxy
    // bytes through our function. Coexists indefinitely until migration.
    if (blobUrl) {
      return res.redirect(302, blobUrl);
    }

    return res.status(404).json({ ok: false, reason: 'no_review_on_file' });
  } catch (e) {
    console.error('[download-review] error:', e);
    return res.status(500).json({
      ok: false,
      reason: 'server_error',
      details: process.env.NODE_ENV === 'development' ? e.message : undefined,
    });
  }
}

function encodeFilename(name) {
  return String(name || 'review').replace(/["\r\n]/g, '');
}

export const config = {
  api: { responseLimit: '60mb' },
};
