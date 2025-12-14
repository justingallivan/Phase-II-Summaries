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
  static MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
  static FALLBACK_MODEL = 'claude-3-haiku-20240307';
  static MAX_TOKENS = 4096;

  /**
   * Stage 1: Analyze proposal and generate reviewer suggestions + search queries
   *
   * @param {string} proposalText - Full text of the proposal
   * @param {string} apiKey - User's Claude API key
   * @param {Object} options - Additional options
   * @param {string} options.additionalNotes - User-provided context
   * @param {string[]} options.excludedNames - Names to exclude (COI)
   * @param {Function} options.onProgress - Progress callback
   * @returns {Promise<Object>} Analysis result with suggestions and queries
   */
  static async analyzeProposal(proposalText, apiKey, options = {}) {
    const {
      additionalNotes = '',
      excludedNames = [],
      onProgress = () => {}
    } = options;

    onProgress({ stage: 'analysis', status: 'starting', message: 'Starting proposal analysis...' });

    const prompt = createAnalysisPrompt(proposalText, additionalNotes, excludedNames);

    try {
      const response = await this.callClaude(prompt, apiKey);

      if (DEBUG) {
        console.log('[ClaudeReviewerService] Response length:', response?.length || 0);
        console.log('[ClaudeReviewerService] Response preview:', response?.substring(0, 300));
      }

      onProgress({ stage: 'analysis', status: 'parsing', message: 'Parsing Claude response...' });

      const result = parseAnalysisResponse(response);

      if (DEBUG) {
        console.log('[ClaudeReviewerService] Parsed suggestions:', result.reviewerSuggestions?.length);
        console.log('[ClaudeReviewerService] Parsed queries:', JSON.stringify(result.searchQueries));
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
        validation
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
  static async generateDiscoveredReasoning(proposalInfo, candidates, apiKey, onProgress = () => {}) {
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
        const response = await this.callClaude(prompt, apiKey, 1024);

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
        }

        results.push(...enhanced);
      } catch (error) {
        console.error(`Error generating reasoning for batch ${batchNum}:`, error.message);
        // Add candidates without reasoning rather than failing entirely
        results.push(...batch.map(c => ({
          ...c,
          generatedReasoning: 'Reasoning generation failed',
          seniorityEstimate: 'Unknown'
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
   * @returns {Promise<string>} Claude's response text
   */
  static async callClaude(prompt, apiKey, maxTokens = this.MAX_TOKENS) {
    if (!apiKey) {
      throw new Error('Claude API key is required');
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

        return await this._makeClaudeRequest(prompt, apiKey, maxTokens, this.MODEL);
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
      const result = await this._makeClaudeRequest(prompt, apiKey, maxTokens, this.FALLBACK_MODEL);
      console.log(`[ClaudeReviewerService] Fallback model succeeded`);
      return result;
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
   * @returns {Promise<string>} Claude's response text
   */
  static async _makeClaudeRequest(prompt, apiKey, maxTokens, model) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: maxTokens,
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
    if (!apiKey) {
      throw new Error('Claude API key is required');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
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
