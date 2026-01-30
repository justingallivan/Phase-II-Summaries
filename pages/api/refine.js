import { createClaudeClient } from '../../shared/api/handlers/claudeClient';
import { BASE_CONFIG, getModelForApp } from '../../shared/config/baseConfig';
import { getApiKeyManager } from '../../shared/utils/apiKeyManager';
import { applySecurityMiddleware } from '../../shared/api/middleware/security';
import { nextRateLimiter } from '../../shared/api/middleware/rateLimiter';
import { requireAuth } from '../../lib/utils/auth';

// Refinement prompt template
const REFINEMENT_PROMPT = (currentSummary, feedback) => `Please refine the following research proposal summary based on the specific feedback provided. Maintain the same structure and level of detail, but improve the content according to the feedback.

**Original Summary:**
${currentSummary}

**Feedback for improvement:**
${feedback}

**Instructions:**
- Keep the same overall structure and formatting
- Use proper markdown formatting: <u>underlines</u> for names, **bold** for emphasis, *italics* for secondary emphasis
- Incorporate the feedback to improve clarity, accuracy, or completeness
- Maintain the professional tone and technical accuracy
- If the feedback requests specific changes, implement them while keeping the rest of the summary intact
- If the feedback is unclear or contradictory, make reasonable improvements based on your best interpretation

Please provide the refined summary:`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require authentication
  const session = await requireAuth(req, res);
  if (!session) return;

  try {
    // Apply security middleware
    const securityCheck = await applySecurityMiddleware(req, res);
    if (!securityCheck) {
      return;
    }

    // Apply rate limiting
    const rateLimitCheck = await nextRateLimiter({ 
      max: 30, 
      windowMs: 60000 
    })(req, res);
    if (!rateLimitCheck) {
      return;
    }

    const { currentSummary, feedback, apiKey: clientApiKey } = req.body;

    if (!currentSummary || !feedback) {
      return res.status(400).json({ 
        error: 'Current summary and feedback required',
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
      model: getModelForApp('refine'),
      defaultMaxTokens: 3000,
      defaultTemperature: 0.3,
    });

    // Generate refined summary
    const prompt = REFINEMENT_PROMPT(currentSummary, feedback);
    const refinedSummary = await claudeClient.sendMessage(prompt, {
      maxTokens: 3000,
      temperature: 0.3
    });
    
    res.status(200).json({ 
      refinedSummary,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Refinement API error:', error);
    res.status(500).json({ 
      error: BASE_CONFIG.ERROR_MESSAGES.PROCESSING_FAILED,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
}

