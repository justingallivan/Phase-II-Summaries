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
  SUMMARIZATION: (text, summaryLength = 2, summaryLevel = 'technical-non-expert') => {
    // Map summary levels to descriptions
    const levelDescriptions = {
      'general-audience': 'general audience (avoiding technical jargon, explaining concepts in accessible terms)',
      'technical-non-expert': 'technical non-expert audience (using some technical terms but explaining complex concepts clearly)',
      'technical-expert': 'technical expert audience (using field-specific terminology and assuming domain knowledge)',
      'academic': 'academic/scientific audience (using precise scientific language and detailed methodology descriptions)'
    };

    const targetAudience = levelDescriptions[summaryLevel] || levelDescriptions['technical-non-expert'];
    
    return `Please analyze this research proposal and create a comprehensive ${summaryLength}-page summary written for a ${targetAudience}. Follow the exact format and style of the examples below. Use clear, professional language with bullet points for the Executive Summary section and paragraphs for other sections.

**LENGTH REQUIREMENT:** The summary should be approximately ${summaryLength} page${summaryLength > 1 ? 's' : ''} when printed (roughly ${summaryLength * 500} words).

**AUDIENCE LEVEL:** Write for a ${targetAudience}.

**TONE AND LANGUAGE RULES:**
- Use neutral, matter-of-fact language - avoid promotional or effusive terms
- Avoid unnecessary adjectives like "technical", "deep", "rigorous", "proper", "comprehensive", "excellent", "outstanding"
- Write in a straightforward, academic tone similar to scientific review documents
- Use the active voice
- State facts and qualifications directly without embellishment
- Focus on what the researchers do/study rather than how well they do it

**FORMATTING RULES:**
- Principal Investigator names should be underlined using HTML tags <u>Name</u>
- Academic titles should be lowercase (professor, associate professor, assistant professor)  
- Use format: "The principal investigator is <u>John Smith</u>, a professor of biology at [institution]..."
- Co-investigators should also be underlined when mentioned by name using <u>Name</u> tags


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

Write in a neutral, factual tone. Avoid promotional language or unnecessary adjectives. State information directly and let the science speak for itself.`;
  },

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

Please provide a comprehensive answer to the question.`,

  PEER_REVIEW_ANALYSIS: (reviewTexts) => `Please analyze these peer review documents and provide a comprehensive summary in markdown format. I will provide you with ${reviewTexts.length} peer review document(s).

**INSTRUCTIONS:**

Please create TWO separate markdown outputs:

**OUTPUT 1 - SUMMARY:**

1. **Review Count**: Start with "We received ${reviewTexts.length} review${reviewTexts.length > 1 ? 's' : ''}"

2. **Grade Summary**: Write a sentence summarizing the grades/ratings from the reviews. Look for ratings like Excellent, Very Good, Good, Fair, Poor, or numerical scores. If reviewers provide mixed ratings (like "Excellent/Very Good"), note those. Example: "The proposal received two reviews of Excellent, one of Very Good, and one mixed rating of Good/Fair."

3. **Reviewer Details**: Start with "The reviewers were " and list each reviewer's name underlined using <u>Name</u> format, followed by their institutional affiliation in parentheses. If names/affiliations cannot be determined, state "could not be determined from the review documents." After each reviewer, include their general area of expertise if it can be inferred (e.g., "has expertise in bioinformatics").

4. **Overall Tone & Themes**: Provide 2-3 sentences about the overall tone of the reviews and general themes that emerged across reviewers.

5. **Key Quotations**: Provide relevant quotations from each reviewer, ordered from most positive to most critical. Format as:
   - "The most positive reviewer said: '[quote]'"
   - "Another reviewer noted: '[quote]'" 
   - Continue for each reviewer...
   - "The most critical reviewer noted: '[quote]'"

**OUTPUT 2 - QUESTIONS:**

Create a separate section listing all questions, concerns, or issues raised by the reviewers. Format as a bulleted list.

---

**PEER REVIEW TEXTS:**

${reviewTexts.map((text, index) => `**Review ${index + 1}:**\n${text}\n\n---\n`).join('')}

Please provide both outputs as separate markdown sections.`,

  PEER_REVIEW_QUESTIONS: (reviewTexts) => `Please extract all questions, concerns, issues, and points requiring clarification that were raised by the peer reviewers in these ${reviewTexts.length} review document(s).

**INSTRUCTIONS:**
- Extract any explicit questions asked by reviewers
- Include concerns or issues that imply questions need to be addressed
- Include requests for clarification or additional information
- Format as a bulleted list in markdown
- Group similar questions/concerns together if appropriate
- If no clear questions are found, note "No specific questions were identified in the peer reviews"

**PEER REVIEW TEXTS:**

${reviewTexts.map((text, index) => `**Review ${index + 1}:**\n${text}\n\n---\n`).join('')}

Please provide the questions list in markdown format.`
};
