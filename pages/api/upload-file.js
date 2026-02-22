/**
 * API Route: /api/upload-file
 *
 * Simple file upload endpoint that accepts multipart form data
 * and uploads directly to Vercel Blob storage.
 */

import { put } from '@vercel/blob';
import { requireAuth } from '../../lib/utils/auth';
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

  // Require authentication
  const session = await requireAuth(req, res);
  if (!session) return;

  try {
    // Parse multipart form data
    const { file, filename, contentType } = await parseFormData(req);

    if (!file || file.length === 0) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Upload to Vercel Blob
    const blob = await put(filename || `upload_${Date.now()}`, file, {
      access: 'public',
      contentType: contentType || 'application/octet-stream',
      addRandomSuffix: true,
    });

    return res.status(200).json({
      url: blob.url,
      filename: filename,
      size: file.length
    });

  } catch (error) {
    console.error('File upload error:', error);
    return res.status(500).json({
      error: 'Upload failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Parse multipart form data using busboy
 */
function parseFormData(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
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

    busboy.on('finish', () => {
      resolve({ file: fileData, filename: fileName, contentType: fileContentType });
    });

    busboy.on('error', reject);
    req.pipe(busboy);
  });
}
