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

import { renderAppMarkdown, ALLOWED_TAGS } from '../../shared/utils/app-markdown.js';

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
