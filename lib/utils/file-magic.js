/**
 * Magic-byte sniffing for review-upload validation.
 *
 * The file extension and the browser-supplied Content-Type can both be lied
 * about — checking the file's actual leading bytes is a cheap defense against
 * an attacker uploading a renamed `.exe` as `.pdf`. Note this is not a virus
 * scanner; SharePoint's M365 Defender pipeline handles malware downstream.
 *
 * Supported types are the three the review form accepts:
 *   - PDF      — '%PDF-'           (0x25 50 44 46 2D)
 *   - DOCX     — ZIP signature     (0x50 4B 03 04) — DOCX is OOXML in a zip
 *   - DOC      — OLE2 compound     (0xD0 CF 11 E0 A1 B1 1A E1) — legacy Word
 */

const MAGIC = {
  pdf: [0x25, 0x50, 0x44, 0x46, 0x2d],
  // ZIP file. DOCX is OOXML inside a ZIP; we can't cheaply distinguish from
  // generic .zip without unzipping, so callers should also gate on extension.
  zip: [0x50, 0x4b, 0x03, 0x04],
  // OLE2/CFBF compound document — used by legacy .doc / .xls / .ppt.
  ole2: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
};

function startsWith(buf, magic) {
  if (buf.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (buf[i] !== magic[i]) return false;
  }
  return true;
}

/**
 * Identify a file's likely type by inspecting its leading bytes.
 *
 * @param {Buffer} buf
 * @returns {'pdf' | 'docx' | 'doc' | 'unknown'}
 *   'docx' is best-effort — the magic is a generic ZIP signature; combine
 *   with a `.docx` extension check for confidence.
 */
export function sniffFileType(buf) {
  if (!Buffer.isBuffer(buf)) {
    throw new Error('sniffFileType: buf must be a Buffer');
  }
  if (startsWith(buf, MAGIC.pdf)) return 'pdf';
  if (startsWith(buf, MAGIC.ole2)) return 'doc';
  if (startsWith(buf, MAGIC.zip)) return 'docx'; // tentative; gate on extension
  return 'unknown';
}

/**
 * Validate that a file's bytes match its declared extension.
 *
 * @param {string} filename
 * @param {Buffer} buf
 * @returns {{ ok: true, type: 'pdf'|'docx'|'doc' } | { ok: false, reason: string }}
 */
export function validateReviewFile(filename, buf) {
  if (typeof filename !== 'string' || !filename) {
    return { ok: false, reason: 'filename required' };
  }
  const ext = filename.toLowerCase().match(/\.(pdf|docx|doc)$/);
  if (!ext) {
    return { ok: false, reason: 'unsupported extension; allowed: .pdf, .docx, .doc' };
  }
  const sniffed = sniffFileType(buf);
  const declared = ext[1];

  if (declared === 'pdf' && sniffed !== 'pdf') {
    return { ok: false, reason: 'file does not look like a PDF (magic bytes mismatch)' };
  }
  if (declared === 'docx' && sniffed !== 'docx') {
    return { ok: false, reason: 'file does not look like a DOCX (expected ZIP signature)' };
  }
  if (declared === 'doc' && sniffed !== 'doc') {
    return { ok: false, reason: 'file does not look like a DOC (expected OLE2 signature)' };
  }
  return { ok: true, type: declared };
}
