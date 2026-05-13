/**
 * Phase II Word-export modal.
 *
 * Pre-fills fields from the AI analysis and lets staff edit before
 * generating a Word document that follows the Keck Phase II writeup
 * template. Extracted from pages/phase-ii-writeup.js for review-burden
 * reasons; state ownership stays on the page.
 */

import { Button } from './Layout';

export default function Phase2WordExportModal({
  isOpen,
  fields,
  onChangeField,
  staffLead,
  isGenerating,
  onClose,
  onGenerate,
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      onClick={isGenerating ? null : onClose}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Export Word Document</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
            disabled={isGenerating}
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-sm text-gray-600 mb-4">
            Review and complete the fields below. Pre-filled values come from the AI analysis. The generated Word document will follow the Keck Phase II writeup template format.
          </p>

          <div className="space-y-4">
            {/* Pre-filled from Claude */}
            <div className="bg-gray-50 rounded-lg p-3 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">From Proposal (editable)</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Institution</label>
                <input
                  type="text"
                  value={fields.institution}
                  onChange={(e) => onChangeField('institution', e.target.value)}
                  placeholder="Common institution name (e.g., University of California, Los Angeles)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City, State</label>
                <input
                  type="text"
                  value={fields.cityState}
                  onChange={(e) => onChangeField('cityState', e.target.value)}
                  placeholder="e.g., Berkeley, CA"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project Title</label>
                <input
                  type="text"
                  value={fields.projectTitle}
                  onChange={(e) => onChangeField('projectTitle', e.target.value)}
                  placeholder="Full project title"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Date</label>
                  <input
                    type="text"
                    value={fields.meetingDate}
                    onChange={(e) => onChangeField('meetingDate', e.target.value)}
                    placeholder="e.g., June 2026"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Requested Amount</label>
                  <input
                    type="text"
                    value={fields.requestedAmount}
                    onChange={(e) => onChangeField('requestedAmount', e.target.value)}
                    placeholder="e.g., $1,000,000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Invited Amount</label>
                  <input
                    type="text"
                    value={fields.invitedAmount}
                    onChange={(e) => onChangeField('invitedAmount', e.target.value)}
                    placeholder="e.g., $1,000,000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Project Budget (Total Project Cost)</label>
                  <input
                    type="text"
                    value={fields.projectBudget}
                    onChange={(e) => onChangeField('projectBudget', e.target.value)}
                    placeholder="e.g., $1,500,000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Internal fields */}
            <div className="bg-blue-50 rounded-lg p-3 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Internal Fields</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Program Type</label>
                <select
                  value={fields.programType}
                  onChange={(e) => onChangeField('programType', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="Science and Engineering">Science and Engineering</option>
                  <option value="Medical Research">Medical Research</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Staff Lead</label>
                <input
                  type="text"
                  value={staffLead}
                  disabled
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-100 text-gray-600"
                />
                <p className="text-xs text-gray-500 mt-1">Set in the main upload form</p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 p-4 flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isGenerating}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? 'Generating...' : 'Generate Word Document'}
          </Button>
        </div>
      </div>
    </div>
  );
}
