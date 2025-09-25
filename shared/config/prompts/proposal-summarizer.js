/**
 * Prompt templates for the Proposal Summarizer app
 * Used for creating Phase II writeup drafts from research proposals
 */

/**
 * Main summarization prompt for research proposals
 * @param {string} text - The proposal text to summarize
 * @param {number} textLimit - Maximum characters to process
 * @returns {string} - The formatted prompt
 */
export function createSummarizationPrompt(text, textLimit = 15000) {
  return `Please analyze this research proposal and create a comprehensive summary following the exact format and style of the examples below. Use clear, professional language with bullet points for the Executive Summary section and paragraphs for other sections.

**TONE AND LANGUAGE RULES:**
- Use neutral, matter-of-fact language - avoid promotional or effusive terms
- Avoid unnecessary adjectives like "technical", "deep", "rigorous", "proper", "comprehensive", "excellent", "outstanding"
- Write in a straightforward, academic tone similar to scientific review documents
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
${text.substring(0, textLimit)} ${text.length > textLimit ? '...' : ''}

Write in a neutral, factual tone. Avoid promotional language or unnecessary adjectives. State information directly and let the science speak for itself.`;
}

/**
 * Structured data extraction prompt
 * @param {string} text - The proposal text
 * @param {string} filename - The filename (may contain institution hints)
 * @param {number} textLimit - Maximum characters to process
 * @returns {string} - The extraction prompt
 */
export function createStructuredDataExtractionPrompt(text, filename, textLimit = 10000) {
  return `Based on this research proposal, please extract the following information and return it as a JSON object.

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
${text.substring(0, textLimit)} ${text.length > textLimit ? '...' : ''}

Return only the JSON object, no other text.`;
}

/**
 * Refinement prompt for improving summaries based on feedback
 * @param {string} currentSummary - The current summary to refine
 * @param {string} feedback - User feedback for improvement
 * @returns {string} - The refinement prompt
 */
export function createRefinementPrompt(currentSummary, feedback) {
  return `You are reviewing and improving a research proposal summary based on user feedback. 

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

Please provide the refined summary maintaining the exact same format and structure.`;
}

/**
 * Q&A prompt for answering questions about proposals
 * @param {string} proposalContext - The proposal context/summary
 * @param {string} conversationContext - Previous conversation history
 * @param {string} question - The user's question
 * @returns {string} - The Q&A prompt
 */
export function createQAPrompt(proposalContext, conversationContext, question) {
  return `You are an AI research assistant helping analyze a research proposal. You have access to web search capabilities and should use them when needed to provide comprehensive, accurate answers.

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
}

/**
 * Extract institution name from filename
 * @param {string} filename - The filename to parse
 * @returns {string|null} - Extracted institution or null
 */
export function extractInstitutionFromFilename(filename) {
  if (!filename) return null;
  
  // Remove file extension and common suffixes
  const cleaned = filename
    .replace(/\.(pdf|docx?|txt)$/i, '')
    .replace(/_Phase_[I-V]+_.*$/i, '')
    .replace(/_SE_.*$/i, '')
    .replace(/_Staff.*$/i, '')
    .replace(/_/g, ' ')
    .trim();
  
  return cleaned || null;
}

/**
 * Format summary with enhanced markdown
 * @param {string} summary - The raw summary text
 * @param {string} filename - The filename for metadata
 * @returns {string} - Formatted markdown summary
 */
export function enhanceFormatting(summary, filename) {
  const institution = extractInstitutionFromFilename(filename) || 'Research Institution';
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  
  let formatted = `# ${institution}\n`;
  formatted += `Phase II Review: ${date}\n\n`;
  formatted += `**Filename:** ${filename}\n`;
  formatted += `**Date Processed:** ${new Date().toLocaleDateString()}\n\n`;
  formatted += '---\n\n';
  
  // Process the summary with proper section headers
  let processedSummary = summary
    .replace(/\*\*Executive Summary\*\*/g, '## Executive Summary')
    .replace(/\*\*Background & Impact\*\*/g, '## Background & Impact')
    .replace(/\*\*Methodology\*\*/g, '## Methodology') 
    .replace(/\*\*Personnel\*\*/g, '## Personnel')
    .replace(/\*\*Justification for Keck Funding\*\*/g, '## Justification for Keck Funding');
  
  return formatted + processedSummary;
}