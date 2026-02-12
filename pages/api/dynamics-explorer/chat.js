/**
 * API Route: /api/dynamics-explorer/chat
 *
 * Agentic chat endpoint for the Dynamics Explorer.
 * Runs a server-side tool-use loop: user question → Claude tool calls
 * → Dynamics API execution → Claude response → SSE stream to client.
 *
 * Uses SSE (Server-Sent Events) for real-time streaming.
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
  maxDuration: 300, // 5 minutes
};

const MAX_TOOL_ROUNDS = 10;
const MAX_RESULT_CHARS = 30000; // Truncate large results

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

    // Load user role
    const userRole = await getUserRole(userProfileId);

    // Load active restrictions
    const restrictions = await getActiveRestrictions();

    // Build system prompt with role and restrictions
    const systemPrompt = buildSystemPrompt({ userRole, restrictions });

    // Prepare conversation messages for Claude (strip frontend-only fields)
    const claudeMessages = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    sendEvent('thinking', { message: 'Analyzing your question...' });

    // ─── Agentic loop ───
    let round = 0;
    let currentMessages = [...claudeMessages];
    const model = getModelForApp('dynamics-explorer');
    const fallbackModel = getFallbackModelForApp('dynamics-explorer');

    while (round < MAX_TOOL_ROUNDS) {
      round++;

      // Call Claude
      const claudeResponse = await callClaude({
        apiKey: claudeApiKey,
        model,
        fallbackModel,
        systemPrompt,
        messages: currentMessages,
        tools: TOOL_DEFINITIONS,
      });

      // Check for text content (final response)
      const textBlocks = claudeResponse.content.filter(b => b.type === 'text');
      const toolBlocks = claudeResponse.content.filter(b => b.type === 'tool_use');

      if (toolBlocks.length === 0) {
        // No more tool calls — stream the final text response
        const finalText = textBlocks.map(b => b.text).join('\n');
        sendEvent('response', { content: finalText });
        sendEvent('complete', { rounds: round });
        return res.end();
      }

      // Execute tool calls
      const toolResults = [];
      for (const toolBlock of toolBlocks) {
        const { id, name, input } = toolBlock;

        // Check restrictions before executing
        const restricted = checkRestriction(name, input, restrictions);
        if (restricted) {
          sendEvent('thinking', { message: `Blocked: ${restricted}` });
          toolResults.push({
            type: 'tool_result',
            tool_use_id: id,
            content: `ACCESS DENIED: ${restricted}`,
          });
          continue;
        }

        sendEvent('thinking', { message: getThinkingMessage(name, input) });

        const startTime = Date.now();
        let result;
        let error;

        try {
          result = await executeTool(name, input);
        } catch (err) {
          error = err.message;
          result = { error: err.message };
        }

        const executionTime = Date.now() - startTime;

        // Log the query
        logQuery({
          userProfileId,
          sessionId,
          queryType: name,
          tableName: input.table_name || null,
          queryParams: input,
          recordCount: result?.records?.length || result?.count || (error ? -1 : 0),
          executionTime,
        });

        // Serialize and truncate if needed
        let resultStr = JSON.stringify(result, null, 2);
        if (resultStr.length > MAX_RESULT_CHARS) {
          resultStr = resultStr.substring(0, MAX_RESULT_CHARS) + '\n... [truncated — too many results. Try a more specific filter or reduce $top]';
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: id,
          content: resultStr,
        });
      }

      // Stream any partial text before tool calls
      if (textBlocks.length > 0) {
        sendEvent('thinking', { message: textBlocks.map(b => b.text).join(' ') });
      }

      // Append assistant message and tool results to conversation
      currentMessages.push({
        role: 'assistant',
        content: claudeResponse.content,
      });
      currentMessages.push({
        role: 'user',
        content: toolResults,
      });
    }

    // Max rounds reached
    sendEvent('response', {
      content: 'I reached the maximum number of query steps. Here is what I found so far. Please refine your question if you need more specific results.',
    });
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

// ─── Claude API call ───

async function callClaude({ apiKey, model, fallbackModel, systemPrompt, messages, tools }) {
  const body = {
    model,
    max_tokens: 4096,
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

  // Retry with fallback model on overload
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

async function executeTool(name, input) {
  switch (name) {
    case 'discover_tables':
      return DynamicsService.getEntityDefinitions(input.search_term);

    case 'discover_fields':
      return DynamicsService.getEntityAttributes(input.table_name);

    case 'discover_relationships':
      return DynamicsService.getEntityRelationships(input.table_name);

    case 'query_records': {
      const entitySet = await DynamicsService.resolveEntitySetName(input.table_name);
      return DynamicsService.queryRecords(entitySet, {
        select: input.select,
        filter: input.filter,
        orderby: input.orderby,
        top: input.top,
        expand: input.expand,
      });
    }

    case 'get_record': {
      const entitySet = await DynamicsService.resolveEntitySetName(input.table_name);
      return DynamicsService.getRecord(entitySet, input.record_id, {
        select: input.select,
        expand: input.expand,
      });
    }

    case 'count_records': {
      const entitySet = await DynamicsService.resolveEntitySetName(input.table_name);
      const count = await DynamicsService.countRecords(entitySet, input.filter);
      return { count };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── Restriction checking ───

function checkRestriction(toolName, input, restrictions) {
  if (!restrictions.length) return null;
  if (!input.table_name) return null;

  for (const r of restrictions) {
    if (r.table_name === input.table_name) {
      if (!r.field_name) {
        // Entire table blocked
        return `Table "${r.table_name}" is restricted: ${r.reason || 'Access denied'}`;
      }
      // Check if the restricted field is in $select
      if (input.select && input.select.includes(r.field_name)) {
        return `Field "${r.table_name}.${r.field_name}" is restricted: ${r.reason || 'Access denied'}`;
      }
    }
  }
  return null;
}

// ─── Thinking message helper ───

function getThinkingMessage(toolName, input) {
  switch (toolName) {
    case 'discover_tables':
      return input.search_term
        ? `Searching for tables matching "${input.search_term}"...`
        : 'Discovering available tables...';
    case 'discover_fields':
      return `Getting fields for ${input.table_name}...`;
    case 'discover_relationships':
      return `Getting relationships for ${input.table_name}...`;
    case 'query_records':
      return `Querying ${input.table_name}${input.filter ? ' with filter' : ''}...`;
    case 'get_record':
      return `Fetching record from ${input.table_name}...`;
    case 'count_records':
      return `Counting records in ${input.table_name}...`;
    default:
      return `Executing ${toolName}...`;
  }
}

// ─── Database helpers ───

async function getUserRole(userProfileId) {
  if (!userProfileId) return 'read_only';
  try {
    const result = await sql`
      SELECT role FROM dynamics_user_roles
      WHERE user_profile_id = ${userProfileId}
    `;
    return result.rows[0]?.role || 'read_only';
  } catch {
    return 'read_only';
  }
}

async function getActiveRestrictions() {
  try {
    const result = await sql`
      SELECT table_name, field_name, restriction_type, reason
      FROM dynamics_restrictions
      ORDER BY table_name, field_name
    `;
    return result.rows;
  } catch {
    return [];
  }
}

function logQuery({ userProfileId, sessionId, queryType, tableName, queryParams, recordCount, executionTime }) {
  // Fire and forget — don't block on logging
  sql`
    INSERT INTO dynamics_query_log (user_profile_id, session_id, query_type, table_name, query_params, record_count, execution_time_ms)
    VALUES (${userProfileId || null}, ${sessionId || null}, ${queryType}, ${tableName}, ${JSON.stringify(queryParams)}, ${recordCount}, ${executionTime})
  `.catch(err => {
    console.warn('Failed to log dynamics query:', err.message);
  });
}
