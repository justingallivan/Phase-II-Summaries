/**
 * Dataverse Power Tools — Track B — POST /api/dataverse-export/run
 *
 * The ONE retrieval path (build plan §5/§12). Body = the `resultToken` from a
 * prior /preview (the server-side confirm gate — serverless has no shared
 * state, so the token IS the gate: /run cannot execute a spec the user did
 * not see previewed). This single POST is itself an SSE response: in one
 * invocation it re-validates → backoff-hardened FetchXML paging → disclosure
 * engine → workbook → writes the .xlsx to Vercel Blob → terminal
 * {event:'ready', downloadUrl}. Loud truncation; a terminal error writes NO
 * Blob (a failure can never present as a short-but-complete file).
 *
 * No base64-over-SSE, no streamed Content-Disposition body, no second GET —
 * those were explicitly rejected (build plan §5/§12).
 */

import { put } from '@vercel/blob';
import { requireAppAccess } from '../../../lib/utils/auth';
import { compile, validateQuerySpec } from '../../../lib/services/dataverse-export/compiler';
import {
  fetchXmlAll, fetchXmlAggregateCount, FetchXmlError,
} from '../../../lib/services/dataverse-export/fetch-client';
import { annotate } from '../../../lib/services/dataverse-export/disclosure';
import { buildWorkbook, WorkbookError } from '../../../lib/services/dataverse-export/workbook';
import { verifyResultToken } from '../../../lib/services/dataverse-export/result-token';

const ENTITY_SET = 'akoya_requests';
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const config = {
  api: { bodyParser: { sizeLimit: '256kb' }, responseLimit: false, externalResolver: true },
  maxDuration: 300, // Vercel ceiling; the engine self-limits at 240s (§3a)
};

export default async function handler(req, res) {
  const access = await requireAppAccess(req, res, 'dataverse-bulk-export');
  if (!access) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // The stateless confirm gate — verify BEFORE any SSE headers so a bad
  // token gets a clean JSON 4xx, not a half-stream.
  const token = req.body && req.body.resultToken;
  const verified = await verifyResultToken(token);
  if (!verified.valid) {
    return res.status(403).json({
      error: 'CONFIRM_TOKEN_INVALID',
      reason: verified.reason,
      message: 'Run requires a valid resultToken minted by /preview — the '
        + 'run cannot execute a spec the user did not see previewed.',
    });
  }

  // Defence in depth: the spec was validated at /preview, but re-validate
  // (the token is signed by us, yet §2.1 says preview & run run the
  // identical matrix — never partially execute a spec).
  const spec = verified.spec;
  const check = validateQuerySpec(spec);
  if (!check.valid) {
    return res.status(check.status).json(check.body);
  }

  // SSE — set only AFTER the gate (requireAppAccess ran validateOrigin/CSRF
  // synchronously; the token gate above is also pre-stream).
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const send = (event, data) => {
    try { res.write(`data: ${JSON.stringify({ event, ...data })}\n\n`); }
    catch { /* client disconnected */ }
  };

  try {
    const compiled = compile(spec);

    // True total first (FetchXML aggregate — never /$count) so the artifact
    // can state true-vs-returned and the client can show loud truncation.
    const trueTotal = await fetchXmlAggregateCount(
      ENTITY_SET, compiled.countFetchXml, compiled.countAlias);
    send('progress', { stage: 'count', total: trueTotal, pages: 0, fetched: 0 });

    // Backoff-hardened paging. A page that ultimately fails throws → caught
    // below → terminal error, NO Blob (never a silently-short file).
    const result = await fetchXmlAll(ENTITY_SET, compiled.fetchXml, {
      onProgress: ({ pages, fetched }) =>
        send('progress', { stage: 'paging', pages, fetched, total: trueTotal }),
    });

    if (result.capped || result.truncatedByBudget) {
      send('truncated', {
        reason: result.capped ? 'cap' : 'budget',
        total: trueTotal,
        fetched: result.fetched,
      });
    }

    // Disclosure engine + workbook (its own 40 MB loud ceiling).
    const { rows, summary } = annotate(result.rows, spec);
    const buf = await buildWorkbook({
      rows, summary, querySpec: spec,
      appliedRules: compiled.appliedRules,
      counts: {
        trueTotal,
        returned: result.fetched,
        capped: result.capped,
        truncatedByBudget: result.truncatedByBudget,
      },
    });

    // Publish to Vercel Blob ONLY after a fully successful build. Public +
    // addRandomSuffix → an unguessable URL; the staff gate is upstream and
    // the existing maintenance Blob sweep handles TTL cleanup.
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const blob = await put(
      `dataverse-export/akoya-export-${stamp}-${result.fetched}rows.xlsx`,
      buf,
      { access: 'public', contentType: XLSX_MIME, addRandomSuffix: true },
    );

    send('ready', {
      downloadUrl: blob.url,
      bytes: buf.byteLength,
      rows: result.fetched,
      trueTotal,
      truncated: !!(result.capped || result.truncatedByBudget),
    });
    return res.end();
  } catch (err) {
    // Terminal failure — NO Blob written, so there is nothing for the client
    // to download. A failure can never present as a short-but-complete file.
    const cls = err instanceof WorkbookError ? 'workbook'
      : err instanceof FetchXmlError ? (err.stage || 'paging')
        : (err && err.status === 422 ? 'validation' : 'unknown');
    console.error('[dataverse-export/run] terminal error:', err);
    send('error', {
      stage: cls,
      message: String(err.message || err),
      retryable: !!(err instanceof FetchXmlError && err.retryable),
    });
    return res.end();
  }
}
