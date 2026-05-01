/**
 * Review Manager - Upload Review Document (Dataverse-backed)
 *
 * POST /api/review-manager/upload-review
 *
 * Accepts a multipart upload of a completed review document. The blob still
 * lives in Vercel Blob; the metadata (URL, filename, received timestamp,
 * status='review_received') goes onto the Dataverse suggestion via
 * `suggestionAdapter.updateLifecycle`.
 *
 * suggestionId is now a Dataverse GUID (string).
 */

import { put } from '@vercel/blob';
import { requireAppAccess } from '../../../lib/utils/auth';
import { DynamicsService } from '../../../lib/services/dynamics-service';
import { bypassDynamicsRestrictions } from '../../../lib/services/dynamics-context';
import * as suggestionAdapter from '../../../lib/dataverse/adapters/reviewer-suggestion';
import Busboy from 'busboy';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export const config = {
  api: {
    bodyParser: false, // busboy needs the raw stream
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const access = await requireAppAccess(req, res, 'review-manager');
  if (!access) return;

  return bypassDynamicsRestrictions('review-manager-upload', async () => {
  try {
    const { fields, fileData, fileName, fileContentType } = await parseFormData(req);

    const suggestionId = fields.suggestionId;
    if (!suggestionId) {
      return res.status(400).json({ error: 'suggestionId is required' });
    }
    if (!fileData || !fileName) {
      return res.status(400).json({ error: 'file is required' });
    }

    // Verify suggestion exists + is accepted before accepting the upload.
    const sug = await suggestionAdapter.findById(suggestionId);
    if (!sug || !sug.wmkf_accepted) {
      return res.status(404).json({ error: 'Reviewer suggestion not found or not accepted' });
    }

    // Use the request GUID as the blob folder so multiple reviewers' uploads
    // for the same proposal are co-located.
    const requestId = sug._wmkf_request_value || 'unknown';
    const blobPath = `reviews/${requestId}/${suggestionId}_${fileName}`;

    const blob = await put(blobPath, fileData, {
      access: 'public',
      contentType: fileContentType || 'application/octet-stream',
    });

    await suggestionAdapter.updateLifecycle(suggestionId, {
      reviewBlobUrl: blob.url,
      reviewFilename: fileName,
      reviewReceivedAt: new Date().toISOString(),
      reviewStatus: 'review_received',
    });

    return res.status(200).json({
      success: true,
      message: 'Review uploaded successfully',
      blobUrl: blob.url,
      filename: fileName,
    });
  } catch (error) {
    if (error?.code === 'FILE_TOO_LARGE') {
      return res.status(413).json({
        error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
      });
    }
    console.error('Review upload error:', error);
    return res.status(500).json({
      error: 'Failed to upload review',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString(),
    });
  }
  });
}

function parseFormData(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers, limits: { fileSize: MAX_FILE_SIZE, files: 1 } });
    const fields = {};
    let fileData = null;
    let fileName = null;
    let fileContentType = null;
    let aborted = false;

    busboy.on('file', (fieldname, file, info) => {
      const chunks = [];
      fileName = info.filename;
      fileContentType = info.mimeType;
      file.on('data', (chunk) => chunks.push(chunk));
      file.on('limit', () => {
        aborted = true;
        file.resume();
        const err = new Error('FILE_TOO_LARGE');
        err.code = 'FILE_TOO_LARGE';
        reject(err);
      });
      file.on('end', () => {
        if (!aborted) fileData = Buffer.concat(chunks);
      });
    });

    busboy.on('field', (name, val) => { fields[name] = val; });

    busboy.on('finish', () => {
      if (aborted) return;
      resolve({ fields, fileData, fileName, fileContentType });
    });

    busboy.on('error', reject);
    req.pipe(busboy);
  });
}
