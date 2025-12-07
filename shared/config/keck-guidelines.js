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
   * @returns {string} - Formatted guidelines text
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
