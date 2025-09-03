import { useState, useEffect } from 'react';
import { X, Search, Save, AlertCircle, CheckSquare, Square, Settings } from 'lucide-react';

export default function GoogleSearchModal({ isOpen, onClose, csvData, onSearchComplete }) {
  const [reviewers, setReviewers] = useState([]);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [apiKey, setApiKey] = useState('');
  const [cseId, setCseId] = useState('');
  const [showCredentials, setShowCredentials] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState({ current: 0, total: 0 });
  const [estimatedCost, setEstimatedCost] = useState(0);

  // Load saved credentials from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('google_api_key');
    const savedCse = localStorage.getItem('google_cse_id');
    if (savedKey) setApiKey(savedKey);
    if (savedCse) setCseId(savedCse);
  }, []);

  // Parse CSV data into editable rows
  useEffect(() => {
    if (csvData && csvData.parsedReviewers) {
      const reviewerData = csvData.parsedReviewers.map((reviewer, index) => ({
        id: index,
        name: reviewer.name || '',
        institution: reviewer.institution || '',
        selected: true // Default to selected
      }));
      setReviewers(reviewerData);
      // Initialize all as selected
      setSelectedRows(new Set(reviewerData.map(r => r.id)));
    }
  }, [csvData]);

  // Calculate estimated cost (Google Custom Search: $5 per 1000 queries, each reviewer = ~5 queries)
  useEffect(() => {
    const selectedCount = selectedRows.size;
    const queriesPerReviewer = 5; // Based on your Python script's multiple search strategies
    const totalQueries = selectedCount * queriesPerReviewer;
    const cost = (totalQueries / 1000) * 5;
    setEstimatedCost(cost);
  }, [selectedRows]);

  const handleSaveCredentials = () => {
    localStorage.setItem('google_api_key', apiKey);
    localStorage.setItem('google_cse_id', cseId);
    setShowCredentials(false);
  };

  const toggleRowSelection = (id) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRows(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === reviewers.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(reviewers.map(r => r.id)));
    }
  };

  const updateReviewer = (id, field, value) => {
    setReviewers(prev => prev.map(r => 
      r.id === id ? { ...r, [field]: value } : r
    ));
  };

  const handleSearch = async () => {
    if (!apiKey || !cseId) {
      alert('Please configure your Google API credentials first');
      setShowCredentials(true);
      return;
    }

    const selectedReviewers = reviewers.filter(r => selectedRows.has(r.id));
    if (selectedReviewers.length === 0) {
      alert('Please select at least one reviewer to search');
      return;
    }

    setIsSearching(true);
    setSearchProgress({ current: 0, total: selectedReviewers.length });

    try {
      const response = await fetch('/api/google-contact-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewers: selectedReviewers,
          apiKey,
          cseId
        })
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const results = await response.json();
      onSearchComplete(results);
      onClose();
    } catch (error) {
      console.error('Search error:', error);
      alert(`Search failed: ${error.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Google Contact Search</h2>
            <p className="text-sm text-gray-500 mt-1">Find email addresses and contact information for reviewers</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCredentials(!showCredentials)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-all duration-200 group"
              title="Configure API Credentials"
            >
              <Settings className="w-5 h-5 text-gray-500 group-hover:text-gray-700" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-all duration-200 group"
            >
              <X className="w-5 h-5 text-gray-500 group-hover:text-gray-700" />
            </button>
          </div>
        </div>

        {/* API Credentials Section */}
        {showCredentials && (
          <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200 animate-slide-down">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Settings className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900">Google API Configuration</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    API Key
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="input-field"
                    placeholder="AIzaSy..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Custom Search Engine ID
                  </label>
                  <input
                    type="text"
                    value={cseId}
                    onChange={(e) => setCseId(e.target.value)}
                    className="input-field"
                    placeholder="82a02039d..."
                  />
                </div>
              </div>
              <button
                onClick={handleSaveCredentials}
                className="btn-primary inline-flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save Credentials
              </button>
            </div>
          </div>
        )}

        {/* Stats Bar */}
        <div className="p-4 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={toggleSelectAll}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-all duration-200 shadow-sm"
              >
                {selectedRows.size === reviewers.length ? 
                  <CheckSquare className="w-4 h-4 text-primary-600" /> : 
                  <Square className="w-4 h-4 text-gray-400" />
                }
                <span className="font-medium text-gray-700">Select All</span>
              </button>
              <div className="badge badge-info">
                {selectedRows.size} of {reviewers.length} selected
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Queries:</span>
                <span className="font-semibold text-gray-900">{selectedRows.size * 5}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Est. Cost:</span>
                <span className={`font-bold ${estimatedCost > 1 ? 'text-orange-600' : 'text-green-600'}`}>
                  ${estimatedCost.toFixed(3)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto p-6 bg-white">
          <div className="table-container">
            <table className="table-modern">
              <thead>
                <tr className="table-header">
                  <th className="py-3 px-4 w-12"></th>
                  <th className="py-3 px-4 font-semibold text-gray-900">Name</th>
                  <th className="py-3 px-4 font-semibold text-gray-900">Institution</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {reviewers.map((reviewer) => (
                  <tr key={reviewer.id} className={`table-row ${!selectedRows.has(reviewer.id) ? 'opacity-60' : ''}`}>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => toggleRowSelection(reviewer.id)}
                        className="p-1 hover:bg-gray-100 rounded transition-colors"
                      >
                        {selectedRows.has(reviewer.id) ? 
                          <CheckSquare className="w-5 h-5 text-primary-600" /> : 
                          <Square className="w-5 h-5 text-gray-400" />
                        }
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="text"
                        value={reviewer.name}
                        onChange={(e) => updateReviewer(reviewer.id, 'name', e.target.value)}
                        className={`w-full px-3 py-2 rounded-md border ${
                          selectedRows.has(reviewer.id) 
                            ? 'border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent' 
                            : 'border-gray-200 bg-gray-50 cursor-not-allowed'
                        } transition-all`}
                        disabled={!selectedRows.has(reviewer.id)}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="text"
                        value={reviewer.institution}
                        onChange={(e) => updateReviewer(reviewer.id, 'institution', e.target.value)}
                        className={`w-full px-3 py-2 rounded-md border ${
                          selectedRows.has(reviewer.id) 
                            ? 'border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent' 
                            : 'border-gray-200 bg-gray-50 cursor-not-allowed'
                        } transition-all`}
                        disabled={!selectedRows.has(reviewer.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              <span className="text-sm text-gray-600">
                Each search will make ~5 API calls per reviewer
              </span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSearch}
                disabled={isSearching || selectedRows.size === 0 || !apiKey || !cseId}
                className={`
                  ${isSearching || selectedRows.size === 0 || !apiKey || !cseId
                    ? 'px-6 py-3 bg-gray-400 text-gray-200 font-semibold rounded-lg cursor-not-allowed'
                    : 'btn-primary'
                  } inline-flex items-center gap-2
                `}
              >
                {isSearching ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    <span>Searching... ({searchProgress.current}/{searchProgress.total})</span>
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    <span>Search Contacts</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}