/**
 * API Route: /api/dynamics-explorer/chat
 *
 * Agentic chat endpoint for the Dynamics Explorer.
 * Runs a server-side tool-use loop: user question → Claude tool calls
 * → Dynamics API execution → Claude response → SSE stream to client.
 *
 * Optimized for low token usage (30k input token/minute rate limit):
 * - Compact system prompt and tool definitions
 * - Conversation compaction between agentic rounds
 * - Aggressive result truncation and field filtering
 */

import { requireAuth } from '../../../lib/utils/auth';
import { sql } from '@vercel/postgres';
import { DynamicsService } from '../../../lib/services/dynamics-service';
import { buildSystemPrompt, TOOL_DEFINITIONS } from '../../../shared/config/prompts/dynamics-explorer';
import { getModelForApp, getFallbackModelForApp } from '../../../shared/config/baseConfig';
import { BASE_CONFIG } from '../../../shared/config/baseConfig';

export const config = {
  api: {
    bodyParser: { sizeLimit: '1mb' },
  },
  maxDuration: 300,
};

const MAX_TOOL_ROUNDS = 10;
const MAX_RESULT_CHARS = 8000;

// System fields to exclude from discover_fields results
const SYSTEM_FIELD_PREFIXES = [
  'overridden', 'versionnumber', 'timezonerule', 'utcconversion',
  'importsequencenumber', 'exchangerate', '_transactioncurrency',
  '_owningbusinessunit', '_owningteam', '_ownerid', '_organizationid',
  '_modifiedonbehalfby', '_createdonbehalfby',
];
const SYSTEM_FIELD_NAMES = new Set([
  'versionnumber', 'timezoneruleversionnumber', 'utcconversiontimezonecode',
  'importsequencenumber', 'overriddencreatedon', 'exchangerate',
]);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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
      return res.end();
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      sendEvent('error', { message: 'At least one message is required' });
      return res.end();
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
        return res.end();
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

        // Composite tools return compact text and need more room
        const charLimit = (name === 'find_emails_for_request' || name === 'find_reports_due' || name === 'search_records') ? 12000 : MAX_RESULT_CHARS;
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
    if (data.count !== undefined && data.tables) return `Found ${data.count} tables`;
    if (data.count !== undefined && data.fields) return `Found ${data.count} fields`;
    if (data.count !== undefined && !data.records) return `Count: ${data.count}`;
    if (data.records) return `Returned ${data.records.length} records`;
    if (data.manyToOne || data.oneToMany) return `Relationships loaded`;
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

function isSystemField(name) {
  if (SYSTEM_FIELD_NAMES.has(name)) return true;
  return SYSTEM_FIELD_PREFIXES.some(p => name.startsWith(p));
}

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
    case 'query_records': {
      const entitySet = await DynamicsService.resolveEntitySetName(input.table_name);
      const result = await DynamicsService.queryRecords(entitySet, {
        select: sanitizeSelect(input.select),
        filter: input.filter,
        orderby: input.orderby,
        top: input.top || 50,
        expand: input.expand,
      });
      // Strip null/empty values to dramatically reduce token usage
      result.records = result.records.map(stripEmpty);
      return result;
    }

    case 'count_records': {
      const entitySet = await DynamicsService.resolveEntitySetName(input.table_name);
      const count = await DynamicsService.countRecords(entitySet, input.filter);
      return { count };
    }

    case 'get_record': {
      const entitySet = await DynamicsService.resolveEntitySetName(input.table_name);
      const record = await DynamicsService.getRecord(entitySet, input.record_id, {
        select: sanitizeSelect(input.select),
        expand: input.expand,
      });
      return stripEmpty(record);
    }

    case 'find_emails_for_account': {
      return await findEmailsForAccount(input);
    }

    case 'find_emails_for_request': {
      return await findEmailsForRequest(input);
    }

    case 'find_reports_due': {
      return await findReportsDue(input);
    }

    case 'search_records': {
      return await searchRecords(input);
    }

    case 'discover_tables': {
      const allEntities = await DynamicsService.getEntityDefinitions(input.search_term);
      return {
        tables: allEntities.slice(0, 30).map(e => `${e.logicalName} (${e.entitySetName})`),
        count: allEntities.length,
      };
    }

    case 'discover_fields': {
      const attrs = await DynamicsService.getEntityAttributes(input.table_name);
      const filtered = attrs.filter(a => !isSystemField(a.logicalName));
      return {
        fields: filtered.map(a => `${a.logicalName} (${a.type})`),
        count: filtered.length,
      };
    }

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
        note: `Showing ${maxRecords} of ${totalCount} total matching records. Present the totalCount to the user. Use narrower $filter or $orderby with $skip-style pagination to see all.`,
      };
      return JSON.stringify(trimmed);
    }
  }

  // Fallback: string truncation for non-record results
  return str.substring(0, charLimit) + '... [truncated]';
}

// ─── Composite tools ───

/**
 * Find all emails for an organization by name.
 * Handles the full 3-step lookup: account → request IDs → batch email query.
 */
async function findEmailsForAccount({ account_name, date_from, date_to }) {
  // Step 1: Find the account (prefer exact match)
  const accountResult = await DynamicsService.queryRecords('accounts', {
    select: 'name,accountid',
    filter: `contains(name,'${account_name.replace(/'/g, "''")}')`,
    top: 10,
  });

  if (!accountResult.records.length) {
    return { error: `No account found matching "${account_name}"` };
  }

  // Prefer exact name match over partial
  const exactMatch = accountResult.records.find(
    a => a.name?.toLowerCase() === account_name.toLowerCase()
  );
  const account = exactMatch || accountResult.records[0];
  const accountId = account.accountid;

  // Step 2: Get request IDs for this account (most recent first, since
  // old requests from the 1990s are unlikely to have recent email activity)
  const requestResult = await DynamicsService.queryRecords('akoya_requests', {
    select: 'akoya_requestnum,akoya_requestid,akoya_requeststatus',
    filter: `_akoya_applicantid_value eq ${accountId}`,
    orderby: 'createdon desc',
    top: 100,
  });

  if (!requestResult.records.length) {
    return {
      account: account.name,
      accountId,
      requestCount: 0,
      emails: [],
      message: 'No requests found for this account, so no linked emails.',
    };
  }

  // Step 3: Batch query emails with OR filter on request IDs
  const requestIds = requestResult.records.map(r => r.akoya_requestid);
  const orClauses = requestIds.map(id => `_regardingobjectid_value eq ${id}`).join(' or ');

  let dateFilter = '';
  if (date_from) dateFilter += ` and createdon ge ${date_from}`;
  if (date_to) dateFilter += ` and createdon lt ${date_to}`;

  const emailResult = await DynamicsService.queryRecords('emails', {
    select: 'subject,sender,torecipients,createdon,directioncode,_regardingobjectid_value',
    filter: `(${orClauses})${dateFilter}`,
    orderby: 'createdon desc',
    top: 100,
  });

  // Build a request number lookup
  const requestLookup = {};
  for (const r of requestResult.records) {
    requestLookup[r.akoya_requestid] = r.akoya_requestnum;
  }

  // Return compact text format instead of raw JSON to save tokens
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
    account: account.name,
    requestCount: requestResult.records.length,
    emailCount: emailResult.records.length,
    hasMore: emailResult.hasMore,
    emails: lines.join('\n'),
  };
}

/**
 * Find all emails linked to a specific request by request number.
 */
async function findEmailsForRequest({ request_number }) {
  // Step 1: Look up the request by number
  const reqResult = await DynamicsService.queryRecords('akoya_requests', {
    select: 'akoya_requestnum,akoya_requestid,akoya_requeststatus,akoya_submitdate,akoya_fiscalyear,_akoya_applicantid_value,_akoya_primarycontactid_value',
    filter: `akoya_requestnum eq '${request_number.replace(/'/g, "''")}'`,
    top: 1,
  });

  if (!reqResult.records.length) {
    return { error: `No request found with number "${request_number}"` };
  }

  const req = reqResult.records[0];
  const reqId = req.akoya_requestid;

  // Step 2: Query all emails linked to this request (include description for full text)
  const emailResult = await DynamicsService.queryRecords('emails', {
    select: 'subject,sender,torecipients,createdon,directioncode,description,activityid',
    filter: `_regardingobjectid_value eq ${reqId}`,
    orderby: 'createdon desc',
    top: 50,
  });

  // Format results with email body text
  const lines = emailResult.records.map(e => {
    const dir = e.directioncode ? 'Out' : 'In';
    const date = e.createdon_formatted || e.createdon || '';
    const subj = (e.subject || '').substring(0, 80);
    const sender = (e.sender || '').substring(0, 30);
    const to = (e.torecipients || '').substring(0, 40);
    // Strip HTML tags from email body and truncate
    const rawBody = (e.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const body = rawBody.length > 800 ? rawBody.substring(0, 800) + '...[truncated, use get_record with activityid for full text]' : rawBody;
    const id = e.activityid || '';
    return `[${dir}] ${date} | ${sender} → ${to} | ${subj}\nID: ${id}\n${body || '(no body text)'}`;
  });

  const cleaned = stripEmpty(req);

  return {
    request_number: req.akoya_requestnum,
    status: req.akoya_requeststatus_formatted || req.akoya_requeststatus,
    submitted: req.akoya_submitdate_formatted || req.akoya_submitdate,
    applicant: req._akoya_applicantid_value_formatted || req._akoya_applicantid_value,
    contact: req._akoya_primarycontactid_value_formatted || req._akoya_primarycontactid_value,
    emailCount: emailResult.records.length,
    emails: lines.join('\n---\n') || 'No emails found for this request.',
  };
}

/**
 * Find all reporting requirements due in a date range.
 * Single Dynamics query with _formatted annotations for org/request names.
 * Returns compact text to fit large result sets in the token budget.
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
 * Calls the Dataverse Search API and returns compact results with highlights.
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
  const t = input.table_name;
  switch (toolName) {
    case 'discover_tables': return `Searching tables for "${input.search_term}"...`;
    case 'discover_fields': return `Getting fields for ${t}...`;
    case 'query_records': return `Querying ${t}...`;
    case 'get_record': return `Fetching record from ${t}...`;
    case 'count_records': return `Counting ${t}...`;
    case 'search_records': return `Searching for "${input.search}"...`;
    case 'find_emails_for_account': return `Finding emails for "${input.account_name}"...`;
    case 'find_emails_for_request': return `Finding emails for request ${input.request_number}...`;
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
