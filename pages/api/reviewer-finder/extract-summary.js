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
import { requireAppAccess } from '../../../lib/utils/auth';
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

  // Require authentication + app access
  const access = await requireAppAccess(req, res, 'reviewer-finder');
  if (!access) return;

  try {
    // Parse multipart form data
    const { fields, fileData } = await parseFormData(req);

    const proposalId = fields.proposalId;
    const summaryPages = fields.summaryPages;

    if (!fileData) {
      return res.status(400).json({ error: 'No file provided' });
    }

    if (!proposalId) {
      return res.status(400).json({ error: 'proposalId is required' });
    }

    const pages = summaryPages || '2';

    // Extract the specified pages
    const extraction = await extractPages(fileData, pages);

    if (!extraction || !extraction.buffer) {
      return res.status(400).json({
        error: 'Failed to extract pages',
        message: 'Could not extract the specified pages from the PDF'
      });
    }

    // Upload to Vercel Blob
    const filename = `summary_${proposalId}_${Date.now()}.pdf`;
    const blob = await put(filename, Buffer.from(extraction.buffer), {
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
      pagesExtracted: extraction.extractedPages,
      pageCount: extraction.pageCount,
      message: `Extracted ${extraction.pageCount} page(s) from ${extraction.totalSourcePages}-page document`
    });

  } catch (error) {
    console.error('Extract summary error:', error);
    return res.status(500).json({
      error: 'Failed to extract summary',
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
    const fields = {};
    let fileData = null;

    busboy.on('file', (fieldname, file) => {
      const chunks = [];
      file.on('data', (chunk) => chunks.push(chunk));
      file.on('end', () => { fileData = Buffer.concat(chunks); });
    });

    busboy.on('field', (name, val) => { fields[name] = val; });

    busboy.on('finish', () => {
      resolve({ fields, fileData });
    });

    busboy.on('error', reject);
    req.pipe(busboy);
  });
}
