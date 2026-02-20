/**
 * Next.js Middleware - Server-side Authentication Gate
 *
 * Intercepts all requests before any page content or JS bundle is delivered.
 * Unauthenticated users are redirected to /auth/signin before seeing anything.
 *
 * Respects AUTH_REQUIRED kill switch — when disabled, all requests pass through.
 * NextAuth's own routes (/api/auth/*) are excluded so the login flow works.
 */

import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req) {
  // Kill switch: skip auth when not required
  if (process.env.AUTH_REQUIRED !== 'true') {
    return NextResponse.next();
  }

  // Check for a valid JWT token (cryptographic validation, not just cookie existence)
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    // Build the sign-in URL with a callback to return the user to their original destination
    const signInUrl = new URL('/auth/signin', req.url);
    signInUrl.searchParams.set('callbackUrl', req.url);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (browser icon)
     * - /api/auth/* (NextAuth routes must be accessible for login flow)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|api/auth).*)',
  ],
};
