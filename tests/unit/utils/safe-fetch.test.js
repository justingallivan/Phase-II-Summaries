/**
 * Tests for lib/utils/safe-fetch.js
 *
 * Verifies:
 * - Allowed hosts pass through to fetch
 * - Blocked hosts throw
 * - HTTP (non-HTTPS) throws
 * - SSRF vectors (metadata, localhost, internal IPs) are blocked
 * - isAllowedUrl helper
 */

import { safeFetch, isAllowedUrl } from '../../../lib/utils/safe-fetch';

// global.fetch is already mocked in jest.setup.js
beforeEach(() => {
  fetch.mockReset();
  fetch.mockResolvedValue({ ok: true, status: 200 });
});

describe('safeFetch', () => {
  // -- Allowed hosts --
  const allowedUrls = [
    'https://api.anthropic.com/v1/messages',
    'https://graph.microsoft.com/v1.0/me',
    'https://login.microsoftonline.com/tenant/oauth2/v2.0/token',
    'https://wmkf.crm.dynamics.com/api/data/v9.2/accounts',
    'https://abc123def.public.blob.vercel-storage.com/file.pdf',
    'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi',
    'https://pub.orcid.org/v3.0/0000-0001-2345-6789',
    'https://api.openalex.org/works',
    'https://export.arxiv.org/api/query',
    'https://api.biorxiv.org/details/biorxiv',
    'https://api.semanticscholar.org/graph/v1/paper/search',
    'https://serpapi.com/search',
    'https://chemrxiv.org/engage/api-gateway/chemrxiv/items',
    'https://api.vercel.com/v1/projects',
    'https://api.nsf.gov/services/v1/awards.json',
    'https://api.reporter.nih.gov/v2/projects/search',
    'https://appriver3651007194.sharepoint.com/sites/akoyaGO',
  ];

  it.each(allowedUrls)('allows %s', async (url) => {
    await safeFetch(url);
    expect(fetch).toHaveBeenCalledWith(url, {});
  });

  // -- Blocked hosts --
  const blockedUrls = [
    ['cloud metadata', 'https://169.254.169.254/latest/meta-data/'],
    ['localhost', 'https://localhost:3000/api/secret'],
    ['loopback IP', 'https://127.0.0.1/admin'],
    ['internal IP', 'https://10.0.0.1/internal'],
    ['arbitrary external', 'https://evil.com/steal'],
    ['similar-sounding host', 'https://not-api.anthropic.com/v1/messages'],
    ['subdomain attack', 'https://api.anthropic.com.evil.com/v1/messages'],
  ];

  it.each(blockedUrls)('blocks %s (%s)', async (_label, url) => {
    await expect(safeFetch(url)).rejects.toThrow('host not allowed');
    expect(fetch).not.toHaveBeenCalled();
  });

  // -- Protocol enforcement --
  it('rejects HTTP URLs', async () => {
    await expect(safeFetch('http://api.anthropic.com/v1/messages')).rejects.toThrow('HTTPS required');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects invalid URLs', async () => {
    await expect(safeFetch('not-a-url')).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  // -- Options pass-through --
  it('passes fetch options through', async () => {
    const opts = { method: 'POST', headers: { 'x-api-key': 'test' }, body: '{}' };
    await safeFetch('https://api.anthropic.com/v1/messages', opts);
    expect(fetch).toHaveBeenCalledWith('https://api.anthropic.com/v1/messages', opts);
  });
});

describe('isAllowedUrl', () => {
  it('returns true for allowed HTTPS hosts', () => {
    expect(isAllowedUrl('https://api.anthropic.com/v1/messages')).toBe(true);
    expect(isAllowedUrl('https://wmkf.crm.dynamics.com/api/data/v9.2/accounts')).toBe(true);
  });

  it('returns false for blocked hosts', () => {
    expect(isAllowedUrl('https://evil.com')).toBe(false);
    expect(isAllowedUrl('https://169.254.169.254/latest')).toBe(false);
  });

  it('returns false for HTTP', () => {
    expect(isAllowedUrl('http://api.anthropic.com/v1/messages')).toBe(false);
  });

  it('returns false for malformed URLs', () => {
    expect(isAllowedUrl('not-a-url')).toBe(false);
    expect(isAllowedUrl('')).toBe(false);
  });
});
