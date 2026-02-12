/**
 * Dynamics 365 Schema Mapper
 *
 * Connects to the Dynamics CRM and discovers which tables have data
 * and which fields are actually populated. Outputs a compact schema
 * map that can be baked into the Dynamics Explorer system prompt.
 *
 * Usage:
 *   node scripts/dynamics-schema-map.js
 *
 * Requires .env.local with:
 *   DYNAMICS_URL, DYNAMICS_TENANT_ID, DYNAMICS_CLIENT_ID, DYNAMICS_CLIENT_SECRET
 *
 * Output:
 *   scripts/dynamics-schema-output.json  — full detailed results
 *   Console — compact summary suitable for the system prompt
 */

const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [rawKey, ...valueParts] = trimmed.split('=');
      const key = rawKey.trim();
      if (key && valueParts.length > 0) {
        let value = valueParts.join('=').trim();
        // Strip surrounding quotes and inline comments
        if (value.startsWith('"')) {
          const endQuote = value.indexOf('"', 1);
          if (endQuote > 0) value = value.substring(1, endQuote);
        } else if (value.startsWith("'")) {
          const endQuote = value.indexOf("'", 1);
          if (endQuote > 0) value = value.substring(1, endQuote);
        } else {
          // Unquoted: strip inline comments
          const commentIdx = value.indexOf('#');
          if (commentIdx > 0) value = value.substring(0, commentIdx).trim();
        }
        process.env[key] = value;
      }
    }
  });
  console.log('Loaded environment variables from .env.local\n');
} else {
  console.error('No .env.local file found.');
  process.exit(1);
}

const DYNAMICS_URL = process.env.DYNAMICS_URL;
const TENANT_ID = process.env.DYNAMICS_TENANT_ID;
const CLIENT_ID = process.env.DYNAMICS_CLIENT_ID;
const CLIENT_SECRET = process.env.DYNAMICS_CLIENT_SECRET;

if (!DYNAMICS_URL || !TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing DYNAMICS_URL, DYNAMICS_TENANT_ID, DYNAMICS_CLIENT_ID, or DYNAMICS_CLIENT_SECRET');
  process.exit(1);
}

// ─── Auth ───

let tokenCache = { token: null, expiresAt: 0 };

async function getAccessToken() {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now + 60000) {
    return tokenCache.token;
  }

  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: `${DYNAMICS_URL}/.default`,
  });

  const resp = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token request failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  tokenCache = { token: data.access_token, expiresAt: now + data.expires_in * 1000 };
  return data.access_token;
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    'OData-Version': '4.0',
    Accept: 'application/json',
    Prefer: 'odata.include-annotations="*",odata.maxpagesize=50',
  };
}

// ─── API helpers ───

async function dynamicsGet(urlPath, token) {
  const url = `${DYNAMICS_URL}/api/data/v9.2/${urlPath}`;
  const resp = await fetch(url, { headers: headers(token) });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`GET ${urlPath} failed (${resp.status}): ${text.substring(0, 200)}`);
  }
  return resp.json();
}

async function getCount(entitySet, token) {
  const url = `${DYNAMICS_URL}/api/data/v9.2/${entitySet}/$count`;
  const resp = await fetch(url, { headers: headers(token) });
  if (!resp.ok) return -1;
  const text = await resp.text();
  return parseInt(text, 10);
}

// ─── Main ───

async function main() {
  console.log('Connecting to Dynamics 365...');
  console.log(`URL: ${DYNAMICS_URL}\n`);

  const token = await getAccessToken();
  console.log('✓ Authenticated\n');

  // Step 1: Get all entity definitions
  console.log('Step 1: Discovering entity definitions...');
  const entityDefs = await dynamicsGet(
    "EntityDefinitions?$select=LogicalName,DisplayName,EntitySetName,IsCustomEntity,IsActivity&$filter=IsPrivate eq false",
    token
  );

  const allEntities = (entityDefs.value || []).map(e => ({
    logicalName: e.LogicalName,
    displayName: e.DisplayName?.UserLocalizedLabel?.Label || e.LogicalName,
    entitySetName: e.EntitySetName,
    isCustom: e.IsCustomEntity,
    isActivity: e.IsActivity,
  }));

  console.log(`  Found ${allEntities.length} total entities\n`);

  // Step 2: Focus on custom entities + key system entities
  const systemEntities = new Set([
    'email', 'task', 'contact', 'account', 'appointment', 'phonecall',
    'annotation', 'activitypointer', 'systemuser', 'team', 'businessunit',
    'lead', 'opportunity', 'incident', 'letter',
  ]);

  const targetEntities = allEntities.filter(e => e.isCustom || systemEntities.has(e.logicalName));
  console.log(`Step 2: Checking ${targetEntities.length} custom + key system entities for data...\n`);

  // Step 3: Count records in each, skip empty ones
  const entitiesWithData = [];

  for (const entity of targetEntities) {
    try {
      const count = await getCount(entity.entitySetName, token);
      if (count > 0) {
        entitiesWithData.push({ ...entity, recordCount: count });
        console.log(`  ✓ ${entity.logicalName} (${entity.entitySetName}): ${count.toLocaleString()} records`);
      }
    } catch (err) {
      // Some entities may not be countable, skip silently
    }
  }

  console.log(`\n  ${entitiesWithData.length} entities have data\n`);

  // Step 4: For each entity with data, sample records to find populated fields
  console.log('Step 3: Sampling records to find populated fields...\n');

  const schemaMap = [];

  for (const entity of entitiesWithData) {
    try {
      const sampleSize = Math.min(entity.recordCount, 25);
      const data = await dynamicsGet(
        `${entity.entitySetName}?$top=${sampleSize}`,
        token
      );

      const records = data.value || [];
      if (records.length === 0) continue;

      // Count non-null values per field across all sample records
      const fieldCounts = {};
      const fieldSamples = {}; // Store one example value per field

      for (const record of records) {
        for (const [key, value] of Object.entries(record)) {
          // Skip OData metadata
          if (key.startsWith('@') || key.includes('odata')) continue;
          // Skip null/empty
          if (value === null || value === undefined || value === '' || value === false) continue;
          // Skip zero GUID
          if (typeof value === 'string' && /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value)) continue;

          if (!fieldCounts[key]) {
            fieldCounts[key] = 0;
            // Store a sample value (truncated)
            const sample = typeof value === 'string' ? value.substring(0, 80) : value;
            fieldSamples[key] = sample;
          }
          fieldCounts[key]++;
        }
      }

      // Sort fields by population density (most populated first)
      const populatedFields = Object.entries(fieldCounts)
        .map(([name, count]) => ({
          name,
          populatedCount: count,
          populatedPct: Math.round((count / records.length) * 100),
          sampleValue: fieldSamples[name],
        }))
        .sort((a, b) => b.populatedPct - a.populatedPct);

      // Only keep fields populated in >20% of sampled records
      const denseFields = populatedFields.filter(f => f.populatedPct >= 20);

      const entitySchema = {
        logicalName: entity.logicalName,
        displayName: entity.displayName,
        entitySetName: entity.entitySetName,
        recordCount: entity.recordCount,
        sampledRecords: records.length,
        totalFieldsFound: populatedFields.length,
        denseFieldCount: denseFields.length,
        denseFields: denseFields,
      };

      schemaMap.push(entitySchema);

      console.log(`  ${entity.logicalName}: ${denseFields.length} populated fields (of ${populatedFields.length} seen)`);

    } catch (err) {
      console.log(`  ✗ ${entity.logicalName}: ${err.message.substring(0, 60)}`);
    }
  }

  // Step 5: Write full output
  const outputPath = path.join(__dirname, 'dynamics-schema-output.json');
  fs.writeFileSync(outputPath, JSON.stringify(schemaMap, null, 2));
  console.log(`\n✓ Full schema map written to ${outputPath}\n`);

  // Step 6: Print compact summary for system prompt
  console.log('═══════════════════════════════════════════════════════════');
  console.log('COMPACT SCHEMA SUMMARY (paste into system prompt)');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Sort by record count descending
  schemaMap.sort((a, b) => b.recordCount - a.recordCount);

  for (const entity of schemaMap) {
    const fieldNames = entity.denseFields
      .filter(f => !f.name.startsWith('_') || f.name.endsWith('_value'))  // Include lookup _value fields
      .filter(f => !f.name.includes('_formatted') && !f.name.includes('_entity')) // Skip annotation suffixes
      .map(f => f.name)
      .join(', ');

    console.log(`${entity.logicalName} (${entity.entitySetName}) — ${entity.recordCount.toLocaleString()} records`);
    console.log(`  Fields: ${fieldNames}`);
    console.log();
  }

  console.log('═══════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
