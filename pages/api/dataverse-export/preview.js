/**
 * Dataverse Power Tools — Track B — POST /api/dataverse-export/preview
 *
 * The human-confirm gate (build plan §5). Validates the QuerySpec (§2.1 →
 * 422 + violation list), compiles it, computes the TRUE total via FetchXML
 * aggregate count (NEVER OData /$count), and an era split (migrated/native
 * via the createdon provenance partition — three aggregate counts, NO data
 * rows). Returns the compiled FetchXML for inspection, the plain-English
 * appliedRules, any compile-time fail-loud (requiresResolver), an estimate,
 * and a signed `resultToken` that BINDS this exact validated spec so /run
 * cannot execute something the user did not see previewed.
 *
 * Per-row disclosure (the unclassified set, exact program-roll-up $) is
 * DISCOVERED from returned values and is finalized in the artifact's
 * Methods sheet at /run — it is not hidden, it is sequenced: the preview
 * shows everything computable before any rows are read (true total, era
 * composition, applied rules, fail-loud warnings).
 */

import { requireAppAccess } from '../../../lib/utils/auth';
import { compile, validateQuerySpec } from '../../../lib/services/dataverse-export/compiler';
import { fetchXmlAggregateCount, FetchXmlError } from '../../../lib/services/dataverse-export/fetch-client';
import { mintResultToken } from '../../../lib/services/dataverse-export/result-token';

const ENTITY_SET = 'akoya_requests'; // akoya_request → akoya_requests (v1 fixed)

export const config = {
  api: { bodyParser: { sizeLimit: '256kb' }, externalResolver: true },
};

export default async function handler(req, res) {
  const access = await requireAppAccess(req, res, 'dataverse-bulk-export');
  if (!access) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const spec = req.body && req.body.querySpec;

  // §2.1 — validate first; 422 + the full violation list, never a 500.
  const check = validateQuerySpec(spec);
  if (!check.valid) {
    return res.status(check.status).json(check.body);
  }

  try {
    const compiled = compile(spec);

    // TRUE total (FetchXML aggregate) + era split (createdon PROVENANCE
    // partition via the compiler's eraScope — never a business-period
    // filter). Three aggregate counts; zero data rows.
    const [trueTotal, migrated, native] = await Promise.all([
      fetchXmlAggregateCount(ENTITY_SET, compiled.countFetchXml, compiled.countAlias),
      fetchXmlAggregateCount(ENTITY_SET,
        compile({ ...spec, eraScope: 'migrated' }).countFetchXml, compiled.countAlias),
      fetchXmlAggregateCount(ENTITY_SET,
        compile({ ...spec, eraScope: 'native' }).countFetchXml, compiled.countAlias),
    ]);

    const estBytesPerRow = 1500; // rough; the artifact's real ceiling is 40 MB
    const estBytes = trueTotal * estBytesPerRow;

    const { token, expiresInSec } = await mintResultToken(spec, { trueTotal });

    return res.status(200).json({
      trueTotal,
      eraSplit: { migrated, native, reconciles: migrated + native === trueTotal },
      compiledFetchXml: compiled.fetchXml,
      countFetchXml: compiled.countFetchXml,
      appliedRules: compiled.appliedRules,
      requiresResolver: compiled.requiresResolver,
      estimate: {
        rows: trueTotal,
        approxBytes: estBytes,
        note: trueTotal > 50000
          ? 'Exceeds the 50,000-row hard cap — the run will be truncated '
            + '(loud). Narrow by program / year / status / institution.'
          : 'Within hard limits.',
      },
      compositionNote:
        'True total + era composition shown pre-run. The per-row disclosure '
        + '(UNCLASSIFIED set, exact Option-B program roll-up $, decline '
        + 'trifurcation, institution resolution) is discovered from returned '
        + 'values and baked into the artifact Methods sheet at /run — '
        + 'sequenced, never hidden.'
        + (compiled.requiresResolver
          ? ' ⚠ Operational-exclusion clauses are DEFERRED (live-taxonomy '
            + 'resolver not wired in this build) — see appliedRules.'
          : ''),
      resultToken: token,
      resultTokenExpiresInSec: expiresInSec,
    });
  } catch (err) {
    if (err && err.status === 422) {
      return res.status(422).json(err.body);
    }
    const isFetch = err instanceof FetchXmlError;
    console.error('[dataverse-export/preview] failed:', err);
    return res.status(isFetch ? 502 : 500).json({
      error: isFetch ? 'TRUE_COUNT_FAILED' : 'PREVIEW_FAILED',
      detail: String(err.message || err),
      message: 'Refusing to show a guessed total. Retry; if the result '
        + 'exceeds the 50,000 aggregate-count limit, narrow the filter.',
    });
  }
}
