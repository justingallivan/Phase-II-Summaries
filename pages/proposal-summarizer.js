import { useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import FileUploaderSimple from '../shared/components/FileUploaderSimple';
import ApiKeyManager from '../shared/components/ApiKeyManager';
import ResultsDisplay from '../shared/components/ResultsDisplay';
import styles from '../styles/Home.module.css';

export default function ProposalSummarizer() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState(null);
  const [showQAModal, setShowQAModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [qaMessages, setQAMessages] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [isQAProcessing, setIsQAProcessing] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [selectedFileForQA, setSelectedFileForQA] = useState('');
  const [selectedFileForRefine, setSelectedFileForRefine] = useState('');

  const handleApiKeySet = useCallback((key) => {
    setApiKey(key);
    setError(null);
  }, []);

  const handleFilesSelected = useCallback((files) => {
    setSelectedFiles(files);
    setError(null);
    setResults(null);
  }, []);

  const processProposals = async () => {
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
    setProgressText('Starting proposal processing...');
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

      const response = await fetch('/api/process-proposals-simple', {
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

      setProgressText('Processing complete!');
      setSelectedFiles([]);

    } catch (error) {
      console.error('Processing error:', error);
      setError(error.message || 'Failed to process proposals');
    } finally {
      setProcessing(false);
    }
  };

  const handleRefine = async (filename, currentSummary) => {
    setSelectedFileForRefine(filename);
    setShowFeedbackModal(true);
  };

  const submitRefinement = async () => {
    if (!feedbackText.trim()) {
      alert('Please provide feedback for refinement');
      return;
    }

    setIsRefining(true);
    setError(null);

    try {
      const response = await fetch('/api/refine', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify({
          currentSummary: results[selectedFileForRefine].summary,
          feedback: feedbackText,
          apiKey
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to refine summary');
      }

      setResults(prev => ({
        ...prev,
        [selectedFileForRefine]: {
          ...prev[selectedFileForRefine],
          summary: data.refinedSummary
        }
      }));

      setFeedbackText('');
      setSelectedFileForRefine('');
      setShowFeedbackModal(false);

    } catch (error) {
      console.error('Refinement error:', error);
      setError(error.message || 'Failed to refine summary');
    } finally {
      setIsRefining(false);
    }
  };

  const handleQuestionAsk = async (filename) => {
    setSelectedFileForQA(filename);
    setQAMessages([]);
    setShowQAModal(true);
  };

  const submitQuestion = async () => {
    if (!currentQuestion.trim()) {
      alert('Please enter a question');
      return;
    }

    setIsQAProcessing(true);
    const question = currentQuestion;
    setCurrentQuestion('');

    // Add user question to messages
    setQAMessages(prev => [...prev, { role: 'user', content: question }]);

    try {
      const response = await fetch('/api/qa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify({
          question,
          context: results[selectedFileForQA].summary,
          filename: selectedFileForQA,
          apiKey
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to get answer');
      }

      // Add AI response to messages
      setQAMessages(prev => [...prev, { role: 'assistant', content: data.answer }]);

    } catch (error) {
      console.error('Q&A error:', error);
      setQAMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Error: ${error.message}` 
      }]);
    } finally {
      setIsQAProcessing(false);
    }
  };

  return (
    <div className={styles.container}>
      <Head>
        <title>Create Phase II Writeup Draft</title>
        <meta name="description" content="Generate standardized writeup drafts from PDF research proposals using Claude AI" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <div className={styles.header}>
          <Link href="/" className={styles.backButton}>
            ← Back to Apps
          </Link>
          <h1 className={styles.title}>
            🔬 Create Phase II Writeup Draft
          </h1>
          <p className={styles.description}>
            Generate standardized writeup drafts from PDF research proposals using Claude AI
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
            <h2>📁 Upload Research Proposals</h2>
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
              <p>{selectedFiles.length} proposal{selectedFiles.length > 1 ? 's' : ''} ready for Phase II writeup generation</p>
              <button
                onClick={processProposals}
                className={styles.processButton}
              >
                🚀 Generate Writeup Drafts
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
              onQuestionAsk={handleQuestionAsk}
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
                📄 New Proposals
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Q&A Modal */}
      {showQAModal && (
        <div className={styles.modalOverlay} onClick={() => setShowQAModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Ask Questions - {selectedFileForQA}</h2>
              <button onClick={() => setShowQAModal(false)} className={styles.closeButton}>✕</button>
            </div>
            <div className={styles.modalContent}>
              <div className={styles.qaMessages}>
                {qaMessages.map((msg, index) => (
                  <div key={index} className={`${styles.message} ${styles[msg.role]}`}>
                    <div className={styles.messageContent}>{msg.content}</div>
                  </div>
                ))}
                {isQAProcessing && (
                  <div className={styles.message + ' ' + styles.assistant}>
                    <div className={styles.messageContent}>
                      <div className={styles.spinner}></div>
                      Thinking...
                    </div>
                  </div>
                )}
              </div>
              <div className={styles.qaInput}>
                <input
                  type="text"
                  value={currentQuestion}
                  onChange={(e) => setCurrentQuestion(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !isQAProcessing && submitQuestion()}
                  placeholder="Ask a question about this proposal..."
                  disabled={isQAProcessing}
                  className={styles.qaTextInput}
                />
                <button
                  onClick={submitQuestion}
                  disabled={isQAProcessing || !currentQuestion.trim()}
                  className={styles.qaAskButton}
                >
                  Ask
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className={styles.modalOverlay} onClick={isRefining ? null : () => setShowFeedbackModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Refine Summary - {selectedFileForRefine}</h2>
              <button 
                onClick={() => setShowFeedbackModal(false)} 
                className={styles.closeButton}
                disabled={isRefining}
              >✕</button>
            </div>
            <div className={styles.modalContent}>
              {isRefining ? (
                <div className="refiningSection">
                  <div className="refiningHeader">
                    <div className="spinner"></div>
                    <span>Claude is refining your summary...</span>
                  </div>
                  <p>Please wait while your feedback is being processed and incorporated into an improved summary.</p>
                  <div className="feedbackDisplay">
                    <strong>Your feedback:</strong>
                    <p>"{feedbackText}"</p>
                  </div>
                </div>
              ) : (
                <>
                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Provide specific feedback on how to improve the summary..."
                    rows={6}
                    className={styles.feedbackTextarea}
                  />
                  <div className={styles.modalActions}>
                    <button
                      onClick={() => setShowFeedbackModal(false)}
                      className={styles.cancelButton}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={submitRefinement}
                      disabled={isRefining || !feedbackText.trim()}
                      className={styles.refineButton}
                    >
                      {isRefining ? 'Refining...' : 'Refine Summary'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .spinner {
          border: 3px solid #f3f3f3;
          border-top: 3px solid #0070f3;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          animation: spin 1s linear infinite;
          display: inline-block;
          margin-right: 0.5rem;
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

        .refiningSection {
          text-align: center;
          padding: 2rem;
          background-color: #f8f9fa;
          border-radius: 8px;
        }

        .refiningHeader {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          margin-bottom: 1rem;
          font-size: 1.1rem;
          font-weight: 600;
          color: #333;
        }

        .feedbackDisplay {
          background-color: white;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 1rem;
          margin-top: 1rem;
          text-align: left;
        }

        .feedbackDisplay strong {
          color: #667eea;
          margin-bottom: 0.5rem;
          display: block;
        }

        .feedbackDisplay p {
          margin: 0.5rem 0 0 0;
          font-style: italic;
          color: #555;
        }

        .closeButton:disabled {
          opacity: 0.5;
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

        .actionButtons {
          display: flex;
          justify-content: center;
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

        .modalOverlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.3);
          z-index: 1000;
        }

        .modal {
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          background-color: white;
          box-shadow: -5px 0 20px rgba(0, 0, 0, 0.3);
          width: 500px;
          max-width: 40vw;
          min-width: 400px;
          overflow: auto;
          transform: translateX(0);
          transition: transform 0.3s ease;
        }

        .modalHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.5rem;
          border-bottom: 1px solid #e0e0e0;
          background-color: #f8f9fa;
          position: sticky;
          top: 0;
          z-index: 1;
        }

        .modalHeader h2 {
          margin: 0;
          font-size: 1.25rem;
          color: #333;
        }

        .closeButton {
          background: none;
          border: none;
          font-size: 1.5rem;
          color: #999;
          cursor: pointer;
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .closeButton:hover {
          background-color: #f0f0f0;
          color: #333;
        }

        .modalContent {
          padding: 1.5rem;
        }



        .feedbackTextarea {
          width: 100%;
          padding: 1rem;
          border: 1px solid #ddd;
          border-radius: 8px;
          font-size: 1rem;
          font-family: inherit;
          resize: vertical;
          margin-bottom: 1rem;
        }

        .modalActions {
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
        }

        .cancelButton,
        .refineButton {
          padding: 0.75rem 1.5rem;
          border-radius: 4px;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .cancelButton {
          background-color: white;
          border: 1px solid #ddd;
          color: #666;
        }

        .cancelButton:hover {
          background-color: #f5f5f5;
        }

        .refineButton {
          background-color: #ffc107;
          border: 1px solid #ffc107;
          color: #333;
        }

        .refineButton:hover:not(:disabled) {
          background-color: #e0a800;
          border-color: #e0a800;
        }

        .refineButton:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}