/**
 * Prompt templates for WMKF Expertise Finder
 *
 * Matches grant proposals to internal staff, consultants, and board members.
 * Three distinct outputs per match:
 *   1. Staff Assignment — primary and secondary PD recommendation
 *   2. Consultant Overlap — flag consultants whose expertise overlaps (may be none)
 *   3. Board Interest — flag proposals of personal interest to board members
 */

/**
 * Build the roster context block from database records.
 * Groups by role_type for clarity in the prompt.
 */
function buildRosterContext(rosterMembers) {
  const staff = rosterMembers.filter(m => m.role_type === 'Research Program Staff');
  const consultants = rosterMembers.filter(m => m.role_type === 'Consultant');
  const board = rosterMembers.filter(m => m.role_type === 'Board');

  function formatMember(m) {
    const lines = [`**${m.name}** — ${m.role || 'N/A'}, ${m.affiliation || 'N/A'}`];
    if (m.primary_fields) lines.push(`  Fields: ${m.primary_fields}`);
    if (m.keywords) lines.push(`  Keywords: ${m.keywords}`);
    if (m.subfields_specialties) lines.push(`  Subfields: ${m.subfields_specialties}`);
    if (m.methods_techniques) lines.push(`  Methods: ${m.methods_techniques}`);
    if (m.expertise) lines.push(`  Expertise: ${m.expertise}`);
    if (m.keck_affiliation) lines.push(`  Keck Affiliation: ${m.keck_affiliation}`);
    return lines.join('\n');
  }

  let context = '';

  if (staff.length > 0) {
    context += '## RESEARCH PROGRAM STAFF (eligible for primary/secondary PD assignment)\n\n';
    context += staff.map(formatMember).join('\n\n');
    context += '\n\n';
  }

  if (consultants.length > 0) {
    context += '## CONSULTANTS (flag if expertise overlaps with proposal)\n\n';
    context += consultants.map(formatMember).join('\n\n');
    context += '\n\n';
  }

  if (board.length > 0) {
    context += '## BOARD MEMBERS (flag if proposal may be of personal scientific interest)\n\n';
    context += board.map(formatMember).join('\n\n');
    context += '\n\n';
  }

  return context;
}

/**
 * Create the matching prompt for an individual proposal.
 *
 * @param {string} proposalText - Extracted text from the proposal PDF
 * @param {Object[]} rosterMembers - Active roster members from the database
 * @param {string} additionalNotes - Optional user notes/context
 * @returns {string} The complete prompt
 */
export function createMatchingPrompt(proposalText, rosterMembers, additionalNotes = '') {
  const safeText = proposalText || 'No proposal text provided';
  const truncatedText = safeText.length > 100000
    ? safeText.substring(0, 100000) + '\n\n[...truncated for length...]'
    : safeText;

  const rosterContext = buildRosterContext(rosterMembers);

  return `You are an expert at matching W.M. Keck Foundation research proposals to qualified internal reviewers. You have deep knowledge of scientific domains and can precisely assess where a reviewer's expertise overlaps with a proposal's core scientific claims.

## YOUR TASK

Analyze the proposal below and produce three distinct assessments:

1. **Staff Assignment** — Recommend a primary and secondary Program Director (PD) from the Research Program Staff. The primary PD should be the person whose expertise best positions them to evaluate the proposal's core scientific claims. The secondary PD is the next-best staff member to consult if the primary has a conflict or capacity issue.

2. **Consultant Overlap** — Identify any consultants whose expertise genuinely overlaps with the proposal. This is NOT a forced assignment — many proposals will have no consultant overlap, and that is expected. Consultants fill gaps that staff cannot cover. Only flag consultants who can critically evaluate specific aspects of the proposal.

3. **Board Interest** — Identify board members for whom this proposal may be of genuine personal scientific interest. Board members with non-scientific roles (Bradway, Foster, Kresa) should only be flagged if there is clear strategic or industry relevance, and must be labeled as "industry/strategic perspective only, not scientific review."

## CRITICAL RULES

### Expertise Boundaries — Never Conflate
- Goldhaber-Gordon: condensed matter physics / quantum materials ≠ quantum computing algorithms
- Gallivan: biochemistry / synthetic biology ≠ synthetic organic / medicinal chemistry
- Marchetti: active matter theory ≠ experimental cell biology
- Djorgovski: astrophysics data science ≠ general ML for biology
- Bradway: industry/translational perspective only — NOT scientific peer review
- Foster: strategy perspective only — NOT scientific peer review
- Kresa: systems engineering perspective only — NOT scientific peer review

### Matching Principles
- **Depth over breadth** — prefer reviewers who can evaluate central scientific claims over generalists covering peripheral aspects
- **Flag gaps honestly** — if no roster member covers a proposal's core domain, say so explicitly
- **S&E vs. MR program labels are NOT constraints** — these are committee structure artifacts, not expertise boundaries
- **Research Program Staff are eligible reviewers** — treat them like any other roster entry
- **PI conflicts** — if any roster member is a PI or named collaborator on the proposal, exclude them and note the conflict

## ROSTER

${rosterContext}

## PROPOSAL TEXT

${truncatedText}

${additionalNotes ? `## ADDITIONAL CONTEXT FROM USER\n${additionalNotes}\n` : ''}

## REQUIRED OUTPUT FORMAT

Respond with valid JSON matching this structure exactly:

\`\`\`json
{
  "proposal_summary": {
    "title": "extracted or summarized title",
    "program": "Medical Research or Science & Engineering",
    "institution": "PI's institution",
    "pi_name": "Principal Investigator name",
    "core_question": "1-sentence summary of the core scientific question",
    "key_methods": ["method1", "method2", "method3"],
    "disciplinary_areas": ["area1", "area2"]
  },
  "staff_assignment": {
    "primary": {
      "name": "Staff member name",
      "rationale": "Why this person is the best match — what specific aspects of the proposal they can evaluate"
    },
    "secondary": {
      "name": "Staff member name",
      "rationale": "Why this person is the next-best match"
    }
  },
  "consultant_overlap": [
    {
      "name": "Consultant name",
      "relevance": "strong or partial",
      "rationale": "What specific aspects of the proposal overlap with their expertise"
    }
  ],
  "board_interest": [
    {
      "name": "Board member name",
      "rationale": "Why this proposal may be of interest",
      "note": "Optional: 'industry/strategic perspective only' if applicable"
    }
  ],
  "expertise_gaps": {
    "has_gaps": true,
    "description": "What expertise is missing from the roster for this proposal, and why it matters. Null if no gaps."
  },
  "conflicts": [
    {
      "name": "Roster member name",
      "reason": "Why they are conflicted (e.g., PI, co-PI, named collaborator)"
    }
  ]
}
\`\`\`

If there are no consultant overlaps, return an empty array for consultant_overlap.
If there are no board interest flags, return an empty array for board_interest.
If there are no conflicts, return an empty array for conflicts.
If there are no expertise gaps, set has_gaps to false and description to null.`;
}

/**
 * System prompt for the expertise finder (used as the system message).
 */
export const SYSTEM_PROMPT = 'You are a scientific expertise matching system for the W.M. Keck Foundation. You analyze research proposals and match them to the most qualified internal reviewers based on deep domain expertise. Always respond with valid JSON. Never force-fit a poor match — honestly flag gaps when no roster member can evaluate a proposal\'s core claims.';
