import { createClaudeClient } from '../../shared/api/handlers/claudeClient';
import { BASE_CONFIG, getModelForApp } from '../../shared/config/baseConfig';
import { getApiKeyManager } from '../../shared/utils/apiKeyManager';
import { applySecurityMiddleware } from '../../shared/api/middleware/security';
import { nextRateLimiter } from '../../shared/api/middleware/rateLimiter';

// Q&A prompt template
const QA_PROMPT = (context, question, filename) => `You are an expert research assistant helping analyze a research proposal. Based on the document content provided, please answer the question thoroughly and accurately.

**Document**: ${filename}

**Question**: ${question}

**Document Content**:
${context.substring(0, 10000)}${context.length > 10000 ? '...[truncated]' : ''}

Please provide a comprehensive, accurate answer based solely on the information in the document. If the document doesn't contain enough information to fully answer the question, please say so and explain what additional information would be needed.

Focus on being helpful, accurate, and specific in your response.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Apply security middleware
    const securityCheck = await applySecurityMiddleware(req, res);
    if (!securityCheck) {
      return;
    }

    // Apply rate limiting (more lenient for Q&A)
    const rateLimitCheck = await nextRateLimiter({ 
      max: 60, 
      windowMs: 60000 
    })(req, res);
    if (!rateLimitCheck) {
      return;
    }

    const { question, context, filename, apiKey: clientApiKey } = req.body;

    if (!question || !context) {
      return res.status(400).json({ 
        error: 'Question and proposal data required',
        timestamp: new Date().toISOString()
      });
    }

    // Get API key (prefer server-side, fall back to client)
    const apiKeyManager = getApiKeyManager();
    let apiKey;
    
    try {
      apiKey = apiKeyManager.selectApiKey(clientApiKey || req.apiKey);
    } catch (error) {
      return res.status(401).json({ 
        error: BASE_CONFIG.ERROR_MESSAGES.NO_API_KEY,
        timestamp: new Date().toISOString()
      });
    }

    // Initialize Claude client
    const claudeClient = createClaudeClient(apiKey, {
      model: getModelForApp('qa'),
      defaultMaxTokens: 1500,
      defaultTemperature: 0.3,
    });

    // Generate Q&A response
    const prompt = QA_PROMPT(context, question, filename);
    const answer = await claudeClient.sendMessage(prompt, {
      maxTokens: 1500,
      temperature: 0.3
    });
    
    res.status(200).json({ 
      answer,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Q&A API error:', error);
    res.status(500).json({ 
      error: BASE_CONFIG.ERROR_MESSAGES.PROCESSING_FAILED,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
}
