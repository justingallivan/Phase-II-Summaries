/**
 * Public landing page for external reviewers.
 *
 * Reached via a magic-link URL of the form `/external/review/{jwt}`. Allowed
 * through the auth middleware via the `/external/*` allowlist; the token in
 * the URL is the only auth credential.
 *
 * On mount, fetches /api/external/review/[token]/context, which does the
 * verification + suggestion lookup in one round-trip and returns rendering
 * data. Failure modes (expired/revoked/malformed) become friendly error
 * states rather than the page crashing.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import ReviewFormFields from '../../../shared/components/external/ReviewFormFields';

export default function ExternalReviewPage() {
  const router = useRouter();
  const { token } = router.query;
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`/api/external/review/${encodeURIComponent(token)}/context`);
        const json = await resp.json();
        if (cancelled) return;
        if (!resp.ok || !json.ok) {
          setState({ status: 'error', reason: json.reason || 'server_error' });
          return;
        }
        setState({ status: 'ready', data: json });
      } catch (e) {
        if (!cancelled) setState({ status: 'error', reason: 'network' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Reviewer Portal — W. M. Keck Foundation</title>
      </Head>
      <div className="max-w-3xl mx-auto px-4 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">W. M. Keck Foundation Reviewer Portal</h1>
          <p className="text-sm text-gray-600 mt-1">
            Download proposal materials and submit your completed review.
          </p>
        </header>

        {state.status === 'loading' && <LoadingPanel />}
        {state.status === 'error' && <ErrorPanel reason={state.reason} />}
        {state.status === 'ready' && (
          <ReadyPanel data={state.data} token={token} />
        )}
      </div>
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
      <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      <p className="text-sm text-gray-600 mt-3">Verifying your link…</p>
    </div>
  );
}

function ErrorPanel({ reason }) {
  const messages = {
    no_token: 'No review link was provided.',
    expired: 'This review link has expired. Please contact The Foundation to receive a new one.',
    token_expires_passed: 'This review link has expired. Please contact The Foundation to receive a new one.',
    invalid_signature: 'This link is not valid. Please make sure you copied the entire URL from your invitation email.',
    invalid_claim: 'This link is not valid. Please make sure you copied the entire URL from your invitation email.',
    malformed: 'This link is not valid. Please make sure you copied the entire URL from your invitation email.',
    hash_mismatch: 'This link has been replaced by a newer one. Please use the most recent invitation email.',
    revoked: 'This link has been revoked. Please contact The Foundation to receive a new one.',
    not_found: "We couldn't find a review for this link. Please contact The Foundation.",
    network: 'Network error. Please check your connection and try again.',
    server_error: 'Something went wrong on our end. Please try again, or contact The Foundation if the problem continues.',
  };
  return (
    <div className="bg-white rounded-2xl border border-red-200 p-8">
      <h2 className="text-lg font-semibold text-red-900">We couldn't open your review</h2>
      <p className="text-sm text-gray-700 mt-2">
        {messages[reason] || messages.server_error}
      </p>
      <p className="text-xs text-gray-500 mt-4">Reference: <code>{reason}</code></p>
    </div>
  );
}

function ReadyPanel({ data, token }) {
  const submitted = !!data.submission?.receivedAt;
  return (
    <div className="space-y-6">
      <ProposalCard data={data} />
      <FilesCard data={data} token={token} />
      {submitted && <SubmittedNotice data={data} />}
      <UploadCard data={data} token={token} alreadySubmitted={submitted} />
    </div>
  );
}

function ProposalCard({ data }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <p className="text-xs uppercase tracking-wide text-gray-500">Proposal</p>
      <h2 className="text-lg font-semibold text-gray-900 mt-1">{data.proposal.title}</h2>
      <p className="text-sm text-gray-600 mt-1">
        Request #{data.proposal.requestNumber}
      </p>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-gray-500">Reviewer</p>
          <p className="text-gray-900">{data.reviewer.name || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Submission deadline</p>
          <p className="text-gray-900">
            {data.tokenExpiresAt
              ? new Date(data.tokenExpiresAt).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })
              : '—'}
          </p>
        </div>
      </div>
    </div>
  );
}

function FilesCard({ data, token }) {
  if (!data.files || data.files.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h3 className="text-base font-semibold text-gray-900">Proposal materials</h3>
        <p className="text-sm text-gray-600 mt-2">
          The Foundation hasn&apos;t shared materials for this review yet. Please contact us if you need them.
        </p>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <h3 className="text-base font-semibold text-gray-900">Proposal materials</h3>
      <ul className="mt-3 divide-y divide-gray-100">
        {data.files.map(f => {
          const downloadUrl = `/api/external/review/${encodeURIComponent(token)}/proposal?fileId=${encodeURIComponent(f.id)}&library=${encodeURIComponent(f.library)}`;
          return (
            <li key={`${f.library}::${f.id}`} className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-900 truncate">{f.name}</p>
                <p className="text-xs text-gray-500">{formatBytes(f.size)}</p>
              </div>
              <a
                href={downloadUrl}
                className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800"
              >
                Download
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SubmittedNotice({ data }) {
  return (
    <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
      <p className="text-sm font-semibold text-green-900">Review received</p>
      <p className="text-sm text-green-800 mt-1">
        We received your review on{' '}
        {new Date(data.submission.receivedAt).toLocaleString(undefined, {
          dateStyle: 'long',
          timeStyle: 'short',
        })}
        {data.submission.filename ? ` (${data.submission.filename})` : ''}.
        Re-uploading below will replace what you submitted.
      </p>
    </div>
  );
}

function UploadCard({ data, token, alreadySubmitted }) {
  const formRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrors(null);
    setSuccess(false);

    const form = formRef.current;
    if (!form) return;
    const formData = new FormData(form);

    // Sanity check at least one file is selected.
    const fileEntries = formData.getAll('files').filter(f => f && f.size > 0);
    if (fileEntries.length === 0) {
      setErrors(['Please attach at least one file.']);
      return;
    }

    setSubmitting(true);
    try {
      const resp = await fetch(`/api/external/review/${encodeURIComponent(token)}/upload`, {
        method: 'POST',
        body: formData,
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.ok) {
        setErrors(json.errors || [json.reason || 'Upload failed. Please try again.']);
      } else {
        setSuccess(true);
        // Refresh the page so the submitted-state notice rerenders with the
        // new received-at timestamp.
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (e) {
      setErrors(['Network error. Please try again.']);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <h3 className="text-base font-semibold text-gray-900">
        {alreadySubmitted ? 'Replace your submission' : 'Submit your review'}
      </h3>
      <p className="text-sm text-gray-600 mt-2">
        Upload up to 5 files (PDF, DOCX, or DOC). Each file must be under 25&nbsp;MB. Then complete the short form below.
      </p>

      <form ref={formRef} onSubmit={handleSubmit} className="mt-5 space-y-6">
        <div>
          <label htmlFor="ext-files" className="block text-sm font-semibold text-gray-900">
            Review file(s) <span className="text-red-600">*</span>
          </label>
          <input
            id="ext-files"
            name="files"
            type="file"
            accept=".pdf,.doc,.docx"
            multiple
            required
            disabled={submitting}
            className="mt-2 block w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:bg-gray-900 file:text-white hover:file:bg-gray-800 disabled:opacity-50"
          />
        </div>

        <ReviewFormFields initialValues={data.prefill} disabled={submitting} idPrefix="ext" />

        {errors && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
            <p className="font-semibold">Please fix the following:</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              {errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
            Submitted — thank you. Reloading…
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 disabled:bg-gray-400"
          >
            {submitting ? 'Uploading…' : alreadySubmitted ? 'Replace submission' : 'Submit review'}
          </button>
        </div>
      </form>
    </div>
  );
}

function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Public page — bypasses the app's auth-required wrapper via the
// `/external/` branch in `pages/_app.js`. Middleware allowlists the route
// at the framework layer.
