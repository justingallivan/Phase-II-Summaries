import { useState } from 'react';
import { Download, Mail, Globe, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

export default function GoogleSearchResults({ results, onClose }) {
  const [activeTab, setActiveTab] = useState('results');

  if (!results) return null;

  const downloadCSV = () => {
    const blob = new Blob([results.csvData], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reviewer_contacts_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getConfidenceColor = (score) => {
    if (score >= 100) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-gray-600';
  };

  const getConfidenceLabel = (score) => {
    if (score >= 100) return 'High';
    if (score >= 50) return 'Medium';
    return 'Low';
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Contact Search Results</h2>
            <p className="text-sm text-gray-500 mt-1">
              Found contacts for {results.summary.successful_searches} of {results.summary.professors_processed} reviewers
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-all duration-200 group"
          >
            <div className="w-5 h-5 text-gray-500 group-hover:text-gray-700">✕</div>
          </button>
        </div>

        {/* Summary Stats */}
        <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary-600">
              {results.summary.success_rate}
            </div>
            <div className="text-sm text-gray-600 font-medium">Success Rate</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-secondary-600">
              {results.summary.total_emails_found}
            </div>
            <div className="text-sm text-gray-600 font-medium">Emails Found</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-accent-600">
              {results.summary.high_confidence_emails}
            </div>
            <div className="text-sm text-gray-600 font-medium">High Confidence</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-600">
              {results.summary.professors_processed}
            </div>
            <div className="text-sm text-gray-600 font-medium">Total Searched</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('results')}
            className={`px-6 py-3 font-medium transition-all duration-200 ${
              activeTab === 'results' 
                ? 'border-b-2 border-primary-500 text-primary-600 bg-primary-50' 
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
            }`}
          >
            Results Table
          </button>
          <button
            onClick={() => setActiveTab('summary')}
            className={`px-6 py-3 font-medium transition-all duration-200 ${
              activeTab === 'summary' 
                ? 'border-b-2 border-primary-500 text-primary-600 bg-primary-50' 
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
            }`}
          >
            Summary View
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'results' ? (
            <div className="table-container">
              <table className="table-modern">
                <thead>
                  <tr className="table-header">
                    <th className="py-3 px-4 font-semibold text-gray-900">Name</th>
                    <th className="py-3 px-4 font-semibold text-gray-900">Institution</th>
                    <th className="py-3 px-4 font-semibold text-gray-900">Primary Email</th>
                    <th className="py-3 px-4 font-semibold text-gray-900">Confidence</th>
                    <th className="py-3 px-4 font-semibold text-gray-900">Website</th>
                    <th className="py-3 px-4 text-center font-semibold text-gray-900">Status</th>
                  </tr>
                </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {results.results.map((result, index) => (
                  <tr key={index} className="table-row">
                    <td className="py-3 px-4 font-medium">{result.name}</td>
                    <td className="py-3 px-4 text-sm">{result.institution}</td>
                    <td className="py-3 px-4">
                      {result.primary_email ? (
                        <a 
                          href={`mailto:${result.primary_email}`}
                          className="text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <Mail className="w-4 h-4" />
                          {result.primary_email}
                        </a>
                      ) : (
                        <span className="text-gray-400">Not found</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {result.primary_email_score > 0 && (
                        <span className={`font-medium ${getConfidenceColor(result.primary_email_score)}`}>
                          {getConfidenceLabel(result.primary_email_score)} ({result.primary_email_score})
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {result.primary_website ? (
                        <a 
                          href={result.primary_website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <Globe className="w-4 h-4" />
                          View
                        </a>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-2 text-center">
                      {result.search_successful ? (
                        <CheckCircle className="w-5 h-5 text-green-500 inline" />
                      ) : result.error ? (
                        <XCircle className="w-5 h-5 text-red-500 inline" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-yellow-500 inline" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-3">High Confidence Emails (.edu domains)</h3>
                <div className="grid grid-cols-2 gap-3">
                  {results.results
                    .filter(r => r.primary_email_score >= 100)
                    .map((result, index) => (
                      <div key={index} className="bg-green-50 p-3 rounded-lg">
                        <div className="font-medium">{result.name}</div>
                        <div className="text-sm text-gray-600">{result.institution}</div>
                        <a 
                          href={`mailto:${result.primary_email}`}
                          className="text-blue-600 hover:underline text-sm"
                        >
                          {result.primary_email}
                        </a>
                      </div>
                    ))}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3">Medium Confidence Emails</h3>
                <div className="grid grid-cols-2 gap-3">
                  {results.results
                    .filter(r => r.primary_email_score >= 50 && r.primary_email_score < 100)
                    .map((result, index) => (
                      <div key={index} className="bg-yellow-50 p-3 rounded-lg">
                        <div className="font-medium">{result.name}</div>
                        <div className="text-sm text-gray-600">{result.institution}</div>
                        <a 
                          href={`mailto:${result.primary_email}`}
                          className="text-blue-600 hover:underline text-sm"
                        >
                          {result.primary_email}
                        </a>
                      </div>
                    ))}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3">No Email Found</h3>
                <div className="grid grid-cols-3 gap-3">
                  {results.results
                    .filter(r => !r.primary_email)
                    .map((result, index) => (
                      <div key={index} className="bg-gray-50 p-3 rounded-lg">
                        <div className="font-medium">{result.name}</div>
                        <div className="text-sm text-gray-600">{result.institution}</div>
                        {result.primary_website && (
                          <a 
                            href={result.primary_website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-sm"
                          >
                            Website
                          </a>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Search completed at {new Date(results.timestamp).toLocaleString()}
            </div>
            <button
              onClick={downloadCSV}
              className="btn-success inline-flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}