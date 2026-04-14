#!/usr/bin/env node
// One-shot: list actual wmkf_ai_* attribute names on akoya_request and on
// wmkf_ai_run so we can reconcile Connor's v3 spec against what's live.

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
  } catch (e) {}
}

const { DYNAMICS_URL, DYNAMICS_TENANT_ID, DYNAMICS_CLIENT_ID, DYNAMICS_CLIENT_SECRET } = process.env;

async function getToken() {
  const r = await fetch(`https://login.microsoftonline.com/${DYNAMICS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: DYNAMICS_CLIENT_ID,
      client_secret: DYNAMICS_CLIENT_SECRET,
      scope: `${DYNAMICS_URL}/.default`,
    }).toString(),
  });
  return (await r.json()).access_token;
}

async function listAttrs(token, logicalName) {
  const url = `${DYNAMICS_URL}/api/data/v9.2/EntityDefinitions(LogicalName='${logicalName}')/Attributes?$select=LogicalName,AttributeType,IsCustomAttribute,IsValidForUpdate`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!r.ok) {
    console.log(`[${logicalName}] FAIL: ${r.status} ${await r.text()}`);
    return [];
  }
  return (await r.json()).value || [];
}

(async () => {
  const token = await getToken();

  for (const entity of ['akoya_request', 'wmkf_ai_run']) {
    const attrs = await listAttrs(token, entity);
    const ai = attrs.filter(a => /wmkf.*ai/i.test(a.LogicalName)).sort((a, b) => a.LogicalName.localeCompare(b.LogicalName));
    console.log(`\n=== ${entity} — ${ai.length} wmkf*ai* attributes ===`);
    for (const a of ai) {
      console.log(`  ${a.LogicalName.padEnd(40)} ${a.AttributeType.padEnd(12)} update=${a.IsValidForUpdate}`);
    }
    if (entity === 'wmkf_ai_run') {
      console.log(`  (showing all ${attrs.length} attributes on wmkf_ai_run for completeness)`);
      for (const a of attrs.sort((x, y) => x.LogicalName.localeCompare(y.LogicalName))) {
        console.log(`  ${a.LogicalName.padEnd(40)} ${a.AttributeType}`);
      }
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
