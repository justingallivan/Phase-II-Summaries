/**
 * API Route: /api/upload-file
 *
 * Simple file upload endpoint that accepts multipart form data
 * and uploads directly to Vercel Blob storage.
 */

import { put } from '@vercel/blob';
import { requireAuth } from '../../lib/utils/auth';
import Busboy from 'busboy';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB — matches upload-handler.js

const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpg',
  'image/jpeg',
]);

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

    // Enforce mime-type allowlist
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return res.status(415).json({
        error: `File type "${contentType}" is not allowed. Accepted types: PDF, Word, plain text, and images.`
      });
    }

    // Upload to Vercel Blob
    const blob = await put(filename || `upload_${Date.now()}`, file, {
      access: 'public',
      contentType: contentType || 'application/octet-stream',
      addRandomSuffix: true,
    });

    console.log(`File uploaded by ${session.user?.email || 'unknown'}: ${filename} (${file.length} bytes)`);

    return res.status(200).json({
      url: blob.url,
      filename: filename,
      size: file.length
    });

  } catch (error) {
    if (error?.code === 'FILE_TOO_LARGE') {
      return res.status(413).json({
        error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`
      });
    }
    console.error('File upload error:', error);
    return res.status(500).json({
      error: 'Upload failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Parse multipart form data using busboy.
 *
 * Enforces MAX_FILE_SIZE at the stream level via Busboy's `limits.fileSize`.
 * When the limit fires, the file stream emits 'limit' and we abort the parse
 * — the request body is never fully buffered into memory. Without this, a
 * 1GB upload would be entirely buffered before the post-parse size check
 * could reject it. (Security pass 2026-04-26.)
 */
function parseFormData(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers, limits: { fileSize: MAX_FILE_SIZE, files: 1 } });
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
        file.resume(); // drain the rest so busboy emits 'finish' / 'error'
        const err = new Error('FILE_TOO_LARGE');
        err.code = 'FILE_TOO_LARGE';
        reject(err);
      });
      file.on('end', () => {
        if (!aborted) fileData = Buffer.concat(chunks);
      });
    });

    busboy.on('finish', () => {
      if (aborted) return;
      resolve({ file: fileData, filename: fileName, contentType: fileContentType });
    });

    busboy.on('error', reject);
    req.pipe(busboy);
  });
}
