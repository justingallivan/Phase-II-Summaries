/**
 * API Route: /api/blob-proxy
 *
 * Authenticated proxy for Vercel Blob URLs. Prevents direct client access
 * to public blob storage URLs by requiring authentication.
 *
 * GET /api/blob-proxy?url={encoded-blob-url}
 */

import { requireAuth } from '../../lib/utils/auth';

// Valid Vercel Blob hostname pattern
const BLOB_HOST_PATTERN = /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require authentication
  const session = await requireAuth(req, res);
  if (!session) return;

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'url parameter is required' });
  }

  // Validate the URL is a legitimate Vercel Blob URL
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  if (parsedUrl.protocol !== 'https:' || !BLOB_HOST_PATTERN.test(parsedUrl.hostname)) {
    return res.status(400).json({ error: 'URL is not a valid Vercel Blob URL' });
  }

  try {
    const blobResponse = await fetch(url);

    if (!blobResponse.ok) {
      return res.status(blobResponse.status).json({
        error: `Blob fetch failed: ${blobResponse.statusText}`
      });
    }

    // Forward content headers
    const contentType = blobResponse.headers.get('content-type');
    const contentDisposition = blobResponse.headers.get('content-disposition');
    const contentLength = blobResponse.headers.get('content-length');

    if (contentType) res.setHeader('Content-Type', contentType);
    if (contentDisposition) res.setHeader('Content-Disposition', contentDisposition);
    if (contentLength) res.setHeader('Content-Length', contentLength);

    // Cache for 5 minutes (authenticated users only)
    res.setHeader('Cache-Control', 'private, max-age=300');

    // Stream the response body
    const buffer = await blobResponse.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Blob proxy error:', error);
    return res.status(502).json({ error: 'Failed to fetch blob content' });
  }
}
