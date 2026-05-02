/**
 * Tests for the shared review-upload core. Mocks GraphService and
 * DynamicsService to exercise the orchestration logic without touching
 * the network.
 *
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { GraphService } from '../../lib/services/graph-service.js';
import { DynamicsService } from '../../lib/services/dynamics-service.js';
import { writeReviewFiles, buildReviewerSubfolder } from '../../lib/services/review-upload.js';

// Replace specific methods with jest.fn() before each test, restore afterwards.
const originals = {};
function installMocks() {
  for (const [obj, names] of [
    [GraphService, ['getDriveId', 'uploadFile', 'deleteFile']],
    [DynamicsService, ['getRecord', 'updateRecord']],
  ]) {
    for (const name of names) {
      if (originals[name] === undefined) originals[name] = obj[name];
      obj[name] = jest.fn();
    }
  }
}
function restoreMocks() {
  for (const [obj, names] of [
    [GraphService, ['getDriveId', 'uploadFile', 'deleteFile']],
    [DynamicsService, ['getRecord', 'updateRecord']],
  ]) {
    for (const name of names) {
      if (originals[name] !== undefined) obj[name] = originals[name];
    }
  }
}
afterAll(() => restoreMocks());

const PDF_BYTES = Buffer.concat([
  Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]),
  Buffer.alloc(50, 0x20),
]);
const SUGGESTION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const REQUEST_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const REQUEST_NUMBER = '1001289';
// First 8 chars of suggestion GUID (no hyphens) → 'aaaaaaaa'.
// With no reviewer name in the mocked row, sanitizer falls back to short-id-only.
const EXPECTED_FOLDER = `${REQUEST_NUMBER}_${REQUEST_ID.replace(/-/g, '').toUpperCase()}/Reviewer_Uploads/aaaaaaaa`;

function validInput(overrides = {}) {
  return {
    suggestionId: SUGGESTION_ID,
    files: [{ filename: 'review.pdf', buffer: PDF_BYTES }],
    structuredData: {
      affiliation: 'Prof X, U of Example',
      impact: 3,
      risk: 2,
      overallRating: 4,
    },
    opts: { source: 'reviewer_self_token', performedBy: null },
    ...overrides,
  };
}

function mockSuggestionFound() {
  DynamicsService.getRecord.mockResolvedValue({
    wmkf_appreviewersuggestionid: SUGGESTION_ID,
    _wmkf_request_value: REQUEST_ID,
    wmkf_Request: { akoya_requestid: REQUEST_ID, akoya_requestnum: REQUEST_NUMBER },
  });
}

function mockSuggestionNotFound() {
  const err = new Error('Not found');
  err.status = 404;
  DynamicsService.getRecord.mockRejectedValue(err);
}

beforeEach(() => {
  installMocks();
  GraphService.getDriveId.mockResolvedValue('drive-id-123');
  GraphService.uploadFile.mockResolvedValue({
    id: 'item-1', name: 'review.pdf', size: PDF_BYTES.length, webUrl: 'https://example/x',
  });
  GraphService.deleteFile.mockResolvedValue(undefined);
  DynamicsService.updateRecord.mockResolvedValue(undefined);
});

describe('writeReviewFiles — argument validation', () => {
  test('rejects missing suggestionId', async () => {
    const r = await writeReviewFiles(validInput({ suggestionId: '' }));
    expect(r).toEqual({ ok: false, reason: 'validation', errors: ['suggestionId required'] });
  });

  test('rejects empty files array', async () => {
    const r = await writeReviewFiles(validInput({ files: [] }));
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual(['at least one file required']);
  });

  test('rejects more than 5 files', async () => {
    const f = { filename: 'review.pdf', buffer: PDF_BYTES };
    const r = await writeReviewFiles(validInput({ files: [f, f, f, f, f, f] }));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/max 5/);
  });

  test('rejects unknown source', async () => {
    const r = await writeReviewFiles(validInput({ opts: { source: 'sneaky' } }));
    expect(r.ok).toBe(false);
  });
});

describe('writeReviewFiles — file validation', () => {
  test('rejects empty file', async () => {
    const r = await writeReviewFiles(validInput({
      files: [{ filename: 'review.pdf', buffer: Buffer.alloc(0) }],
    }));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/empty/);
  });

  test('rejects oversized file', async () => {
    // 26 MB of PDF magic + zeros
    const big = Buffer.concat([Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]), Buffer.alloc(26 * 1024 * 1024)]);
    const r = await writeReviewFiles(validInput({
      files: [{ filename: 'review.pdf', buffer: big }],
    }));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/exceeds/);
  });

  test('rejects file whose magic bytes lie about the extension', async () => {
    const r = await writeReviewFiles(validInput({
      files: [{ filename: 'review.pdf', buffer: Buffer.from('not a pdf') }],
    }));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/PDF/);
  });
});

describe('writeReviewFiles — structured-data validation', () => {
  test('rejects missing affiliation', async () => {
    const r = await writeReviewFiles(validInput({
      structuredData: { impact: 3, risk: 2, overallRating: 4 },
    }));
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => /Organization/.test(e))).toBe(true);
  });

  test('rejects out-of-range picklist', async () => {
    const r = await writeReviewFiles(validInput({
      structuredData: { affiliation: 'X', impact: 99, risk: 99, overallRating: 17 },
    }));
    expect(r.ok).toBe(false);
  });
});

describe('writeReviewFiles — happy paths', () => {
  test('reviewer self-serve: writes to SharePoint, PATCHes Dataverse', async () => {
    mockSuggestionFound();
    const r = await writeReviewFiles(validInput());
    expect(r.ok).toBe(true);
    expect(r.folder).toBe(EXPECTED_FOLDER);
    expect(GraphService.uploadFile).toHaveBeenCalledWith(
      'akoya_request',
      EXPECTED_FOLDER,
      'review.pdf',
      PDF_BYTES,
      'application/pdf',
    );
    const patchArgs = DynamicsService.updateRecord.mock.calls[0];
    expect(patchArgs[0]).toBe('wmkf_appreviewersuggestions');
    expect(patchArgs[1]).toBe(SUGGESTION_ID);
    expect(patchArgs[2]).toMatchObject({
      wmkf_revieweraffiliation: 'Prof X, U of Example',
      wmkf_reviewerimpact: 3,
      wmkf_reviewerrisk: 2,
      wmkf_revieweroverallrating: 4,
      wmkf_reviewsharepointfolder: EXPECTED_FOLDER,
      wmkf_reviewfilename: 'review.pdf',
      wmkf_reviewuploadedbystaff: false,
    });
    expect(patchArgs[2].wmkf_reviewreceivedat).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('staff source: sets wmkf_reviewuploadedbystaff = true', async () => {
    mockSuggestionFound();
    const r = await writeReviewFiles(validInput({
      opts: { source: 'staff_upload', performedBy: 42 },
    }));
    expect(r.ok).toBe(true);
    expect(DynamicsService.updateRecord.mock.calls[0][2].wmkf_reviewuploadedbystaff).toBe(true);
  });

  test('multi-file upload writes each file in order', async () => {
    mockSuggestionFound();
    GraphService.uploadFile
      .mockResolvedValueOnce({ id: 'item-1', name: 'a.pdf', size: 50, webUrl: 'x' })
      .mockResolvedValueOnce({ id: 'item-2', name: 'b.pdf', size: 50, webUrl: 'y' });
    const r = await writeReviewFiles(validInput({
      files: [
        { filename: 'a.pdf', buffer: PDF_BYTES },
        { filename: 'b.pdf', buffer: PDF_BYTES },
      ],
    }));
    expect(r.ok).toBe(true);
    expect(GraphService.uploadFile).toHaveBeenCalledTimes(2);
    expect(r.files).toHaveLength(2);
    // primary filename = first file
    expect(DynamicsService.updateRecord.mock.calls[0][2].wmkf_reviewfilename).toBe('a.pdf');
  });
});

describe('writeReviewFiles — failure paths', () => {
  test('returns not_found when suggestion does not exist', async () => {
    mockSuggestionNotFound();
    const r = await writeReviewFiles(validInput());
    expect(r).toEqual({ ok: false, reason: 'not_found' });
    expect(GraphService.uploadFile).not.toHaveBeenCalled();
  });

  test('returns not_found when expanded request is missing', async () => {
    DynamicsService.getRecord.mockResolvedValue({ wmkf_appreviewersuggestionid: SUGGESTION_ID });
    const r = await writeReviewFiles(validInput());
    expect(r.reason).toBe('not_found');
  });

  test('SharePoint failure mid-upload triggers cleanup of prior items', async () => {
    mockSuggestionFound();
    GraphService.uploadFile
      .mockResolvedValueOnce({ id: 'item-1', name: 'a.pdf', size: 50, webUrl: 'x' })
      .mockRejectedValueOnce(new Error('SharePoint 503'));
    const r = await writeReviewFiles(validInput({
      files: [
        { filename: 'a.pdf', buffer: PDF_BYTES },
        { filename: 'b.pdf', buffer: PDF_BYTES },
      ],
    }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('sharepoint_failed');
    expect(r.partial).toEqual(['a.pdf']);
    expect(GraphService.deleteFile).toHaveBeenCalledWith('drive-id-123', 'item-1');
    expect(DynamicsService.updateRecord).not.toHaveBeenCalled();
  });

  test('Dataverse PATCH failure triggers SharePoint rollback', async () => {
    mockSuggestionFound();
    GraphService.uploadFile.mockResolvedValue({ id: 'item-1', name: 'review.pdf', size: 50, webUrl: 'x' });
    DynamicsService.updateRecord.mockRejectedValue(new Error('Dataverse 500'));
    const r = await writeReviewFiles(validInput());
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('dataverse_failed');
    expect(r.cleanedUp).toBe(true);
    expect(GraphService.deleteFile).toHaveBeenCalledWith('drive-id-123', 'item-1');
  });

  test('Dataverse failure + cleanup failure flags cleanedUp=false', async () => {
    mockSuggestionFound();
    GraphService.uploadFile.mockResolvedValue({ id: 'item-1', name: 'review.pdf', size: 50, webUrl: 'x' });
    DynamicsService.updateRecord.mockRejectedValue(new Error('Dataverse 500'));
    GraphService.deleteFile.mockRejectedValue(new Error('SharePoint cleanup 500'));
    // Suppress the expected console.error during this test
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const r = await writeReviewFiles(validInput());
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('dataverse_failed');
    expect(r.cleanedUp).toBe(false);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('buildReviewerSubfolder', () => {
  const SID = '7f3a9c2e-1234-5678-9abc-def012345678';
  // First 8 chars of the GUID with hyphens stripped: '7f3a9c2e'

  test('produces {LastName}_{shortId} for a normal name', () => {
    expect(buildReviewerSubfolder(SID, { wmkf_lastname: 'Patel' })).toBe('Patel_7f3a9c2e');
  });

  test('falls back to last word of full name when lastname is empty', () => {
    expect(buildReviewerSubfolder(SID, { wmkf_name: 'Dr. Anika Patel' })).toBe('Patel_7f3a9c2e');
  });

  test('strips diacritical marks via NFD normalization', () => {
    expect(buildReviewerSubfolder(SID, { wmkf_lastname: 'José' })).toBe('Jose_7f3a9c2e');
    expect(buildReviewerSubfolder(SID, { wmkf_lastname: 'Müller' })).toBe('Muller_7f3a9c2e');
  });

  test('strips punctuation, spaces, apostrophes', () => {
    expect(buildReviewerSubfolder(SID, { wmkf_lastname: "O'Brien" })).toBe('OBrien_7f3a9c2e');
    expect(buildReviewerSubfolder(SID, { wmkf_lastname: 'van der Berg' })).toBe('vanderBerg_7f3a9c2e');
    expect(buildReviewerSubfolder(SID, { wmkf_lastname: 'Smith-Jones' })).toBe('SmithJones_7f3a9c2e');
  });

  test('truncates very long names', () => {
    const longName = 'A'.repeat(50);
    const folder = buildReviewerSubfolder(SID, { wmkf_lastname: longName });
    expect(folder).toBe('A'.repeat(30) + '_7f3a9c2e');
  });

  test('falls back to short-id-only when sanitization produces empty', () => {
    // CJK-only name: NFD doesn't fold to ASCII, sanitizer strips it to empty.
    expect(buildReviewerSubfolder(SID, { wmkf_lastname: '李四' })).toBe('7f3a9c2e');
    // No reviewer at all
    expect(buildReviewerSubfolder(SID, null)).toBe('7f3a9c2e');
    // Reviewer with empty fields
    expect(buildReviewerSubfolder(SID, { wmkf_lastname: '', wmkf_name: '' })).toBe('7f3a9c2e');
  });

  test('strips honorifics from full name fallback', () => {
    expect(buildReviewerSubfolder(SID, { wmkf_name: 'Prof. Patel' })).toBe('Patel_7f3a9c2e');
    expect(buildReviewerSubfolder(SID, { wmkf_name: 'Professor Anika Patel' })).toBe('Patel_7f3a9c2e');
  });
});
