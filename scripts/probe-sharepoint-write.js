#!/usr/bin/env node
/**
 * Probe: does the akoyaGO app registration have SharePoint write access?
 *
 * Per docs/PENDING_ADMIN_REQUESTS.md §3, IT granted Sites.ReadWrite.Selected on
 * the akoyaGO site on 2026-04-15. This script runs the verification that
 * section claimed but never actually shipped:
 *
 *   1. Resolve site + the akoya_request drive (via existing GraphService).
 *   2. PUT a tiny txt file at the library root with a unique name.
 *   3. DELETE it.
 *
 * Outputs: PASS/FAIL with the verbatim Graph response on failure so we can
 * tell "no write role" (403) apart from "site/drive can't resolve" (404) apart
 * from "auth misconfig" (401).
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

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
  } catch {}
}

const { GraphService } = await import('../lib/services/graph-service.js');

const LIBRARY = 'akoya_request';
const FILENAME = `_write_probe_${Date.now()}.txt`;
const BODY = `SharePoint write probe — ${new Date().toISOString()}\nDelete this file if you find it.\n`;

async function main() {
  console.log(`[probe] resolving site + drive for library "${LIBRARY}"...`);
  const siteId = await GraphService.getSiteId();
  const driveId = await GraphService.getDriveId(LIBRARY);
  console.log(`[probe] siteId=${siteId.slice(0, 60)}...`);
  console.log(`[probe] driveId=${driveId.slice(0, 60)}...`);

  const token = await GraphService.getAccessToken();
  const putUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodeURIComponent(FILENAME)}:/content`;

  console.log(`[probe] PUT /${FILENAME} (small text upload)...`);
  const putResp = await fetch(putUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/plain',
    },
    body: BODY,
  });

  if (!putResp.ok) {
    const text = await putResp.text();
    console.error(`\n[FAIL] PUT returned ${putResp.status} ${putResp.statusText}`);
    console.error(text);
    if (putResp.status === 403) {
      console.error('\n→ 403 typically means the per-site `write` role grant is missing.');
      console.error('  See docs/PENDING_ADMIN_REQUESTS.md §3 — IT needs to POST');
      console.error('  to /sites/{site-id}/permissions with roles=["write"].');
    }
    process.exit(1);
  }

  const item = await putResp.json();
  console.log(`[probe] PUT ok — itemId=${item.id}, size=${item.size}`);

  console.log(`[probe] DELETE /items/${item.id}...`);
  const delResp = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${item.id}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!delResp.ok && delResp.status !== 204) {
    const text = await delResp.text();
    console.error(`\n[WARN] cleanup DELETE returned ${delResp.status}: ${text}`);
    console.error(`Manually remove ${LIBRARY}/${FILENAME} from SharePoint if it persists.`);
    process.exit(2);
  }

  console.log(`[probe] DELETE ok (status ${delResp.status}).`);
  console.log('\n[PASS] SharePoint write access is working on the akoya_request library.');
}

main().catch(err => {
  console.error('\n[FAIL] unexpected error:', err.message);
  process.exit(1);
});
