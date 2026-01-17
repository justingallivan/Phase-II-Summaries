/**
 * Prompt templates for Concept Evaluator
 *
 * This module provides prompts for the two-stage concept evaluation system:
 * - Stage 1: Initial analysis via Vision API (extracts key info + search keywords)
 * - Stage 2: Final evaluation after literature search (provides ratings + assessment)
 */

/**
 * Stage 1: Initial Analysis Prompt (Vision API)
 * Sent with a single concept page as a PDF image.
 * Extracts key information and keywords for literature search.
 */
export function createInitialAnalysisPrompt() {
  return `You are an expert research evaluator helping to screen early-stage research concepts for potential funding by the W. M. Keck Foundation.

Analyze this single-page research concept and extract key information. This concept page is from a submission packet where researchers propose ideas for potential Phase I funding.

**YOUR TASK:**

Provide a structured analysis with the following information. Return your response as valid JSON.

{
  "title": "The concept title or a descriptive title if not explicitly stated",
  "piName": "Principal Investigator name if mentioned, otherwise null",
  "institution": "Institution name if mentioned, otherwise null",
  "summary": "A 2-3 sentence summary of the core research idea",
  "researchArea": "Primary research category (e.g., 'molecular biology', 'astrophysics', 'materials science', 'neuroscience', 'chemistry', 'computer science', 'engineering')",
  "subfields": ["Array of 2-3 specific subfields or disciplines"],
  "keywords": ["Array of 4-6 specific technical terms for literature searching - focus on methods, techniques, phenomena, or systems that would appear in related publications"],
  "keyMethodologies": ["Array of main experimental or computational approaches proposed"],
  "initialObservations": {
    "innovativeAspects": "What appears novel or innovative about this concept",
    "technicalApproach": "Brief description of the proposed approach",
    "potentialChallenges": "Any obvious technical or practical challenges"
  }
}

**IMPORTANT:**
- Return ONLY valid JSON, no additional text or markdown
- Be specific with keywords - use technical terminology that would appear in academic publications
- If information is not present in the concept, use null for string fields or empty arrays for array fields`;
}

/**
 * Stage 2: Final Evaluation Prompt
 * Receives the initial analysis plus literature search results.
 * Provides comprehensive evaluation with ratings.
 */
export function createFinalEvaluationPrompt(initialAnalysis, literatureResults) {
  const literatureSummary = formatLiteratureResults(literatureResults);

  return `You are an expert research evaluator for the W. M. Keck Foundation. Based on the initial analysis and recent literature search results, provide a comprehensive evaluation of this research concept.

**INITIAL ANALYSIS:**
${JSON.stringify(initialAnalysis, null, 2)}

**RECENT LITERATURE SEARCH RESULTS:**
${literatureSummary}

**KECK FOUNDATION PRIORITIES:**
The Keck Foundation funds projects that are:
- High-risk, high-reward research
- Pioneering and transformative
- Unlikely to be funded through traditional mechanisms (NIH, NSF, etc.)
- Addressing fundamental questions with potentially broad impact

**YOUR TASK:**

Evaluate this concept and provide your assessment as valid JSON:

{
  "title": "${initialAnalysis.title || 'Research Concept'}",
  "piName": ${initialAnalysis.piName ? `"${initialAnalysis.piName}"` : null},
  "institution": ${initialAnalysis.institution ? `"${initialAnalysis.institution}"` : null},
  "summary": "${initialAnalysis.summary || ''}",
  "researchArea": "${initialAnalysis.researchArea || 'Not specified'}",

  "literatureContext": {
    "recentActivityLevel": "High / Moderate / Low (based on number and recency of related publications)",
    "keyFindings": "2-3 sentence summary of what the literature search revealed about this research area",
    "relevantGroups": "Notable research groups or institutions active in this area (if identifiable from search)"
  },

  "noveltyAssessment": {
    "rating": "Strong / Moderate / Weak",
    "reasoning": "2-3 sentences explaining how novel this concept appears based on recent literature"
  },

  "keckAlignment": {
    "rating": "Strong / Moderate / Weak",
    "reasoning": "2-3 sentences explaining fit with Keck priorities (high-risk, pioneering, wouldn't be funded elsewhere)"
  },

  "scientificMerit": {
    "rating": "Strong / Moderate / Weak",
    "reasoning": "2-3 sentences on scientific soundness, clarity of hypothesis, quality of proposed approach"
  },

  "feasibility": {
    "rating": "Strong / Moderate / Weak",
    "reasoning": "2-3 sentences on technical feasibility, potential challenges, likelihood of success"
  },

  "strengths": ["Array of 2-4 notable strengths of this concept"],
  "concerns": ["Array of 2-4 potential issues or red flags"],

  "overallAssessment": "A 3-4 sentence summary suitable for quick scanning by reviewers. Include the key takeaway about whether this concept shows promise for Keck funding."
}

**RATING GUIDELINES:**
- **Strong**: Clearly meets the criterion, compelling case
- **Moderate**: Partially meets the criterion, some positive aspects but also gaps
- **Weak**: Does not adequately meet the criterion, significant concerns

**IMPORTANT:**
- Return ONLY valid JSON, no additional text or markdown
- Be constructive but honest in your assessment
- Consider that these are early-stage concepts, not full proposals`;
}

/**
 * Format literature search results for inclusion in the prompt
 */
function formatLiteratureResults(results) {
  if (!results || results.length === 0) {
    return 'No recent publications found in searched databases.';
  }

  const lines = [];
  lines.push(`Found ${results.length} relevant publications from the past 3 years:\n`);

  // Group by source
  const bySource = {};
  results.forEach(pub => {
    const source = pub.source || 'Unknown';
    if (!bySource[source]) bySource[source] = [];
    bySource[source].push(pub);
  });

  for (const [source, pubs] of Object.entries(bySource)) {
    lines.push(`**${source}** (${pubs.length} results):`);
    pubs.slice(0, 5).forEach(pub => {
      const year = pub.year || pub.publicationDate?.substring(0, 4) || 'N/A';
      const authors = pub.authors?.slice(0, 3).join(', ') || 'Unknown authors';
      const authorsStr = pub.authors?.length > 3 ? `${authors}, et al.` : authors;
      lines.push(`- "${pub.title}" (${year}) - ${authorsStr}`);
    });
    if (pubs.length > 5) {
      lines.push(`  ... and ${pubs.length - 5} more`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Determine which databases to search based on research area
 */
export function selectDatabasesForResearchArea(researchArea) {
  const area = (researchArea || '').toLowerCase();

  // Life sciences
  if (area.includes('biology') || area.includes('biomedical') ||
      area.includes('genetics') || area.includes('genomics') ||
      area.includes('molecular') || area.includes('cell') ||
      area.includes('neuroscience') || area.includes('immunology') ||
      area.includes('cancer') || area.includes('medical') ||
      area.includes('biochem') || area.includes('microbiology')) {
    return { pubmed: true, biorxiv: true, arxiv: false, chemrxiv: false };
  }

  // Chemistry
  if (area.includes('chemistry') || area.includes('chemical') ||
      area.includes('polymer') || area.includes('catalysis') ||
      area.includes('synthesis') || area.includes('materials')) {
    return { pubmed: true, chemrxiv: true, arxiv: false, biorxiv: false };
  }

  // Physics, Math, CS
  if (area.includes('physics') || area.includes('mathematics') ||
      area.includes('computer science') || area.includes('machine learning') ||
      area.includes('artificial intelligence') || area.includes('quantum') ||
      area.includes('astrophysics') || area.includes('astronomy')) {
    return { pubmed: false, arxiv: true, biorxiv: false, chemrxiv: false };
  }

  // Engineering - could be in multiple places
  if (area.includes('engineering')) {
    return { pubmed: true, arxiv: true, biorxiv: false, chemrxiv: false };
  }

  // Default: PubMed only (most comprehensive)
  return { pubmed: true, arxiv: false, biorxiv: false, chemrxiv: false };
}
