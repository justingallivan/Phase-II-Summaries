/**
 * Adapter: wmkf_potentialreviewers (Connor's lead/person record).
 *
 * One row per real person. Promoted to a CRM contact when staff first reaches
 * out (wmkf_contact lookup). Email is the de-dupe key.
 */

import { DynamicsService } from '../../services/dynamics-service';

const ENTITY_SET = 'wmkf_potentialreviewerses';

const FIELD_SELECT = [
  'wmkf_potentialreviewersid',
  'wmkf_name',
  'wmkf_firstname',
  'wmkf_lastname',
  'wmkf_emailaddress',
  'wmkf_organizationname',
  'wmkf_areaofexpertise',
  'wmkf_whyreviewerwaschosen',
  '_wmkf_contact_value',
];

function splitName(fullName) {
  const trimmed = (fullName || '').trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const cleaned = trimmed.replace(/^(dr\.?|prof\.?|professor)\s+/i, '');
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return { firstName: '', lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function pruneEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    out[k] = v;
  }
  return out;
}

// Dynamics field caps we've hit empirically. Add to this map as new ones
// surface; speculative caps would silently truncate legitimate values.
const FIELD_MAX = {
  wmkf_organizationname: 100,
};

function clamp(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && FIELD_MAX[k] && v.length > FIELD_MAX[k]) {
      out[k] = v.slice(0, FIELD_MAX[k] - 1).trimEnd() + '…';
    } else {
      out[k] = v;
    }
  }
  return out;
}

function escapeOdataString(s) {
  return String(s).replace(/'/g, "''");
}

export async function getByEmail(email) {
  if (!email) return null;
  const { records } = await DynamicsService.queryRecords(ENTITY_SET, {
    select: FIELD_SELECT.join(','),
    filter: `wmkf_emailaddress eq '${escapeOdataString(email)}'`,
    top: 1,
  });
  return records[0] || null;
}

export async function getById(id) {
  return DynamicsService.getRecord(ENTITY_SET, id, { select: FIELD_SELECT.join(',') });
}

/**
 * Upsert a potential reviewer keyed by email (when present).
 *
 * On match: only fills fields currently empty in CRM (preserves staff edits).
 * On miss / no email: creates a new row.
 *
 * Returns { id, created }.
 */
export async function upsertByEmail({ name, email, affiliation, expertise, whyChosen }) {
  const { firstName, lastName } = splitName(name);

  const incoming = clamp(pruneEmpty({
    wmkf_name: name,
    wmkf_firstname: firstName,
    wmkf_lastname: lastName,
    wmkf_emailaddress: email,
    wmkf_organizationname: affiliation,
    wmkf_areaofexpertise: expertise,
    wmkf_whyreviewerwaschosen: whyChosen,
  }));

  if (email) {
    const existing = await getByEmail(email);
    if (existing) {
      const merge = {};
      for (const [k, v] of Object.entries(incoming)) {
        const current = existing[k];
        const isEmpty = current === null || current === undefined ||
          (typeof current === 'string' && current.trim() === '');
        if (isEmpty) merge[k] = v;
      }
      if (Object.keys(merge).length > 0) {
        await DynamicsService.updateRecord(ENTITY_SET, existing.wmkf_potentialreviewersid, merge);
      }
      return { id: existing.wmkf_potentialreviewersid, created: false };
    }
  }

  const created = await DynamicsService.createRecord(ENTITY_SET, incoming);
  return { id: created.wmkf_potentialreviewersid, created: true };
}

export async function setContactLink(potentialReviewerId, contactId) {
  await DynamicsService.updateRecord(ENTITY_SET, potentialReviewerId, {
    'wmkf_Contact@odata.bind': `/contacts(${contactId})`,
  });
}

export const ENTITY_SET_NAME = ENTITY_SET;
