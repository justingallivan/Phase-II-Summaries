import { useState, useEffect, useRef, useCallback } from 'react';
import Layout, { PageHeader, Card, Button } from '../shared/components/Layout';
import RequireAppAccess from '../shared/components/RequireAppAccess';
import { useProfile } from '../shared/context/ProfileContext';

// ─── Status Pipeline ────────────────────────────────────────────────────────

const STATUS_PIPELINE = [
  { key: 'accepted', label: 'Accepted', color: 'bg-blue-100 text-blue-800' },
  { key: 'materials_sent', label: 'Materials Sent', color: 'bg-indigo-100 text-indigo-800' },
  { key: 'under_review', label: 'Under Review', color: 'bg-yellow-100 text-yellow-800' },
  { key: 'review_received', label: 'Review Received', color: 'bg-green-100 text-green-800' },
  { key: 'complete', label: 'Complete', color: 'bg-gray-100 text-gray-800' },
];

function getStatusInfo(status) {
  return STATUS_PIPELINE.find(s => s.key === status) || STATUS_PIPELINE[0];
}

// ─── Template Defaults ──────────────────────────────────────────────────────

const DEFAULT_TEMPLATES = {
  materials: {
    subject: 'Review Materials: {{proposalTitle}}',
    body: `{{greeting}},

Thank you for agreeing to review the proposal "{{proposalTitle}}" from {{piInstitution}}.

Please find the full proposal at the following link:
{{proposalUrl}}

Attached to this email is our review template. We ask that you submit your completed review by {{reviewDueDate}}.

If you have any questions about the review process, please don't hesitate to reach out.

Thank you for your time and expertise.

{{signature}}`,
  },
  followup: {
    subject: 'Reminder: Review Due — {{proposalTitle}}',
    body: `{{greeting}},

This is a friendly reminder that your review of "{{proposalTitle}}" is due by {{reviewDueDate}}.

The full proposal is available here:
{{proposalUrl}}

Please let us know if you need additional time or have any questions.

Thank you,

{{signature}}`,
  },
  thankyou: {
    subject: 'Thank You for Your Review — {{proposalTitle}}',
    body: `{{greeting}},

Thank you very much for completing your review of "{{proposalTitle}}". Your expertise and thoughtful evaluation are greatly appreciated and will be invaluable to the Foundation's decision-making process.

We will be in touch regarding the processing of your honorarium.

With gratitude,

{{signature}}`,
  },
};

const TEMPLATE_STORAGE_KEY = 'review_manager_templates';

// ─── Tab Component ──────────────────────────────────────────────────────────

function Tab({ label, active, onClick, icon, badge }) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2 px-6 py-3 font-medium text-sm
        border-b-2 transition-all duration-200
        ${active
          ? 'border-gray-900 text-gray-900 bg-gray-50'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
        }
      `}
    >
      <span>{icon}</span>
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-gray-200 text-gray-700">{badge}</span>
      )}
    </button>
  );
}

// ─── Status Badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const info = getStatusInfo(status);
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${info.color}`}>
      {info.label}
    </span>
  );
}

// ─── Status Summary Chips ───────────────────────────────────────────────────

function StatusSummary({ statusSummary }) {
  if (!statusSummary || Object.keys(statusSummary).length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {STATUS_PIPELINE.map(s => {
        const count = statusSummary[s.key];
        if (!count) return null;
        return (
          <span key={s.key} className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.color}`}>
            {count} {s.label.toLowerCase()}
          </span>
        );
      })}
    </div>
  );
}

// ─── Email Modal ────────────────────────────────────────────────────────────

function EmailModal({ isOpen, onClose, reviewers, proposalTitle, settings, onEmailsSent }) {
  const [templateType, setTemplateType] = useState('materials');
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [step, setStep] = useState('compose'); // compose | progress | download
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });
  const [generatedEmails, setGeneratedEmails] = useState([]);
  const [error, setError] = useState(null);

  // Load saved templates from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TEMPLATE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setTemplates(prev => ({ ...prev, ...parsed }));
      }
    } catch (e) { /* ignore */ }
  }, []);

  const saveTemplate = useCallback(() => {
    try {
      localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
    } catch (e) { /* ignore */ }
  }, [templates]);

  const currentTemplate = templates[templateType];

  const handleGenerate = async () => {
    setStep('progress');
    setProgress({ current: 0, total: reviewers.length, message: 'Starting...' });
    setError(null);
    setGeneratedEmails([]);

    try {
      const response = await fetch('/api/review-manager/send-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestionIds: reviewers.map(r => r.suggestionId),
          templateType,
          template: currentTemplate,
          settings: {
            signature: settings.signature || '',
            proposalUrl: settings.proposalUrl || '',
            reviewDueDate: settings.reviewDueDate || '',
            fromEmail: settings.fromEmail || '',
          },
          markAsSent: true,
        }),
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

        let currentEvent = null;
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === 'progress') {
                setProgress(prev => ({ ...prev, ...data }));
              } else if (currentEvent === 'email_generated') {
                setProgress(prev => ({ ...prev, current: data.index }));
              } else if (currentEvent === 'result') {
                setGeneratedEmails(data.emails || []);
              } else if (currentEvent === 'complete') {
                setStep('download');
                if (onEmailsSent) onEmailsSent();
              } else if (currentEvent === 'error') {
                setError(data.message);
                setStep('compose');
              }
            } catch (e) { /* parse error, ignore */ }
            currentEvent = null;
          }
        }
      }
    } catch (err) {
      setError(err.message);
      setStep('compose');
    }
  };

  const downloadEmail = (email) => {
    const blob = new Blob([email.content], { type: 'message/rfc822' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = email.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAll = async () => {
    if (generatedEmails.length === 1) {
      downloadEmail(generatedEmails[0]);
      return;
    }
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (const email of generatedEmails) {
        zip.file(email.filename, email.content);
      }
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${templateType}_emails.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      // Fall back to individual downloads
      for (const email of generatedEmails) {
        downloadEmail(email);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">
            {step === 'download' ? 'Emails Ready' : `Generate ${templateType.charAt(0).toUpperCase() + templateType.slice(1)} Emails`}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'compose' && (
            <div className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
              )}

              {/* Template Type Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email Type</label>
                <div className="flex gap-2">
                  {['materials', 'followup', 'thankyou'].map(type => (
                    <button
                      key={type}
                      onClick={() => setTemplateType(type)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        templateType === type
                          ? 'bg-gray-900 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {type === 'materials' ? 'Materials' : type === 'followup' ? 'Follow-up' : 'Thank You'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={currentTemplate.subject}
                  onChange={e => setTemplates(prev => ({
                    ...prev,
                    [templateType]: { ...prev[templateType], subject: e.target.value },
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-400 focus:border-transparent"
                />
              </div>

              {/* Body */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium text-gray-700">Body</label>
                  <button
                    onClick={saveTemplate}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Save template
                  </button>
                </div>
                <textarea
                  value={currentTemplate.body}
                  onChange={e => setTemplates(prev => ({
                    ...prev,
                    [templateType]: { ...prev[templateType], body: e.target.value },
                  }))}
                  rows={14}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-gray-400 focus:border-transparent"
                />
              </div>

              {/* Placeholders reference */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-600 mb-1">Available Placeholders</p>
                <div className="flex flex-wrap gap-1">
                  {['greeting', 'recipientName', 'salutation', 'recipientLastName',
                    'proposalTitle', 'piName', 'piInstitution', 'proposalUrl',
                    'reviewDueDate', 'programName', 'signature',
                    'investigatorTeam', 'reviewerFormLink'].map(p => (
                    <code key={p} className="text-xs bg-white px-1.5 py-0.5 rounded border border-gray-200 text-gray-600">
                      {`{{${p}}}`}
                    </code>
                  ))}
                </div>
              </div>

              {/* Recipients summary */}
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>{reviewers.length}</strong> reviewer{reviewers.length !== 1 ? 's' : ''} selected
                  {reviewers.filter(r => !r.email).length > 0 && (
                    <span className="text-orange-600 ml-2">
                      ({reviewers.filter(r => !r.email).length} without email — will be skipped)
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}

          {step === 'progress' && (
            <div className="space-y-4 text-center py-8">
              <div className="w-12 h-12 border-4 border-gray-200 border-t-gray-600 rounded-full animate-spin mx-auto" />
              <p className="text-gray-700 font-medium">{progress.message}</p>
              {progress.total > 0 && (
                <div className="w-full bg-gray-200 rounded-full h-2 max-w-md mx-auto">
                  <div
                    className="bg-gray-700 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              )}
              <p className="text-sm text-gray-500">{progress.current} / {progress.total}</p>
            </div>
          )}

          {step === 'download' && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-lg font-medium text-gray-900">
                  {generatedEmails.length} email{generatedEmails.length !== 1 ? 's' : ''} generated
                </p>
              </div>

              <div className="space-y-2">
                {generatedEmails.map((email, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{email.candidateName}</p>
                      <p className="text-xs text-gray-500">{email.candidateEmail}</p>
                    </div>
                    <button
                      onClick={() => downloadEmail(email)}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Download
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            {step === 'download' ? 'Close' : 'Cancel'}
          </button>
          <div className="flex gap-2">
            {step === 'compose' && (
              <Button onClick={handleGenerate}>
                Generate {reviewers.filter(r => r.email).length} Email{reviewers.filter(r => r.email).length !== 1 ? 's' : ''}
              </Button>
            )}
            {step === 'download' && generatedEmails.length > 0 && (
              <Button onClick={downloadAll}>
                Download All
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Review Upload Modal ────────────────────────────────────────────────────

function UploadReviewModal({ isOpen, onClose, reviewer, onUploaded }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !reviewer) return null;

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('suggestionId', reviewer.suggestionId);
      formData.append('file', file);

      const response = await fetch('/api/review-manager/upload-review', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Upload failed');

      if (onUploaded) onUploaded(reviewer.suggestionId, data);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full shadow-2xl">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Upload Review</h2>
          <p className="text-sm text-gray-500 mt-1">for {reviewer.name}</p>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Review Document</label>
            <input
              type="file"
              onChange={e => setFile(e.target.files[0] || null)}
              accept=".pdf,.doc,.docx,.txt,.md"
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
            />
          </div>

          {reviewer.reviewBlobUrl && (
            <div className="p-3 bg-yellow-50 rounded-lg">
              <p className="text-sm text-yellow-800">
                A review file already exists: <strong>{reviewer.reviewFilename}</strong>. Uploading a new file will replace it.
              </p>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          <Button onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Cycle Overview Tab ─────────────────────────────────────────────────────

function CycleOverviewTab({ proposals, cycles, selectedCycleId, onCycleChange, onSelectProposal, loading }) {
  const filteredProposals = selectedCycleId === 'all'
    ? proposals
    : proposals.filter(p => p.grantCycleId === parseInt(selectedCycleId, 10));

  return (
    <div className="space-y-4">
      {/* Cycle selector */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700">Grant Cycle</label>
        <select
          value={selectedCycleId}
          onChange={e => onCycleChange(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-400 focus:border-transparent"
        >
          <option value="all">All Cycles</option>
          {cycles.map(c => (
            <option key={c.id} value={c.id}>{c.name}{c.shortCode ? ` (${c.shortCode})` : ''}</option>
          ))}
        </select>
        {loading && (
          <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
        )}
      </div>

      {/* Proposals table */}
      {filteredProposals.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg mb-2">No accepted reviewers found</p>
            <p className="text-gray-400 text-sm">
              Reviewers marked as &quot;accepted&quot; in the Reviewer Finder will appear here.
            </p>
          </div>
        </Card>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proposal</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PI</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cycle</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Reviewers</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredProposals.map(p => (
                <tr key={p.proposalId} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900 line-clamp-2">{p.proposalTitle}</p>
                    {p.proposalInstitution && (
                      <p className="text-xs text-gray-500 mt-0.5">{p.proposalInstitution}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{p.proposalAuthors || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{p.cycleShortCode || p.cycleName || '—'}</td>
                  <td className="px-4 py-3 text-center text-sm font-medium text-gray-900">{p.reviewers.length}</td>
                  <td className="px-4 py-3">
                    <StatusSummary statusSummary={p.statusSummary} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onSelectProposal(p)}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Proposal Detail Tab ────────────────────────────────────────────────────

function ProposalDetailTab({ proposal, proposals, onProposalChange, onRefresh, settings, onSettingsChange }) {
  const [selectedReviewers, setSelectedReviewers] = useState(new Set());
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [uploadModalReviewer, setUploadModalReviewer] = useState(null);
  const [editingNotes, setEditingNotes] = useState(null); // { suggestionId, value }
  const [savingNotes, setSavingNotes] = useState(false);
  const [proposalUrl, setProposalUrl] = useState(proposal?.proposalUrl || '');
  const [savingUrl, setSavingUrl] = useState(false);

  // Sync proposalUrl when proposal changes
  useEffect(() => {
    setProposalUrl(proposal?.proposalUrl || '');
    setSelectedReviewers(new Set());
    setEditingNotes(null);
  }, [proposal?.proposalId]);

  if (!proposal) {
    return (
      <Card>
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg mb-2">Select a proposal</p>
          <p className="text-gray-400 text-sm">
            Choose a proposal from the dropdown above or click &quot;Manage&quot; on the Overview tab.
          </p>
        </div>
      </Card>
    );
  }

  const reviewers = proposal.reviewers || [];
  const selectedList = reviewers.filter(r => selectedReviewers.has(r.suggestionId));
  const allSelected = reviewers.length > 0 && selectedReviewers.size === reviewers.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedReviewers(new Set());
    } else {
      setSelectedReviewers(new Set(reviewers.map(r => r.suggestionId)));
    }
  };

  const toggleSelect = (id) => {
    setSelectedReviewers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveProposalUrl = async () => {
    setSavingUrl(true);
    try {
      await fetch('/api/review-manager/reviewers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId: proposal.proposalId, proposalUrl }),
      });
      if (onSettingsChange) onSettingsChange('proposalUrl', proposalUrl);
    } catch (err) {
      console.error('Failed to save proposal URL:', err);
    } finally {
      setSavingUrl(false);
    }
  };

  const saveNotes = async (suggestionId, notes) => {
    setSavingNotes(true);
    try {
      await fetch('/api/review-manager/reviewers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId, notes }),
      });
      setEditingNotes(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to save notes:', err);
    } finally {
      setSavingNotes(false);
    }
  };

  const updateStatus = async (suggestionId, newStatus) => {
    try {
      await fetch('/api/review-manager/reviewers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId, reviewStatus: newStatus }),
      });
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handleUploadComplete = () => {
    setUploadModalReviewer(null);
    if (onRefresh) onRefresh();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="space-y-4">
      {/* Proposal Selector */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700">Proposal</label>
        <select
          value={proposal.proposalId}
          onChange={e => {
            const p = proposals.find(x => x.proposalId === e.target.value);
            if (p) onProposalChange(p);
          }}
          className="flex-1 max-w-xl px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-400 focus:border-transparent"
        >
          {proposals.map(p => (
            <option key={p.proposalId} value={p.proposalId}>
              {p.proposalTitle} ({p.reviewers.length} reviewer{p.reviewers.length !== 1 ? 's' : ''})
            </option>
          ))}
        </select>
      </div>

      {/* Proposal Info & URL */}
      <Card>
        <div className="space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-semibold text-gray-900">{proposal.proposalTitle}</h3>
              <p className="text-sm text-gray-600 mt-1">
                {proposal.proposalAuthors && <span>PI: {proposal.proposalAuthors}</span>}
                {proposal.proposalInstitution && <span> — {proposal.proposalInstitution}</span>}
              </p>
              {proposal.cycleName && (
                <p className="text-xs text-gray-500 mt-1">
                  Cycle: {proposal.cycleName}
                  {proposal.reviewDeadline && ` — Due: ${formatDate(proposal.reviewDeadline)}`}
                </p>
              )}
            </div>
            <StatusSummary statusSummary={proposal.statusSummary} />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Proposal URL</label>
            <input
              type="url"
              value={proposalUrl}
              onChange={e => setProposalUrl(e.target.value)}
              placeholder="https://..."
              className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-400 focus:border-transparent"
            />
            <button
              onClick={saveProposalUrl}
              disabled={savingUrl || proposalUrl === (proposal.proposalUrl || '')}
              className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingUrl ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </Card>

      {/* Actions bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">
            {selectedReviewers.size > 0 ? `${selectedReviewers.size} selected` : `${reviewers.length} reviewer${reviewers.length !== 1 ? 's' : ''}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {selectedReviewers.size > 0 && (
            <Button onClick={() => setEmailModalOpen(true)}>
              Send Email ({selectedReviewers.size})
            </Button>
          )}
        </div>
      </div>

      {/* Reviewers table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reviewer</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Action</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {reviewers.map(r => {
              const isEditing = editingNotes?.suggestionId === r.suggestionId;
              const lastAction = r.thankyouSentAt || r.reviewReceivedAt || r.reminderSentAt || r.materialsSentAt;

              return (
                <tr key={r.suggestionId} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedReviewers.has(r.suggestionId)}
                      onChange={() => toggleSelect(r.suggestionId)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{r.name}</p>
                    <p className="text-xs text-gray-500">{r.affiliation || ''}</p>
                    {r.email && <p className="text-xs text-gray-400">{r.email}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.reviewStatus} />
                    {r.reminderCount > 0 && (
                      <span className="text-xs text-gray-400 ml-1">({r.reminderCount} reminder{r.reminderCount !== 1 ? 's' : ''})</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {lastAction ? formatDate(lastAction) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={editingNotes.value}
                          onChange={e => setEditingNotes({ ...editingNotes, value: e.target.value })}
                          className="w-32 px-2 py-1 text-xs border border-gray-300 rounded"
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveNotes(r.suggestionId, editingNotes.value);
                            if (e.key === 'Escape') setEditingNotes(null);
                          }}
                          autoFocus
                        />
                        <button
                          onClick={() => saveNotes(r.suggestionId, editingNotes.value)}
                          disabled={savingNotes}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingNotes({ suggestionId: r.suggestionId, value: r.notes || '' })}
                        className="text-xs text-gray-500 hover:text-gray-700 max-w-[150px] truncate block"
                        title={r.notes || 'Click to add notes'}
                      >
                        {r.notes || <span className="italic text-gray-300">Add notes</span>}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* Status dropdown */}
                      <StatusDropdown
                        currentStatus={r.reviewStatus}
                        onChange={(newStatus) => updateStatus(r.suggestionId, newStatus)}
                      />
                      {/* Upload review */}
                      {(r.reviewStatus === 'materials_sent' || r.reviewStatus === 'under_review') && (
                        <button
                          onClick={() => setUploadModalReviewer(r)}
                          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                          title="Upload review"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                        </button>
                      )}
                      {/* Download review if received */}
                      {r.reviewBlobUrl && (
                        <a
                          href={r.reviewBlobUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-green-500 hover:text-green-700 rounded-lg hover:bg-green-50"
                          title={`Download: ${r.reviewFilename}`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      <EmailModal
        isOpen={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        reviewers={selectedList}
        proposalTitle={proposal.proposalTitle}
        settings={{
          ...settings,
          proposalUrl: proposalUrl || proposal.proposalUrl || '',
          reviewDueDate: proposal.reviewDeadline,
        }}
        onEmailsSent={() => {
          setEmailModalOpen(false);
          setSelectedReviewers(new Set());
          if (onRefresh) onRefresh();
        }}
      />

      <UploadReviewModal
        isOpen={!!uploadModalReviewer}
        onClose={() => setUploadModalReviewer(null)}
        reviewer={uploadModalReviewer}
        onUploaded={handleUploadComplete}
      />
    </div>
  );
}

// ─── Status Advance Button ──────────────────────────────────────────────────

function StatusDropdown({ currentStatus, onChange }) {
  return (
    <select
      value={currentStatus}
      onChange={e => onChange(e.target.value)}
      className="text-xs border border-gray-200 rounded px-1.5 py-1 text-gray-600 bg-white hover:border-gray-400 focus:ring-1 focus:ring-gray-400 focus:outline-none cursor-pointer"
    >
      {STATUS_PIPELINE.map(s => (
        <option key={s.key} value={s.key}>{s.label}</option>
      ))}
    </select>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

function ReviewManagerPage() {
  const { currentProfile } = useProfile();
  const profileId = currentProfile?.id || null;

  const [activeTab, setActiveTab] = useState('overview');
  const [proposals, setProposals] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [selectedCycleId, setSelectedCycleId] = useState('all');
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({ signature: '', fromEmail: '' });

  const refreshTrigger = useRef(0);

  // Load settings from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('review_manager_settings');
      if (saved) setSettings(JSON.parse(saved));
    } catch (e) { /* ignore */ }
  }, []);

  // Load grant cycles
  useEffect(() => {
    const loadCycles = async () => {
      try {
        const res = await fetch('/api/reviewer-finder/grant-cycles');
        const data = await res.json();
        setCycles((data.cycles || []).filter(c => c.isActive !== false));
      } catch (err) {
        console.error('Failed to load grant cycles:', err);
      }
    };
    loadCycles();
  }, []);

  // Load reviewers
  const loadReviewers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCycleId !== 'all') params.set('cycleId', selectedCycleId);
      if (profileId) params.set('userProfileId', profileId);

      const res = await fetch(`/api/review-manager/reviewers?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setProposals(data.proposals || []);
        // If we had a selected proposal, refresh it
        if (selectedProposal) {
          const updated = (data.proposals || []).find(p => p.proposalId === selectedProposal.proposalId);
          if (updated) setSelectedProposal(updated);
        }
      }
    } catch (err) {
      console.error('Failed to load reviewers:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedCycleId, profileId, selectedProposal?.proposalId]);

  useEffect(() => {
    loadReviewers();
  }, [selectedCycleId, profileId, refreshTrigger.current]);

  const handleRefresh = () => {
    refreshTrigger.current += 1;
    loadReviewers();
  };

  const handleSelectProposal = (proposal) => {
    setSelectedProposal(proposal);
    setActiveTab('detail');
  };

  const handleSettingsChange = (key, value) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem('review_manager_settings', JSON.stringify(next)); } catch (e) { /* ignore */ }
      return next;
    });
  };

  const totalReviewers = proposals.reduce((sum, p) => sum + p.reviewers.length, 0);

  return (
    <Layout title="Review Manager">
      <PageHeader title="Review Manager" icon="📋" />

      <div className="py-8 space-y-6">
        {/* Settings bar */}
        <Card>
          <details className="group">
            <summary className="cursor-pointer flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Settings</span>
              <svg className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From Email</label>
                <input
                  type="email"
                  value={settings.fromEmail || ''}
                  onChange={e => handleSettingsChange('fromEmail', e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Signature</label>
                <textarea
                  value={settings.signature || ''}
                  onChange={e => handleSettingsChange('signature', e.target.value)}
                  placeholder="Your name and title"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-400 focus:border-transparent"
                />
              </div>
            </div>
          </details>
        </Card>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200">
          <div className="flex">
            <Tab
              label="Overview"
              icon="📊"
              active={activeTab === 'overview'}
              onClick={() => setActiveTab('overview')}
              badge={totalReviewers}
            />
            <Tab
              label="Proposal Detail"
              icon="📄"
              active={activeTab === 'detail'}
              onClick={() => setActiveTab('detail')}
            />
          </div>
        </div>

        {/* Tab Content */}
        <div className="min-h-[400px]">
          {activeTab === 'overview' && (
            <CycleOverviewTab
              proposals={proposals}
              cycles={cycles}
              selectedCycleId={selectedCycleId}
              onCycleChange={setSelectedCycleId}
              onSelectProposal={handleSelectProposal}
              loading={loading}
            />
          )}
          {activeTab === 'detail' && (
            <ProposalDetailTab
              proposal={selectedProposal}
              proposals={proposals}
              onProposalChange={setSelectedProposal}
              onRefresh={handleRefresh}
              settings={settings}
              onSettingsChange={handleSettingsChange}
            />
          )}
        </div>
      </div>
    </Layout>
  );
}

export default function ReviewManagerGuard() {
  return (
    <RequireAppAccess appKey="review-manager">
      <ReviewManagerPage />
    </RequireAppAccess>
  );
}
