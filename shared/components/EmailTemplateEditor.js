/**
 * EmailTemplateEditor - Template editing interface for reviewer emails
 *
 * Features:
 * - Subject line input
 * - Body textarea with placeholder insertion buttons
 * - Live preview with sample data
 * - Reset to default template
 */

import { useState, useEffect } from 'react';
import { STORAGE_KEYS } from './EmailSettingsPanel';
import { DEFAULT_TEMPLATE, replacePlaceholders, parseRecipientName, formatReviewDeadline } from '../../lib/utils/email-generator';

// Available placeholders grouped by category
const PLACEHOLDERS = {
  recipient: [
    { key: 'greeting', label: 'Greeting', example: 'Dear Dr. Smith' },
    { key: 'salutation', label: 'Salutation', example: 'Dr.' },
    { key: 'recipientLastName', label: 'Last Name', example: 'Smith' },
    { key: 'recipientName', label: 'Full Name', example: 'Jane Smith' },
    { key: 'recipientAffiliation', label: 'Affiliation', example: 'MIT' },
  ],
  proposal: [
    { key: 'proposalTitle', label: 'Title', example: 'Novel RNA Methods' },
    { key: 'proposalAbstract', label: 'Abstract', example: '[Proposal abstract text...]' },
    { key: 'piName', label: 'PI Name', example: 'Dr. John Doe' },
    { key: 'piInstitution', label: 'PI Institution', example: 'Stanford University' },
  ],
  settings: [
    { key: 'programName', label: 'Program', example: 'Research Excellence 2025' },
    { key: 'reviewDeadline', label: 'Deadline', example: 'February 15, 2025' },
    { key: 'signature', label: 'Signature', example: '[Your signature]' },
  ],
};

// Sample data for preview
const SAMPLE_DATA = {
  greeting: 'Dear Dr. Weeks',
  salutation: 'Dr.',
  recipientLastName: 'Weeks',
  recipientName: 'Kevin Weeks',
  recipientAffiliation: 'University of North Carolina',
  proposalTitle: 'Novel Approaches to RNA Structure Determination Using Chemical Probing',
  proposalAbstract: 'This proposal seeks to develop new computational methods for analyzing RNA structure data from chemical probing experiments. We will combine machine learning approaches with thermodynamic modeling to improve prediction accuracy...',
  piName: 'Dr. Sarah Chen',
  piInstitution: 'MIT',
  programName: 'Research Excellence Program 2025',
  reviewDeadline: 'February 15, 2025',
  signature: 'Best regards,\n\nDr. Jane Smith\nProgram Officer',
  customFields: {}
};

export default function EmailTemplateEditor({
  onTemplateChange,
  initialTemplate = null,
  compact = false
}) {
  const [template, setTemplate] = useState(initialTemplate || DEFAULT_TEMPLATE);
  const [showPreview, setShowPreview] = useState(!compact);
  const [saveStatus, setSaveStatus] = useState(null);

  // Load template from localStorage on mount
  useEffect(() => {
    if (!initialTemplate) {
      try {
        const stored = localStorage.getItem(STORAGE_KEYS.EMAIL_TEMPLATE);
        if (stored) {
          const decoded = JSON.parse(atob(stored));
          setTemplate(decoded);
          if (onTemplateChange) {
            onTemplateChange(decoded);
          }
        }
      } catch (error) {
        console.error('Failed to load email template:', error);
      }
    }
  }, [initialTemplate]);

  // Update subject
  const updateSubject = (subject) => {
    const newTemplate = { ...template, subject };
    setTemplate(newTemplate);
    setSaveStatus(null);
    if (onTemplateChange) {
      onTemplateChange(newTemplate);
    }
  };

  // Update body
  const updateBody = (body) => {
    const newTemplate = { ...template, body };
    setTemplate(newTemplate);
    setSaveStatus(null);
    if (onTemplateChange) {
      onTemplateChange(newTemplate);
    }
  };

  // Insert placeholder at cursor position in body
  const insertPlaceholder = (key) => {
    const textarea = document.getElementById('email-template-body');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = template.body;
    const placeholder = `{{${key}}}`;

    const newBody = text.substring(0, start) + placeholder + text.substring(end);
    updateBody(newBody);

    // Reset cursor position after React re-render
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + placeholder.length, start + placeholder.length);
    }, 0);
  };

  // Save template
  const saveTemplate = () => {
    try {
      localStorage.setItem(STORAGE_KEYS.EMAIL_TEMPLATE, btoa(JSON.stringify(template)));
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (error) {
      console.error('Failed to save template:', error);
      setSaveStatus('error');
    }
  };

  // Reset to default
  const resetToDefault = () => {
    if (!confirm('Reset template to default? Your customizations will be lost.')) {
      return;
    }
    setTemplate(DEFAULT_TEMPLATE);
    localStorage.removeItem(STORAGE_KEYS.EMAIL_TEMPLATE);
    setSaveStatus(null);
    if (onTemplateChange) {
      onTemplateChange(DEFAULT_TEMPLATE);
    }
  };

  // Generate preview
  const previewSubject = replacePlaceholders(template.subject, SAMPLE_DATA);
  const previewBody = replacePlaceholders(template.body, SAMPLE_DATA);

  return (
    <div className="space-y-4">
      {/* Subject Line */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Email Subject
        </label>
        <input
          type="text"
          value={template.subject}
          onChange={(e) => updateSubject(e.target.value)}
          placeholder="Invitation to Review: {{proposalTitle}}"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                   focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Placeholder Buttons */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Insert Placeholder
        </label>
        <div className="flex flex-wrap gap-1">
          {Object.entries(PLACEHOLDERS).map(([category, items]) => (
            <div key={category} className="flex flex-wrap gap-1 mr-2">
              {items.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => insertPlaceholder(key)}
                  className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded
                           hover:bg-blue-100 hover:text-blue-700 transition-colors"
                  title={`Insert {{${key}}}`}
                >
                  {label}
                </button>
              ))}
              {category !== 'settings' && <span className="text-gray-300 mx-1">|</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Body Textarea */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Email Body
        </label>
        <textarea
          id="email-template-body"
          value={template.body}
          onChange={(e) => updateBody(e.target.value)}
          rows={compact ? 8 : 12}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                   focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                   font-mono"
          placeholder="Dear {{salutation}} {{recipientLastName}},

I am writing to invite you..."
        />
      </div>

      {/* Preview Toggle */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          {showPreview ? '▼ Hide Preview' : '▶ Show Preview'}
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={resetToDefault}
            className="text-sm text-gray-500 hover:text-red-600"
          >
            Reset to Default
          </button>
          <button
            onClick={saveTemplate}
            className="px-3 py-1 bg-blue-600 text-white text-sm rounded
                     hover:bg-blue-700 transition-colors"
          >
            Save Template
          </button>
        </div>
      </div>

      {/* Status Message */}
      {saveStatus === 'saved' && (
        <div className="px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          ✓ Template saved
        </div>
      )}

      {/* Preview Panel */}
      {showPreview && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
            <span className="text-sm font-medium text-gray-700">Preview</span>
            <span className="text-xs text-gray-500 ml-2">(with sample data)</span>
          </div>
          <div className="p-4 bg-white">
            <div className="mb-3 pb-3 border-b border-gray-100">
              <span className="text-xs text-gray-500">Subject:</span>
              <div className="text-sm font-medium text-gray-800">{previewSubject}</div>
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
              {previewBody}
            </div>
          </div>
        </div>
      )}

      {/* Placeholder Reference */}
      {!compact && (
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="text-xs font-medium text-gray-700 mb-2">Available Placeholders:</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
            <div><code>{'{{greeting}}'}</code> - "Dear Dr. Smith"</div>
            <div><code>{'{{salutation}}'}</code> - Dr. or Professor</div>
            <div><code>{'{{recipientLastName}}'}</code> - Recipient's last name</div>
            <div><code>{'{{proposalTitle}}'}</code> - Proposal title</div>
            <div><code>{'{{proposalAbstract}}'}</code> - Abstract text</div>
            <div><code>{'{{piName}}'}</code> - PI name(s)</div>
            <div><code>{'{{piInstitution}}'}</code> - PI institution</div>
            <div><code>{'{{programName}}'}</code> - Grant program name</div>
            <div><code>{'{{reviewDeadline}}'}</code> - Formatted deadline</div>
            <div><code>{'{{signature}}'}</code> - Your signature</div>
          </div>
        </div>
      )}
    </div>
  );
}
