/**
 * Next.js Middleware - Server-side Authentication Gate + Nonce-based CSP
 *
 * Intercepts all requests before any page content or JS bundle is delivered.
 * Unauthenticated users are redirected to /auth/signin before seeing anything.
 *
 * Generates a unique nonce per request for Content Security Policy.
 * Next.js automatically applies the nonce to framework scripts during SSR
 * when it detects 'nonce-{value}' in the CSP header.
 *
 * Respects AUTH_REQUIRED kill switch — when disabled, all requests pass through.
 * NextAuth's own routes (/api/auth/*) are excluded so the login flow works.
 *
 * Uses withAuth from next-auth/middleware (Edge Runtime compatible, uses jose
 * instead of Node.js crypto).
 */

import { NextResponse } from 'next/server';
import { withAuth } from 'next-auth/middleware';

export default withAuth(
  function middleware(req) {
    // Generate a unique nonce for this request
    const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
    const isDev = process.env.NODE_ENV === 'development';

    // Build CSP directives
    // Dev: Turbopack injects inline scripts without nonces, needs unsafe-inline + unsafe-eval.
    //      localhost is HTTP, so upgrade-insecure-requests would break all resource loads.
    // Prod: 'self' allows same-origin script chunks, nonce covers any inline scripts on
    //      SSR pages. No unsafe-inline or unsafe-eval — blocks injected scripts and eval.
    //      Note: 'strict-dynamic' is NOT used because SSG pages are pre-rendered at build
    //      time without nonces on script tags, so strict-dynamic would override 'self' and
    //      block all same-origin scripts.
    const scriptSrc = isDev
      ? `'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com`
      : `'self' 'nonce-${nonce}' https://va.vercel-scripts.com`;

    // style-src: 'unsafe-inline' in both modes — safe (no script execution vector),
    // avoids edge cases with framework-injected styles on SSG pages.
    const styleSrc = `'self' 'unsafe-inline'`;

    const connectSrc = isDev
      ? `'self' https://*.public.blob.vercel-storage.com https://vercel.com https://*.vercel-insights.com ws://localhost:3000 ws://127.0.0.1:3000`
      : `'self' https://vercel.com https://*.vercel-insights.com`;

    const directives = [
      `default-src 'self'`,
      `script-src ${scriptSrc}`,
      `style-src ${styleSrc}`,
      `img-src 'self' data: https:`,
      `font-src 'self'`,
      `connect-src ${connectSrc}`,
      `frame-ancestors 'none'`,
    ];

    // Only upgrade insecure requests in production (localhost is HTTP)
    if (!isDev) {
      directives.push(`upgrade-insecure-requests`);
    }

    const csp = directives.join('; ');

    // Clone request headers and add nonce + CSP
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', csp);

    // Return response with CSP set on both request and response headers
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    response.headers.set('Content-Security-Policy', csp);

    return response;
  },
  {
    callbacks: {
      authorized({ token }) {
        // Kill switch: allow all when auth is not required
        if (process.env.AUTH_REQUIRED !== 'true') return true;
        // Require a valid JWT with azureId (empty token from idle timeout returns {})
        if (!token?.azureId) return false;
        // Defense-in-depth idle check: reject if lastActivity is stale (2 hours)
        if (token.lastActivity && Date.now() - token.lastActivity > 2 * 60 * 60 * 1000) {
          return false;
        }
        return true;
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
     * - apple-touch-icon* (iOS home screen icons)
     * - /api/auth/* (NextAuth routes must be accessible for login flow)
     * - /api/cron/* (Vercel cron jobs authenticate via CRON_SECRET, not JWT)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|apple-touch-icon|api/auth|api/cron).*)',
  ],
};
