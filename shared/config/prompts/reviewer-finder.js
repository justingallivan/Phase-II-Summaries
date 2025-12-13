/**
 * Prompt templates for Expert Reviewer Finder v2
 *
 * This module provides prompts for the tiered reviewer discovery system:
 * - Stage 1: Claude analysis (reasoning + search queries)
 * - Stage 2: Database discovery (verification + new candidates)
 */

/**
 * Stage 1: Main analysis prompt
 * Extracts proposal metadata, generates reviewer suggestions with reasoning,
 * and creates optimized search queries for academic databases.
 */
export function createAnalysisPrompt(proposalText, additionalNotes = '', excludedNames = []) {
  const safeText = proposalText || 'No proposal text provided';
  const truncatedText = safeText.length > 15000
    ? safeText.substring(0, 15000) + '\n\n[...truncated for length...]'
    : safeText;

  const excludedSection = excludedNames.length > 0
    ? `\n**EXCLUDED NAMES (conflicts of interest - do NOT suggest these):**\n${excludedNames.join(', ')}\n`
    : '';

  return `You are an expert at identifying qualified peer reviewers for scientific research proposals. Analyze this proposal and provide structured output for a reviewer discovery system.

**PROPOSAL TEXT:**
${truncatedText}

${additionalNotes ? `**ADDITIONAL CONTEXT FROM USER:**\n${additionalNotes}\n` : ''}
${excludedSection}

**YOUR TASK:**

Analyze this proposal and provide THREE types of output:

---

## PART 1: PROPOSAL METADATA

Extract key information about the proposal:

TITLE: [Complete proposal title]
AUTHOR_INSTITUTION: [University or organization name, or "Not specified"]
PRIMARY_RESEARCH_AREA: [Main scientific discipline]
SECONDARY_AREAS: [Comma-separated list of related fields]
KEY_METHODOLOGIES: [Main techniques/approaches used]
KEYWORDS: [5-8 specific technical terms for database searching]

---

## PART 2: REVIEWER SUGGESTIONS

Suggest 10-15 potential expert reviewers. For each, provide detailed reasoning.

**IMPORTANT CRITERIA:**
- Must be established researchers (professors, senior scientists, PIs)
- Should have relevant expertise to evaluate this specific proposal
- Must NOT be from the author's institution
- Include a mix of seniority levels (rising stars to senior experts)
- For interdisciplinary work, cover all major areas
- Look for names mentioned in references/citations who are relevant

**FORMAT (repeat for each reviewer):**

REVIEWER:
NAME: [Full name with title if known, e.g., "Dr. Jane Smith" or "Jane Smith"]
EXPERTISE: [2-4 specific areas of expertise, comma-separated]
SENIORITY: [Early-career / Mid-career / Senior]
REASONING: [2-3 sentences explaining WHY they are qualified to review this specific proposal. Reference their known work if possible.]
POTENTIAL_CONCERNS: [Any COI concerns, or "None identified"]
SOURCE: [Where you found this name: "References", "Known expert", or "Field leader"]

---

## PART 3: DATABASE SEARCH QUERIES

Generate optimized search queries to find additional reviewers in academic databases.
These should find researchers publishing on topics relevant to this proposal.

**GUIDELINES:**
- Use specific technical terminology from the proposal
- Focus on methods, organisms, phenomena, or systems studied
- Do NOT include author names in queries
- Each query should be 3-6 words
- PubMed queries should work with MeSH terms where applicable

PUBMED_QUERIES:
1. [specific topic query]
2. [second topic query]
3. [third topic query]

ARXIV_QUERIES:
1. [query focused on computational/theoretical aspects]
2. [second query]

BIORXIV_QUERIES:
1. [query focused on experimental biology/preprints]
2. [second query]

---

Now analyze the proposal and provide all three parts:`;
}

/**
 * Stage 2: Generate reasoning for database-discovered candidates
 * Takes publication info and generates "why" reasoning for each candidate
 */
export function createDiscoveredReasoningPrompt(proposalSummary, candidates) {
  const candidatesList = candidates.map((c, i) => {
    const pubs = c.publications?.slice(0, 3).map(p =>
      `  - "${p.title}" (${p.year || 'N/A'})`
    ).join('\n') || '  (No publications available)';

    return `${i + 1}. ${c.name}
   Affiliation: ${c.affiliation || 'Unknown'}
   Recent Publications:
${pubs}`;
  }).join('\n\n');

  return `You are helping identify qualified peer reviewers for a research proposal.

**PROPOSAL SUMMARY:**
${proposalSummary}

**CANDIDATE REVIEWERS FOUND VIA DATABASE SEARCH:**
These researchers were discovered through academic database searches based on their recent publications. Generate a brief reasoning statement explaining why each would be qualified to review this proposal.

${candidatesList}

**YOUR TASK:**
For each candidate, provide:
1. A 1-2 sentence explanation of why their expertise is relevant to this proposal
2. An estimated seniority level based on their publication record

**FORMAT (one per line, maintain the numbering):**
1. REASONING: [Why they're relevant] | SENIORITY: [Early-career/Mid-career/Senior]
2. REASONING: [Why they're relevant] | SENIORITY: [Early-career/Mid-career/Senior]
...

Be concise and specific. Reference how their publications relate to the proposal's research areas.`;
}

/**
 * Parse the Stage 1 analysis response into structured data
 */
export function parseAnalysisResponse(response) {
  if (!response || typeof response !== 'string') {
    return {
      proposalInfo: {},
      reviewerSuggestions: [],
      searchQueries: { pubmed: [], arxiv: [], biorxiv: [] }
    };
  }

  const result = {
    proposalInfo: {},
    reviewerSuggestions: [],
    searchQueries: {
      pubmed: [],
      arxiv: [],
      biorxiv: []
    }
  };

  // Parse proposal metadata
  const metadataFields = [
    'TITLE', 'AUTHOR_INSTITUTION', 'PRIMARY_RESEARCH_AREA',
    'SECONDARY_AREAS', 'KEY_METHODOLOGIES', 'KEYWORDS'
  ];

  for (const field of metadataFields) {
    const regex = new RegExp(`^${field}:\\s*(.+)$`, 'im');
    const match = response.match(regex);
    if (match) {
      const camelKey = field.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      result.proposalInfo[camelKey] = match[1].trim();
    }
  }

  // Parse reviewer suggestions
  const reviewerBlocks = response.split(/REVIEWER:/i).slice(1);

  for (const block of reviewerBlocks) {
    const reviewer = {};

    const nameMatch = block.match(/NAME:\s*(.+?)(?:\n|$)/i);
    if (nameMatch) reviewer.name = nameMatch[1].trim();

    const expertiseMatch = block.match(/EXPERTISE:\s*(.+?)(?:\n|$)/i);
    if (expertiseMatch) {
      reviewer.expertiseAreas = expertiseMatch[1].split(',').map(e => e.trim());
    }

    const seniorityMatch = block.match(/SENIORITY:\s*(.+?)(?:\n|$)/i);
    if (seniorityMatch) reviewer.seniorityEstimate = seniorityMatch[1].trim();

    const reasoningMatch = block.match(/REASONING:\s*(.+?)(?=POTENTIAL_CONCERNS:|SOURCE:|REVIEWER:|$)/is);
    if (reasoningMatch) reviewer.reasoning = reasoningMatch[1].trim();

    const concernsMatch = block.match(/POTENTIAL_CONCERNS:\s*(.+?)(?:\n|SOURCE:|$)/i);
    if (concernsMatch) reviewer.potentialConcerns = concernsMatch[1].trim();

    const sourceMatch = block.match(/SOURCE:\s*(.+?)(?:\n|$)/i);
    if (sourceMatch) reviewer.source = sourceMatch[1].trim();

    if (reviewer.name) {
      result.reviewerSuggestions.push(reviewer);
    }
  }

  // Parse search queries
  const parseQueries = (section, key) => {
    const sectionRegex = new RegExp(`${section}:([\\s\\S]*?)(?=(?:ARXIV_QUERIES|BIORXIV_QUERIES|$))`, 'i');
    const sectionMatch = response.match(sectionRegex);
    if (sectionMatch) {
      const lines = sectionMatch[1].split('\n');
      for (const line of lines) {
        const queryMatch = line.match(/^\d+\.\s*(.+)/);
        if (queryMatch && queryMatch[1].trim().length > 2) {
          result.searchQueries[key].push(queryMatch[1].trim());
        }
      }
    }
  };

  parseQueries('PUBMED_QUERIES', 'pubmed');
  parseQueries('ARXIV_QUERIES', 'arxiv');
  parseQueries('BIORXIV_QUERIES', 'biorxiv');

  return result;
}

/**
 * Parse the discovered candidates reasoning response
 */
export function parseDiscoveredReasoningResponse(response, candidates) {
  if (!response || typeof response !== 'string') {
    return candidates;
  }

  const lines = response.split('\n').filter(line => line.trim());

  for (const line of lines) {
    const match = line.match(/^(\d+)\.\s*REASONING:\s*(.+?)\s*\|\s*SENIORITY:\s*(.+)/i);
    if (match) {
      const index = parseInt(match[1], 10) - 1;
      if (index >= 0 && index < candidates.length) {
        candidates[index].generatedReasoning = match[2].trim();
        candidates[index].seniorityEstimate = match[3].trim();
      }
    }
  }

  return candidates;
}

/**
 * Create a short proposal summary for the reasoning prompt
 */
export function createProposalSummary(proposalInfo) {
  const parts = [];

  if (proposalInfo.title) {
    parts.push(`Title: ${proposalInfo.title}`);
  }
  if (proposalInfo.primaryResearchArea) {
    parts.push(`Research Area: ${proposalInfo.primaryResearchArea}`);
  }
  if (proposalInfo.keyMethodologies) {
    parts.push(`Methods: ${proposalInfo.keyMethodologies}`);
  }
  if (proposalInfo.keywords) {
    parts.push(`Keywords: ${proposalInfo.keywords}`);
  }

  return parts.join('\n');
}

/**
 * Validation helper - check if analysis result is usable
 */
export function validateAnalysisResult(result) {
  const issues = [];

  if (!result.proposalInfo?.title) {
    issues.push('Missing proposal title');
  }

  if (!result.reviewerSuggestions || result.reviewerSuggestions.length === 0) {
    issues.push('No reviewer suggestions generated');
  }

  const allQueries = [
    ...result.searchQueries?.pubmed || [],
    ...result.searchQueries?.arxiv || [],
    ...result.searchQueries?.biorxiv || []
  ];

  if (allQueries.length === 0) {
    issues.push('No search queries generated');
  }

  return {
    valid: issues.length === 0,
    issues
  };
}
