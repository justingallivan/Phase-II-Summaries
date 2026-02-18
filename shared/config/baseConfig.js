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

  // Per-App Model Configuration
  // Each app can specify its preferred model based on task complexity
  // Format: { model, visionModel (optional), fallback }
  APP_MODELS: {
    // High complexity - Opus for best evaluation quality
    'concept-evaluator': {
      model: 'claude-opus-4-20250514',
      visionModel: 'claude-opus-4-20250514',
      fallback: 'claude-sonnet-4-20250514'
    },
    // Multi-perspective evaluator - Sonnet for cost-effective multi-call architecture
    'multi-perspective-evaluator': {
      model: 'claude-sonnet-4-20250514',
      visionModel: 'claude-sonnet-4-20250514',
      fallback: 'claude-3-5-haiku-20241022'
    },
    // High complexity - Literature analysis with Vision
    'literature-analyzer': {
      model: 'claude-sonnet-4-20250514',
      visionModel: 'claude-sonnet-4-20250514',
      fallback: 'claude-3-5-haiku-20241022'
    },
    // High complexity - Sonnet for detailed summaries
    'batch-phase-i': {
      model: 'claude-sonnet-4-20250514',
      fallback: 'claude-3-5-haiku-20241022'
    },
    'batch-phase-ii': {
      model: 'claude-sonnet-4-20250514',
      fallback: 'claude-3-5-haiku-20241022'
    },
    'phase-i-writeup': {
      model: 'claude-sonnet-4-20250514',
      fallback: 'claude-3-5-haiku-20241022'
    },
    'phase-ii-writeup': {
      model: 'claude-sonnet-4-20250514',
      fallback: 'claude-3-5-haiku-20241022'
    },
    'reviewer-finder': {
      model: 'claude-sonnet-4-20250514',
      fallback: 'claude-3-5-haiku-20241022'
    },
    'peer-review-summarizer': {
      model: 'claude-sonnet-4-20250514',
      fallback: 'claude-3-5-haiku-20241022'
    },
    'funding-analysis': {
      model: 'claude-sonnet-4-20250514',
      fallback: 'claude-3-5-haiku-20241022'
    },
    // Medium complexity - Q&A and refinement
    'qa': {
      model: 'claude-sonnet-4-20250514',
      fallback: 'claude-3-5-haiku-20241022'
    },
    'refine': {
      model: 'claude-sonnet-4-20250514',
      fallback: 'claude-3-5-haiku-20241022'
    },
    // Low complexity - Haiku is sufficient
    'expense-reporter': {
      model: 'claude-3-5-haiku-20241022',
      fallback: 'claude-3-haiku-20240307'
    },
    'contact-enrichment': {
      model: 'claude-3-5-haiku-20241022',
      fallback: 'claude-3-haiku-20240307'
    },
    'email-personalization': {
      model: 'claude-3-5-haiku-20241022',
      fallback: 'claude-3-haiku-20240307'
    },
    // Dynamics Explorer - Haiku 4.5 for fast tool-use with higher rate limits than Sonnet
    'dynamics-explorer': {
      model: 'claude-haiku-4-5-20251001',
      fallback: 'claude-3-5-haiku-20241022'
    }
  },

  // Model Parameters
  MODEL_PARAMS: {
    DEFAULT_MAX_TOKENS: 2000,
    EXTENDED_MAX_TOKENS: 4000,
    MIN_MAX_TOKENS: 500,
    DEFAULT_TEMPERATURE: 0.3,
    STRUCTURED_DATA_TEMPERATURE: 0.1,
    CREATIVE_TEMPERATURE: 0.7,
    // Legacy config compatibility (from lib/config.js)
    REFINEMENT_MAX_TOKENS: 2500,
    QA_MAX_TOKENS: 1500,
    SUMMARIZATION_TEMPERATURE: 0.3,
    REFINEMENT_TEMPERATURE: 0.3,
    QA_TEMPERATURE: 0.4
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
    SUPPORTED_FORMATS: ['pdf', 'txt', 'md'],
    // Legacy config compatibility (from lib/config.js)
    QA_TEXT_TRUNCATE_LIMIT: 10000, // characters for structured data extraction
    FUNDING_EXTRACTION_LIMIT: 6000 // characters for PI/institution/keyword extraction
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

// --- DB model override cache ---
// Pre-loaded by loadModelOverrides() so getModelForApp() stays synchronous
let _dbOverrides = new Map();
let _dbOverridesLoadedAt = 0;
const DB_OVERRIDES_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Pre-load model overrides from system_settings into memory.
 * Call once near the top of each API handler (after auth, before getModelForApp).
 * No-ops if cache is still fresh.
 */
export async function loadModelOverrides() {
  if (Date.now() - _dbOverridesLoadedAt < DB_OVERRIDES_TTL_MS) return;
  try {
    const { sql } = await import('@vercel/postgres');
    const result = await sql`
      SELECT setting_key, setting_value FROM system_settings
      WHERE setting_key LIKE 'model_override:%'
    `;
    const map = new Map();
    for (const row of result.rows) {
      // setting_key format: model_override:{appKey}:{modelType}
      const suffix = row.setting_key.replace('model_override:', '');
      map.set(suffix, row.setting_value); // e.g. "concept-evaluator:model" → "claude-sonnet-4-..."
    }
    _dbOverrides = map;
    _dbOverridesLoadedAt = Date.now();
  } catch (err) {
    // On failure (e.g. table doesn't exist yet), leave cache as-is
    console.error('loadModelOverrides: failed to load overrides:', err.message);
  }
}

/**
 * Clear the in-memory model overrides cache.
 * Call after admin writes to system_settings so the next request re-fetches.
 */
export function clearModelOverridesCache() {
  _dbOverrides = new Map();
  _dbOverridesLoadedAt = 0;
}

/**
 * Get the appropriate Claude model for a specific app
 * @param {string} appKey - The app identifier (e.g., 'concept-evaluator', 'expense-reporter')
 * @param {string} type - The model type: 'model', 'visionModel', or 'fallback'
 * @returns {string} - The model identifier
 */
export function getModelForApp(appKey, type = 'model') {
  // 1. Check DB override (loaded by loadModelOverrides)
  const dbOverride = _dbOverrides.get(`${appKey}:${type}`);
  if (dbOverride) {
    return dbOverride;
  }

  // 2. Allow environment variable override for specific apps
  // e.g., CLAUDE_MODEL_CONCEPT_EVALUATOR=claude-sonnet-4-20250514
  const envKey = `CLAUDE_MODEL_${appKey.toUpperCase().replace(/-/g, '_')}`;
  const envOverride = process.env[envKey];
  if (envOverride) {
    return envOverride;
  }

  // 3. Get from APP_MODELS configuration
  const appConfig = BASE_CONFIG.APP_MODELS[appKey];
  if (appConfig) {
    // Return requested type, falling back to model, then to default
    return appConfig[type] || appConfig.model || BASE_CONFIG.CLAUDE.DEFAULT_MODEL;
  }

  // 4. Fall back to global default
  return BASE_CONFIG.CLAUDE.DEFAULT_MODEL;
}

/**
 * Get the fallback model for a specific app
 * @param {string} appKey - The app identifier
 * @returns {string} - The fallback model identifier
 */
export function getFallbackModelForApp(appKey) {
  return getModelForApp(appKey, 'fallback');
}

export default BASE_CONFIG;