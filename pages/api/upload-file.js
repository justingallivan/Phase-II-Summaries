/**
 * API Route: /api/upload-file
 *
 * Simple file upload endpoint that accepts multipart form data
 * and uploads directly to Vercel Blob storage.
 */

import { put } from '@vercel/blob';

export const config = {
  api: {
    bodyParser: false, // Handle multipart form data manually
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
      message: error.message
    });
  }
}

/**
 * Parse multipart form data from request
 */
async function parseFormData(req) {
  const contentType = req.headers['content-type'] || '';

  if (!contentType.includes('multipart/form-data')) {
    throw new Error('Content-Type must be multipart/form-data');
  }

  // Get boundary from content-type header
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    throw new Error('No boundary found in Content-Type');
  }
  const boundary = boundaryMatch[1] || boundaryMatch[2];

  // Read the entire body
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);

  // Parse multipart data
  const parts = parseMultipartBuffer(buffer, boundary);

  const result = {
    file: null,
    filename: null,
    contentType: null
  };

  for (const part of parts) {
    if (part.name === 'file' && part.data.length > 0) {
      result.file = part.data;
      result.filename = part.filename;
      result.contentType = part.contentType;
    }
  }

  return result;
}

/**
 * Parse multipart buffer into parts
 */
function parseMultipartBuffer(buffer, boundary) {
  const parts = [];
  const boundaryBuffer = Buffer.from(`--${boundary}`);

  let start = 0;
  let pos = 0;

  while (pos < buffer.length) {
    const boundaryIndex = buffer.indexOf(boundaryBuffer, pos);
    if (boundaryIndex === -1) break;

    if (start > 0 && boundaryIndex > start) {
      // Parse the part between boundaries
      const partData = buffer.slice(start, boundaryIndex - 2); // -2 for CRLF before boundary
      const part = parseMultipartPart(partData);
      if (part) {
        parts.push(part);
      }
    }

    // Check for end boundary
    const afterBoundary = buffer.slice(boundaryIndex + boundaryBuffer.length, boundaryIndex + boundaryBuffer.length + 2);
    if (afterBoundary.toString() === '--') {
      break;
    }

    start = boundaryIndex + boundaryBuffer.length + 2; // +2 for CRLF after boundary
    pos = start;
  }

  return parts;
}

/**
 * Parse a single multipart part
 */
function parseMultipartPart(buffer) {
  // Find the header/body separator (double CRLF)
  const headerEnd = buffer.indexOf('\r\n\r\n');
  if (headerEnd === -1) return null;

  const headerStr = buffer.slice(0, headerEnd).toString('utf-8');
  const data = buffer.slice(headerEnd + 4);

  // Parse Content-Disposition header
  const nameMatch = headerStr.match(/name="([^"]+)"/);
  const filenameMatch = headerStr.match(/filename="([^"]+)"/);
  const contentTypeMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);

  const name = nameMatch ? nameMatch[1] : null;
  const filename = filenameMatch ? filenameMatch[1] : null;
  const contentType = contentTypeMatch ? contentTypeMatch[1].trim() : null;

  if (!name) return null;

  return { name, filename, contentType, data };
}
