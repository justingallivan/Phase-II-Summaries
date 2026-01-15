/**
 * PDF Page Extraction Utility
 *
 * Uses pdf-lib to extract specific pages from PDF documents.
 * Designed for extracting summary pages from grant proposals.
 */

const { PDFDocument } = require('pdf-lib');

/**
 * Extract specific pages from a PDF buffer
 *
 * @param {Buffer|ArrayBuffer} pdfBuffer - The source PDF as a buffer
 * @param {string} pageSpec - Page specification (e.g., "2", "1,2", "2-4")
 * @returns {Promise<{buffer: Uint8Array, pageCount: number}>} Extracted PDF buffer and page count
 */
async function extractPages(pdfBuffer, pageSpec = '2') {
  // Load the source PDF
  const sourcePdf = await PDFDocument.load(pdfBuffer);
  const totalPages = sourcePdf.getPageCount();

  // Parse page specification
  const pageIndices = parsePageSpec(pageSpec, totalPages);

  if (pageIndices.length === 0) {
    throw new Error(`No valid pages found in specification "${pageSpec}" (PDF has ${totalPages} pages)`);
  }

  // Create a new PDF with the selected pages
  const extractedPdf = await PDFDocument.create();

  // Copy pages from source to new document
  const copiedPages = await extractedPdf.copyPages(sourcePdf, pageIndices);
  copiedPages.forEach(page => extractedPdf.addPage(page));

  // Serialize to buffer
  const buffer = await extractedPdf.save();

  return {
    buffer,
    pageCount: pageIndices.length,
    extractedPages: pageIndices.map(i => i + 1), // Convert back to 1-indexed for display
    totalSourcePages: totalPages
  };
}

/**
 * Parse a page specification string into array of 0-indexed page numbers
 *
 * Supports:
 * - Single page: "2" -> [1]
 * - Multiple pages: "1,2,5" -> [0, 1, 4]
 * - Range: "2-4" -> [1, 2, 3]
 * - Mixed: "1,3-5,7" -> [0, 2, 3, 4, 6]
 *
 * @param {string} spec - Page specification string (1-indexed)
 * @param {number} maxPages - Total pages in the document
 * @returns {number[]} Array of 0-indexed page numbers
 */
function parsePageSpec(spec, maxPages) {
  const pages = new Set();

  // Clean and split by comma
  const parts = spec.replace(/\s+/g, '').split(',');

  for (const part of parts) {
    if (part.includes('-')) {
      // Range: "2-4"
      const [start, end] = part.split('-').map(n => parseInt(n, 10));
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          if (i >= 1 && i <= maxPages) {
            pages.add(i - 1); // Convert to 0-indexed
          }
        }
      }
    } else {
      // Single page: "2"
      const pageNum = parseInt(part, 10);
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= maxPages) {
        pages.add(pageNum - 1); // Convert to 0-indexed
      }
    }
  }

  // Return sorted array
  return Array.from(pages).sort((a, b) => a - b);
}

/**
 * Get page count from a PDF buffer without full parsing
 *
 * @param {Buffer|ArrayBuffer} pdfBuffer - The PDF buffer
 * @returns {Promise<number>} Number of pages
 */
async function getPageCount(pdfBuffer) {
  const pdf = await PDFDocument.load(pdfBuffer);
  return pdf.getPageCount();
}

/**
 * Validate a page specification against a PDF
 *
 * @param {string} pageSpec - Page specification string
 * @param {number} totalPages - Total pages in the document
 * @returns {{valid: boolean, pages: number[], errors: string[]}}
 */
function validatePageSpec(pageSpec, totalPages) {
  const errors = [];
  const pages = [];

  if (!pageSpec || pageSpec.trim() === '') {
    errors.push('Page specification is empty');
    return { valid: false, pages, errors };
  }

  const parts = pageSpec.replace(/\s+/g, '').split(',');

  for (const part of parts) {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(n => parseInt(n, 10));
      if (isNaN(start) || isNaN(end)) {
        errors.push(`Invalid range: "${part}"`);
      } else if (start > end) {
        errors.push(`Invalid range: "${part}" (start > end)`);
      } else if (start < 1 || end > totalPages) {
        errors.push(`Range "${part}" out of bounds (document has ${totalPages} pages)`);
      } else {
        for (let i = start; i <= end; i++) {
          pages.push(i);
        }
      }
    } else {
      const pageNum = parseInt(part, 10);
      if (isNaN(pageNum)) {
        errors.push(`Invalid page number: "${part}"`);
      } else if (pageNum < 1 || pageNum > totalPages) {
        errors.push(`Page ${pageNum} out of bounds (document has ${totalPages} pages)`);
      } else {
        pages.push(pageNum);
      }
    }
  }

  return {
    valid: errors.length === 0,
    pages: [...new Set(pages)].sort((a, b) => a - b),
    errors
  };
}

module.exports = {
  extractPages,
  parsePageSpec,
  getPageCount,
  validatePageSpec
};
