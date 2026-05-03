/**
 * Server-side validator for the Phase II Research 2026-06 form.
 *
 * Schema-driven — walks `schema.js` and applies type/rule checks. Same
 * validator runs in both autosave (partial mode) and submit (strict
 * mode) paths. Partial mode skips required-field checks but still
 * enforces type, length, and bounds on whatever IS present.
 *
 * Returns `{ ok, errors }` where `errors` is an array of
 *   { path, code, message }
 * with `path` keyed dot/bracket-style for the UI to map back to fields:
 *   "project_title"
 *   "budget_lines[3].amount_usd"
 *   "co_investigators[0].percent_effort"
 *
 * Codes are stable strings the UI can switch on; `message` is a
 * human-friendly default for the server log.
 */

const schema = require('./schema');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function err(errors, path, code, message) {
  errors.push({ path, code, message });
}

function isEmpty(v) {
  return v == null || v === '' || (Array.isArray(v) && v.length === 0);
}

function validateScalar(field, value, path, errors, { strict }) {
  // required (only enforced in strict mode)
  if (strict && field.required && isEmpty(value)) {
    err(errors, path, 'required', `${field.label || field.key} is required`);
    return;
  }
  if (isEmpty(value)) return;

  switch (field.type) {
    case 'text':
    case 'longtext': {
      if (typeof value !== 'string') {
        err(errors, path, 'type', `${path} must be a string`);
        return;
      }
      if (field.maxChars && value.length > field.maxChars) {
        err(errors, path, 'maxChars', `${path} exceeds ${field.maxChars} characters`);
      }
      break;
    }
    case 'number': {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        err(errors, path, 'type', `${path} must be a number`);
        return;
      }
      if (field.precision === 0 && !Number.isInteger(value)) {
        err(errors, path, 'precision', `${path} must be an integer`);
      }
      if (typeof field.min === 'number' && value < field.min) {
        err(errors, path, 'min', `${path} must be >= ${field.min}`);
      }
      if (typeof field.max === 'number' && value > field.max) {
        err(errors, path, 'max', `${path} must be <= ${field.max}`);
      }
      break;
    }
    case 'date': {
      if (typeof value !== 'string' || !ISO_DATE.test(value)) {
        err(errors, path, 'type', `${path} must be an ISO date (YYYY-MM-DD)`);
        return;
      }
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) {
        err(errors, path, 'type', `${path} is not a valid date`);
      }
      break;
    }
    case 'choice': {
      const valid = (field.options || []).some(o => o.value === value);
      if (!valid) {
        err(errors, path, 'choice', `${path} is not one of the allowed values`);
      }
      break;
    }
    case 'bool': {
      if (typeof value !== 'boolean') {
        err(errors, path, 'type', `${path} must be a boolean`);
      }
      break;
    }
    case 'file': {
      validateFile(field, value, path, errors, { strict });
      break;
    }
    default:
      err(errors, path, 'unknown_type', `unknown field type ${field.type} at ${path}`);
  }
}

// Hex sha256 digest — 64 lowercase hex chars. Matches what the upload
// endpoint computes server-side after the bytes land in Blob staging.
const SHA256_HEX = /^[a-f0-9]{64}$/;

function validateFile(field, value, path, errors, { strict }) {
  // file values are arrays of {filename, blob_url, sha256, size, mime,
  // scanned_at, scan_result, ...}. Single-file fields still take an
  // array of length 1 for uniform shape.
  if (!Array.isArray(value)) {
    err(errors, path, 'type', `${path} must be an array of file refs`);
    return;
  }
  if (!field.multiple && value.length > 1) {
    err(errors, path, 'multiple', `${path} only accepts a single file`);
  }
  if (field.maxFiles && value.length > field.maxFiles) {
    err(errors, path, 'maxFiles', `${path} exceeds ${field.maxFiles} files`);
  }
  for (let i = 0; i < value.length; i++) {
    const f = value[i];
    const fp = `${path}[${i}]`;
    if (!f || typeof f !== 'object') {
      err(errors, fp, 'type', `${fp} must be a file object`);
      continue;
    }
    if (typeof f.filename !== 'string' || !f.filename) {
      err(errors, fp, 'filename', `${fp}.filename required`);
    }
    if (typeof f.size !== 'number' || f.size <= 0) {
      err(errors, fp, 'size', `${fp}.size required and must be > 0`);
    } else if (field.maxSizeMb && f.size > field.maxSizeMb * 1024 * 1024) {
      err(errors, fp, 'maxSize', `${fp} exceeds ${field.maxSizeMb} MB`);
    }
    if (field.accept && Array.isArray(field.accept) && f.mime && !field.accept.includes(f.mime)) {
      err(errors, fp, 'mime', `${fp} mime ${f.mime} not in accept list`);
    }

    // Strict-mode (submit) invariants. Virus scanning is a launch
    // blocker — encode it here so every submit caller gets the same
    // protection without a parallel second check. Partial mode (autosave)
    // tolerates pre-scan staging because the upload endpoint may not
    // have completed scanning yet.
    if (strict) {
      if (typeof f.blob_url !== 'string' || !f.blob_url) {
        err(errors, fp, 'blob_url', `${fp}.blob_url required for submit`);
      }
      if (typeof f.sha256 !== 'string' || !SHA256_HEX.test(f.sha256)) {
        err(errors, fp, 'sha256', `${fp}.sha256 must be a 64-char hex digest`);
      }
      if (typeof f.scanned_at !== 'string' || !f.scanned_at) {
        err(errors, fp, 'scanned_at', `${fp} must be virus-scanned before submit`);
      }
      if (f.scan_result !== 'clean') {
        err(errors, fp, 'scan_result', `${fp}.scan_result must be 'clean' (got ${JSON.stringify(f.scan_result)})`);
      }
    }
  }
}

function validateTable(field, value, path, errors, ctx) {
  if (ctx.strict && field.required && isEmpty(value)) {
    err(errors, path, 'required', `${field.label || field.key} is required`);
    return;
  }
  if (isEmpty(value)) return;
  if (!Array.isArray(value)) {
    err(errors, path, 'type', `${path} must be an array`);
    return;
  }
  if (typeof field.minRows === 'number' && value.length < field.minRows) {
    err(errors, path, 'minRows', `${path} requires at least ${field.minRows} row(s)`);
  }
  if (typeof field.maxRows === 'number' && value.length > field.maxRows) {
    err(errors, path, 'maxRows', `${path} allows at most ${field.maxRows} rows`);
  }
  for (let i = 0; i < value.length; i++) {
    const row = value[i];
    if (!row || typeof row !== 'object') {
      err(errors, `${path}[${i}]`, 'type', `${path}[${i}] must be an object`);
      continue;
    }
    for (const col of field.columns) {
      const colPath = `${path}[${i}].${col.key}`;
      validateScalar(col, row[col.key], colPath, errors, ctx);
    }
  }
}

/**
 * Validate a submission payload against the schema.
 *
 * @param {object} data - flat object keyed by field key
 * @param {object} [opts]
 * @param {boolean} [opts.partial] - if true, skip required checks (autosave)
 * @returns {{ ok: boolean, errors: Array<{path,code,message}> }}
 */
function validate(data, { partial = false } = {}) {
  const errors = [];
  const ctx = { strict: !partial };
  data = data || {};

  for (const section of schema.sections) {
    for (const field of section.fields) {
      const value = data[field.key];
      if (field.type === 'table') {
        validateTable(field, value, field.key, errors, ctx);
      } else {
        validateScalar(field, value, field.key, errors, ctx);
      }
    }
  }

  // Reject unknown top-level keys in strict mode — applicants do not get
  // to add fields the schema does not declare.
  if (ctx.strict) {
    const known = new Set();
    for (const s of schema.sections) for (const f of s.fields) known.add(f.key);
    for (const k of Object.keys(data)) {
      if (!known.has(k)) {
        err(errors, k, 'unknown_field', `unknown field ${k}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

module.exports = validate;
module.exports.validate = validate;
