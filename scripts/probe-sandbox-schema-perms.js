/**
 * Verify the App Registration's schema-modification privileges in the sandbox.
 *
 * Three checks:
 *   1. List EntityDefinitions      — requires prvReadEntity
 *   2. Create a throwaway table    — requires prvCreateEntity
 *   3. Delete that throwaway table — requires prvDeleteEntity
 *
 * Leaves no artifact in the sandbox on success. On failure, prints the exact
 * error so we know which privilege is missing.
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

const SANDBOX_URL = process.env.DYNAMICS_SANDBOX_URL || 'https://orgd9e66399.crm.dynamics.com';
const PREFIX = 'wmkf';
const TEST_LOGICAL = `${PREFIX}_connectivitytest`;
const TEST_SCHEMA = `${PREFIX}_ConnectivityTest`;

(async () => {
  const { DYNAMICS_TENANT_ID, DYNAMICS_CLIENT_ID, DYNAMICS_CLIENT_SECRET } = process.env;
  if (!DYNAMICS_TENANT_ID || !DYNAMICS_CLIENT_ID || !DYNAMICS_CLIENT_SECRET) {
    console.error('Missing DYNAMICS_TENANT_ID / DYNAMICS_CLIENT_ID / DYNAMICS_CLIENT_SECRET'); process.exit(1);
  }
  console.log(`Target: ${SANDBOX_URL}\n`);

  // Token for the sandbox resource
  const tokResp = await fetch(`https://login.microsoftonline.com/${DYNAMICS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: DYNAMICS_CLIENT_ID,
      client_secret: DYNAMICS_CLIENT_SECRET,
      scope: `${SANDBOX_URL}/.default`,
    }),
  });
  if (!tokResp.ok) {
    console.error(`Token request failed (${tokResp.status}): ${(await tokResp.text()).slice(0, 500)}`);
    process.exit(1);
  }
  const { access_token: token } = await tokResp.json();

  const call = async (method, url, body) => {
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
    };
    if (body) headers['Content-Type'] = 'application/json';
    const resp = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { resp, text: await resp.text() };
  };

  // ── 1. List entities ────────────────────────────────────────────────────
  console.log('━━━ 1. List EntityDefinitions (prvReadEntity) ━━━');
  {
    // $top isn't supported on EntityDefinitions; $select works. Keep it narrow.
    const { resp, text } = await call('GET', `${SANDBOX_URL}/api/data/v9.2/EntityDefinitions?$select=LogicalName`);
    if (!resp.ok) {
      console.log(`  ✗ HTTP ${resp.status}: ${text.slice(0, 400)}`);
      process.exit(1);
    }
    const data = JSON.parse(text);
    const sample = data.value.slice(0, 5).map(e => e.LogicalName).join(', ');
    console.log(`  ✓ HTTP ${resp.status} — returned ${data.value.length} entities`);
    console.log(`    First 5: ${sample}\n`);
  }

  // ── 2. Create throwaway table ───────────────────────────────────────────
  console.log('━━━ 2. Create throwaway table (prvCreateEntity) ━━━');
  console.log(`  Table: ${TEST_LOGICAL}`);
  const label = (s) => ({
    '@odata.type': 'Microsoft.Dynamics.CRM.Label',
    LocalizedLabels: [{
      '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
      Label: s, LanguageCode: 1033,
    }],
  });
  const entityBody = {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: TEST_SCHEMA,
    DisplayName: label('Connectivity Test'),
    DisplayCollectionName: label('Connectivity Tests'),
    Description: label('Throwaway table — delete on sight. Created by probe-sandbox-schema-perms.js.'),
    HasActivities: false,
    HasNotes: false,
    IsActivity: false,
    OwnershipType: 'UserOwned',
    PrimaryNameAttribute: `${PREFIX}_name`,
    Attributes: [{
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: `${PREFIX}_Name`,
      RequiredLevel: { Value: 'ApplicationRequired' },
      MaxLength: 100,
      FormatName: { Value: 'Text' },
      DisplayName: label('Name'),
      IsPrimaryName: true,
    }],
  };

  {
    const { resp, text } = await call('POST', `${SANDBOX_URL}/api/data/v9.2/EntityDefinitions`, entityBody);
    if (!resp.ok) {
      console.log(`  ✗ HTTP ${resp.status}: ${text.slice(0, 600)}`);
      console.log('\n  If this is a 403: the app user needs prvCreateEntity. Grant System Customizer');
      console.log('  on the "WMK: Research Review App Suite" app user in the sandbox.');
      console.log('\n  If this is a 412 / "prefix" error: the PublisherPrefix is not "wmkf". List existing');
      console.log('  publishers via GET /api/data/v9.2/publishers to find the right prefix.');
      process.exit(1);
    }
    console.log(`  ✓ HTTP ${resp.status} — table created`);
  }

  // ── 3. Delete ───────────────────────────────────────────────────────────
  // Dataverse's metadata cache lags after create; the first DELETE typically
  // fails with EntityMetadataNotFoundException. Retry with backoff.
  console.log('\n━━━ 3. Delete the throwaway table (prvDeleteEntity) ━━━');
  {
    let deleted = false;
    for (let i = 1; i <= 6; i++) {
      await new Promise(r => setTimeout(r, i === 1 ? 1500 : 5000));
      const { resp, text } = await call(
        'DELETE',
        `${SANDBOX_URL}/api/data/v9.2/EntityDefinitions(LogicalName='${TEST_LOGICAL}')`,
      );
      if (resp.ok) {
        console.log(`  ✓ HTTP ${resp.status} — table deleted (attempt ${i})\n`);
        deleted = true; break;
      }
      const cacheLag = /EntityMetadataNotFoundException|MetadataCache|0x80040216/i.test(text);
      console.log(`  attempt ${i}: HTTP ${resp.status}${cacheLag ? ' (metadata cache lag — retrying)' : ''}`);
      if (!cacheLag) {
        console.log(`  Error is not cache-related; stopping: ${text.slice(0, 300)}`);
        process.exit(1);
      }
    }
    if (!deleted) {
      console.log(`  ✗ Gave up after 6 attempts. Table "${TEST_LOGICAL}" remains in the sandbox.`);
      process.exit(1);
    }
  }

  console.log('═══ Summary ═══');
  console.log('All three checks passed. The App Registration has full schema CRUD in the sandbox.');
  console.log('We can script the migration table creation from code.');
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
