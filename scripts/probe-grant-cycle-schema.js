#!/usr/bin/env node
/**
 * W3 verification probe — confirm the wmkf_appgrantcycle schema patch
 * landed: 11 spec'd attributes (plus DisplayName + the virtual
 * `wmkf_isactiveName`, which Dataverse adds automatically for Boolean
 * columns; total custom-attribute count is 13) + 2 alternate keys
 * (wmkf_fiscalyearcode, wmkf_shortcode), with both alt-keys in Active
 * state.
 *
 * Does NOT verify attribute MaxLength or RequiredLevel — acceptable for
 * one-shot W3 preflight per Codex S147 step-3 review Q4; tighten if this
 * is ever promoted to a CI gate.
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

async function getToken() {
  const r = await fetch(`https://login.microsoftonline.com/${process.env.DYNAMICS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.DYNAMICS_CLIENT_ID,
      client_secret: process.env.DYNAMICS_CLIENT_SECRET,
      scope: `${process.env.DYNAMICS_URL}/.default`,
    }),
  });
  if (!r.ok) throw new Error(`Token: ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}

async function odata(token, urlPath) {
  const r = await fetch(`${process.env.DYNAMICS_URL}/api/data/v9.2${urlPath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
    },
  });
  if (!r.ok) throw new Error(`${urlPath}: ${r.status} ${await r.text()}`);
  return r.json();
}

(async () => {
  const token = await getToken();

  console.log('# wmkf_appgrantcycle schema verification\n');

  // List custom attributes
  const attrs = await odata(
    token,
    "/EntityDefinitions(LogicalName='wmkf_appgrantcycle')/Attributes?$select=LogicalName,SchemaName,AttributeType&$filter=IsCustomAttribute eq true",
  );
  const customAttrs = (attrs.value || []).sort((a, b) => a.SchemaName.localeCompare(b.SchemaName));
  console.log(`## Custom attributes (${customAttrs.length})\n`);
  console.log('| SchemaName | LogicalName | Type |');
  console.log('|---|---|---|');
  for (const a of customAttrs) {
    console.log(`| ${a.SchemaName} | ${a.LogicalName} | ${a.AttributeType} |`);
  }
  console.log('');

  // List alternate keys
  const keys = await odata(
    token,
    "/EntityDefinitions(LogicalName='wmkf_appgrantcycle')/Keys?$select=LogicalName,SchemaName,KeyAttributes,EntityKeyIndexStatus",
  );
  const keyRows = keys.value || [];
  console.log(`## Alternate keys (${keyRows.length})\n`);
  console.log('| SchemaName | KeyAttributes | IndexStatus |');
  console.log('|---|---|---|');
  for (const k of keyRows) {
    console.log(`| ${k.SchemaName} | ${(k.KeyAttributes || []).join(', ')} | ${k.EntityKeyIndexStatus} |`);
  }
  console.log('');

  const requiredAttrs = [
    'wmkf_FiscalYearCode',
    'wmkf_ShortCode',
    'wmkf_ProgramName',
    'wmkf_CustomFields',
    'wmkf_MeetingDate',
    'wmkf_SummaryPages',
    'wmkf_ReviewReturnDeadline',
    'wmkf_ReviewTemplateUrl',
    'wmkf_ReviewTemplateFilename',
    'wmkf_AdditionalAttachments',
    'wmkf_IsActive',
  ];
  const presentSchemaNames = new Set(customAttrs.map(a => a.SchemaName));
  const missing = requiredAttrs.filter(n => !presentSchemaNames.has(n));
  const requiredKeys = ['wmkf_fiscalyearcode', 'wmkf_shortcode'];
  const presentKeys = new Set(keyRows.map(k => k.SchemaName));
  const missingKeys = requiredKeys.filter(k => !presentKeys.has(k));
  const inactiveKeys = keyRows.filter(k => requiredKeys.includes(k.SchemaName) && k.EntityKeyIndexStatus !== 'Active');

  console.log('## Verdict\n');
  if (missing.length === 0 && missingKeys.length === 0 && inactiveKeys.length === 0) {
    console.log('**PASS.** All 11 required attributes present, both alt-keys Active.');
  } else {
    if (missing.length > 0) console.log(`- Missing attrs: ${missing.join(', ')}`);
    if (missingKeys.length > 0) console.log(`- Missing alt-keys: ${missingKeys.join(', ')}`);
    if (inactiveKeys.length > 0) {
      console.log(`- Alt-keys NOT Active:`);
      for (const k of inactiveKeys) console.log(`  - ${k.SchemaName}: ${k.EntityKeyIndexStatus}`);
    }
    process.exitCode = 1;
  }
})().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(2);
});
