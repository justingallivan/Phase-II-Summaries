#!/usr/bin/env node
/**
 * CI gate: bounded canonical scalar facts must not drift across live docs/memory.
 *
 * This is deliberately NOT a general semantic-consistency checker. It polices a
 * small registry of code-derived, drift-prone scalars and catches accidental
 * literal restatements in live documentation. The deeper structural follow-up is
 * normalization: reduce avoidable restatements to pointers. Until then, this
 * gate is the backstop for the remaining literals.
 *
 * De-specify-vs-update rule: de-specify exact counts when the number is not
 * locally operational; update and register an allowed restatement only when the
 * exact number is operationally needed in that document.
 *
 * Future normalization must account for canonical-pointer rot: generated/pinned
 * count pointers can silently break if anchors are renamed. When that follow-up
 * lands, add a CI lint that validates fact-id-pinned pointer targets against
 * this CANONICAL_FACTS registry instead of trusting heading text.
 *
 * Historical exemptions are intentionally strict and single-line only. A stale
 * numeric claim is exempt only when the same line carries a structured marker:
 *   <!-- fact-consistency:ignore fact=<fact-id> as-of=YYYY-MM-DD -->
 * or the same marker with session=S166 or reason=historical/point-in-time.
 */

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const repoRoot = path.resolve(__dirname, '..');

function failConfig(message) {
  throw new Error(`fact-consistency configuration error: ${message}`);
}

function readText(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

function parseJavaScript(rel, source) {
  try {
    return parser.parse(source, {
      sourceType: 'unambiguous',
      plugins: ['jsx', 'dynamicImport', 'objectRestSpread', 'classProperties'],
      errorRecovery: false,
    });
  } catch (e) {
    failConfig(`could not parse ${rel}: ${e.message}`);
  }
}

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (
      key === 'loc' ||
      key === 'start' ||
      key === 'end' ||
      key === 'leadingComments' ||
      key === 'trailingComments' ||
      key === 'innerComments'
    ) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit);
    } else if (value && typeof value.type === 'string') {
      walk(value, visit);
    }
  }
}

function jsFilesUnder(rootRel) {
  const root = path.join(repoRoot, rootRel);
  const out = [];
  (function walkDir(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walkDir(full);
      else if (/\.(cjs|mjs|js|jsx|ts|tsx)$/.test(ent.name)) out.push(full);
    }
  })(root);
  return out;
}

function deriveAppDefinitionCount() {
  const rel = 'shared/config/appRegistry.js';
  const ast = parseJavaScript(rel, readText(rel));
  let registryArray = null;

  for (const node of ast.program.body) {
    if (node.type !== 'ExportNamedDeclaration') continue;
    const decl = node.declaration;
    if (!decl || decl.type !== 'VariableDeclaration') continue;
    for (const d of decl.declarations) {
      if (d.id && d.id.type === 'Identifier' && d.id.name === 'APP_REGISTRY') {
        registryArray = d.init;
      }
    }
  }

  if (!registryArray) failConfig('APP_REGISTRY export not found in shared/config/appRegistry.js');
  if (registryArray.type !== 'ArrayExpression') failConfig('APP_REGISTRY is not an array literal');
  if (registryArray.elements.length === 0) failConfig('APP_REGISTRY is empty');

  const keys = [];
  registryArray.elements.forEach((entry, index) => {
    if (!entry || entry.type !== 'ObjectExpression') {
      failConfig(`APP_REGISTRY entry ${index} is not an object literal`);
    }
    const keyProp = entry.properties.find((prop) => {
      if (!prop || prop.type !== 'ObjectProperty' || prop.computed) return false;
      return prop.key.type === 'Identifier' && prop.key.name === 'key';
    });
    if (!keyProp) failConfig(`APP_REGISTRY entry ${index} is missing key`);
    if (!keyProp.value || keyProp.value.type !== 'StringLiteral' || !keyProp.value.value) {
      failConfig(`APP_REGISTRY entry ${index} has a non-string/empty key`);
    }
    keys.push(keyProp.value.value);
  });

  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dupes.length > 0) failConfig(`APP_REGISTRY has duplicate keys: ${[...new Set(dupes)].join(', ')}`);

  return keys.length;
}

function requireAppAccessLocalNames(ast) {
  const names = new Set();
  walk(ast, (node) => {
    if (node.type === 'ImportDeclaration') {
      for (const spec of node.specifiers || []) {
        if (
          spec.type === 'ImportSpecifier' &&
          spec.imported &&
          spec.imported.type === 'Identifier' &&
          spec.imported.name === 'requireAppAccess'
        ) {
          names.add(spec.local.name);
        }
      }
    }
    if (
      node.type === 'VariableDeclarator' &&
      node.id &&
      node.id.type === 'ObjectPattern' &&
      node.init &&
      node.init.type === 'CallExpression' &&
      node.init.callee.type === 'Identifier' &&
      node.init.callee.name === 'require'
    ) {
      for (const prop of node.id.properties || []) {
        if (
          prop.type === 'ObjectProperty' &&
          prop.key.type === 'Identifier' &&
          prop.key.name === 'requireAppAccess' &&
          prop.value.type === 'Identifier'
        ) {
          names.add(prop.value.name);
        }
      }
    }
  });
  return names;
}

function deriveRequireAppAccessEndpointCount() {
  let count = 0;
  for (const full of jsFilesUnder('pages/api')) {
    const rel = path.relative(repoRoot, full);
    const source = fs.readFileSync(full, 'utf8');
    const ast = parseJavaScript(rel, source);
    const importedNames = requireAppAccessLocalNames(ast);
    let calls = 0;

    walk(ast, (node) => {
      if (
        node.type === 'CallExpression' &&
        node.callee &&
        node.callee.type === 'Identifier' &&
        (node.callee.name === 'requireAppAccess' || importedNames.has(node.callee.name))
      ) {
        calls += 1;
      }
    });

    if (importedNames.size > 0 && calls === 0) {
      failConfig(`${rel} imports requireAppAccess but has zero call sites`);
    }
    if (calls > 0) count += 1;
  }

  if (count === 0) failConfig('no pages/api files call requireAppAccess');
  return count;
}

function matchFrom(regex) {
  return (line) => {
    regex.lastIndex = 0;
    const out = [];
    let m;
    while ((m = regex.exec(line)) !== null) {
      out.push({ raw: m[0], asserted: Number(m[1]), index: m.index });
    }
    return out;
  };
}

const CANONICAL_FACTS = [
  {
    id: 'app-definition-count',
    describe: 'APP_REGISTRY application definitions',
    derive: deriveAppDefinitionCount,
    patterns: [
      {
        name: 'app definitions',
        find: matchFrom(/\b(\d+)\s+app definitions?\b/gi),
      },
      {
        name: 'applications',
        find: matchFrom(/\b(?:all\s+)?(\d+)\s+applications\b/gi),
      },
      {
        name: 'web-based tools',
        find: matchFrom(/\b(?:suite of\s+)?(\d+)\s+web-based tools?\b/gi),
      },
    ],
    knownMissFixtures: [
      // Stale S166 miss: SYSTEM_OVERVIEW phrasing escaped the first gate.
      'suite of 13 web-based tools',
      // Stale S166 miss: SECURITY_ARCHITECTURE phrasing escaped the first gate.
      'All 14 applications',
    ],
    knownNonMatches: [
      'J26 application cycle',
      '2026-05-19 application audit',
      '17 application materials were uploaded',
      'application status changed 14 times',
    ],
  },
  {
    id: 'requireappaccess-endpoint-count',
    describe: 'pages/api files with requireAppAccess() call sites',
    derive: deriveRequireAppAccessEndpointCount,
    patterns: [
      {
        name: 'app endpoints',
        find: matchFrom(/\b~?(\d+)\+?\s+app endpoints?\b/gi),
      },
      {
        name: 'app-specific API endpoints',
        find: matchFrom(/\b~?(\d+)\+?\s+app-specific API endpoints?\b/gi),
      },
      {
        name: 'API endpoints',
        find: matchFrom(/\b~?(\d+)\+?\s+API endpoints?\b/gi),
      },
    ],
    knownMissFixtures: [
      // Stale S166 miss: plus-suffixed app endpoint count escaped the first gate.
      '30+ app endpoints',
      // Stale S166 miss: API endpoint wording escaped the first gate.
      '30 API endpoints',
    ],
    knownNonMatches: [
      '30 endpoints',
      '30 reviewer endpoints',
      '2026-05-19 endpoint audit',
      'J30 app cycle',
    ],
  },
];

const SINGLE_FILES = ['CLAUDE.md', 'SESSION_PROMPT.md', 'README.md', 'GEMINI.md'];
const ROOTS = ['docs', '.claude-memory'];
const EXCLUDE_DIR = /(^|\/)(archive|node_modules)(\/|$)/;
const POINT_IN_TIME_BASENAMES = new Set([
  'DOC_TRIAGE_2026-05-07.md',
  'DOCS_GROUND_TRUTH_AUDIT_2026-05-19.md',
  'RECONCILIATION_REPORT.md',
]);
const POINT_IN_TIME_PREFIXES = ['AUDIT_'];

function hasPointInTimeFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  return Boolean(m && /^fact_consistency:\s*point-in-time\s*$/m.test(m[1]));
}

function isPointInTimeBasename(base) {
  return POINT_IN_TIME_BASENAMES.has(base) || POINT_IN_TIME_PREFIXES.some((prefix) => base.startsWith(prefix));
}

function collectFiles() {
  const out = [];
  const addIfLiveMarkdown = (full) => {
    const rel = path.relative(repoRoot, full);
    const ent = fs.lstatSync(full);
    if (ent.isSymbolicLink()) return;
    if (!full.endsWith('.md')) return;
    if (EXCLUDE_DIR.test(rel)) return;
    if (isPointInTimeBasename(path.basename(full))) return;
    const text = fs.readFileSync(full, 'utf8');
    if (hasPointInTimeFrontmatter(text)) return;
    out.push(full);
  };

  for (const rel of SINGLE_FILES) {
    const full = path.join(repoRoot, rel);
    if (fs.existsSync(full)) addIfLiveMarkdown(full);
  }

  for (const rootRel of ROOTS) {
    const root = path.join(repoRoot, rootRel);
    if (!fs.existsSync(root)) continue;
    (function walkDir(dir) {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        const rel = path.relative(repoRoot, full);
        if (ent.isDirectory()) {
          if (!EXCLUDE_DIR.test(rel)) walkDir(full);
        } else {
          addIfLiveMarkdown(full);
        }
      }
    })(root);
  }
  return out;
}

function parseIgnoreMarker(line) {
  const marker = line.match(/<!--\s*fact-consistency:ignore\s+([^>]+?)\s*-->/);
  if (!marker) return null;
  const attrs = {};
  const re = /([a-z-]+)=("[^"]+"|'[^']+'|[^\s]+)/g;
  let m;
  while ((m = re.exec(marker[1])) !== null) {
    attrs[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return attrs;
}

function markerHasRequiredContext(attrs) {
  if (!attrs) return false;
  if (attrs['as-of'] && /^\d{4}-\d{2}-\d{2}$/.test(attrs['as-of'])) return true;
  if (attrs.session && /^S\d{3}$/.test(attrs.session)) return true;
  if (attrs.reason && /^(historical|point-in-time)$/.test(attrs.reason)) return true;
  return false;
}

function isExempt(line, factId) {
  const attrs = parseIgnoreMarker(line);
  if (!attrs) return false;
  return attrs.fact === factId && markerHasRequiredContext(attrs);
}

function assertPatternFixtures(facts) {
  for (const fact of facts) {
    for (const sample of fact.knownMissFixtures || []) {
      const matched = fact.patterns.some((pattern) => pattern.find(sample).length > 0);
      if (!matched) failConfig(`known miss fixture for ${fact.id} is not matched: ${sample}`);
    }
    for (const sample of fact.knownNonMatches || []) {
      const matched = fact.patterns.some((pattern) => pattern.find(sample).length > 0);
      if (matched) failConfig(`known non-match fixture for ${fact.id} is matched: ${sample}`);
    }
  }
}

function main() {
  assertPatternFixtures(CANONICAL_FACTS);
  const facts = CANONICAL_FACTS.map((f) => ({ ...f, live: f.derive() }));
  const files = collectFiles();
  const violations = [];

  for (const file of files) {
    const rel = path.relative(repoRoot, file);
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const fact of facts) {
        for (const pattern of fact.patterns) {
          for (const m of pattern.find(line)) {
            if (m.asserted === fact.live) continue;
            if (isExempt(line, fact.id)) continue;
            violations.push({
              rel,
              lineNo: i + 1,
              factId: fact.id,
              pattern: pattern.name,
              asserted: m.asserted,
              live: fact.live,
              text: line.trim().slice(0, 180),
            });
          }
        }
      }
    });
  }

  if (violations.length > 0) {
    console.error(
      `fact-consistency FAILED: ${violations.length} stale restatement(s) of a canonical fact.\n` +
      `A code-derived scalar drifted in a live doc/memory file. De-specify the\n` +
      `count unless it is locally operational; otherwise update it to the live\n` +
      `value. Historical mentions require same-line structured markers such as\n` +
      `<!-- fact-consistency:ignore fact=app-definition-count as-of=2026-05-19 -->.\n`,
    );
    for (const v of violations) {
      console.error(`  ✗ ${v.rel}:${v.lineNo} — fact ${v.factId} (${v.pattern}): doc says ${v.asserted}, live is ${v.live}`);
      console.error(`      ${v.text}`);
    }
    process.exit(1);
  }

  const summary = facts.map((f) => `${f.id}=${f.live}`).join(', ');
  console.log(`fact-consistency OK — ${files.length} live doc/memory file(s) scanned; canonical facts current (${summary}).`);
}

try {
  main();
} catch (e) {
  console.error(e.message || e);
  process.exit(2);
}
