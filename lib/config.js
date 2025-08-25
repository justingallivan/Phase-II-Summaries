export const CONFIG = {
  // Claude API Configuration
  CLAUDE_MODEL: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
  CLAUDE_API_URL: 'https://api.anthropic.com/v1/messages',
  ANTHROPIC_VERSION: '2023-06-01',
  
  // Model Parameters
  DEFAULT_MAX_TOKENS: 2000,
  REFINEMENT_MAX_TOKENS: 2500,
  QA_MAX_TOKENS: 1500,
  
  // Temperature settings
  SUMMARIZATION_TEMPERATURE: 0.3,
  REFINEMENT_TEMPERATURE: 0.3,
  QA_TEMPERATURE: 0.4,
  
  // Processing limits
  PDF_SIZE_LIMIT: 50 * 1024 * 1024, // 50MB
  TEXT_TRUNCATE_LIMIT: 15000, // characters for summarization
  QA_TEXT_TRUNCATE_LIMIT: 10000, // characters for structured data extraction
};

export const PROMPTS = {
  SUMMARIZATION: (text) => `Please analyze this research proposal and create a comprehensive summary following the exact format and style of the examples below. Use clear, professional language with bullet points for the Executive Summary section and paragraphs for other sections.

**TONE AND LANGUAGE RULES:**
- Use neutral, matter-of-fact language - avoid promotional or effusive terms
- Avoid unnecessary adjectives like "technical", "deep", "rigorous", "proper", "comprehensive", "excellent", "outstanding"
- Write in a straightforward, academic tone similar to scientific review documents
- State facts and qualifications directly without embellishment
- Focus on what the researchers do/study rather than how well they do it

**FORMATTING RULES:**
- Principal Investigator names should be underlined in markdown using <u>Name</u> tags
- Academic titles should be lowercase (professor, associate professor, assistant professor)
- Use format: "The principal investigator is <u>John Smith</u>, a professor of biology at [institution]..."
- Co-investigators should also be underlined when mentioned by name


**EXECUTIVE SUMMARY FORMAT (use bullet points, 1-3 sentences each):**
• [Key scientific problem or question being addressed - explain in 1-3 sentences]
• [Main hypothesis, approach, or research objective - describe in 1-3 sentences]
• [Who is conducting the research and their key qualifications - summarize in 1-3 sentences]
• [Expected impact or significance of the results - elaborate in 1-3 sentences]
• [Why this research needs foundation support rather than traditional funding - justify in 1-3 sentences]


**OTHER SECTIONS FORMAT (use paragraphs):**

**Background & Impact**
[Paragraph explaining the scientific problem, current state of knowledge, and potential impact. Include specific technical details and context.]

**Methodology** 
[Paragraph describing the research approach, techniques, and experimental design. Be specific about methods and technical approaches.]

**Personnel**
[Paragraph identifying principal investigators, their expertise, and why they are qualified for this work. Include institutional affiliations. Format as: "The principal investigator is <u>[Name]</u>, a [lowercase title] at [institution]. Co-PI <u>[Name]</u> is an [lowercase title]..." State their areas of study and experience directly without promotional language.]

**Justification for Keck Funding**
[Paragraph explaining why traditional funding sources would not support this work, emphasizing risk, innovation, or speculative nature. Focus on the scientific rationale for foundation support rather than financial details.]

Research Proposal Text:
---
${text.substring(0, CONFIG.TEXT_TRUNCATE_LIMIT)} ${text.length > CONFIG.TEXT_TRUNCATE_LIMIT ? '...' : ''}

Write in a neutral, factual tone. Avoid promotional language or unnecessary adjectives. State information directly and let the science speak for itself.`,

  STRUCTURED_DATA_EXTRACTION: (text, filename) => `Based on this research proposal, please extract the following information and return it as a JSON object.

IMPORTANT: The filename "${filename}" may contain hints about the institution name. Use this information to help identify the correct institution.

{
  "filename": "${filename}",
  "institution": "Primary institution name (check filename for hints)",
  "principal_investigator": "Name of PI",
  "investigators": ["List", "of", "investigators"],
  "research_area": "Main research domain",
  "methods": ["List", "of", "key", "methods"],
  "funding_amount": "Amount requested if mentioned",
  "duration": "Project duration if mentioned",
  "keywords": ["Key", "research", "terms"]
}

Research text:
${text.substring(0, CONFIG.QA_TEXT_TRUNCATE_LIMIT)} ${text.length > CONFIG.QA_TEXT_TRUNCATE_LIMIT ? '...' : ''}

Return only the JSON object, no other text.`,

  REFINEMENT: (currentSummary, feedback) => `You are reviewing and improving a research proposal summary based on user feedback. 

**Current Summary:**
${currentSummary}

**User Feedback:**
${feedback}

**Instructions:**
- Carefully review the current summary and the user's feedback
- Make specific improvements based on the feedback provided
- Maintain the same professional tone and format structure
- Keep the same sections: Executive Summary (with bullet points), Background & Impact, Methodology, Personnel, Justification for Keck Funding
- Use the same formatting rules: underline investigator names with <u>Name</u> tags, lowercase titles
- Do not add fictional information - only reorganize, expand, or refine existing content
- If the feedback asks for information not present in the original, note that it would require the original proposal text

Please provide the refined summary maintaining the exact same format and structure.`,

  QA_SYSTEM: (proposalContext, conversationContext, question) => `You are an AI research assistant helping analyze a research proposal. You have access to web search capabilities and should use them when needed to provide comprehensive, accurate answers.

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

Please provide a comprehensive answer to the question.`
};
