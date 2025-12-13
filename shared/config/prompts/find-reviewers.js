/**
 * Prompt templates and utilities for the Find Reviewers feature
 */

/**
 * Creates a prompt to extract structured information from a research proposal
 */
export function createExtractionPrompt(proposalText, additionalNotes = '') {
  // Handle null/undefined proposalText
  const safeText = proposalText || 'No proposal text provided';
  
  return `Please analyze this research proposal and extract the following information in a structured format:

**PROPOSAL TEXT:**
${safeText.substring(0, 8000)} ${safeText.length > 8000 ? '...[truncated]' : ''}

${additionalNotes ? `**ADDITIONAL CONTEXT:**\n${additionalNotes}\n` : ''}

**EXTRACT THE FOLLOWING (use "Not specified" if not found):**

1. **TITLE:** [Complete proposal title]
2. **PRIMARY_RESEARCH_AREA:** [Main scientific discipline, e.g., "Computational Neuroscience"]
3. **SECONDARY_AREAS:** [Additional relevant fields, comma-separated]
4. **KEY_METHODOLOGIES:** [Experimental techniques, computational approaches, comma-separated]
5. **AUTHOR_INSTITUTION:** [University or institution name]
6. **RESEARCH_SCOPE:** [Theoretical/Experimental/Computational/Mixed]
7. **INTERDISCIPLINARY:** [Yes/No - does this span multiple major disciplines?]
8. **KEY_INNOVATIONS:** [Main novel contributions or approaches]
9. **APPLICATION_DOMAINS:** [Practical applications or impact areas]

Please format your response exactly as shown below:
TITLE: [extracted title]
PRIMARY_RESEARCH_AREA: [main area]
SECONDARY_AREAS: [areas]
KEY_METHODOLOGIES: [methods]
AUTHOR_INSTITUTION: [institution]
RESEARCH_SCOPE: [scope]
INTERDISCIPLINARY: [Yes/No]
KEY_INNOVATIONS: [innovations]
APPLICATION_DOMAINS: [domains]`;
}

/**
 * Creates a prompt to find expert reviewers based on extracted proposal information
 */
export function createReviewerPrompt(extractedInfo, suggestedReviewers = '', excludedReviewers = '', proposalText = '', reviewerCount = 15) {
  // Handle null/undefined extractedInfo
  const safeInfo = extractedInfo || {};
  const safeProposalText = proposalText || '';
  
  // Extract abstract or use first part of proposal
  const abstract = extractProposalSection(safeProposalText, 'abstract') || 
                   extractProposalSection(safeProposalText, 'summary') ||
                   (safeProposalText ? safeProposalText.substring(0, 1500) + '...' : 'No proposal text provided');
  
  return `You are helping identify expert reviewers for a scientific research proposal. Based on the information below, please identify approximately ${reviewerCount} potential reviewers who would be qualified to evaluate this work.

**PROPOSAL INFORMATION:**
- Title: ${safeInfo.title || 'Not specified'}
- Primary Research Area: ${safeInfo.primaryResearchArea || 'Not specified'}
- Secondary Areas: ${safeInfo.secondaryAreas || 'Not specified'}
- Key Methodologies: ${safeInfo.keyMethodologies || 'Not specified'}
- Research Scope: ${safeInfo.researchScope || 'Not specified'}
- Interdisciplinary: ${safeInfo.interdisciplinary || 'Not specified'}
- Key Innovations: ${safeInfo.keyInnovations || 'Not specified'}
- Application Domains: ${safeInfo.applicationDomains || 'Not specified'}

**PROPOSAL ABSTRACT/EXCERPT:**
${abstract}

**CONSTRAINTS:**
- Author Institution: ${safeInfo.authorInstitution || 'Not specified'} (avoid reviewers from this institution)
${suggestedReviewers ? `- Suggested Reviewers (consider including if appropriate): ${suggestedReviewers}` : ''}
${excludedReviewers ? `- Excluded Reviewers (must not include): ${excludedReviewers}` : ''}

**REVIEWER CRITERIA:**
1. Must be professors, senior scientists, or established researchers (not students/postdocs)
2. Should have demonstrated expertise in the proposal's research areas
3. Preferably have recent publications in relevant fields
4. Must NOT be from the same institution as the proposal author
5. Should represent a mix of seniority levels (rising stars to senior experts)
6. For interdisciplinary work, include experts from each major area

**OUTPUT FORMAT:**
Provide a numbered list of ${reviewerCount} potential reviewers. For each reviewer, include:

[Number]. **Name, Title**
   Institution: [University/Organization, Department]
   Expertise: [Relevant areas of expertise]
   Why Good Match: [2-3 sentences explaining their specific qualifications for reviewing this proposal]
   Potential Concerns: [Any conflicts or limitations, if applicable]
   Seniority: [Early Career/Mid-Career/Senior]

**IMPORTANT NOTES:**
- Prioritize reviewers whose expertise closely aligns with the proposal's core topics
- Include some generalists who can evaluate broader impacts
- Note any potential conflicts of interest (e.g., known collaborations)
- For interdisciplinary proposals, ensure coverage of all major areas
- Consider geographic and institutional diversity

Please provide your recommendations as a clear, formatted list that can be easily reviewed and used for reviewer selection.`;
}

/**
 * Parses the extraction response into a structured object
 */
export function parseExtractionResponse(response) {
  // Handle null/undefined response
  if (!response || typeof response !== 'string') {
    return {};
  }
  
  const info = {};
  const lines = response.split('\n');
  
  lines.forEach(line => {
    if (line.includes(':')) {
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();
      
      // Convert key to camelCase and clean it
      const cleanKey = key.trim()
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/[^a-z\s]/g, '')
        .split(' ')
        .map((word, index) => index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
      
      if (cleanKey && value) {
        info[cleanKey] = value;
      }
    }
  });
  
  return info;
}

/**
 * Extracts a specific section from the proposal text
 */
export function extractProposalSection(text, sectionName) {
  // Handle null/undefined inputs
  if (!text || !sectionName || typeof text !== 'string') {
    return null;
  }
  
  // Try multiple patterns to find the section
  const patterns = [
    new RegExp(`${sectionName}[:\\s]*([^\\n]*(?:\\n[^A-Z\\n][^:]*)*?)(?=\\n\\n|\\n[A-Z][^a-z]*:|$)`, 'i'),
    new RegExp(`${sectionName}[:\\s]*([^\\n]+(?:\\n(?![A-Z][^a-z]*:)[^\\n]*)*?)`, 'i'),
    new RegExp(`\\b${sectionName}\\b[\\s]*([\\s\\S]{50,1500}?)(?=\\n[A-Z]|$)`, 'i')
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const extracted = match[1].trim();
      if (extracted.length > 50) {
        return extracted.substring(0, 2000);
      }
    }
  }
  
  return null;
}

/**
 * Formats the reviewer recommendations for display
 */
export function formatReviewerRecommendations(reviewerText) {
  // This function can be used to further process or format the reviewer recommendations
  // Currently returns as-is, but can be enhanced for better display
  return reviewerText;
}

/**
 * Creates a prompt to generate optimized search queries for academic databases
 * This is used by Expert Reviewers Pro to find relevant researchers
 */
export function createSearchQueryPrompt(proposalText, additionalNotes = '') {
  const safeText = proposalText || 'No proposal text provided';

  return `Analyze this research proposal to identify potential expert reviewers. You will generate two types of outputs:
1. TOPIC-BASED search queries for finding new experts via academic databases
2. SPECIFIC NAMES of researchers mentioned in references who would make good reviewers

**PROPOSAL TEXT:**
${safeText.substring(0, 10000)} ${safeText.length > 10000 ? '...[truncated]' : ''}

${additionalNotes ? `**ADDITIONAL CONTEXT:**\n${additionalNotes}\n` : ''}

**YOUR TASK:**

**PART 1 - TOPIC QUERIES:** Generate specific search queries to find researchers publishing on these topics. These should be:
- Specific scientific terms (not just "biology" or "machine learning")
- Technical terminology from the proposal
- Focus on methods, organisms, phenomena, or systems studied
- Do NOT include author names in topic queries

**PART 2 - REVIEWER NAMES:** Extract names of researchers from the proposal's references/citations who would be qualified reviewers. Look for:
- Frequently cited authors in the field
- Authors of foundational or highly relevant papers
- Senior researchers (not first authors of cited papers unless clearly established)
- Exclude the proposal authors themselves

**OUTPUT FORMAT (follow exactly):**
TITLE: [proposal title]
AUTHOR_INSTITUTION: [institution name, or "Not specified" if unclear]

PUBMED_QUERIES:
1. [specific topic query - no names]
2. [second topic query]
3. [third topic query]

ARXIV_QUERIES:
1. [specific topic query - focus on computational/methods]
2. [second topic query]

BIORXIV_QUERIES:
1. [specific topic query - focus on experimental biology]
2. [second topic query]

POTENTIAL_REVIEWERS:
1. [Full Name] - [why they would be a good reviewer, based on their cited work]
2. [Full Name] - [reason]
3. [Full Name] - [reason]
4. [Full Name] - [reason]
5. [Full Name] - [reason]
(list up to 10 potential reviewers from references)

**EXAMPLE for a proposal about "Using CRISPR to edit mitochondrial DNA in cardiomyocytes":**
PUBMED_QUERIES:
1. mitochondrial DNA editing cardiomyocytes
2. CRISPR mitochondria heart cells
3. mtDNA mutations cardiac gene therapy

ARXIV_QUERIES:
1. CRISPR delivery optimization
2. gene editing computational modeling

BIORXIV_QUERIES:
1. mitochondrial genome editing
2. cardiomyocyte gene therapy

POTENTIAL_REVIEWERS:
1. Carlos Moraes - leading expert in mitochondrial genetics, frequently cited
2. Vamsi Bhata - pioneered cardiac gene therapy approaches
3. Jin Zhang - expert in CRISPR delivery to cardiomyocytes

Now analyze the proposal and generate both topic queries and reviewer names:`;
}

/**
 * Parses the search query response into a structured object
 */
export function parseSearchQueryResponse(response) {
  if (!response || typeof response !== 'string') {
    return { title: '', authorInstitution: '', queries: {}, potentialReviewers: [] };
  }

  const result = {
    title: '',
    authorInstitution: '',
    queries: {
      pubmed: [],
      arxiv: [],
      biorxiv: []
    },
    potentialReviewers: []
  };

  const lines = response.split('\n');
  let currentSection = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('TITLE:')) {
      result.title = trimmed.replace('TITLE:', '').trim();
    } else if (trimmed.startsWith('AUTHOR_INSTITUTION:')) {
      result.authorInstitution = trimmed.replace('AUTHOR_INSTITUTION:', '').trim();
    } else if (trimmed === 'PUBMED_QUERIES:') {
      currentSection = 'pubmed';
    } else if (trimmed === 'ARXIV_QUERIES:') {
      currentSection = 'arxiv';
    } else if (trimmed === 'BIORXIV_QUERIES:') {
      currentSection = 'biorxiv';
    } else if (trimmed === 'POTENTIAL_REVIEWERS:') {
      currentSection = 'reviewers';
    } else if (currentSection && /^\d+\./.test(trimmed)) {
      // Extract the content (remove the number prefix)
      const content = trimmed.replace(/^\d+\.\s*/, '').trim();

      if (currentSection === 'reviewers') {
        // Parse reviewer: "Name - reason" format
        const dashIndex = content.indexOf(' - ');
        if (dashIndex > 0) {
          const name = content.substring(0, dashIndex).trim();
          const reason = content.substring(dashIndex + 3).trim();
          if (name && name.length > 2) {
            result.potentialReviewers.push({ name, reason });
          }
        } else if (content.length > 2) {
          // Just a name without reason
          result.potentialReviewers.push({ name: content, reason: '' });
        }
      } else if (currentSection && content.length > 2) {
        result.queries[currentSection].push(content);
      }
    }
  }

  return result;
}

/**
 * Validates and cleans reviewer data
 */
export function validateReviewerData(reviewerText, excludedList = []) {
  if (!reviewerText) return null;
  
  // Convert excluded list to lowercase for case-insensitive comparison
  const excluded = excludedList.map(name => name.toLowerCase().trim()).filter(Boolean);
  
  if (excluded.length === 0) return reviewerText;
  
  // Check if any excluded reviewers are mentioned
  const lines = reviewerText.split('\n');
  const filteredLines = lines.filter(line => {
    const lineLower = line.toLowerCase();
    return !excluded.some(excludedName => lineLower.includes(excludedName));
  });
  
  return filteredLines.join('\n');
}