import { useState, useEffect } from 'react';
import Layout, { PageHeader, Card, Button } from '../shared/components/Layout';
import FileUploaderSimple from '../shared/components/FileUploaderSimple';
import ApiKeyManager from '../shared/components/ApiKeyManager';
import ResultsDisplay from '../shared/components/ResultsDisplay';
import GoogleSearchModal from '../shared/components/GoogleSearchModal';
import GoogleSearchResults from '../shared/components/GoogleSearchResults';

export default function FindReviewers() {
  const [apiKey, setApiKey] = useState('');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [showGoogleSearchModal, setShowGoogleSearchModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [suggestedReviewers, setSuggestedReviewers] = useState('');
  const [excludedReviewers, setExcludedReviewers] = useState('');
  const [googleSearchResults, setGoogleSearchResults] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [reviewerCount, setReviewerCount] = useState(15);

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
    setError(null);
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
    
    console.log('File uploaded:', uploadedFiles[0].filename);
  };

  const handleSearchForReviewers = async () => {
    if (!uploadedFile) return;
    
    setIsProcessing(true);
    setError(null);
    setResults(null);

    console.log('Starting reviewer search for:', uploadedFile.name);

    try {
      console.log('Sending request to /api/find-reviewers');
      const response = await fetch('/api/find-reviewers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file: uploadedFile,
          apiKey: apiKey,
          additionalNotes: additionalNotes,
          suggestedReviewers: suggestedReviewers,
          excludedReviewers: excludedReviewers,
          reviewerCount: reviewerCount
        }),
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      const data = await response.json();
      console.log('Response data:', data);

      if (!response.ok) {
        // Check for rate limit error
        if (response.status === 429) {
          const retryAfter = data.retryAfter || 60;
          throw new Error(`Rate limit exceeded. Please wait ${retryAfter} seconds before trying again.`);
        }
        throw new Error(data.error || `Failed to find reviewers (Status: ${response.status})`);
      }

      // Format results for ResultsDisplay component - it expects an object, not an array
      console.log('Raw data from API:', data);
      console.log('Reviewers content:', data.reviewers);
      
      const formattedResults = {
        [uploadedFile.filename]: {
          fileName: uploadedFile.filename,
          formatted: String(data.reviewers || 'No reviewer recommendations generated.'),
          metadata: {
            title: data.extractedInfo?.title || 'Not specified',
            primaryArea: data.extractedInfo?.primaryResearchArea || 'Not specified',
            secondaryAreas: data.extractedInfo?.secondaryAreas || 'Not specified',
            methodologies: data.extractedInfo?.keyMethodologies || 'Not specified',
            institution: data.extractedInfo?.authorInstitution || 'Not specified',
            scope: data.extractedInfo?.researchScope || 'Not specified',
            interdisciplinary: data.extractedInfo?.interdisciplinary || 'Not specified',
            reviewerCount: data.metadata?.reviewerCount || 0
          },
          structured: data.extractedInfo || {},
          csvData: data.csvData || null,
          parsedReviewers: data.parsedReviewers || []
        }
      };

      console.log('Formatted results:', formattedResults);
      setResults(formattedResults);
    } catch (err) {
      setError(err.message || 'An error occurred while finding reviewers');
      console.error('Error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApiKeyUpdate = (newKey) => {
    setApiKey(newKey);
    setShowApiKeyModal(false);
  };

  const handleGoogleSearchComplete = (searchResults) => {
    setGoogleSearchResults(searchResults);
    setShowGoogleSearchModal(false);
    // You can add logic here to display the search results
    console.log('Google search completed:', searchResults);
  };

  return (
    <Layout 
      title="Find Reviewers - Expert Reviewer Matching"
      description="Find expert reviewers for grant proposals using AI-powered matching"
    >
      <PageHeader 
        title="Find Expert Reviewers"
        subtitle="Upload a grant proposal to identify and match qualified expert reviewers based on research areas and expertise"
        icon="🔎"
      />

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
              <div className="flex items-center justify-center gap-2">
                <span className="text-amber-600">⚠️</span>
                <p className="text-amber-800">Please set your Claude API key to use this service</p>
              </div>
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
                    className="p-2 hover:bg-green-100 rounded-lg transition-colors duration-200 group"
                    aria-label="Remove file"
                  >
                    <span className="text-green-500 group-hover:text-green-700">✕</span>
                  </button>
                </div>
              </div>
            )}
          </Card>

          <Card>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  How Many Reviewers Should I Find (default = 15)
                </label>
                <input
                  type="number"
                  value={reviewerCount}
                  onChange={(e) => setReviewerCount(Math.max(1, Math.min(30, parseInt(e.target.value) || 15)))}
                  min="1"
                  max="30"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
                  placeholder="15"
                />
                <p className="text-xs text-gray-500 mt-1">Enter a number between 1 and 30</p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Additional Context (optional)
                </label>
                <textarea
                  value={additionalNotes}
                  onChange={(e) => setAdditionalNotes(e.target.value)}
                  placeholder="Any additional context about the proposal, special requirements, or focus areas..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 resize-vertical"
                  rows={3}
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Suggested Reviewers (optional)
                </label>
                <textarea
                  value={suggestedReviewers}
                  onChange={(e) => setSuggestedReviewers(e.target.value)}
                  placeholder="Names of reviewers suggested by the author, one per line..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 resize-vertical"
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Excluded Reviewers (optional)
                </label>
                <textarea
                  value={excludedReviewers}
                  onChange={(e) => setExcludedReviewers(e.target.value)}
                  placeholder="Names of reviewers to exclude (conflicts of interest), one per line..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 resize-vertical"
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
                disabled={isProcessing}
                loading={isProcessing}
              >
                {isProcessing ? (
                  <span>Searching...</span>
                ) : (
                  <>
                    <span>🔍</span>
                    <span>Search for Reviewers</span>
                  </>
                )}
              </Button>
            </div>
          )}
          
          {isProcessing && (
            <Card className="mt-6">
              <div className="text-center">
                <div className="flex items-center justify-center gap-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-400 border-t-transparent"></div>
                  <span className="text-gray-700 font-medium text-lg">🔍 Finding expert reviewers...</span>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {error && (
        <Card className="border-red-200 bg-red-50">
          <div className="flex items-center gap-3">
            <span className="text-red-600 text-xl">❌</span>
            <p className="text-red-800 font-medium">{error}</p>
          </div>
        </Card>
      )}

      {results && (
        <div className="mt-8 space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">Reviewer Recommendations</h2>
          </div>
          
          <ResultsDisplay 
            results={results}
            showActions={false}
            exportFormats={['markdown', 'json', 'csv']}
            hideMetadata={true}
          />
          
          <div className="flex justify-center">
            <Button
              variant="primary"
              size="lg"
              onClick={() => setShowGoogleSearchModal(true)}
            >
              <span>🔍</span>
              <span>Search for Contact Information</span>
            </Button>
          </div>
        </div>
      )}

      {showApiKeyModal && (
        <ApiKeyManager
          onApiKeySet={handleApiKeyUpdate}
          required={false}
        />
      )}

      {showGoogleSearchModal && results && (
        <GoogleSearchModal
          isOpen={showGoogleSearchModal}
          onClose={() => setShowGoogleSearchModal(false)}
          csvData={results[Object.keys(results)[0]]}
          onSearchComplete={handleGoogleSearchComplete}
        />
      )}

      {googleSearchResults && (
        <GoogleSearchResults
          results={googleSearchResults}
          onClose={() => setGoogleSearchResults(null)}
        />
      )}
    </Layout>
  );
}