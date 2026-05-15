#!/usr/bin/env node
/**
 * CI gate for memory/Atlas reconciliation drift.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const reportPath = path.join(repoRoot, 'docs', 'RECONCILIATION_REPORT.json');
const reconcileScript = path.join(repoRoot, 'scripts', 'reconcile-memory-claims.js');
const maxAgeMs = 24 * 60 * 60 * 1000;

function reportIsFresh() {
  if (!fs.existsSync(reportPath)) return false;
  try {
    const parsed = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const generated = Date.parse(parsed.generated);
    return Number.isFinite(generated) && Date.now() - generated < maxAgeMs;
  } catch {
    return false;
  }
}

function runReconcile() {
  const result = spawnSync(process.execPath, [reconcileScript], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    console.error(`memory drift check failed: reconcile script exited ${result.status}`);
    process.exit(result.status || 1);
  }
}

function main() {
  if (!reportIsFresh()) runReconcile();

  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch (e) {
    console.error(`memory drift check failed: unable to read valid ${path.relative(repoRoot, reportPath)}: ${e.message}`);
    process.exit(1);
  }

  const buckets = report.drift_buckets || {};
  const specWithoutEntity = buckets.spec_without_entity || [];
  if (specWithoutEntity.length > 0) {
    console.error(`memory drift check failed: ${specWithoutEntity.length} Wave 2 spec(s) probed as probe_404 in Dataverse`);
    for (const item of specWithoutEntity) console.error(`  - ${item.entity} (${item.spec_file})`);
    process.exit(1);
  }

  const largeStaleCounts = (buckets.stale_row_count || []).filter((item) => {
    const claim = Number(item.atlas_claim);
    const live = Number(item.live_count);
    if (!Number.isFinite(claim) || !Number.isFinite(live)) return false;
    if (claim === 0) return live !== 0;
    return Math.abs(live - claim) > Math.abs(claim) * 0.5;
  });
  if (largeStaleCounts.length > 0) {
    console.error(`memory drift check failed: ${largeStaleCounts.length} Atlas row-count claim(s) differ from live by >50%`);
    for (const item of largeStaleCounts) console.error(`  - ${item.entity}: atlas=${item.atlas_claim}, live=${item.live_count}`);
    process.exit(1);
  }

  // Codex#2 found: original gate ignored doc-label collisions and probe errors.
  // Both surfaced findings should fail the gate, not pass silently.
  const docCollisions = buckets.doc_label_collision || [];
  if (docCollisions.length > 0) {
    console.error(`memory drift check failed: ${docCollisions.length} doc-label collision(s) — resolve before proceeding`);
    for (const item of docCollisions) {
      console.error(`  - ${item.label || 'collision'}: ${item.summary || JSON.stringify(item)}`);
    }
    process.exit(1);
  }

  const summary = report.summary || {};
  const probeErrors = Number(summary.probe_errors) || 0;
  const unknownClaims = Number(summary.unknown) || 0;
  if (probeErrors > 0) {
    console.error(`memory drift check failed: ${probeErrors} probe error(s) — report is non-authoritative until probes succeed`);
    const notes = report.probe_notes || {};
    for (const [src, val] of Object.entries(notes)) {
      if (val && (val.status === 'error' || val.status === 'partial' || val.errors)) {
        console.error(`  - ${src}: ${typeof val === 'string' ? val : JSON.stringify(val)}`);
      }
    }
    process.exit(1);
  }

  console.log(`memory drift clean: ${summary.total_claims || 0} claims audited; ${specWithoutEntity.length} spec/entity blockers; ${largeStaleCounts.length} large row-count drifts; ${docCollisions.length} doc collisions; ${probeErrors} probe errors; ${unknownClaims} unknown.`);
}

main();
