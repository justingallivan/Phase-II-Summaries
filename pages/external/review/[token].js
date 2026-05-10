/**
 * Public landing page for external reviewers — state-driven view dispatcher.
 *
 * Reached via a magic-link URL of the form `/external/review/{jwt}`. Allowed
 * through the auth middleware via the `/external/*` allowlist; the token in
 * the URL is the only auth credential.
 *
 * On mount, fetches /api/external/review/[token]/context, which returns
 * `engagementState.view` driving which view component renders:
 *
 *   stage2a               → Stage 2a invitation landing (Session C)
 *   accepted-pre-materials → post-accept confirmation
 *   declined              → post-decline confirmation
 *   stage2b               → materials list + review-form upload
 *   submitted             → same as stage2b but with submitted-state notice
 *   withdrawn-sufficient  → terminal "no longer needed" view
 *
 * One client-only view exists (`decline-form`) that the dispatcher routes
 * to when the reviewer clicks Decline on Stage 2a. It's pushed into
 * window.history so browser back returns to Stage 2a; refresh on this view
 * lands deterministically back on the server-derived view.
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Stage2aView from '../../../shared/components/external/Stage2aView';
import DeclineFormView from '../../../shared/components/external/DeclineFormView';
import AcceptedConfirmationView from '../../../shared/components/external/AcceptedConfirmationView';
import DeclinedConfirmationView from '../../../shared/components/external/DeclinedConfirmationView';
import MaterialsView from '../../../shared/components/external/MaterialsView';

export default function ExternalReviewPage() {
  const router = useRouter();
  const { token } = router.query;
  const [state, setState] = useState({ status: 'loading' });
  // viewOverride: client-only state for `decline-form`. null = use server view.
  const [viewOverride, setViewOverride] = useState(null);

  const fetchContext = useCallback(async () => {
    try {
      const resp = await fetch(`/api/external/review/${encodeURIComponent(token)}/context`);
      const json = await resp.json();
      if (!resp.ok || !json.ok) {
        setState({ status: 'error', reason: json.reason || 'server_error' });
        return;
      }
      setState({ status: 'ready', data: json });
    } catch (e) {
      setState({ status: 'error', reason: 'network' });
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchContext();
  }, [token, fetchContext]);

  // History integration: pushing a state with `{ stage2aView: 'decline-form' }`
  // makes browser back/forward navigate between Stage 2a and the decline form
  // even though the URL doesn't change. popstate clears the override.
  useEffect(() => {
    function onPopState(e) {
      const next = e.state?.stage2aView || null;
      setViewOverride(next === 'decline-form' ? 'decline-form' : null);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function pushDeclineFormView() {
    setViewOverride('decline-form');
    if (typeof window !== 'undefined') {
      window.history.pushState({ stage2aView: 'decline-form' }, '');
    }
  }

  function popDeclineFormView() {
    setViewOverride(null);
    if (typeof window !== 'undefined' && window.history.state?.stage2aView === 'decline-form') {
      window.history.back();
    }
  }

  // After accept/decline submit succeeds, refresh server context. The new
  // view will be driven by the updated engagementState (e.g.,
  // accepted-pre-materials or declined).
  function onResponseSubmitted() {
    setViewOverride(null);
    if (typeof window !== 'undefined' && window.history.state?.stage2aView === 'decline-form') {
      // Replace history state so back-button doesn't return to the form.
      window.history.replaceState({}, '');
    }
    fetchContext();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Reviewer Portal — W. M. Keck Foundation</title>
      </Head>
      <div className="max-w-3xl mx-auto px-4 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">W. M. Keck Foundation Reviewer Portal</h1>
        </header>

        {state.status === 'loading' && <LoadingPanel />}
        {state.status === 'error' && <ErrorPanel reason={state.reason} />}
        {state.status === 'ready' && (
          <Dispatcher
            data={state.data}
            token={token}
            viewOverride={viewOverride}
            onRequestDecline={pushDeclineFormView}
            onCancelDecline={popDeclineFormView}
            onResponseSubmitted={onResponseSubmitted}
          />
        )}
      </div>
    </div>
  );
}

function Dispatcher({ data, token, viewOverride, onRequestDecline, onCancelDecline, onResponseSubmitted }) {
  // Client-only views take precedence; otherwise dispatch on server-derived view.
  const view = viewOverride || data.engagementState?.view || 'stage2a';

  switch (view) {
    case 'decline-form':
      return (
        <DeclineFormView
          token={token}
          onCancel={onCancelDecline}
          onDeclined={onResponseSubmitted}
        />
      );

    case 'stage2a':
      return (
        <Stage2aView
          data={data}
          token={token}
          onRequestDecline={onRequestDecline}
          onAccepted={onResponseSubmitted}
        />
      );

    case 'accepted-pre-materials':
      return (
        <AcceptedConfirmationView
          data={data}
          onRequestFlipToDecline={onRequestDecline}
        />
      );

    case 'declined':
      return (
        <DeclinedConfirmationView
          data={data}
          onRequestFlipToAccept={onResponseSubmitted /* no-op until full flip flow */}
        />
      );

    case 'stage2b':
    case 'submitted':
      return <MaterialsView data={data} token={token} />;

    case 'withdrawn-sufficient':
      return <WithdrawnSufficientNotice />;

    default:
      // Defensive fallback — unrecognized server state.
      return <UnknownStateNotice view={view} />;
  }
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
    policy_misconfigured: 'A configuration issue is preventing this page from loading. The Foundation has been notified.',
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

function WithdrawnSufficientNotice() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-8">
      <h2 className="text-lg font-semibold text-gray-900">No longer needed</h2>
      <p className="text-sm text-gray-700 mt-2">
        Thank you for your willingness to review. We've already lined up enough
        reviewers for this proposal and won't be needing your help on this one.
        We hope to call on you again soon.
      </p>
    </div>
  );
}

function UnknownStateNotice({ view }) {
  return (
    <div className="bg-white rounded-2xl border border-yellow-200 p-8">
      <h2 className="text-lg font-semibold text-yellow-900">Unexpected state</h2>
      <p className="text-sm text-gray-700 mt-2">
        We can't determine the current status of this invitation. Please
        contact The Foundation.
      </p>
      <p className="text-xs text-gray-500 mt-4">Reference: <code>{view}</code></p>
    </div>
  );
}
