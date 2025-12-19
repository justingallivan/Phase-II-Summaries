/**
 * EmailGeneratorModal - Multi-step modal for generating reviewer invitation emails
 *
 * Steps:
 * 1. Review selected candidates (show email status, warn on missing)
 * 2. Options (Claude personalization, template preview)
 * 3. Progress (generation with SSE)
 * 4. Download (individual files or ZIP)
 */

import { useState, useEffect, useRef } from 'react';
import EmailTemplateEditor from './EmailTemplateEditor';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from './EmailSettingsPanel';
import { DEFAULT_TEMPLATE } from '../../lib/utils/email-generator';

// Modal steps
const STEPS = {
  REVIEW: 'review',
  OPTIONS: 'options',
  PROGRESS: 'progress',
  DOWNLOAD: 'download'
};

export default function EmailGeneratorModal({
  isOpen,
  onClose,
  candidates,
  proposalInfo,
  claudeApiKey
}) {
  const [step, setStep] = useState(STEPS.REVIEW);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [usePersonalization, setUsePersonalization] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });
  const [generatedEmails, setGeneratedEmails] = useState([]);
  const [errors, setErrors] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);

  const abortControllerRef = useRef(null);

  // Load settings and template from localStorage
  useEffect(() => {
    try {
      const storedSettings = localStorage.getItem(STORAGE_KEYS.EMAIL_SETTINGS);
      if (storedSettings) {
        setSettings(JSON.parse(atob(storedSettings)));
      }

      const storedTemplate = localStorage.getItem(STORAGE_KEYS.EMAIL_TEMPLATE);
      if (storedTemplate) {
        setTemplate(JSON.parse(atob(storedTemplate)));
      }
    } catch (error) {
      console.error('Failed to load email settings:', error);
    }
  }, [isOpen]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(STEPS.REVIEW);
      setProgress({ current: 0, total: 0, message: '' });
      setGeneratedEmails([]);
      setErrors([]);
      setIsGenerating(false);
      setShowTemplateEditor(false);
    }
  }, [isOpen]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  if (!isOpen) return null;

  // Separate candidates by email status
  const withEmail = candidates.filter(c => c.email);
  const withoutEmail = candidates.filter(c => !c.email);

  // Check if settings are configured
  const hasSettings = settings.senderEmail && settings.signature;

  // Generate emails via API
  const handleGenerate = async () => {
    if (!hasSettings) {
      alert('Please configure your email settings first (sender email and signature).');
      return;
    }

    setStep(STEPS.PROGRESS);
    setIsGenerating(true);
    setProgress({ current: 0, total: withEmail.length, message: 'Starting...' });

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/reviewer-finder/generate-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidates: withEmail,
          template,
          settings,
          proposalInfo,
          options: {
            useClaudePersonalization: usePersonalization,
            claudeApiKey: usePersonalization ? claudeApiKey : null
          }
        }),
        signal: abortControllerRef.current.signal
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            continue;
          }
          if (line.startsWith('data:')) {
            try {
              const data = JSON.parse(line.slice(5).trim());
              handleSSEEvent(data);
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }

    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Email generation error:', error);
        setErrors([{ error: error.message }]);
      }
    }

    setIsGenerating(false);
  };

  // Handle SSE events
  const handleSSEEvent = (data) => {
    if (data.stage === 'generating' || data.stage === 'starting') {
      setProgress({
        current: data.current || 0,
        total: data.total || withEmail.length,
        message: data.message || 'Processing...',
        candidate: data.candidate
      });
    } else if (data.emails) {
      // Result event
      setGeneratedEmails(data.emails);
      setErrors(data.errors || []);
      setStep(STEPS.DOWNLOAD);
    } else if (data.message && data.generated !== undefined) {
      // Complete event
      setStep(STEPS.DOWNLOAD);
    } else if (data.error || data.message?.includes('error')) {
      setErrors([{ error: data.message || data.error }]);
      setStep(STEPS.DOWNLOAD);
    }
  };

  // Download single EML file
  const downloadEmail = (email) => {
    const blob = new Blob([email.content], { type: 'message/rfc822' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = email.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Download all as ZIP
  const downloadAllAsZip = async () => {
    // Dynamic import JSZip
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    for (const email of generatedEmails) {
      zip.file(email.filename, email.content);
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reviewer-emails-${new Date().toISOString().split('T')[0]}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Cancel generation
  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <span>✉️</span>
            Generate Reviewer Invitation Emails
          </h2>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600 text-xl"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Review Candidates */}
          {step === STEPS.REVIEW && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-700">
                  Selected Candidates ({candidates.length})
                </h3>
                {withoutEmail.length > 0 && (
                  <span className="text-sm text-amber-600">
                    ⚠️ {withoutEmail.length} missing email
                  </span>
                )}
              </div>

              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-60 overflow-y-auto">
                {candidates.map((candidate, i) => (
                  <div
                    key={i}
                    className={`px-4 py-2 flex items-center justify-between ${
                      !candidate.email ? 'bg-amber-50' : ''
                    }`}
                  >
                    <div>
                      <div className="font-medium text-gray-800 text-sm">
                        {candidate.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {candidate.affiliation}
                      </div>
                    </div>
                    <div className="text-sm">
                      {candidate.email ? (
                        <span className="text-green-600">✓ {candidate.email}</span>
                      ) : (
                        <span className="text-amber-600">No email</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {withoutEmail.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                  <strong>Note:</strong> {withoutEmail.length} candidate(s) will be skipped because they don't have email addresses.
                  You can find their contact info using the "Enrich Contacts" feature.
                </div>
              )}

              {!hasSettings && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                  <strong>Setup needed:</strong> Please configure your email settings (sender email and signature) before generating emails.
                  Click "Email Settings" in the panel above.
                </div>
              )}
            </div>
          )}

          {/* Step 2: Options */}
          {step === STEPS.OPTIONS && (
            <div className="space-y-6">
              {/* Personalization Option */}
              <div className="p-4 border border-gray-200 rounded-lg">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={usePersonalization}
                    onChange={(e) => setUsePersonalization(e.target.checked)}
                    className="mt-1"
                    disabled={!claudeApiKey}
                  />
                  <div>
                    <div className="font-medium text-gray-800">
                      Use Claude for personalization
                    </div>
                    <div className="text-sm text-gray-500">
                      Claude will add a brief mention of why each reviewer's expertise is relevant (~$0.01/email)
                    </div>
                    {!claudeApiKey && (
                      <div className="text-sm text-amber-600 mt-1">
                        Requires Claude API key
                      </div>
                    )}
                  </div>
                </label>
              </div>

              {/* Template Preview/Edit */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-gray-700">Email Template</h3>
                  <button
                    onClick={() => setShowTemplateEditor(!showTemplateEditor)}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    {showTemplateEditor ? 'Hide Editor' : 'Edit Template'}
                  </button>
                </div>

                {showTemplateEditor ? (
                  <EmailTemplateEditor
                    initialTemplate={template}
                    onTemplateChange={setTemplate}
                    compact={true}
                  />
                ) : (
                  <div className="p-4 bg-gray-50 rounded-lg text-sm">
                    <div className="mb-2">
                      <span className="text-gray-500">Subject:</span>{' '}
                      <span className="font-medium">{template.subject}</span>
                    </div>
                    <div className="text-gray-600 whitespace-pre-wrap line-clamp-4">
                      {template.body.substring(0, 200)}...
                    </div>
                  </div>
                )}
              </div>

              {/* Settings Summary */}
              <div className="p-4 bg-gray-50 rounded-lg text-sm">
                <h4 className="font-medium text-gray-700 mb-2">Sending From:</h4>
                <div className="text-gray-600">
                  {settings.senderName && <div>{settings.senderName}</div>}
                  <div>{settings.senderEmail || '(Not configured)'}</div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Progress */}
          {step === STEPS.PROGRESS && (
            <div className="space-y-4">
              <div className="text-center py-8">
                <div className="text-4xl mb-4">
                  {isGenerating ? '⏳' : '✓'}
                </div>
                <h3 className="font-medium text-gray-800 mb-2">
                  {isGenerating ? 'Generating Emails...' : 'Complete!'}
                </h3>
                <p className="text-gray-600">
                  {progress.message}
                </p>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`
                  }}
                />
              </div>

              <div className="text-center text-sm text-gray-500">
                {progress.current} / {progress.total} emails
                {progress.candidate && (
                  <span className="block text-xs mt-1">
                    Current: {progress.candidate}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Download */}
          {step === STEPS.DOWNLOAD && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="text-center py-4">
                <div className="text-4xl mb-2">✉️</div>
                <h3 className="font-medium text-gray-800">
                  {generatedEmails.length} Email{generatedEmails.length !== 1 ? 's' : ''} Ready
                </h3>
                {errors.length > 0 && (
                  <p className="text-sm text-red-600 mt-1">
                    {errors.length} error(s) occurred
                  </p>
                )}
              </div>

              {/* Download All Button */}
              {generatedEmails.length > 0 && (
                <button
                  onClick={downloadAllAsZip}
                  className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg
                           hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <span>📦</span>
                  Download All as ZIP
                </button>
              )}

              {/* Individual Downloads */}
              {generatedEmails.length > 0 && (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                  {generatedEmails.map((email, i) => (
                    <div key={i} className="px-4 py-2 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-800">
                          {email.filename}
                        </div>
                        <div className="text-xs text-gray-500">
                          To: {email.candidateEmail}
                        </div>
                      </div>
                      <button
                        onClick={() => downloadEmail(email)}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        Download
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Errors */}
              {errors.length > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <strong>Errors:</strong>
                  <ul className="mt-1 list-disc list-inside">
                    {errors.map((err, i) => (
                      <li key={i}>{err.candidateName || 'Unknown'}: {err.error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Instructions */}
              <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                <strong>How to use:</strong>
                <ol className="mt-1 list-decimal list-inside space-y-1">
                  <li>Download the .eml file(s)</li>
                  <li>Double-click to open in your email client (Outlook, Mail, etc.)</li>
                  <li>Review the email and click Send</li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          {step === STEPS.REVIEW && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep(STEPS.OPTIONS)}
                disabled={withEmail.length === 0}
                className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg
                         hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                Next: Options →
              </button>
            </>
          )}

          {step === STEPS.OPTIONS && (
            <>
              <button
                onClick={() => setStep(STEPS.REVIEW)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                ← Back
              </button>
              <button
                onClick={handleGenerate}
                disabled={!hasSettings}
                className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg
                         hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                Generate {withEmail.length} Email{withEmail.length !== 1 ? 's' : ''}
              </button>
            </>
          )}

          {step === STEPS.PROGRESS && (
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
          )}

          {step === STEPS.DOWNLOAD && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg
                       hover:bg-gray-200 transition-colors ml-auto"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
