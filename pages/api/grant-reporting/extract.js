/**
 * API Route: /api/grant-reporting/extract
 *
 * POST: Extract structured grant report data and (optionally) compare the
 *       original proposal to the report for a goals assessment. Supports three
 *       modes:
 *
 *  - mode: "full"               Run extraction + goals assessment in parallel.
 *  - mode: "regenerate"         Re-run extraction for a single narrative field.
 *  - mode: "regenerate-goals"   Re-run only the goals assessment.
 *
 * Files are described by FileRef objects:
 *  { source: "upload",     fileUrl, filename }
 *  { source: "sharepoint", library, folder, filename }
 *
 * The goals assessment helper (`compareProposalToReport`) is exported as a
 * pure async function so a future backend pipeline can call it directly
 * without going through req/res.
 */

import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { jsonrepair } from 'jsonrepair';
import { requireAppAccess } from '../../../lib/utils/auth';
import {
  BASE_CONFIG,
  getModelForApp,
  getFallbackModelForApp,
  loadModelOverrides,
} from '../../../shared/config/baseConfig';
import {
  createGrantReportExtractionPrompt,
  createFieldRegenerationPrompt,
  createGoalsAssessmentPrompt,
  GRANT_REPORT_PROMPT_VERSION,
} from '../../../shared/config/prompts/grant-reporting';
import { logUsage, estimateCostCents } from '../../../lib/utils/usage-logger';
import { nextRateLimiter } from '../../../shared/api/middleware/rateLimiter';
import { safeFetch } from '../../../lib/utils/safe-fetch';
import { GraphService } from '../../../lib/services/graph-service';
import { DynamicsService } from '../../../lib/services/dynamics-service';

const APP_KEY = 'grant-reporting';
const limiter = nextRateLimiter({ max: 5 });

const MAX_TEXT_LENGTH = BASE_CONFIG?.FILE_PROCESSING?.MAX_TEXT_LENGTH || 1000000;

const ALLOWED_NARRATIVE_FIELDS = new Set([
  'project_impacts',
  'awards_and_honors',
  'publication_1',
  'publication_2',
  'implications_for_future_grantmaking',
]);

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
    mode = 'full',
    reportRef,
    proposalRef = null,
    headerFromDynamics = {},
    fieldKey,
    currentValues = {},
    requestGuid = null,
  } = req.body || {};

  try {
    if (mode === 'full') {
      return await handleFull({
        res,
        access,
        apiKey,
        reportRef,
        proposalRef,
        headerFromDynamics,
        requestGuid,
      });
    }

    if (mode === 'regenerate') {
      return await handleRegenerate({
        res,
        access,
        apiKey,
        reportRef,
        fieldKey,
        currentValues,
        requestGuid,
      });
    }

    if (mode === 'regenerate-goals') {
      return await handleRegenerateGoals({
        res,
        access,
        apiKey,
        reportRef,
        proposalRef,
        headerFromDynamics,
        currentValues,
        requestGuid,
      });
    }

    return res.status(400).json({ error: `Unknown mode: ${mode}` });
  } catch (err) {
    // Convert known HTTP errors to proper status codes
    if (err.status && err.status >= 400 && err.status < 600) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('[GrantReporting:extract] Unhandled error:', err);
    return res.status(500).json({
      error: 'Failed to process grant report',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
}

// ─── Mode handlers ─────────────────────────────────────────────────────────

async function handleFull({ res, access, apiKey, reportRef, proposalRef, headerFromDynamics, requestGuid }) {
  if (!reportRef) {
    return res.status(400).json({ error: 'reportRef is required for mode=full' });
  }

  const reportLoad = await loadFile(reportRef);
  const proposalLoad = proposalRef ? await loadFile(proposalRef) : null;

  const model = getModelForApp(APP_KEY);
  const fallback = getFallbackModelForApp(APP_KEY);

  // Run extraction + goals assessment in parallel
  const extractionPromise = extractReport({
    reportText: reportLoad.text,
    headerFromDynamics,
    apiKey,
    model,
    fallback,
    userProfileId: access.profileId,
    requestGuid,
  });

  const goalsPromise = proposalLoad
    ? compareProposalToReport({
        proposalText: proposalLoad.text,
        reportText: reportLoad.text,
        headerContext: headerFromDynamics,
        apiKey,
        model,
        fallback,
        userProfileId: access.profileId,
        requestGuid,
      })
    : Promise.resolve(null);

  const [extraction, goalsAssessment] = await Promise.all([extractionPromise, goalsPromise]);

  return res.status(200).json({
    header: extraction.header,
    counts: extraction.counts,
    narratives: extraction.narratives,
    goalsAssessment,
    metadata: {
      reportFilename: reportLoad.filename,
      proposalFilename: proposalLoad?.filename || null,
      model,
    },
  });
}

async function handleRegenerate({ res, access, apiKey, reportRef, fieldKey, currentValues, requestGuid }) {
  if (!reportRef) {
    return res.status(400).json({ error: 'reportRef is required for mode=regenerate' });
  }
  if (!fieldKey || !ALLOWED_NARRATIVE_FIELDS.has(fieldKey)) {
    return res.status(400).json({
      error: `fieldKey must be one of: ${[...ALLOWED_NARRATIVE_FIELDS].join(', ')}`,
    });
  }

  const reportLoad = await loadFile(reportRef);
  const model = getModelForApp(APP_KEY);
  const fallback = getFallbackModelForApp(APP_KEY);

  const prompt = createFieldRegenerationPrompt(reportLoad.text, fieldKey, currentValues);
  const temperature = fieldKey === 'implications_for_future_grantmaking' ? 0.6 : 0.1;

  const start = Date.now();
  let result;
  try {
    result = await callClaudeWithFallback({
      apiKey,
      model,
      fallback,
      prompt,
      temperature,
      maxTokens: 2048,
    });
  } catch (err) {
    await tryLogAiRun({
      requestGuid,
      model,
      status: 'failed',
      rawOutput: { error: err.message, fieldKey },
      notes: `Grant Reporting regenerate (${fieldKey}) — Claude call failed`,
    });
    throw err;
  }
  const latencyMs = Date.now() - start;

  logUsage({
    userProfileId: access.profileId,
    appName: APP_KEY,
    model: result.modelUsed,
    inputTokens: result.usage?.input_tokens || 0,
    outputTokens: result.usage?.output_tokens || 0,
    latencyMs,
    status: 'success',
  });

  const parsed = parseJsonResponse(result.text);

  await tryLogAiRun({
    requestGuid,
    model: result.modelUsed,
    status: 'completed',
    rawOutput: { fieldKey, value: parsed.value ?? '' },
    notes: `Grant Reporting regenerate (${fieldKey})`,
  });

  return res.status(200).json({ value: parsed.value ?? '' });
}

async function handleRegenerateGoals({
  res,
  access,
  apiKey,
  reportRef,
  proposalRef,
  headerFromDynamics,
  currentValues,
  requestGuid,
}) {
  if (!reportRef || !proposalRef) {
    return res.status(400).json({
      error: 'Both reportRef and proposalRef are required for mode=regenerate-goals',
    });
  }

  const [reportLoad, proposalLoad] = await Promise.all([loadFile(reportRef), loadFile(proposalRef)]);
  const model = getModelForApp(APP_KEY);
  const fallback = getFallbackModelForApp(APP_KEY);

  const goalsAssessment = await compareProposalToReport({
    proposalText: proposalLoad.text,
    reportText: reportLoad.text,
    headerContext: headerFromDynamics,
    currentNarratives: currentValues?.narratives || null,
    apiKey,
    model,
    fallback,
    userProfileId: access.profileId,
    requestGuid,
    logContext: 'regenerate-goals',
  });

  return res.status(200).json({ goalsAssessment });
}

// ─── Pure helpers (callable headless) ──────────────────────────────────────

/**
 * Run the report extraction Claude call. Returns { header, counts, narratives }.
 *
 * Pure helper — no req/res coupling.
 */
export async function extractReport({
  reportText,
  headerFromDynamics = {},
  apiKey,
  model,
  fallback,
  userProfileId,
  requestGuid = null,
}) {
  const prompt = createGrantReportExtractionPrompt(reportText, headerFromDynamics);
  const start = Date.now();
  let result;
  try {
    result = await callClaudeWithFallback({
      apiKey,
      model,
      fallback,
      prompt,
      temperature: 0.1,
      maxTokens: 4096,
    });
  } catch (err) {
    await tryLogAiRun({
      requestGuid,
      model,
      status: 'failed',
      rawOutput: { error: err.message },
      notes: 'Grant Reporting extraction — Claude call failed',
    });
    throw err;
  }
  const latencyMs = Date.now() - start;

  logUsage({
    userProfileId,
    appName: APP_KEY,
    model: result.modelUsed,
    inputTokens: result.usage?.input_tokens || 0,
    outputTokens: result.usage?.output_tokens || 0,
    latencyMs,
    status: 'success',
  });

  const parsed = parseJsonResponse(result.text);

  await tryLogAiRun({
    requestGuid,
    model: result.modelUsed,
    status: 'completed',
    rawOutput: parsed,
    notes: 'Grant Reporting extraction (full report fields)',
  });

  return parsed;
}

/**
 * Compare an original proposal to a grant report and produce a structured
 * goals assessment. Pure helper — no req/res coupling. This is the seam for
 * the future backend automation pipeline.
 *
 * @returns {Promise<object>} The `goalsAssessment` JSON object (not wrapped).
 */
export async function compareProposalToReport({
  proposalText,
  reportText,
  headerContext = null,
  currentNarratives = null,
  apiKey,
  model,
  fallback,
  userProfileId,
  requestGuid = null,
  logContext = 'goals-assessment',
}) {
  const prompt = createGoalsAssessmentPrompt({
    proposalText,
    reportText,
    headerContext,
    currentNarratives,
  });

  const start = Date.now();
  let result;
  try {
    result = await callClaudeWithFallback({
      apiKey,
      model,
      fallback,
      prompt,
      temperature: 0.2,
      maxTokens: 4096,
    });
  } catch (err) {
    await tryLogAiRun({
      requestGuid,
      model,
      status: 'failed',
      rawOutput: { error: err.message },
      notes: `Grant Reporting ${logContext} — Claude call failed`,
    });
    throw err;
  }
  const latencyMs = Date.now() - start;

  logUsage({
    userProfileId,
    appName: APP_KEY,
    model: result.modelUsed,
    inputTokens: result.usage?.input_tokens || 0,
    outputTokens: result.usage?.output_tokens || 0,
    latencyMs,
    status: 'success',
  });

  const parsed = parseJsonResponse(result.text);
  const goalsAssessment = parsed.goalsAssessment ?? parsed;

  await tryLogAiRun({
    requestGuid,
    model: result.modelUsed,
    status: 'completed',
    rawOutput: { goalsAssessment },
    notes: `Grant Reporting ${logContext} (proposal vs. report)`,
  });

  return goalsAssessment;
}

// ─── File loading ──────────────────────────────────────────────────────────

/**
 * Load a FileRef and return its plain-text contents + filename.
 * Throws an HTTP-tagged error on validation failure.
 */
async function loadFile(ref) {
  if (!ref || typeof ref !== 'object') {
    throw httpError(400, 'Invalid file reference');
  }

  let buffer;
  let filename;
  let mimeType = null;

  if (ref.source === 'upload') {
    if (!ref.fileUrl || !ref.filename) {
      throw httpError(400, 'Upload file reference requires fileUrl and filename');
    }
    const resp = await safeFetch(ref.fileUrl);
    if (!resp.ok) {
      throw httpError(400, `Failed to fetch uploaded file: ${resp.status}`);
    }
    buffer = Buffer.from(await resp.arrayBuffer());
    filename = ref.filename;
  } else if (ref.source === 'sharepoint') {
    if (!ref.library || !ref.folder || !ref.filename) {
      throw httpError(400, 'SharePoint file reference requires library, folder, and filename');
    }
    const downloaded = await GraphService.downloadFileByPath(ref.library, ref.folder, ref.filename);
    buffer = downloaded.buffer;
    filename = downloaded.filename || ref.filename;
    mimeType = downloaded.mimeType;
  } else {
    throw httpError(400, `Unknown file source: ${ref.source}`);
  }

  const text = await extractTextFromBuffer(buffer, filename, mimeType);

  if (!text || text.trim().length < 100) {
    throw httpError(400, `${filename}: file appears to be empty or contains insufficient text`);
  }

  if (text.length > MAX_TEXT_LENGTH) {
    throw httpError(
      413,
      `${filename}: extracted text exceeds maximum size (${text.length} > ${MAX_TEXT_LENGTH} chars)`,
    );
  }

  return { text: text.trim(), filename };
}

async function extractTextFromBuffer(buffer, filename, mimeType) {
  const lower = (filename || '').toLowerCase();
  const isPdf = lower.endsWith('.pdf') || mimeType === 'application/pdf';
  const isDocx =
    lower.endsWith('.docx') ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const isDoc = lower.endsWith('.doc') || mimeType === 'application/msword';

  if (isPdf) {
    const data = await pdf(buffer);
    return data.text || '';
  }
  if (isDocx || isDoc) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }
  throw httpError(400, `Unsupported file type for "${filename}". Use PDF, DOCX, or DOC.`);
}

// ─── Claude calling ────────────────────────────────────────────────────────

async function callClaudeWithFallback({ apiKey, model, fallback, prompt, temperature, maxTokens }) {
  try {
    const r = await callClaude({ apiKey, model, prompt, temperature, maxTokens });
    return { ...r, modelUsed: model };
  } catch (primaryError) {
    if (!fallback || fallback === model) throw primaryError;
    console.warn(
      `[GrantReporting:extract] Primary model (${model}) failed: ${primaryError.message}; trying fallback ${fallback}`,
    );
    const r = await callClaude({ apiKey, model: fallback, prompt, temperature, maxTokens });
    return { ...r, modelUsed: fallback };
  }
}

async function callClaude({ apiKey, model, prompt, temperature, maxTokens }) {
  const resp = await fetch(BASE_CONFIG.CLAUDE.API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey.trim(),
      'anthropic-version': BASE_CONFIG.CLAUDE.ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) {
    const errorBody = await resp.text();
    throw new Error(`Claude API error (${resp.status}): ${errorBody}`);
  }

  const data = await resp.json();
  return {
    text: data.content?.[0]?.text || '',
    usage: data.usage || null,
  };
}

// ─── Utilities ─────────────────────────────────────────────────────────────

function parseJsonResponse(text) {
  if (!text) {
    throw httpError(502, 'Claude returned an empty response');
  }
  // Strip optional ```json ... ``` fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    // Fallback: attempt to repair common LLM JSON mistakes (unescaped quotes,
    // control chars, trailing commas) before giving up.
    try {
      const repaired = jsonrepair(jsonStr);
      const parsed = JSON.parse(repaired);
      console.warn(
        `[GrantReporting:extract] JSON required repair (original error: ${err.message})`,
      );
      return parsed;
    } catch (repairErr) {
      console.error('[GrantReporting:extract] Failed to parse JSON response:', err.message);
      console.error('[GrantReporting:extract] Repair also failed:', repairErr.message);
      console.error('[GrantReporting:extract] Raw text:', text.slice(0, 500));
      throw httpError(502, `Failed to parse JSON response from Claude: ${err.message}`);
    }
  }
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Fire-and-log wrapper around DynamicsService.logAiRun. Writeback is best-effort
// audit logging — a failure here must never break the user's extraction flow.
async function tryLogAiRun({ requestGuid, model, status, rawOutput, notes }) {
  if (!requestGuid) return;
  try {
    await DynamicsService.logAiRun({
      requestGuid,
      taskType: 'report',
      model,
      promptVersion: GRANT_REPORT_PROMPT_VERSION,
      status,
      rawOutput,
      notes,
    });
  } catch (err) {
    console.warn(`[GrantReporting:extract] logAiRun failed (non-fatal): ${err.message}`);
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
  maxDuration: 300,
};
