#!/usr/bin/env node
/**
 * W4 acceptance sweep — runs every Day-5 gate from
 * docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md §"Revised pilot timing" W4 row.
 *
 * Gates:
 *   1. Reconcile PASS (delegates to scripts/reconcile-reviewer-migration.js)
 *   2. Suggestion backfill dry-run reports 0 to write (delegates)
 *   3. Junction backfill dry-run reports 0 to insert (delegates)
 *   4. Contact-history smoke — exercise the data layer that backs
 *      /api/reviewer-finder/contact-history against 25 random junction-
 *      backed contacts, measure P95 latency
 *   5. OData filter perf benchmarks (3 readiness-checklist queries),
 *      appended to docs/perf-log.md as warn-but-don't-fail entries
 *
 * Not implemented (deferred per Codex W4-Day-2 + plan):
 *   - $batch 50-row write smoke on wmkf_appreviewersuggestion: the prod
 *     write path is sequential (junction backfill executed 5561 rows
 *     sequentially 2026-05-07; grant-cycles backfill writes 10 rows
 *     sequentially 2026-05-12). $batch shape is unused; no test value.
 *
 * Exit code: 0 if all binary gates PASS; 1 otherwise. Perf benchmarks do
 * NOT contribute to exit code (warn-only).
 */

import { readFileSync, existsSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const envPath = join(REPO_ROOT, '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let [, k, v] = m;
    v = v.trim().replace(/^"(.*)"$/, '$1');
    if (!process.env[k]) process.env[k] = v;
  }
}

const { DynamicsService } = await import('../lib/services/dynamics-service.js');
const { bypassDynamicsRestrictions } = await import('../lib/services/dynamics-context.js');

const results = [];

async function gate(name, fn) {
  process.stdout.write(`\n## ${name}\n`);
  try {
    const r = await fn();
    const status = r.pass ? 'PASS' : 'FAIL';
    process.stdout.write(`  ${status}\n`);
    if (r.detail) for (const line of r.detail.split('\n')) process.stdout.write(`  ${line}\n`);
    results.push({ name, pass: r.pass });
  } catch (err) {
    process.stdout.write(`  FAIL — ${err.message}\n`);
    results.push({ name, pass: false });
  }
}

function runScript(name, args = []) {
  const r = spawnSync('node', [join(REPO_ROOT, 'scripts', name), ...args], { encoding: 'utf8' });
  return { exitCode: r.status, stdout: r.stdout, stderr: r.stderr };
}

function p95(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return sorted[idx];
}

console.log('# W4 Acceptance Sweep');
console.log(`Generated: ${new Date().toISOString()}`);

await bypassDynamicsRestrictions('w4-acceptance', async () => {

  // ── Gate 1: reconcile ─────────────────────────────────────────────
  await gate('1. Reconcile PASS', async () => {
    const r = runScript('reconcile-reviewer-migration.js');
    return {
      pass: r.exitCode === 0,
      detail: `Exit ${r.exitCode}. ${r.stdout.match(/Verdict: \w+/)?.[0] || 'no verdict found'}`,
    };
  });

  // ── Gate 2: suggestion backfill dry-run is no-op ──────────────────
  await gate('2. Suggestion backfill dry-run = 0 writes', async () => {
    const r = runScript('backfill-reviewer-suggestions-to-dataverse.js');
    const noWork = r.stdout.includes('No rows to backfill');
    const m = r.stdout.match(/would-create-suggestion:\s*(\d+)/);
    const wouldCreate = m ? parseInt(m[1], 10) : -1;
    return {
      pass: r.exitCode === 0 && noWork && wouldCreate === 0,
      detail: `Exit ${r.exitCode}; would-create-suggestion=${wouldCreate}; "No rows to backfill"=${noWork}`,
    };
  });

  // ── Gate 3: junction backfill dry-run is no-op ────────────────────
  await gate('3. Junction backfill dry-run = 0 inserts', async () => {
    const r = runScript('backfill-request-person-junction.js', ['--dry-run']);
    const m = r.stdout.match(/To insert:\s*(\d+)/);
    const toInsert = m ? parseInt(m[1], 10) : -1;
    const skipped = r.stdout.match(/Already in junction \(skip\):\s*(\d+)/)?.[1];
    return {
      pass: r.exitCode === 0 && toInsert === 0,
      detail: `Exit ${r.exitCode}; toInsert=${toInsert}; already-in-junction-skipped=${skipped || '?'}`,
    };
  });

  // ── Gate 4: contact-history data-layer smoke ──────────────────────
  await gate('4. Contact-history data-layer smoke (25 random contacts)', async () => {
    // Pick 25 distinct contacts from the junction. Use the live junction
    // backfill output as the contact pool. Filter is required because
    // queryRecords without filter is internally capped at 25 rows.
    const sample = await DynamicsService.queryRecords('wmkf_apprequestpersons', {
      select: '_wmkf_contact_value',
      filter: '_wmkf_contact_value ne null',
      top: 100,
    });
    const distinctContacts = [...new Set(sample.records.map(r => r._wmkf_contact_value).filter(Boolean))].slice(0, 25);

    if (distinctContacts.length < 5) {
      return { pass: false, detail: `Could not sample enough contacts: ${distinctContacts.length}` };
    }

    const timings = [];
    let hadResults = 0;
    for (const contactId of distinctContacts) {
      const start = Date.now();
      // Mirror the endpoint's UNION read strategy: junction OR projectleader.
      const [junctionRows, projLeaderRows] = await Promise.all([
        DynamicsService.queryRecords('wmkf_apprequestpersons', {
          select: 'wmkf_apprequestpersonid,_wmkf_request_value,wmkf_role,wmkf_authorposition',
          filter: `_wmkf_contact_value eq ${contactId}`,
          top: 100,
        }),
        DynamicsService.queryRecords('akoya_requests', {
          select: 'akoya_requestid,akoya_requestnum,wmkf_meetingdate',
          filter: `_wmkf_projectleader_value eq ${contactId}`,
          top: 100,
        }),
      ]);
      const elapsed = Date.now() - start;
      timings.push(elapsed);
      if (junctionRows.records.length + projLeaderRows.records.length > 0) hadResults++;
    }

    const p95Ms = p95(timings);
    const avgMs = Math.round(timings.reduce((a, b) => a + b, 0) / timings.length);

    return {
      pass: p95Ms < 1000,
      detail: `Sampled ${distinctContacts.length} contacts; ${hadResults} with junction or projectleader rows. avg=${avgMs}ms p95=${p95Ms}ms (target: P95 < 1000ms).`,
    };
  });

  // ── Gate 5: OData filter perf benchmarks (warn-only) ──────────────
  await gate('5. OData filter perf benchmarks (warn-not-fail; logged to docs/perf-log.md)', async () => {
    const benchmarks = [];

    // 5a. wmkf_appreviewersuggestion + wmkf_grantcyclecode
    {
      const samples = [];
      for (let i = 0; i < 5; i++) {
        const t = Date.now();
        const r = await DynamicsService.queryRecords('wmkf_appreviewersuggestions', {
          select: 'wmkf_appreviewersuggestionid',
          filter: `wmkf_grantcyclecode eq 'J26'`,
          top: 100,
        });
        samples.push(Date.now() - t);
      }
      benchmarks.push({ name: 'suggestion+grantcyclecode', p95: p95(samples), samples });
    }

    // 5b. wmkf_potentialreviewer + wmkf_contact
    // Pick a contact id we know is in DV (use the first one from gate 4).
    const sample = await DynamicsService.queryRecords('wmkf_potentialreviewerses', {
      select: 'wmkf_potentialreviewersid,_wmkf_contact_value',
      filter: '_wmkf_contact_value ne null',
      top: 5,
    });
    const knownContactId = sample.records[0]?._wmkf_contact_value;
    {
      const samples = [];
      if (knownContactId) {
        for (let i = 0; i < 5; i++) {
          const t = Date.now();
          await DynamicsService.queryRecords('wmkf_potentialreviewerses', {
            select: 'wmkf_potentialreviewersid',
            filter: `_wmkf_contact_value eq ${knownContactId}`,
            top: 100,
          });
          samples.push(Date.now() - t);
        }
      }
      benchmarks.push({ name: 'potentialreviewer+contact', p95: p95(samples), samples });
    }

    // 5c. wmkf_apprequestperson + wmkf_contact
    {
      const samples = [];
      if (knownContactId) {
        for (let i = 0; i < 5; i++) {
          const t = Date.now();
          await DynamicsService.queryRecords('wmkf_apprequestpersons', {
            select: 'wmkf_apprequestpersonid',
            filter: `_wmkf_contact_value eq ${knownContactId}`,
            top: 100,
          });
          samples.push(Date.now() - t);
        }
      }
      benchmarks.push({ name: 'apprequestperson+contact', p95: p95(samples), samples });
    }

    // Append to perf log.
    const perfLogPath = join(REPO_ROOT, 'docs', 'perf-log.md');
    const stamp = new Date().toISOString();
    const lines = [`\n## ${stamp} (W4 acceptance)\n`];
    for (const b of benchmarks) {
      lines.push(`- **${b.name}**: P95=${b.p95}ms over ${b.samples.length} samples [${b.samples.join(',')}]`);
    }
    if (!existsSync(perfLogPath)) {
      lines.unshift('# Dataverse perf log\n\nDated benchmark entries appended by `scripts/acceptance-w4.js` and similar acceptance scripts. P95 thresholds are environmental and not gated; these entries support trend tracking.\n');
    }
    appendFileSync(perfLogPath, lines.join('\n') + '\n');

    const overBudget = benchmarks.filter(b => b.p95 > 500);
    return {
      pass: true, // warn-only
      detail: benchmarks.map(b => `${b.name}: P95=${b.p95}ms${b.p95 > 500 ? ' ⚠ over 500ms target' : ''}`).join('\n') +
        (overBudget.length > 0 ? `\n  (${overBudget.length} of 3 over 500ms target; logged to docs/perf-log.md)` : '\n  (all within 500ms target; logged to docs/perf-log.md)'),
    };
  });

  // ── Summary ────────────────────────────────────────────────────────
  console.log('\n## Summary\n');
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass);
  console.log(`${passed} / ${results.length} gates passed.`);
  if (failed.length > 0) {
    console.log('\nFAILED gates:');
    for (const f of failed) console.log(`  - ${f.name}`);
    process.exitCode = 1;
  } else {
    console.log('\n**W4 ACCEPTANCE: PASS.**');
  }
});
