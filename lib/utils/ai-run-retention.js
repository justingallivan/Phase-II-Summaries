import { createHash } from 'crypto';

export const RAW_OUTPUT_RETENTION = Object.freeze({
  FULL: 'full',
  HASH: 'hash',
  NONE: 'none',
});

function serializeRawOutput(rawOutput) {
  return typeof rawOutput === 'string' ? rawOutput : JSON.stringify(rawOutput);
}

export function applyRawOutputRetention(rawOutput, retention = RAW_OUTPUT_RETENTION.FULL) {
  if (rawOutput === undefined || rawOutput === null) return rawOutput;

  // Idempotence: if the caller already handed us a retention envelope (e.g.
  // because retention was applied upstream and the value round-tripped through
  // a wrapper), don't re-hash the envelope's JSON. Detected by the
  // {retention, originalChars, [sha256]} shape this helper itself produces.
  if (
    typeof rawOutput === 'object'
    && Object.values(RAW_OUTPUT_RETENTION).includes(rawOutput.retention)
    && Number.isInteger(rawOutput.originalChars)
  ) {
    return rawOutput;
  }

  const mode = typeof retention === 'string'
    ? retention
    : retention?.mode || RAW_OUTPUT_RETENTION.FULL;

  if (mode === RAW_OUTPUT_RETENTION.FULL) return rawOutput;

  const serialized = serializeRawOutput(rawOutput);
  const base = {
    retention: mode,
    originalChars: serialized.length,
  };

  if (mode === RAW_OUTPUT_RETENTION.HASH) {
    return {
      ...base,
      sha256: createHash('sha256').update(serialized).digest('hex'),
    };
  }

  if (mode === RAW_OUTPUT_RETENTION.NONE) {
    return base;
  }

  throw new Error(`Unknown AI raw output retention mode "${mode}"`);
}
