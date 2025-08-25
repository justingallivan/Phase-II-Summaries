import { useState } from 'react';
import Head from 'next/head';
import styles from '../styles/Home.module.css';

export default function Home() {
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [showApiModal, setShowApiModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files).filter(
      file => file.type === 'application/pdf'
    );
    setFiles(selectedFiles);
    setResults(null);
  };

  const removeFile = (fileName) => {
    setFiles(files.filter(f => f.name !== fileName));
    setResults(null);
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const processFiles = async () => {
    if (!apiKey) {
      setShowApiModal(true);
      return;
    }

    if (files.length === 0) {
      alert('Please select PDF files first');
      return;
    }

    setProcessing(true);
    setProgress(0);
    setProgressText('Starting...');

    try {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });
      formData.append('apiKey', apiKey);

      const response = await fetch('/api/process', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResults = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.progress !== undefined) {
                setProgress(data.progress);
                setProgressText(data.message || '');
              }
              if (data.results) {
                finalResults = data.results;
              }
            } catch (e) {
              console.error('Error parsing progress:', e);
            }
          }
        }
      }

      setResults(finalResults);
      setProgress(100);
      setProgressText('Complete!');

    } catch (error) {
      console.error('Processing error:', error);
      alert('Error processing files: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const refineResults = async () => {
    if (!feedbackText.trim()) {
      alert('Please provide feedback for refinement');
      return;
    }

    setIsRefining(true);
    setProgress(0);
    setProgressText('Refining summaries...');
    setShowFeedbackModal(false);

    try {
      const response = await fetch('/api/refine', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentResults: results,
          feedback: feedbackText,
          apiKey: apiKey
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResults = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.progress !== undefined) {
                setProgress(data.progress);
                setProgressText(data.message || '');
              }
              if (data.results) {
                finalResults = data.results;
              }
            } catch (e) {
              console.error('Error parsing progress:', e);
            }
          }
        }
      }

      setResults(finalResults);
      setProgress(100);
      setProgressText('Refinement complete!');
      setFeedbackText('');

    } catch (error) {
      console.error('Refinement error:', error);
      alert('Error refining summaries: ' + error.message);
    } finally {
      setIsRefining(false);
    }
  };

  const convertMarkdownToHTML = (markdown) => {
    let html = markdown
      // Headers
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      // Bold text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Underlined text
      .replace(/<u>(.*?)<\/u>/g, '<u>$1</u>')
      // Horizontal rules (before line breaks)
      .replace(/^---$/gm, '<hr>')
      // Bullet points - convert to list items first
      .replace(/^• (.*$)/gm, '<li>$1</li>');

    // Wrap consecutive list items in ul tags
    html = html.replace(/(<li>.*?<\/li>(\n<li>.*?<\/li>)*)/g, '<ul>$1</ul>');
    
    // Convert double line breaks to paragraphs
    html = html.replace(/\n\n+/g, '</p><p>');
    
    // Single line breaks to <br>
    html = html.replace(/\n/g, '<br>');
    
    // Wrap everything in paragraphs (except headers, lists, hrs)
    html = '<p>' + html + '</p>';
    
    // Clean up empty paragraphs and fix paragraph wrapping around block elements
    html = html
      .replace(/<p>(<h[1-3]>.*?<\/h[1-3]>)<\/p>/g, '$1')
      .replace(/<p>(<ul>.*?<\/ul>)<\/p>/g, '$1')
      .replace(/<p>(<hr>)<\/p>/g, '$1')
      .replace(/<p><\/p>/g, '');
    
    return html;
  };

  const exportData = (type) => {
    if (!results) return;

    let content, filename;
    
    if (type === 'formatted') {
      content = Object.values(results).map(r => r.formatted).join('\n\n---\n\n');
      
      const institutions = Object.values(results)
        .map(r => r.structured?.institution)
        .filter(inst => inst && inst !== 'Not specified');
      
      if (institutions.length === 1) {
        const institutionName = institutions[0]
          .replace(/[^a-zA-Z0-9\s]/g, '')
          .replace(/\s+/g, '_')
          .substring(0, 50);
        filename = `${institutionName}_proposal_summary.md`;
      } else {
        filename = institutions.length > 1 ? 'multiple_institutions_summary.md' : 'proposal_summaries.md';
      }
    } else {
      content = JSON.stringify(Object.values(results).map(r => r.structured), null, 2);
      filename = 'proposal_data.json';
    }

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={styles.container}>
      <Head>
        <title>Research Proposal Summarizer</title>
        <meta name="description" content="Generate standardized summaries from PDF research proposals" />
      </Head>

      <div className={styles.header}>
        <h1>🔬 Research Proposal Summarizer</h1>
        <p>Upload PDF proposals to generate standardized summaries with structured data extraction</p>
      </div>

      <div className={styles.uploadSection}>
        <div className={styles.uploadArea}>
          <div className={styles.uploadIcon}>📄</div>
          <div className={styles.uploadText}>Select PDF files to analyze</div>
          <div className={styles.uploadSubtext}>Multiple files supported • PDF format only</div>
          <input
            type="file"
            accept=".pdf"
            multiple
            onChange={handleFileSelect}
            className={styles.fileInput}
          />
        </div>

        {files.length > 0 && (
          <div className={styles.fileList}>
            {files.map((file, index) => (
              <div key={index} className={styles.fileItem}>
                <div className={styles.fileInfo}>
                  <span className={styles.fileIcon}>📄</span>
                  <div>
                    <div className={styles.fileName}>{file.name}</div>
                    <div className={styles.fileSize}>{formatFileSize(file.size)}</div>
                  </div>
                </div>
                <button
                  onClick={() => removeFile(file.name)}
                  className={styles.removeBtn}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.processSection}>
        <button
          onClick={processFiles}
          disabled={files.length === 0 || processing}
          className={`${styles.processBtn} ${processing ? styles.processing : ''}`}
        >
          {processing ? 'Processing...' : 'Process Proposals'}
        </button>

        {processing && (
          <div className={styles.progressSection}>
            <div className={styles.progressBar}>
              <div 
                className={styles.progressFill}
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <div className={styles.progressText}>{progressText}</div>
          </div>
        )}
      </div>

      {results && (
        <div className={styles.resultsSection}>
          <h3>Results</h3>
          <div className={styles.exportButtons}>
            <button onClick={() => exportData('formatted')} className={styles.exportBtn}>
              Export as Markdown
            </button>
            <button onClick={() => exportData('structured')} className={styles.exportBtn}>
              Export as JSON
            </button>
            <button 
              onClick={() => setShowFeedbackModal(true)} 
              className={styles.refineBtn}
              disabled={isRefining}
            >
              {isRefining ? 'Refining...' : 'Refine Summary'}
            </button>
          </div>
          
          <div className={styles.resultsPreview}>
            <h4>Preview:</h4>
            <div className={styles.markdownPreview}>
              <div 
                dangerouslySetInnerHTML={{
                  __html: convertMarkdownToHTML(Object.values(results).map(r => r.formatted).join('\n\n---\n\n'))
                }}
              />
            </div>
          </div>
        </div>
      )}

      {showFeedbackModal && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h3>Refine Summary</h3>
            <p>Provide feedback to improve the summary. For example:</p>
            <ul className={styles.feedbackExamples}>
              <li>• "Expand the Methodology section with more technical details"</li>
              <li>• "The Personnel section is missing information about co-investigators"</li>
              <li>• "Add more details about the potential impact of this research"</li>
              <li>• "Make the Executive Summary more concise"</li>
            </ul>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Enter your feedback here..."
              className={styles.feedbackTextarea}
              rows={6}
            />
            <div className={styles.modalButtons}>
              <button onClick={() => setShowFeedbackModal(false)} className={styles.cancelBtn}>
                Cancel
              </button>
              <button 
                onClick={refineResults}
                className={styles.saveBtn}
                disabled={!feedbackText.trim()}
              >
                Refine Summary
              </button>
            </div>
          </div>
        </div>
      )}

      {showApiModal && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h3>Claude API Key Required</h3>
            <p>Enter your Claude API key to process proposals:</p>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter Claude API key"
              className={styles.apiInput}
            />
            <div className={styles.modalButtons}>
              <button onClick={() => setShowApiModal(false)} className={styles.cancelBtn}>
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (apiKey) {
                    setShowApiModal(false);
                    processFiles();
                  }
                }}
                className={styles.saveBtn}
              >
                Save & Process
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
