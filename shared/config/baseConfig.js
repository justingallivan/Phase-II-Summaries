/**
 * Base configuration for all document processing apps
 * Can be extended by individual apps
 */

export const BASE_CONFIG = {
  // Claude API Configuration
  CLAUDE: {
    API_URL: process.env.CLAUDE_API_URL || 'https://api.anthropic.com/v1/messages',
    ANTHROPIC_VERSION: '2023-06-01',
    DEFAULT_MODEL: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
    FALLBACK_MODEL: 'claude-3-haiku-20240307'
  },

  // Model Parameters
  MODEL_PARAMS: {
    DEFAULT_MAX_TOKENS: 2000,
    EXTENDED_MAX_TOKENS: 4000,
    MIN_MAX_TOKENS: 500,
    DEFAULT_TEMPERATURE: 0.3,
    STRUCTURED_DATA_TEMPERATURE: 0.1,
    CREATIVE_TEMPERATURE: 0.7
  },

  // File Processing
  FILE_PROCESSING: {
    PDF_SIZE_LIMIT: 50 * 1024 * 1024, // 50MB
    TEXT_SIZE_LIMIT: 10 * 1024 * 1024, // 10MB
    MIN_TEXT_LENGTH: 100, // minimum characters
    MAX_TEXT_LENGTH: 1000000, // maximum characters for processing
    TEXT_TRUNCATE_LIMIT: 15000, // characters for API calls
    CHUNK_SIZE: 10000, // for splitting large texts
    CHUNK_OVERLAP: 500, // overlap between chunks
    SUPPORTED_FORMATS: ['pdf', 'txt', 'md']
  },

  // API Rate Limiting
  RATE_LIMITS: {
    REQUESTS_PER_MINUTE: 60,
    REQUESTS_PER_HOUR: 1000,
    CONCURRENT_REQUESTS: 5
  },

  // Caching
  CACHE: {
    ENABLED: process.env.ENABLE_CACHE !== 'false',
    TTL: 3600, // 1 hour in seconds
    MAX_SIZE: 100 // maximum cached items
  },

  // Security
  SECURITY: {
    REQUIRE_API_KEY: true,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
    MAX_REQUEST_SIZE: '100mb',
    SANITIZE_INPUT: true
  },

  // Logging
  LOGGING: {
    LEVEL: process.env.LOG_LEVEL || 'info',
    ENABLED: process.env.ENABLE_LOGGING !== 'false',
    INCLUDE_TIMESTAMPS: true
  },

  // Export Options
  EXPORT: {
    FORMATS: ['markdown', 'json', 'html', 'pdf'],
    DEFAULT_FORMAT: 'markdown',
    INCLUDE_METADATA: true
  },

  // Error Messages
  ERROR_MESSAGES: {
    NO_API_KEY: 'API key is required',
    INVALID_FILE: 'Invalid file format or corrupted file',
    FILE_TOO_LARGE: 'File exceeds maximum size limit',
    PROCESSING_FAILED: 'Failed to process document',
    AI_SERVICE_ERROR: 'AI service temporarily unavailable',
    RATE_LIMIT_EXCEEDED: 'Rate limit exceeded, please try again later',
    INVALID_REQUEST: 'Invalid request format'
  },

  // Success Messages
  SUCCESS_MESSAGES: {
    PROCESSING_COMPLETE: 'Document processed successfully',
    EXPORT_COMPLETE: 'Export completed successfully',
    UPLOAD_COMPLETE: 'File uploaded successfully'
  }
};

/**
 * Get environment-specific configuration
 * @returns {Object} - Environment configuration
 */
export function getEnvironmentConfig() {
  const env = process.env.NODE_ENV || 'development';
  
  const envConfigs = {
    development: {
      DEBUG: true,
      VERBOSE_ERRORS: true,
      MOCK_MODE: process.env.MOCK_MODE === 'true'
    },
    production: {
      DEBUG: false,
      VERBOSE_ERRORS: false,
      MOCK_MODE: false
    },
    test: {
      DEBUG: true,
      VERBOSE_ERRORS: true,
      MOCK_MODE: true
    }
  };

  return envConfigs[env] || envConfigs.development;
}

/**
 * Merge configurations
 * @param {Object} baseConfig - Base configuration
 * @param {Object} appConfig - App-specific configuration
 * @returns {Object} - Merged configuration
 */
export function mergeConfig(baseConfig, appConfig) {
  return {
    ...baseConfig,
    ...appConfig,
    CLAUDE: { ...baseConfig.CLAUDE, ...(appConfig.CLAUDE || {}) },
    MODEL_PARAMS: { ...baseConfig.MODEL_PARAMS, ...(appConfig.MODEL_PARAMS || {}) },
    FILE_PROCESSING: { ...baseConfig.FILE_PROCESSING, ...(appConfig.FILE_PROCESSING || {}) }
  };
}

/**
 * Validate configuration
 * @param {Object} config - Configuration to validate
 * @throws {Error} - If configuration is invalid
 */
export function validateConfig(config) {
  if (!config.CLAUDE.API_URL) {
    throw new Error('Claude API URL is required');
  }
  
  if (config.FILE_PROCESSING.PDF_SIZE_LIMIT < 1024 * 1024) {
    throw new Error('PDF size limit must be at least 1MB');
  }
  
  if (config.MODEL_PARAMS.DEFAULT_TEMPERATURE < 0 || config.MODEL_PARAMS.DEFAULT_TEMPERATURE > 1) {
    throw new Error('Temperature must be between 0 and 1');
  }
}

export default BASE_CONFIG;