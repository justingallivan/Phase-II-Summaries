/**
 * Lenient markdown pipeline for app-facing content (QA responses,
 * refinement feedback, etc.). Sibling to `shared/utils/policy-markdown.js`,
 * which uses a stricter allowlist and adds a `validate*` companion for
 * policy bodies.
 *
 * Difference from policy-markdown.js:
 *   - Allows `class` on rendered tags so a custom marked renderer can
 *     inject Tailwind utility classes that mirror the visual treatment
 *     of the regex parser this replaces.
 *   - No validator companion — there is no "fail loud" surface here; we
 *     drop disallowed nodes silently because the upstream input is
 *     trusted LLM output rendered to staff, not user-submitted content.
 *   - Link handling: `<a href>` is allowed for `http(s)` and `mailto`,
 *     with `target="_blank" rel="noopener noreferrer"` applied so a
 *     stray cited URL in a QA response opens out-of-app and can't
 *     navigate the foundation tab away from the in-progress proposal.
 *
 * Safety contract:
 *   - Storage format is markdown UTF-8.
 *   - Rendered output is HTML produced by `marked`, then sanitized by
 *     DOMPurify with the allowlist below.
 *   - Allowed tags: p, h1-h6, ul, ol, li, blockquote, code, pre, strong,
 *     em, a, hr, br. Anything else dropped.
 *   - Allowed attributes: href (a) and class (any). class is only useful
 *     for elements emitted by our custom renderer; user-injected classes
 *     survive sanitization but Tailwind's content purge means unknown
 *     classes have no styles attached to them — surviving "class" is
 *     a visual nuisance at worst, not a privilege escalation.
 */

const { Marked, Renderer } = require('marked');
const createDOMPurify = require('dompurify');

const ALLOWED_TAGS = [
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote',
  'code', 'pre',
  'strong', 'em',
  'a',
  'hr', 'br',
];

const ALLOWED_ATTR = ['href', 'class'];

// DOMPurify special-cases `target` and `rel` (tabnabbing concerns) and
// strips them even when present in ALLOWED_ATTR. ADD_ATTR is the
// documented escape hatch — these are safe here because our link
// renderer always emits `rel="noopener noreferrer"` alongside
// `target="_blank"`, and the surface only renders trusted LLM output.
const ADD_ATTR = ['target', 'rel'];

const ALLOWED_URI_REGEXP = /^(https?:|mailto:)/i;

const markedOptions = {
  gfm: true,
  breaks: true, // QA responses use single-newline line breaks; mirror the
                // visual behavior of the regex renderer this replaces.
  pedantic: false,
};

// Tailwind utility classes reproduce the inline styling the regex
// renderer applied per-tag. Kept in one place so visual tweaks land
// here, not buried in regex literals.
const TAILWIND = {
  h1: 'font-bold text-base mt-3 mb-1',
  h2: 'font-semibold text-base mt-3 mb-1',
  h3: 'font-semibold text-sm mt-3 mb-1',
  h4: 'font-semibold text-sm mt-2 mb-1',
  code: 'bg-gray-200 px-1 py-0.5 rounded text-xs',
  ul: 'my-1 ml-4 list-disc',
  ol: 'my-1 ml-4 list-decimal',
  hr: 'my-2 border-gray-300',
};

function buildRenderer() {
  const r = new Renderer();

  r.heading = (text, level) => {
    const cls = TAILWIND[`h${level}`] || TAILWIND.h4;
    return `<h${level} class="${cls}">${text}</h${level}>`;
  };

  r.codespan = (text) =>
    `<code class="${TAILWIND.code}">${text}</code>`;

  r.list = (body, ordered) => {
    const tag = ordered ? 'ol' : 'ul';
    const cls = ordered ? TAILWIND.ol : TAILWIND.ul;
    return `<${tag} class="${cls}">${body}</${tag}>`;
  };

  r.hr = () =>
    `<hr class="${TAILWIND.hr}" />`;

  r.link = (href, title, text) => {
    // Defensive: marked has already run, but the sanitizer will also
    // enforce the scheme allowlist. If href fails the scheme test, drop
    // the link wrapper and render text alone — sanitizer can't always
    // recover a clean visible string from a dropped <a>.
    if (typeof href !== 'string' || !ALLOWED_URI_REGEXP.test(href)) {
      return text;
    }
    const titleAttr = title ? ` title="${title}"` : '';
    return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
  };

  return r;
}

function getDOMPurify() {
  // Browser path uses window.document directly. Node path constructs a
  // jsdom window using a webpack-static-analysis-defeating require so
  // jsdom doesn't get pulled into the client bundle even though this
  // module is reachable from a React component. Same pattern as
  // shared/utils/policy-markdown.js.
  if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
    return createDOMPurify(window);
  }
  // eslint-disable-next-line no-eval
  const nodeRequire = eval('require');
  const { JSDOM } = nodeRequire('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  return createDOMPurify(dom.window);
}

let _purifier = null;
function purifier() {
  if (!_purifier) _purifier = getDOMPurify();
  return _purifier;
}

// One-shot Marked instance with our renderer. Reusable across calls.
let _marked = null;
function markedInstance() {
  if (!_marked) {
    _marked = new Marked({ ...markedOptions, renderer: buildRenderer() });
  }
  return _marked;
}

/**
 * Render an app markdown body (QA response, refinement feedback, etc.)
 * to sanitized HTML safe for `dangerouslySetInnerHTML`.
 *
 * Empty / non-string input returns an empty string.
 */
function renderAppMarkdown(body) {
  if (typeof body !== 'string' || body.length === 0) return '';
  const rawHtml = markedInstance().parse(body);
  return purifier().sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_ATTR,
    // Note: ALLOWED_URI_REGEXP intentionally omitted. Setting it triggers
    // DOMPurify's internal anchor-attribute handling, which strips
    // target/rel even when they're in ADD_ATTR (reproduced 2026-05-12).
    // Two layers of defense remain: (1) the link renderer above rejects
    // any href that doesn't match ALLOWED_URI_REGEXP and drops the
    // wrapper, (2) DOMPurify's default URI-scheme handling rejects
    // javascript: and data: URLs.
    KEEP_CONTENT: true,
    RETURN_TRUSTED_TYPE: false,
  });
}

module.exports = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  ADD_ATTR,
  ALLOWED_URI_REGEXP,
  TAILWIND,
  renderAppMarkdown,
};
