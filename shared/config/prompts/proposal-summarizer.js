/**
 * Prompt templates for the Proposal Summarizer app
 * Used for creating Phase II writeup drafts from research proposals
 *
 * Produces a two-part output matching the Keck Phase II writeup template:
 *   PART 1 — Summary Page (grade 13 audience, jargon-free)
 *   PART 2 — Detailed Writeup (technical language OK, abbreviations defined on first use)
 */

/**
 * Main summarization prompt for research proposals
 * @param {string} text - The proposal text to summarize
 * @param {number} summaryLength - Detail level for pages 3-4 content (1-5, default: 2 ≈ 800 words)
 * @param {number} textLimit - Maximum characters to process (default: 15000)
 * @returns {string} - The formatted prompt
 */
export function createSummarizationPrompt(text, summaryLength = 2, textLimit = 15000) {
  const detailedWordTarget = summaryLength * 400;

  return `Please analyze this research proposal and create a two-part writeup following the exact structure below.

**PART 1 — SUMMARY PAGE**
Write for a "grade 13 science audience" — an educated reader who is NOT a specialist in this field. Avoid jargon entirely; if a technical term is unavoidable, include a brief plain-English parenthetical. Each item below should be concise (1-3 sentences).

**Executive Summary:**
[2-4 sentences describing what this project is about — the core scientific question, the approach, and the expected outcome. Written so a non-specialist can understand.]

**Impact:**
[1-3 sentences. If this research succeeds, what will be learned or enabled? Focus on broad significance.]

**Methodology Overview:**
[1-3 sentences. High-level description of the methods, approach, and goals — no jargon.]

**Personnel Overview:**
[1-3 sentences. Names of PI and key co-investigators with their primary expertise. Use format: "<u>Name</u>, expertise area".]

**Rationale for Keck Funding:**
[1-3 sentences. Why does this project need foundation support rather than traditional funding? Focus on risk, novelty, or cross-disciplinary nature.]

---

**PART 2 — DETAILED WRITEUP**
Technical language is acceptable here, but define all abbreviations on first use (e.g., "cryo-electron microscopy (cryo-EM)"). Target approximately ${detailedWordTarget} words for Part 2.

**Background & Impact:**
[1-2 paragraphs. The scientific problem, current state of knowledge, what gap this work fills, and the potential impact if successful. Include specific technical details.]

**Methodology:**
[1-2 paragraphs. Research approach, techniques, experimental design. Be specific about methods and technical approaches.]

**Personnel:**
[1 paragraph. Principal investigators with full names underlined using <u>Name</u> tags, their titles (lowercase), institutional affiliations, and relevant expertise. Co-investigators likewise underlined. State areas of study directly without promotional language. Format: "The principal investigator is <u>John Smith</u>, a professor of biology at [institution]..."]

**TONE AND LANGUAGE RULES (apply to both parts):**
- Use neutral, matter-of-fact language — avoid promotional or effusive terms
- Avoid unnecessary adjectives like "technical", "deep", "rigorous", "proper", "comprehensive", "excellent", "outstanding"
- Write in a straightforward, academic tone similar to scientific review documents
- State facts and qualifications directly without embellishment
- Focus on what the researchers do/study rather than how well they do it

**FORMATTING RULES:**
- Principal Investigator and Co-Investigator names should be underlined using HTML tags <u>Name</u>
- Academic titles should be lowercase (professor, associate professor, assistant professor)
- Use the exact section headers shown above (Executive Summary, Impact, Methodology Overview, Personnel Overview, Rationale for Keck Funding, Background & Impact, Methodology, Personnel)
- Include the "---" separator between Part 1 and Part 2

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
  "city_state": "City, State of the primary institution (e.g., 'Pasadena, California')",
  "project_title": "Full project title as stated in the proposal",
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
  return `You are reviewing and improving a research proposal writeup based on user feedback.

**Current Writeup:**
${currentSummary}

**User Feedback:**
${feedback}

**Instructions:**
- Carefully review the current writeup and the user's feedback
- Make specific improvements based on the feedback provided
- Maintain the same professional tone and two-part format structure
- Keep the Part 1 sections: Executive Summary, Impact, Methodology Overview, Personnel Overview, Rationale for Keck Funding
- Keep the Part 2 sections: Background & Impact, Methodology, Personnel
- Keep the "---" separator between Part 1 and Part 2
- Part 1 should remain accessible to a non-specialist audience; Part 2 can use technical language
- Use the same formatting rules: underline investigator names with <u>Name</u> tags, lowercase titles
- Do not add fictional information - only reorganize, expand, or refine existing content
- If the feedback asks for information not present in the original, note that it would require the original proposal text

Please provide the refined writeup maintaining the exact same format and structure.`;
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
 * Format summary with enhanced markdown for the two-part structure
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

  // Process the summary with proper section headers for both parts
  let processedSummary = summary
    // Part 1 sections
    .replace(/\*\*Executive Summary:?\*\*/g, '## Executive Summary')
    .replace(/\*\*Impact:?\*\*/g, '## Impact')
    .replace(/\*\*Methodology Overview:?\*\*/g, '## Methodology Overview')
    .replace(/\*\*Personnel Overview:?\*\*/g, '## Personnel Overview')
    .replace(/\*\*Rationale for Keck Funding:?\*\*/g, '## Rationale for Keck Funding')
    // Part 2 sections
    .replace(/\*\*Background & Impact:?\*\*/g, '## Background & Impact')
    .replace(/\*\*Methodology:?\*\*/g, '## Methodology')
    .replace(/\*\*Personnel:?\*\*/g, '## Personnel')
    // Part markers
    .replace(/\*\*PART 1[^*]*\*\*/g, '### PART 1 — Summary Page')
    .replace(/\*\*PART 2[^*]*\*\*/g, '### PART 2 — Detailed Writeup');

  return formatted + processedSummary;
}

/**
 * Parse formatted markdown into named sections for Word generation.
 * Returns a Map<string, string> where keys are section names and values are content.
 * @param {string} formattedMarkdown - The formatted markdown from enhanceFormatting()
 * @returns {Map<string, string>} - Parsed sections
 */
export function parseSections(formattedMarkdown) {
  const sections = new Map();

  // Split on ## headers (level 2)
  const sectionRegex = /^## (.+)$/gm;
  const headers = [];
  let match;

  while ((match = sectionRegex.exec(formattedMarkdown)) !== null) {
    headers.push({ name: match[1].trim(), index: match.index, length: match[0].length });
  }

  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index + headers[i].length;
    const end = i + 1 < headers.length ? headers[i + 1].index : formattedMarkdown.length;
    const content = formattedMarkdown.substring(start, end).trim();
    sections.set(headers[i].name, content);
  }

  return sections;
}
