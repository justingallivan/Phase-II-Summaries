/**
 * Common prompt utilities and shared functions across all apps
 * This file contains reusable prompt components and helper functions
 */

/**
 * Common text processing limits
 */
export const TEXT_LIMITS = {
  SMALL: 5000,
  MEDIUM: 10000,
  LARGE: 15000,
  EXTRA_LARGE: 20000,
  MAXIMUM: 30000
};

/**
 * Standard temperature settings for different types of AI tasks
 */
export const TEMPERATURE_SETTINGS = {
  DETERMINISTIC: 0.0,      // For structured data extraction
  LOW_CREATIVITY: 0.1,     // For factual analysis
  BALANCED: 0.3,           // For summaries and analysis
  MODERATE_CREATIVITY: 0.5, // For recommendations and insights
  HIGH_CREATIVITY: 0.7,    // For creative writing or brainstorming
  MAXIMUM_CREATIVITY: 1.0  // For highly creative tasks
};

/**
 * Standard token limits for different response types
 */
export const TOKEN_LIMITS = {
  SHORT_RESPONSE: 500,     // For brief answers
  MEDIUM_RESPONSE: 1500,   // For standard analysis
  LONG_RESPONSE: 2500,     // For detailed summaries
  EXTRA_LONG_RESPONSE: 4000, // For comprehensive reports
  STRUCTURED_DATA: 1000    // For JSON extraction
};

/**
 * Common prompt prefixes for different tasks
 */
export const PROMPT_PREFIXES = {
  ANALYSIS: 'Please analyze the following document and provide',
  EXTRACTION: 'Extract the following information from this document:',
  SUMMARY: 'Please create a comprehensive summary of',
  COMPARISON: 'Compare and contrast the following documents:',
  QUESTION: 'Based on this document, please answer the following question:',
  REFINEMENT: 'Please improve the following content based on the feedback provided:'
};

/**
 * Common formatting instructions for consistent output
 */
export const FORMATTING_INSTRUCTIONS = {
  MARKDOWN: `
**FORMATTING REQUIREMENTS:**
- Use proper markdown formatting
- Use ## for main section headers
- Use **bold** for emphasis
- Use bullet points (-) for lists
- Use numbered lists (1.) for sequential items`,

  STRUCTURED_JSON: `
**JSON FORMAT REQUIREMENTS:**
- Return only valid JSON, no additional text
- Use consistent key naming (camelCase)
- Include null values for missing information
- Ensure all strings are properly escaped`,

  ACADEMIC: `
**ACADEMIC FORMATTING:**
- Use formal, professional language
- Cite specific sections when referencing content
- Maintain objective, analytical tone
- Structure with clear sections and subsections`,

  ACCESSIBLE: `
**ACCESSIBILITY REQUIREMENTS:**
- Use clear, simple language
- Define technical terms when first used
- Break complex ideas into smaller parts
- Use analogies or examples where helpful`
};

/**
 * Common error handling messages
 */
export const ERROR_MESSAGES = {
  INVALID_TEXT: 'Invalid or insufficient text provided for processing',
  TEXT_TOO_LONG: 'Text exceeds maximum processing length',
  INVALID_PARAMETERS: 'Invalid parameters provided',
  PROCESSING_FAILED: 'Document processing failed',
  EXTRACTION_FAILED: 'Failed to extract structured data',
  API_ERROR: 'AI service error occurred'
};

/**
 * Truncate text to specified limit with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} limit - Character limit
 * @param {string} suffix - Suffix to add (default: '...')
 * @returns {string} - Truncated text
 */
export function truncateText(text, limit = TEXT_LIMITS.LARGE, suffix = '...') {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  if (text.length <= limit) {
    return text;
  }
  
  return text.substring(0, limit) + suffix;
}

/**
 * Clean and validate text input
 * @param {string} text - Text to clean
 * @param {number} minLength - Minimum required length
 * @returns {string} - Cleaned text
 */
export function cleanText(text, minLength = 100) {
  if (!text || typeof text !== 'string') {
    throw new Error(ERROR_MESSAGES.INVALID_TEXT);
  }
  
  const cleaned = text.trim().replace(/\s+/g, ' ');
  
  if (cleaned.length < minLength) {
    throw new Error(`Text too short: ${cleaned.length} characters (minimum: ${minLength})`);
  }
  
  return cleaned;
}

/**
 * Extract filename without extension
 * @param {string} filename - Full filename
 * @returns {string} - Name without extension
 */
export function getBasename(filename) {
  if (!filename) return 'document';
  return filename.replace(/\.[^/.]+$/, '');
}

/**
 * Create metadata header for documents
 * @param {string} title - Document title
 * @param {string} type - Document type (analysis, summary, etc.)
 * @param {Object} metadata - Additional metadata
 * @returns {string} - Formatted header
 */
export function createDocumentHeader(title, type = 'Document', metadata = {}) {
  const date = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long',
    day: 'numeric'
  });
  
  let header = `# ${title}\n\n`;
  header += `**Type:** ${type}\n`;
  header += `**Generated:** ${date}\n`;
  
  if (metadata.filename) {
    header += `**Source:** ${metadata.filename}\n`;
  }
  
  if (metadata.wordCount) {
    header += `**Length:** ${metadata.wordCount.toLocaleString()} words\n`;
  }
  
  header += '\n---\n\n';
  
  return header;
}

/**
 * Parse structured data from AI response
 * @param {string} response - AI response containing JSON
 * @returns {Object|null} - Parsed data or null if failed
 */
export function parseStructuredResponse(response) {
  if (!response) return null;
  
  try {
    // Try to parse as direct JSON
    return JSON.parse(response);
  } catch (e) {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (e2) {
        // Fall through to regex extraction
      }
    }
    
    // Try to extract JSON object with regex
    const objectMatch = response.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch (e3) {
        console.warn('Failed to parse structured response:', e3);
      }
    }
  }
  
  return null;
}

/**
 * Create progress tracking object
 * @param {number} current - Current progress
 * @param {number} total - Total items
 * @param {string} message - Progress message
 * @returns {Object} - Progress object
 */
export function createProgressUpdate(current, total, message) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  
  return {
    progress: percentage,
    current,
    total,
    message,
    timestamp: new Date().toISOString()
  };
}

/**
 * Validate common prompt parameters
 * @param {Object} params - Parameters to validate
 * @returns {Object} - Validation result
 */
export function validatePromptParameters(params = {}) {
  const errors = [];
  const warnings = [];
  
  // Check required parameters
  if (!params.text) {
    errors.push('Text content is required');
  } else if (typeof params.text !== 'string') {
    errors.push('Text must be a string');
  } else if (params.text.trim().length < 50) {
    warnings.push('Text is very short and may not produce meaningful results');
  }
  
  // Check filename
  if (params.filename && typeof params.filename !== 'string') {
    errors.push('Filename must be a string');
  }
  
  // Check limits
  if (params.textLimit && (typeof params.textLimit !== 'number' || params.textLimit < 100)) {
    errors.push('Text limit must be a number >= 100');
  }
  
  // Check temperature
  if (params.temperature !== undefined) {
    if (typeof params.temperature !== 'number' || params.temperature < 0 || params.temperature > 1) {
      errors.push('Temperature must be a number between 0 and 1');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Common system instructions for AI models
 */
export const SYSTEM_INSTRUCTIONS = {
  DOCUMENT_ANALYST: 'You are an expert document analyst with deep knowledge across academic, technical, and business domains. Provide thorough, accurate analysis while maintaining objectivity.',
  
  RESEARCH_REVIEWER: 'You are an experienced research reviewer familiar with grant evaluation, peer review processes, and academic standards. Focus on constructive, detailed feedback.',
  
  SUMMARIZATION_EXPERT: 'You are skilled at creating clear, concise summaries that capture essential information while adapting to different audiences and purposes.',
  
  DATA_EXTRACTOR: 'You are precise at extracting structured information from documents. Focus on accuracy and completeness while following specified formats exactly.'
};