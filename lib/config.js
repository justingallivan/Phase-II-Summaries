/**
 * ⚠️ DEPRECATED: This file is deprecated and will be removed in a future version.
 *
 * This file now serves as a compatibility layer that re-exports from the new shared config system.
 * All new code should import directly from `shared/config` instead.
 *
 * MIGRATION PATH:
 * - OLD: import { CONFIG, PROMPTS } from '../../lib/config';
 * - NEW: import { BASE_CONFIG, create...Prompt } from '../../shared/config';
 *
 * See REMAINING_API_MIGRATIONS.md for detailed migration instructions.
 * See CONFIG_MIGRATION_AUDIT.md for the complete migration status.
 *
 * OPTION B (Hard Removal): After all API files are migrated and tested (1-2 weeks),
 * this file and lib/config.legacy.js can be safely deleted.
 * See OPTION_B_HARD_REMOVAL.md for instructions.
 */

import { BASE_CONFIG } from '../shared/config/baseConfig';
import { KECK_GUIDELINES } from '../shared/config/keck-guidelines';
import {
  createSummarizationPrompt,
  createStructuredDataExtractionPrompt,
  createRefinementPrompt,
  createQAPrompt
} from '../shared/config/prompts/proposal-summarizer';
import {
  createPhaseISummarizationPrompt
} from '../shared/config/prompts/phase-i-summaries';
import {
  createPhaseIWriteupPrompt
} from '../shared/config/prompts/phase-i-writeup';
import {
  createPeerReviewAnalysisPrompt,
  createPeerReviewQuestionsPrompt
} from '../shared/config/prompts/peer-reviewer';
import {
  createFundingExtractionPrompt,
  createFundingAnalysisPrompt,
  createBatchFundingSummaryPrompt
} from '../shared/config/prompts/funding-gap-analyzer';

// Log deprecation warning in development
if (process.env.NODE_ENV !== 'production') {
  console.warn(
    '\n⚠️  DEPRECATION WARNING: lib/config.js is deprecated.\n' +
    '   Please migrate to shared/config for better maintainability.\n' +
    '   See REMAINING_API_MIGRATIONS.md for migration instructions.\n'
  );
}

/**
 * Legacy CONFIG export - maps to BASE_CONFIG
 * @deprecated Use BASE_CONFIG from shared/config instead
 */
export const CONFIG = {
  // Claude API Configuration (flatten nested structure for backward compatibility)
  CLAUDE_MODEL: BASE_CONFIG.CLAUDE.DEFAULT_MODEL,
  CLAUDE_API_URL: BASE_CONFIG.CLAUDE.API_URL,
  ANTHROPIC_VERSION: BASE_CONFIG.CLAUDE.ANTHROPIC_VERSION,

  // Model Parameters
  DEFAULT_MAX_TOKENS: BASE_CONFIG.MODEL_PARAMS.DEFAULT_MAX_TOKENS,
  REFINEMENT_MAX_TOKENS: BASE_CONFIG.MODEL_PARAMS.REFINEMENT_MAX_TOKENS,
  QA_MAX_TOKENS: BASE_CONFIG.MODEL_PARAMS.QA_MAX_TOKENS,

  // Temperature settings
  SUMMARIZATION_TEMPERATURE: BASE_CONFIG.MODEL_PARAMS.SUMMARIZATION_TEMPERATURE,
  REFINEMENT_TEMPERATURE: BASE_CONFIG.MODEL_PARAMS.REFINEMENT_TEMPERATURE,
  QA_TEMPERATURE: BASE_CONFIG.MODEL_PARAMS.QA_TEMPERATURE,

  // Processing limits
  PDF_SIZE_LIMIT: BASE_CONFIG.FILE_PROCESSING.PDF_SIZE_LIMIT,
  TEXT_TRUNCATE_LIMIT: BASE_CONFIG.FILE_PROCESSING.TEXT_TRUNCATE_LIMIT,
  QA_TEXT_TRUNCATE_LIMIT: BASE_CONFIG.FILE_PROCESSING.QA_TEXT_TRUNCATE_LIMIT,
  FUNDING_EXTRACTION_LIMIT: BASE_CONFIG.FILE_PROCESSING.FUNDING_EXTRACTION_LIMIT
};

/**
 * Legacy PROMPTS export - wraps new prompt functions
 * @deprecated Use create...Prompt functions from shared/config/prompts instead
 */
export const PROMPTS = {
  // Phase II Writeup Draft prompts
  SUMMARIZATION: (text, summaryLength = 2, summaryLevel = 'technical-non-expert') => {
    return createSummarizationPrompt(text, summaryLength, summaryLevel);
  },

  STRUCTURED_DATA_EXTRACTION: (text, filename) => {
    return createStructuredDataExtractionPrompt(text, filename);
  },

  REFINEMENT: (currentSummary, feedback) => {
    return createRefinementPrompt(currentSummary, feedback);
  },

  QA_SYSTEM: (proposalContext, conversationContext, question) => {
    return createQAPrompt(proposalContext, conversationContext, question);
  },

  // Phase I Summaries prompts
  PHASE_I_SUMMARIZATION: (text, summaryLength = 1, summaryLevel = 'technical-non-expert') => {
    return createPhaseISummarizationPrompt(text, summaryLength, summaryLevel, KECK_GUIDELINES);
  },

  // Phase I Writeup prompts
  PHASE_I_WRITEUP: (text, institution = '') => {
    return createPhaseIWriteupPrompt(text, institution);
  },

  // Peer Review prompts
  PEER_REVIEW_ANALYSIS: (reviewTexts) => {
    return createPeerReviewAnalysisPrompt(reviewTexts);
  },

  PEER_REVIEW_QUESTIONS: (reviewTexts) => {
    return createPeerReviewQuestionsPrompt(reviewTexts);
  },

  // Funding Gap Analyzer prompts
  FUNDING_EXTRACTION: (proposalText) => {
    return createFundingExtractionPrompt(proposalText);
  },

  FUNDING_ANALYSIS: (data) => {
    return createFundingAnalysisPrompt(data);
  },

  BATCH_FUNDING_SUMMARY: (proposals, searchYears) => {
    return createBatchFundingSummaryPrompt(proposals, searchYears);
  }
};

// Re-export KECK_GUIDELINES for backward compatibility
export { KECK_GUIDELINES };
