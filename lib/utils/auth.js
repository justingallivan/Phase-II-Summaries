/**
 * Authentication utilities for API routes
 *
 * Provides server-side session checking and profile ID extraction.
 *
 * Security layers:
 * - CSRF: Origin header validation on state-changing methods (POST/PUT/PATCH/DELETE)
 * - Session revocation: is_active check on user_profiles (2-min cache TTL)
 *
 * Kill Switch: Set AUTH_REQUIRED=false in environment to disable auth.
 * This allows emergency access if Azure AD credentials are misconfigured.
 */

import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../pages/api/auth/[...nextauth]';
import { sql } from '@vercel/postgres';

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
 * Validate the Origin (or Referer) header for CSRF protection.
 * State-changing methods (POST, PUT, PATCH, DELETE) must include an Origin
 * header matching the configured NEXTAUTH_URL. If neither Origin nor Referer
 * is present, the request is allowed through (covers cron jobs, server-to-server).
 *
 * @param {Object} req - Next.js API request
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateOrigin(req) {
  const method = (req.method || '').toUpperCase();
  // Only check state-changing methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return { valid: true };
  }

  const origin = req.headers['origin'];
  const referer = req.headers['referer'];

  // If neither header is present, allow through (cron jobs, server-to-server)
  if (!origin && !referer) {
    return { valid: true };
  }

  const allowedUrl = process.env.NEXTAUTH_URL;
  if (!allowedUrl) {
    // If NEXTAUTH_URL isn't configured, skip validation
    return { valid: true };
  }

  let allowedOrigin;
  try {
    allowedOrigin = new URL(allowedUrl).origin;
  } catch {
    return { valid: true };
  }

  // Check Origin header first, fall back to Referer
  const sourceUrl = origin || referer;
  let sourceOrigin;
  try {
    sourceOrigin = new URL(sourceUrl).origin;
  } catch {
    return { valid: false, reason: 'Invalid Origin header' };
  }

  if (sourceOrigin !== allowedOrigin) {
    return { valid: false, reason: 'Origin mismatch' };
  }

  return { valid: true };
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

  // CSRF: validate Origin header on state-changing methods
  const originCheck = validateOrigin(req);
  if (!originCheck.valid) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
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

  // Check if user account is still active (session revocation for disabled accounts)
  try {
    const profileResult = await sql`SELECT is_active FROM user_profiles WHERE id = ${profileId}`;
    if (profileResult.rows.length > 0 && !profileResult.rows[0].is_active) {
      res.status(403).json({ error: 'Account has been disabled' });
      return null;
    }
  } catch (err) {
    // If DB check fails, allow through — session is still valid
    console.warn('Failed to check is_active for profile', profileId, err.message);
  }

  return profileId;
}

// --- App access cache ---
// Map<profileId, { apps: Set<string>, isSuperuser: bool, isActive: bool, loadedAt: number }>
const _appAccessCache = new Map();
const APP_ACCESS_TTL_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Clear cached app access for a specific user (or all users if no ID given).
 * Call after granting/revoking app access so changes take effect immediately.
 *
 * @param {number} [profileId] - User to clear, or omit to clear all
 */
export function clearAppAccessCache(profileId) {
  if (profileId) {
    _appAccessCache.delete(profileId);
  } else {
    _appAccessCache.clear();
  }
}

/**
 * Require authentication AND app-level access for an API route.
 * Sends 401 if unauthenticated, 403 if the user lacks access to ALL listed apps.
 * Superusers bypass all app checks.
 *
 * If AUTH_REQUIRED is false (kill switch / dev mode), allows all requests through
 * with a mock result so dev workflow is unchanged.
 *
 * @param {Object} req - Next.js API request
 * @param {Object} res - Next.js API response
 * @param {...string} appKeys - One or more app keys; user needs ANY of them (OR logic)
 * @returns {{ profileId: number|null, session: Object }|null} - Access info or null (if error was sent)
 *
 * @example
 * export default async function handler(req, res) {
 *   const access = await requireAppAccess(req, res, 'dynamics-explorer');
 *   if (!access) return;
 *   const userProfileId = access.profileId;
 * }
 */
export async function requireAppAccess(req, res, ...appKeys) {
  // Kill switch: if auth not required, allow through
  if (!isAuthRequired()) {
    return { profileId: null, session: { user: {}, authBypassed: true } };
  }

  // CSRF: validate Origin header on state-changing methods
  const originCheck = validateOrigin(req);
  if (!originCheck.valid) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }

  const session = await getSession(req, res);

  if (!session) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  const profileId = session.user?.profileId;
  if (!profileId) {
    res.status(403).json({ error: 'No profile linked to this account' });
    return null;
  }

  // Check cache
  let cached = _appAccessCache.get(profileId);
  if (!cached || Date.now() - cached.loadedAt > APP_ACCESS_TTL_MS) {
    // Parallel fetch: app grants + superuser check + active status
    const [grantsResult, rolesResult, profileResult] = await Promise.all([
      sql`SELECT app_key FROM user_app_access WHERE user_profile_id = ${profileId}`,
      sql`SELECT role FROM dynamics_user_roles WHERE user_profile_id = ${profileId}`,
      sql`SELECT is_active FROM user_profiles WHERE id = ${profileId}`,
    ]);

    cached = {
      apps: new Set(grantsResult.rows.map(r => r.app_key)),
      isSuperuser: rolesResult.rows.some(r => r.role === 'superuser'),
      isActive: profileResult.rows.length === 0 || profileResult.rows[0].is_active !== false,
      loadedAt: Date.now(),
    };
    _appAccessCache.set(profileId, cached);
  }

  // Block disabled accounts (before superuser bypass — disabled means disabled)
  if (!cached.isActive) {
    res.status(403).json({ error: 'Account has been disabled' });
    return null;
  }

  // Superusers bypass all app checks
  if (cached.isSuperuser) {
    return { profileId, session };
  }

  // Check if user has ANY of the requested app keys
  const hasAccess = appKeys.length === 0 || appKeys.some(key => cached.apps.has(key));
  if (!hasAccess) {
    res.status(403).json({ error: 'You do not have access to this application' });
    return null;
  }

  return { profileId, session };
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
