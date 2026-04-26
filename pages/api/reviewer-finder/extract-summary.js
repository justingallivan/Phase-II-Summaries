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

    // IDOR guard: confirm the proposal belongs to the caller before letting
    // the upload write to it. The previous implementation accepted any
    // proposalId and updated all matching reviewer_suggestions rows, allowing
    // one reviewer-finder user to clobber another user's saved candidates.
    // (Security pass 2026-04-26.)
    const callerProfileId = access.profileId;
    const ownership = await sql`
      SELECT 1
      FROM proposal_searches
      WHERE id = ${proposalId} AND user_profile_id = ${callerProfileId}
      LIMIT 1
    `;
    if (ownership.rowCount === 0) {
      return res.status(403).json({ error: 'Proposal not found or not owned by caller' });
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
    if (error?.code === 'FILE_TOO_LARGE') {
      return res.status(413).json({
        error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`
      });
    }
    console.error('Extract summary error:', error);
    return res.status(500).json({
      error: 'Failed to extract summary',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Parse multipart form data using busboy with stream-level size limit.
 * (Security pass 2026-04-26: aborts before fully buffering oversized uploads.)
 */
function parseFormData(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers, limits: { fileSize: MAX_FILE_SIZE, files: 1 } });
    const fields = {};
    let fileData = null;
    let aborted = false;

    busboy.on('file', (fieldname, file) => {
      const chunks = [];
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
      resolve({ fields, fileData });
    });

    busboy.on('error', reject);
    req.pipe(busboy);
  });
}
