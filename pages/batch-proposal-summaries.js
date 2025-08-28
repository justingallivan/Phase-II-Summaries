import { useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import FileUploaderSimple from '../shared/components/FileUploaderSimple';
import ApiKeyManager from '../shared/components/ApiKeyManager';
import styles from '../styles/Home.module.css';

export default function BatchProposalSummaries() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [summaryLength, setSummaryLength] = useState(2);
  const [summaryLevel, setSummaryLevel] = useState('technical-non-expert');
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

  const processBatch = async () => {
    if (!apiKey) {
      setError('Please provide an API key');
      return;
    }

    if (selectedFiles.length === 0) {
      setError('Please select PDF files first');
      return;
    }

    setProcessing(true);
    setProgress(0);
    setProgressText('Starting batch processing...');
    setError(null);

    try {
      // Convert files to base64
      const filesWithContent = await Promise.all(
        selectedFiles.map(async (file) => {
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              resolve({
                filename: file.name,
                content: reader.result.split(',')[1],
                size: file.size,
                type: file.type
              });
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        })
      );

      const response = await fetch('/api/process-batch-simple', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify({
          files: filesWithContent,
          summaryLength,
          summaryLevel,
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

      setProgressText('Batch processing complete!');
      setSelectedFiles([]);

    } catch (error) {
      console.error('Processing error:', error);
      setError(error.message || 'Failed to process batch');
    } finally {
      setProcessing(false);
    }
  };

  const exportAllAsMarkdown = () => {
    if (!results || Object.keys(results).length === 0) return;

    let content = `# Batch Proposal Summaries\n\n`;
    content += `Generated on: ${new Date().toLocaleDateString()}\n`;
    content += `Summary Length: ${summaryLength} pages\n`;
    content += `Technical Level: ${summaryLevel}\n`;
    content += `Documents Processed: ${Object.keys(results).length}\n\n`;
    content += `---\n\n`;

    Object.entries(results).forEach(([filename, result], index) => {
      content += `# ${index + 1}. ${filename}\n\n`;
      if (result.metadata?.error) {
        content += `❌ **Error**: ${result.metadata.errorMessage}\n\n`;
      } else {
        content += `${result.summary}\n\n`;
        if (result.metadata) {
          content += `**Document Info**: ${result.metadata.pages || 'N/A'} pages, ${result.metadata.wordCount || 'N/A'} words\n\n`;
        }
      }
      content += `---\n\n`;
    });

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch_summaries_${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={styles.container}>
      <Head>
        <title>Batch Proposal Summaries</title>
        <meta name="description" content="Process multiple proposals at once with customizable summary length" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <div className={styles.header}>
          <Link href="/" className={styles.backButton}>
            ← Back to Apps
          </Link>
          <h1 className={styles.title}>
            📚 Batch Proposal Summaries
          </h1>
          <p className={styles.description}>
            Process multiple research proposals simultaneously with customizable summary length and technical level
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

          <div className={styles.configSection}>
            <h2>⚙️ Summary Configuration</h2>
            <div className={styles.configGrid}>
              <div className={styles.configItem}>
                <label htmlFor="summaryLength" className={styles.configLabel}>
                  Summary Length
                </label>
                <select
                  id="summaryLength"
                  value={summaryLength}
                  onChange={(e) => setSummaryLength(Number(e.target.value))}
                  className={styles.configSelect}
                  disabled={processing}
                >
                  <option value={1}>1 page (concise)</option>
                  <option value={2}>2 pages (standard)</option>
                  <option value={3}>3 pages (detailed)</option>
                  <option value={4}>4 pages (comprehensive)</option>
                  <option value={5}>5 pages (extensive)</option>
                </select>
              </div>

              <div className={styles.configItem}>
                <label htmlFor="summaryLevel" className={styles.configLabel}>
                  Technical Level
                </label>
                <select
                  id="summaryLevel"
                  value={summaryLevel}
                  onChange={(e) => setSummaryLevel(e.target.value)}
                  className={styles.configSelect}
                  disabled={processing}
                >
                  <option value="general-audience">General Audience</option>
                  <option value="technical-non-expert">Technical (Non-Expert)</option>
                  <option value="technical-expert">Technical (Expert)</option>
                  <option value="academic">Academic/Scientific</option>
                </select>
              </div>
            </div>
          </div>

          <div className={styles.uploadSection}>
            <h2>📁 Upload Proposals</h2>
            <FileUploaderSimple
              onFilesSelected={handleFilesSelected}
              multiple={true}
              accept=".pdf"
              maxSize={10 * 1024 * 1024}
            />
          </div>

          {selectedFiles.length > 0 && !processing && !results && (
            <div className={styles.readySection}>
              <h3>Ready to Process</h3>
              <p>
                {selectedFiles.length} proposal{selectedFiles.length > 1 ? 's' : ''} ready for batch processing
                <br />
                Summary: {summaryLength} page{summaryLength > 1 ? 's' : ''} • Level: {summaryLevel.replace('-', ' ')}
              </p>
              <button
                onClick={processBatch}
                className={styles.processButton}
              >
                🚀 Process Batch
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
            <div className={styles.resultsSection}>
              <div className={styles.resultsHeader}>
                <h2>📄 Batch Results</h2>
                <button
                  onClick={exportAllAsMarkdown}
                  className={styles.exportButton}
                >
                  📝 Export All as Markdown
                </button>
              </div>
              
              <div className={styles.resultsSummary}>
                <p>
                  Processed {Object.keys(results).length} document{Object.keys(results).length > 1 ? 's' : ''} • 
                  {Object.values(results).filter(r => r.metadata?.error).length} error{Object.values(results).filter(r => r.metadata?.error).length !== 1 ? 's' : ''}
                </p>
              </div>

              <div className={styles.resultsGrid}>
                {Object.entries(results).map(([filename, result], index) => (
                  <div key={filename} className={styles.resultCard}>
                    <div className={styles.cardHeader}>
                      <h3 className={styles.cardTitle}>
                        {index + 1}. {filename}
                      </h3>
                      {result.metadata?.error && (
                        <span className={styles.errorBadge}>❌ Error</span>
                      )}
                    </div>
                    
                    <div className={styles.cardContent}>
                      {result.metadata?.error ? (
                        <p className={styles.errorText}>
                          {result.metadata.errorMessage}
                        </p>
                      ) : (
                        <>
                          <div className={styles.summaryText}>
                            {result.summary?.split('\n').slice(0, 5).map((line, i) => (
                              <p key={i}>{line}</p>
                            ))}
                            {result.summary?.split('\n').length > 5 && (
                              <p><em>... (truncated in preview)</em></p>
                            )}
                          </div>
                          
                          {result.metadata && (
                            <div className={styles.metadata}>
                              <small>
                                {result.metadata.pages && `${result.metadata.pages} pages • `}
                                {result.metadata.wordCount && `${result.metadata.wordCount.toLocaleString()} words`}
                              </small>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {results && !processing && (
            <div className={styles.actionButtons}>
              <button
                onClick={() => {
                  setResults(null);
                  setProgress(0);
                  setProgressText('');
                }}
                className={styles.newBatchButton}
              >
                📚 New Batch
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

        .configSection {
          background-color: #f9f9f9;
          border-radius: 8px;
          padding: 1.5rem;
          margin: 2rem 0;
        }

        .configSection h2 {
          margin: 0 0 1rem 0;
          font-size: 1.25rem;
          color: #333;
        }

        .configGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
        }

        .configItem {
          display: flex;
          flex-direction: column;
        }

        .configLabel {
          font-weight: 500;
          margin-bottom: 0.5rem;
          color: #333;
        }

        .configSelect {
          padding: 0.75rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 1rem;
          background-color: white;
        }

        .configSelect:disabled {
          background-color: #f5f5f5;
          cursor: not-allowed;
        }

        .readySection, .processingSection {
          text-align: center;
          padding: 2rem;
          background-color: #f9f9f9;
          border-radius: 8px;
          margin: 2rem 0;
        }

        .processingHeader {
          display: flex;
          align-items: center;
          justify-content: center;
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
          color: #666;
          font-size: 0.9rem;
        }

        .resultsSection {
          margin: 2rem 0;
        }

        .resultsHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .exportButton {
          padding: 0.5rem 1rem;
          background-color: #28a745;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.9rem;
        }

        .exportButton:hover {
          background-color: #218838;
        }

        .resultsSummary {
          background-color: #f0f8ff;
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1.5rem;
          text-align: center;
          color: #666;
        }

        .resultsGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 1.5rem;
        }

        .resultCard {
          background-color: white;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          overflow: hidden;
        }

        .cardHeader {
          background-color: #f8f9fa;
          padding: 1rem;
          border-bottom: 1px solid #e0e0e0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .cardTitle {
          margin: 0;
          font-size: 1rem;
          color: #333;
        }

        .errorBadge {
          font-size: 0.8rem;
          color: #c00;
        }

        .cardContent {
          padding: 1rem;
        }

        .summaryText {
          line-height: 1.5;
          color: #333;
        }

        .summaryText p {
          margin: 0 0 0.5rem 0;
        }

        .metadata {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #f0f0f0;
          color: #666;
        }

        .actionButtons {
          display: flex;
          justify-content: center;
          margin: 2rem 0;
        }

        .processButton,
        .newBatchButton {
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
        .newBatchButton:hover {
          background-color: #0051cc;
        }
      `}</style>
    </div>
  );
}