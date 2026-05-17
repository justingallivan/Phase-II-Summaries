/**
 * Dataverse Power Tools — Track B — GET /api/dataverse-export/download
 *
 * The gated retrieval proxy for the PRIVATE export artifact (build plan §5;
 * Codex S160 P1 — a permanent public Blob URL is a real CRM-data exposure
 * gap). Two independent gates, both required:
 *   1. requireAppAccess('dataverse-bulk-export') — same app gate as the rest
 *      of the surface (auth + CSRF/origin + is_active).
 *   2. a short-lived signed `dvx-download` token (≈1h) binding the exact
 *      Blob pathname — minted only by a successful /run.
 *
 * Streams the private blob with Content-Disposition: attachment. This is NOT
 * the §12-rejected "second GET of an in-memory file" — Vercel Blob is
 * durable shared storage; the rejected pattern was an in-memory handoff
 * across serverless invocations.
 */

import { Readable } from 'stream';
import { get } from '@vercel/blob';
import { requireAppAccess } from '../../../lib/utils/auth';
import { verifyDownloadToken } from '../../../lib/services/dataverse-export/result-token';

export const config = { api: { externalResolver: true } };

export default async function handler(req, res) {
  const access = await requireAppAccess(req, res, 'dataverse-bulk-export');
  if (!access) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const verified = await verifyDownloadToken(req.query && req.query.t);
  if (!verified.valid) {
    return res.status(403).json({
      error: 'DOWNLOAD_TOKEN_INVALID',
      reason: verified.reason,
      message: 'This download link is invalid or has expired. Re-run the '
        + 'export to get a fresh link.',
    });
  }

  try {
    const result = await get(verified.pathname, { access: 'private', useCache: false });
    if (!result || !result.stream) {
      return res.status(404).json({
        error: 'ARTIFACT_NOT_FOUND',
        message: 'The export artifact no longer exists (expired/cleaned up). '
          + 'Re-run the export.',
      });
    }
    const meta = result.blob || {};
    res.setHeader('Content-Type', meta.contentType
      || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', meta.contentDisposition
      || `attachment; filename="${verified.pathname.split('/').pop()}"`);
    if (meta.size != null) res.setHeader('Content-Length', String(meta.size));
    res.setHeader('Cache-Control', 'private, no-store');

    // Web ReadableStream → Node response.
    Readable.fromWeb(result.stream).pipe(res);
  } catch (err) {
    console.error('[dataverse-export/download] failed:', err);
    return res.status(502).json({
      error: 'DOWNLOAD_FAILED',
      message: 'Could not retrieve the export artifact. Retry; if it '
        + 'persists, re-run the export.',
    });
  }
}
