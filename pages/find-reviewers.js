import { useState, useEffect } from 'react';
import Head from 'next/head';
import FileUploaderSimple from '../shared/components/FileUploaderSimple';
import ApiKeyManager from '../shared/components/ApiKeyManager';
import ResultsDisplay from '../shared/components/ResultsDisplay';
import styles from '../styles/Home.module.css';

export default function FindReviewers() {
  const [apiKey, setApiKey] = useState('');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [suggestedReviewers, setSuggestedReviewers] = useState('');
  const [excludedReviewers, setExcludedReviewers] = useState('');

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

  const handleFilesSelected = async (files) => {
    if (!files || files.length === 0) return;
    
    setIsProcessing(true);
    setError(null);
    setResults(null);

    console.log('Starting file upload:', files[0].name);

    try {
      const formData = new FormData();
      formData.append('file', files[0]);
      formData.append('apiKey', apiKey);
      formData.append('additionalNotes', additionalNotes);
      formData.append('suggestedReviewers', suggestedReviewers);
      formData.append('excludedReviewers', excludedReviewers);

      console.log('Sending request to /api/find-reviewers');
      const response = await fetch('/api/find-reviewers', {
        method: 'POST',
        body: formData,
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
        [files[0].name]: {
          fileName: files[0].name,
          summary: String(data.reviewers || 'No reviewer recommendations generated.'),  // Changed from 'content' to 'summary'
          metadata: {
            title: data.extractedInfo?.title || 'Not specified',
            primaryArea: data.extractedInfo?.primaryResearchArea || 'Not specified',
            secondaryAreas: data.extractedInfo?.secondaryAreas || 'Not specified',
            methodologies: data.extractedInfo?.keyMethodologies || 'Not specified',
            institution: data.extractedInfo?.authorInstitution || 'Not specified',
            scope: data.extractedInfo?.researchScope || 'Not specified',
            interdisciplinary: data.extractedInfo?.interdisciplinary || 'Not specified'
          },
          structuredData: data.extractedInfo || {}
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

  return (
    <div className={styles.container}>
      <Head>
        <title>Find Reviewers - Expert Reviewer Matching</title>
        <meta name="description" content="Find expert reviewers for grant proposals using AI-powered matching" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <div className={styles.header}>
          <h1 className={styles.title}>
            🔎 Find Expert Reviewers
          </h1>
          <p className={styles.description}>
            Upload a grant proposal to identify and match qualified expert reviewers based on research areas and expertise
          </p>
        </div>

        <div className={styles.apiKeySection}>
          <button
            onClick={() => setShowApiKeyModal(true)}
            className={styles.apiKeyButton}
          >
            {apiKey ? '🔑 Update API Key' : '🔑 Set API Key'}
          </button>
          {apiKey && (
            <span className={styles.apiKeyStatus}>
              ✓ API Key configured
            </span>
          )}
        </div>

        {!apiKey && (
          <div className={styles.warning}>
            Please set your Claude API key to use this service
          </div>
        )}

        {apiKey && (
          <>
            <div className={styles.formSection}>
              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Additional Context (optional)
                </label>
                <textarea
                  value={additionalNotes}
                  onChange={(e) => setAdditionalNotes(e.target.value)}
                  placeholder="Any additional context about the proposal, special requirements, or focus areas..."
                  className={styles.textarea}
                  rows={3}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Suggested Reviewers (optional)
                </label>
                <textarea
                  value={suggestedReviewers}
                  onChange={(e) => setSuggestedReviewers(e.target.value)}
                  placeholder="Names of reviewers suggested by the author, one per line..."
                  className={styles.textarea}
                  rows={2}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Excluded Reviewers (optional)
                </label>
                <textarea
                  value={excludedReviewers}
                  onChange={(e) => setExcludedReviewers(e.target.value)}
                  placeholder="Names of reviewers to exclude (conflicts of interest), one per line..."
                  className={styles.textarea}
                  rows={2}
                />
              </div>
            </div>

            <FileUploaderSimple
              onFilesSelected={handleFilesSelected}
              multiple={false}
              accept=".pdf"
              maxSize={10 * 1024 * 1024}
            />
            
            {isProcessing && (
              <div className={styles.processingMessage}>
                🔍 Finding expert reviewers...
              </div>
            )}
          </>
        )}

        {error && (
          <div className={styles.error}>
            {error}
          </div>
        )}

        {results && (
          <div className={styles.resultsSection}>
            <h2 className={styles.sectionTitle}>Reviewer Recommendations</h2>
            <ResultsDisplay 
              results={results}
              showActions={false}
              exportFormats={['markdown', 'json']}
            />
          </div>
        )}

        {showApiKeyModal && (
          <ApiKeyManager
            onApiKeySet={handleApiKeyUpdate}
            required={false}
          />
        )}
      </main>
    </div>
  );
}