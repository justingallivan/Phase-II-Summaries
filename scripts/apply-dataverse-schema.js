#!/usr/bin/env node
/**
 * Apply a Dataverse schema wave to the target environment.
 *
 * Usage:
 *   node scripts/apply-dataverse-schema.js                       # sandbox, dry-run
 *   node scripts/apply-dataverse-schema.js --execute             # sandbox, live
 *   node scripts/apply-dataverse-schema.js --target=prod --execute
 *
 * Flags:
 *   --target=sandbox|prod   (default: sandbox)
 *   --wave=1                (default: 1)
 *   --execute               Perform writes. Without this, runs dry.
 *
 * Design notes:
 *   - Idempotent: creation only, no updates. Reruns are safe.
 *   - Prod requires BOTH --target=prod AND --execute explicitly.
 *   - Solution binding: every POST/PATCH carries MSCRM.SolutionUniqueName so
 *     new artifacts land in ResearchReviewAppSuite.
 */

const fs = require('fs');
const path = require('path');
const { loadEnvLocal, getAccessToken, createClient } = require('../lib/dataverse/client');
const {
  ensurePublisher,
  ensureSolution,
  ensureEntity,
  ensureAttribute,
  ensureLookupRelationship,
  ensureAlternateKey,
} = require('../lib/dataverse/schema-apply');

loadEnvLocal();

function parseArgs(argv) {
  const out = { target: 'sandbox', wave: 1, execute: false };
  for (const a of argv.slice(2)) {
    if (a === '--execute') out.execute = true;
    else if (a.startsWith('--target=')) out.target = a.slice('--target='.length);
    else if (a.startsWith('--wave=')) out.wave = parseInt(a.slice('--wave='.length), 10);
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/apply-dataverse-schema.js [--target=sandbox|prod] [--wave=1] [--execute]');
      process.exit(0);
    } else {
      console.error(`Unknown flag: ${a}`);
      process.exit(1);
    }
  }
  return out;
}

function loadSolutionManifest() {
  const p = path.join(__dirname, '..', 'lib', 'dataverse', 'schema', 'solution.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function loadWaveSchemas(wave) {
  const dir = path.join(__dirname, '..', 'lib', 'dataverse', 'schema', `wave${wave}`);
  if (!fs.existsSync(dir)) throw new Error(`No schema directory for wave ${wave}: ${dir}`);
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ file: f, spec: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }));
}

function resourceUrl(target) {
  if (target === 'prod') {
    const u = process.env.DYNAMICS_URL;
    if (!u) throw new Error('DYNAMICS_URL not set');
    return u;
  }
  if (target === 'sandbox') {
    const u = process.env.DYNAMICS_SANDBOX_URL;
    if (!u) throw new Error('DYNAMICS_SANDBOX_URL not set');
    return u;
  }
  throw new Error(`Unknown target: ${target}`);
}

function tag(created) { return created ? '✓ created' : '· exists  '; }

async function applySpec(client, spec) {
  console.log(`\n── ${spec.name} (${spec.kind}) ──`);

  if (spec.kind === 'attributes-on-existing') {
    for (const attr of spec.attributes || []) {
      const r = await ensureAttribute(client, spec.entityLogicalName, attr);
      console.log(`  ${tag(r.created)}  attr  ${spec.entityLogicalName}.${attr.schemaName}`);
    }
    return;
  }

  if (spec.kind === 'new-entity') {
    const ent = await ensureEntity(client, spec);
    console.log(`  ${tag(ent.created)}  table ${spec.schemaName}`);

    for (const attr of spec.attributes || []) {
      const r = await ensureAttribute(client, ent.logical, attr);
      console.log(`  ${tag(r.created)}  attr  ${ent.logical}.${attr.schemaName}`);
    }
    for (const rel of spec.relationships || []) {
      const body = { ...rel, referencingEntity: ent.logical };
      const r = await ensureLookupRelationship(client, body);
      console.log(`  ${tag(r.created)}  rel   ${rel.schemaName}  (${rel.referencedEntity} → ${ent.logical})`);
    }
    for (const key of spec.alternateKeys || []) {
      const r = await ensureAlternateKey(client, ent.logical, key);
      console.log(`  ${tag(r.created)}  key   ${key.schemaName}  [${key.keyAttributes.join(', ')}]`);
    }
    return;
  }

  throw new Error(`Unknown kind: ${spec.kind}`);
}

(async () => {
  const args = parseArgs(process.argv);
  const resource = resourceUrl(args.target);
  const mode = args.execute ? 'EXECUTE' : 'DRY-RUN';
  console.log(`Target:   ${args.target} (${resource})`);
  console.log(`Wave:     ${args.wave}`);
  console.log(`Mode:     ${mode}`);
  if (args.target === 'prod' && !args.execute) {
    console.log('\n(prod + dry-run — nothing will be written)');
  }
  console.log('');

  const solutionManifest = loadSolutionManifest();
  const specs = loadWaveSchemas(args.wave);

  const token = await getAccessToken(resource);
  const client = createClient({
    resourceUrl: resource,
    token,
    solutionUniqueName: solutionManifest.uniqueName,
    dryRun: !args.execute,
  });

  console.log('━━━ Publisher + Solution ━━━');
  const pub = await ensurePublisher(client, {
    prefix: solutionManifest.publisherPrefix,
    uniqueName: solutionManifest.publisherUniqueName,
  });
  console.log(`  · publisher  ${pub.uniquename} (prefix=${pub.customizationprefix})`);

  if (!args.execute) {
    console.log(`  [dry-run] would ensure solution '${solutionManifest.uniqueName}'`);
  } else {
    const sol = await ensureSolution(client, {
      uniqueName: solutionManifest.uniqueName,
      friendlyName: solutionManifest.friendlyName,
      description: solutionManifest.description,
      publisherId: pub.publisherid,
    });
    console.log(`  ${tag(sol.created)}  solution  ${sol.uniquename}`);
  }

  console.log('\n━━━ Wave 1 artifacts ━━━');
  for (const { file, spec } of specs) {
    await applySpec(client, spec);
  }

  console.log('\n═══ Done ═══');
  if (!args.execute) {
    console.log('This was a dry run. Re-run with --execute to apply.');
  }
})().catch((e) => {
  console.error(`\nFATAL: ${e.message}`);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
