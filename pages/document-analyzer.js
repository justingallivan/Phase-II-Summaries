import { useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import FileUploaderSimple from '../shared/components/FileUploaderSimple';
import ApiKeyManager from '../shared/components/ApiKeyManager';
import ResultsDisplay from '../shared/components/ResultsDisplay';
import styles from '../styles/Home.module.css';

export default function DocumentAnalyzer() {
  const [apiKey, setApiKey] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState(null);

  const handleApiKeySet = useCallback((key) => {
    setApiKey(key);
    setError(null);
  }, []);

  const handleFilesSelected = useCallback((files) => {
    setSelectedFiles(files);
    setError(null);
    setResults(null);
  }, []);

  const processDocuments = async () => {
    if (!apiKey) {
      setError('Please provide an API key');
      return;
    }

    if (selectedFiles.length === 0) {
      setError('Please select files first');
      return;
    }

    setProcessing(true);
    setProgress(0);
    setProgressText('Starting document analysis...');
    setError(null);

    try {
      // Convert files to base64 for processing
      const filesWithContent = await Promise.all(
        selectedFiles.map(async (file) => {
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              resolve({
                filename: file.name,
                content: reader.result.split(',')[1], // Remove data:application/pdf;base64, prefix
                size: file.size,
                type: file.type
              });
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        })
      );

      const response = await fetch('/api/analyze-documents-simple', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify({
          files: filesWithContent,
          apiKey
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      // Handle streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              
              if (data.progress !== undefined) {
                setProgress(data.progress);
              }
              
              if (data.message) {
                setProgressText(data.message);
              }
              
              if (data.results) {
                setResults(data.results);
              }
            } catch (e) {
              console.error('Failed to parse streaming data:', e);
            }
          }
        }
      }

      setProgressText('Analysis complete!');
      setSelectedFiles([]);

    } catch (error) {
      console.error('Processing error:', error);
      setError(error.message || 'Failed to process documents');
    } finally {
      setProcessing(false);
    }
  };

  const handleRefine = async (filename, currentSummary) => {
    const feedback = prompt('Please provide feedback for refining this summary:');
    if (!feedback) return;

    setProcessing(true);
    setError(null);

    try {
      const response = await fetch('/api/refine', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify({
          currentSummary,
          feedback,
          apiKey
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to refine summary');
      }

      setResults(prev => ({
        ...prev,
        [filename]: {
          ...prev[filename],
          summary: data.refinedSummary
        }
      }));

    } catch (error) {
      console.error('Refinement error:', error);
      setError(error.message || 'Failed to refine summary');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className={styles.container}>
      <Head>
        <title>Document Analyzer - AI-Powered Analysis</title>
        <meta name="description" content="Analyze documents with AI for insights and summaries" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <div className={styles.header}>
          <Link href="/" className={styles.backButton}>
            ← Back to Apps
          </Link>
          <h1 className={styles.title}>
            🔍 Document Analyzer
          </h1>
          <p className={styles.description}>
            Upload documents for comprehensive AI-powered analysis and insights
          </p>
        </div>

        <div className={styles.content}>
          <ApiKeyManager 
            onApiKeySet={handleApiKeySet}
            required={true}
          />

          {error && (
            <div className={styles.errorBox}>
              <span className={styles.errorIcon}>⚠️</span>
              <span className={styles.errorText}>{error}</span>
            </div>
          )}

          <div className={styles.uploadSection}>
            <h2>📁 Upload Documents</h2>
            <FileUploaderSimple
              onFilesSelected={handleFilesSelected}
              multiple={true}
              accept=".pdf,.txt,.md"
              maxSize={10 * 1024 * 1024} // 10MB limit for direct processing
            />
          </div>

          {selectedFiles.length > 0 && !processing && !results && (
            <div className={styles.readySection}>
              <h3>Ready to Process</h3>
              <p>{selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} ready for analysis</p>
              <button
                onClick={processDocuments}
                className={styles.processButton}
              >
                🚀 Analyze Documents
              </button>
            </div>
          )}

          {processing && (
            <div className={styles.processingSection}>
              <div className={styles.processingHeader}>
                <div className={styles.spinner}></div>
                <span>{progressText}</span>
              </div>
              <div className={styles.progressBarContainer}>
                <div 
                  className={styles.progressBar}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className={styles.progressPercent}>{progress}%</div>
            </div>
          )}

          {results && (
            <ResultsDisplay
              results={results}
              onRefine={handleRefine}
              showActions={true}
              exportFormats={['markdown', 'json']}
            />
          )}

          {results && !processing && (
            <div className={styles.actionButtons}>
              <button
                onClick={() => {
                  setResults(null);
                  setProgress(0);
                  setProgressText('');
                }}
                className={styles.newAnalysisButton}
              >
                📄 New Analysis
              </button>
            </div>
          )}
        </div>
      </main>

      <style jsx>{`
        .spinner {
          border: 3px solid #f3f3f3;
          border-top: 3px solid #0070f3;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .errorBox {
          background-color: #fee;
          color: #c00;
          padding: 1rem;
          border-radius: 8px;
          margin: 1rem 0;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .readySection {
          text-align: center;
          padding: 2rem;
          background-color: #f9f9f9;
          border-radius: 8px;
          margin: 2rem 0;
        }

        .processingSection {
          padding: 2rem;
          background-color: #f9f9f9;
          border-radius: 8px;
          margin: 2rem 0;
        }

        .processingHeader {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .progressBarContainer {
          width: 100%;
          height: 20px;
          background-color: #e0e0e0;
          border-radius: 10px;
          overflow: hidden;
          margin: 1rem 0;
        }

        .progressBar {
          height: 100%;
          background-color: #0070f3;
          transition: width 0.3s ease;
        }

        .progressPercent {
          text-align: center;
          color: #666;
          font-size: 0.9rem;
        }

        .actionButtons {
          display: flex;
          justify-content: center;
          gap: 1rem;
          margin: 2rem 0;
        }

        .processButton,
        .newAnalysisButton {
          padding: 1rem 2rem;
          background-color: #0070f3;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 1.1rem;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .processButton:hover,
        .newAnalysisButton:hover {
          background-color: #0051cc;
        }
      `}</style>
    </div>
  );
}