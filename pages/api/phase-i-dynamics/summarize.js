/**
 * API Route: /api/phase-i-dynamics/summarize
 *
 * POST: Single-request Phase I proposal summarization with Dynamics writeback.
 *
 * - Loads a proposal file (SharePoint or upload) identified by a FileRef.
 * - Runs the Phase I summarization prompt (same prompt used by the batch app).
 * - Writes the narrative summary to akoya_request.wmkf_ai_summary via PATCH.
 * - Logs an append-only audit row to wmkf_ai_run (taskType=summary).
 *
 * Test surface for Dynamics Field Set A writeback. Only writes the narrative
 * field for now; wmkf_ai_dataextract (structured JSON) left for a later pass
 * once the capture shape is settled.
 */

import { requireAppAccess } from '../../../lib/utils/auth';
import {
  BASE_CONFIG,
  KECK_GUIDELINES,
  getModelForApp,
  loadModelOverrides,
} from '../../../shared/config';
import {
  createPhaseISummarizationPrompt,
  PHASE_I_PROMPT_VERSION,
} from '../../../shared/config/prompts/phase-i-summaries';
import { logUsage } from '../../../lib/utils/usage-logger';
import { nextRateLimiter } from '../../../shared/api/middleware/rateLimiter';
import { loadFile } from '../../../lib/utils/file-loader';
import { DynamicsService } from '../../../lib/services/dynamics-service';

const APP_KEY = 'batch-phase-i-summaries';
const limiter = nextRateLimiter({ max: 5 });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const access = await requireAppAccess(req, res, APP_KEY);
  if (!access) return;

  const allowed = await limiter(req, res);
  if (allowed !== true) return;

  await loadModelOverrides();

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Claude API key not configured on server' });
  }

  const {
    requestGuid = null,
    fileRef = null,
    summaryLength = 1,
    summaryLevel = 'technical-non-expert',
    overwrite = false,
  } = req.body || {};

  if (!requestGuid) {
    return res.status(400).json({ error: 'requestGuid is required' });
  }
  if (!fileRef) {
    return res.status(400).json({ error: 'fileRef is required' });
  }

  try {
    // DynamicsService guards queries behind setRestrictions(); this endpoint
    // only reads/writes akoya_request by ID, so an empty restriction set is fine.
    DynamicsService.bypassRestrictions('phase-i-dynamics');

    // ─── Pre-flight: don't clobber existing wmkf_ai_summary ─────────────────
    // User-initiated flows should never silently overwrite prior analyses.
    // Backend/PowerAutomate flows can skip this check; they're authoritative reruns.
    //
    // Capture the record's @odata.etag so the PATCH below can use If-Match for
    // optimistic concurrency — closes the TOCTOU gap between this read and the
    // write. If another caller has updated the row in between, PATCH returns 412.
    let preflightEtag = null;
    if (!overwrite) {
      const existing = await DynamicsService.getRecord('akoya_requests', requestGuid, {
        select: 'wmkf_ai_summary,modifiedon',
      });
      const current = (existing?.wmkf_ai_summary || '').trim();
      if (current.length > 0) {
        return res.status(409).json({
          error: 'wmkf_ai_summary already populated — confirm overwrite to proceed',
          conflict: {
            field: 'wmkf_ai_summary',
            existingLength: current.length,
            existingContent: current,
            recordModifiedOn: existing?.modifiedon || null,
          },
        });
      }
      preflightEtag = existing?._etag || null;
    }

    const fileLoad = await loadFile(fileRef);
    const model = getModelForApp('batch-phase-i');
    const prompt = createPhaseISummarizationPrompt(
      fileLoad.text,
      summaryLength,
      summaryLevel,
      KECK_GUIDELINES,
    );

    // ─── Call Claude ────────────────────────────────────────────────────────
    const start = Date.now();
    let summaryText, usage, modelUsed;
    try {
      const resp = await fetch(BASE_CONFIG.CLAUDE.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey.trim(),
          'anthropic-version': BASE_CONFIG.CLAUDE.ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: BASE_CONFIG.MODEL_PARAMS.DEFAULT_MAX_TOKENS,
          temperature: BASE_CONFIG.MODEL_PARAMS.SUMMARIZATION_TEMPERATURE,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`Claude API error (${resp.status}): ${body}`);
      }
      const data = await resp.json();
      summaryText = data.content?.[0]?.text || '';
      usage = data.usage || null;
      modelUsed = data.model || model;
    } catch (err) {
      await tryLogAiRun({
        requestGuid,
        model,
        status: 'failed',
        rawOutput: { error: err.message },
        notes: `Phase I Dynamics summarize — Claude call failed (${fileLoad.filename})`,
      });
      throw err;
    }
    const latencyMs = Date.now() - start;

    logUsage({
      userProfileId: access.profileId,
      appName: 'batch-phase-i',
      model: modelUsed,
      inputTokens: usage?.input_tokens || 0,
      outputTokens: usage?.output_tokens || 0,
      latencyMs,
      status: 'success',
    });

    if (!summaryText || summaryText.trim().length < 20) {
      await tryLogAiRun({
        requestGuid,
        model: modelUsed,
        status: 'failed',
        rawOutput: { error: 'empty-summary', raw: summaryText },
        notes: `Phase I Dynamics summarize — empty summary (${fileLoad.filename})`,
      });
      return res.status(502).json({ error: 'Claude returned an empty summary' });
    }

    // ─── Writeback to akoya_request.wmkf_ai_summary ─────────────────────────
    // Uses If-Match with the preflight ETag (when we have one) so concurrent
    // edits surface as 412 instead of silently overwriting.
    let writebackOk = false;
    let writebackFailureCategory = null;
    let serverSideWritebackError = null;
    try {
      await DynamicsService.updateRecord(
        'akoya_requests',
        requestGuid,
        { wmkf_ai_summary: summaryText },
        preflightEtag ? { ifMatch: preflightEtag } : undefined,
      );
      writebackOk = true;
    } catch (err) {
      serverSideWritebackError = err.message;
      writebackFailureCategory = err.status === 412 ? 'conflict' : 'writeback_failed';
      console.error('[PhaseIDynamics:summarize] wmkf_ai_summary writeback failed:', err.message);
    }

    // ─── Append-only audit row ──────────────────────────────────────────────
    // Category label keeps raw Dynamics error out of the audit memo (which is
    // itself stored in Dynamics and visible to more users than the API caller).
    const auditLogCreated = await tryLogAiRun({
      requestGuid,
      model: modelUsed,
      status: writebackOk ? 'completed' : 'needs_review',
      rawOutput: { summary: summaryText, filename: fileLoad.filename, summaryLength, summaryLevel },
      notes: writebackOk
        ? `Phase I Dynamics summarize (${fileLoad.filename}) — wmkf_ai_summary updated`
        : `Phase I Dynamics summarize (${fileLoad.filename}) — writeback ${writebackFailureCategory}`,
    });

    return res.status(200).json({
      summary: summaryText,
      filename: fileLoad.filename,
      model: modelUsed,
      writtenToDynamics: writebackOk,
      // Category only — internal Dynamics error details stay in server logs.
      writebackFailure: writebackFailureCategory,
      auditLogCreated,
    });
  } catch (err) {
    if (err.status && err.status >= 400 && err.status < 600) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('[PhaseIDynamics:summarize] Unhandled error:', err);
    return res.status(500).json({
      error: 'Failed to summarize proposal',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
}

// Returns true when the audit row was successfully created. Failures are
// logged but not rethrown — the user-facing flow must continue — however the
// boolean bubbles to the response as `auditLogCreated` so monitoring can
// alert on audit gaps.
async function tryLogAiRun({ requestGuid, model, status, rawOutput, notes }) {
  if (!requestGuid) return false;
  try {
    await DynamicsService.logAiRun({
      requestGuid,
      taskType: 'summary',
      model,
      promptVersion: PHASE_I_PROMPT_VERSION,
      status,
      rawOutput,
      notes,
    });
    return true;
  } catch (err) {
    console.warn(`[PhaseIDynamics:summarize] logAiRun failed (non-fatal): ${err.message}`);
    return false;
  }
}

export const config = {
  api: {
    bodyParser: { sizeLimit: '1mb' },
  },
  maxDuration: 300,
};
