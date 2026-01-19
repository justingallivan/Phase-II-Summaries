/**
 * Custom Authentication Error Page
 *
 * Shows friendly error messages for authentication failures
 */

import { useRouter } from 'next/router';
import Link from 'next/link';
import Head from 'next/head';

export default function AuthError() {
  const router = useRouter();
  const { error } = router.query;

  const errorInfo = {
    Configuration: {
      title: 'Configuration Error',
      message: 'There is a problem with the server configuration. Please contact the administrator.',
      icon: (
        <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    AccessDenied: {
      title: 'Access Denied',
      message: 'You do not have permission to access this application. Please contact your administrator if you believe this is an error.',
      icon: (
        <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      ),
    },
    Verification: {
      title: 'Link Expired',
      message: 'The sign in link has expired or has already been used. Please try signing in again.',
      icon: (
        <svg className="w-12 h-12 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    Default: {
      title: 'Authentication Error',
      message: 'An error occurred during sign in. Please try again.',
      icon: (
        <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
  };

  const currentError = errorInfo[error] || errorInfo.Default;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <Head>
        <title>Authentication Error - Document Processing Suite</title>
      </Head>

      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 text-center">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            {currentError.icon}
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {currentError.title}
          </h1>

          {/* Message */}
          <p className="text-gray-600 mb-8">
            {currentError.message}
          </p>

          {/* Error Code (for debugging) */}
          {error && (
            <div className="mb-6 px-3 py-2 bg-gray-100 rounded-lg">
              <code className="text-sm text-gray-500">Error code: {error}</code>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3">
            <Link
              href="/auth/signin"
              className="block w-full px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-xl transition-colors text-center"
            >
              Try Again
            </Link>
            <Link
              href="/"
              className="block w-full px-6 py-3 border border-gray-300 hover:border-gray-400 text-gray-700 font-medium rounded-xl transition-colors text-center"
            >
              Go to Home
            </Link>
          </div>
        </div>

        {/* Help */}
        <p className="text-center text-sm text-gray-500 mt-6">
          If this problem persists, please contact{' '}
          <a href="mailto:justingallivan@me.com" className="text-indigo-600 hover:underline">
            support
          </a>
          .
        </p>
      </div>
    </div>
  );
}
