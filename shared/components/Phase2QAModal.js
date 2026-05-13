/**
 * Phase II Q&A side-panel modal.
 *
 * Slide-in-right panel that streams Claude responses to questions about
 * a specific proposal summary. Backdrop is light-tint so the main page
 * stays readable while the panel is open. Extracted from
 * pages/phase-ii-writeup.js for review-burden reasons; state ownership
 * stays on the page.
 *
 * Abort behavior: closing the backdrop or the X button calls
 * `onClose()`. The page is responsible for aborting any in-flight
 * fetch via its qaAbortRef (the abort wiring lives there because the
 * SSE consumer runs there too).
 */

import { Button } from './Layout';
import { renderAppMarkdown, isSafeAppUrl } from '../utils/app-markdown';

export default function Phase2QAModal({
  isOpen,
  selectedFile,
  messages,
  chatRef,
  currentQuestion,
  onChangeQuestion,
  isProcessing,
  onClose,
  onSubmit,
}) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop — light tint so main content stays readable */}
      <div
        className="fixed inset-0 bg-black bg-opacity-20 z-40 animate-fade-in"
        onClick={() => { if (!isProcessing) onClose(); }}
      />
      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-[520px] max-w-[90vw] bg-white shadow-2xl z-50 flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div className="min-w-0 flex-1 mr-3">
            <h2 className="text-sm font-semibold text-gray-900 truncate">Ask Questions</h2>
            <p className="text-xs text-gray-500 truncate">{selectedFile}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Messages */}
        <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 py-12">
              <p className="text-sm">Ask questions about this proposal.</p>
              <p className="text-xs text-gray-400 mt-1">Claude can search the web for PI publications, institutional context, and related research.</p>
            </div>
          )}
          {messages.map((msg, index) => {
            if (msg.isThinking) {
              return (
                <div key={index} className="flex justify-start">
                  <div className="bg-gray-100 text-gray-600 p-3 rounded-lg flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent"></div>
                    <span className="text-sm">{msg.thinkingText || 'Thinking...'}</span>
                  </div>
                </div>
              );
            }
            return (
              <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-lg p-3 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : msg.isError
                      ? 'bg-red-50 text-red-800 border border-red-200'
                      : 'bg-gray-100 text-gray-900'
                }`}>
                  {msg.role === 'user' ? (
                    <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                  ) : (
                    <div className="text-sm" dangerouslySetInnerHTML={{ __html: renderAppMarkdown(msg.content) }} />
                  )}
                  {msg.isStreaming && <span className="inline-block w-2 h-4 bg-gray-400 ml-0.5 animate-pulse" />}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <p className="text-xs font-medium text-gray-500 mb-1">Sources:</p>
                      <div className="space-y-0.5">
                        {msg.sources.map((source, i) => {
                          // Source URLs come from upstream tool/search events
                          // (provider/Anthropic web-search) and bypass the
                          // markdown sanitizer entirely. Scheme-check before
                          // assigning to href so an adversarial source can't
                          // smuggle javascript:/data:/tel: into the DOM.
                          const safe = isSafeAppUrl(source.url);
                          const label = source.title || source.url;
                          return safe ? (
                            <a
                              key={i}
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-xs text-blue-600 hover:text-blue-800 hover:underline truncate"
                              title={source.url}
                            >
                              {label}
                            </a>
                          ) : (
                            <span
                              key={i}
                              className="block text-xs text-gray-500 truncate"
                              title="Source URL was rejected by the scheme allowlist"
                            >
                              {label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {/* Input */}
        <div className="border-t border-gray-200 p-3 bg-white">
          <div className="flex gap-2">
            <input
              type="text"
              value={currentQuestion}
              onChange={(e) => onChangeQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isProcessing && onSubmit()}
              placeholder="Ask a question..."
              disabled={isProcessing}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
            <Button
              variant="primary"
              onClick={onSubmit}
              disabled={isProcessing || !currentQuestion.trim()}
            >
              Ask
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
