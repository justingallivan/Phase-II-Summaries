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
const MAX_RESULT_CHARS = 4000;

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

        let resultStr = JSON.stringify(result);
        if (resultStr.length > MAX_RESULT_CHARS) {
          resultStr = resultStr.substring(0, MAX_RESULT_CHARS) + '... [truncated, use more specific filter]';
        }

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

  let resp = await fetch(BASE_CONFIG.CLAUDE.API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': BASE_CONFIG.CLAUDE.ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (resp.status === 529 && fallbackModel && fallbackModel !== model) {
    body.model = fallbackModel;
    resp = await fetch(BASE_CONFIG.CLAUDE.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': BASE_CONFIG.CLAUDE.ANTHROPIC_VERSION,
      },
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

async function executeTool(name, input) {
  switch (name) {
    case 'query_records': {
      const entitySet = await DynamicsService.resolveEntitySetName(input.table_name);
      const result = await DynamicsService.queryRecords(entitySet, {
        select: input.select,
        filter: input.filter,
        orderby: input.orderby,
        top: input.top || 10,
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
        select: input.select,
        expand: input.expand,
      });
      return stripEmpty(record);
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
