/**
 * Cron Authentication Utility
 *
 * Verifies that cron endpoint requests carry a valid Bearer token
 * matching the CRON_SECRET environment variable. In dev mode, auth
 * is bypassed to allow local testing via curl.
 *
 * Usage:
 *   const { verifyCronSecret } = require('../../lib/utils/cron-auth');
 *   const ok = verifyCronSecret(req, res);
 *   if (!ok) return;
 */

/**
 * Verify that the request carries a valid cron secret.
 * Sends an error response and returns false if invalid.
 *
 * @param {Object} req - Next.js API request
 * @param {Object} res - Next.js API response
 * @returns {boolean} true if authorized
 */
function verifyCronSecret(req, res) {
  // Dev mode bypass — no secret required locally
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('CRON_SECRET not configured in production');
    res.status(500).json({ error: 'Cron secret not configured' });
    return false;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  return true;
}

module.exports = { verifyCronSecret };
