#!/usr/bin/env node
/**
 * Smoke test for shared/forms/phase-ii-research-2026-06/validate.js.
 * Pure-JS, no DB. Builds valid + invalid fixtures and asserts the
 * validator catches what it should and lets clean payloads through.
 *
 * Usage: node scripts/smoke-form-validate.js
 */

const validate = require('../shared/forms/phase-ii-research-2026-06/validate');
const { ATTACHMENT_TYPES } = require('../shared/forms/phase-ii-research-2026-06/schema');

let pass = 0, fail = 0;
function check(label, cond, ...details) {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else { console.error(`  ✗ ${label}`, ...details); fail++; }
}

function file(filename, mime, sizeMb) {
  return {
    filename,
    mime,
    blob_url: `blob://test/${filename}`,
    sha256: 'a'.repeat(64),
    size: Math.round(sizeMb * 1024 * 1024),
    uploaded_at: new Date().toISOString(),
    scanned_at: new Date().toISOString(),
  };
}

function validFixture() {
  return {
    project_title: 'Mechanism of fungal carbon allocation',
    project_abstract: 'A 400-word abstract.',
    project_start_date: '2026-09-01',
    project_duration_months: 36,

    specific_aims: 'Aim 1...\nAim 2...\nAim 3...',
    significance: 'Why this matters.',
    innovation: 'What is new.',
    approach: 'Methods, prelim data, design, analysis.',
    risks_alternatives: 'Risk and alt strategy.',

    pi_name: 'Dr. Example PI',
    pi_email: 'pi@example.edu',

    co_investigators: [
      { name: 'Co PI 1', affiliation: 'Univ A', role: 'Co-PI', percent_effort: 25 },
    ],

    total_request_usd: 750000,
    budget_lines: [
      { year: 1, category: 'personnel_salary', amount_usd: 100000 },
      { year: 1, category: 'indirect', amount_usd: 50000 },
    ],
    budget_justification_attachment: [file('budget.pdf', ATTACHMENT_TYPES.pdf, 1)],

    milestones: [
      { target_date: '2027-06-01', deliverable: 'Year 1 progress report' },
    ],

    pi_biosketch: [file('pi-biosketch.pdf', ATTACHMENT_TYPES.pdf, 2)],
    facilities_resources: [file('facilities.pdf', ATTACHMENT_TYPES.pdf, 1)],
  };
}

console.log('1. valid fixture passes strict validation');
const v = validate(validFixture());
check('ok=true', v.ok === true, v.errors);
check('no errors', v.errors.length === 0, v.errors);

console.log('2. missing required field is caught');
const m = validFixture();
delete m.project_title;
const r2 = validate(m);
check('ok=false', r2.ok === false);
check('error code=required on project_title',
  r2.errors.some(e => e.path === 'project_title' && e.code === 'required'),
  r2.errors);

console.log('3. partial mode tolerates missing required fields');
const r3 = validate({ project_title: 'partial draft' }, { partial: true });
check('partial ok=true with single field', r3.ok === true, r3.errors);

console.log('4. partial mode still enforces type/length on present fields');
const r4 = validate({ project_title: 'x'.repeat(5000) }, { partial: true });
check('maxChars caught even in partial mode',
  r4.errors.some(e => e.code === 'maxChars'), r4.errors);

console.log('5. number bounds');
const f5 = validFixture();
f5.project_duration_months = 6; // below min=12
const r5 = validate(f5);
check('min violation caught',
  r5.errors.some(e => e.path === 'project_duration_months' && e.code === 'min'), r5.errors);

f5.project_duration_months = 24.5; // precision=0
const r5b = validate(f5);
check('precision violation caught',
  r5b.errors.some(e => e.path === 'project_duration_months' && e.code === 'precision'), r5b.errors);

console.log('6. ISO date enforcement');
const f6 = validFixture();
f6.project_start_date = '09/01/2026';
const r6 = validate(f6);
check('non-ISO date rejected',
  r6.errors.some(e => e.path === 'project_start_date' && e.code === 'type'), r6.errors);

console.log('7. choice options enforced inside table columns');
const f7 = validFixture();
f7.budget_lines = [{ year: 1, category: 'made_up_category', amount_usd: 100 }];
const r7 = validate(f7);
check('invalid choice in table caught',
  r7.errors.some(e => e.path === 'budget_lines[0].category' && e.code === 'choice'), r7.errors);

console.log('8. table minRows enforced');
const f8 = validFixture();
f8.budget_lines = [];
const r8 = validate(f8);
check('minRows on budget_lines caught',
  r8.errors.some(e => e.path === 'budget_lines' && e.code === 'required'), r8.errors);
// Note: empty array is treated as missing; required > minRows in priority.

console.log('9. table column-level required enforced');
const f9 = validFixture();
f9.co_investigators = [{ name: 'Has Name' }]; // missing affiliation, role, percent_effort
const r9 = validate(f9);
check('missing column required caught',
  r9.errors.some(e => e.path === 'co_investigators[0].affiliation' && e.code === 'required'), r9.errors);
check('multiple missing columns reported',
  r9.errors.filter(e => e.path.startsWith('co_investigators[0]')).length >= 3, r9.errors);

console.log('10. file mime/size enforcement');
const f10 = validFixture();
f10.pi_biosketch = [file('biosketch.pdf', 'image/png', 2)]; // wrong mime
const r10 = validate(f10);
check('mime mismatch caught',
  r10.errors.some(e => e.path === 'pi_biosketch[0]' && e.code === 'mime'), r10.errors);

const f10b = validFixture();
f10b.pi_biosketch = [file('biosketch.pdf', ATTACHMENT_TYPES.pdf, 50)]; // > 10 MB
const r10b = validate(f10b);
check('maxSize caught',
  r10b.errors.some(e => e.path === 'pi_biosketch[0]' && e.code === 'maxSize'), r10b.errors);

console.log('11. file multiple=false enforced');
const f11 = validFixture();
f11.pi_biosketch = [
  file('a.pdf', ATTACHMENT_TYPES.pdf, 1),
  file('b.pdf', ATTACHMENT_TYPES.pdf, 1),
];
const r11 = validate(f11);
check('two files in single-file slot caught',
  r11.errors.some(e => e.path === 'pi_biosketch' && e.code === 'multiple'), r11.errors);

console.log('12. unknown top-level fields rejected in strict mode');
const f12 = validFixture();
f12.evil_extra = 'should not be here';
const r12 = validate(f12);
check('unknown_field caught',
  r12.errors.some(e => e.path === 'evil_extra' && e.code === 'unknown_field'), r12.errors);

console.log('13. unknown fields tolerated in partial mode (drafts may contain stale keys)');
const r13 = validate({ evil_extra: 'transient' }, { partial: true });
check('partial mode does not flag unknown fields',
  !r13.errors.some(e => e.code === 'unknown_field'), r13.errors);

console.log('14. completely empty payload in strict mode is invalid');
const r14 = validate({});
check('many required errors',
  r14.ok === false && r14.errors.filter(e => e.code === 'required').length >= 10, r14.errors.length);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
