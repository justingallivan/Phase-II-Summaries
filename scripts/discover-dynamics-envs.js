/**
 * List every Dataverse environment our App Registration can see via the
 * Global Discovery Service, then try a lightweight OData call on each.
 *
 * If the sandbox shows up and the probe call succeeds, we can point a second
 * DynamicsService at it and start creating tables there.
 *
 * If the sandbox does NOT show up, the App Registration isn't registered as
 * an application user in that environment — that's the thing to fix next,
 * and requires sysadmin action (add the app user to the sandbox + grant a
 * role, same procedure as prod).
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const t = line.trim(); if (!t || t.startsWith('#')) return;
  const [k, ...v] = t.split('='); if (!k || v.length === 0) return;
  let val = v.join('=');
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
  process.env[k] = val;
});

(async () => {
  const { DYNAMICS_TENANT_ID, DYNAMICS_CLIENT_ID, DYNAMICS_CLIENT_SECRET, DYNAMICS_URL } = process.env;
  if (!DYNAMICS_TENANT_ID || !DYNAMICS_CLIENT_ID || !DYNAMICS_CLIENT_SECRET) {
    console.error('Missing DYNAMICS_TENANT_ID / DYNAMICS_CLIENT_ID / DYNAMICS_CLIENT_SECRET'); process.exit(1);
  }

  console.log(`Current DYNAMICS_URL: ${DYNAMICS_URL}\n`);

  // ── Step 1: token for global discovery ──────────────────────────────────
  const discoScope = 'https://globaldisco.crm.dynamics.com/.default';
  console.log(`Requesting token for scope: ${discoScope}`);
  const tokenResp = await fetch(`https://login.microsoftonline.com/${DYNAMICS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: DYNAMICS_CLIENT_ID,
      client_secret: DYNAMICS_CLIENT_SECRET,
      scope: discoScope,
    }),
  });
  if (!tokenResp.ok) {
    const body = await tokenResp.text();
    console.error(`  ✗ Token request failed (${tokenResp.status}): ${body.slice(0, 500)}`);
    console.error('\n  If this says "AADSTS700016" or "resource principal not found": the app');
    console.error('  hasn\'t been granted access to the discovery service at all. In a Keck-style');
    console.error('  tenant this is usually fine to open — no extra admin work needed — but the');
    console.error('  workaround is to skip discovery and just probe candidate sandbox URLs directly.');
    process.exit(1);
  }
  const { access_token: discoToken } = await tokenResp.json();
  console.log(`  ✓ Got discovery token\n`);

  // ── Step 2: list instances ──────────────────────────────────────────────
  console.log('Querying Global Discovery Service for accessible instances...');
  const listResp = await fetch('https://globaldisco.crm.dynamics.com/api/discovery/v2.0/Instances', {
    headers: { Authorization: `Bearer ${discoToken}`, Accept: 'application/json' },
  });
  if (!listResp.ok) {
    console.error(`  ✗ Discovery call failed (${listResp.status}): ${(await listResp.text()).slice(0, 500)}`);
    process.exit(1);
  }
  const discoData = await listResp.json();
  const instances = discoData.value || [];
  console.log(`  ✓ Found ${instances.length} instance(s) the App Registration has access to\n`);

  if (!instances.length) {
    console.log('Zero instances means the App Registration is not an application user in ANY');
    console.log('environment visible via discovery. The sandbox needs a sysadmin to:');
    console.log('  1. Open WM Keck Sandbox in Power Platform Admin Center');
    console.log('  2. Users → Application Users → + New app user');
    console.log('  3. Select "WMK: Research Review App Suite" (client id d2e73696-...)');
    console.log('  4. Assign System Customizer (or equivalent) role');
    process.exit(0);
  }

  // ── Step 3: show what we got + probe each ───────────────────────────────
  console.log('─'.repeat(110));
  console.log(`${'Name'.padEnd(35)} ${'UrlName'.padEnd(20)} ${'Type'.padEnd(12)} ApiUrl`);
  console.log('─'.repeat(110));
  for (const inst of instances) {
    console.log(`${(inst.FriendlyName || '').padEnd(35)} ${(inst.UrlName || '').padEnd(20)} ${(inst.EnvironmentSku || inst.InstanceType || '').padEnd(12)} ${inst.ApiUrl || inst.Url || ''}`);
  }
  console.log('─'.repeat(110));
  console.log('');

  // Heuristic: flag likely sandbox + probe it
  const sandbox = instances.find(i =>
    /sandbox|test|dev/i.test(i.FriendlyName || '') ||
    /sandbox|test|dev/i.test(i.UrlName || '') ||
    (i.EnvironmentSku || '').toLowerCase() === 'sandbox' ||
    (i.InstanceType || '').toLowerCase() === 'sandbox'
  );

  if (sandbox) {
    console.log(`Likely sandbox: "${sandbox.FriendlyName}"  (${sandbox.ApiUrl || sandbox.Url})`);
    console.log('Probing with a lightweight WhoAmI call...\n');

    const sbUrl = sandbox.Url || sandbox.ApiUrl?.replace(/\/api\/data.*$/, '') || '';
    if (!sbUrl) {
      console.log('  (no base URL in discovery response — inspect output above)');
      return;
    }

    const probeTokenResp = await fetch(`https://login.microsoftonline.com/${DYNAMICS_TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: DYNAMICS_CLIENT_ID,
        client_secret: DYNAMICS_CLIENT_SECRET,
        scope: `${sbUrl}/.default`,
      }),
    });
    if (!probeTokenResp.ok) {
      console.log(`  ✗ Token request for sandbox (${sbUrl}) failed: ${probeTokenResp.status}`);
      console.log(`    ${(await probeTokenResp.text()).slice(0, 300)}`);
      return;
    }
    const { access_token: sbToken } = await probeTokenResp.json();

    const whoResp = await fetch(`${sbUrl}/api/data/v9.2/WhoAmI`, {
      headers: { Authorization: `Bearer ${sbToken}`, Accept: 'application/json' },
    });
    if (whoResp.ok) {
      const who = await whoResp.json();
      console.log(`  ✓ WhoAmI on sandbox succeeded`);
      console.log(`    UserId:         ${who.UserId}`);
      console.log(`    BusinessUnitId: ${who.BusinessUnitId}`);
      console.log(`    OrganizationId: ${who.OrganizationId}`);
      console.log(`\n  Sandbox is reachable. Set DYNAMICS_SANDBOX_URL=${sbUrl} in .env.local and`);
      console.log(`  we can extend DynamicsService to accept an env override for schema work.`);
    } else {
      console.log(`  ✗ WhoAmI on sandbox returned ${whoResp.status}: ${(await whoResp.text()).slice(0, 300)}`);
      console.log(`    App is visible via discovery but can't actually call the sandbox API.`);
      console.log(`    Usually means the app user exists in the sandbox but lacks a security role.`);
    }
  } else {
    console.log('No sandbox pattern found in the instance list. If "WM Keck Sandbox" exists in');
    console.log('Power Platform Admin Center but not here, the App Registration has not been');
    console.log('added as an application user in that environment — sysadmin task.');
  }
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
