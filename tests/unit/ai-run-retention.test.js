/**
 * Unit tests for `applyRawOutputRetention` — the helper that decides whether
 * Claude's raw output text gets persisted to `wmkf_ai_run.wmkf_ai_rawoutput`
 * verbatim, hashed, or as a length marker only.
 *
 * The idempotence test pins a small but real concern: if a caller has already
 * applied retention upstream and the value round-trips through a wrapper that
 * applies retention again, the helper must not re-hash the envelope (which
 * would make `originalChars` and `sha256` reflect the JSON of the wrapper
 * instead of the original Claude text).
 */

import {
  applyRawOutputRetention,
  RAW_OUTPUT_RETENTION,
} from '../../lib/utils/ai-run-retention';

describe('applyRawOutputRetention', () => {
  test('mode=full passes string through unchanged', () => {
    const out = applyRawOutputRetention('hello', RAW_OUTPUT_RETENTION.FULL);
    expect(out).toBe('hello');
  });

  test('mode=hash returns envelope with sha256 + originalChars; no raw text', () => {
    const out = applyRawOutputRetention('hello world', RAW_OUTPUT_RETENTION.HASH);
    expect(out).toEqual({
      retention: 'hash',
      originalChars: 11,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    // No leakage of raw text into the envelope.
    expect(JSON.stringify(out)).not.toContain('hello');
  });

  test('mode=none returns envelope with originalChars only', () => {
    const out = applyRawOutputRetention('hello world', RAW_OUTPUT_RETENTION.NONE);
    expect(out).toEqual({ retention: 'none', originalChars: 11 });
    expect(out.sha256).toBeUndefined();
  });

  test('mode=hash hashes serialized JSON when input is an object', () => {
    const obj = { summary: 'long narrative', filename: 'a.pdf' };
    const expectedLen = JSON.stringify(obj).length;
    const out = applyRawOutputRetention(obj, RAW_OUTPUT_RETENTION.HASH);
    expect(out.originalChars).toBe(expectedLen);
    expect(out.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  test('idempotent: an already-retained envelope passes through untouched', () => {
    // Simulates a caller that already applied retention upstream. Re-applying
    // the helper must NOT hash the envelope's JSON (which would clobber the
    // original sha256 + originalChars).
    const envelope = applyRawOutputRetention('long Claude output', RAW_OUTPUT_RETENTION.HASH);
    const second = applyRawOutputRetention(envelope, RAW_OUTPUT_RETENTION.HASH);
    expect(second).toBe(envelope);
    expect(second.originalChars).toBe('long Claude output'.length);
  });

  test('idempotent for none-mode envelopes too', () => {
    const envelope = applyRawOutputRetention('whatever', RAW_OUTPUT_RETENTION.NONE);
    const second = applyRawOutputRetention(envelope, RAW_OUTPUT_RETENTION.HASH);
    expect(second).toBe(envelope);
  });

  test('null and undefined pass through', () => {
    expect(applyRawOutputRetention(null, RAW_OUTPUT_RETENTION.HASH)).toBeNull();
    expect(applyRawOutputRetention(undefined, RAW_OUTPUT_RETENTION.HASH)).toBeUndefined();
  });

  test('default mode is full (when retention arg omitted)', () => {
    expect(applyRawOutputRetention('hello')).toBe('hello');
  });

  test('unknown mode throws', () => {
    expect(() => applyRawOutputRetention('hello', 'mystery')).toThrow(/Unknown.*retention mode/);
  });
});
