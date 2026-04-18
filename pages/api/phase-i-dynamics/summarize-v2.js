/**
 * API Route: /api/phase-i-dynamics/summarize-v2 — EXPERIMENT
 *
 * Same external contract as /summarize, but:
 *   - Fetches the prompt template from Dynamics (via PromptResolver) rather
 *     than importing from shared/config/prompts/phase-i-summaries.js
 *   - Uses the system/user message split (system = static instructions +
 *     Keck guidelines, user = proposal text)
 *   - Puts cache_control on the system block so repeated runs within 5 min
 *     hit Anthropic's prompt cache
 *   - Records promptSource: 'dynamics' in the audit-row notes so we can
 *     distinguish v1 vs v2 runs in `wmkf_ai_run`
 *
 * Fallback behavior: if the Dynamics read or interpolation fails, the request
 * errors out rather than silently falling back to the .js prompt. We want
 * failures to be visible during the experiment.
 */

import { requireAppAccess } from '../../../lib/utils/auth';
import {
  BASE_CONFIG,
  getModelForApp,
  loadModelOverrides,
} from '../../../shared/config';
import { PHASE_I_PROMPT_VERSION } from '../../../shared/config/prompts/phase-i-summaries';
import { logUsage } from '../../../lib/utils/usage-logger';
import { nextRateLimiter } from '../../../shared/api/middleware/rateLimiter';
import { loadFile } from '../../../lib/utils/file-loader';
import { DynamicsService } from '../../../lib/services/dynamics-service';
import { PromptResolver } from '../../../lib/services/prompt-resolver';

const APP_KEY = 'batch-phase-i-summaries';
const PROMPT_APP_KEY = 'phase-i-dynamics-v2';
const limiter = nextRateLimiter({ max: 5 });

const AUDIENCE_DESCRIPTIONS = {
  'general-audience': 'a general audience, avoiding technical jargon and explaining concepts in accessible terms',
  'technical-non-expert': 'a technical non-expert audience, using some technical terms but explaining complex concepts clearly',
  'technical-expert': 'a technical expert audience, using field-specific terminology and assuming domain knowledge',
};

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
    DynamicsService.setRestrictions([], 'phase-i-dynamics-v2');

    // Pre-flight: same no-clobber guard as v1. Capture @odata.etag so the
    // PATCH can use If-Match (optimistic concurrency) and close the TOCTOU gap.
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

    // ─── Fetch prompt from Dynamics ────────────────────────────────────────
    const promptFetchStart = Date.now();
    let prompt;
    try {
      prompt = await PromptResolver.getPrompt(PROMPT_APP_KEY);
    } catch (err) {
      console.error('[PhaseIDynamics:summarize-v2] Prompt fetch failed:', err.message);
      return res.status(500).json({
        error: 'Failed to fetch prompt template from Dynamics',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined,
      });
    }
    const promptFetchMs = Date.now() - promptFetchStart;

    // ─── Load proposal file ────────────────────────────────────────────────
    const fileLoad = await loadFile(fileRef);
    const model = getModelForApp('batch-phase-i');

    // ─── Interpolate template variables ───────────────────────────────────
    const audienceDescription =
      AUDIENCE_DESCRIPTIONS[summaryLevel] || AUDIENCE_DESCRIPTIONS['technical-non-expert'];
    const summaryLengthSuffix = summaryLength > 1 ? 's' : '';

    const systemPromptResolved = PromptResolver.interpolate(prompt.systemPrompt, {
      summary_length: summaryLength,
      summary_length_suffix: summaryLengthSuffix,
      audience_description: audienceDescription,
    });
    const userPromptResolved = PromptResolver.interpolate(prompt.userPromptTemplate, {
      proposal_text: fileLoad.text.substring(0, 100000),
    });

    // ─── Call Claude with system/user split + cache_control ───────────────
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
          system: [
            { type: 'text', text: systemPromptResolved, cache_control: { type: 'ephemeral' } },
          ],
          messages: [{ role: 'user', content: userPromptResolved }],
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
        rawOutput: { error: err.message, promptSource: prompt.source, promptRecord: prompt.recordGuid },
        notes: `Phase I v2 (Dynamics prompt) — Claude call failed (${fileLoad.filename})`,
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
      cacheCreationTokens: usage?.cache_creation_input_tokens || 0,
      cacheReadTokens: usage?.cache_read_input_tokens || 0,
      latencyMs,
      status: 'success',
    });

    if (!summaryText || summaryText.trim().length < 20) {
      await tryLogAiRun({
        requestGuid,
        model: modelUsed,
        status: 'failed',
        rawOutput: { error: 'empty-summary', raw: summaryText, promptSource: prompt.source },
        notes: `Phase I v2 (Dynamics prompt) — empty summary (${fileLoad.filename})`,
      });
      return res.status(502).json({ error: 'Claude returned an empty summary' });
    }

    // ─── Writeback ─────────────────────────────────────────────────────────
    // If-Match with the preflight ETag makes concurrent edits surface as 412
    // rather than silently overwriting.
    let writebackOk = false;
    let writebackFailureCategory = null;
    try {
      await DynamicsService.updateRecord(
        'akoya_requests',
        requestGuid,
        { wmkf_ai_summary: summaryText },
        preflightEtag ? { ifMatch: preflightEtag } : undefined,
      );
      writebackOk = true;
    } catch (err) {
      writebackFailureCategory = err.status === 412 ? 'conflict' : 'writeback_failed';
      console.error('[PhaseIDynamics:summarize-v2] wmkf_ai_summary writeback failed:', err.message);
    }

    const auditLogCreated = await tryLogAiRun({
      requestGuid,
      model: modelUsed,
      status: writebackOk ? 'completed' : 'needs_review',
      rawOutput: {
        summary: summaryText,
        filename: fileLoad.filename,
        summaryLength,
        summaryLevel,
        promptSource: prompt.source,
        promptRecord: prompt.recordGuid,
        promptVariant: 'v2-split-dynamics',
      },
      notes: writebackOk
        ? `Phase I v2 Dynamics prompt (${fileLoad.filename}) — wmkf_ai_summary updated [source=${prompt.source}]`
        : `Phase I v2 Dynamics prompt (${fileLoad.filename}) — writeback ${writebackFailureCategory}`,
    });

    return res.status(200).json({
      summary: summaryText,
      filename: fileLoad.filename,
      model: modelUsed,
      writtenToDynamics: writebackOk,
      writebackFailure: writebackFailureCategory,
      auditLogCreated,
      promptMeta: {
        source: prompt.source,
        recordGuid: prompt.recordGuid,
        fetchMs: promptFetchMs,
        systemPromptChars: systemPromptResolved.length,
        userPromptChars: userPromptResolved.length,
      },
      cacheMeta: {
        cacheCreationTokens: usage?.cache_creation_input_tokens || 0,
        cacheReadTokens: usage?.cache_read_input_tokens || 0,
        inputTokens: usage?.input_tokens || 0,
      },
    });
  } catch (err) {
    if (err.status && err.status >= 400 && err.status < 600) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('[PhaseIDynamics:summarize-v2] Unhandled error:', err);
    return res.status(500).json({
      error: 'Failed to summarize proposal',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
}

// Returns true on successful audit-row write. Failure is logged but not
// rethrown; the boolean surfaces as `auditLogCreated` in the response so
// monitoring can detect audit gaps.
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
    console.warn(`[PhaseIDynamics:summarize-v2] logAiRun failed (non-fatal): ${err.message}`);
    return false;
  }
}

export const config = {
  api: {
    bodyParser: { sizeLimit: '1mb' },
  },
  maxDuration: 300,
};
