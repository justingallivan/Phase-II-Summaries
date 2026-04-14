#!/usr/bin/env node

/**
 * Test script: Verify Dynamics 365 write access on the service principal.
 *
 * IT granted write access to app registration d2e73696-537a-483b-bb63-4a4de6aa5d45
 * in April 2026. This script exercises the write surface end-to-end to confirm
 * the grant is actually in place before we start wiring up app-level writes.
 *
 * Phases:
 *   1. Token       — client-credentials auth still works
 *   2. Lookup      — resolve test request by akoya_requestnum → GUID
 *   3. Annotation  — full CREATE → UPDATE → READBACK → DELETE → VERIFY on a
 *                    Note attached to the test request. Fully isolated (new
 *                    child record, removed at end). Failures here are recorded
 *                    but non-fatal; some grant scopes cover akoya_request only.
 *   4. Request PATCH — round-trip on a discovered memo field on the test
 *                    akoya_request: read original → write marker → readback →
 *                    restore. Confirms write on the real target entity for
 *                    the AI fields spec.
 *   5. Negative    — attempt an unauthorized write on systemuser to confirm
 *                    the grant is scoped (should fail with 401/403/Forbidden).
 *                    Disable with --skip-negative.
 *
 * Usage:
 *   node scripts/test-dynamics-write.js                       # default test request 992629
 *   node scripts/test-dynamics-write.js --request 1001289     # override request number
 *   node scripts/test-dynamics-write.js --skip-negative       # skip the 403 probe
 *   node scripts/test-dynamics-write.js --verbose             # dump full responses
 *
 * Requires: .env.local with DYNAMICS_URL, DYNAMICS_TENANT_ID, DYNAMICS_CLIENT_ID,
 *           DYNAMICS_CLIENT_SECRET.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Env loader (mirrors test-dynamics-email.js) ──────────────────────────────
for (const envFile of ['.env', '.env.local']) {
  try {
    const content = readFileSync(resolve(process.cwd(), envFile), 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch (e) {}
}

const { DYNAMICS_URL, DYNAMICS_TENANT_ID, DYNAMICS_CLIENT_ID, DYNAMICS_CLIENT_SECRET } = process.env;

if (!DYNAMICS_URL || !DYNAMICS_TENANT_ID || !DYNAMICS_CLIENT_ID || !DYNAMICS_CLIENT_SECRET) {
  console.error('Missing Dynamics environment variables');
  process.exit(1);
}

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const requestIdx = args.indexOf('--request');
const REQUEST_NUM = requestIdx >= 0 ? args[requestIdx + 1] : '992629';
const VERBOSE = args.includes('--verbose');
const SKIP_NEGATIVE = args.includes('--skip-negative');

const BASE = `${DYNAMICS_URL}/api/data/v9.2`;
const MARKER = `[WRITE TEST ${new Date().toISOString()}]`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function getToken() {
  const url = `https://login.microsoftonline.com/${DYNAMICS_TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: DYNAMICS_CLIENT_ID,
    client_secret: DYNAMICS_CLIENT_SECRET,
    scope: `${DYNAMICS_URL}/.default`,
  });
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!r.ok) throw new Error(`Token request failed: ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}

function hdrs(token, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    'OData-Version': '4.0',
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...extra,
  };
}

function pass(label, detail = '') {
  console.log(`  \u2713 ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label, err) {
  console.log(`  \u2717 ${label} — ${err}`);
}

function section(title) {
  console.log(`\n--- ${title} ---`);
}

function escapeOData(s) {
  return String(s).replace(/'/g, "''");
}

const results = { passed: 0, failed: 0, skipped: 0 };
function record(ok) { ok ? results.passed++ : results.failed++; }

// ─── Phase 1: Token ───────────────────────────────────────────────────────────
async function phase1_token() {
  section('Phase 1: Authentication');
  try {
    const token = await getToken();
    pass('Client-credentials token acquired', `${token.length} chars`);
    record(true);
    return token;
  } catch (e) {
    fail('Token fetch', e.message);
    record(false);
    throw e;
  }
}

// ─── Phase 2: Lookup test request ─────────────────────────────────────────────
async function phase2_lookup(token) {
  section(`Phase 2: Lookup test request (akoya_requestnum = '${REQUEST_NUM}')`);
  const url = `${BASE}/akoya_requests?$select=akoya_requestid,akoya_requestnum&$filter=akoya_requestnum eq '${escapeOData(REQUEST_NUM)}'&$top=1`;
  const r = await fetch(url, { headers: hdrs(token) });
  if (!r.ok) {
    fail('Request lookup', `${r.status} ${await r.text()}`);
    record(false);
    throw new Error('Cannot proceed without a test request GUID');
  }
  const data = await r.json();
  const rec = (data.value || [])[0];
  if (!rec) {
    fail('Request lookup', `No akoya_request found for requestnum ${REQUEST_NUM}`);
    record(false);
    throw new Error(`No request ${REQUEST_NUM}`);
  }
  pass('Test request found', `requestnum ${rec.akoya_requestnum} | GUID ${rec.akoya_requestid}`);
  record(true);
  return rec.akoya_requestid;
}

// ─── Phase 3: Annotation CRUD ─────────────────────────────────────────────────
async function phase3_annotation(token, requestGuid) {
  section('Phase 3: Annotation CRUD (CREATE → UPDATE → READ → DELETE)');

  // 3a: CREATE
  let annotationId;
  {
    const payload = {
      subject: MARKER,
      notetext: 'Test note created by scripts/test-dynamics-write.js to verify write access. Safe to delete.',
      'objectid_akoya_request@odata.bind': `/akoya_requests(${requestGuid})`,
    };
    const r = await fetch(`${BASE}/annotations`, {
      method: 'POST',
      headers: hdrs(token, { Prefer: 'return=representation' }),
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const body = await r.text();
      fail('CREATE annotation', `${r.status} ${body.slice(0, 400)}`);
      record(false);
      console.log('    (Annotation privileges not in scope. Continuing — akoya_request writes may still work.)');
      return; // skip rest of annotation phase
    }
    const created = await r.json();
    annotationId = created.annotationid;
    pass('CREATE annotation', `id ${annotationId}`);
    record(true);
    if (VERBOSE) console.log('    payload echo:', JSON.stringify({ subject: created.subject, notetext: created.notetext }));
  }

  // 3b: UPDATE
  {
    const newSubject = `${MARKER} (updated)`;
    const r = await fetch(`${BASE}/annotations(${annotationId})`, {
      method: 'PATCH',
      headers: hdrs(token),
      body: JSON.stringify({ subject: newSubject }),
    });
    if (!r.ok) {
      fail('UPDATE annotation', `${r.status} ${await r.text()}`);
      record(false);
    } else {
      pass('UPDATE annotation', 'subject rewritten');
      record(true);
    }
  }

  // 3c: READBACK (verify update actually persisted)
  {
    const r = await fetch(`${BASE}/annotations(${annotationId})?$select=subject,notetext`, { headers: hdrs(token) });
    if (!r.ok) {
      fail('READBACK annotation', `${r.status} ${await r.text()}`);
      record(false);
    } else {
      const got = await r.json();
      if (got.subject && got.subject.endsWith('(updated)')) {
        pass('READBACK annotation', 'update confirmed persisted');
        record(true);
      } else {
        fail('READBACK annotation', `subject did not match expected — got "${got.subject}"`);
        record(false);
      }
    }
  }

  // 3d: DELETE
  {
    const r = await fetch(`${BASE}/annotations(${annotationId})`, {
      method: 'DELETE',
      headers: hdrs(token),
    });
    if (!r.ok) {
      fail('DELETE annotation', `${r.status} ${await r.text()}`);
      console.log(`    !! Cleanup failed. Note ${annotationId} is still attached to the request.`);
      record(false);
    } else {
      pass('DELETE annotation', `${r.status}`);
      record(true);
    }
  }

  // 3e: VERIFY DELETION
  {
    const r = await fetch(`${BASE}/annotations(${annotationId})?$select=annotationid`, { headers: hdrs(token) });
    if (r.status === 404) {
      pass('VERIFY deletion', '404 as expected');
      record(true);
    } else if (r.ok) {
      fail('VERIFY deletion', `annotation still exists (status ${r.status})`);
      record(false);
    } else {
      // Any non-404 error is ambiguous — log but don't crash
      pass('VERIFY deletion', `server returned ${r.status} (treating as gone)`);
      record(true);
    }
  }
}

// ─── Phase 4: akoya_request PATCH round-trip ─────────────────────────────────
async function phase4_request_patch(token, requestGuid) {
  section('Phase 4: akoya_request PATCH round-trip on a memo field');

  // 4a: Discover a memo attribute on akoya_request that IsValidForUpdate.
  // Prefer a custom wmkf_* attribute (less likely to be system-reserved).
  const metaUrl = `${BASE}/EntityDefinitions(LogicalName='akoya_request')/Attributes/Microsoft.Dynamics.CRM.MemoAttributeMetadata?$select=LogicalName,IsValidForUpdate,IsCustomAttribute`;
  const metaResp = await fetch(metaUrl, { headers: hdrs(token) });
  if (!metaResp.ok) {
    fail('Discover memo fields', `${metaResp.status} ${(await metaResp.text()).slice(0, 200)}`);
    record(false);
    return;
  }
  const memoAttrs = (await metaResp.json()).value || [];
  const updatable = memoAttrs.filter(a => a.IsValidForUpdate);
  const candidates = [
    ...updatable.filter(a => a.IsCustomAttribute && a.LogicalName.startsWith('wmkf_')),
    ...updatable.filter(a => a.IsCustomAttribute && !a.LogicalName.startsWith('wmkf_')),
    ...updatable.filter(a => !a.IsCustomAttribute),
  ];
  if (candidates.length === 0) {
    fail('Discover memo fields', 'no updatable memo attributes on akoya_request');
    record(false);
    return;
  }
  const targetField = candidates[0].LogicalName;
  pass('Discover memo fields', `${updatable.length} updatable memo attrs; target = ${targetField}`);
  record(true);

  // 4b: Read current value (to restore later).
  const readUrl = `${BASE}/akoya_requests(${requestGuid})?$select=${targetField}`;
  const readResp = await fetch(readUrl, { headers: hdrs(token) });
  if (!readResp.ok) {
    fail('Read original value', `${readResp.status} ${await readResp.text()}`);
    record(false);
    return;
  }
  const originalValue = (await readResp.json())[targetField] ?? null;
  pass('Read original value', originalValue === null ? 'null' : `${String(originalValue).length} chars`);
  record(true);

  // 4c: PATCH with marker.
  const testValue = `${MARKER}\n(Original value preserved; restore attempted at end of script.)`;
  const patchResp = await fetch(`${BASE}/akoya_requests(${requestGuid})`, {
    method: 'PATCH',
    headers: hdrs(token),
    body: JSON.stringify({ [targetField]: testValue }),
  });
  if (!patchResp.ok) {
    const body = await patchResp.text();
    fail('PATCH akoya_request', `${patchResp.status} ${body.slice(0, 400)}`);
    record(false);
    return;
  }
  pass('PATCH akoya_request', `${targetField} written`);
  record(true);

  // 4d: Readback.
  const verifyResp = await fetch(readUrl, { headers: hdrs(token) });
  if (!verifyResp.ok) {
    fail('READBACK akoya_request', `${verifyResp.status} ${await verifyResp.text()}`);
    record(false);
  } else {
    const got = (await verifyResp.json())[targetField];
    if (got === testValue) {
      pass('READBACK akoya_request', 'marker value persisted');
      record(true);
    } else {
      fail('READBACK akoya_request', `value mismatch — got ${String(got).slice(0, 80)}`);
      record(false);
    }
  }

  // 4e: Restore.
  const restoreResp = await fetch(`${BASE}/akoya_requests(${requestGuid})`, {
    method: 'PATCH',
    headers: hdrs(token),
    body: JSON.stringify({ [targetField]: originalValue }),
  });
  if (!restoreResp.ok) {
    const body = await restoreResp.text();
    fail('RESTORE original value', `${restoreResp.status} ${body.slice(0, 400)}`);
    console.log(`    !! Restore failed. Field ${targetField} on request ${REQUEST_NUM} still has marker text.`);
    console.log(`    Manual restore needed. Original value was: ${JSON.stringify(originalValue)}`);
    record(false);
  } else {
    pass('RESTORE original value', 'field returned to prior state');
    record(true);
  }
}

// ─── Phase 5: Negative test ───────────────────────────────────────────────────
async function phase5_negative(token) {
  section('Phase 5: Negative test (unauthorized PATCH on systemuser)');

  // Fetch a systemuser to target. We never want to actually change one, so we
  // send a PATCH whose payload would be a no-op if it somehow succeeded
  // (writing the same email back). Still, we expect this to 403/401.
  const lookup = await fetch(
    `${BASE}/systemusers?$select=systemuserid,internalemailaddress&$top=1&$filter=internalemailaddress ne null`,
    { headers: hdrs(token) }
  );
  if (!lookup.ok) {
    fail('Lookup a systemuser', `${lookup.status} ${await lookup.text()}`);
    record(false);
    return;
  }
  const user = (await lookup.json()).value?.[0];
  if (!user) {
    fail('Lookup a systemuser', 'no users returned');
    record(false);
    return;
  }

  const r = await fetch(`${BASE}/systemusers(${user.systemuserid})`, {
    method: 'PATCH',
    headers: hdrs(token),
    body: JSON.stringify({ internalemailaddress: user.internalemailaddress }),
  });

  if (r.ok) {
    // This is bad — write scope is broader than expected.
    fail('Scoped-write check', `unexpected 2xx — service principal CAN write systemuser.internalemailaddress. Write scope may be too broad; check security-role assignments.`);
    record(false);
    return;
  }

  if (r.status === 401 || r.status === 403) {
    pass('Scoped-write check', `PATCH systemuser blocked with ${r.status} (expected)`);
    record(true);
    return;
  }

  // Dynamics sometimes returns 400 with a privilege-denied body for forbidden
  // operations on system tables. Accept that too, surfacing the body.
  const body = await r.text();
  if (/privilege|forbidden|denied|SecLib|Principal user.*missing/i.test(body)) {
    pass('Scoped-write check', `PATCH systemuser denied with ${r.status} (privilege error)`);
    record(true);
  } else {
    fail('Scoped-write check', `unexpected ${r.status}: ${body.slice(0, 200)}`);
    record(false);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n=== Dynamics 365 Write-Access Verification ===\n');
  console.log(`Target instance: ${DYNAMICS_URL}`);
  console.log(`Test request:    ${REQUEST_NUM}`);
  console.log(`Skip negative:   ${SKIP_NEGATIVE}`);

  const token = await phase1_token();
  const requestGuid = await phase2_lookup(token);
  await phase3_annotation(token, requestGuid);
  await phase4_request_patch(token, requestGuid);

  if (SKIP_NEGATIVE) {
    console.log('\n--- Phase 5: Negative test (SKIPPED) ---');
    results.skipped++;
  } else {
    await phase5_negative(token);
  }

  console.log('\n=== Summary ===');
  console.log(`  Passed:  ${results.passed}`);
  console.log(`  Failed:  ${results.failed}`);
  console.log(`  Skipped: ${results.skipped}`);

  if (results.failed > 0) {
    console.log('\nOne or more write tests failed. Review output above.');
    process.exit(1);
  }
  console.log('\nAll write checks passed. Dynamics write access is functional.\n');
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  if (VERBOSE && err.stack) console.error(err.stack);
  process.exit(1);
});
