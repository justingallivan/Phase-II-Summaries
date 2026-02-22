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
import { requireAuthWithProfile } from '../../../lib/utils/auth';
import Busboy from 'busboy';

export const config = {
  api: {
    bodyParser: false, // busboy needs the raw stream
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const profileId = await requireAuthWithProfile(req, res);
  if (profileId === null) return;

  try {
    // Parse multipart form data
    const { fields, fileData, fileName, fileContentType } = await parseFormData(req);

    const suggestionId = fields.suggestionId;

    if (!suggestionId) {
      return res.status(400).json({ error: 'suggestionId is required' });
    }
    if (!fileData || !fileName) {
      return res.status(400).json({ error: 'file is required' });
    }

    // Verify the suggestion exists, is accepted, and belongs to the caller
    const existing = await sql`
      SELECT id, proposal_id, proposal_title FROM reviewer_suggestions
      WHERE id = ${parseInt(suggestionId, 10)} AND accepted = true
        AND user_profile_id = ${profileId}
    `;
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Reviewer suggestion not found or not authorized' });
    }

    // Upload to Vercel Blob
    const blobPath = `reviews/${existing.rows[0].proposal_id}/${suggestionId}_${fileName}`;

    const blob = await put(blobPath, fileData, {
      access: 'public',
      contentType: fileContentType || 'application/octet-stream',
    });

    // Update the reviewer_suggestions row (ownership already verified above)
    await sql`
      UPDATE reviewer_suggestions
      SET
        review_blob_url = ${blob.url},
        review_filename = ${fileName},
        review_received_at = NOW(),
        review_status = 'review_received'
      WHERE id = ${parseInt(suggestionId, 10)}
        AND user_profile_id = ${profileId}
    `;

    return res.status(200).json({
      success: true,
      message: 'Review uploaded successfully',
      blobUrl: blob.url,
      filename: fileName,
    });
  } catch (error) {
    console.error('Review upload error:', error);
    return res.status(500).json({ error: 'Failed to upload review', details: process.env.NODE_ENV === 'development' ? error.message : undefined, timestamp: new Date().toISOString() });
  }
}

/**
 * Parse multipart form data using busboy
 */
function parseFormData(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    const fields = {};
    let fileData = null;
    let fileName = null;
    let fileContentType = null;

    busboy.on('file', (fieldname, file, info) => {
      const chunks = [];
      fileName = info.filename;
      fileContentType = info.mimeType;
      file.on('data', (chunk) => chunks.push(chunk));
      file.on('end', () => { fileData = Buffer.concat(chunks); });
    });

    busboy.on('field', (name, val) => { fields[name] = val; });

    busboy.on('finish', () => {
      resolve({ fields, fileData, fileName, fileContentType });
    });

    busboy.on('error', reject);
    req.pipe(busboy);
  });
}
