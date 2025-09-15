import { useState } from 'react';
import styles from './FileUploader.module.css';

export default function FileUploader({ 
  onFilesUploaded, 
  multiple = true, 
  accept = '.pdf',
  maxSize = 45 * 1024 * 1024, // Slightly under Vercel's 50MB limit
  showProgress = true 
}) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    
    const validFiles = selectedFiles.filter(file => {
      if (file.size > maxSize) {
        setError(`File ${file.name} exceeds maximum size of ${formatFileSize(maxSize)}`);
        return false;
      }
      return true;
    });

    setFiles(validFiles);
    setError(null);
  };

  const removeFile = (fileName) => {
    setFiles(files.filter(f => f.name !== fileName));
    setUploadProgress(prev => {
      const updated = { ...prev };
      delete updated[fileName];
      return updated;
    });
  };

  const uploadFiles = async () => {
    if (files.length === 0) {
      setError('Please select files first');
      return;
    }

    setUploading(true);
    setError(null);
    const uploaded = [];

    try {
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
          [file.name]: { status: 'uploading', progress: Math.round((i / files.length) * 100) }
        }));

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
          throw new Error(`Upload failed for ${file.name}`);
        }

        const uploadData = await directUploadResponse.json();
        
        uploaded.push({
          filename: file.name,
          originalSize: file.size,
          url: uploadData.url,
          downloadUrl: uploadData.downloadUrl
        });

        setUploadProgress(prev => ({
          ...prev,
          [file.name]: { status: 'completed', progress: 100 }
        }));
      }

      setFiles([]);
      setUploadProgress({});
      onFilesUploaded(uploaded);
      
    } catch (error) {
      console.error('Upload error:', error);
      setError(error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set isDragging to false if we're leaving the drop zone entirely
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    
    const validFiles = droppedFiles.filter(file => {
      // Check file type
      const fileExt = '.' + file.name.split('.').pop().toLowerCase();
      if (accept && !accept.includes(fileExt)) {
        setError(`File ${file.name} is not an accepted format (${accept})`);
        return false;
      }
      
      // Check file size
      if (file.size > maxSize) {
        setError(`File ${file.name} exceeds maximum size of ${formatFileSize(maxSize)}`);
        return false;
      }
      return true;
    });

    if (!multiple && validFiles.length > 1) {
      validFiles.splice(1);
      setError('Only one file can be uploaded at a time');
    }

    setFiles(validFiles);
    if (validFiles.length > 0) {
      setError(null);
    }
  };

  return (
    <div className={styles.uploaderContainer}>
      <div 
        className={styles.uploadArea}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleFileSelect}
          className={styles.fileInput}
          id="file-upload"
          disabled={uploading}
        />
        <label 
          htmlFor="file-upload" 
          className={`${styles.uploadLabel} ${isDragging ? styles.dragging : ''}`}
        >
          <div className={styles.uploadIcon}>
            {isDragging ? '📥' : '📁'}
          </div>
          <div className={styles.uploadText}>
            {isDragging 
              ? 'Drop files here...'
              : files.length > 0 
                ? `${files.length} file${files.length > 1 ? 's' : ''} selected`
                : 'Click to select files or drag and drop'
            }
          </div>
        </label>
      </div>

      {error && (
        <div className={styles.errorMessage}>
          ⚠️ {error}
        </div>
      )}

      {files.length > 0 && (
        <div className={styles.fileList}>
          {files.map((file) => (
            <div key={file.name} className={styles.fileItem}>
              <div className={styles.fileInfo}>
                <span className={styles.fileName}>{file.name}</span>
                <span className={styles.fileSize}>{formatFileSize(file.size)}</span>
              </div>
              {showProgress && uploadProgress[file.name] && (
                <div className={styles.progressBar}>
                  <div 
                    className={styles.progressFill}
                    style={{ width: `${uploadProgress[file.name].progress}%` }}
                  />
                </div>
              )}
              {!uploading && (
                <button
                  onClick={() => removeFile(file.name)}
                  className={styles.removeButton}
                  aria-label="Remove file"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <button
          onClick={uploadFiles}
          disabled={uploading}
          className={styles.uploadButton}
        >
          {uploading ? 'Uploading...' : `Upload ${files.length} file${files.length > 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  );
}