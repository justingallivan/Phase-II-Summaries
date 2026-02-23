/**
 * Next.js Middleware - Server-side Authentication Gate
 *
 * Intercepts all requests before any page content or JS bundle is delivered.
 * Unauthenticated users are redirected to /auth/signin before seeing anything.
 *
 * Respects AUTH_REQUIRED kill switch — when disabled, all requests pass through.
 * NextAuth's own routes (/api/auth/*) are excluded so the login flow works.
 *
 * Uses withAuth from next-auth/middleware (Edge Runtime compatible, uses jose
 * instead of Node.js crypto).
 */

import { withAuth } from 'next-auth/middleware';

export default withAuth(
  {
    callbacks: {
      authorized({ token }) {
        // Kill switch: allow all when auth is not required
        if (process.env.AUTH_REQUIRED !== 'true') return true;
        // Require a valid JWT token (cryptographic validation via jose)
        return !!token;
      },
    },
    pages: {
      signIn: '/auth/signin',
    },
  }
);

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (browser icon)
     * - /api/auth/* (NextAuth routes must be accessible for login flow)
     * - /api/cron/* (Vercel cron jobs authenticate via CRON_SECRET, not JWT)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|api/auth|api/cron).*)',
  ],
};
