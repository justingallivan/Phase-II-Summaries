/**
 * ClaudeReviewerService - Stage 1 of Expert Reviewer Finder
 *
 * Handles Claude API calls for:
 * 1. Analyzing proposals and generating reviewer suggestions with reasoning
 * 2. Generating search queries for database discovery
 * 3. Generating reasoning for database-discovered candidates
 */

const {
  createAnalysisPrompt,
  parseAnalysisResponse,
  createDiscoveredReasoningPrompt,
  parseDiscoveredReasoningResponse,
  createProposalSummary,
  validateAnalysisResult
} = require('../../shared/config/prompts/reviewer-finder');
const { getModelForApp, getFallbackModelForApp } = require('../../shared/config/baseConfig');
const { logUsage } = require('../utils/usage-logger');

// Enable verbose logging only in development with DEBUG_REVIEWER_FINDER env var
const DEBUG = process.env.DEBUG_REVIEWER_FINDER === 'true';

// Retry configuration
const RETRY_CONFIG = {
  MAX_RETRIES: 2,           // Retries before falling back to backup model
  INITIAL_DELAY_MS: 1000,   // Start with 1 second delay
  MAX_DELAY_MS: 10000,      // Cap at 10 seconds
  BACKOFF_MULTIPLIER: 2     // Double delay each retry
};

class ClaudeReviewerService {
  static get MODEL() {
    return getModelForApp('reviewer-finder');
  }
  static get FALLBACK_MODEL() {
    return getFallbackModelForApp('reviewer-finder');
  }
  static MAX_TOKENS = 4096;

  /**
   * Stage 1: Analyze proposal and generate reviewer suggestions + search queries
   *
   * @param {string} proposalText - Full text of the proposal
   * @param {string} apiKey - User's Claude API key
   * @param {Object} options - Additional options
   * @param {string} options.additionalNotes - User-provided context
   * @param {string[]} options.excludedNames - Names to exclude (COI)
   * @param {number} options.temperature - Temperature for Claude (0.0-1.0, default 0.3)
   * @param {number} options.reviewerCount - Number of reviewers to suggest (default 12)
   * @param {Function} options.onProgress - Progress callback
   * @returns {Promise<Object>} Analysis result with suggestions and queries
   */
  static async analyzeProposal(proposalText, apiKey, options = {}) {
    const {
      additionalNotes = '',
      excludedNames = [],
      temperature = 0.3,
      reviewerCount = 12,
      onProgress = () => {},
      userProfileId = null,
    } = options;

    onProgress({ stage: 'analysis', status: 'starting', message: 'Starting proposal analysis...' });

    const prompt = createAnalysisPrompt(proposalText, additionalNotes, excludedNames, reviewerCount);
    const loggingContext = { userProfileId, appName: 'reviewer-finder' };

    try {
      const { text: response, usedFallback, model } = await this.callClaude(prompt, apiKey, this.MAX_TOKENS, temperature, loggingContext);

      if (usedFallback) {
        onProgress({
          stage: 'analysis',
          status: 'fallback',
          message: `Primary model overloaded, using fallback model (${model})`
        });
      }

      // Always log response info for debugging parsing issues
      console.log('[ClaudeReviewerService] Response length:', response?.length || 0);
      console.log('[ClaudeReviewerService] Response preview (first 500 chars):', response?.substring(0, 500));
      console.log('[ClaudeReviewerService] Contains "REVIEWER:"?', response?.includes('REVIEWER:'));
      console.log('[ClaudeReviewerService] Contains "NAME:"?', response?.includes('NAME:'));

      onProgress({ stage: 'analysis', status: 'parsing', message: 'Parsing Claude response...' });

      const result = parseAnalysisResponse(response);

      // Always log parsing results for debugging
      console.log('[ClaudeReviewerService] Parsed suggestions:', result.reviewerSuggestions?.length);
      console.log('[ClaudeReviewerService] First suggestion:', result.reviewerSuggestions?.[0]?.name);
      if (result.reviewerSuggestions?.length === 0) {
        console.log('[ClaudeReviewerService] WARNING: No suggestions parsed! Response snippet around PART 2:');
        const part2Index = response?.indexOf('PART 2');
        if (part2Index > -1) {
          console.log(response?.substring(part2Index, part2Index + 1000));
        }
      }

      // Validate the result
      const validation = validateAnalysisResult(result);
      if (!validation.valid) {
        console.warn('Analysis validation issues:', validation.issues);
      }

      onProgress({
        stage: 'analysis',
        status: 'complete',
        message: `Found ${result.reviewerSuggestions.length} suggestions, ${Object.values(result.searchQueries).flat().length} queries`,
        data: {
          suggestionCount: result.reviewerSuggestions.length,
          queryCount: Object.values(result.searchQueries).flat().length
        }
      });

      return {
        success: true,
        ...result,
        validation,
        usedFallback,
        model
      };
    } catch (error) {
      onProgress({ stage: 'analysis', status: 'error', message: error.message });
      throw error;
    }
  }

  /**
   * Stage 2 Helper: Generate reasoning for database-discovered candidates
   *
   * @param {Object} proposalInfo - Extracted proposal metadata
   * @param {Array} candidates - Discovered candidates with publications
   * @param {string} apiKey - User's Claude API key
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Array>} Candidates with generated reasoning
   */
  static async generateDiscoveredReasoning(proposalInfo, candidates, apiKey, onProgress = () => {}, userProfileId = null) {
    if (!candidates || candidates.length === 0) {
      return [];
    }

    onProgress({
      stage: 'reasoning',
      status: 'starting',
      message: `Generating reasoning for ${candidates.length} discovered candidates...`
    });

    // Process in batches of 10 to avoid token limits
    const BATCH_SIZE = 10;
    const results = [];
    let anyBatchUsedFallback = false;

    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(candidates.length / BATCH_SIZE);

      onProgress({
        stage: 'reasoning',
        status: 'processing',
        message: `Processing batch ${batchNum}/${totalBatches}...`
      });

      const proposalSummary = createProposalSummary(proposalInfo);
      const prompt = createDiscoveredReasoningPrompt(proposalSummary, batch);

      try {
        const loggingContext = { userProfileId, appName: 'reviewer-finder' };
        const { text: response, usedFallback, model } = await this.callClaude(prompt, apiKey, 1024, 0.3, loggingContext);

        if (usedFallback) {
          anyBatchUsedFallback = true;
          onProgress({
            stage: 'reasoning',
            status: 'fallback',
            message: `Batch ${batchNum}: Primary model overloaded, using fallback (${model})`
          });
        }

        if (DEBUG) {
          console.log(`[ClaudeReviewerService] Reasoning batch ${batchNum}:`, response?.substring(0, 300));
        }

        const enhanced = parseDiscoveredReasoningResponse(response, batch);

        // Ensure all candidates have reasoning (fallback for parsing misses)
        for (const candidate of enhanced) {
          if (!candidate.generatedReasoning) {
            if (DEBUG) {
              console.warn(`[ClaudeReviewerService] No reasoning parsed for: ${candidate.name}`);
            }
            candidate.generatedReasoning = 'Reasoning not available';
            candidate.isRelevant = true; // Assume relevant if we couldn't parse
          }
          // Mark if this candidate's reasoning came from fallback model
          if (usedFallback) {
            candidate.reasoningFromFallback = true;
          }
        }

        results.push(...enhanced);
      } catch (error) {
        console.error(`Error generating reasoning for batch ${batchNum}:`, error.message);
        // Add candidates without reasoning rather than failing entirely
        results.push(...batch.map(c => ({
          ...c,
          generatedReasoning: 'Reasoning generation failed',
          seniorityEstimate: 'Unknown',
          reasoningFailed: true
        })));
      }

      // Small delay between batches to avoid rate limits
      if (i + BATCH_SIZE < candidates.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    onProgress({
      stage: 'reasoning',
      status: 'complete',
      message: `Generated reasoning for ${results.length} candidates`
    });

    return results;
  }

  /**
   * Call Claude API with a prompt (with retry logic and fallback model)
   *
   * Retry strategy:
   * 1. Try primary model up to MAX_RETRIES times with exponential backoff
   * 2. If all retries fail, try fallback model (Haiku) once
   * 3. If fallback fails, throw the error
   *
   * @param {string} prompt - The prompt to send
   * @param {string} apiKey - User's Claude API key
   * @param {number} maxTokens - Maximum tokens for response
   * @param {number} temperature - Temperature for response (0.0-1.0, default 0.3)
   * @returns {Promise<{text: string, usedFallback: boolean, model: string}>} Response with metadata
   */
  static async callClaude(prompt, apiKey, maxTokens = this.MAX_TOKENS, temperature = 0.3, loggingContext = null) {
    const resolvedKey = apiKey || process.env.CLAUDE_API_KEY;
    if (!resolvedKey) {
      throw new Error('Claude API key not configured on server');
    }

    let lastError = null;
    let delay = RETRY_CONFIG.INITIAL_DELAY_MS;

    // Try primary model with retries
    for (let attempt = 0; attempt <= RETRY_CONFIG.MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[ClaudeReviewerService] Retry attempt ${attempt}/${RETRY_CONFIG.MAX_RETRIES} after ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay = Math.min(delay * RETRY_CONFIG.BACKOFF_MULTIPLIER, RETRY_CONFIG.MAX_DELAY_MS);
        }

        const text = await this._makeClaudeRequest(prompt, resolvedKey, maxTokens, this.MODEL, temperature, loggingContext);
        return { text, usedFallback: false, model: this.MODEL };
      } catch (error) {
        lastError = error;
        const isOverloaded = error.message?.toLowerCase().includes('overloaded') ||
                            error.message?.toLowerCase().includes('rate limit') ||
                            error.message?.toLowerCase().includes('529') ||
                            error.message?.toLowerCase().includes('503');

        if (!isOverloaded) {
          // Non-retryable error, throw immediately
          throw error;
        }

        console.warn(`[ClaudeReviewerService] Primary model attempt ${attempt + 1} failed:`, error.message);
      }
    }

    // All retries failed, try fallback model
    console.log(`[ClaudeReviewerService] Primary model failed after ${RETRY_CONFIG.MAX_RETRIES + 1} attempts, trying fallback model (${this.FALLBACK_MODEL})...`);

    try {
      const text = await this._makeClaudeRequest(prompt, resolvedKey, maxTokens, this.FALLBACK_MODEL, temperature, loggingContext);
      console.log(`[ClaudeReviewerService] Fallback model succeeded`);
      return { text, usedFallback: true, model: this.FALLBACK_MODEL };
    } catch (fallbackError) {
      console.error(`[ClaudeReviewerService] Fallback model also failed:`, fallbackError.message);
      // Throw the original error as it's more informative
      throw lastError || fallbackError;
    }
  }

  /**
   * Make a single Claude API request
   *
   * @param {string} prompt - The prompt to send
   * @param {string} apiKey - User's Claude API key
   * @param {number} maxTokens - Maximum tokens for response
   * @param {string} model - Model to use
   * @param {number} temperature - Temperature (0.0-1.0, default 0.3)
   * @returns {Promise<string>} Claude's response text
   */
  static async _makeClaudeRequest(prompt, apiKey, maxTokens, model, temperature = 0.3, loggingContext = null) {
    const startTime = Date.now();
    const resolvedKey = apiKey || process.env.CLAUDE_API_KEY;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': resolvedKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: maxTokens,
        temperature: temperature,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error?.message ||
        `Claude API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    if (!data.content || !data.content[0]?.text) {
      throw new Error('Invalid response from Claude API');
    }

    if (loggingContext) {
      logUsage({
        userProfileId: loggingContext.userProfileId,
        appName: loggingContext.appName || 'reviewer-finder',
        model: data.model,
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
        latencyMs: Date.now() - startTime,
      });
    }

    return data.content[0].text;
  }

  /**
   * Stream Claude API response (for real-time progress)
   * Used when we want to show partial results as they come in
   *
   * @param {string} prompt - The prompt to send
   * @param {string} apiKey - User's Claude API key
   * @param {Function} onChunk - Callback for each text chunk
   * @returns {Promise<string>} Complete response text
   */
  static async streamClaude(prompt, apiKey, onChunk = () => {}) {
    const resolvedKey = apiKey || process.env.CLAUDE_API_KEY;
    if (!resolvedKey) {
      throw new Error('Claude API key not configured on server');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': resolvedKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.MODEL,
        max_tokens: this.MAX_TOKENS,
        stream: true,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error?.message ||
        `Claude API error: ${response.status} ${response.statusText}`
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              fullText += parsed.delta.text;
              onChunk(parsed.delta.text);
            }
          } catch {
            // Ignore JSON parse errors for incomplete chunks
          }
        }
      }
    }

    return fullText;
  }
}

module.exports = { ClaudeReviewerService };
