#!/usr/bin/env node

/**
 * Test script: Verify Microsoft Graph API access to SharePoint documents.
 *
 * Tests:
 * 1. Graph API token acquisition (same app registration, graph scope)
 * 2. SharePoint site resolution
 * 3. Drive (document library) listing
 * 4. File listing for a specific request folder
 *
 * Usage: node scripts/test-graph-service.js [requestNumber]
 *   Default: 1001289
 *
 * Requires: .env.local with DYNAMICS_URL, DYNAMICS_TENANT_ID, DYNAMICS_CLIENT_ID, DYNAMICS_CLIENT_SECRET
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env and .env.local
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
  } catch (e) {
    // file may not exist
  }
}

const { DYNAMICS_URL, DYNAMICS_TENANT_ID, DYNAMICS_CLIENT_ID, DYNAMICS_CLIENT_SECRET } = process.env;

if (!DYNAMICS_TENANT_ID || !DYNAMICS_CLIENT_ID || !DYNAMICS_CLIENT_SECRET) {
  console.error('Missing Azure AD environment variables');
  process.exit(1);
}

const REQUEST_NUMBER = process.argv[2] || '1001289';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

async function getGraphToken() {
  const tokenUrl = `https://login.microsoftonline.com/${DYNAMICS_TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: DYNAMICS_CLIENT_ID,
    client_secret: DYNAMICS_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
  });

  const resp = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Graph token request failed (${resp.status}): ${text}`);
  }
  const data = await resp.json();
  return data.access_token;
}

async function getDynamicsToken() {
  const tokenUrl = `https://login.microsoftonline.com/${DYNAMICS_TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: DYNAMICS_CLIENT_ID,
    client_secret: DYNAMICS_CLIENT_SECRET,
    scope: `${DYNAMICS_URL}/.default`,
  });

  const resp = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!resp.ok) throw new Error(`Dynamics token failed: ${resp.status}`);
  const data = await resp.json();
  return data.access_token;
}

function graphHeaders(token) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' };
}

function dynamicsHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'OData-Version': '4.0',
    Accept: 'application/json',
    Prefer: 'odata.include-annotations="*"',
  };
}

async function main() {
  console.log(`\n=== Graph API SharePoint Test for Request ${REQUEST_NUMBER} ===\n`);

  // Step 1: Get Graph API token
  console.log('--- Step 1: Graph API Authentication ---');
  let graphToken;
  try {
    graphToken = await getGraphToken();
    console.log('  Graph API token acquired\n');
  } catch (e) {
    console.error(`  FAILED: ${e.message}\n`);
    process.exit(1);
  }

  // Step 2: Resolve SharePoint site
  console.log('--- Step 2: Resolve SharePoint Site ---');
  const siteUrl = 'https://appriver3651007194.sharepoint.com/sites/akoyaGO';
  const parsedUrl = new URL(siteUrl);
  const graphSiteUrl = `${GRAPH_BASE}/sites/${parsedUrl.host}:${parsedUrl.pathname}`;

  let siteId;
  try {
    const resp = await fetch(graphSiteUrl, { headers: graphHeaders(graphToken) });
    if (!resp.ok) {
      const text = await resp.text();
      console.error(`  FAILED (${resp.status}): ${text}\n`);
      process.exit(1);
    }
    const site = await resp.json();
    siteId = site.id;
    console.log(`  Site ID: ${siteId}`);
    console.log(`  Display Name: ${site.displayName}`);
    console.log(`  Web URL: ${site.webUrl}\n`);
  } catch (e) {
    console.error(`  FAILED: ${e.message}\n`);
    process.exit(1);
  }

  // Step 3: List drives (document libraries)
  console.log('--- Step 3: List Document Libraries (Drives) ---');
  let drives;
  try {
    const resp = await fetch(`${GRAPH_BASE}/sites/${siteId}/drives`, { headers: graphHeaders(graphToken) });
    if (!resp.ok) {
      const text = await resp.text();
      console.error(`  FAILED (${resp.status}): ${text}\n`);
    } else {
      const data = await resp.json();
      drives = data.value || [];
      console.log(`  Found ${drives.length} drive(s):\n`);
      for (const d of drives) {
        console.log(`  Name: ${d.name}`);
        console.log(`  ID: ${d.id}`);
        console.log(`  Web URL: ${d.webUrl}`);
        console.log(`  Quota: ${d.quota?.total ? (d.quota.total / 1024 / 1024 / 1024).toFixed(1) + ' GB' : 'unknown'}`);
        console.log();
      }
    }
  } catch (e) {
    console.error(`  FAILED: ${e.message}\n`);
  }

  // Step 4: Get request GUID from Dynamics
  console.log('--- Step 4: Resolve Request in Dynamics ---');
  let requestId;
  try {
    const dynToken = await getDynamicsToken();
    const reqUrl = `${DYNAMICS_URL}/api/data/v9.2/akoya_requests?$filter=akoya_requestnum eq '${REQUEST_NUMBER}'&$select=akoya_requestid,akoya_requestnum&$top=1`;
    const resp = await fetch(reqUrl, { headers: dynamicsHeaders(dynToken) });
    const data = await resp.json();

    if (!data.value?.length) {
      console.error(`  No request found with number ${REQUEST_NUMBER}\n`);
      process.exit(1);
    }
    requestId = data.value[0].akoya_requestid;
    console.log(`  Request GUID: ${requestId}\n`);

    // Query document locations
    console.log('--- Step 5: Query Document Locations ---');
    const locUrl = `${DYNAMICS_URL}/api/data/v9.2/sharepointdocumentlocations?$filter=_regardingobjectid_value eq '${requestId}'&$select=name,relativeurl,_parentsiteorlocation_value`;
    const locResp = await fetch(locUrl, { headers: dynamicsHeaders(dynToken) });
    const locData = await locResp.json();

    if (!locData.value?.length) {
      console.log('  No document locations found.\n');
    } else {
      const loc = locData.value[0];
      console.log(`  Folder: ${loc.relativeurl}`);
      console.log(`  Parent ID: ${loc._parentsiteorlocation_value}\n`);

      // Resolve parent to get library name
      if (loc._parentsiteorlocation_value) {
        const parentUrl = `${DYNAMICS_URL}/api/data/v9.2/sharepointdocumentlocations(${loc._parentsiteorlocation_value})?$select=relativeurl,name`;
        const parentResp = await fetch(parentUrl, { headers: dynamicsHeaders(dynToken) });
        if (parentResp.ok) {
          const parent = await parentResp.json();
          console.log(`  Library (from parent): ${parent.relativeurl}\n`);

          // Step 6: List files via Graph
          console.log('--- Step 6: List Files via Graph API ---');
          if (drives) {
            const libraryName = parent.relativeurl;
            const drive = drives.find(d => d.name.toLowerCase() === libraryName.toLowerCase());

            if (!drive) {
              console.log(`  No drive matching "${libraryName}" found.`);
              console.log(`  Available: ${drives.map(d => d.name).join(', ')}\n`);
            } else {
              const folderPath = loc.relativeurl;
              const encodedPath = folderPath.split('/').map(encodeURIComponent).join('/');
              const filesUrl = `${GRAPH_BASE}/drives/${drive.id}/root:/${encodedPath}:/children?$select=name,size,lastModifiedDateTime,file,webUrl`;

              try {
                const filesResp = await fetch(filesUrl, { headers: graphHeaders(graphToken) });
                if (!filesResp.ok) {
                  const text = await filesResp.text();
                  console.error(`  FAILED (${filesResp.status}): ${text}\n`);
                } else {
                  const filesData = await filesResp.json();
                  const files = filesData.value || [];
                  console.log(`  Found ${files.length} file(s) in ${libraryName}/${folderPath}:\n`);
                  for (const f of files) {
                    const size = f.size < 1024 ? `${f.size} B`
                      : f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(1)} KB`
                      : `${(f.size / (1024 * 1024)).toFixed(1)} MB`;
                    const date = f.lastModifiedDateTime ? new Date(f.lastModifiedDateTime).toLocaleString() : '';
                    console.log(`  ${f.name}`);
                    console.log(`    Size: ${size} | Modified: ${date} | Type: ${f.file?.mimeType || 'unknown'}`);
                    console.log(`    URL: ${f.webUrl}`);
                    console.log();
                  }
                }
              } catch (e) {
                console.error(`  FAILED: ${e.message}\n`);
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.error(`  FAILED: ${e.message}\n`);
  }

  console.log('=== Done ===\n');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
