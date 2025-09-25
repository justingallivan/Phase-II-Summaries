import rateLimit from 'express-rate-limit';
import { BASE_CONFIG } from '../../config/baseConfig';

// In-memory store for rate limiting
const rateLimitStore = new Map();

/**
 * Create a rate limiter for API endpoints
 * @param {Object} options - Rate limiter options
 * @returns {Function} - Rate limiter middleware
 */
export function createRateLimiter(options = {}) {
  const config = {
    windowMs: options.windowMs || 60 * 1000, // 1 minute default
    max: options.max || BASE_CONFIG.RATE_LIMITS.REQUESTS_PER_MINUTE,
    message: options.message || BASE_CONFIG.ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: BASE_CONFIG.ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
        retryAfter: Math.ceil(options.windowMs / 1000),
        timestamp: new Date().toISOString()
      });
    },
    ...options
  };

  return rateLimit(config);
}

/**
 * Create rate limiter for different tiers
 */
export const rateLimiters = {
  // Standard rate limit for general API calls
  standard: createRateLimiter({
    windowMs: 60 * 1000,
    max: BASE_CONFIG.RATE_LIMITS.REQUESTS_PER_MINUTE
  }),

  // Strict rate limit for expensive operations
  strict: createRateLimiter({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many requests for this resource. Please wait before trying again.'
  }),

  // Hourly rate limit
  hourly: createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: BASE_CONFIG.RATE_LIMITS.REQUESTS_PER_HOUR
  }),

  // File upload rate limit
  upload: createRateLimiter({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many file uploads. Please wait before uploading more files.'
  }),

  // AI processing rate limit
  aiProcessing: createRateLimiter({
    windowMs: 60 * 1000,
    max: 20,
    message: 'AI processing limit reached. Please wait before submitting more requests.'
  })
};

/**
 * Custom rate limiter for Next.js API routes
 * @param {Object} options - Rate limiter options
 * @returns {Function} - Middleware function for Next.js
 */
export function nextRateLimiter(options = {}) {
  const windowMs = options.windowMs || 60 * 1000;
  const max = options.max || BASE_CONFIG.RATE_LIMITS.REQUESTS_PER_MINUTE;
  
  return async (req, res) => {
    const identifier = getIdentifier(req);
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean up old entries
    cleanupStore(windowStart);

    // Get request history for this identifier
    if (!rateLimitStore.has(identifier)) {
      rateLimitStore.set(identifier, []);
    }

    const requests = rateLimitStore.get(identifier);
    const recentRequests = requests.filter(time => time > windowStart);

    if (recentRequests.length >= max) {
      const resetTime = Math.min(...recentRequests) + windowMs;
      const retryAfter = Math.ceil((resetTime - now) / 1000);

      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', new Date(resetTime).toISOString());
      res.setHeader('Retry-After', retryAfter);

      return res.status(429).json({
        error: BASE_CONFIG.ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
        retryAfter,
        limit: max,
        remaining: 0,
        reset: new Date(resetTime).toISOString()
      });
    }

    // Add current request
    recentRequests.push(now);
    rateLimitStore.set(identifier, recentRequests);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', max - recentRequests.length);
    res.setHeader('X-RateLimit-Reset', new Date(now + windowMs).toISOString());

    return true;
  };
}

/**
 * Get identifier for rate limiting (IP or API key)
 * @param {Object} req - Request object
 * @returns {string} - Identifier
 */
function getIdentifier(req) {
  // Try to get API key first
  const apiKey = req.headers['x-api-key'] || req.body?.apiKey;
  if (apiKey) {
    return `key:${apiKey.substring(0, 10)}`;
  }

  // Fall back to IP address
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0] : req.connection?.remoteAddress || '127.0.0.1';
  return `ip:${ip}`;
}

/**
 * Clean up expired entries from rate limit store
 * @param {number} windowStart - Start of current window
 */
function cleanupStore(windowStart) {
  for (const [key, requests] of rateLimitStore.entries()) {
    const validRequests = requests.filter(time => time > windowStart);
    if (validRequests.length === 0) {
      rateLimitStore.delete(key);
    } else if (validRequests.length !== requests.length) {
      rateLimitStore.set(key, validRequests);
    }
  }
}

/**
 * Reset rate limits for a specific identifier
 * @param {string} identifier - Identifier to reset
 */
export function resetRateLimit(identifier) {
  rateLimitStore.delete(identifier);
}

/**
 * Get current rate limit status for an identifier
 * @param {string} identifier - Identifier to check
 * @param {Object} options - Rate limit options
 * @returns {Object} - Current status
 */
export function getRateLimitStatus(identifier, options = {}) {
  const windowMs = options.windowMs || 60 * 1000;
  const max = options.max || BASE_CONFIG.RATE_LIMITS.REQUESTS_PER_MINUTE;
  const now = Date.now();
  const windowStart = now - windowMs;

  const requests = rateLimitStore.get(identifier) || [];
  const recentRequests = requests.filter(time => time > windowStart);

  return {
    limit: max,
    remaining: Math.max(0, max - recentRequests.length),
    reset: new Date(now + windowMs).toISOString(),
    used: recentRequests.length
  };
}