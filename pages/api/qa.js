import { CONFIG, PROMPTS } from '../../lib/config';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { question, conversationHistory, proposalData, apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key required' });
    }

    if (!question || !proposalData) {
      return res.status(400).json({ error: 'Question and proposal data required' });
    }

    const answer = await generateQAResponse(question, conversationHistory, proposalData, apiKey);
    
    res.status(200).json({ answer });

  } catch (error) {
    console.error('Q&A API error:', error);
    res.status(500).json({ error: error.message });
  }
}

async function generateQAResponse(question, conversationHistory, proposalData, apiKey) {
  try {
    // Prepare proposal context
    const proposalContext = Object.values(proposalData)
      .map(result => result.formatted)
      .join('\n\n---\n\n');

    // Build conversation context
    const recentMessages = conversationHistory.slice(-6); // Last 3 Q&A pairs
    const conversationContext = recentMessages
      .map(msg => `${msg.type === 'user' ? 'Human' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');

    const qaPrompt = PROMPTS.QA_SYSTEM(proposalContext, conversationContext, question);

    const response = await fetch(CONFIG.CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': CONFIG.ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model: CONFIG.CLAUDE_MODEL,
        max_tokens: CONFIG.QA_MAX_TOKENS,
        temperature: CONFIG.QA_TEMPERATURE,
        messages: [{
          role: 'user',
          content: qaPrompt
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return data.content[0].text;

  } catch (error) {
    console.error('Q&A generation error:', error);
    throw new Error(`Failed to generate Q&A response: ${error.message}`);
  }
}
