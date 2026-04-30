/**
 * Adapter: wmkf_appreviewersuggestion (lifecycle ledger).
 *
 * One row per (potential reviewer, request). Holds relevance score, match
 * reason, sources, picklists, and the full outreach lifecycle timestamps
 * (invited, accepted, declined, materials sent, reminders, review received,
 * thank-you). Alt-key on (potentialreviewer, request).
 */

import { DynamicsService } from '../../services/dynamics-service';

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
  'wmkf_reviewbloburl',
  'wmkf_reviewfilename',
  'wmkf_proposalurl',
  'wmkf_proposalpassword',
  'wmkf_notes',
  'wmkf_reviewstatus',
  'wmkf_responsetype',
  '_wmkf_potentialreviewer_value',
  '_wmkf_request_value',
];

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
  const result = await DynamicsService.queryRecords(ENTITY_SET, {
    select: FIELD_SELECT,
    filter: `_wmkf_potentialreviewer_value eq ${potentialReviewerId} and _wmkf_request_value eq ${requestId}`,
    top: 1,
  });
  return result[0] || null;
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

export const ENTITY_SET_NAME = ENTITY_SET;
