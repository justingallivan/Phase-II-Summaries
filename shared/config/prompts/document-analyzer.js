/**
 * Prompt templates for the Document Analyzer app
 * Used for comprehensive AI-powered document analysis with insights, themes, and structured data extraction
 */

/**
 * Main document analysis prompt
 * @param {string} text - The document text to analyze
 * @param {string} filename - The filename for context
 * @param {number} textLimit - Maximum characters to process
 * @returns {string} - The formatted analysis prompt
 */
export function createDocumentAnalysisPrompt(text, filename, textLimit = 15000) {
  return `Please analyze this document and provide a comprehensive analysis with the following sections:

**DOCUMENT OVERVIEW**
Provide a 2-3 sentence summary of what this document is about.

**KEY POINTS**
• List the 3-5 most important points or findings
• Use bullet points for clarity
• Each point should be 1-2 sentences

**MAIN THEMES**
Identify and briefly describe 2-3 main themes or topics discussed in the document.

**TECHNICAL DETAILS**
If applicable, note any important technical information, methodologies, or specifications mentioned.

**RECOMMENDATIONS OR CONCLUSIONS**
Summarize any recommendations, conclusions, or next steps mentioned in the document.

**NOTABLE INSIGHTS**
Highlight 1-2 particularly interesting or unexpected insights from the document.

Document title/filename: ${filename}
Document text:
---
${text.substring(0, textLimit)}${text.length > textLimit ? '...[truncated]' : ''}

Please provide a well-structured analysis that would be valuable for someone who needs to quickly understand this document.`;
}

/**
 * Structured metadata extraction prompt
 * @param {string} text - The document text
 * @param {string} filename - The filename for context
 * @param {number} textLimit - Maximum characters to process
 * @returns {string} - The metadata extraction prompt
 */
export function createMetadataExtractionPrompt(text, filename, textLimit = 5000) {
  return `Based on this document, extract key metadata as JSON:
{
  "documentType": "type of document",
  "subject": "main subject/topic",
  "date": "date if mentioned",
  "author": "author if mentioned", 
  "organization": "organization if mentioned",
  "keywords": ["list", "of", "keywords"],
  "sentiment": "positive/negative/neutral",
  "category": "document category",
  "language": "document language",
  "confidentiality": "public/internal/confidential if mentioned"
}

Document filename: ${filename}
Document text: ${text.substring(0, textLimit)}

Return only valid JSON, no other text.`;
}

/**
 * Theme extraction prompt for identifying patterns across documents
 * @param {string} text - The document text
 * @param {string} filename - The filename for context
 * @returns {string} - The theme extraction prompt
 */
export function createThemeExtractionPrompt(text, filename) {
  return `Analyze this document and identify the main themes, patterns, and conceptual frameworks. Focus on:

1. **Core Themes**: What are the 3-4 main conceptual themes?
2. **Methodological Approaches**: What methods, processes, or frameworks are discussed?
3. **Key Relationships**: What connections or relationships are explored?
4. **Underlying Assumptions**: What assumptions or premises does the document rely on?
5. **Knowledge Gaps**: What questions or gaps are identified?

Provide your analysis in a structured format with clear sections.

Document: ${filename}
Text: ${text.substring(0, 10000)}${text.length > 10000 ? '...[truncated]' : ''}`;
}

/**
 * Summary generation prompt for quick overviews
 * @param {string} text - The document text
 * @param {string} filename - The filename for context
 * @param {string} summaryType - Type of summary (executive, technical, general)
 * @returns {string} - The summary prompt
 */
export function createSummaryPrompt(text, filename, summaryType = 'general') {
  const summaryInstructions = {
    executive: 'Create an executive summary focusing on key decisions, outcomes, and business impact.',
    technical: 'Create a technical summary focusing on methods, processes, and technical details.',
    general: 'Create a general summary covering all main points in accessible language.'
  };

  return `${summaryInstructions[summaryType]}

**Requirements:**
- 2-3 paragraphs maximum
- Clear, concise language
- Focus on most important information
- Include specific details where relevant

Document: ${filename}
Content: ${text.substring(0, 12000)}${text.length > 12000 ? '...[truncated]' : ''}

Please provide a ${summaryType} summary of this document.`;
}

/**
 * Question generation prompt for creating discussion questions
 * @param {string} text - The document text
 * @param {string} filename - The filename for context
 * @returns {string} - The question generation prompt
 */
export function createQuestionGenerationPrompt(text, filename) {
  return `Based on this document, generate 5-7 thoughtful discussion questions that would help someone:
1. Better understand the content
2. Critically evaluate the ideas presented
3. Connect the content to broader contexts
4. Identify potential applications or implications

Format as a numbered list. Each question should be:
- Open-ended and thought-provoking
- Specific enough to be answerable from the document
- Valuable for discussion or further research

Document: ${filename}
Content: ${text.substring(0, 8000)}${text.length > 8000 ? '...[truncated]' : ''}`;
}

/**
 * Comparison prompt for analyzing multiple documents
 * @param {Array<{text: string, filename: string}>} documents - Array of documents to compare
 * @returns {string} - The comparison prompt
 */
export function createDocumentComparisonPrompt(documents) {
  if (documents.length < 2) {
    throw new Error('At least 2 documents required for comparison');
  }

  const documentTexts = documents.map((doc, index) => 
    `**Document ${index + 1}: ${doc.filename}**\n${doc.text.substring(0, 5000)}${doc.text.length > 5000 ? '...[truncated]' : ''}\n\n---\n`
  ).join('');

  return `Compare and contrast these ${documents.length} documents. Provide analysis in the following sections:

**SIMILARITIES**
- Common themes, topics, or approaches
- Shared conclusions or findings
- Similar methodologies or frameworks

**DIFFERENCES** 
- Contrasting viewpoints or approaches
- Different emphases or priorities
- Unique insights or contributions from each document

**COMPLEMENTARY INSIGHTS**
- How the documents build on or support each other
- Areas where they provide different perspectives on the same topic

**SYNTHESIS**
- Key takeaways when considering all documents together
- Gaps or questions that emerge from the comparison

Documents to compare:
${documentTexts}

Please provide a structured comparative analysis.`;
}

/**
 * Entity extraction prompt for identifying key entities
 * @param {string} text - The document text
 * @param {string} filename - The filename for context
 * @returns {string} - The entity extraction prompt
 */
export function createEntityExtractionPrompt(text, filename) {
  return `Extract and categorize all significant entities mentioned in this document. Return as JSON:

{
  "people": ["names of individuals mentioned"],
  "organizations": ["companies, institutions, agencies"],
  "locations": ["cities, countries, regions"],
  "technologies": ["tools, software, systems, methods"],
  "concepts": ["key concepts, theories, frameworks"],
  "dates": ["specific dates or time periods"],
  "numbers": ["important statistics, metrics, amounts"],
  "projects": ["named projects, initiatives, programs"]
}

Document: ${filename}
Text: ${text.substring(0, 8000)}${text.length > 8000 ? '...[truncated]' : ''}

Return only valid JSON with the extracted entities.`;
}

/**
 * Format analysis results with enhanced metadata
 * @param {string} analysis - The raw analysis text
 * @param {string} filename - The filename for metadata
 * @param {Object} processingStats - Processing statistics
 * @returns {string} - Formatted markdown analysis
 */
export function formatAnalysisResults(analysis, filename, processingStats = {}) {
  const date = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  let formatted = `# Document Analysis: ${filename}\n\n`;
  formatted += `**Analysis Date:** ${date}\n`;
  
  if (processingStats.wordCount) {
    formatted += `**Document Length:** ${processingStats.wordCount.toLocaleString()} words\n`;
  }
  
  if (processingStats.processingTime) {
    formatted += `**Processing Time:** ${processingStats.processingTime}ms\n`;
  }
  
  formatted += '\n---\n\n';
  formatted += analysis;
  
  return formatted;
}

/**
 * Validate and clean document text for processing
 * @param {string} text - The raw document text
 * @param {number} minLength - Minimum required text length
 * @returns {string} - Cleaned and validated text
 */
export function validateDocumentText(text, minLength = 100) {
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid document text provided');
  }
  
  const cleaned = text.trim();
  
  if (cleaned.length < minLength) {
    throw new Error(`Document text too short (${cleaned.length} chars, minimum ${minLength})`);
  }
  
  return cleaned;
}