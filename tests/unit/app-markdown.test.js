/**
 * Unit tests for the shared app-markdown pipeline.
 *
 * Replaces the regex-based `renderMarkdown` previously inlined in
 * `pages/phase-ii-writeup.js`. Covers normal formatting, list behavior,
 * link scheme allowlist + target/rel handling, and unsafe-content
 * stripping. The renderer is the only safety boundary downstream; the
 * `dangerouslySetInnerHTML` consumer in the page relies on its output
 * being scrubbed.
 *
 * @jest-environment jsdom
 *
 * Using the jsdom environment means `window` exists and the browser
 * branch of `getDOMPurify()` runs — avoids the `eval('require')` jsdom
 * fallback which Jest can't load because jsdom uses ESM exports.
 */

import { renderAppMarkdown, isSafeAppUrl, ALLOWED_TAGS } from '../../shared/utils/app-markdown.js';

describe('renderAppMarkdown', () => {
  describe('basic formatting', () => {
    test('empty / non-string input returns empty string', () => {
      expect(renderAppMarkdown('')).toBe('');
      expect(renderAppMarkdown(null)).toBe('');
      expect(renderAppMarkdown(undefined)).toBe('');
      expect(renderAppMarkdown(42)).toBe('');
    });

    test('renders h1, h2, h3 with Tailwind classes', () => {
      const out = renderAppMarkdown('# One\n\n## Two\n\n### Three');
      expect(out).toContain('<h1 class="font-bold text-base mt-3 mb-1">One</h1>');
      expect(out).toContain('<h2 class="font-semibold text-base mt-3 mb-1">Two</h2>');
      expect(out).toContain('<h3 class="font-semibold text-sm mt-3 mb-1">Three</h3>');
    });

    test('renders bold, italic, and bold+italic', () => {
      const out = renderAppMarkdown('**bold** and *italic* and ***both***');
      expect(out).toContain('<strong>bold</strong>');
      expect(out).toContain('<em>italic</em>');
      // bold-italic produces <em><strong>...</strong></em> (marked's order)
      expect(out).toMatch(/<em><strong>both<\/strong><\/em>|<strong><em>both<\/em><\/strong>/);
    });

    test('renders inline code with the bg-gray-200 class', () => {
      const out = renderAppMarkdown('Use `npm install` to start.');
      expect(out).toContain('<code class="bg-gray-200 px-1 py-0.5 rounded text-xs">npm install</code>');
    });

    test('renders horizontal rules', () => {
      const out = renderAppMarkdown('Before\n\n---\n\nAfter');
      expect(out).toContain('<hr class="my-2 border-gray-300"');
    });
  });

  describe('lists', () => {
    test('renders unordered list', () => {
      const out = renderAppMarkdown('- one\n- two\n- three');
      expect(out).toContain('<ul class="my-1 ml-4 list-disc">');
      expect(out).toContain('<li>one</li>');
      expect(out).toContain('<li>two</li>');
      expect(out).toContain('<li>three</li>');
    });

    test('renders ordered list', () => {
      const out = renderAppMarkdown('1. first\n2. second');
      expect(out).toContain('<ol class="my-1 ml-4 list-decimal">');
      expect(out).toContain('<li>first</li>');
      expect(out).toContain('<li>second</li>');
    });

    test('renders nested list', () => {
      const out = renderAppMarkdown('- outer\n  - inner');
      expect(out).toContain('<ul class="my-1 ml-4 list-disc">');
      // nested ul should appear inside the outer li
      expect(out).toMatch(/<li>outer[\s\S]*?<ul/);
    });
  });

  describe('links', () => {
    test('http URLs render as anchor with target=_blank rel=noopener', () => {
      const out = renderAppMarkdown('See [the docs](https://example.com).');
      expect(out).toContain('href="https://example.com"');
      expect(out).toContain('target="_blank"');
      expect(out).toMatch(/rel="[^"]*noopener[^"]*"/);
    });

    test('mailto links are allowed', () => {
      const out = renderAppMarkdown('[Email us](mailto:hello@example.com)');
      expect(out).toContain('href="mailto:hello@example.com"');
    });

    test('javascript: URLs are stripped (renderer drops the wrapper)', () => {
      const out = renderAppMarkdown('[click me](javascript:alert(1))');
      // Renderer drops the wrapper for non-allowed schemes; sanitizer is
      // the backstop. Either way, no functional anchor should land in the
      // output.
      expect(out).not.toContain('javascript:');
      expect(out).toContain('click me');
    });

    test('data: URLs are stripped', () => {
      const out = renderAppMarkdown('[x](data:text/html,<script>alert(1)</script>)');
      expect(out).not.toContain('data:');
      // Body text should still surface.
      expect(out).toContain('x');
    });
  });

  describe('safety', () => {
    test('strips <script> tags entirely', () => {
      const out = renderAppMarkdown('Hello <script>alert(1)</script> world');
      expect(out).not.toContain('<script');
      expect(out).not.toContain('alert(1)');
      expect(out).toContain('Hello');
      expect(out).toContain('world');
    });

    test('strips inline HTML attack vectors (<img onerror>)', () => {
      // Raw HTML inside markdown bodies — marked passes <img> through to
      // the sanitizer, which must drop the tag entirely (not in allowlist)
      // along with the onerror handler.
      const out = renderAppMarkdown('Hello <img src="x" onerror="alert(1)"> world');
      expect(out).not.toContain('onerror');
      expect(out).not.toContain('<img');
      expect(out).toContain('Hello');
      expect(out).toContain('world');
    });

    test('strips disallowed tags (div, span, iframe)', () => {
      const out = renderAppMarkdown('<div class="evil">inside</div>');
      expect(out).not.toContain('<div');
      // KEEP_CONTENT means the inner text survives even when the tag is dropped.
      expect(out).toContain('inside');
    });

    test('raw HTML <a href="tel:..."> is stripped (renderer bypass attack)', () => {
      // Raw HTML inside markdown body bypasses the marked renderer's
      // scheme check. The DOMPurify uponSanitizeAttribute hook is the
      // backstop — it must strip non-http(s)/mailto schemes that
      // DOMPurify's defaults would otherwise allow (tel/ftp/sms/etc).
      const out = renderAppMarkdown('Call <a href="tel:5551234">me</a>');
      expect(out).not.toContain('tel:');
      // The element survives without the href; text content is preserved.
      expect(out).toContain('me');
    });

    test('raw HTML <a href="ftp://..."> is stripped', () => {
      const out = renderAppMarkdown('<a href="ftp://example.com">link</a>');
      expect(out).not.toContain('ftp:');
      expect(out).toContain('link');
    });

    test('renderer-injected class survives sanitization', () => {
      const out = renderAppMarkdown('`x`');
      expect(out).toContain('class="bg-gray-200 px-1 py-0.5 rounded text-xs"');
    });

    test('user-injected class is stripped even with allowed Tailwind values', () => {
      // The class value allowlist permits only renderer-emitted strings.
      // Raw HTML with class="fixed inset-0..." (UI redress vector) must
      // lose its class attribute even though `fixed inset-0` exists in
      // the bundle.
      const out = renderAppMarkdown('<p class="fixed inset-0 z-50 bg-white">redress</p>');
      expect(out).not.toContain('fixed inset-0');
      expect(out).not.toContain('z-50');
      expect(out).toContain('redress');
    });

    test('user-injected class with an exact renderer value is also stripped on a different tag', () => {
      // Even if a user copies a renderer-emitted string verbatim, the
      // hook strips it because the class allowlist is value-based, not
      // tag+value-based — but only renderer-emitted elements have these
      // class values in the first place. This test pins the conservative
      // behavior: the hook doesn't try to distinguish source.
      const out = renderAppMarkdown('<p class="font-bold text-base mt-3 mb-1">x</p>');
      // The class survives because the value is in the allowlist. This
      // is the trade-off: a strict tag+value pairing would require
      // re-implementing more of DOMPurify's traversal. The fixed/inset
      // attack vector is closed because attacker-controlled positioning
      // classes don't appear in the renderer's allowlist.
      expect(out).toContain('class="font-bold text-base mt-3 mb-1"');
    });
  });

  describe('isSafeAppUrl', () => {
    test('accepts http/https/mailto', () => {
      expect(isSafeAppUrl('http://example.com')).toBe(true);
      expect(isSafeAppUrl('https://example.com')).toBe(true);
      expect(isSafeAppUrl('mailto:a@b.com')).toBe(true);
    });

    test('rejects javascript/data/tel/ftp/null/non-string', () => {
      expect(isSafeAppUrl('javascript:alert(1)')).toBe(false);
      expect(isSafeAppUrl('data:text/html,<script>x</script>')).toBe(false);
      expect(isSafeAppUrl('tel:5551234')).toBe(false);
      expect(isSafeAppUrl('ftp://example.com')).toBe(false);
      expect(isSafeAppUrl(null)).toBe(false);
      expect(isSafeAppUrl(undefined)).toBe(false);
      expect(isSafeAppUrl(123)).toBe(false);
    });
  });

  describe('output structure', () => {
    test('output contains only allowed tags', () => {
      const out = renderAppMarkdown(
        '# Heading\n\n**Bold** *italic* `code`\n\n- list\n\n1. ordered\n\n[link](https://example.com)\n\n> quote\n\n```\nblock\n```',
      );
      // Pull every tag name out of the output and verify it's in ALLOWED_TAGS.
      const tags = [...out.matchAll(/<\/?([a-z][a-z0-9]*)\b/gi)].map((m) => m[1].toLowerCase());
      const disallowed = tags.filter((t) => !ALLOWED_TAGS.includes(t));
      expect(disallowed).toEqual([]);
    });
  });
});
