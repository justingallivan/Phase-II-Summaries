/**
 * Phase 0 Executor — Vercel implementation of docs/EXECUTOR_CONTRACT.md.
 *
 * Single entry point: executePrompt({ promptName, requestId,
 *   overrideVariables, runSource, forceOverwrite }) → { parsed, runId,
 *   cacheHit, blocked, conflicts, writeResults }
 *
 * Phase 0 supported:
 *   source.kind:    dynamics, sharepoint, override
 *   target.kind:    akoya_request (with optional jsonPath $.foo), none
 *   guard:          skip-if-populated (default for akoya_request), always-overwrite
 *   parseMode:      raw, json
 *   preprocess:     pdf_to_text
 *
 * Anything outside this list throws — better to fail loud than drift silently.
 *
 * Out of scope (separate code paths): tool-use loops, streaming, non-Claude
 * models, Batch API, multi-turn. See contract § Scope of generality.
 */

import { DynamicsService } from './dynamics-service.js';
import { GraphService } from './graph-service.js';
import { getRequestSharePointBuckets } from '../utils/sharepoint-buckets.js';
import { extractTextFromBuffer } from '../utils/file-loader.js';
import { BASE_CONFIG } from '../../shared/config/baseConfig.js';

const PROMPTS_ENTITY = 'wmkf_ai_prompts';
const REQUESTS_ENTITY = 'akoya_requests';
const RUNS_ENTITY = 'wmkf_ai_runs';

// Probed via metadata; see scripts/_tmp-probe-picklists.mjs (Session 110).
const RUN_STATUS = Object.freeze({
  completed: 682090000,
  failed: 682090001,
  needs_review: 682090002,
});
const RUN_SOURCE = Object.freeze({
  'PowerAutomate Auto': 682090000,
  'Vercel User': 682090001,
  'Vercel Test': 682090002,
  'Vercel Interactive': 682090003,
  'PowerAutomate Test': 682090004,
  'PowerAutomate Manual': 682090005,
});

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export async function executePrompt({
  promptName,
  requestId = null,
  overrideVariables = {},
  runSource,
  forceOverwrite = false,
}) {
  if (!promptName) throw new Error('executePrompt: promptName required');
  if (!runSource) throw new Error('executePrompt: runSource required');
  if (!(runSource in RUN_SOURCE)) {
    throw new Error(`executePrompt: unknown runSource "${runSource}" (expected one of ${Object.keys(RUN_SOURCE).join(', ')})`);
  }

  DynamicsService.bypassRestrictions('execute-prompt');

  const startedAt = Date.now();
  let promptRow = null;

  try {
    // Step 1: resolve prompt
    promptRow = await fetchCurrentPrompt(promptName);

    // Step 2: parse declarations
    const variableDecls = parseJsonField(promptRow.wmkf_ai_promptvariables, 'wmkf_ai_promptvariables').variables || [];
    const outputSchema = parseJsonField(promptRow.wmkf_ai_promptoutputschema, 'wmkf_ai_promptoutputschema');
    const outputs = outputSchema.outputs || [];
    const parseMode = outputSchema.parseMode || 'json';

    if (!['raw', 'json'].includes(parseMode)) {
      throw new Error(`Phase 0 supports parseMode raw|json (got "${parseMode}")`);
    }
    if (parseMode === 'raw' && outputs.length !== 1) {
      throw new Error(`parseMode=raw requires exactly one output (got ${outputs.length})`);
    }

    // Step 3: resolve variable values
    const requestRow = requestId ? await DynamicsService.getRecord(REQUESTS_ENTITY, requestId) : null;
    const variables = await resolveVariables(variableDecls, { requestId, requestRow, overrideVariables });

    // Step 4: preflight output guards
    const { conflicts, etag } = preflightGuards(outputs, requestRow);
    if (conflicts.length > 0 && !forceOverwrite) {
      const runId = await writeRunRow({
        promptRow, requestId, runSource,
        status: 'needs_review',
        rawOutput: { blocked: true, conflicts },
        notes: `Pre-flight blocked — ${conflicts.length} target(s) populated; caller did not pass forceOverwrite=true`,
        overrideVariables,
        modelUsed: promptRow.wmkf_ai_model,
      });
      return { parsed: null, runId, cacheHit: false, blocked: true, conflicts, writeResults: null };
    }

    // Steps 5+6: compose payload + call Claude
    const composed = composeMessages(promptRow, variables);
    const claudeResp = await callClaude(promptRow, composed);
    const cacheHit = (claudeResp.usage?.cache_read_input_tokens || 0) > 0;

    // Step 7: parse output
    const parsed = parseClaudeOutput(claudeResp, outputSchema);

    // Step 8: persist outputs
    const writeResults = await persistOutputs(outputs, parsed, requestId, etag);

    const meta = {
      promptName: promptRow.wmkf_ai_promptname,
      promptVersion: promptRow.wmkf_promptversion,
      promptId: promptRow.wmkf_ai_promptid,
      modelUsed: claudeResp.model || promptRow.wmkf_ai_model,
      systemChars: composed.system.length,
      bodyChars: composed.body.length,
    };

    // Step 9: log run
    const runId = await writeRunRow({
      promptRow, requestId, runSource,
      status: writeResults.allOk ? 'completed' : 'needs_review',
      rawOutput: claudeResp.content?.[0]?.text || '',
      notes: buildSuccessNotes(claudeResp, writeResults, Date.now() - startedAt, cacheHit),
      overrideVariables,
      modelUsed: claudeResp.model || promptRow.wmkf_ai_model,
    });

    // Step 10: return
    return {
      parsed, runId, cacheHit,
      blocked: false, conflicts: [],
      writeResults,
      usage: claudeResp.usage || null,
      meta,
    };
  } catch (err) {
    // Always log the failure (audit completeness invariant).
    let runId = null;
    try {
      runId = await writeRunRow({
        promptRow, requestId, runSource,
        status: 'failed',
        rawOutput: { error: err.message, stack: (err.stack || '').split('\n').slice(0, 6).join('\n') },
        notes: `Executor error: ${err.message}`,
        overrideVariables,
        modelUsed: promptRow?.wmkf_ai_model,
      });
    } catch (logErr) {
      console.error('[executePrompt] also failed to log failure run row:', logErr.message);
    }
    err.runId = runId;
    throw err;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Step 1: prompt fetch
// ────────────────────────────────────────────────────────────────────────────

async function fetchCurrentPrompt(promptName) {
  const r = await DynamicsService.queryRecords(PROMPTS_ENTITY, {
    select: [
      'wmkf_ai_promptid', 'wmkf_ai_promptname', 'wmkf_ai_systemprompt',
      'wmkf_ai_promptbody', 'wmkf_ai_promptvariables', 'wmkf_ai_promptoutputschema',
      'wmkf_ai_model', 'wmkf_ai_temperature', 'wmkf_ai_maxtokens', 'wmkf_promptversion',
    ].join(','),
    filter: `wmkf_ai_promptname eq '${promptName.replace(/'/g, "''")}' and wmkf_ai_iscurrent eq true`,
    top: 2,
  });
  const rows = r.records || [];
  if (rows.length === 0) throw new Error(`No current prompt found for name "${promptName}"`);
  if (rows.length > 1) throw new Error(`Multiple current prompts for name "${promptName}" — resolve in Dynamics`);
  return rows[0];
}

// ────────────────────────────────────────────────────────────────────────────
// Step 3: variable resolution
// ────────────────────────────────────────────────────────────────────────────

async function resolveVariables(decls, ctx) {
  const out = {};
  for (const decl of decls) {
    out[decl.name] = await resolveOne(decl, ctx);
  }
  return out;
}

async function resolveOne(decl, { requestId, requestRow, overrideVariables }) {
  const { name, source = {} } = decl;
  const kind = source.kind;

  if (kind === 'override') {
    const v = overrideVariables[name] !== undefined ? overrideVariables[name] : source.default;
    if (v === undefined && decl.required) {
      throw new Error(`Required override variable "${name}" not provided and no default`);
    }
    return v ?? '';
  }

  if (kind === 'dynamics') {
    const table = source.table || 'akoya_request';
    if (table !== 'akoya_request') {
      throw new Error(`Phase 0 dynamics source supports table=akoya_request only (got "${table}")`);
    }
    if (!requestRow) {
      throw new Error(`Variable "${name}" needs requestRow but no requestId was supplied`);
    }
    const v = requestRow[source.field];
    if (v == null && decl.required) {
      throw new Error(`Required dynamics variable "${name}" missing on request row (field=${source.field})`);
    }
    return v ?? '';
  }

  if (kind === 'sharepoint') {
    if (!requestId || !requestRow) {
      throw new Error(`Variable "${name}" needs requestId for sharepoint resolution`);
    }
    return resolveSharepointVar(decl, requestId, requestRow);
  }

  throw new Error(`Phase 0 unsupported source.kind "${kind}" for variable "${name}"`);
}

async function resolveSharepointVar(decl, requestId, requestRow) {
  const { source } = decl;
  const { pattern, preprocess, maxChars } = source;
  if (!pattern) throw new Error(`sharepoint variable "${decl.name}" requires source.pattern`);
  if (preprocess && preprocess !== 'pdf_to_text') {
    throw new Error(`Phase 0 supports preprocess=pdf_to_text only (got "${preprocess}")`);
  }

  const requestNumber = requestRow.akoya_requestnum;
  if (!requestNumber) throw new Error(`Cannot resolve sharepoint var: request row missing akoya_requestnum`);

  const buckets = await getRequestSharePointBuckets(requestId, requestNumber);
  const matcher = patternToRegex(pattern);

  let chosen = null;
  for (const b of buckets) {
    let files;
    try {
      files = await GraphService.listFiles(b.library, b.folder, { recursive: true });
    } catch {
      continue; // archive 404s and similar are normal
    }
    const hit = (files || []).find(f => matcher.test(f.name));
    if (hit) {
      // listFiles returns each file with its actual folder path — use that
      // for downloadFileByPath so nested files resolve correctly.
      chosen = { library: b.library, folder: hit.folder || b.folder, name: hit.name };
      break;
    }
  }

  if (!chosen) {
    if (decl.required) {
      throw new Error(`No file matching "${pattern}" in any bucket for request ${requestNumber}`);
    }
    return '';
  }

  const downloaded = await GraphService.downloadFileByPath(chosen.library, chosen.folder, chosen.name);
  const text = await extractTextFromBuffer(downloaded.buffer, chosen.name, downloaded.mimeType);
  if (!text || text.trim().length < 100) {
    throw new Error(`Extracted text from "${chosen.name}" is empty or too short`);
  }
  return maxChars && text.length > maxChars ? text.substring(0, maxChars) : text;
}

function patternToRegex(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${esc}$`, 'i');
}

// ────────────────────────────────────────────────────────────────────────────
// Step 4: preflight guards
// ────────────────────────────────────────────────────────────────────────────

function preflightGuards(outputs, requestRow) {
  const conflicts = [];
  // ETag is a property of the row, shared across all akoya_request output writes.
  const etag = requestRow?._etag || null;

  for (const out of outputs) {
    const guard = out.guard || (out.target?.kind === 'akoya_request' ? 'skip-if-populated' : 'always-overwrite');
    if (guard === 'always-overwrite') continue;
    if (guard !== 'skip-if-populated') {
      throw new Error(`Phase 0 unsupported guard "${guard}" on output "${out.name}"`);
    }
    if (out.target?.kind !== 'akoya_request') continue; // guard only meaningful for writeable targets
    if (!requestRow) throw new Error(`Output "${out.name}" guard requires requestId`);

    const fieldName = out.target.field;
    const jsonPath = out.target.jsonPath || null;
    const raw = requestRow[fieldName];

    let populated;
    let existingPathValue = null;
    if (jsonPath) {
      const obj = parseMemoJson(raw);
      existingPathValue = readJsonPath(obj, jsonPath);
      populated = !isEmpty(existingPathValue);
    } else {
      populated = !isEmpty(raw);
    }

    if (populated) {
      conflicts.push({
        output: out.name,
        table: 'akoya_request',
        field: fieldName,
        jsonPath,
        existingContent: jsonPath ? existingPathValue : raw,
        existingLength: typeof raw === 'string' ? raw.length : (existingPathValue ? String(existingPathValue).length : 0),
        modifiedOn: requestRow.modifiedon || null,
      });
    }
  }
  return { conflicts, etag };
}

function isEmpty(v) {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

function parseMemoJson(s) {
  if (s == null) return {};
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch { return {}; }
}

function readJsonPath(obj, path) {
  // Phase 0: support `$.foo` (single top-level key) only.
  const m = path.match(/^\$\.(\w+)$/);
  if (!m) throw new Error(`Phase 0 jsonPath supports top-level $.foo only (got "${path}")`);
  return obj?.[m[1]];
}

// ────────────────────────────────────────────────────────────────────────────
// Steps 5+6: compose + call Claude
// ────────────────────────────────────────────────────────────────────────────

function composeMessages(promptRow, variables) {
  // Phase 0 compromise: interpolate {{var}} across BOTH system and body.
  // Phase 0 declarations require placement="user" but the existing
  // phase-i.summary text has slots in the system block. See
  // scripts/seed-phase-i-summary-prompt.js header comment for full rationale;
  // Phase 2 placement="system" + context blocks will reconcile.
  return {
    system: interpolate(promptRow.wmkf_ai_systemprompt || '', variables),
    body: interpolate(promptRow.wmkf_ai_promptbody || '', variables),
  };
}

function interpolate(template, vars) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, name) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) return String(vars[name]);
    return m; // leave unresolved slots visible — easier to spot bugs
  });
}

async function callClaude(promptRow, { system, body }) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error('CLAUDE_API_KEY not set');

  const model = promptRow.wmkf_ai_model || BASE_CONFIG.CLAUDE.DEFAULT_MODEL;
  const maxTokens = promptRow.wmkf_ai_maxtokens || BASE_CONFIG.MODEL_PARAMS.DEFAULT_MAX_TOKENS;
  const temperature =
    promptRow.wmkf_ai_temperature != null
      ? Number(promptRow.wmkf_ai_temperature)
      : BASE_CONFIG.MODEL_PARAMS.SUMMARIZATION_TEMPERATURE;

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
      // Single cache_control marker at the boundary between system and user.
      // Cacheable variables placed BEFORE this point (Phase 0: all live in
      // system) produce stable cache-key prefixes across reruns.
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: body }],
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Claude API error (${resp.status}): ${errBody}`);
  }
  return resp.json();
}

// ────────────────────────────────────────────────────────────────────────────
// Step 7: parse output
// ────────────────────────────────────────────────────────────────────────────

function parseClaudeOutput(claudeResp, outputSchema) {
  const text = claudeResp.content?.[0]?.text || '';
  const parseMode = outputSchema.parseMode || 'json';
  const outputs = outputSchema.outputs || [];

  if (parseMode === 'raw') {
    if (outputs.length !== 1) throw new Error(`parseMode=raw requires single output (got ${outputs.length})`);
    if (!text || text.trim().length < 20) {
      throw new Error(`Claude returned empty/short text (${text.length} chars)`);
    }
    return { [outputs[0].name]: text.trim() };
  }

  // json mode
  let jsonText = text.trim();
  const fenced = jsonText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) jsonText = fenced[1];

  let parsed;
  try { parsed = JSON.parse(jsonText); }
  catch (e) { throw new Error(`Claude output not valid JSON: ${e.message}`); }

  if (outputSchema.jsonSchema?.required) {
    for (const k of outputSchema.jsonSchema.required) {
      if (!(k in parsed)) throw new Error(`Claude output missing required field "${k}"`);
    }
  }
  return parsed;
}

// ────────────────────────────────────────────────────────────────────────────
// Step 8: persist
// ────────────────────────────────────────────────────────────────────────────

async function persistOutputs(outputs, parsed, requestId, etag) {
  const results = [];
  let allOk = true;

  // Phase 0 simplification: outputs are processed sequentially. The first
  // PATCH bumps the row's ETag; subsequent PATCHes that pass the original
  // ETag will 412. With one output (current seed) this is moot. When
  // phase-i.compliance lands with multiple outputs, switch to a single
  // composed PATCH or re-fetch the ETag between writes — track in
  // EXECUTOR_CONTRACT.md before then.
  for (const out of outputs) {
    if (out.target?.kind === 'none') continue;
    if (out.target?.kind !== 'akoya_request') {
      throw new Error(`Phase 0 unsupported target.kind "${out.target?.kind}" on output "${out.name}"`);
    }
    if (!requestId) throw new Error(`Output "${out.name}" target requires requestId`);

    const value = parsed?.[out.name];
    if (value === undefined) {
      results.push({ output: out.name, ok: false, reason: 'missing in parsed output' });
      allOk = false;
      continue;
    }

    try {
      let payload;
      if (out.target.jsonPath) {
        const m = out.target.jsonPath.match(/^\$\.(\w+)$/);
        if (!m) throw new Error(`Unsupported jsonPath "${out.target.jsonPath}"`);
        const fresh = await DynamicsService.getRecord(REQUESTS_ENTITY, requestId, { select: out.target.field });
        const current = parseMemoJson(fresh?.[out.target.field]);
        current[m[1]] = value;
        payload = { [out.target.field]: JSON.stringify(current) };
      } else {
        payload = { [out.target.field]: typeof value === 'string' ? value : JSON.stringify(value) };
      }
      await DynamicsService.updateRecord(
        REQUESTS_ENTITY, requestId, payload,
        etag ? { ifMatch: etag } : undefined,
      );
      results.push({ output: out.name, ok: true, field: out.target.field, jsonPath: out.target.jsonPath || null });
    } catch (err) {
      const reason = err.status === 412 ? 'concurrent_edit' : 'writeback_failed';
      results.push({ output: out.name, ok: false, reason, error: err.message });
      allOk = false;
    }
  }
  return { results, allOk };
}

// ────────────────────────────────────────────────────────────────────────────
// Step 9: log run
// ────────────────────────────────────────────────────────────────────────────

async function writeRunRow({ promptRow, requestId, runSource, status, rawOutput, notes, overrideVariables, modelUsed }) {
  const payload = {
    wmkf_ai_status: RUN_STATUS[status],
    wmkf_ai_runsource: RUN_SOURCE[runSource],
  };
  if (modelUsed) payload.wmkf_ai_model = String(modelUsed).slice(0, 64);
  if (promptRow?.wmkf_ai_promptid) {
    payload['wmkf_ai_Prompt@odata.bind'] = `/wmkf_ai_prompts(${promptRow.wmkf_ai_promptid})`;
  }
  if (promptRow?.wmkf_promptversion != null) {
    payload.wmkf_ai_promptversion = Number(promptRow.wmkf_promptversion);
  }
  if (requestId) {
    payload['wmkf_ai_Request@odata.bind'] = `/akoya_requests(${requestId})`;
  }
  const overrideKeys = Object.keys(overrideVariables || {});
  if (overrideKeys.length > 0) {
    payload.wmkf_ai_promptoverridden = true;
    payload.wmkf_ai_promptoverride = truncate(JSON.stringify(overrideVariables), 4000);
  } else {
    payload.wmkf_ai_promptoverridden = false;
  }
  if (rawOutput !== undefined && rawOutput !== null) {
    const s = typeof rawOutput === 'string' ? rawOutput : JSON.stringify(rawOutput);
    payload.wmkf_ai_rawoutput = truncate(s, 1_000_000);
  }
  if (notes) payload.wmkf_ai_notes = truncate(String(notes), 2000);

  const created = await DynamicsService.createRecord(RUNS_ENTITY, payload);
  return created.wmkf_ai_runid;
}

function truncate(s, max) {
  if (!s || s.length <= max) return s;
  const marker = `\n…[truncated ${s.length - max} chars]`;
  return s.slice(0, max - marker.length) + marker;
}

function buildSuccessNotes(claudeResp, writeResults, latencyMs, cacheHit) {
  const u = claudeResp.usage || {};
  const failed = writeResults.results.filter(r => !r.ok).map(r => `${r.output}:${r.reason}`).join(',');
  return [
    `latency=${latencyMs}ms`,
    `tokens in=${u.input_tokens || 0}/out=${u.output_tokens || 0}/cache_create=${u.cache_creation_input_tokens || 0}/cache_read=${u.cache_read_input_tokens || 0}`,
    `cacheHit=${cacheHit}`,
    failed ? `writes_failed=${failed}` : 'writes=ok',
  ].join('; ');
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function parseJsonField(s, label) {
  if (!s || s.trim().length === 0) return {};
  try { return JSON.parse(s); }
  catch (e) { throw new Error(`Failed to parse ${label} as JSON: ${e.message}`); }
}
