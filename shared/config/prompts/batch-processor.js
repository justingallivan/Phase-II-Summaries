/**
 * Prompt templates for the Batch Processor app
 * Used for processing multiple proposals with customizable summary length and technical level
 */

/**
 * Length guidance definitions for different page lengths
 */
const LENGTH_GUIDANCE = {
  1: 'Create a CONCISE 1-page summary (approximately 500 words). Focus only on the most critical information.',
  2: 'Create a 2-page summary (approximately 1000 words). Include key details while maintaining brevity.',
  3: 'Create a 3-page summary (approximately 1500 words). Provide comprehensive coverage with moderate detail.',
  4: 'Create a 4-page summary (approximately 2000 words). Include substantial detail and supporting information.',
  5: 'Create a DETAILED 5-page summary (approximately 2500 words). Provide thorough coverage with full context.'
};

/**
 * Technical level guidance for different audiences
 */
const TECHNICAL_GUIDANCE = {
  'non-technical': `
**TECHNICAL LEVEL: Non-Technical**
- Write for a general audience with no scientific background
- Avoid jargon and technical terminology
- Use simple analogies and everyday language
- Explain scientific concepts in accessible terms
- Focus on practical implications and real-world impact
- Define any necessary technical terms in plain language`,

  'technical-non-expert': `
**TECHNICAL LEVEL: Technical for Non-Expert**
- Write for an educated reader who is not a specialist in this field
- Use technical terms but provide brief explanations
- Include scientific concepts with appropriate context
- Balance accuracy with accessibility
- Assume familiarity with general scientific principles
- Explain field-specific terminology and methods`,

  'expert': `
**TECHNICAL LEVEL: Expert**
- Write for specialists in the field
- Use full technical terminology without simplification
- Include detailed methodological descriptions
- Discuss complex theoretical frameworks
- Reference specific techniques and protocols
- Assume deep knowledge of the subject area`
};

/**
 * Main batch processing prompt for proposals
 * @param {string} text - The proposal text to summarize
 * @param {number} pageLength - Desired summary length (1-5 pages)
 * @param {string} techLevel - Technical level (non-technical, technical-non-expert, expert)
 * @param {string} filename - The filename for context
 * @param {number} textLimit - Maximum characters to process
 * @returns {string} - The formatted batch prompt
 */
export function createBatchProcessingPrompt(text, pageLength, techLevel, filename, textLimit = 30000) {
  // Validate inputs
  if (!LENGTH_GUIDANCE[pageLength]) {
    throw new Error(`Invalid page length: ${pageLength}. Must be 1-5.`);
  }
  
  if (!TECHNICAL_GUIDANCE[techLevel]) {
    throw new Error(`Invalid technical level: ${techLevel}. Must be one of: ${Object.keys(TECHNICAL_GUIDANCE).join(', ')}`);
  }

  return `Please analyze this research proposal and create a ${pageLength}-page summary.

**LENGTH REQUIREMENT:** ${LENGTH_GUIDANCE[pageLength]}

${TECHNICAL_GUIDANCE[techLevel]}

**SUMMARY FORMAT:**
- Use clear section headings (##)
- Include: Executive Summary, Background, Methodology, Expected Outcomes, Research Team, and Budget/Timeline
- Adjust detail level based on both the requested page length and technical level
- For non-technical: emphasize goals, impact, and practical applications
- For technical non-expert: balance technical accuracy with clarity
- For expert: include full technical depth and specialized details

**TONE:** Professional, objective, and factual - adapted to the audience level

**FILENAME:** ${filename}

Research Proposal Text:
---
${text.substring(0, textLimit)} ${text.length > textLimit ? '...' : ''}

Generate a ${pageLength}-page summary at the ${techLevel.replace('-', ' ')} level following the guidelines above.`;
}

/**
 * Metadata extraction prompt for batch processing
 * @param {string} text - The proposal text
 * @param {string} filename - The filename for context
 * @returns {string} - The metadata extraction prompt
 */
export function createBatchMetadataPrompt(text, filename) {
  return `Extract basic proposal info as JSON:

{
  "filename": "${filename}",
  "institution": "Primary institution name",
  "principal_investigator": "Name of PI",
  "co_investigators": ["List", "of", "co-PIs"],
  "research_area": "Main research domain", 
  "project_title": "Project title if different from filename",
  "funding_requested": "Amount if mentioned",
  "duration": "Project timeline",
  "keywords": ["Key", "research", "terms"],
  "summary_type": "Brief description of proposal type"
}

Proposal text (first 5000 chars):
${text.substring(0, 5000)}

Return only the JSON object.`;
}

/**
 * Quality assessment prompt for batch summaries
 * @param {string} summary - The generated summary
 * @param {string} originalText - The original proposal text (truncated)
 * @param {number} targetLength - Target summary length in pages
 * @returns {string} - The quality assessment prompt
 */
export function createQualityAssessmentPrompt(summary, originalText, targetLength) {
  return `Assess the quality of this summary against the original proposal:

**SUMMARY TO ASSESS:**
${summary}

**ORIGINAL PROPOSAL (excerpt):**
${originalText.substring(0, 8000)}

**TARGET LENGTH:** ${targetLength} page${targetLength > 1 ? 's' : ''}

**ASSESSMENT CRITERIA:**
1. **Completeness**: Does it cover all major sections?
2. **Accuracy**: Is the information faithful to the original?
3. **Length Appropriateness**: Is it the right length for ${targetLength} page${targetLength > 1 ? 's' : ''}?
4. **Clarity**: Is it well-written and easy to understand?
5. **Structure**: Does it follow logical organization?

Please provide:
- Overall quality score (1-10)
- Specific strengths
- Areas for improvement
- Missing key information (if any)

Format as structured feedback with clear sections.`;
}

/**
 * Comparison prompt for batch processing results
 * @param {Array<{filename: string, summary: string, metadata: Object}>} proposals - Array of processed proposals
 * @returns {string} - The comparison prompt
 */
export function createBatchComparisonPrompt(proposals) {
  if (proposals.length < 2) {
    throw new Error('At least 2 proposals required for comparison');
  }

  const proposalTexts = proposals.map((proposal, index) => 
    `**Proposal ${index + 1}: ${proposal.filename}**\n${proposal.summary.substring(0, 2000)}${proposal.summary.length > 2000 ? '...[truncated]' : ''}\n\n---\n`
  ).join('');

  return `Compare these ${proposals.length} research proposals and provide a comparative analysis:

**RESEARCH AREAS & APPROACHES**
- What fields/disciplines are represented?
- How do the methodological approaches compare?
- What are the different research philosophies or frameworks?

**INNOVATION & SIGNIFICANCE**
- Which proposals represent the most novel approaches?
- How do the potential impacts compare?
- What are the relative risk levels of each project?

**FEASIBILITY & RESOURCES**
- How do the resource requirements compare?
- Which projects seem most/least feasible?
- What are the different timeline expectations?

**RESEARCH TEAMS**
- How do the team compositions compare?
- What different expertise areas are represented?
- Which teams seem best positioned for success?

**FUNDING JUSTIFICATION**
- How compelling are the different funding cases?
- Which projects make the strongest argument for support?
- What are the different value propositions?

**OVERALL RANKING** (if appropriate)
Provide a brief ranking with rationale, or explain why ranking isn't appropriate.

Proposals to compare:
${proposalTexts}

Please provide a structured comparative analysis that would help in funding decisions.`;
}

/**
 * Summary enhancement prompt for improving batch results
 * @param {string} summary - The current summary
 * @param {string} enhancementType - Type of enhancement (clarity, detail, structure, etc.)
 * @param {string} specificFeedback - Specific improvement guidance
 * @returns {string} - The enhancement prompt
 */
export function createSummaryEnhancementPrompt(summary, enhancementType, specificFeedback = '') {
  const enhancementGuidance = {
    clarity: 'Improve clarity and readability. Make complex concepts more accessible.',
    detail: 'Add more specific details and examples. Expand on key technical points.',
    structure: 'Improve organization and flow. Ensure logical progression of ideas.',
    conciseness: 'Make more concise while retaining key information. Eliminate redundancy.',
    technical: 'Increase technical depth and precision. Add methodological details.',
    accessibility: 'Make more accessible to non-expert readers. Reduce jargon.'
  };

  return `Please enhance this summary with a focus on ${enhancementType}:

**CURRENT SUMMARY:**
${summary}

**ENHANCEMENT FOCUS:** ${enhancementGuidance[enhancementType] || enhancementType}

${specificFeedback ? `**SPECIFIC FEEDBACK:** ${specificFeedback}` : ''}

**REQUIREMENTS:**
- Maintain the same overall structure and sections
- Keep the same approximate length
- Preserve all key factual information
- Make targeted improvements based on the enhancement focus

Please provide the enhanced summary.`;
}

/**
 * Progress tracking utilities for batch processing
 */
export const BATCH_PROGRESS = {
  PARSING: 'Parsing uploaded files...',
  PROCESSING: (current, total) => `Processing ${current}/${total} proposals...`,
  ANALYZING: (filename) => `Analyzing ${filename}...`,
  EXTRACTING: (filename) => `Extracting metadata from ${filename}...`,
  COMPLETING: 'Finalizing results...',
  COMPLETE: 'Batch processing complete!'
};

/**
 * Format batch results for display
 * @param {Array<Object>} results - Array of processing results
 * @param {Object} batchSettings - Batch processing settings
 * @returns {Object} - Formatted results with metadata
 */
export function formatBatchResults(results, batchSettings = {}) {
  const timestamp = new Date().toISOString();
  const totalFiles = results.length;
  const successfulFiles = results.filter(r => !r.metadata?.error).length;
  const failedFiles = totalFiles - successfulFiles;
  
  return {
    batchSummary: {
      totalFiles,
      successfulFiles,
      failedFiles,
      processingDate: timestamp,
      settings: {
        pageLength: batchSettings.pageLength || 'Not specified',
        technicalLevel: batchSettings.techLevel || 'Not specified'
      }
    },
    results: results.map(result => ({
      ...result,
      processingTimestamp: timestamp
    }))
  };
}

/**
 * Validate batch processing parameters
 * @param {number} pageLength - Desired page length (1-5)
 * @param {string} techLevel - Technical level
 * @param {Array} files - Array of files to process
 * @returns {Object} - Validation result
 */
export function validateBatchParameters(pageLength, techLevel, files) {
  const errors = [];
  
  if (!pageLength || pageLength < 1 || pageLength > 5) {
    errors.push('Page length must be between 1 and 5');
  }
  
  if (!techLevel || !TECHNICAL_GUIDANCE[techLevel]) {
    errors.push(`Technical level must be one of: ${Object.keys(TECHNICAL_GUIDANCE).join(', ')}`);
  }
  
  if (!files || !Array.isArray(files) || files.length === 0) {
    errors.push('At least one file must be provided for processing');
  }
  
  if (files && files.length > 20) {
    errors.push('Maximum 20 files allowed per batch');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}