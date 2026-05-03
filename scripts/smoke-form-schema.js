#!/usr/bin/env node
/**
 * Sanity-check the Phase II Research form schema.
 * No DB; just structural validation against the design doc envelope.
 *
 * Usage: node scripts/smoke-form-schema.js
 */

const schema = require('../shared/forms/phase-ii-research-2026-06/schema.js');

let pass = 0;
let fail = 0;
function check(label, cond, ...details) {
  if (cond) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.error(`  ✗ ${label}`, ...details);
    fail++;
  }
}

const VALID_TYPES = new Set(['text', 'longtext', 'number', 'date', 'choice', 'bool', 'file', 'table']);

console.log('1. top-level structure');
check('formKey matches directory name', schema.formKey === 'phase-ii-research-2026-06');
check('sections is non-empty array', Array.isArray(schema.sections) && schema.sections.length > 0);
check('previewOnly flag present', typeof schema.previewOnly === 'boolean');

console.log('2. flatten fields and walk');
const allFields = [];
const fieldKeys = new Set();
const sectionKeys = new Set();
for (const section of schema.sections) {
  if (sectionKeys.has(section.key)) {
    check(`section key unique: ${section.key}`, false);
  }
  sectionKeys.add(section.key);
  for (const f of section.fields) {
    allFields.push({ ...f, _section: section.key });
    if (fieldKeys.has(f.key)) {
      check(`field key unique: ${f.key}`, false);
    }
    fieldKeys.add(f.key);
  }
}
check(`all field keys unique (${fieldKeys.size} keys)`, fieldKeys.size === allFields.length);

console.log('3. field type vocabulary');
for (const f of allFields) {
  if (!VALID_TYPES.has(f.type)) {
    check(`unknown type ${f.type} on ${f.key}`, false);
  }
}
check('every field has a known type', !allFields.some(f => !VALID_TYPES.has(f.type)));

console.log('4. table fields have well-formed columns');
const tables = allFields.filter(f => f.type === 'table');
for (const t of tables) {
  check(`${t.key}: columns is non-empty array`, Array.isArray(t.columns) && t.columns.length > 0);
  const colKeys = new Set();
  for (const c of t.columns) {
    if (colKeys.has(c.key)) {
      check(`${t.key}: duplicate column key ${c.key}`, false);
    }
    colKeys.add(c.key);
    if (!VALID_TYPES.has(c.type)) {
      check(`${t.key}.${c.key}: invalid column type ${c.type}`, false);
    }
  }
}

console.log('5. file fields declare accept + maxSizeMb');
const files = allFields.filter(f => f.type === 'file');
for (const f of files) {
  check(`${f.key}: accept[] present`, Array.isArray(f.accept) && f.accept.length > 0);
  check(`${f.key}: maxSizeMb present`, typeof f.maxSizeMb === 'number');
}

console.log('6. choice fields declare options');
function checkChoice(f, ownerLabel) {
  if (f.type !== 'choice') return;
  check(`${ownerLabel}: options[] present`, Array.isArray(f.options) && f.options.length > 0);
  for (const o of f.options || []) {
    check(`${ownerLabel}: option has value+label`, typeof o.value === 'string' && typeof o.label === 'string');
  }
}
for (const f of allFields) {
  checkChoice(f, f.key);
  if (f.type === 'table') {
    for (const c of f.columns) checkChoice(c, `${f.key}.${c.key}`);
  }
}

console.log('7. envelope sanity (matches design doc rough envelope)');
const longtextCount = allFields.filter(f => f.type === 'longtext').length;
const fileCount = allFields.filter(f => f.type === 'file').length;
const tableCount = allFields.filter(f => f.type === 'table').length;
console.log(`     longtext fields:  ${longtextCount}  (design doc: ~10)`);
console.log(`     file fields:      ${fileCount}   (design doc: ~8 typical)`);
console.log(`     table fields:     ${tableCount}   (design doc: budget + roster + ...)`);
check('longtext count is in 5..15', longtextCount >= 5 && longtextCount <= 15);
check('file count is in 4..10', fileCount >= 4 && fileCount <= 10);
check('at least 3 tables (budget, roster, milestones)', tableCount >= 3);

console.log('\n8. ground rules: no conditional fields, linear form');
for (const f of allFields) {
  if (f.requireIf || f.showIf) {
    check(`${f.key}: must not declare conditional rules in pilot`, false);
  }
}
check('no conditional flags on any field', !allFields.some(f => f.requireIf || f.showIf));

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
