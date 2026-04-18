#!/usr/bin/env node

/**
 * Seed the Phase I v2 prompt into the scratch `wmkf_ai_run` record Connor
 * gave us for testing Dynamics-backed prompts.
 *
 *   Entity: wmkf_ai_runs
 *   Record GUID: a03f77d9-913a-f111-88b5-000d3a3065b8
 *   wmkf_ai_notes     → system prompt (role, format, guidelines, examples)
 *   wmkf_ai_rawoutput → user prompt template (with {{proposal_text}} slot)
 *
 * The split below intentionally keeps the exact phrasing of the current
 * `createPhaseISummarizationPrompt` output so the v1-vs-v2 A/B measures the
 * effect of (a) the system/user split and (b) the fetch mechanism - NOT a
 * prompt rewrite. summary_length and audience_description are template
 * variables so v2 can honor the same UI toggles as v1.
 *
 * Usage:
 *   node scripts/seed-phase-i-prompt.js        - writes & verifies
 *   node scripts/seed-phase-i-prompt.js --dry  - print what would be written
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

for (const envFile of ['.env', '.env.local']) {
  try {
    const c = readFileSync(resolve(process.cwd(), envFile), 'utf8');
    for (const line of c.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {}
}

const { DynamicsService } = await import('../lib/services/dynamics-service.js');
const { KECK_GUIDELINES } = await import('../shared/config/keck-guidelines.js');
DynamicsService.setRestrictions([], 'seed-phase-i-prompt');

const SCRATCH_GUID = 'a03f77d9-913a-f111-88b5-000d3a3065b8';
const DRY = process.argv.includes('--dry');

// ─── System prompt ────────────────────────────────────────────────────────────
// Static content: role, format spec, writing guidelines, Keck guidelines.
// This is the cacheable portion (cache_control ephemeral on the API call).
const SYSTEM_PROMPT = `You are an expert grant reviewer analyzing Phase I research proposals for the W.M. Keck Foundation. Produce summaries following the exact structure specified below.

# Output structure

**PART 1 - CORE SUMMARY ({{summary_length}} paragraph{{summary_length_suffix}}):**
Answer these two key questions:
1. What is the proposal about?
2. What are the key questions or hypotheses?

Write exactly {{summary_length}} cohesive paragraph{{summary_length_suffix}} (3-6 sentences each). If writing multiple paragraphs, the first should focus on what the proposal is about, and subsequent paragraphs should detail the key questions or hypotheses.

**PART 2 - FOUR BULLETS:**
After the paragraph(s), provide exactly four bullet points:

• **Impact & Timing:** Based on information in the proposal and your broader knowledge, explain: (1) What is the impact of the project if it is successful? (2) Why is this important? (3) Why is now the time to do this project?

• **Funding Justification:** Explain the justification and/or need for funding this research. **IMPORTANT: Include specific quantitative budget data when available in the proposal.** Cite dollar amounts for equipment, personnel, supplies, or other resources. If the proposal mentions specific costs (e.g., "$260K for custom instrumentation", "$933K for postdoctoral researchers"), include these numbers. If budget information is not provided in the proposal, focus on the qualitative justification for funding.

• **Research Classification:** In 3-5 sentences, classify whether this proposal represents basic science or applied science research. **The key distinction is the scientific deliverable: What is produced when the project is done?** It is acceptable for basic research to develop new technologies, instrumentation, or methodologies - but these must be MEANS to answer fundamental scientific questions, not ends in themselves. **Start by explicitly stating whether you can identify a clear fundamental scientific question that this research seeks to answer. If yes, quote or highlight that question.** If the deliverable is primarily scientific knowledge/understanding (even if it requires building new tools), classify as basic research. If the deliverable is primarily the technology, tool, or solution itself (even if it has scientific applications), classify as applied research. Consider: What does the proposal emphasize as the ultimate goal - answering a scientific question about how nature works, or creating something that works?

• **Keck Foundation Alignment:** In 3-5 sentences, evaluate whether this proposal aligns with the W.M. Keck Foundation's funding guidelines. Specifically assess whether the proposal fits within the criteria of what the Foundation DOES and DOES NOT fund (see guidelines below). Consider: Does the research fall within supported areas? Does it meet the Foundation's criteria for novelty and innovation? Are there any exclusions or restrictions that would disqualify it?

${KECK_GUIDELINES.getFormattedGuidelines()}

# Writing rules

**AUDIENCE LEVEL:**
Write for {{audience_description}}.

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

• **Research Classification:** [I can/cannot identify a clear fundamental scientific question in this proposal.] [If yes: The central scientific question is: "quote the question here."] This proposal represents [basic/applied] science research. [Explain based on the scientific deliverable: Is the end product scientific knowledge/understanding (basic) or a working technology/tool/solution (applied)? Note that developing new tools/methods is acceptable for basic research if they are means to answer scientific questions rather than ends in themselves...]

• **Keck Foundation Alignment:** This proposal [does/does not/partially] aligns with the W.M. Keck Foundation's funding guidelines. [Evaluate specifically against the "What We Fund" and "What We Do Not Fund" criteria. Address whether the research falls within supported areas, meets criteria for novelty/innovation, and whether any restrictions would disqualify it. Be specific about which criteria apply...]`;

// ─── User prompt template ─────────────────────────────────────────────────────
// Per-call variable portion. Claude will see the (cached) system prompt above
// followed by this user turn containing the proposal text.
const USER_PROMPT_TEMPLATE = `Please analyze the following Phase I research proposal and produce a summary following the exact structure specified in the system instructions above.

Research Proposal Text:
---
{{proposal_text}}

Provide your response now following the exact format above.`;

// ─── Write ────────────────────────────────────────────────────────────────────
console.log(`System prompt: ${SYSTEM_PROMPT.length.toLocaleString()} chars`);
console.log(`User template: ${USER_PROMPT_TEMPLATE.length.toLocaleString()} chars`);
console.log(`Target record: wmkf_ai_runs(${SCRATCH_GUID})\n`);

if (DRY) {
  console.log('--- SYSTEM PROMPT PREVIEW ---');
  console.log(SYSTEM_PROMPT.substring(0, 400) + '\n...\n');
  console.log('--- USER TEMPLATE ---');
  console.log(USER_PROMPT_TEMPLATE);
  console.log('\n(dry run - no write performed)');
  process.exit(0);
}

try {
  await DynamicsService.updateRecord('wmkf_ai_runs', SCRATCH_GUID, {
    wmkf_ai_notes: SYSTEM_PROMPT,
    wmkf_ai_rawoutput: USER_PROMPT_TEMPLATE,
  });
  console.log('✓ Wrote prompts to Dynamics');

  // Verify by reading back
  const verified = await DynamicsService.getRecord('wmkf_ai_runs', SCRATCH_GUID, {
    select: 'wmkf_ai_notes,wmkf_ai_rawoutput',
  });
  const notesLen = (verified?.wmkf_ai_notes || '').length;
  const rawLen = (verified?.wmkf_ai_rawoutput || '').length;
  console.log(`✓ Verified: wmkf_ai_notes=${notesLen.toLocaleString()} chars, wmkf_ai_rawoutput=${rawLen.toLocaleString()} chars`);

  if (notesLen !== SYSTEM_PROMPT.length || rawLen !== USER_PROMPT_TEMPLATE.length) {
    console.warn('⚠ Length mismatch - Dynamics may be truncating. Check field max-length on the entity.');
    console.warn(`  Expected notes=${SYSTEM_PROMPT.length}, got ${notesLen}`);
    console.warn(`  Expected raw=${USER_PROMPT_TEMPLATE.length}, got ${rawLen}`);
    process.exit(2);
  }
} catch (err) {
  console.error('✗ Failed:', err.message);
  process.exit(1);
}
