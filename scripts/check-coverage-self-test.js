#!/usr/bin/env node
/**
 * Self-test for coverage tools (currently: scripts/check-application-state-atlas.js).
 *
 * For every pattern documented in docs/CLAUDE_COVERAGE_LESSONS.md, exercise
 * the gate against a synthetic call site for that pattern using a runtime-
 * generated entity name. The gate must detect each entity. If any pattern
 * is no longer caught, fail loudly — that means a regression in the gate's
 * coverage logic.
 *
 * Why this exists: I keep regressing the gate when patching it because I
 * remember some patterns and forget others. This script is the binding
 * mechanism: any change to the gate that drops a pattern detection breaks
 * CI.
 *
 * Two design constraints learned the hard way:
 *   1. Entity names must be GENERATED AT RUNTIME, not stored as string
 *      literals in this file. Otherwise the gate scans this script, finds
 *      the literals, and reports false positives independent of whether
 *      the synthetic fixture is being read.
 *   2. The temp directory must NOT start with `.` — the gate's walker
 *      skips dot-directories.
 *
 * When LESSONS.md gains a new pattern, ADD A FIXTURE HERE for it.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
// Non-dot directory so the gate's walker actually scans it.
const tempDir = path.join(repoRoot, 'lib', 'services', 'atlas_selftest_tmp');

// Each fixture: { name, buildCode(entityName) }. Entity name is generated at
// runtime to keep it out of this script's source (the gate scans this script).
const FIXTURES = [
  {
    name: 'A. DynamicsService.queryRecords',
    buildCode: (e) => `DynamicsService.queryRecords('${e}', {});`,
  },
  {
    name: 'A. DynamicsService.countRecords',
    buildCode: (e) => `DynamicsService.countRecords('${e}', {});`,
  },
  {
    name: 'A. DynamicsService.aggregateRecords',
    buildCode: (e) => `DynamicsService.aggregateRecords('${e}', {});`,
  },
  {
    name: 'A. DynamicsService.searchRecords',
    buildCode: (e) => `DynamicsService.searchRecords('${e}');`,
  },
  {
    name: 'A. DynamicsService.logAiRun',
    buildCode: (e) => `DynamicsService.logAiRun('${e}', {});`,
  },
  {
    name: 'B. client.post(/<entitySet>)',
    buildCode: (e) => `client.post('/${e}', {});`,
  },
  {
    name: 'B. client.delete_(/<entitySet>) — reserved-word alias',
    buildCode: (e) => `client.delete_('/${e}/abc');`,
  },
  {
    name: 'B. client.patch(/<entitySet>)',
    buildCode: (e) => `client.patch('/${e}(abc)', {});`,
  },
  {
    name: 'C. /api/data/v9.2/<entitySet> URL fragment',
    buildCode: (e) => `const url = baseUrl + '/api/data/v9.2/${e}';`,
  },
  {
    name: 'D. ENTITY_SET constant',
    // Note: const at line start matters for the gate's regex.
    buildCode: (e) => `const ENTITY_SET = '${e}';\nDynamicsService.queryRecords(ENTITY_SET);`,
  },
  {
    name: 'D. <NAME>_ENTITY constant',
    buildCode: (e) => `const SELFTEST_FOO_ENTITY = '${e}';\nDynamicsService.queryRecords(SELFTEST_FOO_ENTITY);`,
  },
];

function cleanup() {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function runGate() {
  try {
    return execSync('node scripts/check-application-state-atlas.js', {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
  } catch (e) {
    // Expected — the gate exits non-zero when fixtures are detected.
    return (e.stdout || '') + (e.stderr || '');
  }
}

// Generate a unique entity name per fixture per run. Uses Math.random so the
// name doesn't appear anywhere in the source tree.
function uniqueEntityName(seed) {
  const rand = Math.random().toString(36).slice(2, 10);
  // Construct from parts so the resulting string never appears as a literal here.
  return ['wmkf', 'sel' + 'ftest', String(seed), rand].join('_').toLowerCase();
}

function main() {
  cleanup();
  fs.mkdirSync(tempDir, { recursive: true });

  const failures = [];
  let passed = 0;

  for (let i = 0; i < FIXTURES.length; i += 1) {
    const fixture = FIXTURES[i];
    const entityName = uniqueEntityName(i);
    const fixturePath = path.join(tempDir, `${entityName}.js`);
    const code = fixture.buildCode(entityName);
    fs.writeFileSync(fixturePath, code);

    const output = runGate();
    if (output.includes(entityName)) {
      passed += 1;
    } else {
      failures.push({
        name: fixture.name,
        entityName,
        code,
        outputTail: (output || '').slice(-300).trim(),
      });
    }

    fs.unlinkSync(fixturePath);
  }

  cleanup();

  if (failures.length > 0) {
    console.error(`Coverage self-test FAIL — ${failures.length} of ${FIXTURES.length} pattern(s) not detected:\n`);
    for (const f of failures) {
      console.error(`  ✗ ${f.name}`);
      console.error(`    Synthetic call:  ${f.code.replace(/\n/g, ' ↵ ')}`);
      console.error(`    Expected entity: ${f.entityName}`);
      console.error(`    Gate output tail: ${f.outputTail}\n`);
    }
    console.error(
      'A regression in scripts/check-application-state-atlas.js dropped detection of\n' +
      'one or more patterns documented in docs/CLAUDE_COVERAGE_LESSONS.md.\n' +
      'Either restore the pattern, or — if intentional — remove it from LESSONS.md\n' +
      "AND from this script's FIXTURES array. Both must change together.\n",
    );
    process.exit(1);
  }

  console.log(`Coverage self-test OK — ${passed}/${FIXTURES.length} patterns detected.`);
}

try {
  main();
} catch (e) {
  cleanup();
  console.error(e);
  process.exit(2);
}
