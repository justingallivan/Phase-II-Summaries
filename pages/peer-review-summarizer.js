import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import styles from '../styles/Home.module.css';

export default function PeerReviewSummarizer() {
  const [files, setFiles] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [showApiModal, setShowApiModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files).filter(
      file => file.type === 'application/pdf' || 
              file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
              file.type === 'application/msword'
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
      alert('Please select peer review files first');
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
          blobSize: file.size,
          fileType: file.type
        });

        setUploadProgress(prev => ({
          ...prev,
          [file.name]: { status: 'completed', progress: 100 }
        }));
      }

      setUploadedFiles(uploaded);
      // alert('All peer review files uploaded successfully!'); // Commented out for cleaner UI - uncomment for debugging

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
      alert('Please upload peer review files first');
      return;
    }

    setProcessing(true);
    setProgress(0);
    setProgressText('Starting peer review analysis...');

    try {
      const response = await fetch('/api/process-peer-reviews', {
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
      setProgressText('Peer review analysis complete!');

    } catch (error) {
      console.error('Processing error:', error);
      alert('Error processing peer reviews: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const exportData = (type) => {
    if (!results) return;

    let content, filename;
    const timestamp = new Date().toISOString().split('T')[0];
    
    if (type === 'summary') {
      content = results.summary || 'No summary generated';
      filename = `${timestamp}_peer_review_summary.md`;
    } else if (type === 'questions') {
      content = results.questions || 'No questions extracted';
      filename = `${timestamp}_reviewer_questions.md`;
    }

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const convertMarkdownToHTML = (markdown) => {
    if (!markdown) return '';
    
    let html = markdown
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/<u>(.*?)<\/u>/g, '<u>$1</u>')
      .replace(/^---$/gm, '<hr>')
      .replace(/^[\*\-] (.*$)/gm, '<li>$1</li>');

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

  return (
    <div className={styles.container}>
      <Head>
        <title>Peer Review Summarizer</title>
        <meta name="description" content="Synthesize and analyze peer review feedback with actionable insights" />
      </Head>

      <div className={styles.navigation}>
        <Link href="/" className={styles.backLink}>
          ← Back to Apps
        </Link>
      </div>

      <div className={styles.header}>
        <h1>📝 Peer Review Summarizer</h1>
        <p>Upload peer review documents to generate comprehensive analysis and synthesis</p>
      </div>

      <div className={styles.uploadSection}>
        <div className={styles.uploadArea}>
          <div className={styles.uploadIcon}>📝</div>
          <div className={styles.uploadText}>Select peer review files to analyze</div>
          <div className={styles.uploadSubtext}>PDF and Word documents supported • Multiple files • Up to 500MB per file</div>
          <input
            type="file"
            accept=".pdf,.doc,.docx"
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
                  <span className={styles.fileIcon}>
                    {file.type.includes('pdf') ? '📄' : '📝'}
                  </span>
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
            {processing ? 'Analyzing Reviews...' : 'Analyze Peer Reviews'}
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
          <h3>Analysis Results</h3>
          <div className={styles.exportButtons}>
            <button onClick={() => exportData('summary')} className={styles.exportBtn}>
              Export Summary
            </button>
            <button onClick={() => exportData('questions')} className={styles.exportBtn}>
              Export Questions
            </button>
          </div>
          
          <div className={styles.resultsPreview}>
            <div className={styles.resultsTabs}>
              <h4>Summary Preview:</h4>
            </div>
            <div className={styles.markdownPreview}>
              <div 
                dangerouslySetInnerHTML={{
                  __html: convertMarkdownToHTML(results.summary)
                }}
              />
            </div>
            
            {results.questions && (
              <>
                <h4>Questions Preview:</h4>
                <div className={styles.markdownPreview}>
                  <div 
                    dangerouslySetInnerHTML={{
                      __html: convertMarkdownToHTML(results.questions)
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showApiModal && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h3>Claude API Key Required</h3>
            <p>Enter your Claude API key to analyze peer reviews:</p>
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