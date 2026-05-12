#!/usr/bin/env node
// Quick debug probe: verify why backfill script's lookup returns 0 already-in-DV.

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let [, k, v] = m;
    v = v.trim().replace(/^"(.*)"$/, '$1');
    if (!process.env[k]) process.env[k] = v;
  }
}

const { DynamicsService } = await import('../lib/services/dynamics-service.js');
const { bypassDynamicsRestrictions } = await import('../lib/services/dynamics-context.js');
const potentialReviewerAdapter = await import('../lib/dataverse/adapters/potential-reviewer.js');
const reviewerSuggestionAdapter = await import('../lib/dataverse/adapters/reviewer-suggestion.js');

await bypassDynamicsRestrictions('probe', async () => {
  // 1. Find Harcombe by email (known matched to DV per parity).
  console.log('1. potentialReviewerAdapter.getByEmail("harcombe@umn.edu"):');
  const person = await potentialReviewerAdapter.getByEmail('harcombe@umn.edu');
  console.log(person ? `  found id=${person.wmkf_potentialreviewerid} name=${person.wmkf_name}` : '  NOT FOUND');
  if (!person) return;

  // 2. Resolve req 1002365.
  console.log('\n2. Resolve akoya_request akoya_requestnum=1002365:');
  const reqs = await DynamicsService.queryRecords('akoya_requests', {
    select: ['akoya_requestid', 'akoya_requestnum'],
    filter: "akoya_requestnum eq '1002365'",
    top: 1,
  });
  console.log(reqs.records.length ? `  found id=${reqs.records[0].akoya_requestid}` : '  NOT FOUND');
  if (!reqs.records.length) return;
  const requestId = reqs.records[0].akoya_requestid;

  // 3. findByPotentialReviewerAndRequest:
  console.log('\n3. reviewerSuggestionAdapter.findByPotentialReviewerAndRequest:');
  const sug = await reviewerSuggestionAdapter.findByPotentialReviewerAndRequest(
    person.wmkf_potentialreviewerid,
    requestId,
  );
  console.log(sug ? `  FOUND id=${sug.wmkf_appreviewersuggestionid} selected=${sug.wmkf_selected}` : '  NOT FOUND');

  // 4. Raw query — find any suggestion for this person.
  console.log('\n4. Raw: all suggestions for this person:');
  const all = await DynamicsService.queryRecords('wmkf_appreviewersuggestions', {
    select: 'wmkf_appreviewersuggestionid,_wmkf_request_value,_wmkf_potentialreviewer_value,wmkf_grantcyclecode,wmkf_selected',
    filter: `_wmkf_potentialreviewer_value eq ${person.wmkf_potentialreviewerid}`,
    top: 10,
  });
  console.log(`  ${all.records.length} suggestion rows`);
  for (const s of all.records) {
    console.log(`    sugId=${s.wmkf_appreviewersuggestionid} _req=${s._wmkf_request_value} cycle=${s.wmkf_grantcyclecode} selected=${s.wmkf_selected}`);
  }
});
