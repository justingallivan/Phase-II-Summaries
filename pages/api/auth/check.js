/**
 * Diagnostic endpoint for auth configuration.
 * Checks that all required environment variables are present.
 * Does NOT expose secrets — only shows presence/absence and safe values.
 *
 * Visit /api/auth/check in production to diagnose SSO issues.
 * DELETE THIS FILE after debugging is complete.
 */
export default function handler(req, res) {
  const nextAuthUrl = process.env.NEXTAUTH_URL || '(not set)';

  res.status(200).json({
    env: {
      NEXTAUTH_URL: nextAuthUrl,
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? 'set' : 'MISSING',
      AZURE_AD_CLIENT_ID: process.env.AZURE_AD_CLIENT_ID ? 'set' : 'MISSING',
      AZURE_AD_CLIENT_SECRET: process.env.AZURE_AD_CLIENT_SECRET ? 'set' : 'MISSING',
      AZURE_AD_TENANT_ID: process.env.AZURE_AD_TENANT_ID ? 'set' : 'MISSING',
      AUTH_REQUIRED: process.env.AUTH_REQUIRED || '(not set)',
      NODE_ENV: process.env.NODE_ENV,
    },
    callbackUrl: `${nextAuthUrl}/api/auth/callback/azure-ad`,
    note: 'The callbackUrl above must match the Redirect URI in Azure AD app registration. Delete this endpoint after debugging.',
  });
}
