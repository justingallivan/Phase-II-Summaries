/**
 * API Route: /api/reviewer-finder/extract-summary
 *
 * Extracts summary page(s) from a proposal PDF and updates the database.
 * Used for re-extracting when summary page settings change.
 *
 * POST body (multipart/form-data):
 * - file: PDF file to extract from
 * - proposalId: ID of the proposal to update
 * - summaryPages: Page specification (e.g., "2" or "1,2")
 */

import { put } from '@vercel/blob';
import { sql } from '@vercel/postgres';
import { extractPages } from '../../../lib/utils/pdf-extractor';

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
    const { file, proposalId, summaryPages } = await parseFormData(req);

    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    if (!proposalId) {
      return res.status(400).json({ error: 'proposalId is required' });
    }

    const pages = summaryPages || '2';

    // Extract the specified pages
    const extractedPdf = await extractPages(file, pages);

    if (!extractedPdf) {
      return res.status(400).json({
        error: 'Failed to extract pages',
        message: 'Could not extract the specified pages from the PDF'
      });
    }

    // Upload to Vercel Blob
    const filename = `summary_${proposalId}_${Date.now()}.pdf`;
    const blob = await put(filename, extractedPdf, {
      access: 'public',
      contentType: 'application/pdf'
    });

    // Update all reviewer_suggestions for this proposal with the new summary URL
    await sql`
      UPDATE reviewer_suggestions
      SET summary_blob_url = ${blob.url}
      WHERE proposal_id = ${proposalId}
    `;

    return res.status(200).json({
      success: true,
      summaryBlobUrl: blob.url,
      pagesExtracted: pages,
      message: 'Summary extracted and saved successfully'
    });

  } catch (error) {
    console.error('Extract summary error:', error);
    return res.status(500).json({
      error: 'Failed to extract summary',
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
    proposalId: null,
    summaryPages: null
  };

  for (const part of parts) {
    if (part.name === 'file' && part.data.length > 0) {
      result.file = part.data;
    } else if (part.name === 'proposalId') {
      result.proposalId = part.data.toString('utf-8').trim();
    } else if (part.name === 'summaryPages') {
      result.summaryPages = part.data.toString('utf-8').trim();
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
  const endBoundaryBuffer = Buffer.from(`--${boundary}--`);

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
    if (buffer.indexOf(endBoundaryBuffer, boundaryIndex) === boundaryIndex) {
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
  const name = nameMatch ? nameMatch[1] : null;

  if (!name) return null;

  return { name, data };
}
