/**
 * Usage Logger - Tracks per-user Claude API usage for billing and analytics
 *
 * Logs are fire-and-forget (non-blocking) to avoid impacting response latency.
 * Cost estimates are approximate based on published Anthropic pricing.
 */

import { sql } from '@vercel/postgres';

// Pricing per million tokens (in cents) — update when Anthropic changes pricing
const MODEL_PRICING = {
  // Anthropic
  'claude-opus-4':     { input: 1500, output: 7500 },
  'claude-sonnet-4':   { input: 300,  output: 1500 },
  'claude-haiku-4-5':  { input: 80,   output: 400  },
  'claude-haiku-3-5':  { input: 80,   output: 400  },
  'claude-3-5-haiku':  { input: 80,   output: 400  },
  'claude-3-haiku':    { input: 25,   output: 125  },
  // OpenAI
  'gpt-4o':            { input: 250,  output: 1000 },
  'gpt-4o-mini':       { input: 15,   output: 60   },
  'o1':                { input: 1500, output: 6000 },
  'o3-mini':           { input: 110,  output: 440  },
  // Google
  'gemini-2.0-flash':  { input: 10,   output: 40   },
  'gemini-2.5-pro':    { input: 125,  output: 1000 },
  'gemini-2.5-flash':  { input: 15,   output: 60   },
  // Perplexity
  'sonar-pro':         { input: 300,  output: 1500 },
  'sonar':             { input: 100,  output: 100  },
};

export function estimateCostCents(model, inputTokens, outputTokens, cacheCreationTokens = 0, cacheReadTokens = 0) {
  if (!model) return null;
  const tier = Object.keys(MODEL_PRICING).find(key => model.includes(key));
  if (!tier) return null;
  const pricing = MODEL_PRICING[tier];
  // Cache write: 1.25x base input price, cache read: 0.1x base input price
  const regularInputCost = inputTokens * pricing.input;
  const cacheWriteCost = cacheCreationTokens * pricing.input * 1.25;
  const cacheReadCost = cacheReadTokens * pricing.input * 0.1;
  const outputCost = outputTokens * pricing.output;
  return (regularInputCost + cacheWriteCost + cacheReadCost + outputCost) / 1_000_000;
}

/**
 * Log a Claude API usage event. Fire-and-forget — does not block the caller.
 *
 * @param {Object} params
 * @param {number|null} params.userProfileId - FK to user_profiles
 * @param {string} params.appName - e.g. 'batch-phase-ii', 'dynamics-explorer'
 * @param {string} params.model - e.g. 'claude-sonnet-4-20250514'
 * @param {number} params.inputTokens
 * @param {number} params.outputTokens
 * @param {number} [params.cacheCreationTokens] - Tokens written to prompt cache
 * @param {number} [params.cacheReadTokens] - Tokens read from prompt cache (10% cost)
 * @param {number} params.latencyMs
 * @param {string} params.status - 'success', 'error', 'rate_limited'
 * @param {string} params.errorMessage
 */
export function logUsage({ userProfileId, appName, model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, latencyMs, status, errorMessage }) {
  const cost = estimateCostCents(model, inputTokens || 0, outputTokens || 0, cacheCreationTokens || 0, cacheReadTokens || 0);

  sql`INSERT INTO api_usage_log
      (user_profile_id, app_name, model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, estimated_cost_cents, latency_ms, request_status, error_message)
      VALUES (${userProfileId || null}, ${appName}, ${model || null}, ${inputTokens || 0}, ${outputTokens || 0}, ${cacheCreationTokens || 0}, ${cacheReadTokens || 0}, ${cost}, ${latencyMs || null}, ${status || 'success'}, ${errorMessage || null})`
    .catch(err => console.warn('Usage log failed:', err.message));
}
