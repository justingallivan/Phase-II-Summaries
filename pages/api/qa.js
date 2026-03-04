/**
 * API Route: /api/qa
 *
 * Streaming Q&A endpoint for the Proposal Summarizer.
 * Accepts multi-turn conversation history + proposal text,
 * streams Claude responses via SSE, supports web search tool.
 */

import { BASE_CONFIG, getModelForApp, loadModelOverrides } from '../../shared/config/baseConfig';
import { nextRateLimiter } from '../../shared/api/middleware/rateLimiter';
import { requireAppAccess } from '../../lib/utils/auth';
import { logUsage } from '../../lib/utils/usage-logger';
import { createQASystemPrompt } from '../../shared/config/prompts/proposal-summarizer';

export const config = {
  api: {
    bodyParser: { sizeLimit: '4mb' },
  },
  maxDuration: 120,
};

const limiter = nextRateLimiter({ max: 30 });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const access = await requireAppAccess(req, res, 'proposal-summarizer', 'batch-proposal-summaries');
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
    const { question, messages = [], proposalText, summaryText, filename } = req.body;

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      sendEvent('error', { message: 'Claude API key not configured on server' });
      return res.end();
    }

    if (!question) {
      sendEvent('error', { message: 'Question is required' });
      return res.end();
    }

    const userProfileId = access.profileId;

    // Build system prompt with proposal context
    const systemPrompt = createQASystemPrompt(
      proposalText || '',
      summaryText || '',
      filename || 'Unknown'
    );

    // Build conversation messages — trim to last 6 messages (3 exchanges)
    // to keep context manageable while preserving recent conversation
    let conversationMessages = [];
    if (messages.length > 6) {
      conversationMessages.push({
        role: 'user',
        content: '[Earlier conversation messages omitted for brevity. The proposal text and summary are in the system prompt above.]'
      });
      conversationMessages.push({
        role: 'assistant',
        content: 'Understood. I have the full proposal and summary available. How can I help?'
      });
      conversationMessages = conversationMessages.concat(messages.slice(-6));
    } else {
      conversationMessages = [...messages];
    }

    // Add the new question
    conversationMessages.push({ role: 'user', content: question });

    sendEvent('thinking', { message: 'Analyzing your question...' });

    const startTime = Date.now();
    const model = getModelForApp('qa');

    // Call Claude with streaming and web search
    const response = await callClaudeStreaming(apiKey, model, systemPrompt, conversationMessages, sendEvent);

    // Log usage (with cache token metrics for accurate cost calculation)
    if (response.usage) {
      logUsage({
        userProfileId,
        appName: 'qa',
        model: response.model || model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheCreationTokens: response.usage.cache_creation_input_tokens || 0,
        cacheReadTokens: response.usage.cache_read_input_tokens || 0,
        latencyMs: Date.now() - startTime,
      });
    }

    sendEvent('complete', {
      // Let client know if the turn was paused (response may be incomplete)
      ...(response.stopReason === 'pause_turn' ? { paused: true } : {}),
    });
  } catch (error) {
    console.error('Q&A streaming error:', error);
    sendEvent('error', { message: error.message || 'Failed to process question' });
  } finally {
    res.end();
  }
}

/**
 * Call Claude API with streaming, relay text deltas to client via SSE.
 * Supports web_search server-side tool (executed by the API automatically).
 * Retries once on 429.
 */
async function callClaudeStreaming(apiKey, model, systemPrompt, messages, sendEvent, retryCount = 0) {
  const response = await fetch(BASE_CONFIG.CLAUDE.API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey.trim(),
      'anthropic-version': BASE_CONFIG.CLAUDE.ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0.4,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages,
      stream: true,
      tools: [
        {
          type: 'web_search_20260209',
          name: 'web_search',
          max_uses: 3,
        },
        // code_execution is auto-injected by web_search_20260209 for dynamic filtering
      ],
    }),
  });

  // Handle non-streaming errors
  if (!response.ok) {
    const errorText = await response.text();

    // Retry once on 429
    if (response.status === 429 && retryCount === 0) {
      const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10);
      const delay = Math.min(retryAfter * 1000, 30000);
      sendEvent('thinking', { message: 'Rate limited, retrying...' });
      await new Promise(resolve => setTimeout(resolve, delay));
      return callClaudeStreaming(apiKey, model, systemPrompt, messages, sendEvent, 1);
    }

    console.error(`Claude API error ${response.status}:`, errorText.substring(0, 500));
    throw new Error(getApiErrorMessage(response.status, errorText));
  }

  // Parse streaming response
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let usage = null;
  let responseModel = null;
  let sentSearchEvent = false;
  const sources = []; // Collect web search source URLs for citations
  let stopReason = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;

      let event;
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }

      switch (event.type) {
        case 'message_start':
          if (event.message?.model) responseModel = event.message.model;
          if (event.message?.usage) usage = { ...event.message.usage };
          break;

        case 'content_block_start':
          // Detect web search tool use
          if (event.content_block?.type === 'server_tool_use' && !sentSearchEvent) {
            sendEvent('thinking', { message: 'Searching the web...' });
            sentSearchEvent = true;
          }
          // Extract source URLs from web search results
          if (event.content_block?.type === 'web_search_tool_result') {
            const results = event.content_block.content;
            if (Array.isArray(results)) {
              for (const r of results) {
                if (r.type === 'web_search_result' && r.url) {
                  // Deduplicate by URL
                  if (!sources.some(s => s.url === r.url)) {
                    sources.push({ url: r.url, title: r.title || '' });
                  }
                }
              }
            }
          }
          break;

        case 'content_block_delta':
          if (event.delta?.type === 'text_delta' && event.delta.text) {
            // Check for inline citations attached to text deltas
            if (event.delta.citations) {
              for (const cite of event.delta.citations) {
                if (cite.url && !sources.some(s => s.url === cite.url)) {
                  sources.push({
                    url: cite.url,
                    title: cite.title || '',
                    cited_text: cite.cited_text || '',
                  });
                }
              }
            }
            sendEvent('text_delta', { text: event.delta.text });
          }
          break;

        case 'message_delta':
          if (event.usage) {
            usage = { ...usage, ...event.usage };
          }
          if (event.delta?.stop_reason) {
            stopReason = event.delta.stop_reason;
          }
          break;
      }
    }
  }

  // Send collected sources to client if any were found
  if (sources.length > 0) {
    sendEvent('sources', { sources });
  }

  return { usage, model: responseModel, stopReason };
}

function getApiErrorMessage(status, responseText) {
  switch (status) {
    case 429:
      return 'Rate limit exceeded. Please wait a moment and try again.';
    case 529:
    case 503:
      return 'Claude API is temporarily overloaded. Please try again in a minute.';
    case 401:
      return 'API authentication failed. Please contact an administrator.';
    case 400: {
      if (responseText.includes('context_length_exceeded') || responseText.includes('too many tokens')) {
        return 'Conversation is too long. Please start a new chat.';
      }
      return 'Request error. Please try again.';
    }
    default:
      return `API error (${status}). Please try again.`;
  }
}
