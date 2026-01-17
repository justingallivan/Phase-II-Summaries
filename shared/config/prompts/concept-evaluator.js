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

  return `You are a critical, skeptical research evaluator for the W. M. Keck Foundation. Your job is to help identify which concepts genuinely stand out and which have significant weaknesses. Most concepts will have notable flaws - that's expected and useful information.

**CRITICAL EVALUATION PRINCIPLES:**
- Be skeptical by default. Most concepts are NOT exceptional.
- Avoid cheerleading language like "exciting," "pioneering," or "exactly what Keck should fund."
- Use plain, direct language. State facts and observations, not enthusiasm.
- If something is unclear or missing from the concept, note it as a weakness.
- "Strong" ratings should be rare - reserve them for truly exceptional cases.
- Most concepts should receive "Moderate" or "Weak" in at least some categories.
- Every concept should have substantive concerns listed - there are always risks and gaps.

**INITIAL ANALYSIS:**
${JSON.stringify(initialAnalysis, null, 2)}

**RECENT LITERATURE SEARCH RESULTS:**
${literatureSummary}

**KECK FOUNDATION CRITERIA (be strict in applying these):**
- High-risk, high-reward: Is the risk genuinely high? Is the potential reward transformative, or just incremental?
- Pioneering: Is this truly new, or a variation on existing work? The literature search results are relevant here.
- Not fundable elsewhere: Would NIH, NSF, or DOE plausibly fund this? If yes, it's not a strong Keck fit.
- Fundamental questions: Does this address a deep scientific question, or is it applied/translational work?

**KEY EVALUATION FRAMING:**
The most important question is: "If everything the researchers propose turns out to be correct, will that have a significant impact on the field or the world?"
- If YES: High priority concept worth serious consideration
- If NO: Lower priority regardless of feasibility

Feasibility is a secondary criterion but still valuable. Identify feasibility concerns so they can be addressed before the next stage. Peer reviewers will evaluate feasibility in detail later, but early identification of challenges is helpful.

**YOUR TASK:**

Provide a critical, honest evaluation as valid JSON:

{
  "title": "${initialAnalysis.title || 'Research Concept'}",
  "piName": ${initialAnalysis.piName ? `"${initialAnalysis.piName}"` : null},
  "institution": ${initialAnalysis.institution ? `"${initialAnalysis.institution}"` : null},
  "summary": "${initialAnalysis.summary || ''}",
  "researchArea": "${initialAnalysis.researchArea || 'Not specified'}",

  "literatureContext": {
    "recentActivityLevel": "High / Moderate / Low",
    "keyFindings": "What does the literature reveal? Is this area crowded or sparse? Are others already doing similar work?",
    "relevantGroups": "Who else is working on this? (If many groups, that's a novelty concern.)"
  },

  "noveltyAssessment": {
    "rating": "Strong / Moderate / Weak",
    "reasoning": "Based on the literature: Is this genuinely new, or are others already pursuing similar approaches? Be specific."
  },

  "keckAlignment": {
    "rating": "Strong / Moderate / Weak",
    "reasoning": "Apply the criteria strictly. Would NSF/NIH fund this? Is the risk genuine or overstated? Is the reward truly transformative?"
  },

  "scientificMerit": {
    "rating": "Strong / Moderate / Weak",
    "reasoning": "Is the hypothesis clear? Is the approach sound? What's missing or unclear in the concept description?"
  },

  "potentialImpact": {
    "rating": "Strong / Moderate / Weak",
    "reasoning": "IF everything proposed turns out correct, what is the impact? Would this change the field or have broader significance? Be specific about what the impact would be."
  },

  "feasibility": {
    "rating": "Strong / Moderate / Weak",
    "reasoning": "Identify technical challenges, resource requirements, or practical obstacles. What would need to go right for this to succeed? Are there concerns the researchers should address before the next stage?"
  },

  "strengths": ["2-4 genuine strengths - be specific, not generic"],
  "concerns": ["2-4 substantive concerns - every concept has weaknesses, identify them clearly"],

  "overallAssessment": "A direct 2-3 sentence summary. State the main strength and the main weakness. Avoid superlatives and promotional language."
}

**RATING DISTRIBUTION GUIDANCE:**
- "Strong" = Top 10-20% of concepts. Truly exceptional with few concerns.
- "Moderate" = Typical concept. Has merit but also clear gaps or concerns.
- "Weak" = Significant problems. Missing key elements or poor fit.

Most concepts should have a mix of ratings. A concept with all "Strong" ratings should be rare.

**LANGUAGE TO AVOID:**
- "This represents exactly the type of..."
- "Exciting," "groundbreaking," "pioneering" (unless truly warranted)
- "Perfect fit for Keck"
- Generic praise that could apply to any concept

**LANGUAGE TO USE:**
- "The concept proposes..." (neutral description)
- "A potential weakness is..."
- "The literature suggests this area is [active/sparse]..."
- "It's unclear whether..." (when information is missing)
- "This could be funded by [NIH/NSF] because..." (if applicable)

Return ONLY valid JSON, no additional text or markdown.`;
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
