/**
 * Utility functions for parsing reviewer recommendations from Claude responses
 */

/**
 * Parses reviewer text and extracts structured data
 * @param {string} reviewerText - Raw text from Claude containing reviewer recommendations
 * @returns {Array} Array of reviewer objects with name and institution
 */
export function parseReviewers(reviewerText) {
  if (!reviewerText || typeof reviewerText !== 'string') {
    return [];
  }

  const reviewers = [];
  const lines = reviewerText.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    
    // Skip lines that are clearly not reviewer entries
    if (trimmedLine.length < 10 || 
        trimmedLine.includes(':') ||
        trimmedLine.toLowerCase().includes('potential reviewers') ||
        trimmedLine.toLowerCase().includes('these reviewer') ||
        trimmedLine.toLowerCase().includes('based on') ||
        trimmedLine.toLowerCase().includes('mix of') ||
        trimmedLine.toLowerCase().includes('several') ||
        trimmedLine.toLowerCase().includes('experience with') ||
        trimmedLine.toLowerCase().includes('seniority level') ||
        trimmedLine.toLowerCase().includes('core technolog') ||
        /^-\s+(mix|several|all|many|most|some)/i.test(trimmedLine) ||
        /^\w+\s+(are|is|have|with|would|should|could)/i.test(trimmedLine)) {
      continue;
    }

    // Try multiple patterns to extract name and institution
    const patterns = [
      // Pattern: "1. Dr. John Smith (MIT) - Expert in AI" or "Prof. Alice Wilson (Harvard)"
      // Name and institution in parentheses, optional additional text
      /^(?:\d+\.\s*)?(?:Dr\.\s*|Prof\.\s*|Professor\s*)?([A-Z][A-Za-z\s.'-]+?)\s*\(([^)]+)\)/,
      
      // Pattern: "4. Dr. Alice Wilson - Harvard Medical School" or "Bob Chen - Microsoft"
      // Name followed by dash and institution, optional additional text
      /^(?:\d+\.\s*)?(?:Dr\.\s*|Prof\.\s*|Professor\s*)?([A-Z][A-Za-z\s.'-]+?)\s*-\s*([A-Z][A-Za-z\s,.'&-]+?)(?:\s*-|$)/,
      
      // Pattern: "5. Bob Chen, Microsoft Research" or "Dr. Jane Doe, Harvard University"  
      // Name followed by comma and institution
      /^(?:\d+\.\s*)?(?:Dr\.\s*|Prof\.\s*|Professor\s*)?([A-Z][A-Za-z\s.'-]+?),\s*([A-Z][A-Za-z\s,.'&-]+)/,
    ];

    for (const pattern of patterns) {
      const match = trimmedLine.match(pattern);
      if (match) {
        const name = cleanName(match[1]);
        const institution = cleanInstitution(match[2]);
        
        if (name && institution) {
          reviewers.push({
            name: name,
            institution: institution
          });
          break; // Found a match, move to next line
        }
      }
    }
  }

  return reviewers;
}

/**
 * Cleans and normalizes a reviewer name
 * @param {string} name - Raw name string
 * @returns {string} Cleaned name without titles
 */
function cleanName(name) {
  if (!name) return '';
  
  return name
    .trim()
    .replace(/^(Dr\.|Prof\.|Professor)\s*/i, '') // Remove titles
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
}

/**
 * Cleans and normalizes an institution name
 * @param {string} institution - Raw institution string
 * @returns {string} Cleaned institution name
 */
function cleanInstitution(institution) {
  if (!institution) return '';
  
  return institution
    .trim()
    .replace(/^(University of |The )/i, (match) => match) // Keep university prefixes as-is
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
}

/**
 * Generates CSV content from reviewer data
 * @param {Array} reviewers - Array of reviewer objects
 * @returns {string} CSV formatted string
 */
export function generateReviewerCSV(reviewers) {
  if (!reviewers || !Array.isArray(reviewers) || reviewers.length === 0) {
    return 'name,institution\n';
  }

  // CSV header
  const header = 'name,institution';
  
  // CSV rows
  const rows = reviewers.map(reviewer => {
    const name = escapeCSVField(reviewer.name || '');
    const institution = escapeCSVField(reviewer.institution || '');
    return `${name},${institution}`;
  });

  return [header, ...rows].join('\n');
}

/**
 * Escapes a field for CSV format
 * @param {string} field - Field value to escape
 * @returns {string} Escaped field value
 */
function escapeCSVField(field) {
  if (typeof field !== 'string') {
    field = String(field);
  }
  
  // If field contains comma, newline, or quote, wrap in quotes and escape quotes
  if (field.includes(',') || field.includes('\n') || field.includes('"')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  
  return field;
}

/**
 * Validates reviewer data structure
 * @param {Array} reviewers - Array of reviewer objects to validate
 * @returns {boolean} True if data is valid
 */
export function validateReviewerData(reviewers) {
  if (!Array.isArray(reviewers)) return false;
  
  return reviewers.every(reviewer => 
    reviewer && 
    typeof reviewer === 'object' &&
    typeof reviewer.name === 'string' &&
    typeof reviewer.institution === 'string'
  );
}