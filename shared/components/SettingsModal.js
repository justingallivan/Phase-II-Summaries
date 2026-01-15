/**
 * SettingsModal - Global settings for Reviewer Finder
 *
 * Accessible via gear icon, contains:
 * - Email template configuration
 * - Grant cycle settings (including summary page extraction config)
 * - Sender information
 */

import { useState, useEffect } from 'react';
import EmailTemplateEditor from './EmailTemplateEditor';
import { STORAGE_KEYS } from './EmailSettingsPanel';

// Default grant cycle settings
const DEFAULT_GRANT_CYCLE = {
  programName: 'W. M. Keck Foundation',
  reviewDeadline: '',
  summaryPages: '2', // Default to page 2 for Keck proposals
  reviewTemplateBlobUrl: '', // URL to uploaded review template file
  reviewTemplateFilename: '', // Original filename
  additionalAttachments: [], // Array of {blobUrl, filename, contentType}
  customFields: {
    proposalDueDate: '',
    honorarium: '250',
    proposalSendDate: '',
    commitDate: ''
  }
};

// Default sender settings
const DEFAULT_SENDER = {
  name: '',
  email: '',
  signature: ''
};

export default function SettingsModal({ isOpen, onClose }) {
  const [activeSection, setActiveSection] = useState('sender');
  const [grantCycle, setGrantCycle] = useState(DEFAULT_GRANT_CYCLE);
  const [sender, setSender] = useState(DEFAULT_SENDER);
  const [saveStatus, setSaveStatus] = useState(null);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const [uploadingAdditional, setUploadingAdditional] = useState(false);

  // Load settings on mount
  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = () => {
    try {
      // Load grant cycle
      const storedCycle = localStorage.getItem(STORAGE_KEYS.GRANT_CYCLE);
      if (storedCycle) {
        const decoded = JSON.parse(atob(storedCycle));
        setGrantCycle({ ...DEFAULT_GRANT_CYCLE, ...decoded });
      }

      // Load sender
      const storedSender = localStorage.getItem(STORAGE_KEYS.SENDER_INFO);
      if (storedSender) {
        const decoded = JSON.parse(atob(storedSender));
        setSender({ ...DEFAULT_SENDER, ...decoded });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const saveSettings = () => {
    try {
      localStorage.setItem(STORAGE_KEYS.GRANT_CYCLE, btoa(JSON.stringify(grantCycle)));
      localStorage.setItem(STORAGE_KEYS.SENDER_INFO, btoa(JSON.stringify(sender)));
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSaveStatus('error');
    }
  };

  const updateGrantCycle = (field, value) => {
    setGrantCycle(prev => ({ ...prev, [field]: value }));
    setSaveStatus(null);
  };

  const updateCustomField = (field, value) => {
    setGrantCycle(prev => ({
      ...prev,
      customFields: { ...prev.customFields, [field]: value }
    }));
    setSaveStatus(null);
  };

  const updateSender = (field, value) => {
    setSender(prev => ({ ...prev, [field]: value }));
    setSaveStatus(null);
  };

  // Handle review template upload
  const handleTemplateUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!validTypes.includes(file.type)) {
      alert('Please upload a PDF or Word document (.pdf, .doc, .docx)');
      return;
    }

    setUploadingTemplate(true);
    try {
      // Upload to Vercel Blob via the upload handler
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload-file', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const { url } = await response.json();

      // Update grant cycle with the blob URL
      setGrantCycle(prev => ({
        ...prev,
        reviewTemplateBlobUrl: url,
        reviewTemplateFilename: file.name
      }));
      setSaveStatus(null);
    } catch (error) {
      console.error('Template upload failed:', error);
      alert('Failed to upload template. Please try again.');
    } finally {
      setUploadingTemplate(false);
    }
  };

  // Handle review template removal
  const handleRemoveTemplate = () => {
    setGrantCycle(prev => ({
      ...prev,
      reviewTemplateBlobUrl: '',
      reviewTemplateFilename: ''
    }));
    setSaveStatus(null);
  };

  // Handle additional attachment upload
  const handleAdditionalUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAdditional(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload-file', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const { url } = await response.json();

      // Add to additional attachments array
      setGrantCycle(prev => ({
        ...prev,
        additionalAttachments: [
          ...(prev.additionalAttachments || []),
          {
            blobUrl: url,
            filename: file.name,
            contentType: file.type || 'application/octet-stream'
          }
        ]
      }));
      setSaveStatus(null);
    } catch (error) {
      console.error('Additional attachment upload failed:', error);
      alert('Failed to upload file. Please try again.');
    } finally {
      setUploadingAdditional(false);
      // Reset the input so the same file can be uploaded again if needed
      e.target.value = '';
    }
  };

  // Handle additional attachment removal
  const handleRemoveAdditional = (index) => {
    setGrantCycle(prev => ({
      ...prev,
      additionalAttachments: prev.additionalAttachments.filter((_, i) => i !== index)
    }));
    setSaveStatus(null);
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sections = [
    { id: 'sender', label: 'Sender Info', icon: '👤' },
    { id: 'grant-cycle', label: 'Grant Cycle', icon: '📅' },
    { id: 'template', label: 'Email Template', icon: '✉️' },
    { id: 'attachments', label: 'Attachments', icon: '📎' },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚙️</span>
              <h2 className="text-xl font-semibold text-gray-900">Settings</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex h-[calc(90vh-140px)]">
            {/* Sidebar */}
            <div className="w-48 border-r border-gray-200 bg-gray-50">
              <nav className="p-2 space-y-1">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`
                      w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg
                      ${activeSection === section.id
                        ? 'bg-blue-100 text-blue-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-100'
                      }
                    `}
                  >
                    <span>{section.icon}</span>
                    <span>{section.label}</span>
                  </button>
                ))}
              </nav>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Grant Cycle Section */}
              {activeSection === 'grant-cycle' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Grant Cycle Settings</h3>
                    <p className="text-sm text-gray-500 mb-6">
                      Configure settings for the current grant review cycle. These values are used in email templates.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Program Name
                      </label>
                      <input
                        type="text"
                        value={grantCycle.programName}
                        onChange={(e) => updateGrantCycle('programName', e.target.value)}
                        placeholder="W. M. Keck Foundation"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Review Deadline
                      </label>
                      <input
                        type="date"
                        value={grantCycle.reviewDeadline}
                        onChange={(e) => updateGrantCycle('reviewDeadline', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* Summary Page Extraction */}
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <label className="block text-sm font-medium text-blue-800 mb-1">
                      Summary Page(s) to Extract
                    </label>
                    <p className="text-xs text-blue-600 mb-2">
                      Which page(s) from uploaded proposals should be extracted as the one-page summary for email attachments?
                    </p>
                    <input
                      type="text"
                      value={grantCycle.summaryPages}
                      onChange={(e) => updateGrantCycle('summaryPages', e.target.value)}
                      placeholder="2"
                      className="w-32 px-3 py-2 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Examples: "2" for page 2, "1,2" for pages 1 and 2, "2-4" for pages 2 through 4
                    </p>
                  </div>

                  {/* Custom Date Fields */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Custom Date Fields</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">
                          Proposal Due Date
                        </label>
                        <input
                          type="date"
                          value={grantCycle.customFields.proposalDueDate}
                          onChange={(e) => updateCustomField('proposalDueDate', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">
                          Proposal Send Date
                        </label>
                        <input
                          type="date"
                          value={grantCycle.customFields.proposalSendDate}
                          onChange={(e) => updateCustomField('proposalSendDate', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">
                          Reviewer Commit Date
                        </label>
                        <input
                          type="date"
                          value={grantCycle.customFields.commitDate}
                          onChange={(e) => updateCustomField('commitDate', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">
                          Honorarium Amount ($)
                        </label>
                        <input
                          type="text"
                          value={grantCycle.customFields.honorarium}
                          onChange={(e) => updateCustomField('honorarium', e.target.value)}
                          placeholder="250"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Attachments Section */}
              {activeSection === 'attachments' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Email Attachments</h3>
                    <p className="text-sm text-gray-500 mb-6">
                      Configure files to attach to reviewer invitation emails. The project summary is automatically
                      extracted from uploaded proposals based on the Summary Pages setting.
                    </p>
                  </div>

                  {/* Review Template Upload */}
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Review Template</h4>
                    <p className="text-xs text-gray-500 mb-3">
                      Upload a review template (PDF or Word document) that will be attached to all invitation emails.
                    </p>

                    {grantCycle.reviewTemplateBlobUrl ? (
                      <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className="text-green-600">📄</span>
                          <span className="text-sm text-green-800">
                            {grantCycle.reviewTemplateFilename || 'Review_Template.pdf'}
                          </span>
                        </div>
                        <button
                          onClick={handleRemoveTemplate}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <label className="flex-1">
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx"
                            onChange={handleTemplateUpload}
                            className="hidden"
                          />
                          <div className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                            <span className="text-gray-400">📎</span>
                            <span className="text-sm text-gray-600">
                              {uploadingTemplate ? 'Uploading...' : 'Click to upload review template'}
                            </span>
                          </div>
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Project Summary Info */}
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="text-sm font-medium text-blue-800 mb-2">Project Summary (Auto-extracted)</h4>
                    <p className="text-xs text-blue-600 mb-2">
                      The project summary is automatically extracted from each uploaded proposal based on the
                      "Summary Pages" setting in Grant Cycle. Currently set to extract page(s): <strong>{grantCycle.summaryPages || '2'}</strong>
                    </p>
                    <p className="text-xs text-gray-500">
                      To change which pages are extracted, go to the Grant Cycle section.
                    </p>
                  </div>

                  {/* Additional Attachments */}
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Additional Attachments (Optional)</h4>
                    <p className="text-xs text-gray-500 mb-3">
                      Upload additional files to include with all invitation emails.
                    </p>

                    {/* List of uploaded additional attachments */}
                    {grantCycle.additionalAttachments?.length > 0 && (
                      <div className="space-y-2 mb-3">
                        {grantCycle.additionalAttachments.map((attachment, index) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-gray-50 border border-gray-200 rounded-lg">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500">📄</span>
                              <span className="text-sm text-gray-700 truncate max-w-[200px]">
                                {attachment.filename}
                              </span>
                            </div>
                            <button
                              onClick={() => handleRemoveAdditional(index)}
                              className="text-sm text-red-600 hover:text-red-800"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Upload button */}
                    <label className="block">
                      <input
                        type="file"
                        onChange={handleAdditionalUpload}
                        className="hidden"
                        disabled={uploadingAdditional}
                      />
                      <div className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                        <span className="text-gray-400">+</span>
                        <span className="text-sm text-gray-600">
                          {uploadingAdditional ? 'Uploading...' : 'Add attachment'}
                        </span>
                      </div>
                    </label>
                  </div>

                  {/* Attachment Preview */}
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Attachments Preview</h4>
                    <p className="text-xs text-gray-500 mb-3">
                      Each generated email will include:
                    </p>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li className="flex items-center gap-2">
                        <span className={grantCycle.reviewTemplateBlobUrl ? 'text-green-500' : 'text-gray-300'}>
                          {grantCycle.reviewTemplateBlobUrl ? '✓' : '○'}
                        </span>
                        <span>Review_Template.{grantCycle.reviewTemplateFilename?.split('.').pop() || 'pdf'}</span>
                        {!grantCycle.reviewTemplateBlobUrl && (
                          <span className="text-xs text-gray-400">(not uploaded)</span>
                        )}
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-blue-500">○</span>
                        <span>Project_Summary.pdf</span>
                        <span className="text-xs text-gray-400">(per-proposal, auto-extracted)</span>
                      </li>
                      {grantCycle.additionalAttachments?.map((attachment, index) => (
                        <li key={index} className="flex items-center gap-2">
                          <span className="text-green-500">✓</span>
                          <span>{attachment.filename}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Sender Info Section */}
              {activeSection === 'sender' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Sender Information</h3>
                    <p className="text-sm text-gray-500 mb-6">
                      Your contact information for outgoing emails.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Your Name
                      </label>
                      <input
                        type="text"
                        value={sender.name}
                        onChange={(e) => updateSender('name', e.target.value)}
                        placeholder="John Smith"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Your Email
                      </label>
                      <input
                        type="email"
                        value={sender.email}
                        onChange={(e) => updateSender('email', e.target.value)}
                        placeholder="john.smith@example.org"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email Signature
                      </label>
                      <textarea
                        value={sender.signature}
                        onChange={(e) => updateSender('signature', e.target.value)}
                        rows={4}
                        placeholder="Best regards,

John Smith
Senior Program Director | W. M. Keck Foundation"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Email Template Section */}
              {activeSection === 'template' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Email Template</h3>
                    <p className="text-sm text-gray-500 mb-6">
                      Customize the email template used for reviewer invitations.
                    </p>
                  </div>
                  <EmailTemplateEditor compact={false} />
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div>
              {saveStatus === 'saved' && (
                <span className="text-sm text-green-600">Settings saved</span>
              )}
              {saveStatus === 'error' && (
                <span className="text-sm text-red-600">Failed to save settings</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={saveSettings}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
