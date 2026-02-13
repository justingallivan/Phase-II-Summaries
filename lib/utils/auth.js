/**
 * Authentication utilities for API routes
 *
 * Provides server-side session checking and profile ID extraction.
 *
 * Kill Switch: Set AUTH_REQUIRED=false in environment to disable auth.
 * This allows emergency access if Azure AD credentials are misconfigured.
 */

import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../pages/api/auth/[...nextauth]';

/**
 * Check if authentication is required
 * Returns false if kill switch is off or credentials are missing
 */
export function isAuthRequired() {
  const hasCredentials = !!(
    process.env.AZURE_AD_CLIENT_ID &&
    process.env.AZURE_AD_CLIENT_SECRET &&
    process.env.AZURE_AD_TENANT_ID
  );
  const authRequired = process.env.AUTH_REQUIRED === 'true';

  if (process.env.NODE_ENV === 'production' && !(authRequired && hasCredentials)) {
    console.warn('AUTH_REQUIRED is not true in production — authentication is disabled');
  }

  return authRequired && hasCredentials;
}

/**
 * Get the authenticated session for an API route
 * Returns null if not authenticated
 *
 * @param {Object} req - Next.js API request
 * @param {Object} res - Next.js API response
 * @returns {Object|null} Session object or null
 */
export async function getSession(req, res) {
  return await getServerSession(req, res, authOptions);
}

/**
 * Check if request is authenticated and return profile ID
 * Returns null if not authenticated
 *
 * @param {Object} req - Next.js API request
 * @param {Object} res - Next.js API response
 * @returns {number|null} Profile ID or null
 */
export async function getAuthenticatedProfileId(req, res) {
  const session = await getSession(req, res);
  return session?.user?.profileId || null;
}

/**
 * Require authentication for an API route
 * Sends 401 response if not authenticated
 *
 * If AUTH_REQUIRED is false (kill switch), allows all requests through
 * with a mock session containing no user data.
 *
 * @param {Object} req - Next.js API request
 * @param {Object} res - Next.js API response
 * @returns {Object|null} Session object or null (if 401 was sent)
 *
 * @example
 * export default async function handler(req, res) {
 *   const session = await requireAuth(req, res);
 *   if (!session) return; // 401 already sent
 *
 *   // Authenticated - continue with handler
 *   const profileId = session.user.profileId;
 * }
 */
export async function requireAuth(req, res) {
  // Kill switch: if auth not required, allow through with empty session
  if (!isAuthRequired()) {
    return { user: {}, authBypassed: true };
  }

  const session = await getSession(req, res);

  if (!session) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  return session;
}

/**
 * Require authentication and return profile ID
 * Sends 401 if not authenticated, 403 if no profile linked
 *
 * If AUTH_REQUIRED is false (kill switch), falls back to userProfileId
 * from query or body parameters (existing behavior when auth is disabled).
 *
 * @param {Object} req - Next.js API request
 * @param {Object} res - Next.js API response
 * @returns {number|null} Profile ID or null (if error was sent)
 *
 * @example
 * export default async function handler(req, res) {
 *   const profileId = await requireAuthWithProfile(req, res);
 *   if (profileId === null) return; // Error already sent
 *
 *   // Use profileId for scoped queries
 * }
 */
export async function requireAuthWithProfile(req, res) {
  const session = await requireAuth(req, res);
  if (!session) return null;

  // If auth was bypassed in development, use query/body parameter
  if (session.authBypassed) {
    if (process.env.NODE_ENV === 'production') {
      console.error('AUTH_REQUIRED=false in production — refusing unauthenticated profile access');
      res.status(403).json({ error: 'Authentication is misconfigured' });
      return null;
    }
    const paramProfileId = req.query?.userProfileId || req.body?.userProfileId;
    return paramProfileId ? parseInt(paramProfileId, 10) : null;
  }

  const profileId = session.user?.profileId;
  if (!profileId) {
    res.status(403).json({ error: 'No profile linked to this account' });
    return null;
  }

  return profileId;
}

/**
 * Optional authentication - returns session if authenticated, null otherwise
 * Does not send any error response
 *
 * @param {Object} req - Next.js API request
 * @param {Object} res - Next.js API response
 * @returns {Object|null} Session object or null
 */
export async function optionalAuth(req, res) {
  return await getSession(req, res);
}
