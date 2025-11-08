export const CONFIG = {
  // Claude API Configuration
  CLAUDE_MODEL: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
  CLAUDE_API_URL: 'https://api.anthropic.com/v1/messages',
  ANTHROPIC_VERSION: '2023-06-01',
  
  // Model Parameters
  DEFAULT_MAX_TOKENS: 2000,
  REFINEMENT_MAX_TOKENS: 2500,
  QA_MAX_TOKENS: 1500,
  
  // Temperature settings
  SUMMARIZATION_TEMPERATURE: 0.3,
  REFINEMENT_TEMPERATURE: 0.3,
  QA_TEMPERATURE: 0.4,
  
  // Processing limits
  PDF_SIZE_LIMIT: 50 * 1024 * 1024, // 50MB
  TEXT_TRUNCATE_LIMIT: 15000, // characters for summarization
  QA_TEXT_TRUNCATE_LIMIT: 10000, // characters for structured data extraction
  FUNDING_EXTRACTION_LIMIT: 6000, // characters for PI/institution/keyword extraction (first few pages only)
};

/**
 * W.M. Keck Foundation Funding Guidelines
 *
 * SOURCE: https://www.wmkeck.org/research-overview/#funding-guidelines
 * LAST UPDATED: November 2025
 *
 * INSTRUCTIONS FOR UPDATING:
 * 1. Visit the URL above to view the current guidelines
 * 2. Copy the "What We Fund" and "What We Do Not Fund" sections
 * 3. Paste the text into the respective fields below
 * 4. Update the LAST UPDATED date above
 *
 * These guidelines are used by the Phase I Summarization tool to evaluate
 * whether proposals align with Keck Foundation funding priorities.
 */
export const KECK_GUIDELINES = {
  SOURCE_URL: 'https://www.wmkeck.org/research-overview/#funding-guidelines',

  /**
   * WHAT WE FUND
   * Official Keck Foundation funding criteria
   */
  WHAT_WE_FUND: `
We Fund Projects That:
- Focus on important and emerging areas of research
- Have potential to develop breakthrough technologies, instrumentation, or methodologies
- Are innovative, distinctive, and interdisciplinary
- Demonstrate a high level of risk due to unconventional approaches or challenge the prevailing paradigm
- Have potential for transformative impact such as the founding of a new field of research, enabling of new observations, or altering perception of a previously intractable problem
- Fall outside the mission of public funding agencies
- Demonstrate that W. M. Keck Foundation support is essential to the project's success
  `.trim(),

  /**
   * WHAT WE DO NOT FUND
   * Official Keck Foundation funding exclusions
   */
  WHAT_WE_DO_NOT_FUND: `
We Do Not Fund:
- Public policy research
- Medical devices and translational research
- Treatment trials or research for the sole purpose of drug development
  `.trim(),

  /**
   * Get formatted guidelines for inclusion in prompts
   */
  getFormattedGuidelines: function() {
    return `
**W.M. Keck Foundation Funding Guidelines**
(Source: ${this.SOURCE_URL})

**What We Fund:**
${this.WHAT_WE_FUND}

**What We Do Not Fund:**
${this.WHAT_WE_DO_NOT_FUND}
    `.trim();
  }
};

export const PROMPTS = {
  SUMMARIZATION: (text, summaryLength = 2, summaryLevel = 'technical-non-expert') => {
    // Map summary levels to descriptions
    const levelDescriptions = {
      'general-audience': 'general audience (avoiding technical jargon, explaining concepts in accessible terms)',
      'technical-non-expert': 'technical non-expert audience (using some technical terms but explaining complex concepts clearly)',
      'technical-expert': 'technical expert audience (using field-specific terminology and assuming domain knowledge)',
      'academic': 'academic/scientific audience (using precise scientific language and detailed methodology descriptions)'
    };

    const targetAudience = levelDescriptions[summaryLevel] || levelDescriptions['technical-non-expert'];
    
    return `Please analyze this research proposal and create a comprehensive ${summaryLength}-page summary written for a ${targetAudience}. Follow the exact format and style of the examples below. Use clear, professional language with bullet points for the Executive Summary section and paragraphs for other sections.

**LENGTH REQUIREMENT:** The summary should be approximately ${summaryLength} page${summaryLength > 1 ? 's' : ''} when printed (roughly ${summaryLength * 500} words).

**AUDIENCE LEVEL:** Write for a ${targetAudience}.

**TONE AND LANGUAGE RULES:**
- Use neutral, matter-of-fact language - avoid promotional or effusive terms
- Avoid unnecessary adjectives like "technical", "deep", "rigorous", "proper", "comprehensive", "excellent", "outstanding"
- Write in a straightforward, academic tone similar to scientific review documents
- Use the active voice
- State facts and qualifications directly without embellishment
- Focus on what the researchers do/study rather than how well they do it

**FORMATTING RULES:**
- Principal Investigator names should be underlined using HTML tags <u>Name</u>
- Academic titles should be lowercase (professor, associate professor, assistant professor)  
- Use format: "The principal investigator is <u>John Smith</u>, a professor of biology at [institution]..."
- Co-investigators should also be underlined when mentioned by name using <u>Name</u> tags


**EXECUTIVE SUMMARY FORMAT (use bullet points, 1-3 sentences each):**
• [Key scientific problem or question being addressed - explain in 1-3 sentences]
• [Main hypothesis, approach, or research objective - describe in 1-3 sentences]
• [Who is conducting the research and their key qualifications - summarize in 1-3 sentences]
• [Expected impact or significance of the results - elaborate in 1-3 sentences]
• [Why this research needs foundation support rather than traditional funding - justify in 1-3 sentences]


**OTHER SECTIONS FORMAT (use paragraphs):**

**Background & Impact**
[Paragraph explaining the scientific problem, current state of knowledge, and potential impact. Include specific technical details and context.]

**Methodology** 
[Paragraph describing the research approach, techniques, and experimental design. Be specific about methods and technical approaches.]

**Personnel**
[Paragraph identifying principal investigators, their expertise, and why they are qualified for this work. Include institutional affiliations. Format as: "The principal investigator is <u>[Name]</u>, a [lowercase title] at [institution]. Co-PI <u>[Name]</u> is an [lowercase title]..." State their areas of study and experience directly without promotional language.]

**Justification for Keck Funding**
[Paragraph explaining why traditional funding sources would not support this work, emphasizing risk, innovation, or speculative nature. Focus on the scientific rationale for foundation support rather than financial details.]

Research Proposal Text:
---
${text.substring(0, CONFIG.TEXT_TRUNCATE_LIMIT)} ${text.length > CONFIG.TEXT_TRUNCATE_LIMIT ? '...' : ''}

Write in a neutral, factual tone. Avoid promotional language or unnecessary adjectives. State information directly and let the science speak for itself.`;
  },

  PHASE_I_SUMMARIZATION: (text, summaryLength = 1, summaryLevel = 'technical-non-expert') => {
    // Map summary levels to descriptions for Phase I
    const levelDescriptions = {
      'general-audience': 'a general audience, avoiding technical jargon and explaining concepts in accessible terms',
      'technical-non-expert': 'a technical non-expert audience, using some technical terms but explaining complex concepts clearly',
      'technical-expert': 'a technical expert audience, using field-specific terminology and assuming domain knowledge'
    };

    const targetAudience = levelDescriptions[summaryLevel] || levelDescriptions['technical-non-expert'];

    return `Please analyze this Phase I research proposal and provide a summary with the following structure:

**PART 1 - CORE SUMMARY (${summaryLength} paragraph${summaryLength > 1 ? 's' : ''}):**
Answer these two key questions:
1. What is the proposal about?
2. What are the key questions or hypotheses?

Write exactly ${summaryLength} cohesive paragraph${summaryLength > 1 ? 's' : ''} (3-6 sentences each). If writing multiple paragraphs, the first should focus on what the proposal is about, and subsequent paragraphs should detail the key questions or hypotheses.

**PART 2 - FOUR BULLETS:**
After the paragraph(s), provide exactly four bullet points:

• **Impact & Timing:** Based on information in the proposal and your broader knowledge, explain: (1) What is the impact of the project if it is successful? (2) Why is this important? (3) Why is now the time to do this project?

• **Funding Justification:** Explain the justification and/or need for funding this research. **IMPORTANT: Include specific quantitative budget data when available in the proposal.** Cite dollar amounts for equipment, personnel, supplies, or other resources. If the proposal mentions specific costs (e.g., "$260K for custom instrumentation", "$933K for postdoctoral researchers"), include these numbers. If budget information is not provided in the proposal, focus on the qualitative justification for funding.

• **Research Classification:** In 3-5 sentences, classify whether this proposal represents basic science or applied science research. Provide a clear explanation of your classification based on the proposal's objectives, methods, and intended outcomes. Consider factors such as: the fundamental nature of the questions being investigated, the proximity to practical applications, whether the research seeks to understand underlying principles or solve specific problems, and the timeline to potential real-world impact.

• **Keck Foundation Alignment:** In 3-5 sentences, evaluate whether this proposal aligns with the W.M. Keck Foundation's funding guidelines. Specifically assess whether the proposal fits within the criteria of what the Foundation DOES and DOES NOT fund (see guidelines below). Consider: Does the research fall within supported areas? Does it meet the Foundation's criteria for novelty and innovation? Are there any exclusions or restrictions that would disqualify it?

${KECK_GUIDELINES.getFormattedGuidelines()}

**AUDIENCE LEVEL:**
Write for ${targetAudience}.

**WRITING GUIDELINES:**
- Use clear, concise language appropriate for the audience level
- Focus on the core scientific content
- Include specific details about the research topic and questions being investigated
- Use neutral, matter-of-fact language - avoid promotional terms
- Be direct and specific about what the proposal seeks to study
- Do not include investigator names or institutional affiliations in the paragraph(s)
- Each bullet should be substantive (2-4 sentences)

**CRITICAL: AVOID SUPERLATIVES AND PROMOTIONAL LANGUAGE:**
- DO NOT use words like: groundbreaking, revolutionary, novel, cutting-edge, unprecedented, transformative, paradigm-shifting, breakthrough, pioneering, game-changing, seminal, landmark
- DO NOT use exaggerated adjectives: excellent, outstanding, exceptional, remarkable, extraordinary
- INSTEAD use factual, descriptive language: "This research investigates...", "The study examines...", "The project addresses..."
- Focus on WHAT the research does, not how impressive it is
- State the significance through facts and context, not through promotional adjectives
- Write as if for a technical review document, not a press release

**FORMAT EXAMPLE:**
[Paragraph 1 about what the proposal is about and key questions...]

• **Impact & Timing:** [Impact if successful, why important, why now...]

• **Funding Justification:** The research requires significant investment in specialized equipment ($260K for custom instrumentation), personnel ($933K for postdoctoral researchers), and supplies, with no current external funding committed to this specific approach. [Continue with qualitative justification if needed...]

• **Research Classification:** This proposal represents [basic/applied] science research. [Provide 2-4 sentences explaining the classification based on the research objectives, methods, proximity to applications, and whether it seeks fundamental understanding or practical solutions...]

• **Keck Foundation Alignment:** This proposal [does/does not/partially] aligns with the W.M. Keck Foundation's funding guidelines. [Evaluate specifically against the "What We Fund" and "What We Do Not Fund" criteria. Address whether the research falls within supported areas, meets criteria for novelty/innovation, and whether any restrictions would disqualify it. Be specific about which criteria apply...]

Research Proposal Text:
---
${text.substring(0, CONFIG.TEXT_TRUNCATE_LIMIT)} ${text.length > CONFIG.TEXT_TRUNCATE_LIMIT ? '...' : ''}

Provide your response now following the exact format above.`;
  },

  STRUCTURED_DATA_EXTRACTION: (text, filename) => `Based on this research proposal, please extract the following information and return it as a JSON object.

IMPORTANT: The filename "${filename}" may contain hints about the institution name. Use this information to help identify the correct institution.

{
  "filename": "${filename}",
  "institution": "Primary institution name (check filename for hints)",
  "principal_investigator": "Name of PI",
  "investigators": ["List", "of", "investigators"],
  "research_area": "Main research domain",
  "methods": ["List", "of", "key", "methods"],
  "funding_amount": "Amount requested if mentioned",
  "duration": "Project duration if mentioned",
  "keywords": ["Key", "research", "terms"]
}

Research text:
${text.substring(0, CONFIG.QA_TEXT_TRUNCATE_LIMIT)} ${text.length > CONFIG.QA_TEXT_TRUNCATE_LIMIT ? '...' : ''}

Return only the JSON object, no other text.`,

  REFINEMENT: (currentSummary, feedback) => `You are reviewing and improving a research proposal summary based on user feedback. 

**Current Summary:**
${currentSummary}

**User Feedback:**
${feedback}

**Instructions:**
- Carefully review the current summary and the user's feedback
- Make specific improvements based on the feedback provided
- Maintain the same professional tone and format structure
- Keep the same sections: Executive Summary (with bullet points), Background & Impact, Methodology, Personnel, Justification for Keck Funding
- Use the same formatting rules: underline investigator names with <u>Name</u> tags, lowercase titles
- Do not add fictional information - only reorganize, expand, or refine existing content
- If the feedback asks for information not present in the original, note that it would require the original proposal text

Please provide the refined summary maintaining the exact same format and structure.`,

  QA_SYSTEM: (proposalContext, conversationContext, question) => `You are an AI research assistant helping analyze a research proposal. You have access to web search capabilities and should use them when needed to provide comprehensive, accurate answers.

**Research Proposal Context:**
${proposalContext}

**Previous Conversation:**
${conversationContext}

**Current Question:** ${question}

**Instructions:**
- Answer the question thoroughly and accurately
- Reference specific details from the proposal when relevant
- If the question requires current information, recent research, or context not in the proposal, mention that you would need to search for additional information
- Provide balanced, objective analysis
- If you're uncertain about technical details, acknowledge the limitations
- Keep responses conversational but informative
- Cite specific sections of the proposal when referencing them

Please provide a comprehensive answer to the question.`,

  PEER_REVIEW_ANALYSIS: (reviewTexts) => `Please analyze these peer review documents and provide a comprehensive summary in markdown format. I will provide you with ${reviewTexts.length} peer review document(s).

**INSTRUCTIONS:**

Please create TWO separate markdown outputs:

**OUTPUT 1 - SUMMARY:**

1. **Review Count**: Start with "We received ${reviewTexts.length} review${reviewTexts.length > 1 ? 's' : ''}"

2. **Grade Summary**: Write a sentence summarizing the grades/ratings from the reviews. Look for ratings like Excellent, Very Good, Good, Fair, Poor, or numerical scores. If reviewers provide mixed ratings (like "Excellent/Very Good"), note those. Example: "The proposal received two reviews of Excellent, one of Very Good, and one mixed rating of Good/Fair."

3. **Reviewer Details**: Start with "The reviewers were " and list each reviewer's name underlined using <u>Name</u> format, followed by their institutional affiliation in parentheses. If names/affiliations cannot be determined, state "could not be determined from the review documents." After each reviewer, include their general area of expertise if it can be inferred (e.g., "has expertise in bioinformatics").

4. **Overall Tone & Themes**: Provide 2-3 sentences about the overall tone of the reviews and general themes that emerged across reviewers.

5. **Key Quotations**: Provide relevant quotations from each reviewer, ordered from most positive to most critical. Format as:
   - "The most positive reviewer said: '[quote]'"
   - "Another reviewer noted: '[quote]'" 
   - Continue for each reviewer...
   - "The most critical reviewer noted: '[quote]'"

**OUTPUT 2 - QUESTIONS:**

Create a separate section listing all questions, concerns, or issues raised by the reviewers. Format as a bulleted list.

---

**PEER REVIEW TEXTS:**

${reviewTexts.map((text, index) => `**Review ${index + 1}:**\n${text}\n\n---\n`).join('')}

Please provide both outputs as separate markdown sections.`,

  PEER_REVIEW_QUESTIONS: (reviewTexts) => `Please extract all questions, concerns, issues, and points requiring clarification that were raised by the peer reviewers in these ${reviewTexts.length} review document(s).

**INSTRUCTIONS:**
- Extract any explicit questions asked by reviewers
- Include concerns or issues that imply questions need to be addressed
- Include requests for clarification or additional information
- Format as a bulleted list in markdown
- Group similar questions/concerns together if appropriate
- If no clear questions are found, note "No specific questions were identified in the peer reviews"

**PEER REVIEW TEXTS:**

${reviewTexts.map((text, index) => `**Review ${index + 1}:**\n${text}\n\n---\n`).join('')}

Please provide the questions list in markdown format.`,

  FUNDING_EXTRACTION: (proposalText) => `You are analyzing a research proposal to extract key information for federal funding analysis.

Extract the following information from this proposal:

1. **Principal Investigator (PI)**: The lead researcher's full name
2. **Institution**: The primary institution's official name (university, research center, etc.)
3. **State**: The U.S. state where the institution is located. Use standard two-letter state abbreviations (e.g., CA, NY, MA, TX). If the institution is well-known, infer the state from your knowledge (e.g., "UC Berkeley" → "CA", "MIT" → "MA", "Stanford" → "CA").
4. **Research Keywords**: 5-15 specific scientific terms or phrases that characterize the research area. These should be:
   - Technical terms that appear in the proposal
   - Specific enough to identify funding in this research area
   - Relevant for querying federal funding databases (NSF, NIH, DOE, DOD)
   - A mix of broad domain terms and specific technique/method terms

**IMPORTANT:** Return ONLY a valid JSON object with this exact structure:

{
  "pi": "Full Name",
  "institution": "Institution Name",
  "state": "XX",
  "keywords": ["keyword1", "keyword2", "keyword3", ...]
}

**Rules:**
- Extract 5-15 keywords minimum
- Keywords should be noun phrases or technical terms
- Include both general field terms and specific methodologies
- Do NOT include vague terms like "research", "innovation", "collaboration"
- The state field MUST be a two-letter abbreviation (e.g., CA, NY, MA)
- Do NOT add any explanation or markdown formatting
- Return ONLY the JSON object

Proposal text (first few pages):
${proposalText.substring(0, CONFIG.FUNDING_EXTRACTION_LIMIT)} ${proposalText.length > CONFIG.FUNDING_EXTRACTION_LIMIT ? '...' : ''}

Return only valid JSON:`,

  FUNDING_ANALYSIS: (data) => {
    const { pi, institution, keywords, nsfData, nihData, usaSpendingData, searchYears } = data;

    return `You are a federal funding landscape analyst. Generate a comprehensive markdown report analyzing federal funding for this research proposal using real-time data from multiple federal databases.

**INPUT DATA:**

**Principal Investigator:** ${pi}
**Institution:** ${institution}
**Research Keywords:** ${keywords.join(', ')}
**Search Period:** Past ${searchYears} years

**NSF AWARDS DATA (Real-time from NSF API):**
${JSON.stringify(nsfData, null, 2)}

**NIH PROJECTS DATA (Real-time from NIH RePORTER API):**
${JSON.stringify(nihData, null, 2)}

**USASPENDING.GOV DATA (Real-time federal awards for ${institution}):**
${usaSpendingData.disabled ? 'NOT QUERIED (disabled by user)' : JSON.stringify(usaSpendingData, null, 2)}

**NOTE:** ${usaSpendingData.disabled ? 'USAspending.gov query was disabled. DOE/DOD/NASA data will not be included in this analysis.' : 'USAspending.gov includes awards from DOE, DOD, NASA, and other federal agencies to the institution.'}

---

**GENERATE A COMPREHENSIVE MARKDOWN REPORT:**

# Federal Funding Gap Analysis: ${pi}

## Executive Summary

[Write a 2-3 sentence overview of the PI's overall federal funding position based on all three data sources]

## Principal Investigator Current Funding

### NSF Awards

[Create a markdown table of PI's NSF awards with columns: Award ID, Title, Program, Amount, Start Date, End Date, Status (Active/Expired)]

**Total NSF Funding: $[calculate from data]**
**Active Awards: [count and total $ of awards where expDate is in the future]**

If no awards found, state: "No NSF awards found for ${pi} in the NSF database."

### NIH Projects

[Create a markdown table of PI's NIH projects with columns: Project Title, Organization, Award Amount, Fiscal Year, Project Period]

**Total NIH Funding: $[calculate from nihData.piProjects]**
**Number of Projects: [count from nihData.piProjects.totalCount]**

If no projects found, state: "No NIH projects found for ${pi} in the NIH RePORTER database."

**Total Current PI Funding (NSF + NIH): $[sum of NSF totalFunding + NIH totalFunding]**

${!usaSpendingData.disabled ? `
## Institution Federal Awards (All Agencies)

Based on USAspending.gov data for ${institution}:

**Total Federal Awards (${searchYears} years): $[usaSpendingData.totalFunding]**
**Number of Awards: [usaSpendingData.totalCount]**

### Awards by Agency

[Create a table showing each agency in usaSpendingData.byAgency with columns: Agency, Number of Awards, Total Funding, Top Awards]

This includes DOE, DOD, NASA, and other federal agencies beyond NSF and NIH.
` : '## Institution Federal Awards (DOE/DOD/NASA/Other)\n\n**Data Not Queried:** USAspending.gov was disabled for this analysis. To include institution-wide DOE, DOD, NASA, and other federal agency awards, enable the USAspending.gov option in the configuration.\n'}

## Research Keywords Identified

List the ${keywords.length} keywords extracted and briefly explain why they characterize this research area (1-2 sentences).

Keywords: ${keywords.map(k => `**${k}**`).join(', ')}

## Federal Funding Landscape Analysis

### NSF Funding Landscape

For each keyword with NSF data, provide:
- **Keyword**: [keyword name]
- **Total Awards (${searchYears} years)**: [count]
- **Total Funding**: $[amount]
- **Average Award Size**: $[calculated]
- **Trend Assessment**: Based on the data, assess if this area appears well-funded, moderately funded, or emerging

[Create a table of 3-5 representative recent awards for the most relevant keywords]

### NIH Funding Landscape

For each keyword with NIH data, provide:
- **Keyword**: [keyword name]
- **Total Projects (${searchYears} years)**: [count from nihData.keywordResults]
- **Total Funding**: $[amount from data]
- **Average Award Size**: $[calculated from data]
- **NIH Institute Patterns**: Note which institutes/centers appear most frequently in the data (if visible)
- **Trend Assessment**: Based on the actual data, assess if this area appears well-funded, moderately funded, or emerging

[Create a table of 3-5 representative NIH projects for the most relevant keywords]

### DOE/DOD/Other Agency Funding Landscape

${!usaSpendingData.disabled ? `Based on the USAspending.gov data for ${institution}:

For each major agency in the data (DOE, DOD, NASA, etc.):
- **Agency**: [name]
- **Total Awards (${searchYears} years)**: [count]
- **Total Funding**: $[amount]
- **Recent Activity**: [note if awards appear in recent years]
- **Mission Alignment**: Assess how the research keywords align with this agency's mission based on award descriptions` : `**Data Not Available:** USAspending.gov was disabled for this analysis.

To assess DOE, DOD, NASA, and other agency funding for this research area, you would typically analyze:
- Agency mission alignment with research keywords
- Historical funding patterns in this research area
- Potential program opportunities

However, without real-time data, specific recommendations for these agencies cannot be provided.`}

## Funding Gap Analysis

Create a summary table with indicators based on REAL DATA:

${!usaSpendingData.disabled ? `| Indicator | NSF | NIH | DOE/DOD/Other |
|-----------|-----|-----|---------------|
| PI has current funding | [✓/✗ based on nsfData.piAwards] | [✓/✗ based on nihData.piProjects] | [✓/✗ based on usaSpendingData - note if institution has recent awards] |
| Area has >20 awards (${searchYears} yrs) | [✓/✗ based on nsfData.keywordResults] | [✓/✗ based on nihData.keywordResults] | [✓/✗ based on usaSpendingData.byAgency] |
| Total funding >$10M (${searchYears} yrs) | [✓/✗ based on nsfData totals] | [✓/✗ based on nihData totals] | [✓/✗ based on usaSpendingData.totalFunding] |
| Recent awards (past 2 yrs) | [✓/✗ examine dates in nsfData] | [✓/✗ examine fiscal years in nihData] | [✓/✗ examine dates in usaSpendingData] |
| Research area alignment | [✓/✗ based on keyword matches] | [✓/✗ based on keyword matches] | [✓/✗ based on agency missions and keywords] |` : `| Indicator | NSF | NIH |
|-----------|-----|-----|
| PI has current funding | [✓/✗ based on nsfData.piAwards] | [✓/✗ based on nihData.piProjects] |
| Area has >20 awards (${searchYears} yrs) | [✓/✗ based on nsfData.keywordResults] | [✓/✗ based on nihData.keywordResults] |
| Total funding >$10M (${searchYears} yrs) | [✓/✗ based on nsfData totals] | [✓/✗ based on nihData totals] |
| Recent awards (past 2 yrs) | [✓/✗ examine dates in nsfData] | [✓/✗ examine fiscal years in nihData] |
| Research area alignment | [✓/✗ based on keyword matches] | [✓/✗ based on keyword matches] |`}

**Legend:** ✓ = Yes (confirmed by data), ✗ = No (not found in data)

### Overall Assessment

Provide a balanced, data-driven assessment (${!usaSpendingData.disabled ? '3-4' : '2-3'} paragraphs):

1. **Overall Funding Support Level**: Characterize as well-funded / moderately funded / potential gap / emerging area, citing specific numbers from ${!usaSpendingData.disabled ? 'all three data sources (NSF, NIH, USAspending)' : 'NSF and NIH data sources'}

2. **PI Positioning**: Comment on the PI's current funding position across NSF${!usaSpendingData.disabled ? ', NIH, and any other agencies' : ' and NIH'}

3. **Research Area Observations**: Key patterns in federal funding for this research area ${!usaSpendingData.disabled ? 'across all agencies' : 'across NSF and NIH'}, using actual award counts and funding amounts

${!usaSpendingData.disabled ? '4. **Institutional Context**: How the institution\'s overall federal funding (from USAspending.gov) relates to this specific research area\n\n' : ''}${!usaSpendingData.disabled ? '5' : '4'}. **Potential Gaps or Opportunities**: Identify specific agencies or programs where funding appears limited or untapped, based on the data${!usaSpendingData.disabled ? '' : '. Note that DOE/DOD/NASA data was not queried.'}

${!usaSpendingData.disabled ? '6' : '5'}. **Recommended Actions**: Suggest 3-5 specific, actionable steps for pursuing federal funding, prioritizing agencies that show either (a) strong current funding in the research area or (b) mission alignment but limited current awards

**WRITING GUIDELINES:**
- Use ONLY the actual data provided from the ${!usaSpendingData.disabled ? 'three APIs (NSF, NIH, USAspending)' : 'two APIs (NSF, NIH)'}
- Cite specific numbers: award counts, funding amounts, dates
- Do NOT make assumptions beyond what the data shows
- If data is missing or incomplete, state that explicitly
${!usaSpendingData.disabled ? '- Note that USAspending data is institution-wide, not PI-specific\n' : '- Note that DOE/DOD/NASA/other agency data was not queried in this analysis\n'}- Avoid superlatives and promotional language
- Focus on patterns and trends visible in the real data
- Provide actionable, data-driven insights

Generate the complete report now:`;
  },

  BATCH_FUNDING_SUMMARY: (proposals, searchYears) => `Generate a summary comparison table for ${proposals.length} analyzed proposals.

**INPUT DATA:**
${JSON.stringify(proposals, null, 2)}

**GENERATE COMPARISON MARKDOWN:**

# Federal Funding Gap Analysis - Batch Summary

## Overview

Analyzed ${proposals.length} research proposals for federal funding landscape and potential gaps.

**Search Period:** Past ${searchYears} years

## Comparison Table

| PI Name | Institution | Total Active NSF $ | NSF Award Count | Primary Research Keywords | Gap Assessment |
|---------|-------------|-------------------|-----------------|--------------------------|----------------|
${proposals.map(p => `| ${p.pi} | ${p.institution} | ${p.nsfTotalFunding || '$0'} | ${p.nsfAwardCount || 0} | ${p.keywords.slice(0, 3).join(', ')} | ${p.gapAssessment || 'See individual report'} |`).join('\n')}

## Key Findings

### Well-Funded Research Areas

[List 3-5 research areas or keywords that show strong federal support based on the NSF data across proposals]

### Potential Funding Gaps Identified

[List research areas or specific proposals that show limited federal funding based on the analysis]

### Research Areas by Federal Agency Alignment

**Strong NSF Alignment:**
[List proposals/areas with significant NSF activity]

**Strong NIH Potential:**
[List proposals that appear aligned with NIH mission based on keywords]

**DOE/DOD Opportunities:**
[List proposals that may align with energy or defense priorities]

## Recommendations

Provide brief, actionable recommendations for each category of proposals (2-3 sentences per category).

Be concise and data-driven. Focus on patterns across the batch of proposals.`
};
