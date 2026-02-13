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

import { requireAuth } from '../../../lib/utils/auth';
import { sql } from '@vercel/postgres';
import { DynamicsService } from '../../../lib/services/dynamics-service';
import { buildSystemPrompt, TOOL_DEFINITIONS, TABLE_ANNOTATIONS } from '../../../shared/config/prompts/dynamics-explorer';
import { getModelForApp, getFallbackModelForApp } from '../../../shared/config/baseConfig';
import { BASE_CONFIG } from '../../../shared/config/baseConfig';

export const config = {
  api: {
    bodyParser: { sizeLimit: '1mb' },
  },
  maxDuration: 300,
};

const MAX_TOOL_ROUNDS = 10;
const MAX_RESULT_CHARS = 16000;

// Per-tool char limits — composite tools return compact text and need more room
const TOOL_CHAR_LIMITS = {
  search: 12000,
  get_related: 12000,
  find_reports_due: 12000,
  describe_table: 12000,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const session = await requireAuth(req, res);
  if (!session) return;

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { messages, claudeApiKey, userProfileId, sessionId } = req.body;

    if (!claudeApiKey) {
      sendEvent('error', { message: 'Claude API key is required' });
      res.end();
      return;
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      sendEvent('error', { message: 'At least one message is required' });
      res.end();
      return;
    }

    const userRole = await getUserRole(userProfileId);
    const restrictions = await getActiveRestrictions();
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
      });

      const textBlocks = claudeResponse.content.filter(b => b.type === 'text');
      const toolBlocks = claudeResponse.content.filter(b => b.type === 'tool_use');

      if (toolBlocks.length === 0) {
        const finalText = textBlocks.map(b => b.text).join('\n');
        sendEvent('response', { content: finalText });
        sendEvent('complete', { rounds: round });
        res.end();
      return;
      }

      // Execute tool calls
      const toolResults = [];
      for (const toolBlock of toolBlocks) {
        const { id, name, input } = toolBlock;

        console.log(`[DynExp] Round ${round} tool: ${name}`, JSON.stringify(input).substring(0, 200));

        const restricted = checkRestriction(name, input, restrictions);
        if (restricted) {
          sendEvent('thinking', { message: `Blocked: ${restricted}` });
          toolResults.push({ type: 'tool_result', tool_use_id: id, content: `DENIED: ${restricted}` });
          continue;
        }

        sendEvent('thinking', { message: getThinkingMessage(name, input) });

        const startTime = Date.now();
        let result;
        try {
          result = await executeTool(name, input);
        } catch (err) {
          console.log(`[DynExp] Round ${round} ${name} ERROR:`, err.message.substring(0, 200));
          result = { error: err.message };
        }
        const executionTime = Date.now() - startTime;

        const recordCount = result?.records?.length || result?.count || (result?.error ? -1 : 0);
        console.log(`[DynExp] Round ${round} ${name} → ${recordCount} records, ${executionTime}ms`);

        logQuery({ userProfileId, sessionId, queryType: name, tableName: input.table_name || null, queryParams: input, recordCount, executionTime });

        const charLimit = TOOL_CHAR_LIMITS[name] || MAX_RESULT_CHARS;
        let resultStr = truncateResult(result, charLimit);

        toolResults.push({ type: 'tool_result', tool_use_id: id, content: resultStr });
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
      message: error.message || 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
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
    return content.substring(0, 100) + '...';
  } catch {
    return content.substring(0, 100) + '...';
  }
}

// ─── Claude API call ───

async function callClaude({ apiKey, model, fallbackModel, systemPrompt, messages, tools }) {
  const body = {
    model,
    max_tokens: 2048,
    system: systemPrompt,
    messages,
    tools,
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

  return resp.json();
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

async function executeTool(name, input) {
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
    select: 'akoya_requestnum,akoya_requeststatus,akoya_submitdate,akoya_fiscalyear,akoya_paid,wmkf_request_type,wmkf_meetingdate,wmkf_numberofyearsoffunding,wmkf_abstract,wmkf_researchconceptstatus,wmkf_mrconcept1title,wmkf_mrconcept2title,wmkf_mrconcept3title,wmkf_mrconcept4title,wmkf_seconcept1title,wmkf_seconcept2title,wmkf_seconcept3title,wmkf_seconcept4title,wmkf_numberofconcepts,wmkf_numberofpayments,wmkf_excludedreviewers,_akoya_applicantid_value,_akoya_primarycontactid_value,_wmkf_programdirector_value,_wmkf_grantprogram_value,_wmkf_type_value,_wmkf_potentialreviewer1_value,_wmkf_potentialreviewer2_value,_wmkf_potentialreviewer3_value,_wmkf_potentialreviewer4_value,_wmkf_potentialreviewer5_value,statecode,createdon',
    filterField: 'akoya_requestnum',
    filterExact: true, // eq instead of contains
    nameField: 'akoya_requestnum',
  },
  account: {
    entitySet: 'accounts',
    idField: 'accountid',
    select: 'name,akoya_constituentnum,akoya_totalgrants,akoya_countofawards,akoya_countofrequests,wmkf_countofprogramgrants,wmkf_countofconcepts,wmkf_countofdiscretionarygrant,wmkf_sumofprogramgrants,wmkf_sumofdiscretionarygrants,wmkf_eastwest,address1_city,address1_stateorprovince,websiteurl,telephone1,akoya_institutiontype,accountid,createdon',
    filterField: 'name',
    filterExact: false, // contains
    nameField: 'name',
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
  const filter = cfg.filterExact
    ? `${cfg.filterField} eq '${escaped}'`
    : `contains(${cfg.filterField},'${escaped}')`;

  const result = await DynamicsService.queryRecords(cfg.entitySet, {
    select: cfg.select,
    filter,
    top: 10,
  });

  if (!result.records.length) {
    return { error: `No ${type} found matching "${identifier}"` };
  }

  // Prefer exact match for contains() lookups
  let match;
  if (!cfg.filterExact && result.records.length > 1) {
    const exact = result.records.find(r => {
      const val = r[cfg.nameField];
      return val && val.toLowerCase() === identifier.toLowerCase();
    });
    match = exact || result.records[0];

    if (!exact) {
      const names = result.records.map(r => r[cfg.nameField]).filter(Boolean);
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
      if (input.select && input.select.includes(r.field_name)) return `Field "${r.field_name}" is restricted`;
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
