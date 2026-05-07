#!/usr/bin/env node
/**
 * CI gate: every Postgres table and Dataverse entity referenced in source
 * must appear in the Application State Atlas.
 *
 * Phase 2 of docs/CLAUDE_REMEDIATION_PLAN.md. Without this, the Atlas
 * rots — same way the API_ROUTE_SECURITY_MATRIX did before its CI gate.
 *
 * What this enforces (v1, structural coverage):
 *   1. Every Postgres table declared in schema.sql / migrations / setup-database.js
 *      is mentioned in at least one Atlas file.
 *   2. Every Dataverse entity-set name passed to a DynamicsService.* method
 *      is mentioned in at least one Atlas file.
 *
 * What it does NOT enforce (v2 future work):
 *   - Per-file caller registration. A new write site in an existing entity's
 *     domain still passes if the table/entity itself is covered.
 *
 * False-positive guard: maintain ALLOWED_UNDOCUMENTED below for entities
 * that intentionally aren't in the Atlas (e.g., test-only entity sets).
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const atlasIndex = path.join(repoRoot, 'docs', 'APPLICATION_STATE_ATLAS.md');
const atlasDir = path.join(repoRoot, 'docs', 'atlas');

// Source dirs to scan for table/entity references.
const SCAN_DIRS = [
  path.join(repoRoot, 'lib'),
  path.join(repoRoot, 'pages', 'api'),
  path.join(repoRoot, 'scripts'),
];

// Where Postgres tables are declared.
const SCHEMA_FILES = [
  path.join(repoRoot, 'lib', 'db', 'schema.sql'),
  path.join(repoRoot, 'scripts', 'setup-database.js'),
];
const MIGRATIONS_DIR = path.join(repoRoot, 'lib', 'db', 'migrations');

// Postgres tables that are intentionally NOT in the Atlas (yet). Add a reason.
// Empty by default — keep it that way.
const ALLOWED_UNDOCUMENTED_TABLES = new Set([
  'playing_with_neon', // test/scratch table, mentioned in postgres-other-reviewer-tables.md anyway
]);

// Dataverse entity sets that are intentionally NOT in the Atlas. Standard
// vendor entities we never touch beyond a one-off probe go here.
const ALLOWED_UNDOCUMENTED_ENTITIES = new Set([
  'sharepointdocumentlocations', // vendor-only, accessed via lookup not direct
]);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    // Skip build artifacts + node_modules.
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name.startsWith('.')) return [];
      return walk(fullPath);
    }
    return [fullPath];
  });
}

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

// ── Step 1: enumerate Postgres tables ──────────────────────────────────────
function enumeratePostgresTables() {
  const tables = new Set();
  const re = /CREATE TABLE IF NOT EXISTS\s+([a-z_][a-z0-9_]*)/gi;

  for (const f of SCHEMA_FILES) {
    const src = readFileSafe(f);
    let m;
    while ((m = re.exec(src)) !== null) tables.add(m[1].toLowerCase());
  }
  if (fs.existsSync(MIGRATIONS_DIR)) {
    for (const f of fs.readdirSync(MIGRATIONS_DIR)) {
      if (!f.endsWith('.sql')) continue;
      const src = readFileSafe(path.join(MIGRATIONS_DIR, f));
      let m;
      while ((m = re.exec(src)) !== null) tables.add(m[1].toLowerCase());
    }
  }
  return tables;
}

// ── Step 2: enumerate Dataverse entity sets used in code ───────────────────
// Look for DynamicsService.{queryRecords,queryAllRecords,getRecord,createRecord,updateRecord,
//   deleteRecord}('<entitySet>'  — the first string arg is the entity set name.
function enumerateDataverseEntitySets() {
  const entities = new Set();
  const re = /DynamicsService\.(?:queryRecords|queryAllRecords|getRecord|createRecord|updateRecord|deleteRecord|logAiRun)\s*\(\s*['"]([a-z_][a-z0-9_]*)['"]/g;

  for (const dir of SCAN_DIRS) {
    for (const file of walk(dir)) {
      if (!file.endsWith('.js')) continue;
      const src = readFileSafe(file);
      let m;
      while ((m = re.exec(src)) !== null) entities.add(m[1].toLowerCase());
    }
  }

  // Adapter ENTITY_SET constants are also entity sets — surface those too.
  const setRe = /(?:^|\s)(?:const|let)\s+ENTITY_SET\s*=\s*['"]([a-z_][a-z0-9_]*)['"]/gm;
  for (const dir of SCAN_DIRS) {
    for (const file of walk(dir)) {
      if (!file.endsWith('.js')) continue;
      const src = readFileSafe(file);
      let m;
      while ((m = setRe.exec(src)) !== null) entities.add(m[1].toLowerCase());
    }
  }

  return entities;
}

// ── Step 3: read all Atlas content ─────────────────────────────────────────
function readAtlasCorpus() {
  const parts = [readFileSafe(atlasIndex)];
  if (fs.existsSync(atlasDir)) {
    for (const f of fs.readdirSync(atlasDir)) {
      if (!f.endsWith('.md')) continue;
      parts.push(readFileSafe(path.join(atlasDir, f)));
    }
  }
  return parts.join('\n').toLowerCase();
}

// ── Step 4: check coverage ─────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(atlasIndex)) {
    console.error(`Missing Application State Atlas index: ${path.relative(repoRoot, atlasIndex)}`);
    process.exit(1);
  }

  const tables = enumeratePostgresTables();
  const entities = enumerateDataverseEntitySets();
  const atlas = readAtlasCorpus();

  const missingTables = [];
  for (const t of tables) {
    if (ALLOWED_UNDOCUMENTED_TABLES.has(t)) continue;
    // Match `t` as a backtick-quoted identifier or word-boundary mention.
    // Use a simple substring check after lowercasing — Atlas pages already
    // backtick the identifiers consistently.
    if (!atlas.includes(`\`${t}\``) && !atlas.includes(` ${t} `) && !atlas.includes(`${t}.`)) {
      missingTables.push(t);
    }
  }

  const missingEntities = [];
  for (const e of entities) {
    if (ALLOWED_UNDOCUMENTED_ENTITIES.has(e)) continue;
    if (!atlas.includes(`\`${e}\``) && !atlas.includes(` ${e} `) && !atlas.includes(`${e}.`)) {
      missingEntities.push(e);
    }
  }

  let failed = false;

  if (missingTables.length > 0) {
    console.error('Postgres tables declared in schema/migrations but NOT mentioned in any Atlas page:');
    for (const t of missingTables.sort()) console.error(`  - ${t}`);
    console.error(
      '\nAdd each table to docs/atlas/postgres-infra-tables.md (compact summary) or' +
      '\ngive it its own page under docs/atlas/. If intentional, add to' +
      '\nALLOWED_UNDOCUMENTED_TABLES in this script with a reason.\n',
    );
    failed = true;
  }

  if (missingEntities.length > 0) {
    console.error('Dataverse entity sets referenced in code but NOT mentioned in any Atlas page:');
    for (const e of missingEntities.sort()) console.error(`  - ${e}`);
    console.error(
      '\nAdd each entity to an Atlas page under docs/atlas/. If intentional,' +
      '\nadd to ALLOWED_UNDOCUMENTED_ENTITIES in this script with a reason.\n',
    );
    failed = true;
  }

  if (failed) process.exit(1);

  console.log(
    `Atlas coverage OK: ${tables.size} Postgres table(s), ${entities.size} Dataverse entity set(s).`,
  );
}

main();
