/**
 * API Route: /api/dynamics-explorer/chat
 *
 * Agentic chat endpoint for the Dynamics Explorer.
 * Runs a server-side tool-use loop: user question → Claude tool calls
 * → Dynamics API execution → Claude response → SSE stream to client.
 *
 * Architecture: Search-first discovery with server-side relationship traversal.
 * 7 tools: search, get_entity, get_related, describe_table, query_records,
 * count_records, find_reports_due.
 */

import { requireAppAccess } from '../../../lib/utils/auth';
import { nextRateLimiter } from '../../../shared/api/middleware/rateLimiter';
import { sql } from '@vercel/postgres';
import ExcelJS from 'exceljs';
import { DynamicsService } from '../../../lib/services/dynamics-service';
import { buildSystemPrompt, TOOL_DEFINITIONS, TABLE_ANNOTATIONS } from '../../../shared/config/prompts/dynamics-explorer';
import { getModelForApp, getFallbackModelForApp, loadModelOverrides } from '../../../shared/config/baseConfig';
import { BASE_CONFIG } from '../../../shared/config/baseConfig';
import { logUsage, estimateCostCents } from '../../../lib/utils/usage-logger';

export const config = {
  api: {
    bodyParser: { sizeLimit: '1mb' },
  },
  maxDuration: 300,
};

const limiter = nextRateLimiter({ max: 10 });

const MAX_TOOL_ROUNDS = 15;
const MAX_RESULT_CHARS = 16000;

// Per-tool char limits — composite tools return compact text and need more room
const TOOL_CHAR_LIMITS = {
  search: 12000,
  get_related: 12000,
  find_reports_due: 12000,
  describe_table: 12000,
  export_csv: 4000,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const access = await requireAppAccess(req, res, 'dynamics-explorer');
  if (!access) return;

  const allowed = await limiter(req, res);
  if (allowed !== true) return;

  await loadModelOverrides();

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { messages, sessionId } = req.body;
    const claudeApiKey = process.env.CLAUDE_API_KEY;
    const userProfileId = access.profileId;

    if (!claudeApiKey) {
      sendEvent('error', { message: 'Claude API key not configured on server' });
      return res.end();
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      sendEvent('error', { message: 'At least one message is required' });
      res.end();
      return;
    }

    const [userRole, restrictions] = await Promise.all([
      getUserRole(userProfileId),
      getActiveRestrictions(),
    ]);
    DynamicsService.setRestrictions(restrictions);
    const systemPrompt = buildSystemPrompt({ userRole, restrictions });

    // Only send the last few user/assistant exchanges to stay within token limits
    const claudeMessages = trimConversation(messages);

    sendEvent('thinking', { message: 'Analyzing your question...' });

    // ─── Agentic loop ───
    let round = 0;
    let currentMessages = [...claudeMessages];
    const model = getModelForApp('dynamics-explorer');
    const fallbackModel = getFallbackModelForApp('dynamics-explorer');

    while (round < MAX_TOOL_ROUNDS) {
      round++;

      const claudeResponse = await callClaude({
        apiKey: claudeApiKey,
        model,
        fallbackModel,
        systemPrompt,
        messages: currentMessages,
        tools: TOOL_DEFINITIONS,
        userProfileId,
        onTextDelta: (text) => {
          // Stream text chunks to client in real-time
          sendEvent('text_delta', { text });
        },
      });

      const textBlocks = claudeResponse.content.filter(b => b.type === 'text');
      const toolBlocks = claudeResponse.content.filter(b => b.type === 'tool_use');

      if (toolBlocks.length === 0) {
        if (!claudeResponse._textStreamed) {
          // Text wasn't streamed (shouldn't happen, but fallback)
          const finalText = textBlocks.map(b => b.text).join('\n');
          sendEvent('response', { content: finalText });
        }
        sendEvent('complete', { rounds: round });
        res.end();
        return;
      }

      // Execute tool calls — parallel when multiple tools in one round
      const toolResults = [];

      // Send all thinking messages upfront
      for (const toolBlock of toolBlocks) {
        const restricted = checkRestriction(toolBlock.name, toolBlock.input, restrictions);
        if (!restricted) {
          sendEvent('thinking', { message: getThinkingMessage(toolBlock.name, toolBlock.input) });
        }
      }

      const executeOne = async (toolBlock) => {
        const { id, name, input } = toolBlock;
        if (process.env.NODE_ENV === 'development') {
          console.log(`[DynExp] Round ${round} tool: ${name}`, JSON.stringify(input).substring(0, 200));
        }

        const restricted = checkRestriction(name, input, restrictions);
        if (restricted) {
          sendEvent('thinking', { message: `Blocked: ${restricted}` });
          return { type: 'tool_result', tool_use_id: id, content: `DENIED: ${restricted}` };
        }

        const startTime = Date.now();
        let result;
        try {
          result = await executeTool(name, input, sendEvent, userProfileId);
        } catch (err) {
          console.log(`[DynExp] Round ${round} ${name} ERROR:`, err.message.substring(0, 200));
          result = { error: 'Tool execution failed' };
        }
        const executionTime = Date.now() - startTime;

        const recordCount = result?.records?.length || result?.count || (result?.error ? -1 : 0);
        console.log(`[DynExp] Round ${round} ${name} → ${recordCount} records, ${executionTime}ms`);

        logQuery({ userProfileId, sessionId, queryType: name, tableName: input.table_name || null, queryParams: input, recordCount, executionTime });

        const charLimit = TOOL_CHAR_LIMITS[name] || MAX_RESULT_CHARS;
        const resultStr = truncateResult(result, charLimit);

        return { type: 'tool_result', tool_use_id: id, content: resultStr };
      };

      const settled = await Promise.allSettled(toolBlocks.map(executeOne));
      for (const s of settled) {
        toolResults.push(s.status === 'fulfilled' ? s.value : {
          type: 'tool_result',
          tool_use_id: 'unknown',
          content: JSON.stringify({ error: s.reason?.message || 'Tool execution failed' }),
        });
      }

      // Append assistant + tool results, then compact old rounds
      currentMessages.push({
        role: 'assistant',
        content: claudeResponse.content,
      });
      currentMessages.push({
        role: 'user',
        content: toolResults,
      });

      // Compact earlier tool rounds to save tokens for the next call
      currentMessages = compactMessages(currentMessages);
    }

    console.log(`[DynExp] Hit max rounds (${MAX_TOOL_ROUNDS}) without final answer`);
    sendEvent('response', { content: 'Reached maximum query steps. Please refine your question.' });
    sendEvent('complete', { rounds: round, maxRoundsReached: true });
  } catch (error) {
    console.error('Dynamics Explorer chat error:', error);
    sendEvent('error', {
      message: BASE_CONFIG.ERROR_MESSAGES.QUERY_FAILED,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  } finally {
    res.end();
  }
}

// ─── Conversation management ───

/**
 * Trim conversation history to last 3 exchanges (6 messages) to control tokens.
 * The most recent user message is always kept.
 */
function trimConversation(messages) {
  const cleaned = messages.map(m => ({ role: m.role, content: m.content }));
  if (cleaned.length <= 6) return cleaned;
  // Keep a summary hint + last 6 messages
  return [
    { role: 'user', content: '[Earlier conversation context was trimmed to save tokens]' },
    { role: 'assistant', content: 'Understood, I\'ll work with the recent context.' },
    ...cleaned.slice(-4),
  ];
}

/**
 * Compact old tool-use rounds: replace all but the most recent tool results
 * with brief summaries to dramatically reduce token count.
 */
function compactMessages(messages) {
  // Find all tool_result message indices (role=user, content is array of tool_results)
  const toolResultIndices = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === 'user' && Array.isArray(m.content) && m.content[0]?.type === 'tool_result') {
      toolResultIndices.push(i);
    }
  }

  // Only compact if there are 2+ tool rounds — keep the latest intact
  if (toolResultIndices.length < 2) return messages;

  const result = [...messages];
  // Compact all but the last tool round
  for (let idx = 0; idx < toolResultIndices.length - 1; idx++) {
    const msgIdx = toolResultIndices[idx];
    const oldResults = result[msgIdx].content;

    // Replace verbose tool results with one-line summaries
    const compacted = oldResults.map(tr => ({
      type: 'tool_result',
      tool_use_id: tr.tool_use_id,
      content: summarizeToolResult(tr.content),
    }));

    result[msgIdx] = { ...result[msgIdx], content: compacted };

    // Also compact the preceding assistant message's tool_use input fields
    const assistantIdx = msgIdx - 1;
    if (assistantIdx >= 0 && result[assistantIdx].role === 'assistant' && Array.isArray(result[assistantIdx].content)) {
      result[assistantIdx] = {
        ...result[assistantIdx],
        content: result[assistantIdx].content.map(block => {
          if (block.type === 'tool_use') {
            return { ...block, input: {} }; // Clear verbose input since result is summarized
          }
          return block;
        }),
      };
    }
  }

  return result;
}

/**
 * Summarize a tool result string to a brief one-liner.
 */
function summarizeToolResult(content) {
  if (!content || content.length < 100) return content;
  try {
    const data = JSON.parse(content);
    if (data.error) return `Error: ${data.error.substring(0, 80)}`;
    if (data.totalCount !== undefined && data.results) return `Search: ${data.totalCount} results`;
    if (data.count !== undefined && data.tables) return `Found ${data.count} tables`;
    if (data.count !== undefined && !data.records) return `Count: ${data.count}`;
    if (data.records) return `Returned ${data.records.length} records`;
    if (data.emailCount !== undefined) return `Found ${data.emailCount} emails`;
    if (data.reportCount !== undefined) return `Found ${data.reportCount} reports`;
    if (data.fields) return `Table schema returned`;
    if (data.exportedCount !== undefined) return `Exported ${data.exportedCount} records`;
    if (data.estimatedCount !== undefined) return `Estimate: ${data.estimatedCount} records, ~$${(data.estimatedCostCents / 100).toFixed(2)}`;
    return content.substring(0, 100) + '...';
  } catch {
    return content.substring(0, 100) + '...';
  }
}

// ─── Claude API call ───

/**
 * Call Claude API with streaming. Returns a parsed response object.
 * When onTextDelta is provided AND the response is text-only (no tool use),
 * text chunks are forwarded in real-time via the callback.
 *
 * @param {Object} opts
 * @param {Function} [opts.onTextDelta] - callback(text) for streaming text chunks
 * @returns {Promise<{content, model, usage}>}
 */
async function callClaude({ apiKey, model, fallbackModel, systemPrompt, messages, tools, userProfileId, onTextDelta }) {
  const startTime = Date.now();

  const body = {
    model,
    max_tokens: 2048,
    system: systemPrompt,
    messages,
    tools,
    stream: true,
  };

  const callHeaders = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': BASE_CONFIG.CLAUDE.ANTHROPIC_VERSION,
  };

  let resp = await fetch(BASE_CONFIG.CLAUDE.API_URL, {
    method: 'POST',
    headers: callHeaders,
    body: JSON.stringify(body),
  });

  // Rate limit: wait and retry once
  if (resp.status === 429) {
    const retryAfter = parseInt(resp.headers.get('retry-after') || '30', 10);
    const waitMs = Math.min(retryAfter, 60) * 1000;
    console.log(`[DynExp] Rate limited, waiting ${waitMs / 1000}s before retry...`);
    await new Promise(resolve => setTimeout(resolve, waitMs));
    resp = await fetch(BASE_CONFIG.CLAUDE.API_URL, {
      method: 'POST',
      headers: callHeaders,
      body: JSON.stringify(body),
    });
  }

  // Overloaded: try fallback model
  if (resp.status === 529 && fallbackModel && fallbackModel !== model) {
    body.model = fallbackModel;
    resp = await fetch(BASE_CONFIG.CLAUDE.API_URL, {
      method: 'POST',
      headers: callHeaders,
      body: JSON.stringify(body),
    });
  }

  if (!resp.ok) {
    const errorBody = await resp.text();
    throw new Error(`Claude API error (${resp.status}): ${errorBody}`);
  }

  // Parse the SSE stream from Claude
  return await parseClaudeStream(resp, { startTime, userProfileId, onTextDelta });
}

/**
 * Parse Claude's SSE stream into a response object identical to the non-streaming format.
 * Streams text_delta to onTextDelta callback when no tool_use blocks are detected.
 */
async function parseClaudeStream(resp, { startTime, userProfileId, onTextDelta }) {
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // Accumulate content blocks as they stream in
  const contentBlocks = []; // [{type, text/id/name/input}]
  let currentBlockIndex = -1;
  let hasToolUse = false;
  let bufferedTextDeltas = []; // text deltas buffered before we know if tools follow
  let responseModel = '';
  let usage = {};
  let textStreamingStarted = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;

      let event;
      try { event = JSON.parse(data); } catch { continue; }

      switch (event.type) {
        case 'message_start':
          responseModel = event.message?.model || '';
          if (event.message?.usage) {
            usage.input_tokens = event.message.usage.input_tokens;
          }
          break;

        case 'content_block_start':
          currentBlockIndex = event.index;
          if (event.content_block.type === 'text') {
            contentBlocks[currentBlockIndex] = { type: 'text', text: '' };
          } else if (event.content_block.type === 'tool_use') {
            hasToolUse = true;
            contentBlocks[currentBlockIndex] = {
              type: 'tool_use',
              id: event.content_block.id,
              name: event.content_block.name,
              input: '',
            };
            // If we had been buffering text deltas, discard streaming —
            // the full text will be in the response content blocks
            bufferedTextDeltas = [];
          }
          break;

        case 'content_block_delta':
          if (event.delta?.type === 'text_delta' && contentBlocks[event.index]) {
            const text = event.delta.text;
            contentBlocks[event.index].text += text;
            if (!hasToolUse && onTextDelta) {
              // Stream text to client in real-time
              onTextDelta(text);
              textStreamingStarted = true;
            }
          } else if (event.delta?.type === 'input_json_delta' && contentBlocks[event.index]) {
            contentBlocks[event.index].input += event.delta.partial_json;
          }
          break;

        case 'content_block_stop':
          // Parse tool input JSON when block ends
          if (contentBlocks[event.index]?.type === 'tool_use') {
            try {
              contentBlocks[event.index].input = JSON.parse(contentBlocks[event.index].input || '{}');
            } catch {
              contentBlocks[event.index].input = {};
            }
          }
          break;

        case 'message_delta':
          if (event.usage) {
            usage.output_tokens = event.usage.output_tokens;
          }
          break;
      }
    }
  }

  logUsage({
    userProfileId,
    appName: 'dynamics-explorer',
    model: responseModel,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    latencyMs: Date.now() - startTime,
  });

  return {
    content: contentBlocks.filter(Boolean),
    model: responseModel,
    usage,
    _textStreamed: textStreamingStarted, // flag so the caller knows text was already sent
  };
}

// ─── Tool execution ───

/**
 * Strip _formatted fields from $select — they are auto-returned via the
 * Prefer: odata.include-annotations="*" header and cannot be $selected.
 * The model sometimes includes them despite the system prompt rule.
 */
function sanitizeSelect(select) {
  if (!select) return select;
  const fields = select.split(',').map(f => f.trim()).filter(f => !f.endsWith('_formatted'));
  return fields.length > 0 ? fields.join(',') : undefined;
}

async function executeTool(name, input, sendEvent, userProfileId) {
  switch (name) {
    case 'search':
      return await searchRecords(input);

    case 'get_entity':
      return await getEntity(input);

    case 'get_related':
      return await getRelated(input);

    case 'describe_table':
      return describeTable(input);

    case 'query_records': {
      const entitySet = await DynamicsService.resolveEntitySetName(input.table_name);
      const result = await DynamicsService.queryRecords(entitySet, {
        select: sanitizeSelect(input.select),
        filter: input.filter,
        orderby: input.orderby,
        top: input.top || 50,
        expand: input.expand,
      });
      result.records = result.records.map(stripEmpty);
      return result;
    }

    case 'count_records': {
      const entitySet = await DynamicsService.resolveEntitySetName(input.table_name);
      const count = await DynamicsService.countRecords(entitySet, input.filter);
      return { count };
    }

    case 'find_reports_due':
      return await findReportsDue(input);

    case 'export_csv':
      return await exportCsv(input, sendEvent, userProfileId);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * Strip null, empty string, false, and 0 values from a record.
 * Also remove internal fields (starting with @ or containing "odata").
 * This dramatically reduces payload for sparse Dynamics records.
 */
function stripEmpty(record) {
  if (!record || typeof record !== 'object') return record;
  const cleaned = {};
  for (const [key, value] of Object.entries(record)) {
    // Skip OData metadata
    if (key.startsWith('@') || key.includes('odata')) continue;
    // Skip null/empty/zero/false
    if (value === null || value === undefined || value === '' || value === false || value === 0) continue;
    // Skip GUID-like null values (all zeros)
    if (typeof value === 'string' && /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value)) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

/**
 * Truncate a tool result to fit within charLimit while preserving valid JSON.
 * For results with records arrays, trims records and reports how many were cut
 * so Claude knows to paginate if needed.
 */
function truncateResult(result, charLimit) {
  let str = JSON.stringify(result);
  if (str.length <= charLimit) return str;

  // Record-aware truncation: trim records array rather than cutting JSON mid-string
  if (result?.records && Array.isArray(result.records) && result.records.length > 0) {
    const totalReturned = result.records.length;
    const totalCount = result.totalCount || totalReturned;
    const avgCharsPerRecord = str.length / totalReturned;
    // Leave room for metadata fields (count, totalCount, hasMore, note)
    const maxRecords = Math.max(1, Math.floor((charLimit - 300) / avgCharsPerRecord));

    if (maxRecords < totalReturned) {
      const trimmed = {
        records: result.records.slice(0, maxRecords),
        count: maxRecords,
        totalCount,
        note: `Showing ${maxRecords} of ${totalCount} total. Present the totalCount to the user. To see more, use a tighter $select (fewer fields) or narrower $filter, or present what you have and offer to query with different criteria.`,
      };
      return JSON.stringify(trimmed);
    }
  }

  // Fallback: string truncation for non-record results
  return str.substring(0, charLimit) + '... [truncated]';
}

// ─── describe_table ───

/**
 * Return annotated field metadata for a table, or list all tables if unknown.
 */
function describeTable({ table_name }) {
  if (!table_name || !TABLE_ANNOTATIONS[table_name]) {
    // Return table listing
    const tables = Object.entries(TABLE_ANNOTATIONS).map(([name, info]) =>
      `${name} (${info.entitySet}) — ${info.description}`
    );
    return {
      tables: tables.join('\n'),
      count: tables.length,
      note: table_name ? `Unknown table "${table_name}". Available tables listed above.` : 'All available tables listed above. Call with a specific table_name for field details.',
    };
  }

  const table = TABLE_ANNOTATIONS[table_name];
  const fieldLines = Object.entries(table.fields).map(([field, desc]) =>
    `  ${field}: ${desc}`
  );
  const rulesBlock = table.rules.length > 0
    ? `\nRULES:\n${table.rules.map(r => `  - ${r}`).join('\n')}`
    : '';

  return {
    table: table_name,
    entitySet: table.entitySet,
    description: table.description,
    fields: fieldLines.join('\n'),
    rules: rulesBlock,
  };
}

// ─── get_entity ───

/**
 * Entity type configurations for get_entity lookups.
 * Each type defines its entity set, primary key, curated $select, and
 * the field + strategy used for name/number lookups.
 */
const ENTITY_TYPE_CONFIGS = {
  request: {
    entitySet: 'akoya_requests',
    idField: 'akoya_requestid',
    select: 'akoya_requestnum,akoya_requeststatus,akoya_submitdate,akoya_fiscalyear,akoya_paid,wmkf_request_type,wmkf_meetingdate,wmkf_numberofyearsoffunding,wmkf_abstract,wmkf_researchconceptstatus,wmkf_mrconcept1title,wmkf_mrconcept2title,wmkf_mrconcept3title,wmkf_mrconcept4title,wmkf_seconcept1title,wmkf_seconcept2title,wmkf_seconcept3title,wmkf_seconcept4title,wmkf_numberofconcepts,wmkf_numberofpayments,wmkf_excludedreviewers,_akoya_applicantid_value,_akoya_primarycontactid_value,_wmkf_programdirector_value,_wmkf_programcoordinator_value,_wmkf_grantprogram_value,_akoya_programid_value,_wmkf_type_value,_wmkf_projectleader_value,_wmkf_researchleader_value,_wmkf_ceo_value,akoya_request,akoya_expenses,akoya_grant,akoya_balance,akoya_originalgrantamount,akoya_loireceived,akoya_decisiondate,akoya_begindate,akoya_enddate,wmkf_phaseistatus,wmkf_phaseiistatus,_wmkf_potentialreviewer1_value,_wmkf_potentialreviewer2_value,_wmkf_potentialreviewer3_value,_wmkf_potentialreviewer4_value,_wmkf_potentialreviewer5_value,statecode,createdon',
    filterField: 'akoya_requestnum',
    filterExact: true, // eq instead of contains
    nameField: 'akoya_requestnum',
  },
  account: {
    entitySet: 'accounts',
    idField: 'accountid',
    select: 'name,akoya_aka,wmkf_legalname,wmkf_dc_aka,akoya_constituentnum,akoya_totalgrants,akoya_countofawards,akoya_countofrequests,wmkf_countofprogramgrants,wmkf_countofconcepts,wmkf_countofdiscretionarygrant,wmkf_sumofprogramgrants,wmkf_sumofdiscretionarygrants,wmkf_eastwest,address1_city,address1_stateorprovince,websiteurl,telephone1,akoya_institutiontype,accountid,createdon',
    filterField: 'name',
    altFilterFields: ['akoya_aka', 'wmkf_dc_aka'], // common name + abbreviation — searched alongside primary name
    filterExact: false, // contains
    nameField: 'name',
    altNameFields: ['akoya_aka', 'wmkf_dc_aka'],
  },
  contact: {
    entitySet: 'contacts',
    idField: 'contactid',
    select: 'fullname,firstname,lastname,emailaddress1,jobtitle,telephone1,akoya_contactnum,statecode,contactid,createdon',
    filterField: 'fullname',
    filterExact: false,
    nameField: 'fullname',
  },
  reviewer: {
    entitySet: 'wmkf_potentialreviewerses',
    idField: 'wmkf_potentialreviewersid',
    select: 'wmkf_name,wmkf_firstname,wmkf_lastname,wmkf_title,wmkf_emailaddress,wmkf_organizationname,wmkf_areaofexpertise,wmkf_potentialreviewersid',
    filterField: 'wmkf_name',
    filterExact: false,
    nameField: 'wmkf_name',
  },
  email: {
    entitySet: 'emails',
    idField: 'activityid',
    select: 'subject,description,sender,torecipients,createdon,directioncode,activityid,_regardingobjectid_value,statecode',
    filterField: null, // GUID-only
    nameField: 'subject',
  },
  payment: {
    entitySet: 'akoya_requestpayments',
    idField: 'akoya_requestpaymentid',
    select: 'akoya_paymentnum,akoya_type,akoya_amount,akoya_netamount,akoya_paymentdate,akoya_postingdate,akoya_requirementdue,akoya_requirementtype,akoya_folio,wmkf_reporttype,_akoya_requestlookup_value,_akoya_requestapplicant_value,statecode,createdon',
    filterField: 'akoya_paymentnum',
    filterExact: true,
    nameField: 'akoya_paymentnum',
  },
  staff: {
    entitySet: 'systemusers',
    idField: 'systemuserid',
    select: 'fullname,firstname,lastname,internalemailaddress,systemuserid,isdisabled',
    filterField: 'fullname',
    filterExact: false,
    nameField: 'fullname',
  },
};

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Find a specific entity by human-readable identifier or GUID.
 * Returns full details with resolved lookup display names.
 */
async function getEntity({ type, identifier }) {
  const cfg = ENTITY_TYPE_CONFIGS[type];
  if (!cfg) {
    return { error: `Unknown entity type: "${type}". Valid types: ${Object.keys(ENTITY_TYPE_CONFIGS).join(', ')}` };
  }

  const isGuid = GUID_PATTERN.test(identifier);

  // GUID lookup — direct fetch
  if (isGuid) {
    const record = await DynamicsService.getRecord(cfg.entitySet, identifier, {
      select: cfg.select,
    });
    return stripEmpty(record);
  }

  // Name/number lookup
  if (!cfg.filterField) {
    return { error: `${type} requires a GUID identifier. Use search to find ${type} records first.` };
  }

  const escaped = identifier.replace(/'/g, "''");
  let filter;
  if (cfg.filterExact) {
    filter = `${cfg.filterField} eq '${escaped}'`;
  } else if (cfg.altFilterFields) {
    // Search primary name + all alternate name fields (common name, abbreviation, etc.)
    const clauses = [cfg.filterField, ...cfg.altFilterFields].map(f => `contains(${f},'${escaped}')`);
    filter = `(${clauses.join(' or ')})`;
  } else {
    filter = `contains(${cfg.filterField},'${escaped}')`;
  }

  // For accounts, run Dataverse Search in parallel with OData to catch
  // abbreviation/synonym matches that contains() can't find (e.g. "USC" → "University of Southern California")
  const odataPromise = DynamicsService.queryRecords(cfg.entitySet, {
    select: cfg.select,
    filter,
    top: 10,
  });
  const searchPromise = type === 'account'
    ? DynamicsService.searchRecords(identifier, { entities: ['account'], top: 3 }).catch(() => null)
    : Promise.resolve(null);

  const [result, searchResult] = await Promise.all([odataPromise, searchPromise]);

  // Enrich OData results with high-scoring search results not already found
  if (searchResult?.results?.length) {
    const existingIds = new Set(result.records.map(r => r[cfg.idField]));
    for (const sr of searchResult.results) {
      if (!existingIds.has(sr.objectId) && sr.score > 5) {
        try {
          const fullRecord = await DynamicsService.getRecord(cfg.entitySet, sr.objectId, { select: cfg.select });
          result.records.push(fullRecord);
        } catch (e) { /* search enrichment is best-effort */ }
      }
    }
  }

  if (!result.records.length) {
    return { error: `No ${type} found matching "${identifier}"` };
  }

  // Prefer exact match — check both primary and alternate name fields
  let match;
  if (!cfg.filterExact && result.records.length > 1) {
    const lowerIdent = identifier.toLowerCase();
    const exactMatches = result.records.filter(r => {
      const primary = r[cfg.nameField];
      if (primary && primary.toLowerCase() === lowerIdent) return true;
      if (cfg.altNameFields) {
        for (const altField of cfg.altNameFields) {
          const alt = r[altField];
          if (alt && alt.toLowerCase() === lowerIdent) return true;
        }
      }
      return false;
    });
    // If multiple exact matches, prefer the one with the most requests (most active)
    let exact;
    if (exactMatches.length > 1) {
      exact = exactMatches.sort((a, b) =>
        (b.akoya_countofrequests || b.akoya_countofawards || 0) - (a.akoya_countofrequests || a.akoya_countofawards || 0)
      )[0];
    } else {
      exact = exactMatches[0];
    }

    // If exact match exists but a more-active account also matched (e.g. "USC" matches
    // South Carolina via dc_aka but Southern California has 6x more requests), present
    // all candidates so the model can disambiguate based on conversation context.
    if (exact) {
      const mostActive = [...result.records].sort((a, b) =>
        (b.akoya_countofrequests || 0) - (a.akoya_countofrequests || 0)
      )[0];
      if (mostActive[cfg.idField] !== exact[cfg.idField]) {
        match = mostActive;
        const names = result.records.map(r => {
          const n = r[cfg.nameField] || '';
          const akas = (cfg.altNameFields || []).map(f => r[f]).filter(Boolean);
          const akaStr = akas.length ? ` (aka ${akas.join(', ')})` : '';
          const count = r.akoya_countofrequests || 0;
          return `${n}${akaStr} [${count} requests]`;
        }).filter(Boolean);
        const cleaned = stripEmpty(match);
        cleaned._note = `Ambiguous: "${identifier}" matched multiple accounts. Returning most active. All candidates: ${names.join('; ')}. If the user meant a different one, ask them to clarify.`;
        return cleaned;
      }
    }

    match = exact || result.records[0];

    if (!exact) {
      const names = result.records.map(r => {
        const n = r[cfg.nameField] || '';
        const akas = (cfg.altNameFields || [])
          .map(f => r[f]).filter(Boolean);
        const akaStr = akas.length ? ` (aka ${akas.join(', ')})` : '';
        return n + akaStr;
      }).filter(Boolean);
      const cleaned = stripEmpty(match);
      cleaned._note = `Multiple matches (${result.records.length}). Showing first. All matches: ${names.join('; ')}`;
      return cleaned;
    }
  } else {
    match = result.records[0];
  }

  return stripEmpty(match);
}

// ─── get_related ───

/**
 * Resolve a source entity by name/number to get its GUID.
 * Used by get_related when source_name is provided instead of source_id.
 */
async function resolveEntity(sourceType, sourceName) {
  const result = await getEntity({ type: sourceType, identifier: sourceName });
  if (result.error) return { error: result.error };

  // Extract the GUID from the result
  const cfg = ENTITY_TYPE_CONFIGS[sourceType];
  const id = result[cfg.idField];
  if (!id) {
    return { error: `Could not resolve ${sourceType} "${sourceName}" to a GUID` };
  }

  return { id, record: result };
}

/**
 * Get request IDs for an account. Shared helper for account→emails/payments/reports.
 * Returns { requestIds, requestLookup, account } or { error }.
 */
async function getAccountRequestIds(accountId) {
  const requestResult = await DynamicsService.queryRecords('akoya_requests', {
    select: 'akoya_requestnum,akoya_requestid,akoya_requeststatus',
    filter: `_akoya_applicantid_value eq ${accountId}`,
    orderby: 'createdon desc',
    top: 100,
  });

  if (!requestResult.records.length) {
    return { requestIds: [], requestLookup: {} };
  }

  const requestIds = requestResult.records.map(r => r.akoya_requestid);
  const requestLookup = {};
  for (const r of requestResult.records) {
    requestLookup[r.akoya_requestid] = r.akoya_requestnum;
  }

  return { requestIds, requestLookup, totalRequests: requestResult.totalCount };
}

/**
 * Valid relationship paths and their target types.
 */
const VALID_RELATIONSHIPS = {
  account: ['requests', 'emails', 'payments', 'reports'],
  request: ['payments', 'reports', 'emails', 'annotations', 'reviewers'],
  contact: ['requests'],
  reviewer: ['requests'],
};

/**
 * Follow relationships from a source entity. Handles multi-step lookups server-side.
 */
async function getRelated({ source_type, source_id, source_name, target_type, date_from, date_to }) {
  // Validate relationship
  const validTargets = VALID_RELATIONSHIPS[source_type];
  if (!validTargets) {
    return { error: `Unknown source type: "${source_type}". Valid: ${Object.keys(VALID_RELATIONSHIPS).join(', ')}` };
  }
  if (!validTargets.includes(target_type)) {
    return { error: `Unknown relationship: ${source_type}→${target_type}. Valid targets for ${source_type}: ${validTargets.join(', ')}` };
  }

  // Must have source_id or source_name
  if (!source_id && !source_name) {
    return { error: 'Either source_id (GUID) or source_name (name/number) is required.' };
  }

  // Resolve source_name to GUID if needed
  let resolvedId = source_id;
  let sourceRecord = null;
  if (!resolvedId) {
    const resolved = await resolveEntity(source_type, source_name);
    if (resolved.error) return { error: resolved.error };
    resolvedId = resolved.id;
    sourceRecord = resolved.record;
  }

  // Build date filter fragment
  const buildDateFilter = (field) => {
    let df = '';
    if (date_from) df += ` and ${field} ge ${date_from}`;
    if (date_to) df += ` and ${field} lt ${date_to}`;
    return df;
  };

  // Dispatch to relationship handler
  const key = `${source_type}→${target_type}`;
  switch (key) {
    // ─── account relationships ───

    case 'account→requests':
      return await handleAccountRequests(resolvedId, sourceRecord, buildDateFilter);

    case 'account→emails':
      return await handleAccountEmails(resolvedId, sourceRecord, buildDateFilter);

    case 'account→payments':
      return await handleAccountPayments(resolvedId, sourceRecord, buildDateFilter);

    case 'account→reports':
      return await handleAccountReports(resolvedId, sourceRecord, buildDateFilter);

    // ─── request relationships ───

    case 'request→payments':
      return await handleRequestPayments(resolvedId, buildDateFilter);

    case 'request→reports':
      return await handleRequestReports(resolvedId, buildDateFilter);

    case 'request→emails':
      return await handleRequestEmails(resolvedId);

    case 'request→annotations':
      return await handleRequestAnnotations(resolvedId, buildDateFilter);

    case 'request→reviewers':
      return await handleRequestReviewers(resolvedId);

    // ─── contact relationships ───

    case 'contact→requests':
      return await handleContactRequests(resolvedId, buildDateFilter);

    // ─── reviewer relationships ───

    case 'reviewer→requests':
      return await handleReviewerRequests(resolvedId, buildDateFilter);

    default:
      return { error: `Unimplemented relationship: ${key}` };
  }
}

// ─── Relationship handlers ───

async function handleAccountRequests(accountId, sourceRecord, buildDateFilter) {
  const dateFilter = buildDateFilter('akoya_submitdate');
  const result = await DynamicsService.queryRecords('akoya_requests', {
    select: 'akoya_requestnum,akoya_requeststatus,akoya_submitdate,akoya_fiscalyear,akoya_paid,wmkf_request_type,_akoya_primarycontactid_value,_wmkf_grantprogram_value',
    filter: `_akoya_applicantid_value eq ${accountId}${dateFilter}`,
    orderby: 'akoya_submitdate desc',
    top: 100,
  });

  const lines = result.records.map(r => {
    const num = r.akoya_requestnum || '?';
    const status = r.akoya_requeststatus_formatted || r.akoya_requeststatus || '';
    const date = r.akoya_submitdate_formatted || r.akoya_submitdate || '';
    const fy = r.akoya_fiscalyear || '';
    const paid = r.akoya_paid_formatted || r.akoya_paid || '';
    const type = r.wmkf_request_type || '';
    const program = r._wmkf_grantprogram_value_formatted || '';
    return `Req ${num} | ${status} | ${date} | FY: ${fy} | ${type} | ${program} | Paid: ${paid}`;
  });

  return {
    account: sourceRecord?.name || accountId,
    requestCount: result.records.length,
    totalCount: result.totalCount,
    hasMore: result.totalCount > result.records.length,
    header: 'Request# | Status | Submitted | FY | Type | Program | Paid',
    requests: lines.join('\n') || 'No requests found.',
  };
}

async function handleAccountEmails(accountId, sourceRecord, buildDateFilter) {
  const { requestIds, requestLookup, totalRequests } = await getAccountRequestIds(accountId);

  if (!requestIds.length) {
    return {
      account: sourceRecord?.name || accountId,
      requestCount: 0,
      emailCount: 0,
      emails: 'No requests found for this account, so no linked emails.',
    };
  }

  const orClauses = requestIds.map(id => `_regardingobjectid_value eq ${id}`).join(' or ');
  const dateFilter = buildDateFilter('createdon');

  const emailResult = await DynamicsService.queryRecords('emails', {
    select: 'subject,sender,torecipients,createdon,directioncode,_regardingobjectid_value',
    filter: `(${orClauses})${dateFilter}`,
    orderby: 'createdon desc',
    top: 100,
  });

  const lines = emailResult.records.map(e => {
    const dir = e.directioncode ? 'Out' : 'In';
    const date = e.createdon_formatted || e.createdon || '';
    const reqNum = requestLookup[e._regardingobjectid_value] || '?';
    const subj = (e.subject || '').substring(0, 80);
    const sender = (e.sender || '').substring(0, 30);
    const to = (e.torecipients || '').substring(0, 40);
    return `[${dir}] ${date} | Req ${reqNum} | ${sender} → ${to} | ${subj}`;
  });

  return {
    account: sourceRecord?.name || accountId,
    requestCount: totalRequests,
    emailCount: emailResult.records.length,
    totalEmailCount: emailResult.totalCount,
    hasMore: emailResult.hasMore,
    emails: lines.join('\n') || 'No emails found.',
  };
}

async function handleAccountPayments(accountId, sourceRecord, buildDateFilter) {
  const { requestIds, requestLookup } = await getAccountRequestIds(accountId);

  if (!requestIds.length) {
    return {
      account: sourceRecord?.name || accountId,
      paymentCount: 0,
      payments: 'No requests found for this account.',
    };
  }

  const orClauses = requestIds.map(id => `_akoya_requestlookup_value eq ${id}`).join(' or ');
  const dateFilter = buildDateFilter('akoya_paymentdate');

  const result = await DynamicsService.queryRecords('akoya_requestpayments', {
    select: 'akoya_paymentnum,akoya_amount,akoya_netamount,akoya_paymentdate,akoya_folio,_akoya_requestlookup_value',
    filter: `akoya_type eq false and (${orClauses})${dateFilter}`,
    orderby: 'akoya_paymentdate desc',
    top: 100,
  });

  const lines = result.records.map(r => {
    const num = r.akoya_paymentnum || '?';
    const amt = r.akoya_amount_formatted || r.akoya_amount || '';
    const net = r.akoya_netamount_formatted || r.akoya_netamount || '';
    const date = r.akoya_paymentdate_formatted || r.akoya_paymentdate || '';
    const status = r.akoya_folio || '';
    const reqNum = requestLookup[r._akoya_requestlookup_value] || '?';
    return `${num} | ${date} | ${amt} | Net: ${net} | ${status} | Req ${reqNum}`;
  });

  return {
    account: sourceRecord?.name || accountId,
    paymentCount: result.records.length,
    totalCount: result.totalCount,
    hasMore: result.totalCount > result.records.length,
    header: 'Payment# | Date | Amount | Net | Status | Request#',
    payments: lines.join('\n') || 'No payments found.',
  };
}

async function handleAccountReports(accountId, sourceRecord, buildDateFilter) {
  const { requestIds, requestLookup } = await getAccountRequestIds(accountId);

  if (!requestIds.length) {
    return {
      account: sourceRecord?.name || accountId,
      reportCount: 0,
      reports: 'No requests found for this account.',
    };
  }

  const orClauses = requestIds.map(id => `_akoya_requestlookup_value eq ${id}`).join(' or ');
  const dateFilter = buildDateFilter('akoya_requirementdue');

  const result = await DynamicsService.queryRecords('akoya_requestpayments', {
    select: 'akoya_paymentnum,akoya_requirementdue,akoya_requirementtype,wmkf_reporttype,_akoya_requestlookup_value,statecode',
    filter: `akoya_type eq true and (${orClauses})${dateFilter}`,
    orderby: 'akoya_requirementdue asc',
    top: 100,
  });

  const lines = result.records.map(r => {
    const num = r.akoya_paymentnum || '?';
    const due = r.akoya_requirementdue_formatted || r.akoya_requirementdue || '';
    const type = r.akoya_requirementtype_formatted || '?';
    const detail = r.wmkf_reporttype_formatted || '';
    const reqNum = requestLookup[r._akoya_requestlookup_value] || '?';
    const status = r.statecode_formatted || '';
    return `${num} | ${due} | ${type}${detail ? ' - ' + detail : ''} | Req ${reqNum} | ${status}`;
  });

  return {
    account: sourceRecord?.name || accountId,
    reportCount: result.records.length,
    totalCount: result.totalCount,
    hasMore: result.totalCount > result.records.length,
    header: 'Report# | Due | Type | Request# | Status',
    reports: lines.join('\n') || 'No reports found.',
  };
}

async function handleRequestPayments(requestId, buildDateFilter) {
  const dateFilter = buildDateFilter('akoya_paymentdate');
  const result = await DynamicsService.queryRecords('akoya_requestpayments', {
    select: 'akoya_paymentnum,akoya_amount,akoya_netamount,akoya_paymentdate,akoya_postingdate,akoya_folio,_akoya_requestapplicant_value,statecode',
    filter: `_akoya_requestlookup_value eq ${requestId} and akoya_type eq false${dateFilter}`,
    orderby: 'akoya_paymentdate desc',
    top: 100,
  });

  const lines = result.records.map(r => {
    const num = r.akoya_paymentnum || '?';
    const amt = r.akoya_amount_formatted || r.akoya_amount || '';
    const net = r.akoya_netamount_formatted || r.akoya_netamount || '';
    const date = r.akoya_paymentdate_formatted || r.akoya_paymentdate || '';
    const status = r.akoya_folio || '';
    return `${num} | ${date} | ${amt} | Net: ${net} | ${status}`;
  });

  return {
    requestId,
    paymentCount: result.records.length,
    totalCount: result.totalCount,
    hasMore: result.totalCount > result.records.length,
    header: 'Payment# | Date | Amount | Net | Status',
    payments: lines.join('\n') || 'No payments found for this request.',
  };
}

async function handleRequestReports(requestId, buildDateFilter) {
  const dateFilter = buildDateFilter('akoya_requirementdue');
  const result = await DynamicsService.queryRecords('akoya_requestpayments', {
    select: 'akoya_paymentnum,akoya_requirementdue,akoya_requirementtype,wmkf_reporttype,_akoya_requestapplicant_value,statecode',
    filter: `_akoya_requestlookup_value eq ${requestId} and akoya_type eq true${dateFilter}`,
    orderby: 'akoya_requirementdue asc',
    top: 100,
  });

  const lines = result.records.map(r => {
    const num = r.akoya_paymentnum || '?';
    const due = r.akoya_requirementdue_formatted || r.akoya_requirementdue || '';
    const type = r.akoya_requirementtype_formatted || '?';
    const detail = r.wmkf_reporttype_formatted || '';
    const status = r.statecode_formatted || '';
    return `${num} | ${due} | ${type}${detail ? ' - ' + detail : ''} | ${status}`;
  });

  return {
    requestId,
    reportCount: result.records.length,
    totalCount: result.totalCount,
    hasMore: result.totalCount > result.records.length,
    header: 'Report# | Due | Type | Status',
    reports: lines.join('\n') || 'No reports found for this request.',
  };
}

async function handleRequestEmails(requestId) {
  const emailResult = await DynamicsService.queryRecords('emails', {
    select: 'subject,sender,torecipients,createdon,directioncode,description,activityid',
    filter: `_regardingobjectid_value eq ${requestId}`,
    orderby: 'createdon desc',
    top: 50,
  });

  const lines = emailResult.records.map(e => {
    const dir = e.directioncode ? 'Out' : 'In';
    const date = e.createdon_formatted || e.createdon || '';
    const subj = (e.subject || '').substring(0, 80);
    const sender = (e.sender || '').substring(0, 30);
    const to = (e.torecipients || '').substring(0, 40);
    const rawBody = (e.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const body = rawBody.length > 800 ? rawBody.substring(0, 800) + '...[truncated]' : rawBody;
    const id = e.activityid || '';
    return `[${dir}] ${date} | ${sender} → ${to} | ${subj}\nID: ${id}\n${body || '(no body text)'}`;
  });

  return {
    requestId,
    emailCount: emailResult.records.length,
    totalCount: emailResult.totalCount,
    hasMore: emailResult.hasMore,
    emails: lines.join('\n---\n') || 'No emails found for this request.',
  };
}

async function handleRequestAnnotations(requestId, buildDateFilter) {
  const dateFilter = buildDateFilter('createdon');
  const result = await DynamicsService.queryRecords('annotations', {
    select: 'subject,notetext,filename,mimetype,filesize,isdocument,createdon,annotationid',
    filter: `_objectid_value eq ${requestId}${dateFilter}`,
    orderby: 'createdon desc',
    top: 50,
  });

  const lines = result.records.map(r => {
    const subj = (r.subject || '').substring(0, 80);
    const date = r.createdon_formatted || r.createdon || '';
    const text = (r.notetext || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 200);
    const file = r.filename ? ` | File: ${r.filename} (${r.mimetype}, ${r.filesize} bytes)` : '';
    return `${date} | ${subj}${file}\n  ${text || '(no text)'}`;
  });

  return {
    requestId,
    annotationCount: result.records.length,
    totalCount: result.totalCount,
    hasMore: result.totalCount > result.records.length,
    annotations: lines.join('\n') || 'No notes/attachments found for this request.',
  };
}

async function handleRequestReviewers(requestId) {
  // Get the request record with reviewer lookup fields
  const req = await DynamicsService.getRecord('akoya_requests', requestId, {
    select: '_wmkf_potentialreviewer1_value,_wmkf_potentialreviewer2_value,_wmkf_potentialreviewer3_value,_wmkf_potentialreviewer4_value,_wmkf_potentialreviewer5_value,wmkf_excludedreviewers',
  });

  const processed = DynamicsService.processAnnotations(req);

  // Collect reviewer GUIDs and their _formatted names
  const reviewers = [];
  for (let i = 1; i <= 5; i++) {
    const guid = processed[`_wmkf_potentialreviewer${i}_value`];
    const name = processed[`_wmkf_potentialreviewer${i}_value_formatted`];
    if (guid && !/^0{8}-/.test(guid)) {
      reviewers.push({ slot: i, id: guid, name: name || 'Unknown' });
    }
  }

  // If we have GUIDs, batch lookup full reviewer details
  if (reviewers.length > 0) {
    const orClauses = reviewers.map(r => `wmkf_potentialreviewersid eq ${r.id}`).join(' or ');
    const detailResult = await DynamicsService.queryRecords('wmkf_potentialreviewerses', {
      select: 'wmkf_name,wmkf_title,wmkf_emailaddress,wmkf_organizationname,wmkf_areaofexpertise,wmkf_potentialreviewersid',
      filter: orClauses,
      top: 5,
    });

    // Merge details back
    const detailMap = {};
    for (const r of detailResult.records) {
      detailMap[r.wmkf_potentialreviewersid] = r;
    }

    for (const rev of reviewers) {
      const detail = detailMap[rev.id];
      if (detail) {
        rev.title = detail.wmkf_title || '';
        rev.email = detail.wmkf_emailaddress || '';
        rev.organization = detail.wmkf_organizationname || '';
        rev.expertise = detail.wmkf_areaofexpertise || '';
      }
    }
  }

  const lines = reviewers.map(r => {
    const parts = [`Slot ${r.slot}: ${r.name}`];
    if (r.title) parts.push(r.title);
    if (r.organization) parts.push(r.organization);
    if (r.email) parts.push(r.email);
    if (r.expertise) parts.push(`Expertise: ${r.expertise.substring(0, 100)}`);
    return parts.join(' | ');
  });

  const excluded = processed.wmkf_excludedreviewers || '';

  return {
    requestId,
    reviewerCount: reviewers.length,
    reviewers: lines.join('\n') || 'No reviewers assigned to this request.',
    excludedReviewers: excluded || null,
  };
}

async function handleContactRequests(contactId, buildDateFilter) {
  const dateFilter = buildDateFilter('akoya_submitdate');
  const result = await DynamicsService.queryRecords('akoya_requests', {
    select: 'akoya_requestnum,akoya_requeststatus,akoya_submitdate,akoya_fiscalyear,akoya_paid,wmkf_request_type,_akoya_applicantid_value,_wmkf_grantprogram_value',
    filter: `_akoya_primarycontactid_value eq ${contactId}${dateFilter}`,
    orderby: 'akoya_submitdate desc',
    top: 100,
  });

  const lines = result.records.map(r => {
    const num = r.akoya_requestnum || '?';
    const status = r.akoya_requeststatus_formatted || r.akoya_requeststatus || '';
    const date = r.akoya_submitdate_formatted || r.akoya_submitdate || '';
    const org = r._akoya_applicantid_value_formatted || '';
    const program = r._wmkf_grantprogram_value_formatted || '';
    const paid = r.akoya_paid_formatted || r.akoya_paid || '';
    return `Req ${num} | ${status} | ${date} | ${org} | ${program} | Paid: ${paid}`;
  });

  return {
    contactId,
    requestCount: result.records.length,
    totalCount: result.totalCount,
    hasMore: result.totalCount > result.records.length,
    header: 'Request# | Status | Submitted | Organization | Program | Paid',
    requests: lines.join('\n') || 'No requests found for this contact.',
  };
}

async function handleReviewerRequests(reviewerId, buildDateFilter) {
  const dateFilter = buildDateFilter('akoya_submitdate');
  // OR across all 5 reviewer slots
  const orClauses = [1, 2, 3, 4, 5]
    .map(i => `_wmkf_potentialreviewer${i}_value eq ${reviewerId}`)
    .join(' or ');

  const result = await DynamicsService.queryRecords('akoya_requests', {
    select: 'akoya_requestnum,akoya_requeststatus,akoya_submitdate,akoya_fiscalyear,_akoya_applicantid_value,_wmkf_grantprogram_value',
    filter: `(${orClauses})${dateFilter}`,
    orderby: 'akoya_submitdate desc',
    top: 100,
  });

  const lines = result.records.map(r => {
    const num = r.akoya_requestnum || '?';
    const status = r.akoya_requeststatus_formatted || r.akoya_requeststatus || '';
    const date = r.akoya_submitdate_formatted || r.akoya_submitdate || '';
    const org = r._akoya_applicantid_value_formatted || '';
    const program = r._wmkf_grantprogram_value_formatted || '';
    return `Req ${num} | ${status} | ${date} | ${org} | ${program}`;
  });

  return {
    reviewerId,
    requestCount: result.records.length,
    totalCount: result.totalCount,
    hasMore: result.totalCount > result.records.length,
    header: 'Request# | Status | Submitted | Organization | Program',
    requests: lines.join('\n') || 'No requests found for this reviewer.',
  };
}

// ─── Export to Excel ───

const MAX_XLSX_BYTES = 3 * 1024 * 1024; // 3MB buffer limit (~4MB base64)

/**
 * Export query results as a downloadable Excel file.
 * Three-way branch:
 * 1. No process_instruction → existing behavior (straight export)
 * 2. process_instruction without confirmed → estimate mode
 * 3. process_instruction with confirmed: true → full AI batch processing + export
 */
async function exportCsv({ table_name, select, filter, orderby, filename, process_instruction, confirmed }, sendEvent, userProfileId) {
  const cleanSelect = sanitizeSelect(select);
  const entitySet = await DynamicsService.resolveEntitySetName(table_name);

  // ─── Branch 1: No AI processing — straight export (unchanged) ───
  if (!process_instruction) {
    const result = await DynamicsService.queryAllRecords(entitySet, {
      select: cleanSelect,
      filter,
      orderby,
    });

    if (!result.records.length) {
      return { exportedCount: 0, message: 'No records matched the filter. No file generated.' };
    }

    const records = result.records.map(stripEmpty);
    return await generateExcelExport(records, cleanSelect, table_name, filename, result.totalCount, result.capped, sendEvent);
  }

  // ─── Branch 2: Estimate mode — count records, sample AI processing ───
  if (!confirmed) {
    // Fetch 3 sample records — also gives us totalCount without the /$count endpoint
    // (/$count fails with Edm.Int32 error on complex filters)
    const sampleResult = await DynamicsService.queryRecords(entitySet, {
      select: cleanSelect,
      filter,
      top: 3,
    });

    if (!sampleResult.records.length) {
      return { estimatedCount: 0, message: 'No records matched the filter.' };
    }

    const count = sampleResult.totalCount || sampleResult.records.length;

    // Run AI on first sample to determine columns and preview output
    const sampleRecord = stripEmpty(sampleResult.records[0]);
    const { sampleOutput, usage } = await runSampleProcessing(sampleRecord, process_instruction, userProfileId);

    // Extrapolate cost: (tokens per record) × total records ÷ batch size
    const recordsPerBatch = 15;
    const totalBatches = Math.ceil(Math.min(count, 5000) / recordsPerBatch);
    // Estimate per-batch tokens as sample tokens × batch size (with some overhead)
    const estInputPerBatch = (usage.input_tokens || 500) * recordsPerBatch * 0.8; // records share system prompt
    const estOutputPerBatch = (usage.output_tokens || 100) * recordsPerBatch;
    const totalInputTokens = estInputPerBatch * totalBatches;
    const totalOutputTokens = estOutputPerBatch * totalBatches;

    const model = getModelForApp('dynamics-explorer');
    const costCents = estimateCostCents(model, totalInputTokens, totalOutputTokens) || 0;
    const estimatedTimeSeconds = Math.ceil(totalBatches / 3) * 2; // 3 concurrent, ~2s each

    return {
      estimatedCount: Math.min(count, 5000),
      totalMatched: count,
      capped: count > 5000,
      sampleOutput,
      aiColumns: Object.keys(sampleOutput),
      estimatedCostCents: Math.round(costCents * 100) / 100,
      estimatedTimeSeconds,
      message: `Found ${count} records${count > 5000 ? ' (will export first 5000)' : ''}. Sample AI output shown. Estimated cost: ~$${(costCents / 100).toFixed(2)}, time: ~${estimatedTimeSeconds}s. Ask the user to confirm before proceeding.`,
    };
  }

  // ─── Branch 3: Confirmed — full AI batch processing + export ───
  const result = await DynamicsService.queryAllRecords(entitySet, {
    select: cleanSelect,
    filter,
    orderby,
  });

  if (!result.records.length) {
    return { exportedCount: 0, message: 'No records matched the filter. No file generated.' };
  }

  let records = result.records.map(stripEmpty);

  // Run AI batch processing
  const { processedRecords, failedCount } = await processRecordsBatch(
    records, process_instruction, sendEvent, userProfileId
  );

  // Build combined select string including AI columns
  const aiColumns = Object.keys(processedRecords[0] || {}).filter(k => k.startsWith('ai_'));
  const combinedSelect = cleanSelect
    ? cleanSelect + ',' + aiColumns.join(',')
    : null;

  return await generateExcelExport(
    processedRecords, combinedSelect, table_name, filename,
    result.totalCount, result.capped, sendEvent, failedCount
  );
}

/**
 * Generate Excel file and send via SSE. Shared by plain and AI-processed exports.
 */
async function generateExcelExport(records, selectStr, tableName, filename, totalCount, capped, sendEvent, failedCount) {
  let xlsxBuf = await recordsToExcel(records, selectStr, tableName);

  // Safety: if xlsx exceeds size limit, trim records
  if (xlsxBuf.length > MAX_XLSX_BYTES) {
    const ratio = MAX_XLSX_BYTES / xlsxBuf.length;
    const trimCount = Math.floor(records.length * ratio * 0.9);
    records.length = trimCount;
    xlsxBuf = await recordsToExcel(records, selectStr, tableName);
    capped = true;
  }

  const base64 = Buffer.from(xlsxBuf).toString('base64');
  const columns = selectStr ? selectStr.split(',').map(f => f.trim()) : Object.keys(records[0] || {});
  const exportFilename = (filename || `${tableName}-export`).replace(/[^a-zA-Z0-9_-]/g, '_') + '.xlsx';

  sendEvent('file_ready', {
    base64,
    filename: exportFilename,
    recordCount: records.length,
    totalCount,
    capped,
    columns,
  });

  const result = {
    exportedCount: records.length,
    totalCount,
    capped,
    columnCount: columns.length,
    filename: exportFilename,
    message: `Excel file exported: ${records.length} records, ${columns.length} columns.${capped ? ` Capped at limit (${totalCount} total matched).` : ''}`,
  };

  if (failedCount > 0) {
    result.failedCount = failedCount;
    result.message += ` ${failedCount} records failed AI processing (columns left blank).`;
  }

  return result;
}

// ─── AI Batch Processing ───

/**
 * Non-streaming Claude API call for batch processing.
 * No tools, no text streaming — just returns raw text and usage.
 */
async function callClaudeBatch({ systemPrompt, userMessage, userProfileId }) {
  const apiKey = process.env.CLAUDE_API_KEY;
  const model = getModelForApp('dynamics-explorer');

  const body = {
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  };

  const callHeaders = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': BASE_CONFIG.CLAUDE.ANTHROPIC_VERSION,
  };

  const startTime = Date.now();

  let resp = await fetch(BASE_CONFIG.CLAUDE.API_URL, {
    method: 'POST',
    headers: callHeaders,
    body: JSON.stringify(body),
  });

  // Rate limit: wait and retry once
  if (resp.status === 429) {
    const retryAfter = parseInt(resp.headers.get('retry-after') || '30', 10);
    const waitMs = Math.min(retryAfter, 60) * 1000;
    console.log(`[DynExp Export] Rate limited, waiting ${waitMs / 1000}s...`);
    await new Promise(resolve => setTimeout(resolve, waitMs));
    resp = await fetch(BASE_CONFIG.CLAUDE.API_URL, {
      method: 'POST',
      headers: callHeaders,
      body: JSON.stringify(body),
    });
  }

  if (!resp.ok) {
    const errorBody = await resp.text();
    throw new Error(`Claude API error (${resp.status}): ${errorBody.substring(0, 200)}`);
  }

  const data = await resp.json();
  const text = data.content?.find(b => b.type === 'text')?.text || '';
  const usage = data.usage || {};

  logUsage({
    userProfileId,
    appName: 'dynamics-explorer-export',
    model: data.model || model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    latencyMs: Date.now() - startTime,
  });

  return { text, usage };
}

/**
 * Run AI instruction on 1 sample record to determine output column names and preview.
 * Returns { sampleOutput: { col1: val1, ... }, usage }.
 */
async function runSampleProcessing(record, processInstruction, userProfileId) {
  const systemPrompt = `You are a data processing assistant. The user will give you a record from a CRM database and an instruction for what to extract or analyze.

Return ONLY a JSON object with your results. Choose descriptive snake_case column names based on the instruction (e.g., "keywords", "research_area", "summary"). Keep values concise — suitable for spreadsheet cells.

Example output: {"keywords": "fungi, enzyme catalysis, bioremediation", "research_area": "Environmental Biology"}`;

  const userMessage = `Instruction: ${processInstruction}

Record:
${JSON.stringify(record, null, 2)}`;

  const { text, usage } = await callClaudeBatch({ systemPrompt, userMessage, userProfileId });

  // Parse the JSON response
  let sampleOutput;
  try {
    // Extract JSON from the response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    sampleOutput = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch {
    sampleOutput = { result: text.substring(0, 200) };
  }

  return { sampleOutput, usage };
}

/**
 * Process all records through Claude in batches.
 * Batches records (15 per call, 3 concurrent), sends progress via SSE.
 * Returns { processedRecords, failedCount }.
 */
async function processRecordsBatch(records, processInstruction, sendEvent, userProfileId) {
  const BATCH_SIZE = 15;
  const CONCURRENCY = 3;

  // First, run sample to get column schema
  const { sampleOutput } = await runSampleProcessing(records[0], processInstruction, userProfileId);
  const columnNames = Object.keys(sampleOutput);

  const systemPrompt = `You are a data processing assistant. Process each record according to the instruction and return a JSON array of objects.

Each object in the array must have exactly these columns: ${JSON.stringify(columnNames)}
Return one object per input record, in the same order. Keep values concise — suitable for spreadsheet cells.
If a record lacks the needed data, use empty strings for the values.

Return ONLY the JSON array, no other text.`;

  // Split records into batches
  const batches = [];
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    batches.push({ records: records.slice(i, i + BATCH_SIZE), startIndex: i });
  }

  let processed = 0;
  let failedCount = 0;

  // Initialize AI columns on all records with empty strings
  for (const record of records) {
    for (const col of columnNames) {
      record[`ai_${col}`] = '';
    }
  }

  // Process batches with concurrency limit
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      chunk.map(async (batch) => {
        const batchRecords = batch.records.map((r, idx) => ({ index: idx + 1, ...r }));
        const userMessage = `Instruction: ${processInstruction}

Records (${batchRecords.length}):
${JSON.stringify(batchRecords, null, 1)}`;

        let result;
        try {
          result = await callClaudeBatch({ systemPrompt, userMessage, userProfileId });
        } catch (err) {
          // Retry once
          console.log(`[DynExp Export] Batch retry after error: ${err.message.substring(0, 100)}`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          result = await callClaudeBatch({ systemPrompt, userMessage, userProfileId });
        }

        // Parse the JSON array response
        const jsonMatch = result.text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error('No JSON array in response');
        const parsed = JSON.parse(jsonMatch[0]);

        // Merge AI results back into records
        for (let j = 0; j < batch.records.length && j < parsed.length; j++) {
          const aiResult = parsed[j];
          for (const col of columnNames) {
            records[batch.startIndex + j][`ai_${col}`] = aiResult[col] ?? '';
          }
        }

        return batch.records.length;
      })
    );

    // Count successes and failures
    for (const r of results) {
      if (r.status === 'fulfilled') {
        processed += r.value;
      } else {
        const chunkIdx = results.indexOf(r);
        const failedBatch = chunk[chunkIdx];
        failedCount += failedBatch?.records.length || 0;
        processed += failedBatch?.records.length || 0;
        console.log(`[DynExp Export] Batch failed: ${r.reason?.message?.substring(0, 100)}`);
      }
    }

    sendEvent('export_progress', { processed, total: records.length, failed: failedCount });
  }

  return { processedRecords: records, failedCount };
}

/**
 * Convert records to an xlsx buffer using ExcelJS.
 * Prefers _formatted values for human-readable output.
 */
async function recordsToExcel(records, selectStr, sheetName) {
  // Determine columns from $select
  const selectFields = selectStr
    ? selectStr.split(',').map(f => f.trim())
    : Object.keys(records[0] || {});

  // Build headers
  const headers = selectFields.map(f => cleanColumnName(f));

  // Build rows, preferring _formatted values
  const dataRows = records.map(r => {
    return selectFields.map(field => {
      const formatted = r[`${field}_formatted`];
      return formatted !== undefined ? formatted : (r[field] ?? '');
    });
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet((sheetName || 'Export').substring(0, 31));

  // Add header row
  ws.addRow(headers);

  // Add data rows
  for (const row of dataRows) {
    ws.addRow(row);
  }

  // Auto-size columns based on content
  ws.columns.forEach((col, i) => {
    let maxLen = headers[i].length;
    for (const row of dataRows.slice(0, 100)) {
      const val = String(row[i] || '');
      if (val.length > maxLen) maxLen = val.length;
    }
    col.width = Math.min(maxLen + 2, 50);
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * Clean column names: strip akoya_/wmkf_ prefixes, _value suffix,
 * and convert to Title Case. AI columns (ai_*) get "AI: " prefix.
 */
function cleanColumnName(field) {
  // AI-generated columns get "AI: " prefix
  if (field.startsWith('ai_')) {
    const aiName = field.slice(3)
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return `AI: ${aiName}`;
  }

  let name = field
    .replace(/^_/, '')
    .replace(/_value$/, '')
    .replace(/^akoya_/, '')
    .replace(/^wmkf_/, '');
  // Convert snake_case to Title Case
  return name
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ─── Existing composite tools (kept) ───

/**
 * Find all reporting requirements due in a date range.
 * Single Dynamics query with _formatted annotations for org/request names.
 */
async function findReportsDue({ date_from, date_to }) {
  const filter = `akoya_type eq true and akoya_requirementdue ge ${date_from} and akoya_requirementdue lt ${date_to}`;

  const result = await DynamicsService.queryRecords('akoya_requestpayments', {
    select: 'akoya_paymentnum,akoya_requirementdue,akoya_requirementtype,wmkf_reporttype,_akoya_requestlookup_value,_akoya_requestapplicant_value,statecode',
    filter,
    orderby: 'akoya_requirementdue asc',
    top: 100,
  });

  if (!result.records.length) {
    return { reportCount: 0, totalCount: result.totalCount, message: 'No reports due in this date range.' };
  }

  // Group by due date for summary
  const byDate = {};
  const lines = result.records.map(r => {
    const num = r.akoya_paymentnum || '?';
    const due = r.akoya_requirementdue_formatted || r.akoya_requirementdue || '?';
    const type = r.akoya_requirementtype_formatted || '?';
    const detail = r.wmkf_reporttype_formatted || '';
    const reqNum = r._akoya_requestlookup_value_formatted || r._akoya_requestlookup_value || '?';
    const org = r._akoya_requestapplicant_value_formatted || '?';
    const status = r.statecode_formatted || '';

    // Track date grouping
    byDate[due] = (byDate[due] || 0) + 1;

    return `${num} | ${due} | ${type}${detail ? ' - ' + detail : ''} | Req ${reqNum} | ${org} | ${status}`;
  });

  const summary = Object.entries(byDate)
    .map(([date, count]) => `${date}: ${count}`)
    .join(', ');

  return {
    totalCount: result.totalCount,
    reportCount: result.records.length,
    hasMore: result.totalCount > result.records.length,
    byDate: summary,
    header: 'Report# | Due | Type | Request# | Organization | Status',
    reports: lines.join('\n'),
  };
}

/**
 * Full-text search across all indexed Dynamics tables.
 */
async function searchRecords({ search, entities, top }) {
  const result = await DynamicsService.searchRecords(search, {
    entities,
    top: top || 20,
  });

  if (!result.results.length) {
    return {
      totalCount: 0,
      query: result.queryContext?.alteredquery || search,
      message: 'No results found.',
    };
  }

  // Group results by entity for readable output
  const byEntity = {};
  for (const r of result.results) {
    if (!byEntity[r.entity]) byEntity[r.entity] = [];
    byEntity[r.entity].push(r);
  }

  const sections = [];
  for (const [entity, results] of Object.entries(byEntity)) {
    const lines = results.map(r => {
      const a = r.attributes;

      // Build a one-line identifier based on entity type
      let label;
      if (entity === 'akoya_request') {
        label = `Req ${a.akoya_requestnum || '?'} | ${a.akoya_applicantidname || '?'} | ${(a.akoya_title || '').substring(0, 80)}`;
      } else if (entity === 'contact') {
        label = `${a.fullname || '?'} | ${a.jobtitle || ''} | ${a.emailaddress1 || ''}`;
      } else if (entity === 'account') {
        label = `${a.name || '?'} | ${a.address1_city || ''}, ${a.address1_stateorprovince || ''}`;
      } else if (entity === 'annotation') {
        label = `Note: ${(a.subject || a.notetext || '').substring(0, 80)}`;
      } else if (entity === 'email') {
        label = `Email: ${(a.subject || '').substring(0, 80)} | ${a.createdon || ''}`;
      } else {
        label = `${a.wmkf_name || a.akoya_title || r.objectId}`;
      }

      // Format highlights — strip {crmhit} tags and show matched text
      const hlParts = [];
      for (const [field, values] of Object.entries(r.highlights)) {
        const cleanValues = (Array.isArray(values) ? values : [values])
          .map(v => v.replace(/\{crmhit\}/g, '**').replace(/\{\/crmhit\}/g, '**'));
        hlParts.push(`${field}: ${cleanValues[0].substring(0, 200)}`);
      }

      return `${label}\n  ID: ${r.objectId}\n  ${hlParts.join('\n  ')}`;
    });

    sections.push(`[${entity}] (${results.length} results)\n${lines.join('\n')}`);
  }

  return {
    totalCount: result.totalCount,
    query: result.queryContext?.alteredquery || search,
    results: sections.join('\n\n'),
  };
}

// ─── Helpers ───

function checkRestriction(toolName, input, restrictions) {
  if (!restrictions.length || !input.table_name) return null;
  for (const r of restrictions) {
    if (r.table_name === input.table_name) {
      if (!r.field_name) return `Table "${r.table_name}" is restricted`;
      if (input.select) {
        const fields = input.select.split(',').map(f => f.trim());
        if (fields.includes(r.field_name)) return `Field "${r.field_name}" is restricted`;
      }
    }
  }
  return null;
}

function getThinkingMessage(toolName, input) {
  switch (toolName) {
    case 'search': return `Searching for "${input.search}"...`;
    case 'get_entity': return `Looking up ${input.type}: "${input.identifier}"...`;
    case 'get_related': return `Finding ${input.target_type} for ${input.source_type} ${input.source_name || input.source_id || ''}...`;
    case 'describe_table': return input.table_name ? `Describing ${input.table_name}...` : 'Listing available tables...';
    case 'query_records': return `Querying ${input.table_name}...`;
    case 'count_records': return `Counting ${input.table_name}...`;
    case 'find_reports_due': return `Finding reports due ${input.date_from ? 'from ' + input.date_from.substring(0, 10) : ''}...`;
    case 'export_csv':
      if (input.process_instruction && input.confirmed) return `Processing and exporting ${input.table_name || 'data'} with AI analysis...`;
      if (input.process_instruction) return `Estimating AI processing for ${input.table_name || 'data'} export...`;
      return `Exporting ${input.table_name || 'data'} as Excel...`;
    default: return `Running ${toolName}...`;
  }
}

// ─── Database helpers ───

async function getUserRole(userProfileId) {
  if (!userProfileId) return 'read_only';
  try {
    const result = await sql`SELECT role FROM dynamics_user_roles WHERE user_profile_id = ${userProfileId}`;
    return result.rows[0]?.role || 'read_only';
  } catch { return 'read_only'; }
}

async function getActiveRestrictions() {
  try {
    const result = await sql`SELECT table_name, field_name, restriction_type, reason FROM dynamics_restrictions ORDER BY table_name`;
    return result.rows;
  } catch { return []; }
}

function logQuery({ userProfileId, sessionId, queryType, tableName, queryParams, recordCount, executionTime }) {
  sql`INSERT INTO dynamics_query_log (user_profile_id, session_id, query_type, table_name, query_params, record_count, execution_time_ms)
    VALUES (${userProfileId || null}, ${sessionId || null}, ${queryType}, ${tableName}, ${JSON.stringify(queryParams)}, ${recordCount}, ${executionTime})`
    .catch(err => console.warn('Failed to log dynamics query:', err.message));
}
