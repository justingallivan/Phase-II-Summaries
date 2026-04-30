/**
 * Adapter: wmkf_appresearcher (bibliometric sidecar).
 *
 * 1:1 with wmkf_potentialreviewers. Holds h-index, citations, scholar/ORCID
 * metadata — fields that change over time and need refresh on a different
 * cadence than the canonical person identity.
 */

import { DynamicsService } from '../../services/dynamics-service';

const ENTITY_SET = 'wmkf_appresearchers';

const FIELD_SELECT = [
  'wmkf_appresearcherid',
  'wmkf_name',
  'wmkf_normalizedname',
  'wmkf_email',
  'wmkf_emailsource',
  'wmkf_orcid',
  'wmkf_orcidurl',
  'wmkf_googlescholarid',
  'wmkf_googlescholarurl',
  'wmkf_hindex',
  'wmkf_i10index',
  'wmkf_totalcitations',
  'wmkf_primaryaffiliation',
  'wmkf_department',
  'wmkf_website',
  'wmkf_facultypageurl',
  'wmkf_keywords',
  'wmkf_lastchecked',
  'wmkf_metricsupdatedat',
  'wmkf_contactenrichedat',
  'wmkf_contactenrichmentsource',
  '_wmkf_potentialreviewer_value',
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

export async function getByPotentialReviewer(potentialReviewerId) {
  if (!potentialReviewerId) return null;
  const { records } = await DynamicsService.queryRecords(ENTITY_SET, {
    select: FIELD_SELECT.join(','),
    filter: `_wmkf_potentialreviewer_value eq ${potentialReviewerId}`,
    top: 1,
  });
  return records[0] || null;
}

/**
 * Upsert the bibliometric snapshot for a potential reviewer (1:1).
 *
 * Existing-row strategy: metric fields (hIndex, totalCitations, lastChecked,
 * metricsUpdatedAt) always overwrite — they're snapshots. Other fields fill
 * empty only.
 *
 * Returns { id, created }.
 */
export async function upsertByPotentialReviewer(potentialReviewerId, {
  name,
  normalizedName,
  email,
  emailSource,
  orcid,
  orcidUrl,
  googleScholarId,
  googleScholarUrl,
  hIndex,
  i10Index,
  totalCitations,
  affiliation,
  department,
  website,
  facultyPageUrl,
  keywords,
}) {
  if (!potentialReviewerId) {
    throw new Error('researcher adapter: potentialReviewerId is required');
  }

  const now = new Date().toISOString();

  const metrics = pruneEmpty({
    wmkf_hindex: hIndex,
    wmkf_i10index: i10Index,
    wmkf_totalcitations: totalCitations,
  });
  const hasMetrics = Object.keys(metrics).length > 0;

  const fillIfEmpty = pruneEmpty({
    wmkf_name: name,
    wmkf_normalizedname: normalizedName,
    wmkf_email: email,
    wmkf_emailsource: emailSource,
    wmkf_orcid: orcid,
    wmkf_orcidurl: orcidUrl,
    wmkf_googlescholarid: googleScholarId,
    wmkf_googlescholarurl: googleScholarUrl,
    wmkf_primaryaffiliation: affiliation,
    wmkf_department: department,
    wmkf_website: website,
    wmkf_facultypageurl: facultyPageUrl,
    wmkf_keywords: keywords,
  });

  const existing = await getByPotentialReviewer(potentialReviewerId);
  if (existing) {
    const merge = { ...metrics };
    if (hasMetrics) merge.wmkf_metricsupdatedat = now;
    merge.wmkf_lastchecked = now;
    for (const [k, v] of Object.entries(fillIfEmpty)) {
      const current = existing[k];
      const isEmpty = current === null || current === undefined ||
        (typeof current === 'string' && current.trim() === '');
      if (isEmpty) merge[k] = v;
    }
    await DynamicsService.updateRecord(ENTITY_SET, existing.wmkf_appresearcherid, merge);
    return { id: existing.wmkf_appresearcherid, created: false };
  }

  const payload = {
    ...fillIfEmpty,
    ...metrics,
    wmkf_lastchecked: now,
  };
  if (hasMetrics) payload.wmkf_metricsupdatedat = now;
  // Primary name is required — fall back to a placeholder if not supplied
  if (!payload.wmkf_name) payload.wmkf_name = name || 'Unknown';
  payload['wmkf_PotentialReviewer@odata.bind'] = `/wmkf_potentialreviewerses(${potentialReviewerId})`;

  const created = await DynamicsService.createRecord(ENTITY_SET, payload);
  return { id: created.wmkf_appresearcherid, created: true };
}

export const ENTITY_SET_NAME = ENTITY_SET;
