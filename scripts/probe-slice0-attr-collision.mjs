/**
 * Pre-deploy live-metadata probe for intake-portal schema slice 0.
 *
 * Slice 0 adds net-new ATTRIBUTES to two EXISTING entities:
 *   akoya_request          : wmkf_totalothersources           (wave4-existing/akoya_request-intake-aggregates.json)
 *   wmkf_apprequestperson  : wmkf_effortpct, wmkf_biosketchurl,
 *                            wmkf_lineorder                    (wave4-existing/wmkf_apprequestperson-roster-fields.json)
 *
 * apply-dataverse-schema.js is creation-only (ensureAttribute short-circuits
 * on an existing attribute), so a name collision with a pre-existing column
 * would make the slice-0 field a SILENT no-op pointing at someone else's data.
 * The schema-review doc assigned this check to Connor (Get-CrmEntityAttributes);
 * it is a read-only metadata GET we can run ourselves.
 *
 * Read-only. One token + two EntityDefinitions GETs. No writes.
 *
 * Exit: 0 CLEAR (no collisions) · 3 BLOCK (collision found) · 1 ERROR.
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

// Proposed slice-0 net-new attributes, keyed by target existing entity.
// Logical names are lowercased schema names (Dataverse convention).
const PROPOSED = {
  akoya_request: ['wmkf_totalothersources'],
  wmkf_apprequestperson: ['wmkf_effortpct', 'wmkf_biosketchurl', 'wmkf_lineorder'],
};

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

async function attrLogicalNames(entity) {
  const url =
    `${DYNAMICS_URL}/api/data/v9.2/EntityDefinitions(LogicalName='${entity}')` +
    `/Attributes?$select=LogicalName`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-Version': '4.0' },
  });
  if (!r.ok) {
    throw new Error(`GET attributes for ${entity} failed (${r.status}): ${(await r.text()).slice(0, 300)}`);
  }
  const j = await r.json();
  return new Set((j.value || []).map((a) => String(a.LogicalName).toLowerCase()));
}

try {
  let blocked = false;
  for (const [entity, proposed] of Object.entries(PROPOSED)) {
    const existing = await attrLogicalNames(entity);
    console.log(`\n=== ${entity} — ${existing.size} existing attribute(s) ===`);
    for (const name of proposed) {
      const hit = existing.has(name);
      if (hit) {
        blocked = true;
        console.log(`  ✗ COLLISION  ${name}  — already exists on ${entity}; slice-0 add would be a silent no-op`);
      } else {
        console.log(`  ✓ clear      ${name}`);
      }
    }
  }
  if (blocked) {
    console.log('\n✗ BLOCK — at least one slice-0 attribute name collides. Rename before --execute.');
    process.exit(3);
  }
  console.log('\n✓ CLEAR — no slice-0 attribute name collides with a live column on either existing entity.');
  process.exit(0);
} catch (err) {
  console.error(`\n✗ Probe failed (state unknown — treat as NOT cleared): ${err.message}`);
  process.exit(1);
}
