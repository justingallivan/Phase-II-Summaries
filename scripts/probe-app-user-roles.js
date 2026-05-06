#!/usr/bin/env node
// Read-only check: list security roles assigned to the # WMK: Research Review
// App Suite application user. Used to confirm Connor's Delegate role grant.

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

const APP_USER_ID = '53e97fb3-a006-f111-8406-000d3a352682';

async function getToken() {
  const tenant = process.env.DYNAMICS_TENANT_ID;
  const clientId = process.env.DYNAMICS_CLIENT_ID;
  const secret = process.env.DYNAMICS_CLIENT_SECRET;
  const resource = process.env.DYNAMICS_URL;
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: secret,
      scope: `${resource}/.default`,
    }),
  });
  if (!res.ok) throw new Error(`Token: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function main() {
  const token = await getToken();
  const url = `${process.env.DYNAMICS_URL}/api/data/v9.2/systemusers(${APP_USER_ID})/systemuserroles_association?$select=name,roleid`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!res.ok) {
    console.error(`HTTP ${res.status}:`, await res.text());
    process.exit(1);
  }
  const data = await res.json();
  const roles = (data.value || []).map(r => r.name).sort();
  console.log(`App user roles (${roles.length}):`);
  for (const r of roles) console.log(`  - ${r}`);
  const hasDelegate = roles.some(r => /delegate/i.test(r));
  console.log(`\nDelegate role present: ${hasDelegate ? 'YES ✓' : 'NO ✗'}`);
  process.exit(hasDelegate ? 0 : 2);
}

main().catch(err => { console.error(err); process.exit(1); });
