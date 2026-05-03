/**
 * Adapter: wmkf_appreviewersuggestion (lifecycle ledger).
 *
 * One row per (potential reviewer, request). Holds relevance score, match
 * reason, sources, picklists, and the full outreach lifecycle timestamps
 * (invited, accepted, declined, materials sent, reminders, review received,
 * thank-you). Alt-key on (potentialreviewer, request).
 */

import { DynamicsService } from '../../services/dynamics-service.js';

const ENTITY_SET = 'wmkf_appreviewersuggestions';

const FIELD_SELECT = [
  'wmkf_appreviewersuggestionid',
  'wmkf_suggestionlabel',
  'wmkf_grantcyclecode',
  'wmkf_programarea',
  'wmkf_relevancescore',
  'wmkf_matchreason',
  'wmkf_sources',
  'wmkf_selected',
  'wmkf_invited',
  'wmkf_accepted',
  'wmkf_declined',
  'wmkf_emailsentat',
  'wmkf_responsereceivedat',
  'wmkf_materialssentat',
  'wmkf_remindersentat',
  'wmkf_remindercount',
  'wmkf_reviewreceivedat',
  'wmkf_thankyousentat',
  'wmkf_reviewfilename',
  'wmkf_proposalurl',
  'wmkf_proposalpassword',
  'wmkf_notes',
  'wmkf_reviewstatus',
  'wmkf_responsetype',
  // External-reviewer intake (Phase 1+ schema additions). Surfaced so the
  // Review Manager UI can show token state and link to the magic-link
  // lifecycle actions without a second round trip.
  'wmkf_externaltokenhash',
  'wmkf_externaltokenissued',
  'wmkf_externaltokenexpires',
  'wmkf_externaltokenrevoked',
  'wmkf_proposalfirstaccessed',
  'wmkf_reviewsharepointfolder',
  'wmkf_reviewuploadedbystaff',
  'wmkf_revieweraffiliation',
  'wmkf_reviewerimpact',
  'wmkf_reviewerrisk',
  'wmkf_revieweroverallrating',
  '_wmkf_potentialreviewer_value',
  '_wmkf_request_value',
];

// Picklist optionset values in Dataverse. Callers pass the legacy Postgres
// string values; we translate to the numeric optionset on write.
const RESPONSE_TYPE_MAP = {
  accepted: 100000000,
  declined: 100000001,
  no_response: 100000002,
};

const REVIEW_STATUS_MAP = {
  accepted: 100000000,
  materials_sent: 100000001,
  under_review: 100000002,
  review_received: 100000003,
  complete: 100000004,
};

function mapPicklist(map, value, fieldName) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  const key = String(value).toLowerCase();
  if (key in map) return map[key];
  throw new Error(`reviewer-suggestion: unknown ${fieldName} value '${value}'`);
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

export async function findByPotentialReviewerAndRequest(potentialReviewerId, requestId) {
  if (!potentialReviewerId || !requestId) return null;
  const { records } = await DynamicsService.queryRecords(ENTITY_SET, {
    select: FIELD_SELECT.join(','),
    filter: `_wmkf_potentialreviewer_value eq ${potentialReviewerId} and _wmkf_request_value eq ${requestId}`,
    top: 1,
  });
  return records[0] || null;
}

/**
 * Upsert the suggestion row for a (potentialReviewer, request) pair.
 * Used by save-candidates: writes scoring/source/programArea/grantCycleCode/
 * matchReason/suggestionLabel + sets selected=true.
 *
 * Lifecycle transitions (markInvited, markMaterialsSent, etc.) are separate
 * methods to be added as they're wired.
 *
 * Returns { id, created }.
 */
export async function upsert({
  potentialReviewerId,
  requestId,
  suggestionLabel,
  grantCycleCode,
  programArea,
  relevanceScore,
  matchReason,
  sources,
  selected = true,
}) {
  if (!potentialReviewerId || !requestId) {
    throw new Error('reviewer-suggestion adapter: potentialReviewerId and requestId are required');
  }

  const incoming = pruneEmpty({
    wmkf_suggestionlabel: suggestionLabel,
    wmkf_grantcyclecode: grantCycleCode,
    wmkf_programarea: programArea,
    wmkf_relevancescore: relevanceScore,
    wmkf_matchreason: matchReason,
    wmkf_sources: sources,
  });
  incoming.wmkf_selected = !!selected;

  const existing = await findByPotentialReviewerAndRequest(potentialReviewerId, requestId);
  if (existing) {
    await DynamicsService.updateRecord(ENTITY_SET, existing.wmkf_appreviewersuggestionid, incoming);
    return { id: existing.wmkf_appreviewersuggestionid, created: false };
  }

  if (!incoming.wmkf_suggestionlabel) {
    incoming.wmkf_suggestionlabel = `Suggestion ${new Date().toISOString().slice(0, 10)}`;
  }
  incoming['wmkf_PotentialReviewer@odata.bind'] = `/wmkf_potentialreviewerses(${potentialReviewerId})`;
  incoming['wmkf_Request@odata.bind'] = `/akoya_requests(${requestId})`;

  const created = await DynamicsService.createRecord(ENTITY_SET, incoming);
  return { id: created.wmkf_appreviewersuggestionid, created: true };
}

export async function findById(id) {
  return DynamicsService.getRecord(ENTITY_SET, id, { select: FIELD_SELECT.join(',') });
}

export async function findByRequest(requestId, { selectedOnly = true } = {}) {
  if (!requestId) return [];
  const filter = selectedOnly
    ? `_wmkf_request_value eq ${requestId} and wmkf_selected eq true`
    : `_wmkf_request_value eq ${requestId}`;
  const { records } = await DynamicsService.queryRecords(ENTITY_SET, {
    select: FIELD_SELECT.join(','),
    filter,
    orderby: 'createdon desc',
    top: 200,
  });
  return records;
}

/**
 * All selected suggestions on requests where the given systemuser is the lead PD.
 * Two-step: query akoya_request to get matching request IDs, then fetch suggestions.
 *
 * @param {string} systemuserid - lead PD's systemuserid
 * @param {object} opts
 * @param {string} [opts.cycleCode] - 'Jxx'/'Dxx' to narrow by cycle
 * @param {boolean} [opts.selectedOnly=true]
 * @returns {Promise<{ suggestions: Array, requestById: Object }>}
 *   requestById is keyed by akoya_requestid with the projected request fields.
 */
export async function findByPD(systemuserid, { cycleCode, selectedOnly = true } = {}) {
  if (!systemuserid) return { suggestions: [], requestById: {} };

  const { meetingDateToCycleCode, cycleCodeToOdataFilter } = await import('../../utils/cycle-code.js');

  const requestFilters = [`_wmkf_programdirector_value eq ${systemuserid}`];
  if (cycleCode) {
    requestFilters.push(cycleCodeToOdataFilter(cycleCode, 'wmkf_meetingdate'));
  }

  // queryAllRecords paginates internally — without it, the unfiltered PD scope
  // can exceed 500 rows for active PDs and silently drop requests.
  const { records: requests } = await DynamicsService.queryAllRecords('akoya_requests', {
    select: [
      'akoya_requestid',
      'akoya_requestnum',
      'akoya_title',
      'wmkf_meetingdate',
      'wmkf_abstract',
      '_akoya_applicantid_value',
      '_wmkf_projectleader_value',
      '_wmkf_grantprogram_value',
      '_wmkf_programareaserved_value',
    ].join(','),
    filter: requestFilters.join(' and '),
  });

  const requestById = {};
  for (const r of requests) {
    requestById[r.akoya_requestid] = {
      requestId: r.akoya_requestid,
      requestNumber: r.akoya_requestnum,
      title: r.akoya_title || null,
      abstract: r.wmkf_abstract || null,
      meetingDate: r.wmkf_meetingdate || null,
      meetingCycleCode: r.wmkf_meetingdate ? meetingDateToCycleCode(r.wmkf_meetingdate) : null,
      applicant: r._akoya_applicantid_value_formatted || null,
      projectLeader: r._wmkf_projectleader_value_formatted || null,
      grantProgram: r._wmkf_grantprogram_value_formatted || null,
      programArea: r._wmkf_programareaserved_value_formatted || null,
    };
  }

  if (Object.keys(requestById).length === 0) {
    return { suggestions: [], requestById: {} };
  }

  // Dataverse OData doesn't support `in` for guid lists efficiently; use OR chain.
  // Chunk to keep URL length manageable.
  const reqIds = Object.keys(requestById);
  const all = [];
  const CHUNK = 25;
  for (let i = 0; i < reqIds.length; i += CHUNK) {
    const chunk = reqIds.slice(i, i + CHUNK);
    const orChain = chunk.map((id) => `_wmkf_request_value eq ${id}`).join(' or ');
    const baseFilter = selectedOnly ? `(${orChain}) and wmkf_selected eq true` : `(${orChain})`;
    const { records } = await DynamicsService.queryRecords(ENTITY_SET, {
      select: FIELD_SELECT.join(','),
      filter: baseFilter,
      orderby: 'createdon desc',
      top: 500,
    });
    all.push(...records);
  }
  return { suggestions: all, requestById };
}

/**
 * Same shape as findByPD but limited to suggestions where the reviewer has
 * accepted (`wmkf_accepted eq true`). Used by Review Manager.
 */
export async function findAcceptedByPD(systemuserid, { cycleCode } = {}) {
  if (!systemuserid) return { suggestions: [], requestById: {} };

  const { meetingDateToCycleCode, cycleCodeToOdataFilter } = await import('../../utils/cycle-code.js');

  const requestFilters = [`_wmkf_programdirector_value eq ${systemuserid}`];
  if (cycleCode) {
    requestFilters.push(cycleCodeToOdataFilter(cycleCode, 'wmkf_meetingdate'));
  }

  const { records: requests } = await DynamicsService.queryAllRecords('akoya_requests', {
    select: [
      'akoya_requestid',
      'akoya_requestnum',
      'akoya_title',
      'wmkf_meetingdate',
      'wmkf_abstract',
      'wmkf_organizationname',
      '_akoya_applicantid_value',
      '_wmkf_projectleader_value',
      '_wmkf_grantprogram_value',
      '_wmkf_programareaserved_value',
    ].join(','),
    filter: requestFilters.join(' and '),
  });

  const requestById = {};
  for (const r of requests) {
    requestById[r.akoya_requestid] = {
      requestId: r.akoya_requestid,
      requestNumber: r.akoya_requestnum,
      title: r.akoya_title || null,
      abstract: r.wmkf_abstract || null,
      meetingDate: r.wmkf_meetingdate || null,
      meetingCycleCode: r.wmkf_meetingdate ? meetingDateToCycleCode(r.wmkf_meetingdate) : null,
      applicant: r._akoya_applicantid_value_formatted || null,
      projectLeader: r._wmkf_projectleader_value_formatted || null,
      grantProgram: r._wmkf_grantprogram_value_formatted || null,
      programArea: r._wmkf_programareaserved_value_formatted || null,
      organizationName: r.wmkf_organizationname || null,
    };
  }

  if (Object.keys(requestById).length === 0) {
    return { suggestions: [], requestById: {} };
  }

  const reqIds = Object.keys(requestById);
  const all = [];
  const CHUNK = 25;
  for (let i = 0; i < reqIds.length; i += CHUNK) {
    const chunk = reqIds.slice(i, i + CHUNK);
    const orChain = chunk.map((id) => `_wmkf_request_value eq ${id}`).join(' or ');
    const { records } = await DynamicsService.queryRecords(ENTITY_SET, {
      select: FIELD_SELECT.join(','),
      filter: `(${orChain}) and wmkf_selected eq true and wmkf_accepted eq true`,
      orderby: 'createdon desc',
      top: 500,
    });
    all.push(...records);
  }
  return { suggestions: all, requestById };
}

/**
 * Update lifecycle/notes/email-tracking fields on a single suggestion. Only fields
 * present in `updates` are written; null is permitted to clear a value.
 */
export async function updateLifecycle(id, updates) {
  if (!id) throw new Error('reviewer-suggestion.updateLifecycle: id required');
  const map = {
    invited: 'wmkf_invited',
    accepted: 'wmkf_accepted',
    declined: 'wmkf_declined',
    notes: 'wmkf_notes',
    emailSentAt: 'wmkf_emailsentat',
    responseType: 'wmkf_responsetype',
    responseReceivedAt: 'wmkf_responsereceivedat',
    materialsSentAt: 'wmkf_materialssentat',
    reminderSentAt: 'wmkf_remindersentat',
    reminderCount: 'wmkf_remindercount',
    reviewReceivedAt: 'wmkf_reviewreceivedat',
    thankYouSentAt: 'wmkf_thankyousentat',
    reviewFilename: 'wmkf_reviewfilename',
    proposalUrl: 'wmkf_proposalurl',
    proposalPassword: 'wmkf_proposalpassword',
    reviewStatus: 'wmkf_reviewstatus',
    selected: 'wmkf_selected',
    programArea: 'wmkf_programarea',
    grantCycleCode: 'wmkf_grantcyclecode',
  };
  const payload = {};
  for (const [k, v] of Object.entries(updates || {})) {
    if (!(k in map) || v === undefined) continue;
    if (k === 'responseType') payload[map[k]] = mapPicklist(RESPONSE_TYPE_MAP, v, 'responseType');
    else if (k === 'reviewStatus') payload[map[k]] = mapPicklist(REVIEW_STATUS_MAP, v, 'reviewStatus');
    else payload[map[k]] = v;
  }
  if (Object.keys(payload).length === 0) return;
  await DynamicsService.updateRecord(ENTITY_SET, id, payload);
}

export async function softDelete(id) {
  if (!id) throw new Error('reviewer-suggestion.softDelete: id required');
  await DynamicsService.updateRecord(ENTITY_SET, id, { wmkf_selected: false });
}

/**
 * Bulk update all selected suggestions on a request. Used by the UI's
 * "assign cycle/program area to whole proposal" action.
 */
export async function bulkUpdateByRequest(requestId, updates) {
  if (!requestId) throw new Error('reviewer-suggestion.bulkUpdateByRequest: requestId required');
  const rows = await findByRequest(requestId, { selectedOnly: true });
  for (const row of rows) {
    await updateLifecycle(row.wmkf_appreviewersuggestionid, updates);
  }
  return rows.length;
}

export const ENTITY_SET_NAME = ENTITY_SET;
