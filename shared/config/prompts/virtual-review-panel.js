/**
 * Prompt templates for Virtual Review Panel
 *
 * Two-stage review process per LLM:
 * - Stage 1 (Claim Verification): Verify novelty claims, check for precedent in literature
 * - Stage 2 (Structured Review): Answer the WMKF reviewer form questions
 * - Synthesis: Claude summarizes consensus, disagreements, and questions across all reviewers
 */

/**
 * WMKF Reviewer Form — the 11 questions human reviewers answer.
 * Used to structure Stage 2 prompts and parse responses.
 */
export const REVIEWER_FORM_QUESTIONS = [
  {
    key: 'impactRating',
    type: 'scale',
    question: 'If the proposed project is successful in its entirety, how will it impact the field?',
    levels: ['Little to no impact', 'Will result in publications of disciplinary interest', 'Will result in publications of broad interest', 'Will rewrite textbooks'],
  },
  {
    key: 'impactNarrative',
    type: 'text',
    question: 'What specific significant impacts do you foresee?',
  },
  {
    key: 'riskRating',
    type: 'scale',
    question: 'How risky is the project overall?',
    levels: ['Low risk (will likely work in its entirety)', 'Medium risk (parts will be successful while others may fail)', 'High risk (significant risk of failure)', 'Impossible (there is a fatal flaw)'],
  },
  {
    key: 'riskNarrative',
    type: 'text',
    question: 'What are the risks associated with the project? Are the risks technical, related to a hypothesis, or is the team trying to do too much?',
  },
  {
    key: 'methodsAssessment',
    type: 'text',
    question: 'Are the methods, data gathering, and/or analysis appropriate for the project to be successful?',
  },
  {
    key: 'questionsForPI',
    type: 'text',
    question: 'Are there questions or issues that the Foundation should raise with the PI before making an award?',
  },
  {
    key: 'teamAssessment',
    type: 'text',
    question: 'Do you believe the team has the necessary personnel and infrastructure to perform the work?',
  },
  {
    key: 'fundingAlternatives',
    type: 'text',
    question: 'The Foundation strives to support projects that would not likely be funded elsewhere. Do you think this project in its current form could likely be supported by a traditional funding agency?',
  },
  {
    key: 'budgetIssues',
    type: 'text',
    question: 'Are there any issues with the budget?',
  },
  {
    key: 'overallRating',
    type: 'scale',
    question: 'Please assign an overall rating to the proposal.',
    levels: ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'],
  },
  {
    key: 'additionalComments',
    type: 'text',
    question: 'Is there anything else you\'d like to share about the proposal or this review process?',
    optional: true,
  },
];

/**
 * Stage 1: Claim Verification prompt (general — for Claude, GPT, Gemini)
 *
 * Asks the LLM to identify and verify key claims in the proposal,
 * especially novelty claims, and flag any precedent or concerns.
 */
export function createClaimVerificationPrompt(proposalText) {
  return `You are an expert scientific reviewer conducting due diligence on a research grant proposal submitted to the W. M. Keck Foundation. Your task is to identify and verify the key claims made in this proposal.

Focus especially on:
1. **Novelty claims** — Does the proposer claim something is "first," "novel," "unprecedented," or "new"? Is there precedent in the literature?
2. **Feasibility claims** — Are the proposed methods proven? Are there technical barriers the authors don't acknowledge?
3. **Impact claims** — Are the stated impacts realistic given the scope and budget?
4. **Team credentials** — Do the described qualifications match what's needed for the proposed work?

For each significant claim you identify, assess whether it is:
- **Supported**: Consistent with established knowledge
- **Partially supported**: Some merit but overstated or missing context
- **Unsupported**: No clear basis or contradicted by known evidence
- **Needs verification**: Cannot determine without additional sources

Return your analysis as JSON:
{
  "claims": [
    {
      "claim": "The exact or paraphrased claim from the proposal",
      "category": "novelty | feasibility | impact | credentials",
      "assessment": "supported | partially_supported | unsupported | needs_verification",
      "reasoning": "Your detailed reasoning, citing any known precedent or evidence",
      "confidence": "high | medium | low"
    }
  ],
  "overallNoveltyAssessment": "A 2-3 sentence summary of whether this proposal is genuinely novel",
  "redFlags": ["List any serious concerns that should be investigated further"],
  "backgroundContext": "A brief summary of the relevant research landscape that provides context for the Stage 2 review"
}

PROPOSAL TEXT:
${proposalText}`;
}

/**
 * Stage 1: Claim Verification prompt for Perplexity (search-oriented)
 *
 * Leverages Perplexity's built-in web search to verify claims with citations.
 */
export function createPerplexityClaimVerificationPrompt(proposalText) {
  return `You are an expert scientific reviewer verifying the claims in a research grant proposal submitted to the W. M. Keck Foundation. Use your web search capabilities to check each claim against current literature and recent publications.

Focus especially on:
1. **Novelty claims** — Search for existing work that may already address what the proposers claim is new. Look for recent papers, preprints, and conference proceedings.
2. **Feasibility claims** — Search for evidence that the proposed methods have been demonstrated or have known limitations.
3. **Impact claims** — Search for the current state of the field to assess whether the claimed impacts are realistic.
4. **Team credentials** — Search for the PI and co-PIs to verify their relevant expertise and publication record.

For each significant claim, provide specific citations and URLs where possible.

Return your analysis as JSON:
{
  "claims": [
    {
      "claim": "The exact or paraphrased claim from the proposal",
      "category": "novelty | feasibility | impact | credentials",
      "assessment": "supported | partially_supported | unsupported | needs_verification",
      "reasoning": "Your detailed reasoning with specific citations",
      "sources": ["URLs or citation strings for evidence found"],
      "confidence": "high | medium | low"
    }
  ],
  "overallNoveltyAssessment": "A 2-3 sentence summary of whether this proposal is genuinely novel, with key citations",
  "redFlags": ["List any serious concerns with supporting evidence"],
  "backgroundContext": "A brief summary of the relevant research landscape that provides context for the Stage 2 review"
}

PROPOSAL TEXT:
${proposalText}`;
}

/**
 * Stage 2: Structured Review prompt
 *
 * Asks the LLM to complete the WMKF reviewer form, optionally incorporating
 * claim verification results from Stage 1.
 */
export function createStructuredReviewPrompt(proposalText, claimVerificationResults = null) {
  const claimContext = claimVerificationResults
    ? `\n\nPRIOR CLAIM VERIFICATION ANALYSIS:\nThe following claim verification was performed before this review. Use this context to inform your assessments, especially regarding novelty and feasibility:\n${JSON.stringify(claimVerificationResults, null, 2)}\n`
    : '';

  return `You are an expert peer reviewer evaluating a research grant proposal for the W. M. Keck Foundation. The Foundation strives to fund research projects that may open new scientific directions, produce breakthrough discoveries, or lead to new technologies.

Please evaluate this proposal by answering the following questions, which are the same questions asked of human reviewers. Be thorough, specific, and candid in your assessment. Ground your evaluation in the specific details of the proposal.
${claimContext}
Answer each question carefully and return your review as JSON with exactly these keys:

{
  "impactRating": "One of: Little to no impact | Will result in publications of disciplinary interest | Will result in publications of broad interest | Will rewrite textbooks",
  "impactNarrative": "What specific significant impacts do you foresee? (2-4 sentences)",
  "riskRating": "One of: Low risk | Medium risk | High risk | Impossible",
  "riskNarrative": "What are the risks? Are they technical, hypothesis-related, or scope-related? (2-4 sentences)",
  "methodsAssessment": "Are the methods, data gathering, and/or analysis appropriate? (2-4 sentences)",
  "questionsForPI": "Questions or issues the Foundation should raise with the PI before making an award (bulleted list as a string)",
  "teamAssessment": "Does the team have the necessary personnel and infrastructure? (2-3 sentences)",
  "fundingAlternatives": "Could this project be supported by a traditional funding agency like NSF or NIH? Why or why not? (2-3 sentences)",
  "budgetIssues": "Are there any issues with the budget? (1-3 sentences, or 'No significant budget concerns identified')",
  "overallRating": "One of: Excellent | Very Good | Good | Fair | Poor",
  "additionalComments": "Any other observations about the proposal (optional, 1-3 sentences or null)"
}

Important:
- For rating fields, use EXACTLY one of the specified options
- Be specific — reference actual proposal content, not generic statements
- If you lack information to answer a question fully, say so explicitly

PROPOSAL TEXT:
${proposalText}`;
}

/**
 * Synthesis: Panel Summary prompt
 *
 * Claude synthesizes all individual reviews into a panel summary with
 * consensus, disagreements, rating matrix, and questions for the PI.
 */
export function createPanelSynthesisPrompt(reviews, claimVerifications = null) {
  const reviewSections = reviews
    .map(r => `### ${r.providerName} (${r.model})\n${JSON.stringify(r.parsedResponse, null, 2)}`)
    .join('\n\n');

  const claimSection = claimVerifications
    ? `\n\nCLAIM VERIFICATION RESULTS:\n${claimVerifications.map(cv =>
      `### ${cv.providerName}\n${JSON.stringify(cv.parsedResponse, null, 2)}`
    ).join('\n\n')}\n`
    : '';

  return `You are the chair of a review panel for the W. M. Keck Foundation. Multiple independent reviewers have evaluated a grant proposal. Your job is to synthesize their reviews into a panel summary.
${claimSection}
INDIVIDUAL REVIEWS:
${reviewSections}

Produce a panel summary as JSON:

{
  "ratingMatrix": {
    "impactRating": { "reviewer1_name": "rating", "reviewer2_name": "rating", ... },
    "riskRating": { "reviewer1_name": "rating", "reviewer2_name": "rating", ... },
    "overallRating": { "reviewer1_name": "rating", "reviewer2_name": "rating", ... }
  },
  "consensus": [
    "Points where all or most reviewers agree (be specific, 3-6 points)"
  ],
  "disagreements": [
    {
      "topic": "What they disagree about",
      "positions": { "reviewer_name": "their position", ... },
      "significance": "Why this disagreement matters for the funding decision"
    }
  ],
  "questionsForPI": [
    "Consolidated unique questions from all reviewers that the Foundation should raise with the PI (deduplicated and prioritized)"
  ],
  "claimVerificationHighlights": [
    "Key findings from claim verification that the panel should be aware of (if claim verification was performed)"
  ],
  "panelRecommendation": "A 3-5 sentence overall panel assessment synthesizing the reviews. Note the overall consensus rating trend, key strengths, key concerns, and whether the panel leans toward funding or not.",
  "confidenceNote": "A 1-2 sentence note about the confidence level of this virtual review — what aspects are well-suited to AI review vs. what would benefit from human expert judgment"
}

Important:
- Use actual reviewer names (provider names) in the rating matrix and disagreements
- Deduplicate questions — combine similar questions from different reviewers
- Be balanced — represent all viewpoints fairly
- The confidenceNote should be honest about AI limitations (e.g., inability to verify lab capabilities, assess team dynamics, or evaluate truly novel approaches outside training data)`;
}

/**
 * Parse a JSON response from an LLM, handling markdown code blocks
 */
export function parseJSONResponse(text) {
  if (!text) return null;

  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Try extracting from markdown code block
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        return JSON.parse(match[1].trim());
      } catch {
        // Fall through
      }
    }

    // Try finding first { to last }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(text.substring(firstBrace, lastBrace + 1));
      } catch {
        // Fall through
      }
    }
  }

  return null;
}
