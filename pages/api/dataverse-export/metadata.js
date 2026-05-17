/**
 * Dataverse Power Tools — Track B — GET /api/dataverse-export/metadata
 *
 * Live taxonomies for the builder (program / type / funding-category /
 * status), enumerated from Dataverse AT REQUEST TIME — never a hardcoded
 * list (design doc §"Living taxonomy", build plan §5/§9). FAIL-LOUD on any
 * fetch failure: a visible error, never a silent stale/partial list (a
 * silently-short taxonomy is the plausible-wrong-answer this tool exists to
 * prevent — it would make a real program invisible in the builder).
 *
 * requireAppAccess('dataverse-bulk-export') per-route gate (build plan §5/§7:
 * registry membership is necessary but not sufficient).
 */

import { requireAppAccess } from '../../../lib/utils/auth';
import { DynamicsService } from '../../../lib/services/dynamics-service';
import { fetchXmlPage, FetchXmlError } from '../../../lib/services/dataverse-export/fetch-client';

export const config = { api: { externalResolver: true } };

const API = '/api/data/v9.2';

// Minimal authed OData GET for the small reference entities (≤~30 rows each;
// no paging concern). Distinct status values come via FetchXML distinct.
async function odataList(entitySet, select, orderby) {
  const token = await DynamicsService.getAccessToken();
  const base = process.env.DYNAMICS_URL;
  if (!base) throw new FetchXmlError('Missing DYNAMICS_URL', { stage: 'config' });
  const qs = new URLSearchParams({ $select: select });
  if (orderby) qs.set('$orderby', orderby);
  const resp = await fetch(`${base}${API}/${entitySet}?${qs}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      Prefer: 'odata.include-annotations="*"',
    },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`taxonomy fetch failed for ${entitySet} (HTTP ${resp.status}): `
      + `${body.slice(0, 300)}`);
  }
  const data = await resp.json();
  return (data.value || []).map(r => DynamicsService.processAnnotations(r));
}

export default async function handler(req, res) {
  const access = await requireAppAccess(req, res, 'dataverse-bulk-export');
  if (!access) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // akoya_program (the fine 24-program taxonomy — keyed by GUID; duplicate
    // names exist, so id is authoritative), wmkf_type, wmkf_grantprogram.
    const [programs, types, fundingCategories] = await Promise.all([
      odataList('akoya_programs', 'akoya_programid,akoya_name', 'akoya_name asc'),
      odataList('wmkf_types', 'wmkf_typeid,wmkf_name', 'wmkf_name asc'),
      odataList('wmkf_grantprograms', 'wmkf_grantprogramid,wmkf_name', 'wmkf_name asc'),
    ]);

    // akoya_requeststatus is a STRING field — its "taxonomy" is the set of
    // values actually present. Enumerate distinct live (FetchXML distinct);
    // never a hardcoded status list.
    const distinctFx =
      '<fetch distinct="true"><entity name="akoya_request">'
      + '<attribute name="akoya_requeststatus" /></entity></fetch>';
    const statusPage = await fetchXmlPage('akoya_requests', distinctFx, { page: 1 });
    const statuses = [...new Set(
      statusPage.rows.map(r => r.akoya_requeststatus).filter(Boolean),
    )].sort();

    return res.status(200).json({
      entity: 'akoya_request',
      enumeratedAt: new Date().toISOString(),
      programs: programs.map(p => ({
        id: p.akoya_programid, name: p.akoya_name ?? '(unnamed)',
      })),
      types: types.map(t => ({ id: t.wmkf_typeid, name: t.wmkf_name ?? '(unnamed)' })),
      fundingCategories: fundingCategories.map(g => ({
        id: g.wmkf_grantprogramid, name: g.wmkf_name ?? '(unnamed)',
      })),
      statuses,
      note: 'Live taxonomy enumerated at request time — never hardcoded. A '
        + 'value absent here that later appears in a result is surfaced as '
        + 'UNCLASSIFIED by the export engine, never silently dropped.',
    });
  } catch (err) {
    // FAIL LOUD — no stale/partial fallback (Living-taxonomy contract §9).
    console.error('[dataverse-export/metadata] taxonomy fetch failed:', err);
    return res.status(502).json({
      error: 'TAXONOMY_FETCH_FAILED',
      detail: String(err.message || err),
      message: 'Could not enumerate live Dataverse taxonomies. Refusing to '
        + 'serve a stale or partial list — retry; if it persists this is an '
        + 'actionable Dataverse/connectivity condition, not a soft warning.',
    });
  }
}
