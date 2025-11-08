/**
 * Shared Claude API client for all document processing apps
 * Provides standardized Claude API interactions with error handling
 */

export class ClaudeClient {
  constructor(apiKey, config = {}) {
    this.apiKey = apiKey;
    this.config = {
      apiUrl: config.apiUrl || 'https://api.anthropic.com/v1/messages',
      anthropicVersion: config.anthropicVersion || '2023-06-01',
      model: config.model || 'claude-sonnet-4-20250514',
      defaultMaxTokens: config.defaultMaxTokens || 2000,
      defaultTemperature: config.defaultTemperature || 0.3,
      ...config
    };
  }

  /**
   * Send a message to Claude API with retry logic
   * @param {string} prompt - The prompt to send
   * @param {Object} options - Additional options (maxTokens, temperature, etc.)
   * @returns {Promise<string>} - The response text
   */
  async sendMessage(prompt, options = {}) {
    const maxTokens = options.maxTokens || this.config.defaultMaxTokens;
    const temperature = options.temperature || this.config.defaultTemperature;
    const maxRetries = options.maxRetries || 3;
    const initialDelay = options.retryDelay || 2000; // Start with 2 seconds

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(this.config.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey.trim(),
            'anthropic-version': this.config.anthropicVersion
          },
          body: JSON.stringify({
            model: this.config.model,
            max_tokens: maxTokens,
            temperature: temperature,
            messages: [{
              role: 'user',
              content: prompt
            }]
          })
        });

        if (!response.ok) {
          const errorText = await response.text();

          // Check if it's a retryable error (429 rate limit or 529 overloaded)
          if ((response.status === 429 || response.status === 529) && attempt < maxRetries) {
            const delay = initialDelay * Math.pow(2, attempt); // Exponential backoff
            console.warn(`Claude API ${response.status === 529 ? 'overloaded' : 'rate limited'} (attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue; // Retry
          }

          console.error('Claude API error:', errorText);
          throw new Error(`Claude API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        return data.content[0].text;

      } catch (error) {
        // If it's the last attempt or not a network error, throw
        if (attempt === maxRetries || !error.message.includes('fetch')) {
          console.error('Claude API request failed:', error);
          throw new Error(`Failed to communicate with Claude: ${error.message}`);
        }

        // Network error - retry with backoff
        const delay = initialDelay * Math.pow(2, attempt);
        console.warn(`Network error (attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Send a message and parse JSON response
   * @param {string} prompt - The prompt to send
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - Parsed JSON response
   */
  async sendMessageForJSON(prompt, options = {}) {
    const response = await this.sendMessage(prompt, {
      ...options,
      temperature: 0.1 // Lower temperature for structured data
    });

    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(response);
    } catch (error) {
      console.warn('Failed to parse JSON response:', error);
      throw new Error('Failed to parse structured data from response');
    }
  }

  /**
   * Send a message with vision capabilities (for image analysis) with retry logic
   * @param {Array} messages - Array of message objects with content that can include images
   * @param {Object} options - Additional options (maxTokens, temperature, etc.)
   * @returns {Promise<string>} - The response text
   */
  async sendMessageWithVision(messages, options = {}) {
    const maxTokens = options.maxTokens || this.config.defaultMaxTokens;
    const temperature = options.temperature || this.config.defaultTemperature;
    const maxRetries = options.maxRetries || 3;
    const initialDelay = options.retryDelay || 2000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(this.config.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey.trim(),
            'anthropic-version': this.config.anthropicVersion
          },
          body: JSON.stringify({
            model: this.config.model,
            max_tokens: maxTokens,
            temperature: temperature,
            messages: messages
          })
        });

        if (!response.ok) {
          const errorText = await response.text();

          // Check if it's a retryable error (429 rate limit or 529 overloaded)
          if ((response.status === 429 || response.status === 529) && attempt < maxRetries) {
            const delay = initialDelay * Math.pow(2, attempt);
            console.warn(`Claude Vision API ${response.status === 529 ? 'overloaded' : 'rate limited'} (attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }

          console.error('Claude Vision API error:', errorText);
          throw new Error(`Claude API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        return data.content[0].text;

      } catch (error) {
        if (attempt === maxRetries || !error.message.includes('fetch')) {
          console.error('Claude Vision API request failed:', error);
          throw new Error(`Failed to communicate with Claude Vision: ${error.message}`);
        }

        const delay = initialDelay * Math.pow(2, attempt);
        console.warn(`Network error (attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Stream a response from Claude API (for long-running operations)
   * Note: Claude API doesn't support streaming yet, this is a placeholder
   * @param {string} prompt - The prompt to send
   * @param {Object} options - Additional options
   * @param {Function} onProgress - Callback for progress updates
   */
  async streamMessage(prompt, options = {}, onProgress = null) {
    // For now, just send the message normally
    // When Claude supports streaming, this can be updated
    if (onProgress) {
      onProgress({ status: 'processing', progress: 50 });
    }

    const result = await this.sendMessage(prompt, options);

    if (onProgress) {
      onProgress({ status: 'complete', progress: 100 });
    }

    return result;
  }
}

/**
 * Factory function to create a Claude client
 * @param {string} apiKey - Claude API key
 * @param {Object} config - Configuration options
 * @returns {ClaudeClient} - Claude client instance
 */
export function createClaudeClient(apiKey, config = {}) {
  return new ClaudeClient(apiKey, config);
}