/**
 * Dataverse Power Tools — Track B — GET /api/dataverse-export/metadata
 *
 * Live taxonomies for the builder, enumerated from Dataverse AT REQUEST TIME
 * via the shared live-taxonomy module (design doc §"Living taxonomy", build
 * plan §5/§9). FAIL-LOUD on any fetch failure: HTTP 502, never a stale or
 * partial list (a silently-short taxonomy makes a real program invisible in
 * the builder — the plausible-wrong-answer the tool exists to prevent).
 *
 * Distinct statuses page to completion (fetchXmlAll), never one page
 * (Codex S160 P2). Per-route requireAppAccess gate (build plan §5/§7).
 */

import { requireAppAccess } from '../../../lib/utils/auth';
import { fetchLiveTaxonomy } from '../../../lib/services/dataverse-export/live-taxonomy';

export const config = { api: { externalResolver: true } };

export default async function handler(req, res) {
  const access = await requireAppAccess(req, res, 'dataverse-bulk-export');
  if (!access) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const tax = await fetchLiveTaxonomy();
    return res.status(200).json({
      ...tax,
      note: 'Live taxonomy enumerated at request time — never hardcoded. A '
        + 'value absent here that later appears in a result is surfaced as '
        + 'UNCLASSIFIED by the export engine, never silently dropped.',
    });
  } catch (err) {
    // FAIL LOUD — no stale/partial fallback (Living-taxonomy contract §9).
    // Raw error to the server log only; a stable code to the client.
    console.error('[dataverse-export/metadata] taxonomy fetch failed:', err);
    return res.status(502).json({
      error: 'TAXONOMY_FETCH_FAILED',
      message: 'Could not enumerate live Dataverse taxonomies. Refusing to '
        + 'serve a stale or partial list — retry; if it persists this is an '
        + 'actionable Dataverse/connectivity condition, not a soft warning.',
    });
  }
}
