/**
 * API Route: /api/reviewer-finder/contact-history
 *
 * GET — PI / co-PI history for a single contact across all akoya_request rows.
 *
 * Read strategy is the steady-state UNION described in
 * docs/REVIEWER_POSTGRES_TO_DATAVERSE_PLAN.md §5:
 *
 *     wmkf_apprequestperson rows where wmkf_contact = <id>      (pi OR copi)
 *   UNION
 *     akoya_request rows where _wmkf_projectleader_value = <id> (role: pi)
 *
 * Not junction-first / projectleader-fallback. The projectleader lookup field
 * stays authoritative for PI in parallel with the junction because (a) other
 * flows unrelated to reviewers update it, and (b) Connor's PA flows dual-write
 * it alongside the `pi` junction row. Either source is correct for active
 * data; junction is the sole source for historical co-PI participation.
 *
 * Per-row source provenance is returned so the UI can mark "junction-only"
 * rows differently if desired (e.g., during the pre-PA-cutover transition).
 *
 * Query params:
 *   contactId (required) — GUID of the contact to query history for
 *
 * Response:
 *   {
 *     contactId,
 *     rows: [
 *       {
 *         requestId, requestNumber, title, meetingDate, cycleCode,
 *         cycleLabel, requestStatus,
 *         role: 'pi' | 'copi',
 *         position: 0..5,
 *         sources: ['junction'] | ['projectleader'] | ['junction','projectleader']
 *       },
 *       ...
 *     ],
 *     counts: { pi, copi, total }
 *   }
 */

import { requireAppAccess } from '../../../lib/utils/auth';
import { DynamicsService } from '../../../lib/services/dynamics-service';
import { bypassDynamicsRestrictions } from '../../../lib/services/dynamics-context';
import { meetingDateToCycleCode, cycleCodeToLabel } from '../../../lib/utils/cycle-code';

const ROLE_PI = 100000000;
const ROLE_COPI = 100000001;

const REQUEST_SELECT = [
  'akoya_requestid',
  'akoya_requestnum',
  'akoya_title',
  'wmkf_meetingdate',
  'akoya_requeststatus',
].join(',');

export default async function handler(req, res) {
  const access = await requireAppAccess(req, res, 'reviewer-finder');
  if (!access) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const contactId = (req.query.contactId || '').trim();
  if (!contactId) {
    return res.status(400).json({ error: 'contactId is required' });
  }
  // Permissive GUID check — Dataverse will 400 on a malformed value anyway,
  // but rejecting at the edge avoids burning a round-trip for obvious typos.
  if (!/^[0-9a-fA-F-]{32,40}$/.test(contactId)) {
    return res.status(400).json({ error: 'contactId must be a GUID' });
  }

  return bypassDynamicsRestrictions('contact-history', async () => {
    try {
      // ── Pull both sources in parallel ──────────────────────────────────
      const escapedContactId = contactId.replace(/'/g, "''");

      const [junctionResp, projectLeaderResp] = await Promise.all([
        // Junction rows for this contact (any role).
        DynamicsService.queryRecords('wmkf_apprequestpersons', {
          select: '_wmkf_request_value,wmkf_role,wmkf_authorposition',
          filter: `_wmkf_contact_value eq ${escapedContactId} and wmkf_role ne null`,
          top: 100,
        }),
        // akoya_request rows where this contact is the project leader.
        // Role inferred = pi, position = 0 (matches backfill convention).
        DynamicsService.queryRecords('akoya_requests', {
          select: 'akoya_requestid',
          filter: `_wmkf_projectleader_value eq ${escapedContactId}`,
          top: 100,
        }),
      ]);

      // ── Merge into a dedupe-keyed map ──────────────────────────────────
      // Key = `${requestId}|${role}`. Same contact + same request can hold
      // both 'pi' and 'copi' rows (rare but legal); they remain distinct.
      const rowMap = new Map();

      function ensureRow(requestId, role, position) {
        const key = `${requestId}|${role}`;
        if (!rowMap.has(key)) {
          rowMap.set(key, {
            requestId,
            role,
            position,
            sources: new Set(),
          });
        }
        return rowMap.get(key);
      }

      for (const r of junctionResp.records || []) {
        const role = r.wmkf_role === ROLE_PI ? 'pi' : 'copi';
        const row = ensureRow(r._wmkf_request_value, role, r.wmkf_authorposition ?? null);
        row.sources.add('junction');
      }

      for (const r of projectLeaderResp.records || []) {
        // Projectleader is always the PI; position 0 by convention.
        const row = ensureRow(r.akoya_requestid, 'pi', 0);
        row.sources.add('projectleader');
      }

      const rows = Array.from(rowMap.values());

      // ── Fetch request metadata once per distinct requestId ─────────────
      const distinctRequestIds = [...new Set(rows.map(r => r.requestId))];
      const requestMetaById = new Map();

      if (distinctRequestIds.length > 0) {
        // OData `or` chain — bounded by junction.top (100) + projectleader.top (100).
        // Worst-case 200 distinct requests; usually far fewer.
        const orFilter = distinctRequestIds
          .map(id => `akoya_requestid eq ${id}`)
          .join(' or ');
        const meta = await DynamicsService.queryRecords('akoya_requests', {
          select: REQUEST_SELECT,
          filter: orFilter,
          top: 100,
        });
        for (const r of meta.records || []) {
          requestMetaById.set(r.akoya_requestid, r);
        }
        // If we exceeded top=100 the meta query truncates; do a second pass
        // for any remaining ids.
        if (distinctRequestIds.length > meta.records.length) {
          const remaining = distinctRequestIds.filter(id => !requestMetaById.has(id));
          if (remaining.length > 0) {
            const secondFilter = remaining
              .map(id => `akoya_requestid eq ${id}`)
              .join(' or ');
            const more = await DynamicsService.queryRecords('akoya_requests', {
              select: REQUEST_SELECT,
              filter: secondFilter,
              top: 100,
            });
            for (const r of more.records || []) {
              requestMetaById.set(r.akoya_requestid, r);
            }
          }
        }
      }

      // ── Project + sort ──────────────────────────────────────────────────
      const projected = rows.map(r => {
        const meta = requestMetaById.get(r.requestId) || {};
        const cycleCode = meta.wmkf_meetingdate ? meetingDateToCycleCode(meta.wmkf_meetingdate) : null;
        return {
          requestId: r.requestId,
          requestNumber: meta.akoya_requestnum || null,
          title: meta.akoya_title || null,
          meetingDate: meta.wmkf_meetingdate || null,
          cycleCode,
          cycleLabel: cycleCode ? cycleCodeToLabel(cycleCode) : null,
          requestStatus: meta.akoya_requeststatus || null,
          role: r.role,
          position: r.position,
          sources: Array.from(r.sources).sort(),
        };
      });

      // Sort newest first by meeting date; nulls (missing meta) last.
      projected.sort((a, b) => {
        if (!a.meetingDate && !b.meetingDate) return 0;
        if (!a.meetingDate) return 1;
        if (!b.meetingDate) return -1;
        return b.meetingDate.localeCompare(a.meetingDate);
      });

      const counts = {
        pi: projected.filter(r => r.role === 'pi').length,
        copi: projected.filter(r => r.role === 'copi').length,
        total: projected.length,
      };

      return res.status(200).json({
        contactId,
        rows: projected,
        counts,
      });
    } catch (err) {
      console.error('[contact-history] error:', err);
      return res.status(500).json({ error: err.message || 'Internal error' });
    }
  });
}
