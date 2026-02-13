import helmet from 'helmet';
import cors from 'cors';
import { BASE_CONFIG } from '../../config/baseConfig';

/**
 * Security middleware for API routes
 */
export const securityMiddleware = {
  /**
   * Configure CORS settings
   */
  cors: cors({
    origin: (origin, callback) => {
      const allowedOrigins = BASE_CONFIG.SECURITY.ALLOWED_ORIGINS;
      
      // Allow requests with no origin (like mobile apps or Postman)
      if (!origin) return callback(null, true);
      
      // Check if origin is in allowed list
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Session-Token'],
    maxAge: 86400 // 24 hours
  }),

  /**
   * Configure Helmet for security headers
   */
  helmet: helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://api.anthropic.com"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),

  /**
   * Validate API key middleware
   */
  validateApiKey: async (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.body?.apiKey;
    
    if (BASE_CONFIG.SECURITY.REQUIRE_API_KEY && !apiKey) {
      return res.status(401).json({
        error: BASE_CONFIG.ERROR_MESSAGES.NO_API_KEY,
        timestamp: new Date().toISOString()
      });
    }

    // Store API key in request for later use
    req.apiKey = apiKey;
    
    if (next) {
      next();
    }
    
    return true;
  },

  /**
   * Input sanitization middleware
   */
  sanitizeInput: (req, res, next) => {
    if (!BASE_CONFIG.SECURITY.SANITIZE_INPUT) {
      if (next) next();
      return true;
    }

    // Sanitize common injection patterns
    const sanitizeString = (str) => {
      if (typeof str !== 'string') return str;
      
      // Remove script tags and SQL injection attempts
      return str
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE)\b)/gi, '')
        .replace(/[<>]/g, '');
    };

    const sanitizeObject = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      
      const sanitized = Array.isArray(obj) ? [] : {};
      
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const value = obj[key];
          if (typeof value === 'string') {
            sanitized[key] = sanitizeString(value);
          } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeObject(value);
          } else {
            sanitized[key] = value;
          }
        }
      }
      
      return sanitized;
    };

    // Sanitize request body, query, and params
    if (req.body) {
      req.body = sanitizeObject(req.body);
    }
    if (req.query) {
      req.query = sanitizeObject(req.query);
    }
    if (req.params) {
      req.params = sanitizeObject(req.params);
    }

    if (next) {
      next();
    }
    
    return true;
  },

  /**
   * Request size limit middleware
   */
  sizeLimit: (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    const maxSize = parseInt(BASE_CONFIG.SECURITY.MAX_REQUEST_SIZE) * 1024 * 1024; // Convert MB to bytes
    
    if (contentLength > maxSize) {
      return res.status(413).json({
        error: 'Request entity too large',
        maxSize: BASE_CONFIG.SECURITY.MAX_REQUEST_SIZE,
        timestamp: new Date().toISOString()
      });
    }

    if (next) {
      next();
    }
    
    return true;
  },

  /**
   * Security headers for Next.js API routes
   */
  setSecurityHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
  }
};

/**
 * Apply all security middleware for Next.js API routes
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {boolean} - Whether to continue processing
 */
export async function applySecurityMiddleware(req, res) {
  // Set security headers
  securityMiddleware.setSecurityHeaders(res);
  
  // Check CORS
  const origin = req.headers.origin;
  const allowedOrigins = BASE_CONFIG.SECURITY.ALLOWED_ORIGINS;
  
  if (origin && !allowedOrigins.includes('*') && !allowedOrigins.includes(origin)) {
    res.status(403).json({
      error: 'Origin not allowed',
      timestamp: new Date().toISOString()
    });
    return false;
  }

  // Validate API key if required
  const apiKeyValid = await securityMiddleware.validateApiKey(req, res);
  if (!apiKeyValid) {
    return false;
  }

  // Sanitize input
  securityMiddleware.sanitizeInput(req, res);

  // Check request size
  const sizeValid = securityMiddleware.sizeLimit(req, res);
  if (!sizeValid) {
    return false;
  }

  return true;
}

/**
 * Error handler middleware
 */
export function errorHandler(err, req, res, next) {
  console.error('API Error:', err);

  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(isDevelopment && { stack: err.stack }),
    timestamp: new Date().toISOString()
  });
}