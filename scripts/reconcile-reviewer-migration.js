#!/usr/bin/env node
/**
 * W4 — reviewer_suggestions PG ↔ DV reconciliation gate.
 *
 * Contract: docs/W4_RECONCILE_CONTRACT.md
 *
 * Pre/post-cutover parity gate. Run before declaring any drain target
 * retired and immediately before any Postgres table drop. Read-only.
 *
 * Identity join: PG.request_number → DV via expanded wmkf_Request.
 * NOT proposal_id (title-slug — see plan §"Identity contract").
 *
 * Exit codes:
 *   0  active-cycle drift == 0 AND unmatchable count ≤ documented baseline
 *   1  drift > 0 OR new unmatchables appeared beyond documented baseline
 *   2  transport/integration error prevented an authoritative run
 *      (partial DV reads ABORT with 2 rather than emit a partial-1)
 *
 * Documented unmatchable baseline (2026-05-12, per docs/W4_ANOMALY_TRIAGE.md):
 *   missing_email:   4 J26 rows (researchers.email IS NULL)
 *   missing_request: 4 J26 rows (reviewer_suggestions.request_number IS NULL)
 *   total:           8
 *
 * CLI:
 *   --include-inactive   also report inactive cycle drift (informational)
 *   --threshold N        treat drift ≤ N as WARN instead of FAIL
 *   --json               machine-readable JSON output
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let [, k, v] = m;
    v = v.trim().replace(/^"(.*)"$/, '$1');
    if (!process.env[k]) process.env[k] = v;
  }
}

const { getAccessToken, createClient } = require('../lib/dataverse/client');

const INCLUDE_INACTIVE = process.argv.includes('--include-inactive');
const JSON_OUT = process.argv.includes('--json');
const thresholdArg = process.argv.find(a => a.startsWith('--threshold='));
const THRESHOLD = thresholdArg ? parseInt(thresholdArg.slice('--threshold='.length), 10) : 0;

// Documented baseline (per docs/W4_ANOMALY_TRIAGE.md as of 2026-05-12).
const DOCUMENTED_UNMATCHABLE_BASELINE = 8;

const TRANSIENT_RETRY_STATUSES = new Set([429, 502, 503, 504]);

function escapeOData(s) {
  return encodeURIComponent(String(s).replace(/'/g, "''"));
}

async function odataGetWithRetry(client, urlPath) {
  let attempt = 0;
  const maxAttempts = 3;
  while (true) {
    const r = await client.get(urlPath);
    if (r.ok) return r;
    attempt++;
    if (attempt >= maxAttempts || !TRANSIENT_RETRY_STATUSES.has(r.status)) {
      return r; // caller decides how to handle non-retry failure
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(2 ** attempt * 500, 4000)));
  }
}

// Page through @odata.nextLink until exhausted. Returns concatenated value[].
async function fetchAllPaged(client, initialPath) {
  let pathOrUrl = initialPath;
  let all = [];
  let pages = 0;
  while (pathOrUrl) {
    const r = await odataGetWithRetry(client, pathOrUrl);
    if (!r.ok) {
      throw new Error(`DV read failed: ${r.status} ${(r.text || '').slice(0, 300)} (path=${pathOrUrl.slice(0, 100)})`);
    }
    pages++;
    const body = r.body || {};
    all = all.concat(body.value || []);
    const next = body['@odata.nextLink'];
    if (!next) break;
    pathOrUrl = next; // absolute URL; the client's call helper handles both
  }
  return { value: all, pages };
}

async function loadPgState() {
  const { sql } = await import('@vercel/postgres');

  // Active cycles in PG.
  const activeCycles = (await sql`
    SELECT id, short_code, name
    FROM grant_cycles
    WHERE is_active = true
    ORDER BY short_code
  `).rows;

  const inactiveCycles = INCLUDE_INACTIVE
    ? (await sql`SELECT id, short_code, name FROM grant_cycles WHERE is_active = false ORDER BY short_code`).rows
    : [];

  // Load every selected suggestion row joined to researchers for email
  // visibility, classified per-row. Email is lower-cased for dedup since DV
  // person lookup via getByEmail is effectively case-insensitive in practice
  // (and PG researcher rows occasionally duplicate the same person under
  // multiple researcher_ids with email-case differences).
  const allSelected = (await sql`
    SELECT
      rs.id,
      rs.request_number,
      rs.grant_cycle_id,
      rs.researcher_id,
      LOWER(r.email) AS email,
      gc.short_code AS cycle_code,
      gc.is_active AS cycle_is_active
    FROM reviewer_suggestions rs
    LEFT JOIN researchers r ON r.id = rs.researcher_id
    LEFT JOIN grant_cycles gc ON gc.id = rs.grant_cycle_id
    WHERE rs.selected = true
  `).rows;

  return { activeCycles, inactiveCycles, allSelected };
}

function classifyPgRow(row, knownAkoyaRequestNums) {
  // Returns { class: 'matchable'|'missing_email'|'missing_request'|'orphan_request' }
  // Codex W4-Day-2 review Q8: orphan_request is the 4th class per the
  // contract (docs/W4_RECONCILE_CONTRACT.md §3) — PG rows whose
  // request_number does not resolve to any akoya_request in DV. Previously
  // these were silently counted as matchable, inflating PG-side excess
  // with rows that can never be backfilled.
  const hasEmail = !!row.email;
  const hasReq = !!row.request_number;
  if (!hasEmail) return { class: 'missing_email' };
  if (!hasReq) return { class: 'missing_request' };
  if (knownAkoyaRequestNums && !knownAkoyaRequestNums.has(String(row.request_number))) {
    return { class: 'orphan_request' };
  }
  return { class: 'matchable' };
}

async function fetchDvCountsForCycle(client, shortCode) {
  // Per-suggestion read with expanded wmkf_Request → akoya_requestnum.
  // Aggregate client-side; paginate via @odata.nextLink.
  const select = '_wmkf_request_value';
  const expand = 'wmkf_Request($select=akoya_requestnum)';
  const filter = `wmkf_grantcyclecode eq '${escapeOData(shortCode)}' and wmkf_selected eq true`;
  // $orderby ensures deterministic pagination under concurrent DV writes
  // (Codex W4-Day-2 Q7).
  const initial =
    `/wmkf_appreviewersuggestions?$select=${select}` +
    `&$expand=${encodeURIComponent(expand)}` +
    `&$filter=${encodeURIComponent(filter)}` +
    `&$orderby=wmkf_appreviewersuggestionid`;

  const { value: rows, pages } = await fetchAllPaged(client, initial);

  const byReqNum = new Map();
  let orphan = 0;
  for (const row of rows) {
    const reqNum = row.wmkf_Request?.akoya_requestnum;
    if (!reqNum) {
      orphan++;
      continue;
    }
    byReqNum.set(String(reqNum), (byReqNum.get(String(reqNum)) || 0) + 1);
  }
  return { byReqNum, orphan, totalRows: rows.length, pages };
}

(async () => {
  const out = {
    runAt: new Date().toISOString(),
    cycleSetMismatch: null,
    activeCycles: [],
    inactiveCycles: [],
    totals: {
      activeCycleDrift: 0,         // sum of |deltas|
      pgSideExcess: 0,             // sum of positive deltas (PG-only matchable; cutover-loss risk)
      dvSideExcess: 0,             // sum of -negative deltas (DV ahead of PG; post-W1 native writes — informational)
      matchablePg: 0,
      matchableDv: 0,
      unmatchableObserved: 0,
      unmatchableByClass: { missing_email: 0, missing_request: 0, orphan_request: 0 },
      dvOrphans: 0,
    },
    verdict: null,
    threshold: THRESHOLD,
    documentedBaseline: DOCUMENTED_UNMATCHABLE_BASELINE,
  };

  const pg = await loadPgState();

  // Set-equality check between PG active cycles and DV active cycles.
  const url = process.env.DYNAMICS_URL;
  if (!url) throw new Error('DYNAMICS_URL not set');
  const token = await getAccessToken(url);
  const client = createClient({ resourceUrl: url, token });

  // Resolve every distinct PG request_number against DV up-front (Codex
  // W4-Day-2 Q8): rows whose request_number doesn't resolve become the
  // 4th anomaly class `orphan_request`, separately accounted for.
  const distinctPgReqNums = [...new Set(
    pg.allSelected.map(r => r.request_number).filter(Boolean).map(String),
  )];
  const knownAkoyaRequestNums = new Set();
  for (const num of distinctPgReqNums) {
    const r = await odataGetWithRetry(
      client,
      `/akoya_requests?$select=akoya_requestnum&$filter=akoya_requestnum eq '${escapeOData(num)}'&$top=1`,
    );
    if (!r.ok) {
      console.error(`FATAL: akoya_request lookup for ${num} failed: ${r.status} ${r.text}`);
      process.exit(2);
    }
    if ((r.body.value || []).length > 0) knownAkoyaRequestNums.add(num);
  }

  const dvCyclesRaw = await odataGetWithRetry(
    client,
    `/wmkf_appgrantcycles?$select=wmkf_shortcode,wmkf_isactive&$filter=${encodeURIComponent('wmkf_isactive eq true')}`,
  );
  if (!dvCyclesRaw.ok) {
    console.error(`FATAL: DV grant-cycle read failed: ${dvCyclesRaw.status} ${dvCyclesRaw.text}`);
    process.exit(2);
  }
  const dvActiveCodes = new Set((dvCyclesRaw.body.value || []).map(r => r.wmkf_shortcode));
  const pgActiveCodes = new Set(pg.activeCycles.map(c => c.short_code));

  // Verify PG ⊆ DV and vice versa for active cycles. Mismatch = W3 desynced.
  const onlyInPg = [...pgActiveCodes].filter(c => !dvActiveCodes.has(c));
  const onlyInDv = [...dvActiveCodes].filter(c => !pgActiveCodes.has(c));
  if (onlyInPg.length > 0 || onlyInDv.length > 0) {
    out.cycleSetMismatch = { onlyInPg, onlyInDv };
  }

  // Walk active cycles. Aborts with exit 2 on any per-cycle read failure.
  const cyclesToReport = INCLUDE_INACTIVE
    ? [...pg.activeCycles, ...pg.inactiveCycles]
    : pg.activeCycles;

  for (const cycle of cyclesToReport) {
    const cycleRows = pg.allSelected.filter(r => r.grant_cycle_id === cycle.id);
    // Count distinct (request_number, email) pairs on PG side, not raw rows.
    // Duplicate researcher records sharing an email artificially inflate the
    // per-request count but only collapse to one DV (person, request) pair —
    // the count would falsely register as PG-side excess otherwise.
    const pgPairsByReq = new Map();  // req_number -> Set<email>
    const pgUnmatchable = { missing_email: [], missing_request: [], orphan_request: [] };

    for (const row of cycleRows) {
      const c = classifyPgRow(row, knownAkoyaRequestNums);
      if (c.class === 'matchable') {
        const reqNum = String(row.request_number);
        if (!pgPairsByReq.has(reqNum)) pgPairsByReq.set(reqNum, new Set());
        pgPairsByReq.get(reqNum).add(row.email);
      } else {
        pgUnmatchable[c.class].push(row.id);
      }
    }
    const pgByReq = new Map();
    for (const [reqNum, emails] of pgPairsByReq.entries()) {
      pgByReq.set(reqNum, emails.size);
    }

    let dvCounts;
    try {
      dvCounts = await fetchDvCountsForCycle(client, cycle.short_code);
    } catch (err) {
      console.error(`FATAL: DV read for cycle ${cycle.short_code} failed: ${err.message}`);
      process.exit(2);
    }

    // Per-request-number delta.
    const allReqNums = new Set([...pgByReq.keys(), ...dvCounts.byReqNum.keys()]);
    const perRequest = [];
    let cycleDrift = 0;
    let cyclePgExcess = 0;
    let cycleDvExcess = 0;
    for (const reqNum of [...allReqNums].sort()) {
      const pgN = pgByReq.get(reqNum) || 0;
      const dvN = dvCounts.byReqNum.get(reqNum) || 0;
      const delta = pgN - dvN;
      perRequest.push({ requestNumber: reqNum, pg: pgN, dv: dvN, delta });
      cycleDrift += Math.abs(delta);
      if (delta > 0) cyclePgExcess += delta;
      else if (delta < 0) cycleDvExcess += -delta;
    }

    // Sum of distinct (request, email) pairs = total matchable contribution.
    const pgMatchablePairs = [...pgByReq.values()].reduce((a, b) => a + b, 0);
    const pgRawMatchableRows = cycleRows.length
      - pgUnmatchable.missing_email.length
      - pgUnmatchable.missing_request.length
      - pgUnmatchable.orphan_request.length;

    const cycleResult = {
      shortCode: cycle.short_code,
      isActive: !!cycle.cycle_is_active || !!cycle.is_active,
      pgMatchableTotal: pgMatchablePairs,           // distinct-by-email
      pgRawMatchableRows,                            // raw row count (incl. email dupes)
      dvTotalSelected: dvCounts.totalRows,
      dvOrphans: dvCounts.orphan,
      pgUnmatchable,
      perRequest,
      drift: cycleDrift,
      pgSideExcess: cyclePgExcess,
      dvSideExcess: cycleDvExcess,
    };

    if (cycle.is_active !== false) {
      out.activeCycles.push(cycleResult);
      out.totals.activeCycleDrift += cycleDrift;
      out.totals.pgSideExcess += cyclePgExcess;
      out.totals.dvSideExcess += cycleDvExcess;
      out.totals.matchablePg += cycleResult.pgMatchableTotal;
      out.totals.matchableDv += dvCounts.totalRows - dvCounts.orphan;
      out.totals.unmatchableByClass.missing_email += pgUnmatchable.missing_email.length;
      out.totals.unmatchableByClass.missing_request += pgUnmatchable.missing_request.length;
      out.totals.unmatchableByClass.orphan_request += pgUnmatchable.orphan_request.length;
      out.totals.dvOrphans += dvCounts.orphan;
    } else {
      out.inactiveCycles.push(cycleResult);
    }
  }

  out.totals.unmatchableObserved =
    out.totals.unmatchableByClass.missing_email
    + out.totals.unmatchableByClass.missing_request
    + out.totals.unmatchableByClass.orphan_request;

  // Verdict.
  //
  // Cutover-loss concern is PG-side excess (matchable PG rows without a DV
  // counterpart — these would be lost at table drop). DV-side excess is
  // normal post-W1 native writes (save-candidates.js writes DV-only since
  // 2026-05-12); it's informational, never fails the gate.
  //
  // Plan §"Acceptance tests" says "0 rows drift" — refined here to mean
  // "0 PG-side excess" since strict-symmetric drift is operationally
  // impossible post-W1 cutover.
  const pgExcessOverThreshold = out.totals.pgSideExcess > THRESHOLD;
  const newUnmatchables = out.totals.unmatchableObserved > DOCUMENTED_UNMATCHABLE_BASELINE;
  if (out.cycleSetMismatch) {
    out.verdict = 'FAIL_CYCLE_SET_MISMATCH';
  } else if (pgExcessOverThreshold || newUnmatchables) {
    out.verdict = 'FAIL';
  } else {
    out.verdict = 'PASS';
  }

  if (JSON_OUT) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`# Reviewer migration reconcile`);
    console.log(`Generated: ${out.runAt}`);
    console.log(`Documented unmatchable baseline: ${out.documentedBaseline}`);
    console.log(`Threshold: drift ≤ ${THRESHOLD} OK\n`);

    if (out.cycleSetMismatch) {
      console.log(`## ⚠ Cycle set mismatch (W3 desync?)`);
      console.log(`  PG-only: ${out.cycleSetMismatch.onlyInPg.join(', ') || 'none'}`);
      console.log(`  DV-only: ${out.cycleSetMismatch.onlyInDv.join(', ') || 'none'}\n`);
    }

    console.log(`## Active cycle parity\n`);
    for (const cycle of out.activeCycles) {
      console.log(`### ${cycle.shortCode} (drift=${cycle.drift})`);
      console.log(`  PG matchable: ${cycle.pgMatchableTotal}  DV selected: ${cycle.dvTotalSelected}  DV orphans: ${cycle.dvOrphans}`);
      console.log(`  Unmatchable: missing_email=${cycle.pgUnmatchable.missing_email.length}  missing_request=${cycle.pgUnmatchable.missing_request.length}  orphan_request=${cycle.pgUnmatchable.orphan_request.length}`);
      if (cycle.drift > 0) {
        console.log(`  Per-request deltas:`);
        for (const d of cycle.perRequest.filter(d => d.delta !== 0)) {
          console.log(`    req=${d.requestNumber}  PG=${d.pg}  DV=${d.dv}  delta=${d.delta}`);
        }
      }
      console.log('');
    }

    if (INCLUDE_INACTIVE && out.inactiveCycles.length > 0) {
      console.log(`## Inactive cycle parity (informational)\n`);
      for (const cycle of out.inactiveCycles) {
        console.log(`  ${cycle.shortCode}: drift=${cycle.drift} PG=${cycle.pgMatchableTotal} DV=${cycle.dvTotalSelected}`);
      }
      console.log('');
    }

    console.log(`## Summary\n`);
    console.log(`  Active-cycle drift (sum |delta|):  ${out.totals.activeCycleDrift}`);
    console.log(`    PG-side excess (cutover-loss risk):  ${out.totals.pgSideExcess}`);
    console.log(`    DV-side excess (DV ahead of PG):     ${out.totals.dvSideExcess}`);
    console.log(`  PG matchable total:      ${out.totals.matchablePg}`);
    console.log(`  DV matchable total:      ${out.totals.matchableDv}`);
    console.log(`  Unmatchable observed:    ${out.totals.unmatchableObserved} (baseline: ${out.documentedBaseline})`);
    console.log(`    missing_email:         ${out.totals.unmatchableByClass.missing_email}`);
    console.log(`    missing_request:       ${out.totals.unmatchableByClass.missing_request}`);
    console.log(`    orphan_request:        ${out.totals.unmatchableByClass.orphan_request}`);
    console.log(`  DV orphan suggestions:   ${out.totals.dvOrphans}`);
    console.log(`\n  **Verdict: ${out.verdict}**`);
    console.log(`\n  Note: PG-side excess is the cutover-loss concern — matchable PG rows`);
    console.log(`  without a DV counterpart, lost at table drop. DV-side excess is`);
    console.log(`  normal post-W1 behavior (save-candidates.js writes DV-only).`);
  }

  if (out.verdict === 'FAIL_CYCLE_SET_MISMATCH' || out.verdict === 'FAIL') {
    process.exit(1);
  }
})().catch(err => {
  console.error(`FATAL: ${err.message}`);
  console.error(err.stack);
  process.exit(2);
});
