/**
 * Test Dataverse Search (Relevance Search) API
 *
 * Checks whether Dataverse Search is enabled on the Dynamics 365 instance
 * and what tables/fields are indexed for full-text search.
 *
 * Usage:
 *   node scripts/test-dataverse-search.js
 *   node scripts/test-dataverse-search.js "fungi"        # test a search term
 *
 * Requires .env.local with:
 *   DYNAMICS_URL, DYNAMICS_TENANT_ID, DYNAMICS_CLIENT_ID, DYNAMICS_CLIENT_SECRET
 */

const fs = require('fs');
const path = require('path');

// ─── Load .env.local ───

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
        if (value.startsWith('"')) {
          const endQuote = value.indexOf('"', 1);
          if (endQuote > 0) value = value.substring(1, endQuote);
        } else if (value.startsWith("'")) {
          const endQuote = value.indexOf("'", 1);
          if (endQuote > 0) value = value.substring(1, endQuote);
        } else {
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

async function getAccessToken() {
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
  return data.access_token;
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

// ─── Tests ───

/**
 * Test 1: Check if the search endpoint is reachable
 */
async function testSearchEndpoint(token) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Test 1: Dataverse Search API availability');
  console.log('═══════════════════════════════════════════════════════════\n');

  const url = `${DYNAMICS_URL}/api/search/v1.0/query`;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({
        search: '*',
        top: 1,
      }),
    });

    console.log(`  Status: ${resp.status} ${resp.statusText}`);

    if (resp.ok) {
      const data = await resp.json();
      console.log('  ✓ Dataverse Search is ENABLED and accessible');
      console.log(`  Total records indexed: ${data.totalrecordcount || 'unknown'}`);
      if (data.value && data.value.length > 0) {
        console.log(`  Sample result entity: ${data.value[0].entityname}`);
      }
      return true;
    } else {
      const text = await resp.text();
      console.log(`  ✗ Search endpoint returned error`);
      console.log(`  Response: ${text.substring(0, 500)}`);

      if (resp.status === 404) {
        console.log('\n  → Dataverse Search is likely NOT ENABLED on this instance.');
        console.log('  → An admin can enable it in Power Platform admin center → Environments → Settings → Product → Features.');
      } else if (resp.status === 403) {
        console.log('\n  → Service principal may lack search permissions.');
        console.log('  → The app registration may need the "Search" privilege in Dynamics.');
      }
      return false;
    }
  } catch (err) {
    console.log(`  ✗ Request failed: ${err.message}`);
    return false;
  }
}

/**
 * Test 2: Check search statistics / indexed tables
 */
async function testSearchStatistics(token) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('Test 2: Search statistics (indexed tables)');
  console.log('═══════════════════════════════════════════════════════════\n');

  const url = `${DYNAMICS_URL}/api/search/v1.0/statistics`;

  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: headers(token),
    });

    console.log(`  Status: ${resp.status} ${resp.statusText}`);

    if (resp.ok) {
      const data = await resp.json();
      console.log('  ✓ Statistics retrieved\n');

      if (data.Value && data.Value.StorageSizeInBytes) {
        const sizeMB = (data.Value.StorageSizeInBytes / 1024 / 1024).toFixed(2);
        console.log(`  Index size: ${sizeMB} MB`);
      }

      if (data.Value && data.Value.EntityStatusInfo) {
        console.log(`  Indexed tables (${data.Value.EntityStatusInfo.length}):\n`);
        for (const entity of data.Value.EntityStatusInfo) {
          const status = entity.entitylogicalname;
          const docCount = entity.lastdatasynctimestamp ? 'synced' : 'pending';
          const statusLabel = entity.searchstatus || entity.entitystatus || 'unknown';
          console.log(`    ${status} — ${statusLabel} (${entity.recordcount || '?'} records)`);
        }
      }

      // Write full stats for reference
      const outputPath = path.join(__dirname, 'dataverse-search-stats.json');
      fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
      console.log(`\n  Full stats written to ${outputPath}`);
      return true;
    } else {
      const text = await resp.text();
      console.log(`  ✗ Statistics endpoint returned error`);
      console.log(`  Response: ${text.substring(0, 500)}`);
      return false;
    }
  } catch (err) {
    console.log(`  ✗ Request failed: ${err.message}`);
    return false;
  }
}

/**
 * Test 3: Check autocomplete / suggest endpoints
 */
async function testSuggestEndpoint(token) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('Test 3: Suggest / autocomplete endpoint');
  console.log('═══════════════════════════════════════════════════════════\n');

  const url = `${DYNAMICS_URL}/api/search/v1.0/suggest`;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({
        search: 'university',
        top: 5,
      }),
    });

    console.log(`  Status: ${resp.status} ${resp.statusText}`);

    if (resp.ok) {
      const data = await resp.json();
      console.log('  ✓ Suggest endpoint is available');
      if (data.value && data.value.length > 0) {
        console.log(`  Suggestions for "university":`);
        for (const s of data.value.slice(0, 5)) {
          console.log(`    - [${s.entityname}] ${s.text || s.selectedfields?.name || JSON.stringify(s.selectedfields || {}).substring(0, 80)}`);
        }
      }
      return true;
    } else {
      const text = await resp.text();
      console.log(`  ✗ Suggest endpoint returned error`);
      console.log(`  Response: ${text.substring(0, 300)}`);
      return false;
    }
  } catch (err) {
    console.log(`  ✗ Request failed: ${err.message}`);
    return false;
  }
}

/**
 * Test 4: Run an actual search query — dump raw response structure first,
 * then present parsed results.
 */
async function testSearchQuery(token, searchTerm) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`Test 4: Search for "${searchTerm}"`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const url = `${DYNAMICS_URL}/api/search/v1.0/query`;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({
        search: searchTerm,
        top: 20,
        returntotalrecordcount: true,
      }),
    });

    console.log(`  Status: ${resp.status} ${resp.statusText}`);

    if (resp.ok) {
      const data = await resp.json();

      // Write raw response for inspection
      const rawPath = path.join(__dirname, 'dataverse-search-raw.json');
      fs.writeFileSync(rawPath, JSON.stringify(data, null, 2));
      console.log(`  Raw response written to ${rawPath}\n`);

      // Show top-level keys
      console.log(`  Response keys: ${Object.keys(data).join(', ')}`);
      console.log(`  totalrecordcount: ${data.totalrecordcount}`);
      console.log(`  Results returned: ${data.value?.length || 0}\n`);

      if (data.value && data.value.length > 0) {
        // Show first result's full structure
        const first = data.value[0];
        console.log('  First result structure:');
        console.log(`    Keys: ${Object.keys(first).join(', ')}`);
        console.log(`    Raw: ${JSON.stringify(first, null, 2).substring(0, 600)}\n`);

        // Group and display results by entity type
        const byEntity = {};
        for (const result of data.value) {
          const entity = result.entityname || result.objecttypecode?.toString() || 'unknown';
          if (!byEntity[entity]) byEntity[entity] = [];
          byEntity[entity].push(result);
        }

        for (const [entity, results] of Object.entries(byEntity)) {
          console.log(`  ${entity} (${results.length} results):`);
          for (const r of results.slice(0, 5)) {
            const score = r.score ? ` (score: ${r.score.toFixed(2)})` : '';
            const id = r.objectid || '?';

            // Try to find a display name from any available field
            const attrs = r.attributes || {};
            const label = attrs.name || attrs.fullname || attrs.subject ||
                          attrs.akoya_requestnum || attrs.akoya_title ||
                          attrs.wmkf_name || attrs.notetext?.substring(0, 60) || id;
            console.log(`    - ${label}${score}`);

            // Show highlights (matched text)
            if (r.highlights) {
              const hlEntries = Object.entries(r.highlights);
              for (const [field, hlValues] of hlEntries) {
                const values = Array.isArray(hlValues) ? hlValues : [hlValues];
                for (const h of values.slice(0, 2)) {
                  console.log(`      → ${field}: ...${h.substring(0, 150)}...`);
                }
              }
            }
          }
          if (results.length > 5) {
            console.log(`    ... and ${results.length - 5} more`);
          }
          console.log();
        }
      }

      // Also try with specific entity filter
      console.log('  --- Searching akoya_request specifically ---\n');
      const requestResp = await fetch(url, {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify({
          search: searchTerm,
          entities: [{ name: 'akoya_request' }],
          top: 10,
          returntotalrecordcount: true,
        }),
      });

      if (requestResp.ok) {
        const requestData = await requestResp.json();
        console.log(`  akoya_request matches: ${requestData.totalrecordcount ?? requestData.value?.length ?? 0}`);
        for (const r of (requestData.value || []).slice(0, 5)) {
          const attrs = r.attributes || {};
          const score = r.score ? ` (score: ${r.score.toFixed(2)})` : '';
          console.log(`    - Req ${attrs.akoya_requestnum || '?'}: ${attrs.akoya_requeststatus || ''} ${score}`);
          if (r.highlights) {
            for (const [field, hlValues] of Object.entries(r.highlights)) {
              const values = Array.isArray(hlValues) ? hlValues : [hlValues];
              for (const h of values.slice(0, 1)) {
                console.log(`      → ${field}: ...${h.substring(0, 150)}...`);
              }
            }
          }
        }
      } else {
        const errText = await requestResp.text();
        console.log(`  ✗ Entity-filtered search failed: ${errText.substring(0, 300)}`);
      }

      return true;
    } else {
      const text = await resp.text();
      console.log(`  ✗ Search returned error`);
      console.log(`  Response: ${text.substring(0, 500)}`);
      return false;
    }
  } catch (err) {
    console.log(`  ✗ Request failed: ${err.message}`);
    return false;
  }
}

// ─── Main ───

async function main() {
  const searchTerm = process.argv[2] || 'fungi';

  console.log('Dataverse Search API Test');
  console.log(`Instance: ${DYNAMICS_URL}`);
  console.log(`Search term: "${searchTerm}"\n`);

  const token = await getAccessToken();
  console.log('✓ Authenticated\n');

  const searchAvailable = await testSearchEndpoint(token);

  if (searchAvailable) {
    await testSearchStatistics(token);
    await testSuggestEndpoint(token);
    await testSearchQuery(token, searchTerm);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('Summary');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (searchAvailable) {
    console.log('✓ Dataverse Search IS available on this instance.');
    console.log('  We can add a search_records tool to Dynamics Explorer');
    console.log('  that provides full-text search across all indexed tables.');
  } else {
    console.log('✗ Dataverse Search is NOT available.');
    console.log('  Options:');
    console.log('  1. Have a Dynamics admin enable it (recommended)');
    console.log('  2. Build multi-field OData contains() queries (slow, limited)');
    console.log('  3. Build a local search index from exported data');
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
