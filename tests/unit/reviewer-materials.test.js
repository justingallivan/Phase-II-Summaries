/**
 * Tests for the Reviewer_Materials folder-policy matcher.
 *
 * The match rule is security-relevant: the file-list and file-download
 * endpoints both use it as the *only* gate between SharePoint contents
 * and the external reviewer's eyes. A regression here could leak staff-
 * only briefs, applicant admin paperwork, or other reviewers' uploads.
 *
 * @jest-environment node
 */

import { isReviewerMaterial, getReviewerMaterialFolders } from '../../lib/external/reviewer-materials.js';

describe('isReviewerMaterial', () => {
  let originalEnv;
  beforeEach(() => {
    originalEnv = process.env.REVIEWER_MATERIALS_FOLDERS;
    delete process.env.REVIEWER_MATERIALS_FOLDERS;
  });
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.REVIEWER_MATERIALS_FOLDERS;
    else process.env.REVIEWER_MATERIALS_FOLDERS = originalEnv;
  });

  describe('default policy (Reviewer_Materials)', () => {
    test('matches the canonical folder at the request root', () => {
      expect(isReviewerMaterial('1002379_GUID/Reviewer_Materials')).toBe(true);
      expect(isReviewerMaterial('1002379_GUID/Reviewer_Materials/Project Narrative.pdf')).toBe(true);
    });

    test('matches when the folder is at any depth', () => {
      expect(isReviewerMaterial('Reviewer_Materials/file.pdf')).toBe(true);
      expect(isReviewerMaterial('a/b/Reviewer_Materials/c/d/file.pdf')).toBe(true);
    });

    test('matches case-insensitively', () => {
      expect(isReviewerMaterial('1002379_GUID/reviewer_materials/file.pdf')).toBe(true);
      expect(isReviewerMaterial('1002379_GUID/REVIEWER_MATERIALS/file.pdf')).toBe(true);
    });

    test('rejects sibling folders that contain the substring', () => {
      // Critical: a folder named `My_Reviewer_Materials_v2` must not match
      // — that's what segment anchoring is for.
      expect(isReviewerMaterial('1002379_GUID/My_Reviewer_Materials_v2')).toBe(false);
      expect(isReviewerMaterial('Reviewer_Materials_Old')).toBe(false);
      expect(isReviewerMaterial('XReviewer_Materials')).toBe(false);
    });

    test('rejects unrelated folders that the proposal directory holds', () => {
      // These are real top-level files from a sample request — none of
      // them should be visible to a reviewer.
      expect(isReviewerMaterial('1002379_GUID')).toBe(false);
      expect(isReviewerMaterial('1002379_GUID/Phase II')).toBe(false);
      expect(isReviewerMaterial('1002379_GUID/Reviews/abc')).toBe(false);
    });

    test('rejects empty / null / non-string input', () => {
      expect(isReviewerMaterial('')).toBe(false);
      expect(isReviewerMaterial(null)).toBe(false);
      expect(isReviewerMaterial(undefined)).toBe(false);
      expect(isReviewerMaterial(42)).toBe(false);
    });
  });

  describe('env override (REVIEWER_MATERIALS_FOLDERS)', () => {
    test('honors a single comma-separated alternative', () => {
      process.env.REVIEWER_MATERIALS_FOLDERS = 'Shared_With_Reviewer';
      expect(isReviewerMaterial('1002379_GUID/Shared_With_Reviewer/file.pdf')).toBe(true);
      expect(isReviewerMaterial('1002379_GUID/Reviewer_Materials/file.pdf')).toBe(false);
    });

    test('supports multiple folders during a transition window', () => {
      process.env.REVIEWER_MATERIALS_FOLDERS = 'Reviewer_Materials,Shared_With_Reviewer';
      expect(isReviewerMaterial('1002379_GUID/Reviewer_Materials/file.pdf')).toBe(true);
      expect(isReviewerMaterial('1002379_GUID/Shared_With_Reviewer/file.pdf')).toBe(true);
      expect(isReviewerMaterial('1002379_GUID/Phase II/file.pdf')).toBe(false);
    });

    test('falls back to default when env var is empty or whitespace-only', () => {
      process.env.REVIEWER_MATERIALS_FOLDERS = '   ';
      expect(getReviewerMaterialFolders()).toEqual(['Reviewer_Materials']);
    });

    test('escapes regex metacharacters in folder names', () => {
      // If someone puts an unfortunate name like `Reviewer.Materials` in
      // the env var, the dot must be matched literally — not as "any char."
      process.env.REVIEWER_MATERIALS_FOLDERS = 'Reviewer.Materials';
      expect(isReviewerMaterial('Reviewer.Materials/file.pdf')).toBe(true);
      expect(isReviewerMaterial('ReviewerXMaterials/file.pdf')).toBe(false);
    });
  });
});
