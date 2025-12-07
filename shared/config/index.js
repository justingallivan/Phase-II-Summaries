/**
 * Unified configuration exports
 * Single entry point for all configuration and prompts
 *
 * Usage:
 * import { BASE_CONFIG, KECK_GUIDELINES, createSummarizationPrompt } from '../../shared/config';
 */

// Base configuration
export { BASE_CONFIG, getEnvironmentConfig, mergeConfig, validateConfig } from './baseConfig';

// Keck Foundation guidelines
export { KECK_GUIDELINES } from './keck-guidelines';

// Prompt functions - Phase II Writeup Draft
export {
  createSummarizationPrompt,
  createStructuredDataExtractionPrompt,
  createRefinementPrompt,
  createQAPrompt,
  extractInstitutionFromFilename,
  enhanceFormatting
} from './prompts/proposal-summarizer';

// Prompt functions - Phase I Summaries
export {
  createPhaseISummarizationPrompt,
  getPhaseITextLimit
} from './prompts/phase-i-summaries';

// Prompt functions - Phase I Writeup
export {
  createPhaseIWriteupPrompt,
  getPhaseIWriteupTextLimit
} from './prompts/phase-i-writeup';

// Prompt functions - Peer Review Analysis
export {
  createPeerReviewAnalysisPrompt,
  createPeerReviewQuestionsPrompt,
  createThemeSynthesisPrompt,
  createActionItemsPrompt,
  extractReviewerInfo
} from './prompts/peer-reviewer';

// Prompt functions - Find Reviewers
export {
  createExtractionPrompt,
  createReviewerPrompt,
  parseExtractionResponse
} from './prompts/find-reviewers';

// Prompt functions - Funding Gap Analyzer
export {
  createFundingExtractionPrompt,
  createFundingAnalysisPrompt,
  createBatchFundingSummaryPrompt,
  getFundingExtractionLimit
} from './prompts/funding-gap-analyzer';

// Prompt functions - Batch Processor
export {
  createBatchProcessingPrompt,
  createBatchMetadataPrompt,
  createQualityAssessmentPrompt,
  createBatchComparisonPrompt,
  validateBatchParameters
} from './prompts/batch-processor';

// Prompt functions - Document Analyzer
export {
  createDocumentAnalysisPrompt,
  createMetadataExtractionPrompt,
  createThemeExtractionPrompt,
  createSummaryPrompt,
  createQuestionGenerationPrompt,
  createDocumentComparisonPrompt
} from './prompts/document-analyzer';

// Common utilities
export {
  truncateText,
  cleanText,
  validatePromptParameters,
  TEXT_LIMITS,
  TEMPERATURE_SETTINGS
} from './prompts/common';
