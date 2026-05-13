/**
 * Phase II refine-summary feedback modal.
 *
 * Extracted from pages/phase-ii-writeup.js for review-burden reasons —
 * the page was carrying upload + streaming + QA + Word export + this
 * modal all in one file. Per the action plan, state ownership stays
 * on the page; this component is a pure render layer driven by props.
 */

import { Button } from './Layout';

export default function Phase2FeedbackModal({
  isOpen,
  selectedFile,
  feedbackText,
  onChangeFeedbackText,
  isRefining,
  onClose,
  onSubmit,
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      onClick={isRefining ? null : onClose}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Refine Summary - {selectedFile}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
            disabled={isRefining}
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col p-4">
          {isRefining ? (
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center gap-3">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-400 border-t-transparent"></div>
                <span className="text-gray-700 font-medium">Claude is refining your summary...</span>
              </div>
              <p className="text-gray-600">Please wait while your feedback is being processed and incorporated into an improved summary.</p>
              <div className="bg-gray-50 p-4 rounded-lg text-left">
                <p className="font-medium text-gray-900 mb-2">Your feedback:</p>
                <p className="text-gray-700 italic">&quot;{feedbackText}&quot;</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <textarea
                value={feedbackText}
                onChange={(e) => onChangeFeedbackText(e.target.value)}
                placeholder="Provide specific feedback on how to improve the summary..."
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
              <div className="flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={onClose}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={onSubmit}
                  disabled={isRefining || !feedbackText.trim()}
                >
                  {isRefining ? 'Refining...' : 'Refine Summary'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
