#!/usr/bin/env node
/**
 * Binding self-test for scripts/check-fact-consistency.js.
 *
 * Exercises the gate against synthetic .md fixtures so a regression in its
 * detection / exemption logic breaks CI (mirrors check-coverage-self-test.js).
 *
 * Fixtures per registered canonical fact:
 *   1. POSITIVE  — states the fact with a deliberately WRONG value → gate
 *                  MUST flag it.
 *   2. NEGATION  — states the fact with the CORRECT live value → gate MUST
 *                  NOT flag that line (guards against a gate that flags
 *                  everything).
 *   3. EXEMPT    — states a WRONG value but with the historical escape hatch
 *                  → gate MUST NOT flag it (guards the exemption logic).
 *
 * Wrong values are computed at runtime (live + large offset + random) so
 * they never appear as literals here — defensive even though this gate only
 * scans .md (this .js is not scanned), matching the discipline learned in
 * check-coverage-self-test.js.
 *
 * ⚠️ DO NOT run concurrently with `npm run check:fact-consistency`. This
 * writes fixtures into `docs/fact_consistency_selftest_tmp/`, a path that
 * gate scans; a parallel run false-flags on them and races cleanup().
 * Always run the pair sequentially.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const gate = path.join(repoRoot, 'scripts', 'check-fact-consistency.js');
// Non-dot dir under docs/ so the gate's walker scans it.
const tempDir = path.join(repoRoot, 'docs', 'fact_consistency_selftest_tmp');

// Derive each fact's live value the same way the gate does, so fixtures are
// relative to ground truth (not hard-coded).
function liveAppDefinitionCount() {
  const src = fs.readFileSync(path.join(repoRoot, 'shared/config/appRegistry.js'), 'utf8');
  return (src.match(/^\s{2,}key: '/gm) || []).length;
}
function liveEndpointCount() {
  const root = path.join(repoRoot, 'pages/api');
  let n = 0;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (fs.readFileSync(f, 'utf8').includes('requireAppAccess')) n += 1;
    }
  })(root);
  return n;
}

const rand = () => 1000 + Math.floor(Math.random() * 9000);

function buildFixtures() {
  const apps = liveAppDefinitionCount();
  const eps = liveEndpointCount();
  const wrongApps = apps + rand();
  const wrongEps = eps + rand();
  return [
    {
      name: 'POSITIVE: wrong app-definition count is flagged',
      file: 'pos_apps.md',
      body: `Registry has all ${wrongApps} app definitions today.`,
      expectFlagged: true,
      token: String(wrongApps),
    },
    {
      name: 'NEGATION: correct app-definition count is NOT flagged',
      file: 'neg_apps.md',
      body: `Registry has all ${apps} app definitions today.`,
      expectFlagged: false,
      token: String(apps),
    },
    {
      name: 'POSITIVE: wrong requireAppAccess endpoint count is flagged',
      file: 'pos_eps.md',
      body: `requireAppAccess() guards ~${wrongEps} app endpoints now.`,
      expectFlagged: true,
      token: String(wrongEps),
    },
    {
      name: 'EXEMPT: wrong value with historical qualifier is NOT flagged',
      file: 'exempt_hist.md',
      body: `It was ${wrongApps} app definitions back at S154; now larger.`,
      expectFlagged: false,
      token: String(wrongApps),
    },
    {
      name: 'EXEMPT: wrong value with inline ignore marker is NOT flagged',
      file: 'exempt_marker.md',
      body: `Roughly ${wrongEps} app endpoints. <!-- fact-consistency:ignore -->`,
      expectFlagged: false,
      token: String(wrongEps),
    },
  ];
}

function cleanup() {
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
}

function runGate() {
  try {
    return execSync(`node ${JSON.stringify(gate)}`, {
      cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8',
    });
  } catch (e) {
    return (e.stdout || '') + (e.stderr || '');
  }
}

function main() {
  cleanup();
  fs.mkdirSync(tempDir, { recursive: true });

  const fixtures = buildFixtures();
  // Write all fixtures, run the gate once, then assert per fixture by token.
  for (const fx of fixtures) fs.writeFileSync(path.join(tempDir, fx.file), fx.body + '\n');
  const output = runGate();
  cleanup();

  const failures = [];
  for (const fx of fixtures) {
    // A fixture is "flagged" if the gate output cites its temp file with its token.
    const flagged = output.includes(fx.file) && output.includes(fx.token);
    if (flagged !== fx.expectFlagged) {
      failures.push({ fx, flagged });
    }
  }

  if (failures.length > 0) {
    console.error(`fact-consistency self-test FAIL — ${failures.length}/${fixtures.length} fixture(s) misbehaved:\n`);
    for (const { fx, flagged } of failures) {
      console.error(`  ✗ ${fx.name}`);
      console.error(`    expected flagged=${fx.expectFlagged}, got flagged=${flagged}`);
      console.error(`    fixture body: ${fx.body}`);
    }
    console.error(`\n  Gate output tail:\n${(output || '').slice(-600).trim()}\n`);
    console.error(
      'A regression in scripts/check-fact-consistency.js changed detection or\n' +
      'exemption behavior. Restore it, or if intentional update BOTH the gate\n' +
      'and these fixtures in the same commit.\n',
    );
    process.exit(1);
  }

  console.log(`fact-consistency self-test OK — ${fixtures.length}/${fixtures.length} fixtures behaved as expected.`);
}

try {
  main();
} catch (e) {
  cleanup();
  console.error(e);
  process.exit(2);
}
