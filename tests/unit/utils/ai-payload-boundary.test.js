/**
 * Tests for explicit external-AI text payload boundaries.
 *
 * These boundaries make large prompt construction reviewable without logging
 * or persisting the sensitive payload itself.
 */

import {
  DATA_CLASSES,
  buildBoundedTextPayload,
} from '../../../lib/utils/ai-payload-boundary.js';

describe('buildBoundedTextPayload', () => {
  test('passes through text under the cap and records metadata', () => {
    const payload = buildBoundedTextPayload({
      text: 'short proposal',
      source: 'unit.test',
      dataClass: DATA_CLASSES.PROPOSAL_TEXT,
      maxChars: 100,
    });

    expect(payload.text).toBe('short proposal');
    expect(payload.metadata).toEqual({
      source: 'unit.test',
      dataClass: DATA_CLASSES.PROPOSAL_TEXT,
      maxChars: 100,
      originalChars: 14,
      transmittedChars: 14,
      truncated: false,
      truncationMarker: null,
    });
  });

  test('truncates text so the marker is included within the max chars', () => {
    const marker = '\n[TRUNCATED]';
    const payload = buildBoundedTextPayload({
      text: 'abcdefghijklmnopqrstuvwxyz',
      source: 'unit.test',
      dataClass: DATA_CLASSES.PROPOSAL_TEXT,
      maxChars: 15,
      truncationMarker: marker,
    });

    expect(payload.text).toBe('abc' + marker);
    expect(payload.text).toHaveLength(15);
    expect(payload.metadata).toEqual(expect.objectContaining({
      originalChars: 26,
      transmittedChars: 15,
      truncated: true,
      truncationMarker: marker,
    }));
  });

  test('handles nullish text as an empty payload', () => {
    const payload = buildBoundedTextPayload({
      text: null,
      source: 'unit.test',
      dataClass: DATA_CLASSES.PROPOSAL_TEXT,
      maxChars: 50,
    });

    expect(payload.text).toBe('');
    expect(payload.metadata.originalChars).toBe(0);
    expect(payload.metadata.transmittedChars).toBe(0);
  });

  test('requires source, data class, and a positive integer max', () => {
    expect(() => buildBoundedTextPayload({
      text: 'x',
      dataClass: DATA_CLASSES.PROPOSAL_TEXT,
      maxChars: 10,
    })).toThrow(/source is required/);

    expect(() => buildBoundedTextPayload({
      text: 'x',
      source: 'unit.test',
      maxChars: 10,
    })).toThrow(/dataClass is required/);

    expect(() => buildBoundedTextPayload({
      text: 'x',
      source: 'unit.test',
      dataClass: DATA_CLASSES.PROPOSAL_TEXT,
      maxChars: 0,
    })).toThrow(/positive integer/);
  });
});
