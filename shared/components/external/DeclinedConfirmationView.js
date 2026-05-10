/**
 * Post-decline confirmation view — shown after a successful decline (or
 * when reviewer returns to a previously-declined engagement). Allows
 * flipping back to accept while reversibility is still permitted.
 */

import { useEffect, useRef } from 'react';

export default function DeclinedConfirmationView({ data, onRequestFlipToAccept }) {
  const canFlipState = data.engagementState?.canFlipState;
  const headingRef = useRef(null);

  useEffect(() => {
    if (headingRef.current) headingRef.current.focus();
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 space-y-5">
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Declined</p>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-xl font-semibold text-gray-900 mt-1 outline-none"
        >
          Thank you. We've recorded your decline.
        </h2>
      </div>

      <p className="text-sm text-gray-700">
        We hope we can call on you in the future. If you suggested someone
        else, we'll follow up with them directly.
      </p>

      {canFlipState && (
        <div className="pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-500">Changed your mind?</p>
          <button
            type="button"
            onClick={onRequestFlipToAccept}
            className="text-sm text-gray-700 underline-offset-2 hover:underline mt-1"
          >
            Accept this invitation instead
          </button>
        </div>
      )}
    </div>
  );
}
