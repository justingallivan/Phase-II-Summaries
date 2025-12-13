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

class ClaudeReviewerService {
  static MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
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

      // Debug: Log a snippet of the response to see what Claude returned
      console.log('Claude response length:', response?.length || 0);
      console.log('Claude response first 500 chars:', response?.substring(0, 500));
      console.log('Claude response contains REVIEWER:', response?.includes('REVIEWER:'));

      onProgress({ stage: 'analysis', status: 'parsing', message: 'Parsing Claude response...' });

      const result = parseAnalysisResponse(response);

      // Debug: Log parsing results
      console.log('Parsed reviewerSuggestions count:', result.reviewerSuggestions?.length);
      console.log('Parsed searchQueries:', JSON.stringify(result.searchQueries));

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

        // Debug: log the response to see what Claude returned
        console.log(`[Reasoning Batch ${batchNum}] Claude response:`, response?.substring(0, 500));

        const enhanced = parseDiscoveredReasoningResponse(response, batch);

        // Ensure all candidates have reasoning (fallback for parsing misses)
        for (const candidate of enhanced) {
          if (!candidate.generatedReasoning) {
            console.warn(`[Reasoning] No reasoning parsed for: ${candidate.name}`);
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
   * Call Claude API with a prompt
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

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.MODEL,
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
