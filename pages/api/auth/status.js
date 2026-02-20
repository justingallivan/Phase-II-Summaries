/**
 * API Route: /api/auth/status
 *
 * Returns whether authentication is enabled and required.
 * Used by RequireAuth to determine if login should be required.
 *
 * Authentication is enabled when ALL of these conditions are met:
 * 1. AUTH_REQUIRED=true (kill switch - set to false to disable auth)
 * 2. Azure AD credentials are configured (CLIENT_ID, CLIENT_SECRET, TENANT_ID)
 *
 * Kill Switch Usage:
 * - If locked out, go to Vercel Dashboard → Environment Variables
 * - Set AUTH_REQUIRED=false and redeploy
 * - This disables auth without changing code
 */

export default function handler(req, res) {
  const hasCredentials = !!(
    process.env.AZURE_AD_CLIENT_ID &&
    process.env.AZURE_AD_CLIENT_SECRET &&
    process.env.AZURE_AD_TENANT_ID
  );

  // Kill switch: AUTH_REQUIRED must be explicitly set to 'true'
  const authRequired = process.env.AUTH_REQUIRED === 'true';

  const enabled = authRequired && hasCredentials;

  res.status(200).json({ enabled });
}
