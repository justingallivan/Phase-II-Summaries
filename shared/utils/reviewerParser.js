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
  
  // Debug logging (only in development)
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.log('Parsing reviewer text with', lines.length, 'lines');
    console.log('Raw reviewer text:', JSON.stringify(reviewerText.substring(0, 500)));
  }

  let currentReviewer = null;
  
  for (let i = 0; i < lines.length; i++) {
    const trimmedLine = lines[i].trim();
    if (!trimmedLine) continue;
    
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.log('Processing line:', JSON.stringify(trimmedLine));
    }
    
    // Look for reviewer entry lines in structured format (format: "1. **Name, Title**")
    const structuredReviewerPattern = /^(\d+)\.\s*\*\*([^,*]+)(?:,\s*[^*]*)?\*\*/;
    const structuredMatch = trimmedLine.match(structuredReviewerPattern);
    
    if (structuredMatch) {
      // If we have a previous reviewer, save it (unless excluded)
      if (currentReviewer && currentReviewer.name && !currentReviewer.excluded) {
        reviewers.push({
          name: currentReviewer.name,
          institution: currentReviewer.institution || 'Not specified'
        });
      }
      
      // Start new reviewer entry
      const name = cleanName(structuredMatch[2].trim());
      
      currentReviewer = {
        name: name,
        institution: null,
        excluded: false
      };
      
      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        console.log('Found structured reviewer entry:', name);
      }
      continue;
    }
    
    // Look for institution line (format: "   Institution: University Name")
    const institutionPattern = /^\s*Institution:\s*(.+)$/i;
    const institutionMatch = trimmedLine.match(institutionPattern);
    
    if (institutionMatch && currentReviewer) {
      const institution = cleanInstitution(institutionMatch[1]);
      currentReviewer.institution = institution;
      
      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        console.log('Found institution:', institution);
      }
      continue;
    }
    
    // Look for exclusion indicators in other lines
    if (currentReviewer && (
      trimmedLine.toLowerCase().includes('excluded') ||
      trimmedLine.toLowerCase().includes('same institution') ||
      trimmedLine.toLowerCase().includes('conflict') ||
      trimmedLine.toLowerCase().includes('retired') ||
      trimmedLine.toLowerCase().includes('deceased')
    )) {
      // Mark this reviewer as excluded
      currentReviewer.excluded = true;
      
      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        console.log('Marking reviewer as excluded:', currentReviewer.name);
      }
      continue;
    }

    // Legacy patterns for simpler formats (fallback) - only if not processing structured format
    if (!currentReviewer) {
      // Skip lines that are clearly not reviewer entries
      if (trimmedLine.toLowerCase().includes('potential reviewers') ||
          trimmedLine.toLowerCase().includes('these reviewers have') ||
          trimmedLine.toLowerCase().includes('based on the research') ||
          /^-\s+(mix of|several|all of|many of|most of)/i.test(trimmedLine) ||
          /^(these|the|based|here|below)\s+(are|is|reviewers)/i.test(trimmedLine)) {
        continue;
      }

      const legacyPatterns = [
        // Pattern: "1. Dr. John Smith (MIT)" or "Prof. Alice Wilson (Harvard)"
        /^(?:\d+\.\s*)?(?:Dr\.\s*|Prof\.\s*|Professor\s*)?([A-Za-z][A-Za-z\s.'-]+?)\s*\(([^)]+)\)/,
        
        // Pattern: "Dr. Alice Wilson - Harvard Medical School" 
        /^(?:\d+\.\s*)?(?:Dr\.\s*|Prof\.\s*|Professor\s*)?([A-Za-z][A-Za-z\s.'-]+?)\s*-\s*([A-Za-z][A-Za-z\s,.'&-]+)/,
        
        // Pattern: "Bob Chen, Microsoft Research" - but not "Name, Title" format
        /^(?:\d+\.\s*)?(?:Dr\.\s*|Prof\.\s*|Professor\s*)?([A-Za-z][A-Za-z\s.'-]+?),\s*([A-Za-z][A-Za-z\s,.'&-]+)(?:\s|$)/,
      ];

      for (const pattern of legacyPatterns) {
        const match = trimmedLine.match(pattern);
        if (match) {
          const name = cleanName(match[1]);
          const institution = cleanInstitution(match[2]);
          
          if (name && institution) {
            reviewers.push({
              name: name,
              institution: institution
            });
            
            if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
              console.log('Found legacy format reviewer:', { name, institution });
            }
            break;
          }
        }
      }
    }
  }
  
  // Don't forget the last reviewer (unless excluded)
  if (currentReviewer && currentReviewer.name && !currentReviewer.excluded) {
    reviewers.push({
      name: currentReviewer.name,
      institution: currentReviewer.institution || 'Not specified'
    });
  }

  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.log(`Parsed ${reviewers.length} reviewers total`);
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