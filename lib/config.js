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
};
