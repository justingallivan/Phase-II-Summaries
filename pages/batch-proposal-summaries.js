import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import styles from '../styles/Home.module.css';

export default function BatchProposalSummaries() {
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
  const [summaryLength, setSummaryLength] = useState(2); // Default to 2 pages

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
      // alert('All files uploaded successfully!'); // Commented out for cleaner UI

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
    setProgressText('Starting batch processing...');

    try {
      const response = await fetch('/api/process-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: uploadedFiles,
          apiKey: apiKey,
          summaryLength: summaryLength
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
      setProgressText('Batch processing complete!');

    } catch (error) {
      console.error('Processing error:', error);
      alert('Error processing files: ' + error.message);
    } finally {
      setProcessing(false);
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
      filename = `batch_summaries_${summaryLength}pages_${new Date().toISOString().split('T')[0]}.md`;
    } else {
      content = JSON.stringify(Object.values(results).map(r => r.structured), null, 2);
      filename = `batch_summaries_data_${new Date().toISOString().split('T')[0]}.json`;
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
        <title>Batch Proposal Summaries</title>
        <meta name="description" content="Generate batch summaries of multiple research proposals with customizable length" />
      </Head>

      <div className={styles.navigation}>
        <Link href="/" className={styles.backLink}>
          ← Back to Apps
        </Link>
      </div>

      <div className={styles.header}>
        <h1>📚 Batch Proposal Summaries</h1>
        <p>Process multiple PDF proposals at once with customizable summary length</p>
      </div>

      <div className={styles.uploadSection}>
        <div className={styles.lengthSelector}>
          <label className={styles.lengthLabel}>
            How many pages would you like the summaries to be?
            <select 
              value={summaryLength} 
              onChange={(e) => setSummaryLength(Number(e.target.value))}
              className={styles.lengthDropdown}
            >
              <option value={1}>1 page</option>
              <option value={2}>2 pages</option>
              <option value={3}>3 pages</option>
              <option value={4}>4 pages</option>
              <option value={5}>5 pages</option>
            </select>
          </label>
        </div>

        <div className={styles.uploadArea}>
          <div className={styles.uploadIcon}>📄</div>
          <div className={styles.uploadText}>Select multiple PDF files to process</div>
          <div className={styles.uploadSubtext}>Batch processing • PDF format only • Up to 500MB per file</div>
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
            {processing ? 'Processing Batch...' : `Generate ${summaryLength}-Page Summaries`}
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
          <h3>Batch Results ({summaryLength}-page summaries)</h3>
          <div className={styles.exportButtons}>
            <button onClick={() => exportData('formatted')} className={styles.exportBtn}>
              Export All as Markdown
            </button>
            <button onClick={() => exportData('structured')} className={styles.exportBtn}>
              Export All as JSON
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