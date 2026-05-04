/**
 * /apply — applicant landing page (smoke test)
 *
 * Foundation only: renders the authenticated applicant's identity so we can
 * verify the External ID round-trip works end-to-end. No form, no draft
 * staging, no Dynamics writes yet — those land in subsequent sessions.
 *
 * Auth: gated by middleware (`userType === 'applicant'`). Unauthenticated
 * visitors get bounced to NextAuth's sign-in page; we pre-fill the provider
 * via `?provider=entra-external` so they go straight to the OTP flow rather
 * than the staff Azure AD picker.
 *
 * Once the real intake portal lands, this page becomes the applicant
 * dashboard (institution selection, in-progress drafts, etc.).
 */

import { useSession, signIn, signOut } from 'next-auth/react';
import { useEffect } from 'react';

export default function ApplyHome() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === 'unauthenticated') {
      signIn('entra-external', { callbackUrl: '/apply' });
    }
  }, [status]);

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <Layout>
        <p className="text-gray-500">Signing you in…</p>
      </Layout>
    );
  }

  if (session?.user?.userType !== 'applicant') {
    // Defense-in-depth — middleware should already have blocked this path
    // for staff sessions. If we got here, something's wrong with the gate.
    return (
      <Layout>
        <p className="text-red-700">
          This page is for grant applicants. If you reached it from the staff
          app, please sign out and try again.
        </p>
        <button
          onClick={() => signOut({ callbackUrl: '/apply' })}
          className="mt-4 inline-flex items-center px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700"
        >
          Sign out
        </button>
      </Layout>
    );
  }

  const { contactEmail, contactOid, contactName } = session.user;

  return (
    <Layout>
      <h1 className="text-2xl font-semibold text-gray-900">Welcome to WMKF Apply</h1>
      <p className="mt-3 text-gray-600">
        You're signed in. Form modules and institution selection arrive in a later
        release.
      </p>

      <dl className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" value={contactName || '(not provided)'} />
        <Field label="Email" value={contactEmail} />
        <Field label="Object ID" value={contactOid} mono />
      </dl>

      <button
        onClick={() => signOut({ callbackUrl: '/apply' })}
        className="mt-10 inline-flex items-center px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
      >
        Sign out
      </button>
    </Layout>
  );
}

function Field({ label, value, mono = false }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className={`mt-1 text-sm text-gray-900 ${mono ? 'font-mono break-all' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

function Layout({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="mb-8 text-sm font-medium text-indigo-600">WMKF Apply</div>
        {children}
      </div>
    </div>
  );
}
