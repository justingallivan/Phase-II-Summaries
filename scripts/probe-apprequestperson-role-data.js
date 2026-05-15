#!/usr/bin/env node

/**
 * Pre-deploy live-data probe for intake-portal schema slice 0.
 *
 * Slice 0 extends `wmkf_apprequestperson.wmkf_role` from 2 → 5 option
 * values (adds 100000002 / 100000003 / 100000004). Adding new option
 * values at numeric slots that ALREADY hold orphaned live data would
 * silently re-map existing rows to the wrong meaning.
 *
 * This script answers the BLOCKING question in SESSION carryover item B:
 *   "confirm no live values occupy 100000002-100000004 on
 *    wmkf_apprequestperson.wmkf_role before slice 0."
 *
 * The metadata option-set probe (scripts/probe-picklist.js) only shows
 * which values are *defined*. Dataverse can retain orphaned numeric
 * values on rows after an option is deleted, so a row-data probe is
 * required in addition to the definition probe.
 *
 * Read-only. Two OData GETs against the data API; no writes.
 *
 * Usage:
 *   node scripts/probe-apprequestperson-role-data.js
 *
 * Exit codes:
 *   0  CLEAR  — no rows occupy 100000002-100000004; slice 0 safe to deploy
 *   3  BLOCK  — rows found in the target range; do NOT deploy slice 0
 *   1  ERROR  — credential / network / API failure (state unknown)
 *
 * Reads Dynamics credentials from .env or .env.local.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

for (const envFile of ['.env', '.env.local']) {
  try {
    const c = readFileSync(resolve(process.cwd(), envFile), 'utf8');
    for (const line of c.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {}
}

const { DYNAMICS_URL, DYNAMICS_TENANT_ID, DYNAMICS_CLIENT_ID, DYNAMICS_CLIENT_SECRET } = process.env;
if (!DYNAMICS_URL || !DYNAMICS_TENANT_ID || !DYNAMICS_CLIENT_ID || !DYNAMICS_CLIENT_SECRET) {
  console.error('Missing Dynamics credentials in env');
  process.exit(1);
}

const ENTITY_SET = 'wmkf_apprequestpersons';
const FIELD = 'wmkf_role';
const TARGET_VALUES = [100000002, 100000003, 100000004];

const tokenResp = await fetch(
  `https://login.microsoftonline.com/${DYNAMICS_TENANT_ID}/oauth2/v2.0/token`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: DYNAMICS_CLIENT_ID,
      client_secret: DYNAMICS_CLIENT_SECRET,
      scope: `${DYNAMICS_URL}/.default`,
    }).toString(),
  },
);
const token = (await tokenResp.json()).access_token;
if (!token) {
  console.error('Failed to acquire token');
  process.exit(1);
}

async function odataGet(urlPath, extraHeaders = {}) {
  const r = await fetch(`${DYNAMICS_URL}/api/data/v9.2/${urlPath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'OData-Version': '4.0',
      ...extraHeaders,
    },
  });
  if (!r.ok) {
    throw new Error(`GET ${urlPath} failed (${r.status}): ${(await r.text()).slice(0, 300)}`);
  }
  return r.json();
}

try {
  // 1. Full value distribution across all live rows (groupby aggregate).
  //    Surfaces ANY value present, including orphaned/out-of-definition ones.
  const dist = await odataGet(
    `${ENTITY_SET}?$apply=groupby((${FIELD}),aggregate($count as cnt))`,
    { Prefer: 'odata.include-annotations="*"' },
  );
  const rows = (dist.value || []).map(r => ({
    value: r[FIELD],
    count: r.cnt,
  })).sort((a, b) => (a.value ?? -1) - (b.value ?? -1));

  console.log(`\n=== ${ENTITY_SET}.${FIELD} — live value distribution ===`);
  let total = 0;
  for (const r of rows) {
    total += r.count;
    console.log(`  ${String(r.value).padEnd(12)} ${String(r.count).padStart(7)} rows`);
  }
  console.log(`  ${'TOTAL'.padEnd(12)} ${String(total).padStart(7)} rows`);

  // 2. Precise BLOCKING check: any row with wmkf_role in the slice-0 range.
  const filter = TARGET_VALUES.map(v => `${FIELD} eq ${v}`).join(' or ');
  const occupied = await odataGet(
    `${ENTITY_SET}?$select=wmkf_apprequestpersonid,${FIELD}&$filter=${encodeURIComponent(filter)}&$top=50`,
  );
  const hits = occupied.value || [];

  console.log(`\n=== Slice-0 target slots ${TARGET_VALUES.join(' / ')} ===`);
  if (hits.length === 0) {
    console.log('  ✓ CLEAR — no live rows occupy 100000002-100000004.');
    console.log('  Slice 0 (role enum 2 → 5 values) is safe to deploy on this axis.');
    process.exit(0);
  } else {
    console.log(`  ✗ BLOCK — ${hits.length}${hits.length === 50 ? '+' : ''} live row(s) occupy the target range:`);
    for (const h of hits.slice(0, 20)) {
      console.log(`    ${h.wmkf_apprequestpersonid}  ${FIELD}=${h[FIELD]}`);
    }
    console.log('  Do NOT deploy slice 0 until these are reconciled.');
    process.exit(3);
  }
} catch (err) {
  console.error(`\n✗ Probe failed (state unknown — treat as NOT cleared): ${err.message}`);
  process.exit(1);
}
