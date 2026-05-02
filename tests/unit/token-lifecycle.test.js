/**
 * Tests for the token-lifecycle helper (mintAndStore + revoke).
 *
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { DynamicsService } from '../../lib/services/dynamics-service.js';
import { mintAndStore, revoke, buildExternalUrl, ensureToken } from '../../lib/external/token-lifecycle.js';
import { hashToken } from '../../lib/services/external-token.js';

const SECRET = 'test-secret-32-chars-min-aaaaaaaaaaaa';
const SUGGESTION_ID = '11111111-1111-1111-1111-111111111111';
const REQUEST_ID = '22222222-2222-2222-2222-222222222222';

let originalUpdate;
let originalGetRecord;
let originalSecret;
let originalNextauth;

describe('token-lifecycle', () => {
  beforeEach(() => {
    originalSecret = process.env.EXTERNAL_LINK_SECRET;
    originalNextauth = process.env.NEXTAUTH_URL;
    process.env.EXTERNAL_LINK_SECRET = SECRET;
    process.env.NEXTAUTH_URL = 'https://reviewer.example.com';
    originalUpdate = DynamicsService.updateRecord;
    originalGetRecord = DynamicsService.getRecord;
    DynamicsService.updateRecord = jest.fn().mockResolvedValue({});
    DynamicsService.getRecord = jest.fn();
  });
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.EXTERNAL_LINK_SECRET;
    else process.env.EXTERNAL_LINK_SECRET = originalSecret;
    if (originalNextauth === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = originalNextauth;
    DynamicsService.updateRecord = originalUpdate;
    DynamicsService.getRecord = originalGetRecord;
  });

  describe('mintAndStore', () => {
    test('mints a JWT, persists hash + timestamps, clears revoked, returns URL', async () => {
      const expiresAt = new Date(Date.now() + 60_000);
      const result = await mintAndStore({
        suggestionId: SUGGESTION_ID,
        requestId: REQUEST_ID,
        expiresAt,
      });

      expect(typeof result.jwt).toBe('string');
      expect(result.jwt.split('.')).toHaveLength(3);
      expect(result.hash).toBe(hashToken(result.jwt));
      expect(result.url).toBe(`https://reviewer.example.com/external/review/${result.jwt}`);

      expect(DynamicsService.updateRecord).toHaveBeenCalledTimes(1);
      const [entitySet, id, patch] = DynamicsService.updateRecord.mock.calls[0];
      expect(entitySet).toBe('wmkf_appreviewersuggestions');
      expect(id).toBe(SUGGESTION_ID);
      expect(patch.wmkf_externaltokenhash).toBe(result.hash);
      expect(patch.wmkf_externaltokenexpires).toBe(expiresAt.toISOString());
      expect(patch.wmkf_externaltokenrevoked).toBe(false);
      expect(typeof patch.wmkf_externaltokenissued).toBe('string');
    });

    test('rejects missing args', async () => {
      await expect(
        mintAndStore({ suggestionId: '', requestId: REQUEST_ID, expiresAt: new Date(Date.now() + 1000) }),
      ).rejects.toThrow(/suggestionId required/);
      await expect(
        mintAndStore({ suggestionId: SUGGESTION_ID, requestId: '', expiresAt: new Date(Date.now() + 1000) }),
      ).rejects.toThrow(/requestId required/);
      await expect(
        mintAndStore({ suggestionId: SUGGESTION_ID, requestId: REQUEST_ID, expiresAt: 'not-a-date' }),
      ).rejects.toThrow(/expiresAt must be a valid Date/);
    });
  });

  describe('revoke', () => {
    test('PATCHes wmkf_externaltokenrevoked = true', async () => {
      await revoke(SUGGESTION_ID);
      expect(DynamicsService.updateRecord).toHaveBeenCalledWith(
        'wmkf_appreviewersuggestions',
        SUGGESTION_ID,
        { wmkf_externaltokenrevoked: true },
      );
    });

    test('rejects missing id', async () => {
      await expect(revoke()).rejects.toThrow(/suggestionId required/);
    });
  });

  describe('ensureToken', () => {
    function row({ hash = null, revoked = false, expires = null } = {}) {
      return {
        wmkf_appreviewersuggestionid: SUGGESTION_ID,
        wmkf_externaltokenhash: hash,
        wmkf_externaltokenrevoked: revoked,
        wmkf_externaltokenexpires: expires,
        _wmkf_request_value: REQUEST_ID,
      };
    }

    test('mints when no hash exists', async () => {
      DynamicsService.getRecord.mockResolvedValue(row());
      const result = await ensureToken(SUGGESTION_ID);
      expect(result.minted).toBe(true);
      expect(DynamicsService.updateRecord).toHaveBeenCalledTimes(1);
    });

    test('skips when an active token exists (idempotent)', async () => {
      DynamicsService.getRecord.mockResolvedValue(row({
        hash: 'a'.repeat(64),
        expires: new Date(Date.now() + 60_000).toISOString(),
      }));
      const result = await ensureToken(SUGGESTION_ID);
      expect(result).toEqual({ minted: false, reason: 'already_active' });
      expect(DynamicsService.updateRecord).not.toHaveBeenCalled();
    });

    test('re-mints when prior token was revoked', async () => {
      DynamicsService.getRecord.mockResolvedValue(row({
        hash: 'a'.repeat(64),
        revoked: true,
        expires: new Date(Date.now() + 60_000).toISOString(),
      }));
      const result = await ensureToken(SUGGESTION_ID);
      expect(result.minted).toBe(true);
      expect(DynamicsService.updateRecord).toHaveBeenCalledTimes(1);
      const patch = DynamicsService.updateRecord.mock.calls[0][2];
      expect(patch.wmkf_externaltokenrevoked).toBe(false);
    });

    test('re-mints when prior token expired', async () => {
      DynamicsService.getRecord.mockResolvedValue(row({
        hash: 'a'.repeat(64),
        expires: new Date(Date.now() - 60_000).toISOString(),
      }));
      const result = await ensureToken(SUGGESTION_ID);
      expect(result.minted).toBe(true);
    });

    test('returns no_request when suggestion has no linked request', async () => {
      DynamicsService.getRecord.mockResolvedValue({
        wmkf_appreviewersuggestionid: SUGGESTION_ID,
        wmkf_externaltokenhash: null,
        _wmkf_request_value: null,
      });
      const result = await ensureToken(SUGGESTION_ID);
      expect(result).toEqual({ minted: false, reason: 'no_request' });
      expect(DynamicsService.updateRecord).not.toHaveBeenCalled();
    });

    test('rejects missing id', async () => {
      await expect(ensureToken()).rejects.toThrow(/suggestionId required/);
    });
  });

  describe('buildExternalUrl', () => {
    test('joins NEXTAUTH_URL and the JWT', () => {
      expect(buildExternalUrl('abc.def.ghi')).toBe(
        'https://reviewer.example.com/external/review/abc.def.ghi',
      );
    });

    test('strips trailing slash on the base', () => {
      process.env.NEXTAUTH_URL = 'https://reviewer.example.com/';
      expect(buildExternalUrl('xyz')).toBe('https://reviewer.example.com/external/review/xyz');
    });
  });
});
