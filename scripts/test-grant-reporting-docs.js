#!/usr/bin/env node

/**
 * Investigate where proposal vs. report documents live for a given request.
 *
 * Theory: in AkoyaGO, "Documents" (proposals) are attached directly to the
 *        akoya_request, while "Payments and Requirements" (reports) are
 *        attached to akoya_requestpayment children. Each side has its own
 *        sharepointdocumentlocation row pointing to a different folder
 *        (and possibly a different document library).
 *
 * Usage: node scripts/test-grant-reporting-docs.js [requestNumber]
 *   Default: 993879
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { GraphService } from '../lib/services/graph-service.js';

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
  } catch (e) {}
}

const { DYNAMICS_URL, DYNAMICS_TENANT_ID, DYNAMICS_CLIENT_ID, DYNAMICS_CLIENT_SECRET } = process.env;

if (!DYNAMICS_URL || !DYNAMICS_TENANT_ID || !DYNAMICS_CLIENT_ID || !DYNAMICS_CLIENT_SECRET) {
  console.error('Missing Dynamics environment variables');
  process.exit(1);
}

const REQUEST_NUMBER = process.argv[2] || '993879';

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
  return (await resp.json()).access_token;
}

const headers = (token) => ({
  Authorization: `Bearer ${token}`,
  'OData-Version': '4.0',
  Accept: 'application/json',
  Prefer: 'odata.include-annotations="*"',
});

async function query(token, path) {
  const url = `${DYNAMICS_URL}/api/data/v9.2/${path}`;
  const resp = await fetch(url, { headers: headers(token) });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Query failed (${resp.status}): ${text.slice(0, 300)}`);
  }
  return resp.json();
}

async function resolveParentLibrary(token, parentIds) {
  if (!parentIds.length) return null;
  const filter = parentIds.map(id => `sharepointdocumentlocationid eq ${id}`).join(' or ');
  const data = await query(
    token,
    `sharepointdocumentlocations?$filter=${encodeURIComponent(filter)}&$select=name,relativeurl&$top=10`,
  );
  return data.value?.[0]?.relativeurl || null;
}

async function listLocationsFor(token, regardingId, label) {
  const data = await query(
    token,
    `sharepointdocumentlocations?$filter=_regardingobjectid_value eq '${regardingId}'&$select=name,relativeurl,_parentsiteorlocation_value&$top=20`,
  );
  console.log(`  ${label}: ${data.value?.length || 0} sharepointdocumentlocation row(s)`);
  if (!data.value?.length) return;

  // Resolve parent library for each unique parent
  const parents = [...new Set(data.value.map(r => r._parentsiteorlocation_value).filter(Boolean))];
  const library = await resolveParentLibrary(token, parents);

  for (const loc of data.value) {
    console.log(`    • name        : ${loc.name}`);
    console.log(`      relativeurl : ${loc.relativeurl}`);
    console.log(`      library     : ${library || '(unresolved)'}`);
    console.log(`      parent_id   : ${loc._parentsiteorlocation_value || '(none)'}`);

    if (library && loc.relativeurl) {
      try {
        const files = await GraphService.listFiles(library, loc.relativeurl);
        if (!files.length) {
          console.log(`      files       : (empty folder)`);
        } else {
          console.log(`      files       : ${files.length} file(s)`);
          for (const f of files) {
            console.log(`        - ${f.name}  (${f.size || '?'} bytes)`);
          }
        }
      } catch (e) {
        console.log(`      files       : ERROR ${e.message}`);
      }
    }
  }
}

async function main() {
  console.log(`\n=== Grant Reporting Document Investigation: Request ${REQUEST_NUMBER} ===\n`);
  const token = await getToken();
  console.log('✓ Authenticated\n');

  // 1. Look up the request
  const reqData = await query(
    token,
    `akoya_requests?$filter=akoya_requestnum eq '${REQUEST_NUMBER}'&$select=akoya_requestid,akoya_requestnum,akoya_title&$top=1`,
  );
  if (!reqData.value?.length) {
    console.error(`No request found with number ${REQUEST_NUMBER}`);
    process.exit(1);
  }
  const request = reqData.value[0];
  const requestId = request.akoya_requestid;
  console.log(`Request:  ${request.akoya_requestnum} — ${request.akoya_title || '(untitled)'}`);
  console.log(`GUID:     ${requestId}\n`);

  // 2. Document locations attached DIRECTLY to the request (this is what the
  //    current lookup-grant.js queries — should yield the proposal "Documents" folder)
  console.log('--- Direct attachments on akoya_request (current lookup-grant logic) ---');
  await listLocationsFor(token, requestId, 'akoya_request');
  console.log('');

  // 3. Find related akoya_requestpayment records ("Payments and Requirements")
  console.log('--- Related akoya_requestpayment records ---');
  const payData = await query(
    token,
    `akoya_requestpayments?$filter=_akoya_requestlookup_value eq '${requestId}'&$select=akoya_requestpaymentid,akoya_paymentnum,akoya_type,createdon&$orderby=createdon desc&$top=50`,
  );
  console.log(`  ${payData.value?.length || 0} payment/requirement record(s) found\n`);

  for (const pay of (payData.value || [])) {
    const typeLabel = pay['akoya_type@OData.Community.Display.V1.FormattedValue'] || pay.akoya_type;
    console.log(`  ─── ${pay.akoya_paymentnum} (${typeLabel}) ───`);
    console.log(`      created: ${pay['createdon@OData.Community.Display.V1.FormattedValue'] || pay.createdon}`);
    await listLocationsFor(token, pay.akoya_requestpaymentid, 'akoya_requestpayment');
    console.log('');
  }

  console.log('=== Done ===\n');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
