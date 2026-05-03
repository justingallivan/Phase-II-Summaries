#!/usr/bin/env node
/**
 * Smoke test for shared/forms/phase-ii-research-2026-06/map-to-dynamics.js.
 * Confirms the mapper produces a clean plan from a valid submission and
 * surfaces the unmapped/needs-Connor list in a usable shape.
 *
 * Usage: node scripts/smoke-form-map.js
 */

const mapToDynamics = require('../shared/forms/phase-ii-research-2026-06/map-to-dynamics');
const { ATTACHMENT_TYPES } = require('../shared/forms/phase-ii-research-2026-06/schema');

let pass = 0, fail = 0;
function check(label, cond, ...details) {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else { console.error(`  ✗ ${label}`, ...details); fail++; }
}

function fileRef(name, mime, sizeMb) {
  return { filename: name, mime, blob_url: `blob://${name}`, sha256: 'a'.repeat(64), size: Math.round(sizeMb * 1024 * 1024) };
}

const data = {
  project_title: 'Test project',
  project_abstract: 'Abstract.',
  project_start_date: '2026-09-01',
  project_duration_months: 36,
  specific_aims: 'aims',
  significance: 'sig',
  innovation: 'inn',
  approach: 'app',
  risks_alternatives: 'risk',
  pi_name: 'Dr. PI',
  pi_email: 'pi@example.edu',
  co_investigators: [{ name: 'Co1', affiliation: 'Univ', role: 'Co-PI', percent_effort: 25 }],
  total_request_usd: 750000,
  budget_lines: [
    { year: 1, category: 'personnel_salary', amount_usd: 100000 },
    { year: 1, category: 'indirect',         amount_usd: 50000 },
  ],
  budget_justification_attachment: [fileRef('budget.pdf', ATTACHMENT_TYPES.pdf, 1)],
  milestones: [{ target_date: '2027-06-01', deliverable: 'Year 1 report' }],
  pi_biosketch: [fileRef('pi.pdf', ATTACHMENT_TYPES.pdf, 2)],
  facilities_resources: [fileRef('fac.pdf', ATTACHMENT_TYPES.pdf, 1)],
};

console.log('1. requestId required');
let threw = false;
try { mapToDynamics(data); } catch { threw = true; }
check('throws without requestId', threw);

console.log('2. happy path produces a 4-part plan');
const plan = mapToDynamics(data, { requestId: 'fake-guid' });
check('akoyaRequestPatch is an object', plan.akoyaRequestPatch && typeof plan.akoyaRequestPatch === 'object');
check('sharepointUploads is an array', Array.isArray(plan.sharepointUploads));
check('relatedEntityWrites is an array', Array.isArray(plan.relatedEntityWrites));
check('unmapped is an array', Array.isArray(plan.unmapped));

console.log('3. confirmed mappings land in the patch');
check('akoya_title set', plan.akoyaRequestPatch.akoya_title === 'Test project');
check('wmkf_abstract set', plan.akoyaRequestPatch.wmkf_abstract === 'Abstract.');
check('akoya_begindate set', plan.akoyaRequestPatch.akoya_begindate === '2026-09-01');
check('wmkf_phaseiisubmittedat is ISO timestamp',
  typeof plan.akoyaRequestPatch.wmkf_phaseiisubmittedat === 'string'
  && /^\d{4}-\d{2}-\d{2}T/.test(plan.akoyaRequestPatch.wmkf_phaseiisubmittedat));

console.log('4. TODO_ASK_CONNOR placeholders do NOT pollute the patch');
const polluted = Object.keys(plan.akoyaRequestPatch).filter(k => k.startsWith('TODO_'));
check('no TODO keys in patch', polluted.length === 0, polluted);

console.log('5. unmapped surfaces a Connor punch list');
const unmappedKeys = plan.unmapped.map(u => u.schemaKey).sort();
console.log(`     unmapped keys: ${unmappedKeys.join(', ')}`);
check('unmapped includes narrative fields',
  ['specific_aims', 'significance', 'innovation', 'approach', 'risks_alternatives']
    .every(k => unmappedKeys.includes(k)));
check('unmapped includes child entities',
  ['budget_lines', 'milestones', 'co_investigators'].every(k => unmappedKeys.includes(k)));

console.log('6. files routed to SharePoint, not Dynamics');
check('budget justification routed', plan.sharepointUploads.some(u =>
  u.schemaKey === 'budget_justification_attachment' && u.subfolder.startsWith('Submission/')));
check('pi biosketch routed', plan.sharepointUploads.some(u => u.schemaKey === 'pi_biosketch'));
check('all uploaded files marked reviewerVisible', plan.sharepointUploads.every(u => u.reviewerVisible === true));

console.log('7. structured tables routed to relatedEntityWrites');
const writeKeys = plan.relatedEntityWrites.map(w => w.schemaKey).sort();
check('budget_lines, co_investigators, milestones present',
  ['budget_lines', 'co_investigators', 'milestones'].every(k => writeKeys.includes(k)),
  writeKeys);
check('every related write carries parentRequestId',
  plan.relatedEntityWrites.every(w => w.parentRequestId === 'fake-guid'));

console.log('8. empty optional tables do not generate writes');
const trimmed = { ...data, prior_support_rows: [] };
const plan2 = mapToDynamics(trimmed, { requestId: 'fake-guid' });
check('prior_support_rows not in writes when empty',
  !plan2.relatedEntityWrites.some(w => w.schemaKey === 'prior_support_rows'));

console.log('\nUnmapped detail (preview of Connor punch list):');
for (const u of plan.unmapped) {
  console.log(`  - ${u.schemaKey.padEnd(28)} ${u.reason}${u.placeholder ? `  [${u.placeholder}]` : ''}`);
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
