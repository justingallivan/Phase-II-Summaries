/**
 * Tests for the file magic-byte sniffing utility.
 *
 * @jest-environment node
 */

import { sniffFileType, validateReviewFile } from '../../lib/utils/file-magic.js';

const PDF_BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const ZIP_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
const OLE2_BYTES = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);
const TXT_BYTES = Buffer.from('hello world', 'utf-8');

describe('sniffFileType', () => {
  test('detects PDF', () => {
    expect(sniffFileType(PDF_BYTES)).toBe('pdf');
  });

  test('detects DOCX (ZIP signature)', () => {
    expect(sniffFileType(ZIP_BYTES)).toBe('docx');
  });

  test('detects DOC (OLE2)', () => {
    expect(sniffFileType(OLE2_BYTES)).toBe('doc');
  });

  test('returns unknown for plain text', () => {
    expect(sniffFileType(TXT_BYTES)).toBe('unknown');
  });

  test('returns unknown for short input', () => {
    expect(sniffFileType(Buffer.from([0x25]))).toBe('unknown');
  });

  test('throws on non-Buffer input', () => {
    expect(() => sniffFileType('not a buffer')).toThrow();
  });
});

describe('validateReviewFile', () => {
  test('passes for matching pdf extension + bytes', () => {
    const r = validateReviewFile('review.pdf', PDF_BYTES);
    expect(r).toEqual({ ok: true, type: 'pdf' });
  });

  test('passes for matching docx extension + bytes', () => {
    const r = validateReviewFile('review.docx', ZIP_BYTES);
    expect(r).toEqual({ ok: true, type: 'docx' });
  });

  test('passes for matching doc extension + bytes', () => {
    const r = validateReviewFile('review.doc', OLE2_BYTES);
    expect(r).toEqual({ ok: true, type: 'doc' });
  });

  test('case-insensitive on extension', () => {
    const r = validateReviewFile('REVIEW.PDF', PDF_BYTES);
    expect(r.ok).toBe(true);
  });

  test('rejects unsupported extension', () => {
    const r = validateReviewFile('review.exe', PDF_BYTES);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/unsupported extension/);
  });

  test('rejects pdf-named file with non-pdf bytes', () => {
    const r = validateReviewFile('malicious.pdf', TXT_BYTES);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/PDF/);
  });

  test('rejects docx-named file with non-zip bytes', () => {
    const r = validateReviewFile('malicious.docx', PDF_BYTES);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/DOCX/);
  });

  test('rejects doc-named file with non-ole2 bytes', () => {
    const r = validateReviewFile('malicious.doc', PDF_BYTES);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/DOC/);
  });

  test('rejects empty filename', () => {
    expect(validateReviewFile('', PDF_BYTES).ok).toBe(false);
  });
});
