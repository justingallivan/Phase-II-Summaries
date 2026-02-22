/**
 * Review Manager - Upload Review Document
 *
 * POST /api/review-manager/upload-review
 *
 * Accepts a multipart form upload of a completed review document.
 * Stores the file in Vercel Blob and updates the reviewer_suggestions row.
 */

import { put } from '@vercel/blob';
import { sql } from '@vercel/postgres';
import { requireAuth } from '../../../lib/utils/auth';
import { BASE_CONFIG } from '../../../shared/config/baseConfig';

export const config = {
  api: {
    bodyParser: false, // We handle the raw body for file upload
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireAuth(req, res);
  if (!session) return;

  try {
    // Parse multipart form data manually using Web API
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'Content-Type must be multipart/form-data' });
    }

    // Collect the raw body
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Parse the boundary from content-type header
    const boundary = contentType.split('boundary=')[1];
    if (!boundary) {
      return res.status(400).json({ error: 'Missing boundary in Content-Type' });
    }

    // Parse multipart form data
    const parts = parseMultipart(buffer, boundary);

    const suggestionId = parts.find(p => p.name === 'suggestionId')?.value;
    const filePart = parts.find(p => p.name === 'file' && p.filename);

    if (!suggestionId) {
      return res.status(400).json({ error: 'suggestionId is required' });
    }
    if (!filePart) {
      return res.status(400).json({ error: 'file is required' });
    }

    // Verify the suggestion exists and is accepted
    const existing = await sql`
      SELECT id, proposal_id, proposal_title FROM reviewer_suggestions
      WHERE id = ${parseInt(suggestionId, 10)} AND accepted = true
    `;
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Reviewer suggestion not found or not accepted' });
    }

    // Upload to Vercel Blob
    const filename = filePart.filename;
    const blobPath = `reviews/${existing.rows[0].proposal_id}/${suggestionId}_${filename}`;

    const blob = await put(blobPath, filePart.data, {
      access: 'public',
      contentType: filePart.contentType || 'application/octet-stream',
    });

    // Update the reviewer_suggestions row
    await sql`
      UPDATE reviewer_suggestions
      SET
        review_blob_url = ${blob.url},
        review_filename = ${filename},
        review_received_at = NOW(),
        review_status = 'review_received'
      WHERE id = ${parseInt(suggestionId, 10)}
    `;

    return res.status(200).json({
      success: true,
      message: 'Review uploaded successfully',
      blobUrl: blob.url,
      filename,
    });
  } catch (error) {
    console.error('Review upload error:', error);
    return res.status(500).json({ error: 'Failed to upload review', details: process.env.NODE_ENV === 'development' ? error.message : undefined, timestamp: new Date().toISOString() });
  }
}

/**
 * Simple multipart form data parser
 */
function parseMultipart(buffer, boundary) {
  const parts = [];
  const boundaryStr = `--${boundary}`;
  const endBoundaryStr = `--${boundary}--`;

  // Convert buffer to string for header parsing, keep binary for file data
  const text = buffer.toString('latin1');
  const segments = text.split(boundaryStr);

  for (const segment of segments) {
    if (!segment || segment.trim() === '' || segment.trim() === '--') continue;
    if (segment.startsWith('--')) continue;

    // Find the blank line separating headers from body
    const headerEnd = segment.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;

    const headerText = segment.substring(0, headerEnd);
    const bodyText = segment.substring(headerEnd + 4);

    // Remove trailing \r\n
    const body = bodyText.endsWith('\r\n')
      ? bodyText.substring(0, bodyText.length - 2)
      : bodyText;

    // Parse Content-Disposition
    const dispositionMatch = headerText.match(/Content-Disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]+)")?/i);
    if (!dispositionMatch) continue;

    const name = dispositionMatch[1];
    const filename = dispositionMatch[2];

    // Parse Content-Type if present
    const ctMatch = headerText.match(/Content-Type:\s*(.+)/i);
    const contentType = ctMatch ? ctMatch[1].trim() : null;

    if (filename) {
      // Binary file data — extract from original buffer
      const headerEndInBuffer = buffer.indexOf(Buffer.from('\r\n\r\n', 'latin1'), buffer.indexOf(Buffer.from(headerText.substring(0, 40), 'latin1')));
      const segmentStart = buffer.indexOf(Buffer.from(boundaryStr, 'latin1'));

      // Re-extract binary data from buffer using offsets
      const data = Buffer.from(body, 'latin1');
      parts.push({ name, filename, contentType, data });
    } else {
      parts.push({ name, value: body.toString() });
    }
  }

  return parts;
}
