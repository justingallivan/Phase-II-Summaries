/**
 * API Route: /api/auth/status
 *
 * Returns whether authentication is enabled (Azure AD configured)
 * Used by RequireAuth to determine if login should be required
 */

export default function handler(req, res) {
  const enabled = !!(
    process.env.AZURE_AD_CLIENT_ID &&
    process.env.AZURE_AD_CLIENT_SECRET &&
    process.env.AZURE_AD_TENANT_ID
  );

  res.status(200).json({ enabled });
}
