/**
 * Prompt templates for reviewer email personalization
 *
 * Used by the generate-emails API endpoint to optionally personalize
 * invitation emails using Claude.
 */

/**
 * Create a prompt for personalizing a reviewer invitation email
 *
 * @param {Object} candidate - Candidate info (name, affiliation, expertise)
 * @param {Object} proposal - Proposal info (title, abstract, PI)
 * @param {string} baseEmail - The template-filled email body
 * @returns {string} Prompt for Claude
 */
export function createPersonalizationPrompt(candidate, proposal, baseEmail) {
  const expertiseText = Array.isArray(candidate.expertiseAreas)
    ? candidate.expertiseAreas.join(', ')
    : (candidate.expertise || 'their research expertise');

  return `You are helping to personalize a reviewer invitation email. The email below was generated from a template. Your task is to make minor adjustments to make it feel more personalized while maintaining a professional tone.

**CANDIDATE INFORMATION:**
- Name: ${candidate.name}
- Affiliation: ${candidate.affiliation || 'Not specified'}
- Expertise: ${expertiseText}
- Why selected: ${candidate.reasoning || 'Relevant expertise in the field'}

**PROPOSAL INFORMATION:**
- Title: ${proposal.title || proposal.proposalTitle || 'Untitled'}
- PI: ${proposal.authors || proposal.proposalAuthors || 'Not specified'}

**CURRENT EMAIL:**
${baseEmail}

**YOUR TASK:**
Make the email feel more personalized by:
1. Adding a brief, specific mention of why this reviewer's expertise is relevant (1 sentence max)
2. Keeping the overall length about the same
3. Maintaining formal academic tone
4. NOT changing the structure or key information
5. NOT adding effusive praise or overly casual language

Return ONLY the personalized email body text (no subject line, no explanations).
Keep it professional and concise (~150 words).`;
}

/**
 * Create a prompt for generating email subject lines
 *
 * @param {Object} proposal - Proposal info
 * @returns {string} Prompt for Claude
 */
export function createSubjectPrompt(proposal) {
  return `Generate a professional email subject line for a peer review invitation.

Proposal title: ${proposal.title || proposal.proposalTitle}

The subject should:
- Be concise (under 60 characters if possible)
- Clearly indicate it's a review invitation
- Include the proposal topic or title

Return ONLY the subject line text, nothing else.`;
}

export default {
  createPersonalizationPrompt,
  createSubjectPrompt
};
