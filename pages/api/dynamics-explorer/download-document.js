/**
 * API Route: /api/dynamics-explorer/download-document
 *
 * Authenticated proxy for downloading SharePoint documents.
 * Fetches the file server-side via GraphService and streams it to the browser.
 *
 * GET /api/dynamics-explorer/download-document?library=...&folder=...&filename=...
 */

import { requireAppAccess } from '../../../lib/utils/auth';
import { GraphService } from '../../../lib/services/graph-service';

export const config = {
  api: {
    responseLimit: false, // Allow large file responses (7-10 MB PDFs)
  },
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const access = await requireAppAccess(req, res, 'dynamics-explorer');
  if (!access) return;

  const { library, folder, filename } = req.query;

  if (!library || !folder || !filename) {
    return res.status(400).json({ error: 'library, folder, and filename parameters are required' });
  }

  try {
    const { buffer, mimeType, filename: resolvedName, size } = await GraphService.downloadFileByPath(
      library,
      folder,
      filename
    );

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${resolvedName.replace(/"/g, '\\"')}"`);
    res.setHeader('Content-Length', size);
    res.setHeader('Cache-Control', 'private, max-age=300');

    res.send(buffer);
  } catch (error) {
    console.error('Document download error:', error.message);

    if (error.message.includes('not in the allowlist')) {
      return res.status(403).json({ error: 'Access to this document library is not permitted' });
    }
    if (error.message.includes('File not found') || error.message.includes('(404)')) {
      return res.status(404).json({ error: 'File not found' });
    }

    return res.status(502).json({ error: 'Failed to download document from SharePoint' });
  }
}
