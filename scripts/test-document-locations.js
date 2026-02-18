#!/usr/bin/env node

/**
 * Test script: Query SharePoint document locations for a Dynamics request.
 *
 * Usage: node scripts/test-document-locations.js [requestNumber]
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

if (!DYNAMICS_URL || !DYNAMICS_TENANT_ID || !DYNAMICS_CLIENT_ID || !DYNAMICS_CLIENT_SECRET) {
  console.error('Missing Dynamics environment variables');
  process.exit(1);
}

const REQUEST_NUMBER = process.argv[2] || '1001289';

async function getToken() {
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

  if (!resp.ok) throw new Error(`Token request failed: ${resp.status}`);
  const data = await resp.json();
  return data.access_token;
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    'OData-Version': '4.0',
    Accept: 'application/json',
    Prefer: 'odata.include-annotations="*"',
  };
}

async function query(token, url) {
  const resp = await fetch(url, { headers: headers(token) });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Query failed (${resp.status}): ${text}`);
  }
  return resp.json();
}

async function main() {
  console.log(`\n=== Document Location Explorer for Request ${REQUEST_NUMBER} ===\n`);

  const token = await getToken();
  console.log('✓ Authenticated to Dynamics\n');

  // Step 1: Find the request record by akoya_name (request number)
  console.log(`--- Step 1: Find request ${REQUEST_NUMBER} ---`);
  const reqUrl = `${DYNAMICS_URL}/api/data/v9.2/akoya_requests?$filter=akoya_requestnum eq '${REQUEST_NUMBER}'&$select=akoya_requestid,akoya_requestnum&$top=1`;
  const reqData = await query(token, reqUrl);

  if (!reqData.value?.length) {
    console.error(`No request found with number ${REQUEST_NUMBER}`);
    process.exit(1);
  }

  const request = reqData.value[0];
  const requestId = request.akoya_requestid;
  console.log(`  Request ID (GUID): ${requestId}`);
  console.log(`  Request Number: ${request.akoya_requestnum}\n`);

  // Step 2: Query sharepointdocumentlocation for this request
  console.log('--- Step 2: Query sharepointdocumentlocations ---');
  const locUrl = `${DYNAMICS_URL}/api/data/v9.2/sharepointdocumentlocations?$filter=_regardingobjectid_value eq '${requestId}'&$select=name,relativeurl,absoluteurl,locationtype,description,servicetype`;
  const locData = await query(token, locUrl);

  if (!locData.value?.length) {
    console.log('  No document locations found for this request.');
    console.log('  Trying broader search...\n');

    // Try without filter to see what's available
    const allLocUrl = `${DYNAMICS_URL}/api/data/v9.2/sharepointdocumentlocations?$top=5&$select=name,relativeurl,absoluteurl,_regardingobjectid_value&$orderby=createdon desc`;
    const allLocData = await query(token, allLocUrl);
    console.log(`  Found ${allLocData.value?.length || 0} recent document locations (sample):`);
    for (const loc of (allLocData.value || [])) {
      console.log(`    - Name: ${loc.name}`);
      console.log(`      RelativeURL: ${loc.relativeurl}`);
      console.log(`      AbsoluteURL: ${loc.absoluteurl || '(none)'}`);
      console.log(`      Regarding: ${loc._regardingobjectid_value || '(none)'}`);
      console.log();
    }
  } else {
    console.log(`  Found ${locData.value.length} document location(s):\n`);
    for (const loc of locData.value) {
      console.log(`  Name: ${loc.name}`);
      console.log(`  RelativeURL: ${loc.relativeurl}`);
      console.log(`  AbsoluteURL: ${loc.absoluteurl || '(none)'}`);
      console.log(`  Location Type: ${loc.locationtype}`);
      console.log(`  Service Type: ${loc.servicetype}`);
      console.log(`  Description: ${loc.description || '(none)'}`);
      console.log();
    }
  }

  // Step 3: Check for parent site locations (the root SharePoint site)
  console.log('--- Step 3: Root SharePoint sites configured ---');
  const siteUrl = `${DYNAMICS_URL}/api/data/v9.2/sharepointdocumentlocations?$filter=locationtype eq 0 and _regardingobjectid_value eq null and _parentsiteorlocation_value ne null&$top=5&$select=name,relativeurl,absoluteurl,locationtype`;
  try {
    const siteData = await query(token, siteUrl);
    console.log(`  Found ${siteData.value?.length || 0} root location(s):\n`);
    for (const site of (siteData.value || [])) {
      console.log(`  Name: ${site.name}`);
      console.log(`  RelativeURL: ${site.relativeurl}`);
      console.log(`  AbsoluteURL: ${site.absoluteurl || '(none)'}`);
      console.log();
    }
  } catch (e) {
    console.log(`  Error querying root sites: ${e.message}\n`);
  }

  // Step 4: Check SharePoint sites entity
  console.log('--- Step 4: SharePoint sites (sharepointsites) ---');
  const spSiteUrl = `${DYNAMICS_URL}/api/data/v9.2/sharepointsites?$top=5&$select=name,absoluteurl,relativeurl,parentsite,isdefault,isgridpresent`;
  try {
    const spSiteData = await query(token, spSiteUrl);
    console.log(`  Found ${spSiteData.value?.length || 0} SharePoint site(s):\n`);
    for (const site of (spSiteData.value || [])) {
      console.log(`  Name: ${site.name}`);
      console.log(`  AbsoluteURL: ${site.absoluteurl || '(none)'}`);
      console.log(`  RelativeURL: ${site.relativeurl || '(none)'}`);
      console.log(`  Is Default: ${site.isdefault}`);
      console.log();
    }
  } catch (e) {
    console.log(`  Error querying SharePoint sites: ${e.message}\n`);
  }

  // Step 5: Try the sharepointdocument virtual entity
  console.log('--- Step 5: Try sharepointdocument virtual entity ---');
  const docUrl = `${DYNAMICS_URL}/api/data/v9.2/sharepointdocuments?$filter=regardingobjectid eq '${requestId}'&$top=10`;
  try {
    const docData = await query(token, docUrl);
    console.log(`  Found ${docData.value?.length || 0} document(s):\n`);
    for (const doc of (docData.value || [])) {
      console.log(`  ${JSON.stringify(doc, null, 2)}`);
      console.log();
    }
  } catch (e) {
    console.log(`  Error (expected if virtual entity not supported via API): ${e.message}\n`);
  }

  // Step 6: Check annotations (notes with attachments)
  console.log('--- Step 6: Check annotations/notes for this request ---');
  const noteUrl = `${DYNAMICS_URL}/api/data/v9.2/annotations?$filter=_objectid_value eq '${requestId}' and isdocument eq true&$top=10&$select=filename,filesize,subject,notetext,mimetype,createdon`;
  try {
    const noteData = await query(token, noteUrl);
    console.log(`  Found ${noteData.value?.length || 0} annotation(s) with documents:\n`);
    for (const note of (noteData.value || [])) {
      console.log(`  File: ${note.filename}`);
      console.log(`  Size: ${note.filesize} bytes`);
      console.log(`  MIME: ${note.mimetype}`);
      console.log(`  Subject: ${note.subject || '(none)'}`);
      console.log(`  Created: ${note.createdon}`);
      console.log();
    }
  } catch (e) {
    console.log(`  Error querying annotations: ${e.message}\n`);
  }

  console.log('=== Done ===\n');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
