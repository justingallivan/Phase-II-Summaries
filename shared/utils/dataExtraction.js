/**
 * Shared data extraction utilities
 * Common functions for extracting structured data from text
 */

/**
 * Extract institution name from filename
 * @param {string} filename - The filename to parse
 * @returns {string} - Extracted institution name or 'Not specified'
 */
export function extractInstitutionFromFilename(filename) {
  if (!filename) return 'Not specified';
  
  // Clean up common suffixes
  const cleanName = filename
    .replace(/\.(pdf|PDF|txt|docx|DOCX)$/, '')
    .replace(/_SE_Phase_II_Staff_Version$/, '')
    .replace(/_Phase_II.*$/, '')
    .replace(/_Phase_I.*$/, '')
    .replace(/_Staff_Version$/, '')
    .replace(/_Final$/, '')
    .replace(/_Draft$/, '')
    .replace(/_Review$/, '')
    .replace(/_Summary$/, '');
  
  // Common institution patterns
  const patterns = [
    /California Institute of Technology/i,
    /Massachusetts Institute of Technology/i,
    /University of California[^_]*/i,
    /University of [A-Za-z\s]+/i,
    /[A-Za-z\s]+ University/i,
    /[A-Za-z\s]+ Institute of Technology/i,
    /[A-Za-z\s]+ Institute/i,
    /[A-Za-z\s]+ College/i,
    /[A-Za-z\s]+ State University/i,
    /[A-Za-z\s]+ Medical Center/i,
    /[A-Za-z\s]+ Research Institute/i,
    /[A-Za-z\s]+ Laboratory/i,
    /[A-Za-z\s]+ Center/i
  ];
  
  for (const pattern of patterns) {
    const match = cleanName.match(pattern);
    if (match) return match[0].trim();
  }
  
  // Try to extract from underscored names
  const parts = cleanName.split('_');
  if (parts.length > 1) {
    const firstPart = parts[0].replace(/([a-z])([A-Z])/g, '$1 $2');
    if (firstPart.includes(' ') || firstPart.length > 15) {
      return firstPart;
    }
  }
  
  return 'Not specified';
}

/**
 * Extract principal investigator from text
 * @param {string} text - Text to search
 * @returns {string} - PI name or 'Not specified'
 */
export function extractPrincipalInvestigator(text) {
  // Try various patterns
  const patterns = [
    /(?:Principal Investigator|PI|Lead Investigator)[:]\s*(?:Dr\.?\s+)?([A-Z][a-z]+ (?:[A-Z]\.?\s+)?[A-Z][a-z]+)/i,
    /(?:PI|Principal Investigator)\s*[-–]\s*(?:Dr\.?\s+)?([A-Z][a-z]+ [A-Z][a-z]+)/i,
    /(?:Dr\.?\s+)?([A-Z][a-z]+ [A-Z][a-z]+),?\s+(?:Principal Investigator|PI)/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  
  // Fallback: look for first Dr. mention
  const drMatch = text.match(/Dr\.?\s+([A-Z][a-z]+ [A-Z][a-z]+)/);
  return drMatch ? drMatch[1] : 'Not specified';
}

/**
 * Extract all investigators from text
 * @param {string} text - Text to search
 * @returns {Array<string>} - List of investigator names
 */
export function extractInvestigators(text) {
  const investigators = new Set();
  
  // Various name patterns
  const patterns = [
    /(?:Dr\.?\s+)?([A-Z][a-z]+ (?:[A-Z]\.?\s+)?[A-Z][a-z]+)/g,
    /([A-Z][a-z]+,\s+[A-Z][a-z]+(?:\s+[A-Z]\.)?)/g
  ];
  
  patterns.forEach(pattern => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const name = match[1].trim();
      // Filter out common false positives
      if (!isCommonPhrase(name) && name.split(' ').length >= 2) {
        investigators.add(name);
      }
    }
  });
  
  return Array.from(investigators).slice(0, 10);
}

/**
 * Extract research area from text
 * @param {string} text - Text to search
 * @returns {string} - Research area
 */
export function extractResearchArea(text) {
  const areas = {
    'Biochemistry': /biochem|protein|enzyme|metabol/i,
    'Chemistry': /chemist|synthesis|catalys|reaction/i,
    'Biology': /biolog|cell|gene|organism|tissue/i,
    'Physics': /physics|quantum|particle|optic/i,
    'Medicine': /medic|clinical|disease|therap|patient/i,
    'Engineering': /engineer|design|system|device|technolog/i,
    'Neuroscience': /neuro|brain|cognit|neural/i,
    'Materials Science': /material|polymer|nanomaterial|composite/i,
    'Computer Science': /comput|algorithm|software|data/i,
    'Environmental Science': /environment|climate|ecosystem|pollution/i
  };
  
  for (const [area, pattern] of Object.entries(areas)) {
    if (pattern.test(text)) {
      return area;
    }
  }
  
  return 'General Science';
}

/**
 * Extract research methods from text
 * @param {string} text - Text to search
 * @returns {Array<string>} - List of methods
 */
export function extractMethods(text) {
  const methods = [];
  const methodsMap = {
    'NMR Spectroscopy': /NMR|nuclear magnetic resonance/i,
    'Mass Spectrometry': /mass spectrometry|MS\/MS|LC-MS/i,
    'X-ray Crystallography': /x-ray|crystallograph|XRD/i,
    'Electron Microscopy': /electron microscop|TEM|SEM|cryo-EM/i,
    'Cell Culture': /cell culture|tissue culture/i,
    'PCR': /PCR|polymerase chain reaction|qPCR|RT-PCR/i,
    'Flow Cytometry': /flow cytometry|FACS/i,
    'Western Blot': /western blot|immunoblot/i,
    'CRISPR': /CRISPR|gene edit/i,
    'Computational Modeling': /computational|simulat|model/i,
    'Spectroscopy': /spectroscop|fluorescen|UV-Vis/i,
    'Chromatography': /chromatograph|HPLC|GC/i,
    'Sequencing': /sequencing|RNA-seq|DNA-seq|NGS/i,
    'Microscopy': /microscop|imaging|confocal/i,
    'Proteomics': /proteomic|protein analysis/i,
    'Genomics': /genomic|genome analys/i
  };
  
  for (const [method, pattern] of Object.entries(methodsMap)) {
    if (pattern.test(text)) {
      methods.push(method);
    }
  }
  
  return methods.length ? methods : ['Not specified'];
}

/**
 * Extract funding amount from text
 * @param {string} text - Text to search
 * @returns {string} - Funding amount or 'Not specified'
 */
export function extractFundingAmount(text) {
  // Look for various currency patterns
  const patterns = [
    /\$[\d,]+(?:\.\d{2})?(?:\s*(?:million|M|mil))?/i,
    /USD\s*[\d,]+/i,
    /[\d,]+\s*(?:dollars|USD)/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }
  
  return 'Not specified';
}

/**
 * Extract project duration from text
 * @param {string} text - Text to search
 * @returns {string} - Duration or 'Not specified'
 */
export function extractDuration(text) {
  const patterns = [
    /(\d+)[\s-]*(?:year|yr)s?/i,
    /(\d+)[\s-]*months?/i,
    /(\d+)[\s-]*weeks?/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const number = match[1];
      const unit = match[0].toLowerCase().includes('year') ? 'years' :
                   match[0].toLowerCase().includes('month') ? 'months' : 'weeks';
      return `${number} ${unit}`;
    }
  }
  
  return 'Not specified';
}

/**
 * Extract keywords from text
 * @param {string} text - Text to analyze
 * @param {number} limit - Maximum number of keywords
 * @returns {Array<string>} - List of keywords
 */
export function extractKeywords(text, limit = 10) {
  // Common stop words to exclude
  const stopWords = new Set([
    'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have',
    'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'must', 'can', 'shall', 'a', 'an', 'these', 'those',
    'this', 'that', 'their', 'them', 'they', 'we', 'our', 'us', 'it', 'its'
  ]);
  
  // Extract words and count frequency
  const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  const wordCount = {};
  
  words.forEach(word => {
    if (!stopWords.has(word)) {
      wordCount[word] = (wordCount[word] || 0) + 1;
    }
  });
  
  // Sort by frequency and return top keywords
  return Object.entries(wordCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, limit)
    .map(([word]) => word);
}

/**
 * Check if a string is a common phrase (not a name)
 * @param {string} str - String to check
 * @returns {boolean} - True if it's a common phrase
 */
function isCommonPhrase(str) {
  const commonPhrases = [
    'United States', 'New York', 'Los Angeles', 'San Francisco',
    'National Science', 'Research Institute', 'Medical Center',
    'Department of', 'University of', 'Institute of', 'School of',
    'Journal of', 'Proceedings of', 'Annual Review', 'Nature Medicine'
  ];
  
  return commonPhrases.some(phrase => 
    str.toLowerCase().includes(phrase.toLowerCase())
  );
}

/**
 * Create structured data from extracted information
 * @param {Object} extractedData - All extracted data
 * @param {string} filename - Original filename
 * @returns {Object} - Structured data object
 */
export function createStructuredData(extractedData, filename) {
  return {
    filename: filename,
    institution: extractedData.institution || 'Not specified',
    principal_investigator: extractedData.pi || 'Not specified',
    investigators: extractedData.investigators || [],
    research_area: extractedData.researchArea || 'General Science',
    methods: extractedData.methods || [],
    funding_amount: extractedData.fundingAmount || 'Not specified',
    duration: extractedData.duration || 'Not specified',
    keywords: extractedData.keywords || [],
    timestamp: new Date().toISOString(),
    wordCount: extractedData.wordCount || 0,
    metadata: extractedData.metadata || {}
  };
}