import { useState } from 'react';
import { Card } from './Layout';

const ERROR_CATEGORIES = [
  { pattern: /^Please /i, category: 'validation' },
  { pattern: /429|rate limit/i, category: 'Rate Limited', message: 'Too many requests. Please wait a moment and try again.' },
  { pattern: /529|overloaded/i, category: 'Service Overloaded', message: 'The AI service is temporarily overloaded. Try again in a few minutes.' },
  { pattern: /communicate with Claude|AI service/i, category: 'AI Unavailable', message: 'Unable to reach the AI service. It may be temporarily down.' },
  { pattern: /credit|billing|payment|insufficient/i, category: 'Credit / Billing', message: 'The AI service may need attention. Contact your administrator.' },
  { pattern: /upload|Upload failed/i, category: 'Upload Error', message: 'File upload failed. Check your file format and size, then try again.' },
  { pattern: /401|Authentication required/i, category: 'Auth Error', message: 'Your session may have expired. Refresh the page to sign in again.' },
  { pattern: /403|disabled|do not have access/i, category: 'Access Denied', message: "You don't have access to this feature. Contact your administrator." },
  { pattern: /Invalid file|not an accepted format|corrupted/i, category: 'Invalid File', message: 'The file format is not supported. Check your file and try again.' },
  { pattern: /too large|exceeds maximum size/i, category: 'File Too Large', message: 'The file is too large. Reduce the file size and try again.' },
  { pattern: /fetch|network|Failed to fetch/i, category: 'Network Error', message: 'Network connection issue. Check your internet connection and try again.' },
];

function classifyError(error) {
  if (!error) return null;
  for (const rule of ERROR_CATEGORIES) {
    if (rule.pattern.test(error)) {
      if (rule.category === 'validation') {
        return { type: 'validation', message: error };
      }
      return { type: 'operational', category: rule.category, message: rule.message, raw: error };
    }
  }
  return {
    type: 'operational',
    category: 'Error',
    message: 'Something went wrong. If this persists, screenshot this message and contact your administrator.',
    raw: error,
  };
}

function generateRefCode() {
  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `ERR-${date}-${time}-${rand}`;
}

export default function ErrorAlert({ error, onDismiss, className = 'mb-6' }) {
  const [showDetails, setShowDetails] = useState(false);
  const classified = classifyError(error);

  if (!classified) return null;

  if (classified.type === 'validation') {
    return (
      <Card hover={false} className={`border-amber-200 bg-amber-50 ${className}`}>
        <div className="flex items-center gap-3">
          <span className="text-amber-600 text-xl flex-shrink-0">⚠️</span>
          <p className="text-amber-800 font-medium flex-1">{classified.message}</p>
          {onDismiss && (
            <button onClick={onDismiss} className="text-amber-400 hover:text-amber-600 flex-shrink-0" aria-label="Dismiss">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </Card>
    );
  }

  const refCode = generateRefCode();
  const timestamp = new Date().toLocaleString();

  return (
    <Card hover={false} className={`border-red-200 bg-red-50 ${className}`}>
      <div className="flex items-start gap-3">
        <span className="text-red-600 text-xl flex-shrink-0 mt-0.5">⚠️</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-red-500">{classified.category}</span>
          </div>
          <p className="text-red-800 font-medium">{classified.message}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-red-400">
            <span>{timestamp}</span>
            <span className="font-mono">{refCode}</span>
          </div>
          {classified.raw && classified.raw !== classified.message && (
            <div className="mt-2">
              <button
                onClick={() => setShowDetails(v => !v)}
                className="text-xs text-red-500 hover:text-red-700 underline"
              >
                {showDetails ? 'Hide details' : 'Show details'}
              </button>
              {showDetails && (
                <pre className="mt-1 text-xs text-red-600 bg-red-100 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">
                  {classified.raw}
                </pre>
              )}
            </div>
          )}
        </div>
        {onDismiss && (
          <button onClick={onDismiss} className="text-red-400 hover:text-red-600 flex-shrink-0" aria-label="Dismiss">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </Card>
  );
}
