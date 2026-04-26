import { redactLogText, redactErrorList } from '../../../lib/utils/log-redactor';

describe('redactLogText', () => {
  it('redacts Authorization Bearer tokens', () => {
    const out = redactLogText('GET /api/foo Authorization: Bearer abc.def-ghi_jkl=');
    expect(out).not.toContain('abc.def-ghi_jkl');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts Anthropic API keys', () => {
    const out = redactLogText('called with key sk-ant-api03-aaaaabbbbbccccc111111222223333344444');
    expect(out).not.toMatch(/sk-ant-api03/);
    expect(out).toContain('[REDACTED:anthropic-key]');
  });

  it('redacts Postgres connection strings', () => {
    const out = redactLogText('connecting to postgres://user:s3cret@db.example.com:5432/prod');
    expect(out).not.toContain('s3cret');
    expect(out).not.toContain('db.example.com');
    expect(out).toContain('[REDACTED:connection-string]');
  });

  it('redacts public Vercel Blob URLs', () => {
    const out = redactLogText('uploaded to https://abc123.public.blob.vercel-storage.com/proposal_12345.pdf');
    expect(out).not.toContain('abc123.public.blob.vercel-storage.com');
    expect(out).toContain('[REDACTED:blob-url]');
  });

  it('redacts email addresses', () => {
    const out = redactLogText('sent to reviewer@example.edu');
    expect(out).not.toContain('reviewer@example.edu');
    expect(out).toContain('[REDACTED:email]');
  });

  it('redacts password=value pairs', () => {
    const out = redactLogText('config: password=hunter2 other=stuff');
    expect(out).not.toContain('hunter2');
    expect(out).toContain('password=[REDACTED]');
  });

  it('handles null / undefined / non-string input', () => {
    expect(redactLogText(null)).toBe('');
    expect(redactLogText(undefined)).toBe('');
    expect(redactLogText(42)).toBe('42');
  });

  it('preserves benign text unchanged', () => {
    const out = redactLogText('TypeError: Cannot read property foo of undefined at handler.js:42');
    expect(out).toBe('TypeError: Cannot read property foo of undefined at handler.js:42');
  });
});

describe('redactErrorList', () => {
  it('redacts message and path on each error', () => {
    const out = redactErrorList([
      { timestamp: 1, message: 'fetch failed for reviewer@x.com', path: '/api/foo?key=sk-ant-api03-aaaaabbbbbccccc111111222223333344444' },
      { timestamp: 2, message: 'ok', path: '/api/bar' },
    ]);
    expect(out[0].message).toContain('[REDACTED:email]');
    // The token=… branch may match either the anthropic-key pattern or the
    // generic password/secret/token=value rule depending on rule precedence.
    // Either is an acceptable redaction — assert the secret itself is gone.
    expect(out[0].path).not.toContain('aaaaabbbbb');
    expect(out[0].path).toContain('[REDACTED');
    expect(out[1].message).toBe('ok');
    expect(out[1].path).toBe('/api/bar');
  });

  it('returns [] for non-array input', () => {
    expect(redactErrorList(null)).toEqual([]);
    expect(redactErrorList(undefined)).toEqual([]);
    expect(redactErrorList('nope')).toEqual([]);
  });
});
