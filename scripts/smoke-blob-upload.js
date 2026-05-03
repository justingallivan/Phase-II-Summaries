#!/usr/bin/env node
/**
 * Smoke test: Vercel Blob handles 25 MB uploads end-to-end.
 *
 * Why this exists: prior versions of the apps tripped over the
 * Vercel Functions 4.5 MB request body limit when uploads went
 * through a Next.js API route's body. The intake portal's upload
 * pattern bypasses functions entirely (browser -> Blob direct
 * via signed URL), so we want empirical proof that the Blob
 * ingest pipeline accepts files up to the intake portal's cap
 * (currently 20 MB for the project narrative; this smoke pads
 * to 25 MB for headroom).
 *
 * What this proves: the underlying Blob endpoint accepts a
 * 25 MB payload and serves it back byte-identical. It does NOT
 * exercise the browser-side `@vercel/blob/client` upload SDK
 * (no DOM here). That last leg requires a real browser test
 * once /apply/upload is wired. But if this smoke fails, the
 * client path certainly fails — so the function-bypass design
 * is contingent on this passing first.
 *
 * REMINDER — re-test against actual URLs once wired:
 *   - Run a 20 MB upload from a real browser through /apply/upload
 *     against a deployed preview, not localhost. Confirm the bytes
 *     never traverse our function (check Vercel function logs:
 *     /api/intake/upload-token should record a signed-token mint
 *     ~50 ms; no large payload).
 *   - Verify CORS, auth headers, and signed-URL expiry behave under
 *     production runtime, not just dev.
 *   - Repeat with a flaky-network simulation (DevTools → Slow 3G)
 *     to confirm the upload SDK's progress / error handling.
 *   - Add the resulting test to the "before launch" checklist.
 *
 * Usage: node scripts/smoke-blob-upload.js
 *
 * Requires BLOB_READ_WRITE_TOKEN in .env.local.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const [k, ...rest] = t.split('=');
    if (!k || !rest.length) continue;
    let v = rest.join('=');
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
}

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('BLOB_READ_WRITE_TOKEN missing — cannot run Blob smoke');
  process.exit(2);
}

const { put, del } = require('@vercel/blob');

const SIZE_MB = 25;
const SIZE_BYTES = SIZE_MB * 1024 * 1024;
const PATH_PREFIX = 'smoke/upload-test';

let pass = 0, fail = 0;
function check(label, cond, ...details) {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else { console.error(`  ✗ ${label}`, ...details); fail++; }
}

function fmtMb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function fmtMs(ms) {
  return `${(ms / 1000).toFixed(2)}s`;
}

async function main() {
  console.log(`1. generate ${SIZE_MB} MB of random bytes`);
  const t0 = Date.now();
  const payload = crypto.randomBytes(SIZE_BYTES);
  const sourceSha = crypto.createHash('sha256').update(payload).digest('hex');
  console.log(`     generated in ${fmtMs(Date.now() - t0)}, sha256=${sourceSha.slice(0, 16)}…`);
  check('payload is exactly the requested size', payload.length === SIZE_BYTES);

  const filename = `${PATH_PREFIX}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.bin`;
  let blob = null;

  try {
    console.log(`2. upload to Blob (${fmtMb(SIZE_BYTES)})`);
    const t1 = Date.now();
    blob = await put(filename, payload, {
      access: 'public',
      contentType: 'application/octet-stream',
      addRandomSuffix: false,
    });
    const uploadMs = Date.now() - t1;
    console.log(`     uploaded in ${fmtMs(uploadMs)} → ${blob.url}`);
    check('upload returned a url', typeof blob.url === 'string' && blob.url.startsWith('https://'));
    check('upload returned a pathname', typeof blob.pathname === 'string');
    check('upload completed under 60s', uploadMs < 60_000, `${uploadMs}ms`);

    console.log('3. download via the returned URL and verify byte-identity');
    const t2 = Date.now();
    const res = await fetch(blob.url);
    check('GET returned 200', res.status === 200, res.status);
    const got = Buffer.from(await res.arrayBuffer());
    const downloadMs = Date.now() - t2;
    console.log(`     downloaded in ${fmtMs(downloadMs)}`);
    check('downloaded size matches', got.length === SIZE_BYTES, `expected ${SIZE_BYTES}, got ${got.length}`);
    const downloadSha = crypto.createHash('sha256').update(got).digest('hex');
    check('sha256 matches source', downloadSha === sourceSha, `source=${sourceSha} downloaded=${downloadSha}`);

    // Note: Blob's CDN serves with chunked transfer encoding, so the
    // Content-Length response header is intentionally absent. The
    // authoritative size check is the byte-buffer length above.

  } finally {
    if (blob?.url) {
      console.log('5. cleanup: delete the test blob');
      try {
        await del(blob.url);
        console.log('     deleted');
        check('cleanup succeeded', true);
      } catch (e) {
        check('cleanup succeeded', false, e?.message || e);
      }
    }
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('fatal:', e?.stack || e);
  process.exit(1);
});
