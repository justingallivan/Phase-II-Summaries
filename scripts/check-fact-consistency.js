#!/usr/bin/env node
/**
 * CI gate: canonical scalar facts must not drift across docs/memory.
 *
 * The failure class this guards (the recurring "fan-out / no fan-in"):
 * a fact lives denormalized in many places (an index line, a header, a
 * sibling doc). Someone fixes the value in the file they're looking at and
 * the other restatements silently rot. S166 alone produced THREE instances
 * of this for the app-definition / requireAppAccess counts — including ones
 * caught only on external review. Awareness did not prevent it; this gate
 * is the mechanical fan-in that does not depend on anyone remembering.
 *
 * SCOPE — deliberately bounded. This is NOT a general semantic consistency
 * checker (that remains correctly deferred — it is NLP-hard). It only
 * polices scalars that are (a) crisply derivable from code at runtime and
 * (b) demonstrably prone to drift. Each such fact is registered in
 * CANONICAL_FACTS with a derive() that reads ground truth from the repo.
 * Add a fact ONLY when it meets both bars, and add a self-test fixture for
 * it in scripts/check-fact-consistency-self-test.js in the same commit.
 *
 * Point-in-time docs (audits, triage, the reconciliation report) are
 * EXCLUDED on principle: they are supposed to record historical numbers.
 * Codex made exactly this distinction — a historical "as of" mention is
 * not drift. For an intentional historical mention inside a live doc, use
 * the inline escape hatch (see isExempt): a `was `/`formerly `/`as of `/
 * `historical`/`S1xx`/`prior ` qualifier right before the number, or an
 * explicit `<!-- fact-consistency:ignore -->` on the line.
 *
 * ⚠️ Run SEQUENTIALLY with check:fact-consistency:self-test, never in
 * parallel — the self-test writes synthetic .md fixtures into a path this
 * gate scans (same hazard/contract as the Atlas gate + its self-test).
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

// --- ground-truth derivers (read the live repo, never a doc) -------------

function appRegistrySource() {
  return fs.readFileSync(path.join(repoRoot, 'shared/config/appRegistry.js'), 'utf8');
}

function countFilesContaining(dirRel, needle) {
  const root = path.join(repoRoot, dirRel);
  let n = 0;
  (function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (fs.readFileSync(full, 'utf8').includes(needle)) n += 1;
    }
  })(root);
  return n;
}

const CANONICAL_FACTS = [
  {
    id: 'app-definition-count',
    describe: "appRegistry.js app definitions (top-level `key:` entries)",
    derive: () => (appRegistrySource().match(/^\s{2,}key: '/gm) || []).length,
    // "... all 17 app definitions ..." — capture the asserted integer.
    pattern: /\b(\d+)\s+app definitions?\b/gi,
  },
  {
    id: 'requireappaccess-endpoint-count',
    describe: "pages/api files referencing requireAppAccess",
    derive: () => countFilesContaining('pages/api', 'requireAppAccess'),
    // "... on ~52 app endpoints ..." — tolerate the "~" approx prefix.
    pattern: /~?(\d+)\s+app endpoints?\b/gi,
  },
];

// --- scan target: live docs + memory only -------------------------------

const SCAN_ROOTS = ['docs', '.claude-memory'];
const SCAN_SINGLE_FILES = ['CLAUDE.md'];

// Point-in-time / generated artifacts: they SHOULD carry historical numbers.
const EXCLUDE_BASENAME = /^(AUDIT_|DOC_TRIAGE|RECONCILIATION_REPORT)|GROUND_TRUTH_AUDIT/;
// NB: the self-test's temp dir is intentionally NOT excluded — the self-test
// needs this gate to scan its synthetic fixtures to prove detection works
// (same sequential-only contract as the Atlas gate + its self-test).
const EXCLUDE_DIR = /(^|\/)(archive|node_modules)(\/|$)/;

// Inline exemption for a deliberate historical mention inside a live doc.
const EXEMPT_NEAR = /(was|formerly|previously|prior|as of|historical|S1\d\d|2026-0[1-5])\D{0,28}$/i;

function isExempt(line, matchIndex) {
  if (line.includes('fact-consistency:ignore')) return true;
  return EXEMPT_NEAR.test(line.slice(0, matchIndex));
}

function collectFiles() {
  const out = [];
  for (const rel of SCAN_SINGLE_FILES) {
    const p = path.join(repoRoot, rel);
    if (fs.existsSync(p)) out.push(p);
  }
  for (const rootRel of SCAN_ROOTS) {
    const root = path.join(repoRoot, rootRel);
    if (!fs.existsSync(root)) continue;
    (function walk(dir) {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        const relPath = path.relative(repoRoot, full);
        if (ent.isDirectory()) {
          if (!EXCLUDE_DIR.test(relPath)) walk(full);
        } else if (
          ent.name.endsWith('.md') &&
          !EXCLUDE_BASENAME.test(ent.name) &&
          !EXCLUDE_DIR.test(relPath)
        ) {
          out.push(full);
        }
      }
    })(root);
  }
  return out;
}

function main() {
  const facts = CANONICAL_FACTS.map((f) => ({ ...f, live: f.derive() }));
  const files = collectFiles();
  const violations = [];

  for (const file of files) {
    const rel = path.relative(repoRoot, file);
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const fact of facts) {
        fact.pattern.lastIndex = 0;
        let m;
        while ((m = fact.pattern.exec(line)) !== null) {
          const asserted = Number(m[1]);
          if (asserted === fact.live) continue;
          if (isExempt(line, m.index)) continue;
          violations.push({
            rel,
            lineNo: i + 1,
            factId: fact.id,
            asserted,
            live: fact.live,
            text: line.trim().slice(0, 160),
          });
        }
      }
    });
  }

  if (violations.length > 0) {
    console.error(
      `fact-consistency FAILED: ${violations.length} stale restatement(s) of a canonical fact.\n` +
      `A code-derived scalar drifted in a live doc/memory file. Fix the value to match\n` +
      `live (or, for a deliberate historical mention, add a "was/as of/S1xx" qualifier\n` +
      `before the number or an inline \`<!-- fact-consistency:ignore -->\`).\n`,
    );
    for (const v of violations) {
      console.error(`  ✗ ${v.rel}:${v.lineNo} — fact ${v.factId}: doc says ${v.asserted}, live is ${v.live}`);
      console.error(`      ${v.text}`);
    }
    process.exit(1);
  }

  const summary = facts.map((f) => `${f.id}=${f.live}`).join(', ');
  console.log(`fact-consistency OK — ${files.length} live doc/memory file(s) scanned; canonical facts current (${summary}).`);
}

main();
