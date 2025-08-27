import { useState } from 'react';
import Head from 'next/head';
import styles from '../styles/Home.module.css';

export default function Home() {
  const [files, setFiles] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [showApiModal, setShowApiModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showQAModal, setShowQAModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [qaMessages, setQAMessages] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [isQAProcessing, setIsQAProcessing] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files).filter(
      file => file.type === 'application/pdf'
    );
    setFiles(selectedFiles);
    setResults(null);
    setUploadedFiles([]);
  };

  const removeFile = (fileName) => {
    setFiles(files.filter(f => f.name !== fileName));
    setUploadedFiles(uploadedFiles.filter(f => f.filename !== fileName));
    setResults(null);
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const uploadFiles = async () => {
    if (files.length === 0) {
      alert('Please select PDF files first');
      return;
    }

    setUploading(true);
    setUploadProgress({});
    const uploaded = [];

    try {
      // Get blob token for direct uploads
      const tokenResponse = await fetch('/api/blob-token', {
        method: 'POST',
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to get upload token');
      }

      const { token } = await tokenResponse.json();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        setUploadProgress(prev => ({
          ...prev,
          [file.name]: { status: 'uploading', progress: 0 }
        }));

        // Direct upload to Vercel Blob Storage
        const filename = `${Date.now()}-${file.name}`;
        
        const directUploadResponse = await fetch(`https://blob.vercel-storage.com/${filename}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': file.type,
            'x-content-type': file.type,
          },
          body: file,
        });

        if (!directUploadResponse.ok) {
          const errorText = await directUploadResponse.text();
          throw new Error(`Direct upload failed for ${file.name}: ${directUploadResponse.status} - ${errorText}`);
        }

        const uploadData = await directUploadResponse.json();
        
        uploaded.push({
          filename: file.name,
          originalSize: file.size,
          url: uploadData.url,
          downloadUrl: uploadData.downloadUrl || uploadData.url,
          blobSize: file.size
        });

        setUploadProgress(prev => ({
          ...prev,
          [file.name]: { status: 'completed', progress: 100 }
        }));
      }

      setUploadedFiles(uploaded);
      alert('All files uploaded successfully!');

    } catch (error) {
      console.error('Direct upload error:', error);
      alert('Error uploading files: ' + error.message);
    } finally {
      setUploading(false);
    }
  };


  const processFiles = async () => {
    if (!apiKey) {
      setShowApiModal(true);
      return;
    }

    if (uploadedFiles.length === 0) {
      alert('Please upload files first');
      return;
    }

    setProcessing(true);
    setProgress(0);
    setProgressText('Starting processing...');

    try {
      const response = await fetch('/api/process-blob', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: uploadedFiles,
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
      setProgressText('Complete!');

    } catch (error) {
      console.error('Processing error:', error);
      alert('Error processing files: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const askQuestion = async () => {
    if (!currentQuestion.trim()) return;

    const question = currentQuestion.trim();
    setCurrentQuestion('');
    setIsQAProcessing(true);

    const newMessages = [...qaMessages, { type: 'user', content: question }];
    setQAMessages(newMessages);

    try {
      const response = await fetch('/api/qa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: question,
          conversationHistory: newMessages,
          proposalData: results,
          apiKey: apiKey
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      
      setQAMessages(prev => [...prev, { type: 'assistant', content: data.answer }]);

    } catch (error) {
      console.error('Q&A error:', error);
      setQAMessages(prev => [...prev, { type: 'error', content: `Error: ${error.message}` }]);
    } finally {
      setIsQAProcessing(false);
    }
  };

  const exportQA = () => {
    if (qaMessages.length === 0) {
      alert('No Q&A conversation to export');
      return;
    }

    const institutions = Object.values(results || {})
      .map(r => r.structured?.institution)
      .filter(inst => inst && inst !== 'Not specified');
    
    const institutionName = institutions.length === 1 
      ? institutions[0].replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').substring(0, 30)
      : 'Research_Proposal';

    const filename = `${institutionName}_QA_Session.md`;
    
    let content = `# Q&A Session: Research Proposal Analysis\n\n`;
    content += `**Date:** ${new Date().toLocaleDateString()}\n`;
    content += `**Time:** ${new Date().toLocaleTimeString()}\n\n`;
    content += `---\n\n`;

    qaMessages.forEach((message, index) => {
      if (message.type === 'user') {
        content += `## Question ${Math.floor(index/2) + 1}\n\n`;
        content += `**You:** ${message.content}\n\n`;
      } else if (message.type === 'assistant') {
        content += `**Claude:** ${message.content}\n\n`;
        content += `---\n\n`;
      } else if (message.type === 'error') {
        content += `**Error:** ${message.content}\n\n`;
        content += `---\n\n`;
      }
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearQA = () => {
    setQAMessages([]);
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
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/<u>(.*?)<\/u>/g, '<u>$1</u>')
      .replace(/^---$/gm, '<hr>')
      .replace(/^• (.*$)/gm, '<li>$1</li>');

    html = html.replace(/(<li>.*?<\/li>(\n<li>.*?<\/li>)*)/g, '<ul>$1</ul>');
    
    html = html.replace(/\n\n+/g, '</p><p>');
    
    html = html.replace(/\n/g, '<br>');
    
    html = '<p>' + html + '</p>';
    
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
        <meta name="description" content="Generate standardized summaries from PDF research proposals using Claude AI" />
      </Head>

      <div className={styles.header}>
        <h1>🔬 Research Proposal Summarizer</h1>
        <p>Upload PDF proposals to generate standardized summaries with structured data extraction</p>
      </div>

      <div className={styles.uploadSection}>
        <div className={styles.uploadArea}>
          <div className={styles.uploadIcon}>📄</div>
          <div className={styles.uploadText}>Select PDF files to analyze</div>
          <div className={styles.uploadSubtext}>Multiple files supported • PDF format only • Up to 500MB per file</div>
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
                    {uploadProgress[file.name] && (
                      <div className={styles.uploadStatus}>
                        {uploadProgress[file.name].status === 'uploading' ? '⬆️ Uploading...' : 
                         uploadProgress[file.name].status === 'completed' ? '✅ Uploaded' : ''}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => removeFile(file.name)}
                  className={styles.removeBtn}
                  disabled={uploading}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {files.length > 0 && (
          <div className={styles.processSection}>
            <button
              onClick={uploadFiles}
              disabled={uploading || uploadedFiles.length === files.length}
              className={`${styles.processBtn} ${uploading ? styles.processing : ''}`}
            >
              {uploading ? 'Uploading...' : 
               uploadedFiles.length === files.length ? '✅ Files Uploaded' : 'Upload Files'}
            </button>
          </div>
        )}
      </div>

      {uploadedFiles.length > 0 && (
        <div className={styles.processSection}>
          <button
            onClick={processFiles}
            disabled={processing}
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
      )}

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
            <button 
              onClick={() => setShowQAModal(true)} 
              className={styles.qaBtn}
            >
              Q&A
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

      {showQAModal && (
        <div className={styles.modal}>
          <div className={styles.qaModalContent}>
            <div className={styles.qaHeader}>
              <h3>Q&A about Research Proposal</h3>
              <div className={styles.qaControls}>
                <button onClick={exportQA} className={styles.qaExportBtn} disabled={qaMessages.length === 0}>
                  Export Q&A
                </button>
                <button onClick={clearQA} className={styles.qaClearBtn} disabled={qaMessages.length === 0}>
                  Clear
                </button>
                <button onClick={() => setShowQAModal(false)} className={styles.qaCloseBtn}>
                  ×
                </button>
              </div>
            </div>
            
            <div className={styles.qaMessages}>
              {qaMessages.length === 0 ? (
                <div className={styles.qaWelcome}>
                  <p>Ask questions about the research proposal. I can:</p>
                  <ul>
                    <li>• Explain technical concepts mentioned in the proposal</li>
                    <li>• Compare this research to other work in the field</li>
                    <li>• Assess the feasibility of the proposed methodology</li>
                    <li>• Search for related research or background information</li>
                    <li>• Evaluate the significance of the research question</li>
                  </ul>
                </div>
              ) : (
                qaMessages.map((message, index) => (
                  <div key={index} className={`${styles.qaMessage} ${styles[message.type]}`}>
                    <div className={styles.qaMessageHeader}>
                      {message.type === 'user' ? 'You' : message.type === 'assistant' ? 'Claude' : 'Error'}
                    </div>
                    <div className={styles.qaMessageContent}>
                      {message.content}
                    </div>
                  </div>
                ))
              )}
              {isQAProcessing && (
                <div className={`${styles.qaMessage} ${styles.assistant}`}>
                  <div className={styles.qaMessageHeader}>Claude</div>
                  <div className={styles.qaMessageContent}>
                    <div className={styles.qaTyping}>Thinking...</div>
                  </div>
                </div>
              )}
            </div>

            <div className={styles.qaInput}>
              <input
                type="text"
                value={currentQuestion}
                onChange={(e) => setCurrentQuestion(e.target.value)}
                placeholder="Ask a question about the proposal..."
                className={styles.qaTextInput}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !isQAProcessing) {
                    askQuestion();
                  }
                }}
                disabled={isQAProcessing}
              />
              <button 
                onClick={askQuestion}
                className={styles.qaAskBtn}
                disabled={!currentQuestion.trim() || isQAProcessing}
              >
                {isQAProcessing ? '...' : 'Ask'}
              </button>
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