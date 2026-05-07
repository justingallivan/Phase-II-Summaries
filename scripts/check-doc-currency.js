#!/usr/bin/env node
/**
 * Doc currency drift detector.
 *
 * Surfaces docs that claim outdated state, beyond what age + status-verb
 * scanning catches. Configured via the DRIFT_PATTERNS array below — each
 * entry is a string pattern + a reason. Add new patterns when external
 * review (Codex etc.) catches a drift mode the script missed.
 *
 * Usage:
 *   node scripts/check-doc-currency.js
 *
 * Exit code 0 always — this is a flagging tool, not a CI gate. (Step 4
 * of the doc triage plan promotes select probes to a CI gate; this is
 * the pre-gate manual sweep.)
 */

const fs = require('fs');
const path = require('path');

const DOCS_DIRS = ['docs', 'docs/atlas', 'docs/guides'];
const SKIP_DIR_PREFIXES = ['docs/archive/'];

// Each pattern: { id, kind, needle (string or RegExp), reason, allow (optional) }
// `allow` is a list of filename basenames where the pattern is expected
// (e.g., a doc that explicitly catalogs the wrong-form name as a known
// drift example).
const DRIFT_PATTERNS = [
  // 1. Code-name drift — wrong/renamed custom-entity names
  {
    id: 'codename-wmkf_app_researcher',
    kind: 'code-name drift',
    needle: /wmkf_app_researcher\b/g,
    reason:
      'Entity is named `wmkf_appresearcher` (no underscore after prefix) per Atlas. The underscored form was a documented prior failure pattern.',
    allow: ['CLAUDE_COVERAGE_LESSONS.md', 'POSTGRES_TO_DATAVERSE_MIGRATION.md', 'DOC_TRIAGE_2026-05-07.md', 'check-doc-currency.js'],
  },
  {
    id: 'codename-wmkf_app_publication',
    kind: 'code-name drift',
    needle: /wmkf_app_publication\b(?!_author)/g,
    reason:
      'Entity is named `wmkf_apppublication` (no underscore after prefix) per Atlas.',
    allow: ['CLAUDE_COVERAGE_LESSONS.md', 'POSTGRES_TO_DATAVERSE_MIGRATION.md'],
  },
  {
    id: 'codename-wmkf_ai_run-stale-cols',
    kind: 'code-name drift',
    needle: /wmkf_prompt_was_overridden|wmkf_run_source(?!\w)/g,
    reason:
      'Live field names are `wmkf_ai_promptoverridden` and `wmkf_ai_runsource`. The underscored / no-prefix names were stale doc artifacts; columns already exist in production per execute-prompt.js.',
    allow: ['DOC_TRIAGE_2026-05-07.md', 'check-doc-currency.js'],
  },

  // 2. Table-liveness mismatch — Atlas-marked dead tables described as live
  {
    id: 'liveness-publications-as-live',
    kind: 'table-liveness mismatch',
    needle: /publications.*?(load-bearing|active|live|primary)/gi,
    reason:
      'Atlas marks Postgres `publications` as 0 rows / dead. Docs describing it as load-bearing are stale.',
    allow: ['DOC_TRIAGE_2026-05-07.md', 'check-doc-currency.js'],
  },
  {
    id: 'liveness-search_cache-as-live',
    kind: 'table-liveness mismatch',
    needle: /search_cache.*?(load-bearing|active|live|primary)/gi,
    reason:
      'Atlas marks Postgres `search_cache` as dead/empty. Docs describing it as load-bearing are stale.',
    allow: ['DOC_TRIAGE_2026-05-07.md', 'check-doc-currency.js'],
  },

  // 3. Source-of-truth drift
  {
    id: 'sot-prompt-resolver-reads-prompt-table',
    kind: 'source-of-truth drift',
    needle: /prompt-resolver\.js[^\n]{0,200}reads?[^\n]{0,40}wmkf_ai_prompt\b/gi,
    reason:
      'Atlas notes prompt-resolver.js reads from a `wmkf_ai_run` scratch row, not from `wmkf_ai_prompt` directly. Docs describing the latter are wrong.',
  },

  // 4. Path-contract drift — non-canonical SharePoint folders
  {
    id: 'path-reviewer-uploads-wrong-shape',
    kind: 'path-contract drift',
    needle: /Reviewer_Upload\b(?!s\/\{)/g,
    reason:
      'Canonical path is `Reviewer_Uploads/{reviewerSubfolder}` (plural, with subfolder). Singular or other shapes are stale.',
    allow: ['check-doc-currency.js'],
  },
  {
    id: 'path-reviewer-downloads-wrong-shape',
    kind: 'path-contract drift',
    needle: /Reviewer_Download\b(?!s\/)/g,
    reason:
      'Canonical path is `Reviewer_Downloads/`. Singular forms are stale.',
    allow: ['check-doc-currency.js'],
  },
];

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR_PREFIXES.some((p) => full.startsWith(p))) continue;
      yield* walk(full);
    } else if (entry.isFile() && full.endsWith('.md')) {
      yield full;
    }
  }
}

function checkFile(file, hits) {
  const content = fs.readFileSync(file, 'utf8');
  const basename = path.basename(file);
  for (const pat of DRIFT_PATTERNS) {
    if (pat.allow && pat.allow.includes(basename)) continue;
    const matches = content.match(pat.needle);
    if (matches && matches.length > 0) {
      hits.push({
        file,
        patternId: pat.id,
        kind: pat.kind,
        count: matches.length,
        reason: pat.reason,
        sample: matches[0].slice(0, 80),
      });
    }
  }
}

function main() {
  const hits = [];
  for (const dir of DOCS_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const file of walk(dir)) {
      checkFile(file, hits);
    }
  }

  if (hits.length === 0) {
    console.log('✓ No drift markers found across', DRIFT_PATTERNS.length, 'patterns.');
    return;
  }

  console.log(`Found ${hits.length} drift hit(s) across ${DRIFT_PATTERNS.length} patterns:\n`);

  const byKind = {};
  for (const hit of hits) {
    (byKind[hit.kind] = byKind[hit.kind] || []).push(hit);
  }

  for (const kind of Object.keys(byKind).sort()) {
    console.log(`## ${kind} (${byKind[kind].length})\n`);
    for (const hit of byKind[kind]) {
      console.log(`  ${hit.file}`);
      console.log(`    pattern: ${hit.patternId} (×${hit.count})`);
      console.log(`    sample:  ${hit.sample}`);
      console.log(`    reason:  ${hit.reason}\n`);
    }
  }

  console.log(
    '\nThis is a flagging tool, not a CI gate. Each hit needs human judgment — some may be intentional historical references.'
  );
}

main();
