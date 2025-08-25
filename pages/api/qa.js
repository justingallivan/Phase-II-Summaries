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

    const qaPrompt = `You are an AI research assistant helping analyze a research proposal. You have access to web search capabilities and should use them when needed to provide comprehensive, accurate answers.

**Research Proposal Context:**
${proposalContext}

**Previous Conversation:**
${conversationContext}

**Current Question:** ${question}

**Instructions:**
- Answer the question thoroughly and accurately
- Reference specific details from the proposal when relevant
- If the question requires current information, recent research, or context not in the proposal, mention that you would need to search for additional information
- Provide balanced, objective analysis
- If you're uncertain about technical details, acknowledge the limitations
- Keep responses conversational but informative
- Cite specific sections of the proposal when referencing them

Please provide a comprehensive answer to the question.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        temperature: 0.4,
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
