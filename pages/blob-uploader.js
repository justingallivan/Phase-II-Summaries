import { useState } from 'react';
import Head from 'next/head';
import styles from '../styles/Home.module.css';

export default function BlobUploader() {
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
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Update progress for this file
        setUploadProgress(prev => ({
          ...prev,
          [file.name]: { status: 'uploading', progress: 0 }
        }));

        // Upload to Vercel Blob
        const uploadResponse = await fetch(`/api/upload?filename=${encodeURIComponent(file.name)}`, {
          method: 'POST',
          body: file,
        });

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed for ${file.name}: ${uploadResponse.status}`);
        }

        const uploadData = await uploadResponse.json();
        
        uploaded.push({
          filename: file.name,
          originalSize: file.size,
          url: uploadData.url,
          downloadUrl: uploadData.downloadUrl,
          blobSize: uploadData.size
        });

        setUploadProgress(prev => ({
          ...prev,
          [file.name]: { status: 'completed', progress: 100 }
        }));
      }

      setUploadedFiles(uploaded);
      alert('All files uploaded successfully!');

    } catch (error) {
      console.error('Upload error:', error);
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

  return (
    <div className={styles.container}>
      <Head>
        <title>Blob Storage Research Proposal Summarizer</title>
        <meta name="description" content="Generate standardized summaries from PDF research proposals using Vercel Blob storage" />
      </Head>

      <div className={styles.header}>
        <h1>🔬 Research Proposal Summarizer (Blob Storage)</h1>
        <p>Upload PDF proposals to Vercel Blob, then generate standardized summaries with structured data extraction</p>
      </div>

      <div className={styles.uploadSection}>
        <div className={styles.uploadArea}>
          <div className={styles.uploadIcon}>📄</div>
          <div className={styles.uploadText}>Select PDF files to upload</div>
          <div className={styles.uploadSubtext}>Files will be stored in Vercel Blob • Up to 500MB per file</div>
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
                        {uploadProgress[file.name].status === 'uploading' ? 'Uploading...' : 
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
               uploadedFiles.length === files.length ? '✅ Files Uploaded' : 'Upload to Blob Storage'}
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
            {processing ? 'Processing...' : 'Process Uploaded Files'}
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