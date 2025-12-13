import { useState, useEffect } from 'react';
import Layout, { PageHeader, Card, Button } from '../shared/components/Layout';
import FileUploaderSimple from '../shared/components/FileUploaderSimple';
import ApiKeyManager from '../shared/components/ApiKeyManager';

export default function FindReviewersPro() {
  const [apiKey, setApiKey] = useState('');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [extractedInfo, setExtractedInfo] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);

  // Configuration options
  const [maxCandidates, setMaxCandidates] = useState(20);
  const [excludedReviewers, setExcludedReviewers] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [skipCache, setSkipCache] = useState(false);
  const [searchSources, setSearchSources] = useState({
    pubmed: true,
    arxiv: true,
    biorxiv: true,
    scholar: true,
  });

  // Stats from search
  const [searchStats, setSearchStats] = useState(null);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    setResults(null);
    setExtractedInfo(null);
    setError(null);
    setSearchStats(null);
    setProgress(0);
    setProgressMessage('');
  };

  useEffect(() => {
    const savedKey = localStorage.getItem('claude_api_key_encrypted');
    if (savedKey) {
      try {
        const decrypted = atob(savedKey);
        setApiKey(decrypted);
      } catch (e) {
        console.error('Failed to decrypt API key');
      }
    }
  }, []);

  const handleFilesUploaded = async (uploadedFiles) => {
    if (!uploadedFiles || uploadedFiles.length === 0) return;
    setUploadedFile(uploadedFiles[0]);
    setError(null);
    setResults(null);
    setExtractedInfo(null);
    setSearchStats(null);
  };

  const handleSearchForReviewers = async () => {
    if (!uploadedFile) return;

    setIsProcessing(true);
    setError(null);
    setResults(null);
    setExtractedInfo(null);
    setSearchStats(null);
    setProgress(0);
    setProgressMessage('Starting search...');

    try {
      const activeSources = Object.entries(searchSources)
        .filter(([, enabled]) => enabled)
        .map(([source]) => source);

      const response = await fetch('/api/search-reviewers-pro', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file: uploadedFile,
          apiKey: apiKey,
          additionalNotes: additionalNotes,
          excludedReviewers: excludedReviewers,
          maxCandidates: maxCandidates,
          searchSources: activeSources,
          skipCache: skipCache,
        }),
      });

      // Handle streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Process complete SSE messages
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.progress !== undefined) {
                setProgress(data.progress);
              }
              if (data.message) {
                setProgressMessage(data.message);
              }
              if (data.data?.error) {
                throw new Error(data.data.error);
              }
              if (data.data?.success) {
                setResults(data.data.candidates || []);
                setExtractedInfo(data.data.extractedInfo || null);
                setSearchStats(data.data.stats || null);
              }
            } catch (parseError) {
              console.error('Error parsing SSE data:', parseError);
            }
          }
        }
      }

    } catch (err) {
      setError(err.message || 'An error occurred while searching for reviewers');
      console.error('Error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApiKeyUpdate = (newKey) => {
    setApiKey(newKey);
    setShowApiKeyModal(false);
  };

  const toggleSource = (source) => {
    setSearchSources(prev => ({
      ...prev,
      [source]: !prev[source]
    }));
  };

  const exportResults = (format) => {
    if (!results || results.length === 0) return;

    let content = '';
    let filename = '';
    let mimeType = '';

    if (format === 'csv') {
      // CSV export
      const headers = ['Name', 'Institution', 'h-Index', 'Citations', 'Sources', 'Email', 'Website'];
      const rows = results.map(r => [
        r.name || '',
        r.primaryAffiliation || '',
        r.hIndex || '',
        r.totalCitations || '',
        (r.sources || [r.source]).join('; '),
        r.email || '',
        r.website || ''
      ]);

      content = [headers, ...rows].map(row => row.map(cell =>
        `"${String(cell).replace(/"/g, '""')}"`
      ).join(',')).join('\n');
      filename = 'reviewers-pro.csv';
      mimeType = 'text/csv';

    } else if (format === 'json') {
      content = JSON.stringify({ extractedInfo, candidates: results, stats: searchStats }, null, 2);
      filename = 'reviewers-pro.json';
      mimeType = 'application/json';

    } else if (format === 'markdown') {
      content = `# Expert Reviewer Candidates\n\n`;
      content += `**Proposal:** ${extractedInfo?.title || 'Untitled'}\n`;
      content += `**Research Area:** ${extractedInfo?.primaryResearchArea || 'Not specified'}\n`;
      content += `**Generated:** ${new Date().toLocaleDateString()}\n\n`;
      content += `---\n\n`;

      results.forEach((r, i) => {
        content += `## ${i + 1}. ${r.name}\n\n`;
        content += `- **Institution:** ${r.primaryAffiliation || 'Not specified'}\n`;
        content += `- **h-Index:** ${r.hIndex || 'N/A'}\n`;
        content += `- **Citations:** ${r.totalCitations || 'N/A'}\n`;
        content += `- **Sources:** ${(r.sources || [r.source]).join(', ')}\n`;
        if (r.email) content += `- **Email:** ${r.email}\n`;
        if (r.website) content += `- **Website:** ${r.website}\n`;

        if (r.recentPublications?.length > 0) {
          content += `\n**Recent Publications:**\n`;
          r.recentPublications.slice(0, 3).forEach(pub => {
            if (pub.url) {
              content += `- [${pub.title}](${pub.url}) (${pub.year || 'N/A'})\n`;
            } else {
              content += `- ${pub.title} (${pub.year || 'N/A'})\n`;
            }
          });
        }
        content += `\n---\n\n`;
      });

      filename = 'reviewers-pro.md';
      mimeType = 'text/markdown';
    }

    // Download file
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Layout
      title="Find Expert Reviewers Pro - Multi-Source Academic Search"
      description="Find expert reviewers using PubMed, ArXiv, BioRxiv, and Google Scholar"
    >
      <PageHeader
        title="Find Expert Reviewers Pro"
        subtitle="Search academic databases (PubMed, ArXiv, BioRxiv, Google Scholar) to find qualified reviewers based on real publications"
        icon="🔬"
      />

      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-amber-800 text-sm">
          <strong>Beta Feature:</strong> This enhanced version searches real academic databases for reviewer candidates.
          Results include h-index, citations, and recent publications.
        </p>
      </div>

      <Card className="mb-8">
        <div className="text-center">
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="secondary"
              onClick={() => setShowApiKeyModal(true)}
            >
              {apiKey ? '🔑 Update API Key' : '🔑 Set API Key'}
            </Button>
            {apiKey && (
              <span className="inline-flex items-center px-3 py-1 bg-green-50 text-green-700 text-sm font-medium rounded-full border border-green-200">
                ✓ API Key configured
              </span>
            )}
          </div>

          {!apiKey && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-amber-800">⚠️ Please set your Claude API key to use this service</p>
            </div>
          )}
        </div>
      </Card>

      {apiKey && (
        <div className="space-y-6">
          <Card>
            <FileUploaderSimple
              onFilesUploaded={handleFilesUploaded}
              multiple={false}
              accept=".pdf"
              maxSize={50 * 1024 * 1024}
              hideFileList={!!uploadedFile}
            />

            {uploadedFile && (
              <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📄</span>
                    <div>
                      <p className="text-green-800 font-medium">{uploadedFile.filename}</p>
                      <p className="text-green-600 text-sm">{formatFileSize(uploadedFile.size)}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleRemoveFile}
                    className="p-2 hover:bg-green-100 rounded-lg transition-colors"
                    aria-label="Remove file"
                  >
                    <span className="text-green-500 hover:text-green-700">✕</span>
                  </button>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <h3 className="text-lg font-semibold mb-4">Search Configuration</h3>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Academic Sources to Search
              </label>
              <div className="flex flex-wrap gap-3">
                {[
                  { key: 'pubmed', label: 'PubMed', icon: '📚', desc: 'Biomedical literature', free: true },
                  { key: 'arxiv', label: 'ArXiv', icon: '📄', desc: 'Physics, math, CS preprints', free: true },
                  { key: 'biorxiv', label: 'BioRxiv', icon: '🧬', desc: 'Life sciences preprints', free: true },
                  { key: 'scholar', label: 'Google Scholar', icon: '🎓', desc: 'Provides h-index', free: false },
                ].map(({ key, label, icon, desc, free }) => (
                  <button
                    key={key}
                    onClick={() => toggleSource(key)}
                    className={`px-4 py-2 rounded-lg border transition-all flex flex-col items-center ${
                      searchSources[key]
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'bg-gray-50 border-gray-200 text-gray-500'
                    }`}
                  >
                    <span className="font-medium">{icon} {label}</span>
                    <span className="text-xs opacity-75">{desc}</span>
                    {!free && <span className="text-xs text-amber-600 mt-1">Paid API</span>}
                  </button>
                ))}
              </div>

              {!searchSources.scholar && (
                <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-yellow-800 text-sm">
                    <strong>Note:</strong> Without Google Scholar, h-index data won't be available.
                    Ranking will use publication count, affiliations, and citations from other sources.
                  </p>
                </div>
              )}

              <div className="mt-3 flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={skipCache}
                    onChange={(e) => setSkipCache(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Skip cache (fetch fresh results)
                </label>
                <p className="text-xs text-gray-500">
                  Google Scholar requires SERP_API_KEY environment variable (paid service via SerpAPI)
                </p>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Number of Candidates (max 50)
              </label>
              <input
                type="number"
                value={maxCandidates}
                onChange={(e) => setMaxCandidates(Math.max(5, Math.min(50, parseInt(e.target.value) || 20)))}
                min="5"
                max="50"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Additional Context (optional)
              </label>
              <textarea
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
                placeholder="Any additional context about the proposal or specific expertise needed..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg resize-vertical"
                rows={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Excluded Names (conflicts of interest)
              </label>
              <textarea
                value={excludedReviewers}
                onChange={(e) => setExcludedReviewers(e.target.value)}
                placeholder="Names to exclude, one per line..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg resize-vertical"
                rows={2}
              />
            </div>
          </Card>

          {uploadedFile && (
            <div className="flex justify-center">
              <Button
                variant="primary"
                size="lg"
                onClick={handleSearchForReviewers}
                disabled={isProcessing || !Object.values(searchSources).some(v => v)}
              >
                {isProcessing ? 'Searching...' : '🔍 Search Academic Databases'}
              </Button>
            </div>
          )}

          {isProcessing && (
            <Card>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-400 border-t-transparent"></div>
                  <span className="text-gray-700 font-medium">{progressMessage}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-500 text-center">{progress}% complete</p>
              </div>
            </Card>
          )}
        </div>
      )}

      {error && (
        <Card className="border-red-200 bg-red-50 mt-6">
          <div className="flex items-center gap-3">
            <span className="text-red-600 text-xl">❌</span>
            <p className="text-red-800 font-medium">{error}</p>
          </div>
        </Card>
      )}

      {results && results.length > 0 && (
        <div className="mt-8 space-y-6">
          {/* Stats Card */}
          {searchStats && (
            <Card className="bg-blue-50 border-blue-200">
              <div className="flex flex-wrap gap-6 justify-center">
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-700">{searchStats.totalFound}</p>
                  <p className="text-sm text-blue-600">Total Found</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-700">{searchStats.afterDeduplication}</p>
                  <p className="text-sm text-blue-600">After Dedup</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-700">{searchStats.returned}</p>
                  <p className="text-sm text-blue-600">Returned</p>
                </div>
                {searchStats.sourceBreakdown && (
                  <>
                    <div className="border-l border-blue-300 pl-6 flex gap-4">
                      {searchStats.sourceBreakdown.pubmed > 0 && (
                        <div className="text-center">
                          <p className="font-semibold text-blue-700">{searchStats.sourceBreakdown.pubmed}</p>
                          <p className="text-xs text-blue-600">PubMed</p>
                        </div>
                      )}
                      {searchStats.sourceBreakdown.arxiv > 0 && (
                        <div className="text-center">
                          <p className="font-semibold text-blue-700">{searchStats.sourceBreakdown.arxiv}</p>
                          <p className="text-xs text-blue-600">ArXiv</p>
                        </div>
                      )}
                      {searchStats.sourceBreakdown.scholar > 0 && (
                        <div className="text-center">
                          <p className="font-semibold text-blue-700">{searchStats.sourceBreakdown.scholar}</p>
                          <p className="text-xs text-blue-600">Scholar</p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </Card>
          )}

          {/* Export Buttons */}
          <div className="flex justify-center gap-3">
            <Button variant="secondary" onClick={() => exportResults('csv')}>
              📊 Export CSV
            </Button>
            <Button variant="secondary" onClick={() => exportResults('markdown')}>
              📝 Export Markdown
            </Button>
            <Button variant="secondary" onClick={() => exportResults('json')}>
              📋 Export JSON
            </Button>
          </div>

          {/* Extracted Info */}
          {extractedInfo && (
            <Card>
              <h3 className="text-lg font-semibold mb-3">Proposal Analysis</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-600">Title:</span>
                  <p className="text-gray-800">{extractedInfo.title || 'Not specified'}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Primary Area:</span>
                  <p className="text-gray-800">{extractedInfo.primaryResearchArea || 'Not specified'}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Methodologies:</span>
                  <p className="text-gray-800">{extractedInfo.keyMethodologies || 'Not specified'}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Author Institution:</span>
                  <p className="text-gray-800">{extractedInfo.authorInstitution || 'Not specified'}</p>
                </div>
              </div>
            </Card>
          )}

          {/* Results */}
          <div className="text-center mb-4">
            <h2 className="text-2xl font-semibold text-gray-900">
              {results.length} Expert Reviewer Candidates
            </h2>
          </div>

          <div className="space-y-4">
            {results.map((candidate, idx) => (
              <Card key={idx} className="hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-semibold text-gray-900">
                        {idx + 1}. {candidate.name}
                      </span>
                      {candidate.relevanceScore && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                          Score: {candidate.relevanceScore.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-600 text-sm mt-1">
                      {candidate.primaryAffiliation || 'Institution not available'}
                    </p>

                    <div className="flex flex-wrap gap-2 mt-2">
                      {(candidate.sources || [candidate.source]).map((src, i) => (
                        <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                          {src}
                        </span>
                      ))}
                    </div>

                    {(candidate.email || candidate.website) && (
                      <div className="flex gap-4 mt-2 text-sm">
                        {candidate.email && (
                          <a href={`mailto:${candidate.email}`} className="text-blue-600 hover:underline">
                            📧 {candidate.email}
                          </a>
                        )}
                        {candidate.website && (
                          <a href={candidate.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            🔗 Profile
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="text-right text-sm">
                    <div className="text-gray-700">
                      h-index: <strong>{candidate.hIndex || 'N/A'}</strong>
                    </div>
                    <div className="text-gray-700">
                      Citations: <strong>{candidate.totalCitations?.toLocaleString() || 'N/A'}</strong>
                    </div>
                  </div>
                </div>

                {candidate.recentPublications?.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800">
                      Recent Publications ({candidate.recentPublications.length})
                    </summary>
                    <ul className="mt-2 space-y-1 text-sm text-gray-700">
                      {candidate.recentPublications.slice(0, 5).map((pub, i) => (
                        <li key={i} className="pl-4 border-l-2 border-gray-200">
                          {pub.url ? (
                            <a
                              href={pub.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {pub.title}
                            </a>
                          ) : (
                            <span>{pub.title}</span>
                          )}
                          {pub.year ? ` (${pub.year})` : ''}
                          {pub.journal && <span className="text-gray-500"> - {pub.journal}</span>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {results && results.length === 0 && (
        <Card className="mt-6 text-center">
          <p className="text-gray-600">No reviewers found matching the criteria. Try adjusting the search sources or removing exclusions.</p>
        </Card>
      )}

      {showApiKeyModal && (
        <ApiKeyManager
          onApiKeySet={handleApiKeyUpdate}
          required={false}
        />
      )}
    </Layout>
  );
}
