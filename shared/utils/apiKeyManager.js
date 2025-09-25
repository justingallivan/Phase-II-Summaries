import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SECRET_KEY = process.env.API_SECRET_KEY || 'default-secret-key-change-in-production';
const SALT = 'api-key-salt';

export class ApiKeyManager {
  constructor() {
    this.keyCache = new Map();
    this.cacheTimeout = 3600000; // 1 hour
  }

  /**
   * Encrypt an API key for client storage
   * @param {string} apiKey - The API key to encrypt
   * @returns {Object} - Encrypted data and metadata
   */
  encryptForClient(apiKey) {
    try {
      const key = crypto.scryptSync(SECRET_KEY, SALT, 32);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
      
      let encrypted = cipher.update(apiKey, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt API key');
    }
  }

  /**
   * Decrypt an API key from client storage
   * @param {Object} encryptedData - Encrypted data object
   * @returns {string} - Decrypted API key
   */
  decryptFromClient(encryptedData) {
    try {
      const { encrypted, iv, authTag } = encryptedData;
      
      const key = crypto.scryptSync(SECRET_KEY, SALT, 32);
      const decipher = crypto.createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(iv, 'hex')
      );
      
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt API key');
    }
  }

  /**
   * Generate a temporary session token for API key
   * @param {string} apiKey - The API key
   * @returns {string} - Session token
   */
  generateSessionToken(apiKey) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const hashedKey = crypto
      .createHash('sha256')
      .update(apiKey)
      .digest('hex');
    
    this.keyCache.set(sessionId, {
      hashedKey,
      apiKey,
      timestamp: Date.now()
    });

    // Clean up expired tokens
    this.cleanupExpiredTokens();
    
    return sessionId;
  }

  /**
   * Validate and retrieve API key from session token
   * @param {string} sessionToken - Session token
   * @returns {string|null} - API key or null if invalid
   */
  getApiKeyFromToken(sessionToken) {
    const session = this.keyCache.get(sessionToken);
    
    if (!session) {
      return null;
    }

    const now = Date.now();
    if (now - session.timestamp > this.cacheTimeout) {
      this.keyCache.delete(sessionToken);
      return null;
    }

    // Refresh timestamp on successful retrieval
    session.timestamp = now;
    return session.apiKey;
  }

  /**
   * Validate API key format
   * @param {string} apiKey - API key to validate
   * @returns {boolean} - Whether key appears valid
   */
  validateApiKeyFormat(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }

    // Claude API keys typically start with 'sk-ant-'
    const claudeKeyPattern = /^sk-ant-[\w-]+$/;
    
    return claudeKeyPattern.test(apiKey.trim());
  }

  /**
   * Clean up expired session tokens
   */
  cleanupExpiredTokens() {
    const now = Date.now();
    for (const [token, session] of this.keyCache.entries()) {
      if (now - session.timestamp > this.cacheTimeout) {
        this.keyCache.delete(token);
      }
    }
  }

  /**
   * Get server-side API key from environment
   * @returns {string|null} - API key from environment
   */
  getServerApiKey() {
    const apiKey = process.env.CLAUDE_API_KEY;
    
    if (!apiKey) {
      console.warn('No server-side API key configured');
      return null;
    }

    if (!this.validateApiKeyFormat(apiKey)) {
      console.error('Invalid server-side API key format');
      return null;
    }

    return apiKey;
  }

  /**
   * Choose API key source (server or client)
   * @param {string} clientApiKey - Client-provided API key
   * @returns {string} - API key to use
   */
  selectApiKey(clientApiKey) {
    // Prefer server-side key if available
    const serverKey = this.getServerApiKey();
    if (serverKey) {
      return serverKey;
    }

    // Fall back to client key if valid
    if (clientApiKey && this.validateApiKeyFormat(clientApiKey)) {
      return clientApiKey;
    }

    throw new Error('No valid API key available');
  }
}

// Singleton instance
let apiKeyManager;

export function getApiKeyManager() {
  if (!apiKeyManager) {
    apiKeyManager = new ApiKeyManager();
  }
  return apiKeyManager;
}